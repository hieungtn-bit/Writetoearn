/**
 * Calendar-effect testing.
 *
 * "Price fell because it is month-end" is the kind of claim that circulates
 * unexamined. It is also testable: group historical daily returns by whether
 * the day was a month-end and compare. The point of this module is to make the
 * claim falsifiable, and to report the sample size honestly — with a couple of
 * years of history there are only ~24 month-ends, which is nowhere near enough
 * to establish a pattern. Saying so is the finding.
 */

import { mean, stdev, pctChange } from "./analysis.mjs";

/** A candle's UTC day is the last of its month when tomorrow is a new month. */
function isMonthEndUTC(ms) {
  const d = new Date(ms);
  const next = new Date(ms + 86_400_000);
  return d.getUTCMonth() !== next.getUTCMonth();
}

/**
 * Splits daily returns into month-end days and everything else.
 *
 * @param {{openTime:number, open:number, close:number}[]} candles daily candles
 * @returns {{monthEnd: object, otherDays: object, sampleWarning: string|null}}
 */
export function monthEndEffect(candles) {
  const monthEndReturns = [];
  const otherReturns = [];

  for (let i = 1; i < candles.length; i++) {
    const change = pctChange(candles[i - 1].close, candles[i].close);
    if (!Number.isFinite(change)) continue;
    (isMonthEndUTC(candles[i].openTime) ? monthEndReturns : otherReturns).push(change);
  }

  const describe = (xs) => ({
    n: xs.length,
    meanPct: xs.length ? mean(xs) : NaN,
    stdevPct: xs.length > 1 ? stdev(xs) : NaN,
    negativeShare: xs.length ? (xs.filter((x) => x < 0).length / xs.length) * 100 : NaN,
    worstPct: xs.length ? Math.min(...xs) : NaN,
    bestPct: xs.length ? Math.max(...xs) : NaN,
  });

  const monthEnd = describe(monthEndReturns);
  const otherDays = describe(otherReturns);

  // A difference in means is meaningless without the spread to judge it
  // against. This is a rough effect size, not a significance test.
  const pooled = Math.sqrt(
    ((monthEnd.stdevPct ** 2 || 0) + (otherDays.stdevPct ** 2 || 0)) / 2,
  );
  const differencePct = monthEnd.meanPct - otherDays.meanPct;
  const effectSize = pooled ? differencePct / pooled : NaN;

  return {
    monthEnd,
    otherDays,
    differencePct,
    effectSize,
    sampleWarning:
      monthEnd.n < 40
        ? `Only ${monthEnd.n} month-end observations — far too few to establish a seasonal pattern.`
        : null,
  };
}

export function formatMonthEnd(result, symbol = "BTCUSDT") {
  const f = (n, d = 2) => (Number.isFinite(n) ? n.toFixed(d) : "n/a");
  const lines = [
    `Month-end effect — ${symbol} (Binance spot daily candles)`,
    "",
    `  Month-end days   n=${result.monthEnd.n}  mean ${f(result.monthEnd.meanPct)}%  ` +
      `sd ${f(result.monthEnd.stdevPct)}%  negative ${f(result.monthEnd.negativeShare, 0)}%`,
    `  All other days   n=${result.otherDays.n}  mean ${f(result.otherDays.meanPct)}%  ` +
      `sd ${f(result.otherDays.stdevPct)}%  negative ${f(result.otherDays.negativeShare, 0)}%`,
    "",
    `  Difference in means: ${f(result.differencePct)} percentage points`,
    `  Effect size (Cohen's d): ${f(result.effectSize)}`,
  ];
  if (result.sampleWarning) lines.push("", `  ⚠ ${result.sampleWarning}`);
  return lines.join("\n");
}
