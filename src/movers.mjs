/**
 * The daily gainer sweep, automated.
 *
 * This is the workflow the large Square accounts run by hand every morning:
 * sort futures by 24-hour change, keep the ones with real turnover, apply a
 * handful of filters, then write a card. Doing it by eye takes minutes and
 * misses things; doing it here takes one call and, more importantly, records
 * exactly which conditions fired so the filter can eventually be measured
 * instead of believed.
 *
 * One thing in the hand-run version does not survive contact with code. It
 * sorts by "biggest 24-hour gain, descending" and then filters out anything
 * that "has run too far" — the sort selects for the exact property the filter
 * rejects, and with no number attached, "too far" resolves to whatever the
 * writer feels after looking at the chart. Here it is a stated threshold that
 * can be argued with: `MAX_RUN_PCT` and a range-position ceiling.
 *
 * The other thing it misses is the one that cost us a headline result on
 * 2026-08-03: the day's biggest gainers were tokens the exchange had announced
 * it was removing. A gainer sweep walks straight into that, so delistings are
 * filtered before anything else.
 *
 * None of the five conditions has a measured base rate. They are recorded per
 * candidate precisely so that can change.
 */

import { fetchAllTickers } from "./pulse.mjs";
import { fetchKlines, analyzeAsset } from "./analysis.mjs";
import { scoreSeries } from "./intraday.mjs";
import { fetchDelistings, baseAsset } from "./listings.mjs";

const OKX_BASE = "https://www.okx.com/api/v5";
const TIMEOUT_MS = 20_000;
const EXCLUDED = /(UP|DOWN|BULL|BEAR)USDT$|^(USDC|FDUSD|TUSD|BUSD|DAI|EUR|AEUR|USDP|XUSD)USDT$/;

/** A gain past this is a move to write about, not one to join. */
export const MAX_RUN_PCT = 40;
/** Above this share of its own 30-day range, the easy part is behind it. */
export const MAX_RANGE_POSITION = 92;
/** How far above its recent floor a mover must already be to count as moving. */
export const MIN_OFF_LOW_PCT = 8;

/**
 * Open interest over the last day, per coin.
 *
 * OKX serves an hourly series, so the direction is measurable rather than a
 * single snapshot. Failures return null: open interest is one of five
 * conditions, not a gate, and losing it must not drop a candidate.
 */
export async function openInterestTrend(asset, { fetchImpl = globalThis.fetch, hours = 24 } = {}) {
  try {
    const url = `${OKX_BASE}/rubik/stat/contracts/open-interest-volume?ccy=${asset}&period=1H`;
    const res = await fetchImpl(url, { signal: AbortSignal.timeout(TIMEOUT_MS) });
    if (!res.ok) return null;
    const rows = ((await res.json())?.data ?? [])
      .map((r) => ({ t: Number(r[0]), oi: Number(r[1]) }))
      .filter((r) => Number.isFinite(r.oi))
      .sort((a, b) => a.t - b.t);
    if (rows.length < hours + 1) return null;
    const then = rows.at(-1 - hours).oi;
    return then ? { changePct: (rows.at(-1).oi / then - 1) * 100, hours } : null;
  } catch {
    return null;
  }
}

/**
 * The five conditions, each computed and each reported.
 *
 * Returned as a list of booleans with names rather than a score alone, so a
 * later study can ask which of them carried the result and which were
 * decoration. A "3 out of 5" rule that cannot say *which* three is untestable.
 */
export function evaluate({ ticker, asset, daily, hourly, oi }) {
  const price = ticker.price;
  const yesterday = daily.at(-2);
  const recentLow = Math.min(...daily.slice(-8, -1).map((c) => c.low));
  const high30 = Math.max(...daily.slice(-30).map((c) => c.high));
  const low30 = Math.min(...daily.slice(-30).map((c) => c.low));
  const rangePosition = high30 > low30 ? ((price - low30) / (high30 - low30)) * 100 : NaN;
  const hourlyZ = hourly?.volumeZScore;

  const conditions = {
    /**
     * Turnover is beating the day before, so participation is arriving.
     *
     * Measured against the ticker's rolling 24 hours, not today's daily candle.
     * The candle is partial until 00:00 UTC, so comparing it to a completed day
     * reports "volume falling" for most of every day — at 15:00 UTC only one of
     * twenty candidates passed, which is a clock reading, not a market one.
     */
    volumeRising: Boolean(yesterday && ticker.quoteVolume24h > yesterday.quoteVolume),
    /** Already off its floor: a mover, not a coin sitting at the low. */
    offRecentLow: Number.isFinite(recentLow) && recentLow > 0
      && (price / recentLow - 1) * 100 >= MIN_OFF_LOW_PCT,
    /** A real intraday burst rather than a slow drift. */
    intradaySpike: Number.isFinite(hourlyZ) && hourlyZ >= 2,
    /** Leverage is being added, not unwound. */
    openInterestRising: Boolean(oi && oi.changePct > 0),
    /**
     * Not already extended. This is the condition the hand-run version leaves
     * to feel, and it is the one in direct tension with sorting by biggest
     * gain — so it gets explicit numbers.
     */
    notOverextended: ticker.change24hPct <= MAX_RUN_PCT
      && (!Number.isFinite(rangePosition) || rangePosition <= MAX_RANGE_POSITION),
  };

  const passed = Object.entries(conditions).filter(([, v]) => v).map(([k]) => k);
  return {
    asset,
    symbol: ticker.symbol,
    price,
    change24hPct: ticker.change24hPct,
    quoteVolume24h: ticker.quoteVolume24h,
    offRecentLowPct: recentLow > 0 ? (price / recentLow - 1) * 100 : NaN,
    rangePosition,
    hourlyVolumeZ: hourlyZ,
    openInterest24hPct: oi?.changePct ?? NaN,
    conditions,
    passed,
    score: passed.length,
  };
}

/**
 * Runs the sweep.
 *
 * Candidates are taken from the top of the 24-hour board, but the *result* is
 * ordered by how many conditions each one meets rather than by size of move —
 * otherwise the ranking just reproduces the sort and the filters are cosmetic.
 */
export async function sweep({
  minVolume = 5e6,
  candidates = 20,
  minScore = 3,
  fetchImpl = globalThis.fetch,
  onProgress = () => {},
} = {}) {
  const tickers = await fetchAllTickers(fetchImpl);
  const delistings = await fetchDelistings({ fetchImpl });

  const board = tickers
    .filter((t) => t.symbol.endsWith("USDT") && !EXCLUDED.test(t.symbol))
    .filter((t) => Number.isFinite(t.quoteVolume24h) && t.quoteVolume24h >= minVolume)
    .filter((t) => Number.isFinite(t.change24hPct) && t.change24hPct > 0)
    .sort((a, b) => b.change24hPct - a.change24hPct);

  const suppressed = [];
  const shortlist = [];
  for (const t of board) {
    const notice = delistings.get(baseAsset(t.symbol));
    if (notice) suppressed.push({ symbol: t.symbol, change24hPct: t.change24hPct, delisting: notice });
    else shortlist.push(t);
    if (shortlist.length >= candidates) break;
  }

  const rows = [];
  for (let i = 0; i < shortlist.length; i += 4) {
    const batch = shortlist.slice(i, i + 4);
    const done = await Promise.all(
      batch.map(async (ticker) => {
        const asset = baseAsset(ticker.symbol);
        const [daily, hourlyCandles, oi] = await Promise.all([
          fetchKlines(ticker.symbol, { interval: "1d", limit: 40, fetchImpl }).catch(() => null),
          fetchKlines(ticker.symbol, { interval: "1h", limit: 176, fetchImpl }).catch(() => null),
          openInterestTrend(asset, { fetchImpl }),
        ]);
        if (!daily || daily.length < 10) return null;
        const hourly = hourlyCandles ? scoreSeries(ticker.symbol, hourlyCandles) : null;
        return evaluate({ ticker, asset, daily, hourly, oi });
      }),
    );
    for (const r of done) if (r) rows.push(r);
    onProgress(Math.min(i + 4, shortlist.length), shortlist.length);
  }

  rows.sort((a, b) => b.score - a.score || b.change24hPct - a.change24hPct);
  return {
    sweptAt: new Date().toISOString(),
    scanned: board.length,
    suppressed,
    rows,
    qualified: rows.filter((r) => r.score >= minScore),
  };
}

const f1 = (v) => (Number.isFinite(v) ? v.toFixed(1) : "—");
const f2 = (v) => (Number.isFinite(v) ? v.toFixed(2) : "—");
const tick = (v) => (v ? "Y" : "·");

export function formatSweep({ scanned, rows, suppressed, qualified }, { minScore = 3 } = {}) {
  const lines = [`Gainer sweep — ${scanned} pairs above the volume floor, ${rows.length} examined`, ""];

  if (suppressed.length) {
    lines.push(`  Skipped, delisting announced: ${suppressed.map((s) => baseAsset(s.symbol)).join(", ")}`, "");
  }

  lines.push("  PAIR          24h     vol24h   offLow  rangePos   1hZ     OI24h   vol rise/off low/spike/OI/not-extended");
  for (const r of rows) {
    const c = r.conditions;
    lines.push(
      `  ${r.asset.padEnd(11)} ${(`+${f1(r.change24hPct)}%`).padStart(7)} ` +
        `${(`$${(r.quoteVolume24h / 1e6).toFixed(0)}M`).padStart(8)} ` +
        `${(`${f1(r.offRecentLowPct)}%`).padStart(8)} ${(`${f1(r.rangePosition)}%`).padStart(8)} ` +
        `${f1(r.hourlyVolumeZ).padStart(6)} ${(`${f1(r.openInterest24hPct)}%`).padStart(8)}   ` +
        `${tick(c.volumeRising)} ${tick(c.offRecentLow)} ${tick(c.intradaySpike)} ` +
        `${tick(c.openInterestRising)} ${tick(c.notOverextended)}   ${r.score}/5`,
    );
  }

  // How often each condition fires. Without this the score looks like a filter
  // when it may only be counting whichever conditions are easy today: fixing a
  // single partial-candle bug moved the qualified set from 2 of 20 to 13 of 20,
  // which is not a filter changing its mind, it is a filter that was never
  // selecting on the conditions that discriminate.
  if (rows.length) {
    const names = Object.keys(rows[0].conditions);
    const rates = names.map((k) => {
      const hits = rows.filter((r) => r.conditions[k]).length;
      return `${k} ${hits}/${rows.length}`;
    });
    lines.push("", `  How often each fired: ${rates.join("  |  ")}`);
  }

  lines.push("");
  lines.push(
    qualified.length
      ? `Qualified (${minScore}+ of 5): ${qualified.map((r) => r.asset).join(", ")}`
      : `Nothing reached ${minScore} of 5 today. That is a result, not a reason to lower the bar.`,
  );
  lines.push("", "No condition here has a measured base rate yet. The per-candidate flags are recorded so that can be fixed.");
  return lines.join("\n");
}
