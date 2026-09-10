/**
 * Does the early detector make money, or only find movement?
 *
 * "Detect earlier" and "be profitable" are different requirements and a
 * detector can satisfy the first while failing the second — this desk already
 * published that result once, when a volume alert with a genuine 3.56x edge on
 * hit rate still missed its target three times out of four.
 *
 * So the detector is graded, not demonstrated:
 *
 *   - across the live universe rather than a chosen handful
 *   - over a grid of geometries, reporting the median cell and how many are
 *     positive, never the best one alone
 *   - against a baseline of arbitrary entries on the same bars, because a hit
 *     rate in a rising market measures the market, not the signal
 *   - with the sample de-overlapped, since signals inside one horizon are not
 *     independent
 *
 * A negative answer is publishable and would be the correct outcome to report.
 */

import { writeFileSync } from "node:fs";
import { fetchKlines } from "../src/analysis.mjs";
import { liveUniverse } from "../src/universe.mjs";
import { backtest, baseline, detect } from "../src/momentum.mjs";

const PAIRS = Number(process.env.PAIRS ?? 100);
const HOURLY = 1000;

const retry = async (fn, n = 6) => {
  let last;
  for (let i = 0; i < n; i++) {
    try { return await fn(); } catch (e) { last = e; await new Promise((r) => setTimeout(r, 1000 * (i + 1))); }
  }
  throw last;
};

const { symbols } = await retry(() => liveUniverse({ limit: PAIRS }));

/** Detector settings to compare. The middle one is the default in momentum.mjs. */
const DETECTORS = {
  "z3 · move 0.5-6%": { minVolumeZ: 3, minMovePct: 0.5, maxMovePct: 6 },
  "z4 · move 0.5-6%": { minVolumeZ: 4, minMovePct: 0.5, maxMovePct: 6 },
  "z3 · move 0.5-3%": { minVolumeZ: 3, minMovePct: 0.5, maxMovePct: 3 },
  "z3 · no ceiling": { minVolumeZ: 3, minMovePct: 0.5, maxMovePct: 1e9 },
};

/** Geometries, in hours. A grid, so no single lucky cell can be the headline. */
const STOPS = [3, 5, 8];
const RRS = [1, 1.5, 2, 3];
const HORIZONS = [12, 24, 72];

const series = [];
for (const [i, symbol] of symbols.entries()) {
  process.stderr.write(`\rfetching ${i + 1}/${symbols.length} ${symbol.padEnd(14)}`);
  try {
    const bars = await retry(() => fetchKlines(symbol, { interval: "1h", limit: HOURLY }));
    if (bars.length > 200) series.push({ symbol, bars });
  } catch { /* a pair that will not load is simply absent */ }
}
process.stderr.write("\r");

const results = {};
for (const [name, cfg] of Object.entries(DETECTORS)) {
  const events = series.map((s) => ({ ...s, events: detect(s.bars, cfg) }));
  const totalEvents = events.reduce((t, s) => t + s.events.length, 0);

  const cells = [];
  for (const stopPct of STOPS) {
    for (const rr of RRS) {
      for (const horizonBars of HORIZONS) {
        const targetPct = stopPct * rr;
        let hit = 0, stopped = 0, openR = 0, n = 0, effN = 0;
        let bHit = 0, bStopped = 0, bOpenR = 0, bN = 0;

        for (const s of events) {
          const r = backtest(s.bars, s.events, { stopPct, targetPct, horizonBars });
          if (r) {
            n += r.n;
            hit += (r.hitPct / 100) * r.n;
            stopped += (r.stoppedPct / 100) * r.n;
            openR += r.expectancyR * r.n - ((r.hitPct / 100) * r.n * rr - (r.stoppedPct / 100) * r.n);
            effN += r.effectiveN;
          }
          const b = baseline(s.bars, { stopPct, targetPct, horizonBars });
          if (b) {
            bN += b.n;
            bHit += (b.hitPct / 100) * b.n;
            bStopped += (b.stoppedPct / 100) * b.n;
            bOpenR += b.expectancyR * b.n - ((b.hitPct / 100) * b.n * rr - (b.stoppedPct / 100) * b.n);
          }
        }
        if (!n || !bN) continue;
        const expectancyR = (hit * rr - stopped + openR) / n;
        const baselineR = (bHit * rr - bStopped + bOpenR) / bN;
        cells.push({
          stopPct, rr, horizonBars, targetPct,
          n, effectiveN: effN,
          hitPct: (hit / n) * 100,
          breakEvenHitPct: 100 / (1 + rr),
          expectancyR,
          baselineHitPct: (bHit / bN) * 100,
          baselineExpectancyR: baselineR,
          edgeR: expectancyR - baselineR,
        });
      }
    }
  }

  const sorted = [...cells].sort((a, b) => a.expectancyR - b.expectancyR);
  const median = sorted[sorted.length >> 1];
  const positive = cells.filter((c) => c.expectancyR > 0);
  const beatsBaseline = cells.filter((c) => c.edgeR > 0);

  results[name] = {
    config: cfg,
    signals: totalEvents,
    signalsPerPairPerWeek: (totalEvents / series.length) / (HOURLY / 24 / 7),
    cells: cells.length,
    positiveCells: positive.length,
    cellsBeatingBaseline: beatsBaseline.length,
    medianExpectancyR: median?.expectancyR ?? null,
    medianEdgeR: median?.edgeR ?? null,
    best: [...cells].sort((a, b) => b.expectancyR - a.expectancyR)[0] ?? null,
    allCells: cells,
  };
}

const out = { measuredAt: new Date().toISOString(), pairs: series.length, hourlyBars: HOURLY, results };
writeFileSync("research/momentum-backtest.json", `${JSON.stringify(out, null, 2)}\n`);

console.log(`${series.length} pairs · ${HOURLY} hourly bars each (~${(HOURLY / 24).toFixed(0)} days)\n`);
for (const [name, r] of Object.entries(results)) {
  console.log(`${name}`);
  console.log(`  signals ${r.signals}  (${r.signalsPerPairPerWeek.toFixed(2)} per pair per week)`);
  console.log(`  cells positive ${r.positiveCells}/${r.cells}   beating baseline ${r.cellsBeatingBaseline}/${r.cells}`);
  console.log(`  median cell   E ${r.medianExpectancyR?.toFixed(3)}R   edge over baseline ${r.medianEdgeR?.toFixed(3)}R`);
  if (r.best) {
    const b = r.best;
    console.log(`  best cell     stop ${b.stopPct}%  RR ${b.rr}  ${b.horizonBars}h`
      + `  hit ${b.hitPct.toFixed(1)}% (needs ${b.breakEvenHitPct.toFixed(1)}%)`
      + `  E ${b.expectancyR.toFixed(3)}R  baseline ${b.baselineExpectancyR.toFixed(3)}R  edge ${b.edgeR.toFixed(3)}R  n=${b.n} (eff ${b.effectiveN.toFixed(0)})`);
  }
  console.log("");
}
