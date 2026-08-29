/**
 * A reader's ICP breakout plan, checked three ways.
 *
 * The plan is specific enough to test, which is rare and worth saying: break
 * and hold above 2.48-2.50, enter 2.50-2.53, stop below 2.38-2.40, take 40-50%
 * off at 2.65-2.70, run the rest to 2.85-2.90. A fallback long at 2.28-2.30
 * with a stop under 2.25. Claimed reward-to-risk of 1:2.5 to 1:3.
 *
 * Three things can be checked, and they are different kinds of check.
 *
 *   The arithmetic. Reward-to-risk is not an opinion — it is division. The
 *   levels are given, so the ratio the plan actually offers can be computed
 *   exactly, including the effect of the partial exit the plan itself
 *   prescribes. Taking money off at the near target lowers the blended ratio,
 *   and a plan that quotes the far target's ratio while instructing a partial
 *   at the near one is quoting a number it does not run.
 *
 *   The geometry against the instrument. A stop is only a stop if it sits
 *   outside the noise. The fallback entry risks 1.7% on an asset whose average
 *   true range is several times that, so the question is not whether the level
 *   is meaningful but whether a position can survive a normal day at it. That
 *   is measured, not argued: how often does a random entry on this pair take
 *   a 1.7% adverse excursion before going anywhere.
 *
 *   The rule, walked forward. The absolute levels only exist today, so testing
 *   the *method* means expressing it as a rule — a close above the highest
 *   high of the base, entered at the next open — and running it across ICP's
 *   whole history at the geometry the plan specifies, against a matched
 *   control of random entries in the same months at the same geometry.
 *
 * The management is modelled as written rather than as convenient: partial at
 * the first target, stop to breakeven afterwards, path-aware first touch so a
 * bar reaching both levels is charged to the stop. Modelling the partial and
 * then ignoring the breakeven stop would flatter the runner; ignoring the
 * partial would flatter the whole thing.
 *
 * Writes research/icp-strategy.json.
 */

import { writeFileSync } from "node:fs";
import { fetchKlines } from "../src/analysis.mjs";
import { atr } from "../src/analysis.mjs";

const SYMBOL = "ICPUSDT";
const DAY_MS = 86_400_000;

const retry = async (fn, n = 5) => {
  let last;
  for (let i = 0; i < n; i++) {
    try { return await fn(); } catch (e) { last = e; await new Promise((r) => setTimeout(r, 800 * (i + 1))); }
  }
  throw last;
};

const mean = (xs) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null);
const median = (xs) => {
  if (!xs.length) return null;
  const s = [...xs].sort((a, b) => a - b);
  const m = s.length >> 1;
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};
const stdev = (xs) => {
  if (xs.length < 2) return null;
  const m = mean(xs);
  return Math.sqrt(xs.reduce((a, x) => a + (x - m) ** 2, 0) / (xs.length - 1));
};
const welch = (a, b) => {
  if (a.length < 2 || b.length < 2) return null;
  const va = stdev(a) ** 2 / a.length, vb = stdev(b) ** 2 / b.length;
  return (mean(a) - mean(b)) / Math.sqrt(va + vb);
};

/* ------------------------------------------------------------------ *
 * The plan, written down before anything is fetched
 * ------------------------------------------------------------------ */

const PLAN = {
  breakoutTrigger: { lowUsd: 2.48, highUsd: 2.50 },
  entry: { lowUsd: 2.50, highUsd: 2.53 },
  stop: { lowUsd: 2.38, highUsd: 2.40 },
  tp1: { lowUsd: 2.65, highUsd: 2.70, takePct: 45 },
  tp2: { lowUsd: 2.85, highUsd: 2.90 },
  fallbackEntry: { lowUsd: 2.28, highUsd: 2.30 },
  fallbackStopUsd: 2.25,
  invalidationUsd: 2.28,
  baseInvalidationUsd: 2.00,
  claimedRR: { low: 2.5, high: 3 },
};

const mid = (b) => (b.lowUsd + b.highUsd) / 2;

/* ------------------------------------------------------------------ *
 * 1. The arithmetic
 * ------------------------------------------------------------------ */

const entry = mid(PLAN.entry), stopPrice = mid(PLAN.stop);
const tp1 = mid(PLAN.tp1), tp2 = mid(PLAN.tp2);
const riskUsd = entry - stopPrice;
const take = PLAN.tp1.takePct / 100;

const arithmetic = {
  entryUsd: entry,
  stopUsd: stopPrice,
  riskUsd,
  stopPct: (riskUsd / entry) * 100,
  tp1Usd: tp1,
  tp2Usd: tp2,
  tp1R: (tp1 - entry) / riskUsd,
  tp2R: (tp2 - entry) / riskUsd,
  /**
   * What the plan pays if everything it asks for happens.
   *
   * Partial off at the first target, remainder all the way to the second. No
   * stop is ever hit, nothing is left unresolved. This is the ceiling, and it
   * is the number the claimed ratio should be compared against — not the far
   * target's ratio, which the plan's own partial exit means you never collect
   * in full.
   */
  blendedBestCaseR: take * ((tp1 - entry) / riskUsd) + (1 - take) * ((tp2 - entry) / riskUsd),
  claimedLowR: PLAN.claimedRR.low,
  claimedHighR: PLAN.claimedRR.high,
  fallbackEntryUsd: mid(PLAN.fallbackEntry),
  fallbackStopPct: ((mid(PLAN.fallbackEntry) - PLAN.fallbackStopUsd) / mid(PLAN.fallbackEntry)) * 100,
};
arithmetic.blendedClearsClaim = arithmetic.blendedBestCaseR >= PLAN.claimedRR.low;

/* ------------------------------------------------------------------ *
 * 2. The instrument
 * ------------------------------------------------------------------ */

const series = async (symbol, interval, since) => {
  const out = [];
  let cursor = since;
  while (cursor < Date.now()) {
    const rows = await retry(() => fetchKlines(symbol, { interval, limit: 1000, startTime: cursor }));
    if (!rows.length) break;
    out.push(...rows);
    const step = interval === "1d" ? DAY_MS : 3_600_000;
    const next = rows.at(-1).openTime + step;
    if (next <= cursor) break;
    cursor = next;
  }
  const seen = new Map();
  for (const r of out) seen.set(r.openTime, r);
  return [...seen.values()].sort((a, b) => a.openTime - b.openTime);
};

const daily = await series(SYMBOL, "1d", Date.UTC(2021, 0, 1));
const spot = daily.at(-1).close;
const atrPct = atr(daily.slice(-15)) / spot * 100;

/**
 * How often a stop of a given size is inside a single day's normal movement.
 *
 * Every day is asked the same question: from that day's open, did price trade
 * this far against a long before the day was out? A stop that most ordinary
 * days would have taken is not protecting a thesis, it is buying a lottery
 * ticket on the entry candle.
 */
const adverseWithinDay = (pct) => {
  const hits = daily.filter((c) => ((c.open - c.low) / c.open) * 100 >= pct).length;
  return (hits / daily.length) * 100;
};

const instrument = {
  spotUsd: spot,
  atrPct,
  dailyBars: daily.length,
  firstBar: new Date(daily[0].openTime).toISOString().slice(0, 10),
  planStopPct: arithmetic.stopPct,
  fallbackStopPct: arithmetic.fallbackStopPct,
  daysTakingPlanStopFromOpenPct: adverseWithinDay(arithmetic.stopPct),
  daysTakingFallbackStopFromOpenPct: adverseWithinDay(arithmetic.fallbackStopPct),
  medianDailyRangePct: median(daily.map((c) => ((c.high - c.low) / c.open) * 100)),
};

/* ------------------------------------------------------------------ *
 * 3. The rule, walked forward
 * ------------------------------------------------------------------ */

const BASE_DAYS = 20;
const HORIZON = 30;
const FEE_PCT = 0.2;

/**
 * One trade, managed exactly as the plan describes.
 *
 * Entered at the next open, because a rule that enters on the close of the bar
 * that triggered it is reading a price it could not have acted on. Stop before
 * target on any bar reaching both. Partial at the first target, stop moved to
 * breakeven for the remainder, and anything still open at the horizon marked
 * to market — an unresolved trade is a result, not an exclusion.
 */
const runTrade = (bars, i, geom) => {
  const e = bars[i + 1]?.open;
  if (!e) return null;
  const stop = e * (1 - geom.stopPct / 100);
  const t1 = e * (1 + geom.tp1Pct / 100);
  const t2 = e * (1 + geom.tp2Pct / 100);
  const riskPerUnit = e - stop;

  let banked = 0, remaining = 1, stopLevel = stop, tookFirst = false;

  for (let j = i + 2; j <= i + 1 + HORIZON && j < bars.length; j++) {
    const c = bars[j];
    if (c.low <= stopLevel) {
      banked += remaining * ((stopLevel - e) / riskPerUnit);
      remaining = 0;
      break;
    }
    if (!tookFirst && c.high >= t1) {
      banked += take * ((t1 - e) / riskPerUnit);
      remaining -= take;
      tookFirst = true;
      // The plan says move the stop up once the first target pays.
      stopLevel = e;
    }
    if (tookFirst && c.high >= t2) {
      banked += remaining * ((t2 - e) / riskPerUnit);
      remaining = 0;
      break;
    }
  }
  if (remaining > 0) {
    const last = bars[Math.min(i + 1 + HORIZON, bars.length - 1)];
    banked += remaining * ((last.close - e) / riskPerUnit);
  }
  // Round turn on the full position, expressed in the same R units.
  const feeR = (FEE_PCT / geom.stopPct);
  return banked - feeR;
};

const geom = {
  stopPct: arithmetic.stopPct,
  tp1Pct: ((tp1 - entry) / entry) * 100,
  tp2Pct: ((tp2 - entry) / entry) * 100,
};

const volumeAverage = (i) => mean(daily.slice(Math.max(0, i - BASE_DAYS), i).map((c) => c.volume));

/** Every base breakout in ICP's history, at the plan's geometry. */
const signals = [];
for (let i = BASE_DAYS; i < daily.length - HORIZON - 2; i++) {
  const base = daily.slice(i - BASE_DAYS, i);
  const baseHigh = Math.max(...base.map((c) => c.high));
  if (daily[i].close <= baseHigh) continue;
  const avgVol = volumeAverage(i);
  const r = runTrade(daily, i, geom);
  if (r == null) continue;
  signals.push({
    date: new Date(daily[i].openTime).toISOString().slice(0, 10),
    resultR: r,
    volumeRatio: avgVol ? daily[i].volume / avgVol : null,
  });
}

/**
 * The control: the same geometry, the same management, entered at random.
 *
 * Matched by calendar month so a breakout in a bull quarter is not compared
 * against a random day from a bear one. Without that the control measures the
 * market's mood, not the rule.
 */
const monthOf = (d) => d.slice(0, 7);
const byMonth = new Map();
for (let i = BASE_DAYS; i < daily.length - HORIZON - 2; i++) {
  const m = monthOf(new Date(daily[i].openTime).toISOString().slice(0, 10));
  if (!byMonth.has(m)) byMonth.set(m, []);
  byMonth.get(m).push(i);
}

/** Deterministic, so a re-run reproduces the same control. */
let seed = 20260821;
const rand = () => {
  seed = (seed * 1103515245 + 12345) & 0x7fffffff;
  return seed / 0x7fffffff;
};

const controls = [];
let unmatched = 0;
for (const s of signals) {
  const pool = byMonth.get(monthOf(s.date)) ?? [];
  if (!pool.length) { unmatched++; continue; }
  for (let k = 0; k < 5; k++) {
    const i = pool[Math.floor(rand() * pool.length)];
    const r = runTrade(daily, i, geom);
    if (r != null) controls.push(r);
  }
}

const summarise = (rs) => ({
  n: rs.length,
  meanR: mean(rs),
  medianR: median(rs),
  winSharePct: (rs.filter((x) => x > 0).length / rs.length) * 100,
  worstR: Math.min(...rs),
  bestR: Math.max(...rs),
});

const all = signals.map((s) => s.resultR);
const withVolume = signals.filter((s) => s.volumeRatio != null && s.volumeRatio > 1).map((s) => s.resultR);
const withoutVolume = signals.filter((s) => s.volumeRatio != null && s.volumeRatio <= 1).map((s) => s.resultR);
const controlR = controls;

const backtest = {
  baseDays: BASE_DAYS,
  horizonDays: HORIZON,
  feePct: FEE_PCT,
  geometry: geom,
  takeAtFirstTargetPct: PLAN.tp1.takePct,
  unmatchedSignals: unmatched,
  all: summarise(all),
  withVolumeConfirmation: withVolume.length ? summarise(withVolume) : null,
  withoutVolumeConfirmation: withoutVolume.length ? summarise(withoutVolume) : null,
  control: summarise(controlR),
  welchTVsControl: welch(all, controlR),
  welchTVolumeVsNot: withVolume.length > 1 && withoutVolume.length > 1 ? welch(withVolume, withoutVolume) : null,
  /**
   * Independent episodes, not tickets.
   *
   * Signals inside one 30-day horizon overlap, so counting them as separate
   * trials is the error that once turned a t of 1.46 into 5.69 on this desk.
   */
  effectiveN: all.length / HORIZON,
};

/**
 * The same signals at this desk's own standing geometry, for comparison.
 *
 * Criticising a plan's stop without showing what a defensible one costs is
 * half an answer. The house rule here is fixed and published: stop at 1.5 ATR,
 * target at twice the risk, no partial. It is not tuned to ICP — research on
 * per-pair optimisation found about a tenth of the improvement survives out of
 * sample — which is exactly why it is the fair yardstick.
 *
 * The point is not that this version wins. It is that its stop sits outside a
 * normal day for this instrument, so the trade is decided by the thesis rather
 * than by the entry candle.
 */
const HOUSE = {
  stopPct: 1.5 * atrPct,
  tp1Pct: 1.5 * atrPct * 2,
  tp2Pct: 1.5 * atrPct * 2,
};
// Both targets sit at the same price in the house rule, so the partial and the
// remainder close together — which is the same thing as having no partial,
// without a second code path that could drift from the first.
const houseTrade = (bars, i) => runTrade(bars, i, HOUSE);
const houseSignals = [];
for (let i = BASE_DAYS; i < daily.length - HORIZON - 2; i++) {
  const base = daily.slice(i - BASE_DAYS, i);
  if (daily[i].close <= Math.max(...base.map((c) => c.high))) continue;
  const r = houseTrade(daily, i);
  if (r != null) houseSignals.push(r);
}
const houseAlternative = {
  stopPct: HOUSE.stopPct,
  targetPct: HOUSE.tp2Pct,
  atrMultiple: 1.5,
  rewardRatio: 2,
  daysTakingThisStopFromOpenPct: adverseWithinDay(HOUSE.stopPct),
  ...summarise(houseSignals),
};

const out = {
  measuredAt: new Date().toISOString(),
  symbol: SYMBOL,
  source: "Binance spot daily klines",
  plan: PLAN,
  arithmetic,
  instrument,
  backtest,
  houseAlternative,
};
writeFileSync("research/icp-strategy.json", `${JSON.stringify(out, null, 2)}\n`);

/* ---------------------------------------------------------------- */

const f = (v, dp = 2) => (v == null ? "—" : (v >= 0 ? "+" : "") + v.toFixed(dp));

console.log(`${SYMBOL} — a reader's plan, checked\n`);
console.log(`spot $${spot.toFixed(3)}   ATR ${atrPct.toFixed(2)}%   ${daily.length} daily bars since ${instrument.firstBar}\n`);

console.log("1. the arithmetic");
console.log(`   entry $${entry.toFixed(3)}  stop $${stopPrice.toFixed(3)}  risk ${arithmetic.stopPct.toFixed(2)}%`);
console.log(`   TP1 $${tp1.toFixed(3)} = ${arithmetic.tp1R.toFixed(2)}R`);
console.log(`   TP2 $${tp2.toFixed(3)} = ${arithmetic.tp2R.toFixed(2)}R`);
console.log(`   taking ${PLAN.tp1.takePct}% off at TP1, best case blended = ${arithmetic.blendedBestCaseR.toFixed(2)}R`);
console.log(`   claimed ${PLAN.claimedRR.low}-${PLAN.claimedRR.high}R -> ${arithmetic.blendedClearsClaim ? "clears it" : "SHORT OF IT"}\n`);

console.log("2. the geometry against the instrument");
console.log(`   plan stop ${arithmetic.stopPct.toFixed(2)}%: ${instrument.daysTakingPlanStopFromOpenPct.toFixed(1)}% of days move that far against a long from the open`);
console.log(`   fallback stop ${arithmetic.fallbackStopPct.toFixed(2)}%: ${instrument.daysTakingFallbackStopFromOpenPct.toFixed(1)}% of days do`);
console.log(`   median daily range ${instrument.medianDailyRangePct.toFixed(2)}%\n`);

console.log(`3. the rule, walked forward (${BASE_DAYS}d base breakout, plan geometry, ${HORIZON}d horizon)`);
const rows = [
  ["breakouts", backtest.all],
  ["  volume up", backtest.withVolumeConfirmation],
  ["  volume not", backtest.withoutVolumeConfirmation],
  ["matched control", backtest.control],
];
console.log(`   ${"".padEnd(17)}${"n".padStart(6)}${"mean".padStart(9)}${"median".padStart(9)}${"win%".padStart(8)}${"worst".padStart(9)}`);
for (const [label, s] of rows) {
  if (!s) continue;
  console.log(`   ${label.padEnd(17)}${String(s.n).padStart(6)}${f(s.meanR).padStart(9)}${f(s.medianR).padStart(9)}`
    + `${s.winSharePct.toFixed(0)}%`.padStart(8) + f(s.worstR).padStart(9));
}
console.log(`\n   Welch t vs control: ${f(backtest.welchTVsControl)}`);
if (backtest.welchTVolumeVsNot != null) console.log(`   Welch t, volume filter on vs off: ${f(backtest.welchTVolumeVsNot)}`);
console.log(`   independent episodes: ${backtest.effectiveN.toFixed(1)}`);

console.log(`\n4. the same breakouts at a stop that clears a normal day`);
console.log(`   stop ${houseAlternative.stopPct.toFixed(2)}% (1.5 ATR), target ${houseAlternative.targetPct.toFixed(2)}%, no partial`);
console.log(`   ${houseAlternative.daysTakingThisStopFromOpenPct.toFixed(1)}% of days move that far against a long from the open`);
console.log(`   n ${houseAlternative.n}   mean ${f(houseAlternative.meanR)}   median ${f(houseAlternative.medianR)}   win ${houseAlternative.winSharePct.toFixed(0)}%`);
