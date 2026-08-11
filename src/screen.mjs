/**
 * Altcoin screener.
 *
 * The majors get a dedicated brief because they are always worth covering. An
 * altcoin only earns a post when the numbers say something unusual, so the
 * screener runs the whole universe and surfaces the extremes rather than
 * picking names by intuition. That ordering — screen first, narrative second —
 * is what separates research from a hot take.
 */

import { analyzeAsset, correlation, fetchDailyCandles, fetchKlines, riskAdjusted } from "./analysis.mjs";

/** Liquid Binance USDT pairs outside the four majors, verified tradeable. */
export const ALT_UNIVERSE = [
  "XRPUSDT", "DOGEUSDT", "ADAUSDT", "LINKUSDT", "AVAXUSDT", "DOTUSDT", "LTCUSDT",
  "UNIUSDT", "AAVEUSDT", "ATOMUSDT", "NEARUSDT", "APTUSDT", "SUIUSDT", "ARBUSDT",
  "OPUSDT", "TONUSDT", "INJUSDT", "TIAUSDT", "FILUSDT", "HBARUSDT", "SEIUSDT",
  "JUPUSDT", "WLDUSDT", "ENAUSDT", "PENGUUSDT", "PUMPUSDT",
  // ICP is here because the desk has published calls on it. A board that omits
  // the pair its own headline call was made on cannot be checked against that
  // call, which is the one check that matters most.
  "ICPUSDT",
];

/**
 * Runs the full analysis across a universe.
 *
 * Batched deliberately: firing every symbol at once earns 503s from the
 * exchange and takes the whole screen down with it.
 *
 * Every row is also measured against `base`. A screen that reports return and
 * volatility but not correlation invites the reading that a volatile altcoin is
 * a *different* bet from the majors, when most of them are the same bet with
 * more leverage — and the difference decides whether the extra risk buys
 * anything.
 */
export async function screen(
  symbols = ALT_UNIVERSE,
  { fetchImpl = globalThis.fetch, onProgress = () => {}, base = "BTCUSDT" } = {},
) {
  const rows = [];
  const failed = [];

  // One extra fetch, done once, so every row can be compared to the same
  // anchor. A missing anchor degrades the correlation column to NaN rather
  // than failing the screen — the rest of the readings are still usable.
  let baseReturns = null;
  let baseRow = null;
  try {
    const baseCandles = await fetchKlines(base, { interval: "1d", limit: 120, fetchImpl });
    const { returns, ...rest } = await analyzeAsset(base, { fetchImpl, candles: baseCandles });
    baseReturns = returns;
    baseRow = { ...rest, corr30dToBase: 1 };
  } catch {
    baseReturns = null;
  }

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
        rows.push({
          ...rest,
          corr30dToBase: baseReturns ? correlation(returns, baseReturns) : NaN,
        });
      } catch (err) {
        failed.push(symbol);
      }
    }
  }

  return {
    rows,
    failed,
    base,
    baseRow,
    aggregates: summarise(rows, baseRow),
    screenedAt: new Date().toISOString(),
  };
}

export function median(xs) {
  const s = xs.filter(Number.isFinite).sort((a, b) => a - b);
  if (!s.length) return NaN;
  const m = s.length >> 1;
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

/**
 * Board-level statistics, computed once so a market-wide post can be verified.
 *
 * Without these, a sentence like "the median pair ran 54.5% volatility" is
 * untraceable — and worse, it can *pass* the checker by coincidence, because 26
 * pairs times eighteen fields is enough numbers that almost any two-digit value
 * collides with something. A gate that says PASS for the wrong reason is more
 * dangerous than one that says FAIL, so the aggregates a whole-market post
 * relies on are measured here rather than left to chance.
 */
export function summarise(rows, baseRow) {
  const of = (f) => rows.map(f).filter(Number.isFinite);
  const medianVol = median(of((r) => r.realizedVol30d));

  return {
    pairs: rows.length,
    down7d: rows.filter((r) => r.change7dPct < 0).length,
    medianChange30dPct: median(of((r) => r.change30dPct)),
    medianChange7dPct: median(of((r) => r.change7dPct)),
    medianRealizedVol30d: medianVol,
    medianCorr30dToBase: median(of((r) => r.corr30dToBase)),
    medianReturnPerVol30d: median(of((r) => r.returnPerVol30d)),
    beatBaseReturn: baseRow ? rows.filter((r) => r.change30dPct > baseRow.change30dPct).length : NaN,
    beatBaseRiskAdjusted: baseRow
      ? rows.filter((r) => r.returnPerVol30d > baseRow.returnPerVol30d).length
      : NaN,
    moreVolatileThanBase: baseRow
      ? rows.filter((r) => r.realizedVol30d > baseRow.realizedVol30d).length
      : NaN,
    volRatioToBase: baseRow && baseRow.realizedVol30d ? medianVol / baseRow.realizedVol30d : NaN,
  };
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

const num = (v, dp) => (Number.isFinite(v) ? v.toFixed(dp) : "—");

export function formatScreen({ rows, failed, base = "BTCUSDT" }, outliers) {
  const lines = [`Altcoin screen — ${rows.length} pairs (Binance spot daily candles)`, ""];

  const table = [...rows].sort((a, b) => b.change7dPct - a.change7dPct);
  lines.push(`  PAIR        7d        30d       RSI    range   vol30d   volZ   corr${tick(base)}    r/v`);
  for (const r of table) {
    lines.push(
      `  ${tick(r.symbol).padEnd(8)} ${pct(r.change7dPct).padStart(8)} ${pct(r.change30dPct).padStart(9)} ` +
        `${r.rsi14.toFixed(1).padStart(6)} ${`${r.rangePosition30d.toFixed(0)}%`.padStart(7)} ` +
        `${`${r.realizedVol30d.toFixed(0)}%`.padStart(7)} ${r.volumeZScore.toFixed(1).padStart(6)} ` +
        `${num(r.corr30dToBase, 2).padStart(7)} ${num(r.returnPerVol30d, 3).padStart(6)}`,
    );
  }
  lines.push("");
  lines.push(`  r/v = 30d return per unit of annualised volatility. corr${tick(base)} = 30d daily-return correlation.`);
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
