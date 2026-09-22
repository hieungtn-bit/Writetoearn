/**
 * Walking this desk's own algorithm forward through history.
 *
 * Everything published this week tested one *component*: the stop width, the
 * overhead metric, the per-pair optimiser, the drawdown premise. None of it
 * tested the thing those components add up to — the pipeline that now decides
 * what appears in the daily column.
 *
 * So this runs the whole pipeline as it currently stands, at dates in the past,
 * using only data that existed on those dates:
 *
 *   1. score every pair with signalFor over candles up to that day
 *   2. keep rows that are liquid, carry 12+ independent episodes, and have all
 *      five lookback windows agreeing
 *   3. apply the fixed geometry — 1.5 ATR stop, 2:1 target, 30 days — and keep
 *      only rows whose full and recent histories agree in sign and pay after fees
 *   4. open those positions and score what actually happened next
 *
 * Nothing at step 4 is visible at steps 1 to 3. That is the whole point: every
 * number the filters see is computed from `candles.slice(0, t + 1)`, so a
 * lookahead bug would have to be deliberate.
 *
 * The comparisons are the part that can end this strategy, and they are chosen
 * to be the ones most likely to do so:
 *
 *   always short   the same geometry on every liquid pair, no selection at all
 *   always long    the mirror, for symmetry
 *   board only     the direction the engine picks, with the filters removed
 *   coin flip      a seeded random direction, the null
 *
 * If "always short" matches the algorithm, then everything above step 3 is
 * decoration and the honest conclusion is that this desk has built an elaborate
 * way of saying "be short". That is a real possible outcome and the file is
 * written so it cannot be hidden.
 */

import { writeFileSync } from "node:fs";
import { atr, fetchKlines } from "../src/analysis.mjs";
import { liveUniverse } from "../src/universe.mjs";
import { signalFor, walk } from "../src/signals.mjs";

const PAIRS = Number(process.env.PAIRS ?? 60);
/** Days between rebalances. One horizon apart, so positions do not overlap. */
const STEP = Number(process.env.STEP ?? 30);
/** How far back the walk starts, in days before the last candle. */
const LOOKBACK = Number(process.env.LOOKBACK ?? 540);
/** Candles a pair must have before the engine is allowed an opinion. */
const MIN_HISTORY = 260;

const STOP_ATR = 1.5;
const RR = 2;
const HORIZON = 30;
const FEE_PCT = 0.2;
const MIN_EFFECTIVE_N = 12;
const MIN_TURNOVER_USD = 2e6;

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

/** Deterministic coin flip, so the null is reproducible. */
let seed = 20260815;
const flip = () => {
  seed = (seed * 1103515245 + 12345) % 2147483648;
  return seed / 2147483648 < 0.5 ? "long" : "short";
};

const { symbols } = await retry(() => liveUniverse({ limit: PAIRS }));

const series = [];
for (const [i, symbol] of symbols.entries()) {
  process.stderr.write(`\rloading ${i + 1}/${symbols.length} ${symbol.padEnd(14)}`);
  try {
    const daily = await retry(() => fetchKlines(symbol, { interval: "1d", limit: 1000 }));
    if (daily.length < MIN_HISTORY + LOOKBACK / 2) continue;
    series.push({ symbol, daily });
  } catch { /* absent rather than guessed */ }
}
process.stderr.write("\r");

/**
 * One position, opened at a close and walked forward bar by bar.
 *
 * A bar reaching both levels is charged to the stop, and a position that
 * resolves neither way is marked at the horizon — the same rule every study on
 * this desk uses, so the live strategy is not scored more kindly.
 */
const openAndScore = (daily, t, direction, stopPct) => {
  if (t + HORIZON >= daily.length) return null;
  const entry = daily[t].close;
  const long = direction === "long";
  const stop = long ? entry * (1 - stopPct / 100) : entry * (1 + stopPct / 100);
  const target = long ? entry * (1 + stopPct * RR / 100) : entry * (1 - stopPct * RR / 100);
  for (let j = t + 1; j <= t + HORIZON; j++) {
    const c = daily[j];
    if (long ? c.low <= stop : c.high >= stop) return { resultR: -1, outcome: "stopped" };
    if (long ? c.high >= target : c.low <= target) return { resultR: RR, outcome: "target" };
  }
  const move = (daily[t + HORIZON].close / entry - 1) * 100;
  return { resultR: (long ? move : -move) / stopPct, outcome: "open" };
};

const strategies = {
  algorithm: [], boardOnly: [], alwaysShort: [], alwaysLong: [], coinFlip: [],
};
const dates = [];
let considered = 0, passedSample = 0, passedAgreement = 0, passedGeometry = 0;

/**
 * Rebalances are dates, not array positions.
 *
 * The first version of this file walked a single index across every series.
 * Pairs have different amounts of history, so index 400 is a different calendar
 * day on a pair listed in 2021 than on one listed last year — the walk was
 * comparing decisions taken years apart and calling them one rebalance. It
 * printed dates two years stale, which is how it was caught.
 *
 * So each pair gets a date index once, and every rebalance looks itself up.
 */
const dayOf = (c) => new Date(c.openTime).toISOString().slice(0, 10);
for (const s of series) {
  s.index = new Map(s.daily.map((c, i) => [dayOf(c), i]));
}
// The calendar comes from the longest series, so it spans everything available.
const reference = series.reduce((a, b) => (a.daily.length >= b.daily.length ? a : b));
const calendar = reference.daily.map(dayOf);
const lastIdx = calendar.length - 1;

for (let k = lastIdx - LOOKBACK; k <= lastIdx - HORIZON; k += STEP) {
  if (k < 0) continue;
  const dateLabel = calendar[k];
  const dayRows = { algorithm: [], boardOnly: [], alwaysShort: [], alwaysLong: [], coinFlip: [] };

  for (const s of series) {
    const t = s.index.get(dateLabel);
    if (t == null) continue;
    if (t < MIN_HISTORY || t + HORIZON >= s.daily.length) continue;
    // Everything the decision sees stops at t. Nothing after it is readable.
    const asOf = s.daily.slice(0, t + 1);
    const price = asOf.at(-1).close;

    const atrPct = (atr(asOf, 14) / price) * 100;
    if (!Number.isFinite(atrPct) || atrPct <= 0) continue;
    const stopPct = STOP_ATR * atrPct;
    if (!(stopPct > 0) || stopPct >= 60) continue;

    // Liquidity as it was, from the trailing month of that moment.
    const turnoverUsd = asOf.slice(-30).reduce((a, c) => a + c.quoteVolume, 0) / 30;
    if (!(turnoverUsd >= MIN_TURNOVER_USD)) continue;
    considered += 1;

    // The unconditional comparisons, which need no signal at all.
    for (const [key, dir] of [["alwaysShort", "short"], ["alwaysLong", "long"], ["coinFlip", flip()]]) {
      const r = openAndScore(s.daily, t, dir, stopPct);
      if (r) dayRows[key].push({ symbol: s.symbol, ...r, feeR: FEE_PCT / stopPct });
    }

    let signal;
    try {
      signal = signalFor({ symbol: s.symbol, candles: asOf, atrPct, price, turnoverUsd });
    } catch { continue; }
    if (!signal || signal.bias === "WAIT" || !signal.plan) continue;
    const direction = signal.bias === "LONG" ? "long" : "short";

    const boardRow = openAndScore(s.daily, t, direction, stopPct);
    if (boardRow) dayRows.boardOnly.push({ symbol: s.symbol, ...boardRow, feeR: FEE_PCT / stopPct });

    // Filter 1: the sample the engine itself calls adequate.
    if (!signal.confidence || signal.confidence.effectiveN < MIN_EFFECTIVE_N) continue;
    passedSample += 1;
    // Filter 2: every lookback window agreeing.
    if (!(signal.agreement?.windows === 5 && signal.agreement.agreeing === 5)) continue;
    passedAgreement += 1;

    // Filter 3: the fixed geometry, scored only on history available at t.
    const full = walk(asOf, { direction, stopPct, targetPct: stopPct * RR, horizon: HORIZON });
    const recent = walk(asOf.slice(-270), { direction, stopPct, targetPct: stopPct * RR, horizon: HORIZON });
    if (!full || !recent) continue;
    const feeR = FEE_PCT / stopPct;
    if (!(full.expectancyR - feeR > 0)) continue;
    if (Math.sign(full.expectancyR) !== Math.sign(recent.expectancyR)) continue;
    passedGeometry += 1;

    const r = openAndScore(s.daily, t, direction, stopPct);
    if (r) dayRows.algorithm.push({ symbol: s.symbol, direction, ...r, feeR });
  }

  if (dayRows.alwaysShort.length) {
    dates.push({
      date: dateLabel,
      taken: dayRows.algorithm.length,
      takenSymbols: dayRows.algorithm.map((x) => `${x.symbol}:${x.direction}`),
      medianResultR: median(dayRows.algorithm.map((x) => x.resultR - x.feeR)),
    });
    // Tagged with the rebalance so significance can be computed on months
    // rather than on tickets. See the note on `tStatByDate` below.
    for (const k of Object.keys(strategies)) {
      strategies[k].push(...dayRows[k].map((r) => ({ ...r, date: dateLabel })));
    }
  }
  process.stderr.write(`\r${dateLabel} · algorithm ${dayRows.algorithm.length} · board ${dayRows.boardOnly.length}   `);
}
process.stderr.write("\r");

const tOf = (xs) => {
  if (xs.length < 2) return null;
  const m = xs.reduce((a, x) => a + x, 0) / xs.length;
  const sd = Math.sqrt(xs.reduce((a, x) => a + (x - m) ** 2, 0) / (xs.length - 1));
  return sd > 0 ? m / (sd / Math.sqrt(xs.length)) : null;
};

const summarise = (rows) => rows.length ? {
  trades: rows.length,
  hitPct: (rows.filter((r) => r.outcome === "target").length / rows.length) * 100,
  stoppedPct: (rows.filter((r) => r.outcome === "stopped").length / rows.length) * 100,
  meanGrossR: rows.reduce((s, r) => s + r.resultR, 0) / rows.length,
  meanNetR: rows.reduce((s, r) => s + r.resultR - r.feeR, 0) / rows.length,
  medianNetR: median(rows.map((r) => r.resultR - r.feeR)),
  totalNetR: rows.reduce((s, r) => s + r.resultR - r.feeR, 0),
  winSharePct: (rows.filter((r) => r.resultR - r.feeR > 0).length / rows.length) * 100,
  /** A crude t-like ratio: mean over standard error, to size the noise. */
  tStat: tOf(rows.map((r) => r.resultR - r.feeR)),
  /**
   * The same ratio computed on one observation per rebalance date.
   *
   * `tStat` above treats four hundred tickets as four hundred independent
   * bets. They are not: shorting sixty pairs on one morning is one bet on one
   * month, sixty times over, and pooling them inflates the ratio by roughly
   * the square root of the number of pairs. That is how always-short came to
   * be reported at t = 4.94 on eleven rebalances. This is the honest one, and
   * where the two disagree it is this one that is a claim about the world.
   */
  tStatByDate: (() => {
    const perDate = {};
    for (const r of rows) (perDate[r.date] ??= []).push(r.resultR - r.feeR);
    const means = Object.values(perDate).map((xs) => xs.reduce((a, x) => a + x, 0) / xs.length);
    return tOf(means);
  })(),
  rebalances: new Set(rows.map((r) => r.date)).size,
} : null;

const results = Object.fromEntries(Object.entries(strategies).map(([k, v]) => [k, summarise(v)]));
const alg = results.algorithm, shortAll = results.alwaysShort;

const out = {
  measuredAt: new Date().toISOString(),
  pairs: series.length,
  rebalances: dates.length,
  stepDays: STEP,
  lookbackDays: LOOKBACK,
  rules: { stopAtr: STOP_ATR, rewardRatio: RR, horizonDays: HORIZON, feePct: FEE_PCT, minEffectiveN: MIN_EFFECTIVE_N },
  funnel: { considered, passedSample, passedAgreement, passedGeometry },
  results,
  /** The comparison that decides whether the selection did any work. */
  versusAlwaysShort: alg && shortAll ? {
    algorithmNetR: alg.meanNetR,
    alwaysShortNetR: shortAll.meanNetR,
    differenceR: alg.meanNetR - shortAll.meanNetR,
    algorithmBeatsIt: alg.meanNetR > shortAll.meanNetR,
    tradesRatio: alg.trades / shortAll.trades,
  } : null,
  dates,
};
writeFileSync("research/self-backtest.json", `${JSON.stringify(out, null, 2)}\n`);

console.log(`${series.length} pairs · ${dates.length} rebalances every ${STEP} days over ${LOOKBACK} days\n`);
console.log("funnel across the whole walk:");
console.log(`  pair-dates considered      ${considered}`);
console.log(`  passed the sample filter   ${passedSample}`);
console.log(`  passed lookback agreement  ${passedAgreement}`);
console.log(`  passed the geometry test   ${passedGeometry}\n`);

console.log("strategy        trades   hit%  stopped%   mean net R   median   win%    total R    t");
for (const [k, v] of Object.entries(results)) {
  if (!v) { console.log(`  ${k.padEnd(14)} no trades`); continue; }
  console.log(
    `${k.padEnd(15)}${String(v.trades).padStart(6)}`
    + v.hitPct.toFixed(1).padStart(7)
    + v.stoppedPct.toFixed(1).padStart(10)
    + v.meanNetR.toFixed(4).padStart(13)
    + v.medianNetR.toFixed(3).padStart(9)
    + v.winSharePct.toFixed(0).padStart(7)
    + v.totalNetR.toFixed(2).padStart(11)
    + (v.tStat == null ? "    n/a" : v.tStat.toFixed(2).padStart(7)),
  );
}

if (out.versusAlwaysShort) {
  const v = out.versusAlwaysShort;
  console.log(`\nthe question that matters: does the selection beat shorting everything?`);
  console.log(`  algorithm ${v.algorithmNetR.toFixed(4)}R vs always short ${v.alwaysShortNetR.toFixed(4)}R`
    + `  → difference ${v.differenceR >= 0 ? "+" : ""}${v.differenceR.toFixed(4)}R · beats it: ${v.algorithmBeatsIt}`);
  console.log(`  and it does so on ${(v.tradesRatio * 100).toFixed(1)}% as many trades`);
}

console.log("\nper rebalance:");
for (const d of dates) {
  console.log(`  ${d.date}  took ${String(d.taken).padStart(2)}`
    + (d.medianResultR == null ? "" : `  median ${d.medianResultR >= 0 ? "+" : ""}${d.medianResultR.toFixed(3)}R`)
    + (d.takenSymbols.length ? `  ${d.takenSymbols.slice(0, 5).join(" ")}` : ""));
}
