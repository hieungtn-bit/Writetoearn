/**
 * What the early detector costs to trade, which is the number that kills it.
 *
 * research/momentum-backtest.json scores the detector gross. Gross is not the
 * question a person with an account has. This charges the round trip against
 * every configuration tested and reports what is left.
 *
 * The fee is expressed in R rather than percent on purpose. A 0.2% round trip
 * is meaningless until you know what it is 0.2% *of*: against a 3% stop it is
 * 0.067R, against an 8% stop 0.025R. The same fee is nearly three times as
 * expensive on the tighter stop, and every comparison to an expectancy in R
 * has to be made in those units or it is not a comparison at all.
 *
 * The count of surviving cells is reported next to the number chance alone
 * would produce from a search this wide, because a survivor list is not
 * evidence until you know how many places you looked.
 *
 * No network access: this reads a committed snapshot and does arithmetic.
 */

import { readFileSync, writeFileSync } from "node:fs";

const M = JSON.parse(readFileSync("research/momentum-backtest.json", "utf8"));

/** Binance spot, in and out, market orders. */
const FEE_PCT = 0.2;
/** The rate at which a search of this width throws up winners with nothing behind them. */
const FALSE_POSITIVE_RATE = 0.05;

const cells = Object.entries(M.results).flatMap(([config, r]) =>
  r.allCells.map((c) => {
    const feeR = FEE_PCT / c.stopPct;
    return {
      config,
      stopPct: c.stopPct,
      rr: c.rr,
      horizonBars: c.horizonBars,
      n: c.n,
      effectiveN: c.effectiveN,
      hitPct: c.hitPct,
      expectancyR: c.expectancyR,
      edgeR: c.edgeR,
      feeR,
      netR: c.expectancyR - feeR,
    };
  }));

const survivors = cells.filter((c) => c.netR > 0).sort((a, b) => b.netR - a.netR);
const widestStop = Math.max(...cells.map((c) => c.stopPct));

const best = M.results["z3 · move 0.5-6%"].best;
const bestFeeR = FEE_PCT / best.stopPct;

const out = {
  measuredAt: new Date().toISOString(),
  source: "research/momentum-backtest.json",
  sourceMeasuredAt: M.measuredAt,
  feePct: FEE_PCT,
  falsePositiveRate: FALSE_POSITIVE_RATE,
  cellsTested: cells.length,
  survivingCells: survivors.length,
  expectedByChance: cells.length * FALSE_POSITIVE_RATE,
  widestStopPct: widestStop,
  survivorsUseWidestStop: survivors.every((c) => c.stopPct === widestStop),
  bestGross: {
    stopPct: best.stopPct,
    rr: best.rr,
    horizonBars: best.horizonBars,
    hitPct: best.hitPct,
    baselineHitPct: best.baselineHitPct,
    expectancyR: best.expectancyR,
    edgeR: best.edgeR,
    feeR: bestFeeR,
    netR: best.expectancyR - bestFeeR,
    feeToEdgeRatio: bestFeeR / best.expectancyR,
  },
  /** What ten round trips a week costs, before being right about anything. */
  frictionPerTenTradesR: bestFeeR * 10,
  survivors: survivors.map((c) => ({
    config: c.config, stopPct: c.stopPct, rr: c.rr, horizonBars: c.horizonBars,
    expectancyR: c.expectancyR, feeR: c.feeR, netR: c.netR, effectiveN: c.effectiveN,
  })),
};
writeFileSync("research/detector-costs.json", `${JSON.stringify(out, null, 2)}\n`);

console.log(`${out.cellsTested} configurations tested · fee ${FEE_PCT}% round trip\n`);
console.log(`best gross cell: ${best.stopPct}% stop, ${best.rr}:1, ${best.horizonBars}h`);
console.log(`  gross ${best.expectancyR.toFixed(4)}R  fee ${bestFeeR.toFixed(4)}R  net ${out.bestGross.netR.toFixed(4)}R`);
console.log(`  the fee is ${out.bestGross.feeToEdgeRatio.toFixed(2)}x the edge\n`);
console.log(`surviving fees: ${out.survivingCells} of ${out.cellsTested}`);
console.log(`chance alone would give about ${out.expectedByChance.toFixed(0)}`);
for (const s of out.survivors) {
  console.log(`  ${s.config} · ${s.stopPct}% stop ${s.rr}:1 ${s.horizonBars}h · net ${s.netR.toFixed(4)}R`);
}
