/**
 * Hourly turnover scanner — the only measured edge in this repo.
 *
 * research/breakout-signal.mjs tested seven conditions on daily candles across
 * 43,088 pair-days and found nothing worth trading: the best was 1.57 sigma,
 * and the compression thesis came out at 1.01x lift. Predicting a move before
 * it exists, from daily open/high/low/close, does not work.
 *
 * research/intraday-signal.mjs tested the other axis and did find something.
 * Across 31,515 pair-hours, an hour whose turnover is 5 sigma above the pair's
 * trailing week is followed by a 10% rise within twelve hours 27.6% of the
 * time, against a 6.2% baseline — 4.44x, 2.75 sigma de-overlapped.
 *
 * The distinction matters and must not be blurred when this is written up: it
 * is not a better forecast, it is a shorter delay. A daily candle cannot report
 * anything until 00:00 UTC however violent the session was. BICO's turnover hit
 * 6.7 sigma at 2026-08-02T14:00 with price at 0.01220; the daily detector did
 * not fire until the next day at 0.01742. Same event, 43% worse entry. What
 * this module buys is latency, and latency is the one thing the system can buy.
 */

import { fetchKlines } from "./analysis.mjs";
import { fetchAllTickers } from "./pulse.mjs";

const EXCLUDED = /(UP|DOWN|BULL|BEAR)USDT$|^(USDC|FDUSD|TUSD|BUSD|DAI|EUR|AEUR|USDP|XUSD)USDT$/;

/** Hours of history the z-score is measured against — one full week of the pair's own rhythm. */
export const LOOKBACK_HOURS = 168;

/**
 * Default alert threshold.
 *
 * Reported rather than chosen: z>=3 gives 3.29x at 3.16 sigma but 0.74 alerts
 * per pair per day, which is a feed nobody reads. z>=8 reaches 5.52x at 2.20
 * sigma, and z>=12 gets to 5.60x but the sample thins to 69 observations and
 * significance falls to 1.44 — tightening past 8 buys noise, not precision.
 * Five sits where lift, significance and alert volume are all still defensible.
 */
export const DEFAULT_MIN_Z = 5;

function meanStdev(xs) {
  const mean = xs.reduce((a, b) => a + b, 0) / xs.length;
  const variance = xs.reduce((a, b) => a + (b - mean) ** 2, 0) / (xs.length - 1);
  return [mean, Math.sqrt(variance)];
}

/**
 * The pairs worth scanning, chosen fresh every run.
 *
 * The old altcoin screen worked from a hard-coded list of 26 symbols, which is
 * the same blind spot as a liquidity floor wearing a different hat: BANK,
 * GIGGLE and BICO were never in it, so no amount of scanning could have found
 * them. Picking the universe from the venue each time removes that by
 * construction.
 */
export async function selectUniverse({
  minVolume = 1e6,
  limit = 200,
  fetchImpl = globalThis.fetch,
} = {}) {
  const tickers = await fetchAllTickers(fetchImpl);
  return tickers
    .filter((t) => t.symbol.endsWith("USDT") && !EXCLUDED.test(t.symbol))
    .filter((t) => Number.isFinite(t.quoteVolume24h) && t.quoteVolume24h >= minVolume)
    .sort((a, b) => b.quoteVolume24h - a.quoteVolume24h)
    .slice(0, limit)
    .map((t) => t.symbol);
}

/**
 * Scores one pair's most recent completed hour against its trailing week.
 *
 * The live hour is excluded deliberately. It is partial by definition, so its
 * turnover always reads low early and the scanner would go blind for most of
 * every hour — the same trap `volumeZScore` fell into on daily candles before
 * `volumeZScoreCompleted` existed.
 */
export function scoreSeries(symbol, candles, { lookback = LOOKBACK_HOURS } = {}) {
  const done = candles.slice(0, -1);
  if (done.length < lookback + 1) return null;

  const turnover = done.map((c) => c.quoteVolume);
  const [mean, sd] = meanStdev(turnover.slice(-lookback - 1, -1));
  if (!sd) return null;

  const last = done.at(-1);
  const prev = done.at(-2);
  return {
    symbol,
    hourOpenTime: last.openTime,
    price: last.close,
    volumeZScore: (last.quoteVolume - mean) / sd,
    quoteVolume: last.quoteVolume,
    averageQuoteVolume: mean,
    change1hPct: prev?.close ? (last.close / prev.close - 1) * 100 : NaN,
    rangePct: last.low ? ((last.high - last.low) / last.low) * 100 : NaN,
  };
}

/**
 * Scans a universe and returns every pair sorted by how unusual its last hour
 * was. Failures are skipped rather than thrown: one delisted symbol must not
 * take down a scan of two hundred.
 */
export async function scanIntraday({
  symbols,
  minVolume = 1e6,
  limit = 200,
  lookback = LOOKBACK_HOURS,
  concurrency = 8,
  fetchImpl = globalThis.fetch,
  onProgress = () => {},
} = {}) {
  const universe = symbols ?? (await selectUniverse({ minVolume, limit, fetchImpl }));
  const rows = [];

  for (let i = 0; i < universe.length; i += concurrency) {
    const batch = universe.slice(i, i + concurrency);
    const sets = await Promise.all(
      batch.map((symbol) =>
        fetchKlines(symbol, { interval: "1h", limit: lookback + 8, fetchImpl })
          .then((candles) => scoreSeries(symbol, candles, { lookback }))
          .catch(() => null),
      ),
    );
    for (const row of sets) if (row) rows.push(row);
    onProgress(Math.min(i + concurrency, universe.length), universe.length);
  }

  rows.sort((a, b) => b.volumeZScore - a.volumeZScore);
  return { scannedAt: new Date().toISOString(), scanned: universe.length, rows };
}

/** The rows that clear the threshold. Kept separate so a scan can be inspected without one. */
export function alertsFrom(rows, { minZ = DEFAULT_MIN_Z } = {}) {
  return rows.filter((r) => Number.isFinite(r.volumeZScore) && r.volumeZScore >= minZ);
}

const f1 = (v) => (Number.isFinite(v) ? v.toFixed(1) : "—");
const f2 = (v) => (Number.isFinite(v) ? v.toFixed(2) : "—");
const money = (v) => (v >= 1e6 ? `$${(v / 1e6).toFixed(1)}M` : `$${(v / 1e3).toFixed(0)}K`);

export function formatIntraday({ scanned, rows }, { minZ = DEFAULT_MIN_Z, top = 15 } = {}) {
  const lines = [`Intraday scan — ${scanned} pairs, last completed hour vs trailing ${LOOKBACK_HOURS}h`, ""];
  lines.push("  PAIR            volZ       1h      range     turnover   vs avg");
  for (const r of rows.slice(0, top)) {
    lines.push(
      `  ${r.symbol.replace(/USDT$/, "").padEnd(12)} ${f1(r.volumeZScore).padStart(7)} ` +
        `${`${r.change1hPct >= 0 ? "+" : ""}${f2(r.change1hPct)}%`.padStart(8)} ` +
        `${`${f1(r.rangePct)}%`.padStart(9)} ${money(r.quoteVolume).padStart(11)} ` +
        `${(r.averageQuoteVolume ? `${f1(r.quoteVolume / r.averageQuoteVolume)}x` : "—").padStart(8)}`,
    );
  }
  const alerts = alertsFrom(rows, { minZ });
  lines.push("");
  lines.push(
    alerts.length
      ? `Alerts (volZ>=${minZ}): ${alerts.map((a) => a.symbol.replace(/USDT$/, "")).join(", ")}`
      : `No alert this hour: nothing above ${minZ} sigma of its own weekly turnover.`,
  );
  return lines.join("\n");
}
