/**
 * Testing this desk's most-repeated claim, at last.
 *
 * "A stop under one daily ATR is inside the noise — you are paying to be
 * stopped out by an ordinary Tuesday." I have written some version of that
 * sentence about six times: about an ICP 4H plan, about XLM, about three BNB
 * setups, about every ladder a reader has sent in. Each time it was measured
 * on that one asset.
 *
 * A claim made six times on six single names is not a law. It is a habit. So
 * this runs it across the whole scanned universe and asks the question
 * properly: as the stop widens from a fraction of a daily range to several,
 * what actually happens to the stop-out rate and to expectancy?
 *
 * The reward ratio is held fixed so the stop is the only thing changing. Both
 * directions are scored, because a rule that only holds for longs is a fact
 * about the market's drift rather than about stop placement.
 *
 * If the claim is wrong, or holds only weakly, this file will say so.
 */

import { readFileSync, writeFileSync } from "node:fs";
import { analyzeAsset, atr, fetchKlines } from "../src/analysis.mjs";
import { liveUniverse } from "../src/universe.mjs";
import { walk } from "../src/signals.mjs";

const PAIRS = Number(process.env.PAIRS ?? 100);
const STOP_ATRS = [0.5, 0.75, 1, 1.5, 2, 3, 4];
const RR = 2;
const HORIZONS = [10, 30];
const FEE_PCT = 0.2;

/**
 * REUSE re-scores the claims against the measurement already on disk rather
 * than refetching sixty-one pairs. It exists so a claim can be restated and
 * re-checked against the same numbers the post will quote — refetching would
 * change the data underneath the correction and prove nothing.
 */
const REUSE = process.env.REUSE === "1";

const retry = async (fn, n = 6) => {
  let last;
  for (let i = 0; i < n; i++) {
    try { return await fn(); } catch (e) { last = e; await new Promise((r) => setTimeout(r, 1200 * (i + 1))); }
  }
  throw last;
};

const prior = REUSE ? JSON.parse(readFileSync("research/stop-law.json", "utf8")) : null;
const { symbols } = REUSE ? { symbols: [] } : await retry(() => liveUniverse({ limit: PAIRS }));

const series = [];
for (const [i, symbol] of symbols.entries()) {
  process.stderr.write(`\rloading ${i + 1}/${symbols.length} ${symbol.padEnd(14)}`);
  try {
    const candles = await retry(() => fetchKlines(symbol, { interval: "1d", limit: 1000 }));
    if (candles.length < 400) continue;
    const analysis = await retry(() => analyzeAsset(symbol, { candles }));
    const atrPct = (atr(candles, 14) / analysis.price) * 100;
    if (!Number.isFinite(atrPct) || atrPct <= 0) continue;
    series.push({ symbol, candles, atrPct });
  } catch { /* absent rather than guessed */ }
}
process.stderr.write("\r");

const median = (xs) => {
  if (!xs.length) return null;
  const s = [...xs].sort((a, b) => a - b);
  return s.length % 2 ? s[s.length >> 1] : (s[s.length / 2 - 1] + s[s.length / 2]) / 2;
};

const rows = prior?.rows ?? [];
for (const horizon of REUSE ? [] : HORIZONS) {
  for (const direction of ["long", "short"]) {
    for (const stopAtr of STOP_ATRS) {
      const stoppedRates = [], hitRates = [], expectancies = [], nets = [];
      let pairsUsed = 0;

      for (const s of series) {
        const stopPct = stopAtr * s.atrPct;
        // A stop that would sit below zero cannot be reached and would score
        // as a free trade; the engine rejects those and so does this.
        if (stopPct >= 60) continue;
        const r = walk(s.candles.slice(-540), {
          direction, stopPct, targetPct: stopPct * RR, horizon,
        });
        if (!r) continue;
        pairsUsed += 1;
        stoppedRates.push(r.stoppedPct);
        hitRates.push(r.hitPct);
        expectancies.push(r.expectancyR);
        nets.push(r.expectancyR - FEE_PCT / stopPct);
      }

      rows.push({
        horizon, direction, stopAtr,
        pairsUsed,
        medianStoppedPct: median(stoppedRates),
        medianHitPct: median(hitRates),
        medianExpectancyR: median(expectancies),
        medianNetR: median(nets),
        pairsPositive: expectancies.filter((v) => v > 0).length,
        pairsPositiveNet: nets.filter((v) => v > 0).length,
      });
    }
  }
}

/**
 * The claim, stated as something that can fail — and two of them did.
 *
 * The first draft of this block asserted that a half-ATR stop is the worst
 * choice everywhere. It is not: in one panel of four, longs held a month, a
 * three-ATR stop scores worse than the tightest one. The claims below are
 * written to the data rather than to the rhetoric, which is the whole point
 * of running the test.
 */
const at = (h, d, a) => rows.find((r) => r.horizon === h && r.direction === d && r.stopAtr === a);
const worstStop = (h, d) => rows.filter((r) => r.horizon === h && r.direction === d)
  .reduce((a, b) => (a.medianExpectancyR < b.medianExpectancyR ? a : b)).stopAtr;
const bestStop = (h, d) => rows.filter((r) => r.horizon === h && r.direction === d)
  .reduce((a, b) => (a.medianExpectancyR > b.medianExpectancyR ? a : b)).stopAtr;
const panels = HORIZONS.flatMap((h) => ["long", "short"].map((d) => [h, d]));

const claims = {
  // The half of the claim that survived — but in three panels out of four,
  // not in all four.
  "a half-ATR stop is the worst choice in three panels of four":
    panels.filter(([h, d]) => worstStop(h, d) === 0.5).length === 3,
  "the exception is longs held a month, where a three-ATR stop is worse":
    worstStop(30, "long") === 3,
  // The half that did not survive: widening past roughly 1.5 ATR stops
  // helping and starts hurting, except for shorts held a month.
  "expectancy peaks at 1.5 ATR in three panels of four":
    panels.filter(([h, d]) => bestStop(h, d) === 1.5).length === 3,
  "shorts held a month are the exception — they keep improving to four":
    bestStop(30, "short") === 4,
  "wider is not simply better — it turns at 1.5 ATR for longs":
    at(10, "long", 3).medianExpectancyR < at(10, "long", 1.5).medianExpectancyR
    && at(30, "long", 3).medianExpectancyR < at(30, "long", 1.5).medianExpectancyR,
  "a wider stop barely helps over thirty days": at(30, "long", 0.5).medianStoppedPct
    - at(30, "long", 2).medianStoppedPct < 15,
  "while over ten days it helps a great deal": at(10, "long", 0.5).medianStoppedPct
    - at(10, "long", 2).medianStoppedPct > 15,
  "longs lose at every stop width": HORIZONS.every((h) =>
    STOP_ATRS.every((a) => at(h, "long", a).medianExpectancyR < 0)),
  "shorts pay from three quarters of an ATR upward": HORIZONS.every((h) =>
    STOP_ATRS.filter((a) => a >= 0.75).every((a) => at(h, "short", a).medianExpectancyR > 0)),
  "but only above one ATR once fees are paid": HORIZONS.every((h) =>
    at(h, "short", 0.75).medianNetR < 0 && at(h, "short", 1).medianNetR > 0),
  "the effect holds in both directions, not just longs": HORIZONS.every((h) =>
    at(h, "short", 0.5).medianStoppedPct > at(h, "short", 2).medianStoppedPct),
  "a half-ATR stop is stopped out more often than not": HORIZONS.every((h) =>
    ["long", "short"].every((d) => at(h, d, 0.5).medianStoppedPct > 50)),
  "fees matter more at tight stops": at(30, "long", 0.5).medianExpectancyR - at(30, "long", 0.5).medianNetR
    > at(30, "long", 3).medianExpectancyR - at(30, "long", 3).medianNetR,
  // Fees are charged in the same currency as the stop, so paying them shifts
  // the best width outward. Three panels move; the fourth is already at 1.5.
  "paying fees pushes the best stop wider": panels.filter(([h, d]) => {
    const best = rows.filter((r) => r.horizon === h && r.direction === d)
      .reduce((a, b) => (a.medianNetR > b.medianNetR ? a : b)).stopAtr;
    return best > bestStop(h, d);
  }).length >= 2,
};

const out = {
  measuredAt: prior?.measuredAt ?? new Date().toISOString(),
  pairs: prior?.pairs ?? series.length,
  rewardRatio: RR,
  historyDays: 540,
  feePct: FEE_PCT,
  claims,
  rows,
};
writeFileSync("research/stop-law.json", `${JSON.stringify(out, null, 2)}\n`);

console.log(`${out.pairs} pairs · reward ratio ${RR} · last 540 days\n`);
for (const horizon of HORIZONS) {
  for (const direction of ["long", "short"]) {
    console.log(`${direction} · ${horizon}-day horizon`);
    console.log("  stop      stopped%    hit%    E med     E net    pairs +ve");
    for (const a of STOP_ATRS) {
      const r = at(horizon, direction, a);
      console.log(
        `  ${String(a + " ATR").padEnd(9)}`
        + r.medianStoppedPct.toFixed(1).padStart(8)
        + r.medianHitPct.toFixed(1).padStart(9)
        + r.medianExpectancyR.toFixed(3).padStart(10)
        + r.medianNetR.toFixed(3).padStart(10)
        + `${r.pairsPositive}/${r.pairsUsed}`.padStart(12),
      );
    }
    console.log("");
  }
}
console.log("claims:");
for (const [k, v] of Object.entries(claims)) console.log(`  ${v ? "OK  " : "NO  "} ${k}`);
