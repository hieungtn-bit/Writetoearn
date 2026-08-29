/**
 * Concrete recommendations, ranked by what survived being questioned.
 *
 * Deliberately does not write site/signals.json or the dated archive. A
 * re-scan on the same day overwrites that day's archived snapshot, and post 70
 * cites it — refreshing prices for a recommendation must not destroy the
 * record a published article points at.
 *
 * The ranking is not expectancy. Expectancy over five independent episodes is
 * the number that has misled this desk most often. The gate order here is:
 *
 *   1. liquid enough to size at all
 *   2. a majority of lookbacks agree with the direction
 *   3. positive expectancy on the deciding window
 *
 * and only then is expectancy used to sort what is left.
 *
 * Every plan is also re-stopped. The board derives its stop from daily ATR,
 * and across every name measured this week that lands under half a median
 * week — so a position held for a 30-day horizon is stopped by an ordinary
 * week rather than by being wrong. The `weekAware` block re-sizes the stop to
 * the holding period and shows what that does to the position.
 */

import { writeFileSync } from "node:fs";
import { analyzeAsset, atr, fetchKlines } from "../src/analysis.mjs";
import { liveUniverse } from "../src/universe.mjs";
import { signalFor, walk } from "../src/signals.mjs";
import { stageOf } from "../src/stage.mjs";

const ACCOUNT_RISK_PCT = 1;
const PAIRS = Number(process.env.PAIRS ?? 100);

const median = (xs) => {
  const s = [...xs].sort((a, b) => a - b);
  return s.length % 2 ? s[s.length >> 1] : (s[s.length / 2 - 1] + s[s.length / 2]) / 2;
};

// Same universe the board scans, so a recommendation cannot come from a name
// the published board never looked at.
const { symbols: SYMBOLS } = await (async () => {
  for (let i = 0; i < 6; i++) {
    try { return await liveUniverse({ limit: PAIRS }); }
    catch { await new Promise((r) => setTimeout(r, 1200 * (i + 1))); }
  }
  throw new Error("could not reach the exchange to build a universe");
})();

const rows = [];
for (const [i, symbol] of SYMBOLS.entries()) {
  process.stderr.write(`\r${i + 1}/${SYMBOLS.length} ${symbol.padEnd(12)}`);
  try {
    const candles = await fetchKlines(symbol, { interval: "1d", limit: 1000 });
    const analysis = await analyzeAsset(symbol, { candles });
    const atrPct = (atr(candles, 14) / analysis.price) * 100;
    const stage = await stageOf(symbol.replace(/USDT$/, "")).catch(() => null);

    const signal = signalFor({
      symbol, candles, atrPct, price: analysis.price,
      turnoverUsd: Number.isFinite(analysis.avgQuoteVolume30d) ? analysis.avgQuoteVolume30d : null,
    });
    if (!signal.plan || !signal.agreement) continue;

    /** Weekly high-to-low range — what a stop held over a week must survive. */
    const weeks = [];
    for (let k = 0; k + 7 <= candles.length; k += 7) {
      const w = candles.slice(k, k + 7);
      const lo = Math.min(...w.map((c) => c.low));
      weeks.push(((Math.max(...w.map((c) => c.high)) - lo) / lo) * 100);
    }
    const medianWeek = median(weeks);

    const p = signal.plan;
    const long = p.direction === "long";

    /**
     * The same trade with a stop at half a median week, which is the smallest
     * stop that is not simply buying noise over a multi-week hold.
     */
    const weekStopPct = Math.max(p.stopPct, medianWeek / 2);
    const weekTargetPct = weekStopPct * p.rr;
    const reStopped = walk(candles.slice(-180), {
      direction: p.direction, stopPct: weekStopPct, targetPct: weekTargetPct, horizon: p.horizonDays,
    });

    const size = (stopPct) => (ACCOUNT_RISK_PCT / stopPct) * 1000;

    rows.push({
      asset: symbol.replace(/USDT$/, ""),
      bias: signal.bias,
      tradeable: signal.tradeable,
      turnoverUsd: signal.turnoverUsd,
      agreeing: signal.agreement.agreeing,
      windows: signal.agreement.windows,
      agreementPct: signal.agreement.sharePct,
      turning: signal.regime.turning,
      thin: signal.confidence?.thin ?? null,
      stage: stage?.stage ?? null,
      underwaterPct: stage?.underwaterPct ?? null,
      volumeTrendPct: stage?.volumeTrendPct ?? null,
      rangePosition30d: analysis.rangePosition30d,
      atrPct,
      medianWeekPct: medianWeek,
      board: {
        horizonDays: p.horizonDays, entry: p.entry, stop: p.stop, target: p.target,
        stopPct: p.stopPct, targetPct: p.targetPct, rr: p.rr,
        hitPct: p.hitPct, expectancyR: p.expectancyR, effectiveN: p.effectiveN,
        stopInMedianWeek: p.stopPct / medianWeek,
        usdPer1000: size(p.stopPct),
      },
      weekAware: reStopped && {
        stopPct: weekStopPct, targetPct: weekTargetPct,
        stop: long ? p.entry * (1 - weekStopPct / 100) : p.entry * (1 + weekStopPct / 100),
        target: long ? p.entry * (1 + weekTargetPct / 100) : p.entry * (1 - weekTargetPct / 100),
        hitPct: reStopped.hitPct, expectancyR: reStopped.expectancyR,
        stopInMedianWeek: weekStopPct / medianWeek,
        usdPer1000: size(weekStopPct),
      },
    });
  } catch { /* a pair that will not fetch is simply not recommended */ }
}
process.stderr.write("\r");

/** Gate order: sizeable, then robust, then positive. Expectancy sorts last. */
const sizeable = rows.filter((r) => r.tradeable);
const robust = sizeable.filter((r) => r.agreeing * 2 > r.windows);
const positive = robust.filter((r) => r.board.expectancyR > 0);
const ranked = [...positive].sort((a, b) => {
  if (b.agreementPct !== a.agreementPct) return b.agreementPct - a.agreementPct;
  return b.board.expectancyR - a.board.expectancyR;
});

const out = {
  measuredAt: new Date().toISOString(),
  accountRiskPct: ACCOUNT_RISK_PCT,
  funnel: {
    scanned: rows.length,
    sizeable: sizeable.length,
    robust: robust.length,
    positive: positive.length,
  },
  rejected: {
    tooThin: rows.filter((r) => !r.tradeable).map((r) => r.asset),
    lookbacksDisagree: sizeable.filter((r) => r.agreeing * 2 <= r.windows)
      .map((r) => `${r.asset} ${r.bias} ${r.agreeing}/${r.windows}`),
  },
  recommendations: ranked,
};
writeFileSync("research/recommendations.json", `${JSON.stringify(out, null, 2)}\n`);

console.log(`funnel: ${rows.length} scanned → ${sizeable.length} sizeable → ${robust.length} robust → ${positive.length} positive\n`);
console.log("RANKED\n");
for (const r of ranked) {
  console.log(`${r.asset.padEnd(7)} ${r.bias.padEnd(5)} ${r.agreeing}/${r.windows}  ${r.board.horizonDays}d`
    + `  E ${r.board.expectancyR.toFixed(2)}R  hit ${r.board.hitPct.toFixed(1)}%  n≈${Math.round(r.board.effectiveN)}`
    + `  $${(r.turnoverUsd / 1e6).toFixed(1)}M`);
  console.log(`        board  entry ${r.board.entry.toPrecision(5)}  stop ${r.board.stop.toPrecision(5)} (${r.board.stopPct.toFixed(2)}%`
    + ` = ${r.board.stopInMedianWeek.toFixed(2)}x week)  target ${r.board.target.toPrecision(5)}  size $${r.board.usdPer1000.toFixed(0)}/1k`);
  if (r.weekAware) {
    console.log(`        week   stop ${r.weekAware.stop.toPrecision(5)} (${r.weekAware.stopPct.toFixed(2)}%`
      + ` = ${r.weekAware.stopInMedianWeek.toFixed(2)}x)  target ${r.weekAware.target.toPrecision(5)}`
      + `  hit ${r.weekAware.hitPct.toFixed(1)}%  E ${r.weekAware.expectancyR.toFixed(2)}R  size $${r.weekAware.usdPer1000.toFixed(0)}/1k`);
  }
  console.log(`        ${r.stage} · overhead ${r.underwaterPct?.toFixed(1)}% · volume ${r.volumeTrendPct?.toFixed(1)}%`
    + ` · range ${r.rangePosition30d.toFixed(1)}%${r.turning ? " · regime turn" : ""}${r.thin ? " · thin sample" : ""}`);
  console.log("");
}
console.log("rejected — lookbacks disagree:", out.rejected.lookbacksDisagree.join(", ") || "none");
console.log("rejected — too thin:", out.rejected.tooThin.join(", ") || "none");
