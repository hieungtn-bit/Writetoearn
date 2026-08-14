/**
 * Does the board's chosen plan survive being taken out of the window it was
 * chosen in?
 *
 * Two things published this morning point at the same weakness in my own
 * engine, so it has to be tested rather than hoped about.
 *
 * research/stop-law.json found that expectancy peaks near 1.5 daily ATR and
 * decays past it. The live board currently publishes plans at 1, 1.5, 2 and 3
 * ATR, because it optimises per pair. research/detector-costs.json found that
 * searching one hundred and forty-four configurations manufactures winners
 * whether or not anything is there. The board searches sixty-four geometries
 * per pair and publishes the maximum of them.
 *
 * A maximum over sixty-four noisy estimates is not an estimate of anything. It
 * is the largest draw from a distribution, and the honest question is how much
 * of it is real.
 *
 * So: choose on the older half of the history, score on the newer half, and
 * never let the choosing window see the scoring window. Three numbers per pair:
 *
 *   chosen    what the winning cell scored in the window that crowned it
 *   held      what that same cell went on to do afterwards
 *   typical   what the median cell did over the same later window
 *
 * If `held` lands near `typical`, the selection bought nothing and the board's
 * headline number is an artefact of picking a maximum. If it lands nearer
 * `chosen`, the selection is finding something durable.
 *
 * The ceiling is reported too — the best cell measured on the later window with
 * hindsight — because it bounds what any chooser could have achieved and keeps
 * a mediocre `held` in proportion.
 */

import { writeFileSync } from "node:fs";
import { analyzeAsset, atr, fetchKlines } from "../src/analysis.mjs";
import { liveUniverse } from "../src/universe.mjs";
import { grid } from "../src/signals.mjs";

const PAIRS = Number(process.env.PAIRS ?? 100);
/** Days in each half. The engine decides on 180, so each half must clear it. */
const HALF = 270;

/** The width research/stop-law.json put the peak at, tested here as a rule. */
const FIXED_STOP_ATR = 1.5;

const retry = async (fn, n = 6) => {
  let last;
  for (let i = 0; i < n; i++) {
    try { return await fn(); } catch (e) { last = e; await new Promise((r) => setTimeout(r, 1200 * (i + 1))); }
  }
  throw last;
};

const median = (xs) => {
  if (!xs.length) return null;
  const s = [...xs].sort((a, b) => a - b);
  const m = s.length >> 1;
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};

const { symbols } = await retry(() => liveUniverse({ limit: PAIRS }));

const rows = [];
for (const [i, symbol] of symbols.entries()) {
  process.stderr.write(`\r${i + 1}/${symbols.length} ${symbol.padEnd(14)}`);
  try {
    const candles = await retry(() => fetchKlines(symbol, { interval: "1d", limit: 1000 }));
    if (candles.length < HALF * 2 + 40) continue;
    const analysis = await retry(() => analyzeAsset(symbol, { candles }));
    const atrPct = (atr(candles, 14) / analysis.price) * 100;
    if (!Number.isFinite(atrPct) || atrPct <= 0) continue;

    const train = candles.slice(-HALF * 2, -HALF);
    const test = candles.slice(-HALF);

    for (const direction of ["long", "short"]) {
      const trainCells = grid(train, atrPct, { direction });
      const testCells = grid(test, atrPct, { direction });
      if (!trainCells.length || !testCells.length) continue;

      /** Score a train-chosen geometry on data that had no part in choosing it. */
      const outOfSample = (cell) => cell && testCells.find((c) =>
        c.stopAtr === cell.stopAtr && c.rr === cell.rr && c.horizonDays === cell.horizonDays);

      const chosen = [...trainCells].sort((a, b) => b.expectancyR - a.expectancyR)[0];
      const held = outOfSample(chosen);
      if (!held) continue;

      /**
       * The proposed narrower rule, measured rather than assumed.
       *
       * research/stop-law.json put the peak at 1.5 ATR across the universe, so
       * the obvious repair is to stop letting the optimiser roam over stop
       * widths and search only within that one. Whether that is actually better
       * is a question, not a conclusion — so it is scored the same way, on the
       * same split, and is allowed to lose.
       */
      const fixedCells = trainCells.filter((c) => c.stopAtr === FIXED_STOP_ATR);
      const chosenFixed = [...fixedCells].sort((a, b) => b.expectancyR - a.expectancyR)[0];
      const heldFixed = outOfSample(chosenFixed);

      const typical = median(testCells.map((c) => c.expectancyR));
      const ceiling = [...testCells].sort((a, b) => b.expectancyR - a.expectancyR)[0];

      rows.push({
        symbol, direction,
        stopAtr: chosen.stopAtr, rr: chosen.rr, horizonDays: chosen.horizonDays,
        chosenR: chosen.expectancyR,
        heldR: held.expectancyR,
        typicalR: typical,
        ceilingR: ceiling.expectancyR,
        fixedChosenR: chosenFixed?.expectancyR ?? null,
        fixedHeldR: heldFixed?.expectancyR ?? null,
        fixedRr: chosenFixed?.rr ?? null,
        fixedHorizonDays: chosenFixed?.horizonDays ?? null,
        /** How much of the chosen advantage over typical actually persisted. */
        keptShare: (held.expectancyR - typical) / (chosen.expectancyR - typical),
        beatTypical: held.expectancyR > typical,
        stillPositive: held.expectancyR > 0,
        fixedBeatsFree: heldFixed ? heldFixed.expectancyR > held.expectancyR : null,
      });
    }
  } catch { /* absent rather than guessed */ }
}
process.stderr.write("\r");

const summary = (subset) => subset.length ? {
  pairs: subset.length,
  medianChosenR: median(subset.map((r) => r.chosenR)),
  medianHeldR: median(subset.map((r) => r.heldR)),
  medianTypicalR: median(subset.map((r) => r.typicalR)),
  medianCeilingR: median(subset.map((r) => r.ceilingR)),
  shareBeatingTypical: (subset.filter((r) => r.beatTypical).length / subset.length) * 100,
  shareStillPositive: (subset.filter((r) => r.stillPositive).length / subset.length) * 100,
  medianKeptShare: median(subset.map((r) => r.keptShare).filter(Number.isFinite)),
  fixedMedianChosenR: median(subset.map((r) => r.fixedChosenR).filter((v) => v != null)),
  fixedMedianHeldR: median(subset.map((r) => r.fixedHeldR).filter((v) => v != null)),
  fixedSharePositive: (() => {
    const v = subset.map((r) => r.fixedHeldR).filter((x) => x != null);
    return v.length ? (v.filter((x) => x > 0).length / v.length) * 100 : null;
  })(),
  fixedBeatsFreeSharePct: (() => {
    const v = subset.map((r) => r.fixedBeatsFree).filter((x) => x != null);
    return v.length ? (v.filter(Boolean).length / v.length) * 100 : null;
  })(),
} : null;

/** Whether the widths the engine chose are the ones the universe-wide test likes. */
const widthCounts = {};
for (const r of rows) widthCounts[r.stopAtr] = (widthCounts[r.stopAtr] ?? 0) + 1;

const byWidth = Object.fromEntries([1, 1.5, 2, 3].map((a) =>
  [a, summary(rows.filter((r) => r.stopAtr === a))]));

const out = {
  measuredAt: new Date().toISOString(),
  halfDays: HALF,
  cellsSearchedPerPair: rows.length ? 64 : 0,
  rows: rows.length,
  overall: summary(rows),
  long: summary(rows.filter((r) => r.direction === "long")),
  short: summary(rows.filter((r) => r.direction === "short")),
  chosenWidthCounts: widthCounts,
  byChosenWidth: byWidth,
  detail: rows,
};
writeFileSync("research/selection-bias.json", `${JSON.stringify(out, null, 2)}\n`);

const line = (name, s) => s && console.log(
  `${name.padEnd(9)} chosen ${s.medianChosenR.toFixed(3).padStart(7)}`
  + `   held ${s.medianHeldR.toFixed(3).padStart(7)}`
  + `   typical ${s.medianTypicalR.toFixed(3).padStart(7)}`
  + `   ceiling ${s.medianCeilingR.toFixed(3).padStart(7)}`
  + `   beat typical ${s.shareBeatingTypical.toFixed(0)}%`
  + `   still +ve ${s.shareStillPositive.toFixed(0)}%`,
);

const fixedLine = (name, s) => s && console.log(
  `${name.padEnd(9)} fixed 1.5 ATR: chosen ${s.fixedMedianChosenR.toFixed(3).padStart(7)}`
  + `   held ${s.fixedMedianHeldR.toFixed(3).padStart(7)}`
  + `   still +ve ${s.fixedSharePositive.toFixed(0)}%`
  + `   beats the free search ${s.fixedBeatsFreeSharePct.toFixed(0)}% of the time`,
);

console.log(`${rows.length} pair-directions · chosen on ${HALF} days, scored on the next ${HALF}\n`);
line("overall", out.overall);
line("long", out.long);
line("short", out.short);
console.log("");
fixedLine("overall", out.overall);
fixedLine("long", out.long);
fixedLine("short", out.short);
console.log("\nby the stop width the engine chose:");
console.log("width    n   chosen     held  typical");
for (const [a, s] of Object.entries(byWidth)) {
  if (!s) continue;
  console.log(`${(a + " ATR").padEnd(8)}${String(s.pairs).padStart(3)}`
    + s.medianChosenR.toFixed(3).padStart(9)
    + s.medianHeldR.toFixed(3).padStart(9)
    + s.medianTypicalR.toFixed(3).padStart(9));
}
