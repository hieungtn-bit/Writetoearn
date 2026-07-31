/**
 * Altcoin screener.
 *
 * The majors get a dedicated brief because they are always worth covering. An
 * altcoin only earns a post when the numbers say something unusual, so the
 * screener runs the whole universe and surfaces the extremes rather than
 * picking names by intuition. That ordering — screen first, narrative second —
 * is what separates research from a hot take.
 */

import { analyzeAsset, fetchDailyCandles } from "./analysis.mjs";

/** Liquid Binance USDT pairs outside the four majors, verified tradeable. */
export const ALT_UNIVERSE = [
  "XRPUSDT", "DOGEUSDT", "ADAUSDT", "LINKUSDT", "AVAXUSDT", "DOTUSDT", "LTCUSDT",
  "UNIUSDT", "AAVEUSDT", "ATOMUSDT", "NEARUSDT", "APTUSDT", "SUIUSDT", "ARBUSDT",
  "OPUSDT", "TONUSDT", "INJUSDT", "TIAUSDT", "FILUSDT", "HBARUSDT", "SEIUSDT",
  "JUPUSDT", "WLDUSDT", "ENAUSDT", "PENGUUSDT", "PUMPUSDT",
];

/**
 * Runs the full analysis across a universe.
 *
 * Batched deliberately: firing every symbol at once earns 503s from the
 * exchange and takes the whole screen down with it.
 */
export async function screen(symbols = ALT_UNIVERSE, { fetchImpl = globalThis.fetch, onProgress = () => {} } = {}) {
  const rows = [];
  const failed = [];

  for (let i = 0; i < symbols.length; i += 2) {
    const batch = symbols.slice(i, i + 2);
    onProgress(`${Math.min(i + 2, symbols.length)}/${symbols.length}`);

    const candles = await fetchDailyCandles(batch, { fetchImpl }).catch(() => null);
    if (!candles) {
      failed.push(...batch);
      continue;
    }
    for (const symbol of batch) {
      try {
        const { returns, ...rest } = await analyzeAsset(symbol, { fetchImpl, candles: candles[symbol] });
        rows.push(rest);
      } catch (err) {
        failed.push(symbol);
      }
    }
  }

  return { rows, failed, screenedAt: new Date().toISOString() };
}

/**
 * Picks the readings worth writing about.
 *
 * Each bucket is a specific, checkable condition rather than a vague "looks
 * interesting" — the point is that a reader could reproduce the selection.
 */
export function findOutliers(rows, { rangeFloor = 10, rangeCeiling = 90, rsiLow = 30, rsiHigh = 70, volSpike = 2 } = {}) {
  const finite = (x) => Number.isFinite(x);

  return {
    atRangeFloor: rows
      .filter((r) => finite(r.rangePosition30d) && r.rangePosition30d <= rangeFloor)
      .sort((a, b) => a.rangePosition30d - b.rangePosition30d),

    atRangeHigh: rows
      .filter((r) => finite(r.rangePosition30d) && r.rangePosition30d >= rangeCeiling)
      .sort((a, b) => b.rangePosition30d - a.rangePosition30d),

    oversold: rows.filter((r) => finite(r.rsi14) && r.rsi14 <= rsiLow).sort((a, b) => a.rsi14 - b.rsi14),
    overbought: rows.filter((r) => finite(r.rsi14) && r.rsi14 >= rsiHigh).sort((a, b) => b.rsi14 - a.rsi14),

    volumeAnomaly: rows
      .filter((r) => finite(r.volumeZScore) && Math.abs(r.volumeZScore) >= volSpike)
      .sort((a, b) => Math.abs(b.volumeZScore) - Math.abs(a.volumeZScore)),

    strongest7d: [...rows].filter((r) => finite(r.change7dPct)).sort((a, b) => b.change7dPct - a.change7dPct).slice(0, 3),
    weakest7d: [...rows].filter((r) => finite(r.change7dPct)).sort((a, b) => a.change7dPct - b.change7dPct).slice(0, 3),

    /** Coiling: a tight recent range often precedes an expansion. */
    mostCompressed: [...rows]
      .filter((r) => finite(r.rangeCompressionPct))
      .sort((a, b) => a.rangeCompressionPct - b.rangeCompressionPct)
      .slice(0, 3),
  };
}

const tick = (s) => s.replace(/USDT$/, "");
const pct = (n) => `${n >= 0 ? "+" : ""}${n.toFixed(2)}%`;

export function formatScreen({ rows, failed }, outliers) {
  const lines = [`Altcoin screen — ${rows.length} pairs (Binance spot daily candles)`, ""];

  const table = [...rows].sort((a, b) => b.change7dPct - a.change7dPct);
  lines.push("  PAIR        7d        30d       RSI    range   vol30d   volZ");
  for (const r of table) {
    lines.push(
      `  ${tick(r.symbol).padEnd(8)} ${pct(r.change7dPct).padStart(8)} ${pct(r.change30dPct).padStart(9)} ` +
        `${r.rsi14.toFixed(1).padStart(6)} ${`${r.rangePosition30d.toFixed(0)}%`.padStart(7)} ` +
        `${`${r.realizedVol30d.toFixed(0)}%`.padStart(7)} ${r.volumeZScore.toFixed(1).padStart(6)}`,
    );
  }
  lines.push("");

  const bucket = (title, items, render) => {
    if (!items.length) return;
    lines.push(`${title}: ${items.map(render).join(", ")}`);
  };

  bucket("At 30d floor (<=10%)", outliers.atRangeFloor, (r) => `${tick(r.symbol)} ${r.rangePosition30d.toFixed(0)}%`);
  bucket("At 30d high (>=90%)", outliers.atRangeHigh, (r) => `${tick(r.symbol)} ${r.rangePosition30d.toFixed(0)}%`);
  bucket("Oversold (RSI<=30)", outliers.oversold, (r) => `${tick(r.symbol)} ${r.rsi14.toFixed(1)}`);
  bucket("Overbought (RSI>=70)", outliers.overbought, (r) => `${tick(r.symbol)} ${r.rsi14.toFixed(1)}`);
  bucket("Volume anomaly (|z|>=2)", outliers.volumeAnomaly, (r) => `${tick(r.symbol)} ${r.volumeZScore.toFixed(1)}σ`);
  bucket("Strongest 7d", outliers.strongest7d, (r) => `${tick(r.symbol)} ${pct(r.change7dPct)}`);
  bucket("Weakest 7d", outliers.weakest7d, (r) => `${tick(r.symbol)} ${pct(r.change7dPct)}`);
  bucket("Most compressed range", outliers.mostCompressed, (r) => `${tick(r.symbol)} ${r.rangeCompressionPct.toFixed(0)}%`);

  if (failed.length) lines.push("", `Could not screen: ${failed.join(", ")}`);
  return lines.join("\n");
}
