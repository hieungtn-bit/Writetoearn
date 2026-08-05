/**
 * Both ends of the board, scanned by the same rules.
 *
 * Every scanner in this repo looks up. `movers` filters `change24hPct > 0`
 * before anything else, `pbbe` ranks distance above a base, and `card` writes a
 * LONG plan unless told otherwise. That is not a market view, it is a blind
 * spot: half the pairs that move every day are removed before the first filter
 * runs, and a desk that can only ever say "wait" on the way down is not neutral.
 *
 * This scans the top and the bottom of the board with symmetric conditions and
 * reports them side by side. It deliberately does *not* net them into a single
 * ranking — a long candidate and a short candidate are different trades with
 * different risks, and a combined score would hide which side a name came from.
 *
 * What the evidence says about the two sides is not the same, and the output
 * says so on every run:
 *
 *   Long side  — hourly turnover at z >= 5 is the one measured result in this
 *                repo. Today's follow-up study found the trigger hour's
 *                direction carries no information (correlation 0.06) but its
 *                magnitude might, at 0.81 sigma, which is not significance.
 *   Short side — nothing has been established. `short-signal.mjs` tested five
 *                bearish conditions on daily candles and the best was 1.86
 *                sigma. The short conditions here are the same hypotheses at
 *                hourly resolution, and they are unmeasured until two-sided.mjs
 *                says otherwise.
 *
 * So the short list is offered as a watchlist, not a signal, and is labelled
 * that way in the output rather than in a footnote nobody reads.
 */

import { fetchAllTickers } from "./pulse.mjs";
import { fetchKlines } from "./analysis.mjs";
import { scoreSeries } from "./intraday.mjs";
import { fetchDelistings, baseAsset } from "./listings.mjs";
import { openInterestTrend } from "./movers.mjs";

const EXCLUDED = /(UP|DOWN|BULL|BEAR)USDT$|^(USDC|FDUSD|TUSD|BUSD|DAI|EUR|AEUR|USDP|XUSD)USDT$/;

/** Above this share of its 30-day range, a long is buying the top of the range. */
export const LONG_MAX_RANGE_POSITION = 92;
/** Below this share, a short is selling the bottom of it. Symmetric by design. */
export const SHORT_MIN_RANGE_POSITION = 8;
/** A move past this in either direction is a move to write about, not to join. */
export const MAX_RUN_PCT = 40;
/** An hourly turnover z at or above this counts as a real burst. */
export const SPIKE_Z = 2;

/**
 * The long conditions, and their mirrors.
 *
 * Written as one table so the two sides cannot drift apart. Every long
 * condition has a short counterpart testing the same idea with the sign
 * flipped, which is what makes a later study able to compare them at all.
 */
export function evaluateSide({ side, ticker, daily, hourly, oi }) {
  const price = ticker.price;
  const long = side === "long";
  const recent = daily.slice(-8, -1);
  const recentLow = Math.min(...recent.map((c) => c.low));
  const recentHigh = Math.max(...recent.map((c) => c.high));
  const high30 = Math.max(...daily.slice(-30).map((c) => c.high));
  const low30 = Math.min(...daily.slice(-30).map((c) => c.low));
  const rangePosition = high30 > low30 ? ((price - low30) / (high30 - low30)) * 100 : NaN;
  const hourlyZ = hourly?.volumeZScore;
  const yesterday = daily.at(-2);

  const offExtremePct = long
    ? (recentLow > 0 ? (price / recentLow - 1) * 100 : NaN)
    : (recentHigh > 0 ? (1 - price / recentHigh) * 100 : NaN);

  const conditions = {
    /**
     * Participation is arriving. Measured against the ticker's rolling 24 hours
     * rather than today's partial daily candle — comparing a half-finished day
     * to a completed one reports the clock, not the market.
     */
    volumeRising: Boolean(yesterday && ticker.quoteVolume24h > yesterday.quoteVolume),
    /** Already moving away from its recent extreme, in the side's direction. */
    offRecentExtreme: Number.isFinite(offExtremePct) && offExtremePct >= 8,
    /** A real burst rather than a drift. Volume is unsigned, so this is shared. */
    intradaySpike: Number.isFinite(hourlyZ) && hourlyZ >= SPIKE_Z,
    /** Leverage being added on the way up, or unwound on the way down. */
    openInterestAligned: Boolean(oi && (long ? oi.changePct > 0 : oi.changePct < 0)),
    /** Not already at the end of its own range. */
    notOverextended: Math.abs(ticker.change24hPct) <= MAX_RUN_PCT
      && (!Number.isFinite(rangePosition)
        || (long ? rangePosition <= LONG_MAX_RANGE_POSITION : rangePosition >= SHORT_MIN_RANGE_POSITION)),
  };

  const passed = Object.entries(conditions).filter(([, v]) => v).map(([k]) => k);
  return {
    side,
    asset: baseAsset(ticker.symbol),
    symbol: ticker.symbol,
    price,
    change24hPct: ticker.change24hPct,
    quoteVolume24h: ticker.quoteVolume24h,
    offExtremePct,
    rangePosition,
    hourlyVolumeZ: hourlyZ,
    change1hPct: hourly?.change1hPct ?? NaN,
    openInterest24hPct: oi?.changePct ?? NaN,
    conditions,
    passed,
    score: passed.length,
  };
}

/** Both ends of the board, fetched once. */
export async function scanSides({
  minVolume = 5e6,
  perSide = 12,
  minScore = 3,
  fetchImpl = globalThis.fetch,
  onProgress = () => {},
} = {}) {
  const tickers = await fetchAllTickers(fetchImpl);
  const delistings = await fetchDelistings({ fetchImpl });

  const liquid = tickers
    .filter((t) => t.symbol.endsWith("USDT") && !EXCLUDED.test(t.symbol))
    .filter((t) => Number.isFinite(t.quoteVolume24h) && t.quoteVolume24h >= minVolume)
    .filter((t) => Number.isFinite(t.change24hPct));

  const suppressed = [];
  const clean = [];
  for (const t of liquid) {
    const notice = delistings.get(baseAsset(t.symbol));
    // A delisting notice poisons both sides, not just the long one: the pump is
    // an artefact and so is the collapse that follows it.
    if (notice) suppressed.push({ symbol: t.symbol, change24hPct: t.change24hPct, delisting: notice });
    else clean.push(t);
  }

  const byChange = [...clean].sort((a, b) => b.change24hPct - a.change24hPct);
  const picks = [
    ...byChange.filter((t) => t.change24hPct > 0).slice(0, perSide).map((t) => ({ side: "long", ticker: t })),
    ...byChange.filter((t) => t.change24hPct < 0).slice(-perSide).map((t) => ({ side: "short", ticker: t })),
  ];

  const rows = [];
  for (let i = 0; i < picks.length; i += 4) {
    const done = await Promise.all(
      picks.slice(i, i + 4).map(async ({ side, ticker }) => {
        const asset = baseAsset(ticker.symbol);
        const [daily, hourlyCandles, oi] = await Promise.all([
          fetchKlines(ticker.symbol, { interval: "1d", limit: 40, fetchImpl }).catch(() => null),
          fetchKlines(ticker.symbol, { interval: "1h", limit: 176, fetchImpl }).catch(() => null),
          openInterestTrend(asset, { fetchImpl }),
        ]);
        if (!daily || daily.length < 10) return null;
        const hourly = hourlyCandles ? scoreSeries(ticker.symbol, hourlyCandles) : null;
        return evaluateSide({ side, ticker, daily, hourly, oi });
      }),
    );
    for (const r of done) if (r) rows.push(r);
    onProgress(Math.min(i + 4, picks.length), picks.length);
  }

  const bySide = (s) => rows.filter((r) => r.side === s).sort((a, b) => b.score - a.score
    || Math.abs(b.change24hPct) - Math.abs(a.change24hPct));

  return {
    scannedAt: new Date().toISOString(),
    scanned: clean.length,
    suppressed,
    minScore,
    long: bySide("long"),
    short: bySide("short"),
    qualified: {
      long: bySide("long").filter((r) => r.score >= minScore),
      short: bySide("short").filter((r) => r.score >= minScore),
    },
  };
}

const f1 = (v) => (Number.isFinite(v) ? v.toFixed(1) : "—");
const tick = (v) => (v ? "Y" : "·");
const money = (v) => `$${(v / 1e6).toFixed(0)}M`;

function table(rows, side) {
  const lines = [
    `  ${side === "long" ? "LONG side — top of the board" : "SHORT side — bottom of the board"}`,
    "  PAIR          24h      1h    vol24h   offExt  rangePos    1hZ     OI24h   rise/off/spike/OI/not-ext",
  ];
  for (const r of rows) {
    const c = r.conditions;
    lines.push(
      `  ${r.asset.padEnd(11)} ${(`${r.change24hPct >= 0 ? "+" : ""}${f1(r.change24hPct)}%`).padStart(7)} ` +
        `${(`${r.change1hPct >= 0 ? "+" : ""}${f1(r.change1hPct)}%`).padStart(7)} ` +
        `${money(r.quoteVolume24h).padStart(9)} ${(`${f1(r.offExtremePct)}%`).padStart(8)} ` +
        `${(`${f1(r.rangePosition)}%`).padStart(9)} ${f1(r.hourlyVolumeZ).padStart(6)} ` +
        `${(`${f1(r.openInterest24hPct)}%`).padStart(8)}   ` +
        `${tick(c.volumeRising)} ${tick(c.offRecentExtreme)} ${tick(c.intradaySpike)} ` +
        `${tick(c.openInterestAligned)} ${tick(c.notOverextended)}   ${r.score}/5`,
    );
  }
  if (rows.length) {
    const names = Object.keys(rows[0].conditions);
    lines.push(
      `  How often each fired: ${names.map((k) => `${k} ${rows.filter((r) => r.conditions[k]).length}/${rows.length}`).join("  |  ")}`,
    );
  }
  return lines;
}

export function formatSides(result) {
  const { scanned, suppressed, long, short, qualified, minScore } = result;
  const lines = [`Two-sided scan — ${scanned} pairs above the volume floor`, ""];
  if (suppressed.length) {
    lines.push(
      `  Skipped, delisting announced: ${suppressed.map((s) => baseAsset(s.symbol)).join(", ")}`,
      "  A removal notice poisons both sides — the pump is an artefact and so is the collapse after it.",
      "",
    );
  }

  lines.push(...table(long, "long"), "", ...table(short, "short"), "");

  lines.push(
    qualified.long.length
      ? `Long, ${minScore}+ of 5: ${qualified.long.map((r) => r.asset).join(", ")}`
      : `No long reached ${minScore} of 5.`,
    qualified.short.length
      ? `Short, ${minScore}+ of 5: ${qualified.short.map((r) => r.asset).join(", ")}`
      : `No short reached ${minScore} of 5.`,
  );

  lines.push(
    "",
    "The two lists do not carry equal evidence and are not offered as equals.",
    "After an hourly turnover alert at z >= 5, walking the next twelve hours bar by bar",
    "and recording which target is reached first (research/two-sided.mjs, n=397):",
    "",
    "  Long  — +10% first in 24.2% of cases against a 6.1% base rate. 3.96x, 2.42 sigma.",
    "  Short — -10% first in 13.1% against a 4.1% base rate. 3.21x, 1.53 sigma.",
    "",
    "Both sides move. The long side is the larger and the only one that clears two sigma,",
    "so the short column is a watchlist rather than a signal. Note that 7.8% of alerts",
    "touch both targets inside the window: a hit rate computed from highs and lows",
    "separately reports 28.7% long and 17.6% short on the same rows, and that pair of",
    "numbers describes an arbitrage that does not exist. The figures above are the ones a",
    "position would have collected.",
  );
  return lines.join("\n");
}
