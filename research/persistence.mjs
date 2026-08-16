/**
 * The failure the walk-forward exposed, measured directly.
 *
 * Every filter this desk uses is a statement about the past being internally
 * consistent: a direction that paid over 180 days, that five nested lookback
 * windows agree on, on a sample of twelve or more episodes, whose full and
 * recent histories share a sign. Not one of them asks the question a position
 * actually depends on — whether a direction that held **continues** to hold.
 *
 * Consistency and persistence are different properties and this file separates
 * them into three questions that can each fail on their own.
 *
 *   A. Does agreement predict? Every scored row is recorded with how many of
 *      its five windows agreed, and with what the trade then did. If the
 *      forward result is flat across agreement levels, the filter is measuring
 *      the past's tidiness and forecasting nothing.
 *
 *   B. Is direction persistent at all? For every pair and every day, does the
 *      sign of the trailing return match the sign of the next one. At 50% no
 *      selection built on past direction can work, whatever it is, and the
 *      architecture is resting on something that does not exist.
 *
 *   C. Would anything else have worked? Four cheap selectors scored the same
 *      way — momentum, its reverse, the current agreement rule, and the recent
 *      window alone — so the answer is not just "yours fails" but "here is
 *      what does or does not, on the same data".
 *
 * B is the one that matters most, and it is deliberately the cheapest to
 * compute and the hardest to argue with: no grid, no filters, no geometry, just
 * the sign of one return against the sign of the next.
 */

import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { atr, fetchKlines } from "../src/analysis.mjs";
import { liveUniverse } from "../src/universe.mjs";
import { signalFor } from "../src/signals.mjs";

/**
 * Re-derive the summary from the stored run instead of refetching.
 *
 * The walk costs several minutes of candles and, worse, it reads a *live*
 * universe — so running it again to add one derived field would quietly change
 * every number in the file. REUSE=1 recomputes only what is computed from
 * stored fields, which is what a derived figure should be anyway.
 */
const REUSE = process.env.REUSE === "1";
const prior = REUSE ? JSON.parse(readFileSync("research/persistence.json", "utf8")) : null;

const PAIRS = Number(process.env.PAIRS ?? 100);
const STEP = Number(process.env.STEP ?? 30);
const LOOKBACK = Number(process.env.LOOKBACK ?? 330);
const MIN_HISTORY = 260;

const STOP_ATR = 1.5;
const RR = 2;
const HORIZON = 30;
const FEE_PCT = 0.2;
const MIN_TURNOVER_USD = 2e6;
/** Horizons for the persistence question, which needs no engine at all. */
const PERSIST_HORIZONS = [10, 30, 90];

const retry = async (fn, n = 6) => {
  let last;
  for (let i = 0; i < n; i++) {
    try { return await fn(); } catch (e) { last = e; await new Promise((r) => setTimeout(r, 1200 * (i + 1))); }
  }
  throw last;
};

const mean = (xs) => (xs.length ? xs.reduce((a, x) => a + x, 0) / xs.length : null);
const sd = (xs) => {
  if (xs.length < 2) return null;
  const m = mean(xs);
  return Math.sqrt(xs.reduce((a, x) => a + (x - m) ** 2, 0) / (xs.length - 1));
};
const tStat = (xs) => {
  const s = sd(xs);
  return s > 0 ? mean(xs) / (s / Math.sqrt(xs.length)) : null;
};
/** Welch, so the two groups are allowed different variances and sizes. */
const welch = (a, b) => {
  if (a.length < 2 || b.length < 2) return null;
  const va = sd(a) ** 2 / a.length, vb = sd(b) ** 2 / b.length;
  return va + vb > 0 ? (mean(a) - mean(b)) / Math.sqrt(va + vb) : null;
};
/**
 * How far a match rate sits from a coin toss, in standard errors.
 *
 * Overlapping windows are the trap here: 45,445 day-pairs at a 30-day horizon
 * are not 45,445 independent observations. The de-overlapped count is used so
 * the number cannot be inflated by reading the same month thirty times.
 */
const zVsHalf = (pct, effectiveN) => (pct / 100 - 0.5) / (0.5 / Math.sqrt(effectiveN));

const { symbols } = REUSE ? { symbols: [] } : await retry(() => liveUniverse({ limit: PAIRS }));

const series = [];
for (const [i, symbol] of symbols.entries()) {
  process.stderr.write(`\rloading ${i + 1}/${symbols.length} ${symbol.padEnd(14)}`);
  try {
    const daily = await retry(() => fetchKlines(symbol, { interval: "1d", limit: 1000 }));
    if (daily.length < MIN_HISTORY + 60) continue;
    series.push({ symbol, daily });
  } catch { /* absent rather than guessed */ }
}
process.stderr.write("\r");

const dayOf = (c) => new Date(c.openTime).toISOString().slice(0, 10);
for (const s of series) s.index = new Map(s.daily.map((c, i) => [dayOf(c), i]));

/* ================================================================== *
 * B. Is direction persistent at all?
 * ================================================================== */

const persistence = prior?.persistence ?? {};
for (const h of REUSE ? [] : PERSIST_HORIZONS) {
  let matches = 0, total = 0;
  const perPair = [];
  for (const s of series) {
    let m = 0, n = 0;
    for (let i = h; i + h < s.daily.length; i++) {
      const past = s.daily[i].close / s.daily[i - h].close - 1;
      const next = s.daily[i + h].close / s.daily[i].close - 1;
      if (past === 0 || next === 0) continue;
      n += 1;
      if (Math.sign(past) === Math.sign(next)) m += 1;
    }
    if (n >= 50) perPair.push((m / n) * 100);
    matches += m; total += n;
  }
  const matchPct = (matches / total) * 100;
  const effectiveN = total / h;
  persistence[h] = {
    matchPct,
    observations: total,
    /** Overlapping days inflate the count; this is the de-overlapped size. */
    effectiveN,
    zVsCoinToss: zVsHalf(matchPct, effectiveN),
    pairsAbove50: perPair.filter((v) => v > 50).length,
    pairs: perPair.length,
    medianPairPct: (() => {
      const v = [...perPair].sort((a, b) => a - b);
      return v.length ? (v.length % 2 ? v[v.length >> 1] : (v[v.length / 2 - 1] + v[v.length / 2]) / 2) : null;
    })(),
  };
}

/* ================================================================== *
 * A and C. Walk forward, recording agreement and four cheap selectors.
 * ================================================================== */

const openAndScore = (daily, t, direction, stopPct) => {
  if (t + HORIZON >= daily.length) return null;
  const entry = daily[t].close;
  const long = direction === "long";
  const stop = long ? entry * (1 - stopPct / 100) : entry * (1 + stopPct / 100);
  const target = long ? entry * (1 + stopPct * RR / 100) : entry * (1 - stopPct * RR / 100);
  for (let j = t + 1; j <= t + HORIZON; j++) {
    const c = daily[j];
    if (long ? c.low <= stop : c.high >= stop) return -1;
    if (long ? c.high >= target : c.low <= target) return RR;
  }
  const move = (daily[t + HORIZON].close / entry - 1) * 100;
  return (long ? move : -move) / stopPct;
};

const byAgreement = {};       // agreeing windows -> forward net R
/**
 * Four selectors, cheapest first.
 *
 * They form a ladder rather than a menu: the sign of the last thirty days, its
 * opposite, the engine's own direction, and the engine's direction filtered
 * down to the calls all five lookback windows stand behind. If the top of the
 * ladder does not beat the bottom, everything between them is decoration.
 *
 * An earlier version of this file carried a fifth, "the recent window alone",
 * and it was worthless: the engine picks its side *as* the one with positive
 * recent expectancy, so that filter can never exclude a call it did not
 * already make. It returned numbers identical to the engine's to sixteen
 * decimal places, which is what a tautology looks like when you measure it.
 */
const selectors = { momentum: [], reversal: [], boardDirection: [], unanimous: [] };
const dates = [];

const reference = series.length
  ? series.reduce((a, b) => (a.daily.length >= b.daily.length ? a : b))
  : null;
const calendar = reference ? reference.daily.map(dayOf) : [];
const lastIdx = calendar.length - 1;

for (let k = REUSE ? 1 : lastIdx - LOOKBACK; k <= lastIdx - HORIZON; k += STEP) {
  if (k < 0) continue;
  const dateLabel = calendar[k];
  let rows = 0;

  for (const s of series) {
    const t = s.index.get(dateLabel);
    if (t == null || t < MIN_HISTORY || t + HORIZON >= s.daily.length) continue;

    const asOf = s.daily.slice(0, t + 1);
    const price = asOf.at(-1).close;
    const atrPct = (atr(asOf, 14) / price) * 100;
    if (!Number.isFinite(atrPct) || atrPct <= 0) continue;
    const stopPct = STOP_ATR * atrPct;
    if (!(stopPct > 0) || stopPct >= 60) continue;
    const turnoverUsd = asOf.slice(-30).reduce((a, c) => a + c.quoteVolume, 0) / 30;
    if (!(turnoverUsd >= MIN_TURNOVER_USD)) continue;

    const feeR = FEE_PCT / stopPct;
    rows += 1;

    /**
     * The cheap selectors, none of which needs the engine.
     *
     * Momentum takes the sign of the trailing 30 days; reversal takes the
     * opposite. Both are scored at the identical geometry so the comparison is
     * about the direction and nothing else.
     */
    const trailing = asOf.at(-1).close / asOf.at(-1 - HORIZON).close - 1;
    const momentumDir = trailing >= 0 ? "long" : "short";
    for (const [key, dir] of [
      ["momentum", momentumDir],
      ["reversal", momentumDir === "long" ? "short" : "long"],
    ]) {
      const r = openAndScore(s.daily, t, dir, stopPct);
      if (r != null) selectors[key].push(r - feeR);
    }

    let signal;
    try {
      signal = signalFor({ symbol: s.symbol, candles: asOf, atrPct, price, turnoverUsd });
    } catch { continue; }
    if (!signal || signal.bias === "WAIT" || !signal.plan) continue;
    const direction = signal.bias === "LONG" ? "long" : "short";

    const r = openAndScore(s.daily, t, direction, stopPct);
    if (r == null) continue;
    const net = r - feeR;

    selectors.boardDirection.push(net);

    const agree = signal.agreement?.agreeing ?? null;
    const windows = signal.agreement?.windows ?? null;
    if (agree != null && windows === 5) {
      byAgreement[agree] ??= [];
      byAgreement[agree].push(net);
      // The published filter: every window behind the call, no dissent.
      if (agree === 5) selectors.unanimous.push(net);
    }
  }
  if (rows) dates.push({ date: dateLabel, rows });
}

const summarise = (xs) => xs.length ? {
  trades: xs.length,
  meanNetR: mean(xs),
  winPct: (xs.filter((v) => v > 0).length / xs.length) * 100,
  tStat: tStat(xs),
} : null;

const agreementTable = prior?.byAgreement ?? Object.keys(byAgreement)
  .map(Number).sort((a, b) => a - b)
  .map((k) => ({ agreeing: k, ...summarise(byAgreement[k]) }));

const selectorSummary = prior?.selectors
  ?? Object.fromEntries(Object.entries(selectors).map(([k, v]) => [k, summarise(v)]));

/**
 * Does more agreement mean a better forward result?
 *
 * The per-level table is reported because it is what the filter claims, but it
 * cannot carry the conclusion: four of its five buckets hold fewer than 25
 * trades, so a "spread" between the ends is a difference between two noisy
 * numbers. The test that decides is the one the filter actually performs —
 * unanimous against everything it rejects — with enough on both sides to mean
 * something.
 */
const monotone = agreementTable.length >= 3
  && agreementTable.every((r, i) => i === 0 || r.meanNetR >= agreementTable[i - 1].meanNetR);
const spread = agreementTable.length >= 2
  ? agreementTable.at(-1).meanNetR - agreementTable[0].meanNetR
  : null;

const five = byAgreement[5] ?? [];
const rest = [1, 2, 3, 4].flatMap((k) => byAgreement[k] ?? []);
const fiveVsRest = prior?.fiveVsRest ?? (five.length && rest.length ? {
  unanimousTrades: five.length,
  unanimousMeanR: mean(five),
  rejectedTrades: rest.length,
  rejectedMeanR: mean(rest),
  differenceR: mean(five) - mean(rest),
  welchT: welch(five, rest),
} : null);

const dateRows = prior?.dates ?? dates;
const sel = selectorSummary;

/**
 * Figures the post needs that are arithmetic on the figures above.
 *
 * They live here rather than in the prose because the publishing gate only
 * clears a number it can find in a committed snapshot, and a figure computed
 * in a sentence is a figure nobody can re-derive.
 *
 * `runToRunGapR` is the one that matters. It compares the same quantity — the
 * engine's raw direction, over the same eleven dates at the same geometry —
 * between this run and last week's walk-forward, which drew a slightly
 * different live universe. Two honest measurements of one thing disagreeing by
 * more than the effect under test is the cheapest possible statement of how
 * little these sample sizes can support.
 */
const priorWalk = existsSync("research/self-backtest.json")
  ? JSON.parse(readFileSync("research/self-backtest.json", "utf8"))
  : null;

const engineOverMomentumR = sel.boardDirection && sel.momentum
  ? sel.boardDirection.meanNetR - sel.momentum.meanNetR : null;
const runToRunGapR = sel.boardDirection && priorWalk
  ? sel.boardDirection.meanNetR - priorWalk.results.boardOnly.meanNetR : null;

const derived = {
  rowsConsidered: dateRows.reduce((a, d) => a + d.rows, 0),
  withFiveWindows: agreementTable.reduce((a, r) => a + r.trades, 0),
  engineOverMomentumR,
  momentumPlusReversalR: sel.momentum && sel.reversal
    ? sel.momentum.meanNetR + sel.reversal.meanNetR : null,
  priorWalk: priorWalk ? {
    file: "research/self-backtest.json",
    pairs: priorWalk.pairs,
    boardOnlyR: priorWalk.results.boardOnly.meanNetR,
    boardOnlyTrades: priorWalk.results.boardOnly.trades,
    algorithmR: priorWalk.results.algorithm.meanNetR,
    algorithmTrades: priorWalk.results.algorithm.trades,
  } : null,
  runToRunGapR,
  /** How many times bigger the run-to-run wobble is than the edge claimed. */
  gapOverClaimedEdge: runToRunGapR != null && engineOverMomentumR
    ? runToRunGapR / engineOverMomentumR : null,
};

const out = {
  measuredAt: prior?.measuredAt ?? new Date().toISOString(),
  pairs: prior?.pairs ?? series.length,
  rebalances: dateRows.length,
  rules: {
    stopAtr: STOP_ATR, rewardRatio: RR, horizonDays: HORIZON, feePct: FEE_PCT,
    persistenceHorizons: PERSIST_HORIZONS,
  },
  /** B: the base rate everything else rests on. */
  persistence,
  /** A: whether the filter's own score predicts anything. */
  byAgreement: agreementTable,
  agreementSpreadR: spread,
  agreementMonotone: monotone,
  fiveVsRest,
  /** C: four selectors, same geometry, same days. */
  selectors: selectorSummary,
  derived,
  dates: dateRows,
};
writeFileSync("research/persistence.json", `${JSON.stringify(out, null, 2)}\n`);

console.log(`${out.pairs} pairs · ${out.rebalances} rebalances${REUSE ? " (reused, nothing refetched)" : ""}\n`);
console.log("B. does direction persist? sign of the trailing return vs the next one");
console.log("  horizon   match%   median pair   pairs >50%   n(eff)       z");
for (const h of PERSIST_HORIZONS) {
  const p = persistence[h];
  console.log(`  ${String(h + "d").padEnd(9)}${p.matchPct.toFixed(2).padStart(7)}%`
    + `${p.medianPairPct.toFixed(1).padStart(14)}%`
    + `${String(`${p.pairsAbove50}/${p.pairs}`).padStart(13)}`
    + String(Math.round(p.effectiveN)).padStart(9)
    + `${p.zVsCoinToss >= 0 ? "+" : ""}${p.zVsCoinToss.toFixed(2)}`.padStart(8));
}

console.log("\nA. does lookback agreement predict the forward result?");
console.log("  agreeing   trades   mean net R    win%       t");
for (const r of agreementTable) {
  console.log(`  ${String(r.agreeing + "/5").padEnd(11)}${String(r.trades).padStart(6)}`
    + `${(r.meanNetR >= 0 ? "+" : "") + r.meanNetR.toFixed(4)}`.padStart(13)
    + `${r.winPct.toFixed(0)}%`.padStart(8)
    + (r.tStat == null ? "     n/a" : r.tStat.toFixed(2).padStart(8)));
}
console.log(`  spread lowest→highest: ${spread == null ? "n/a" : (spread >= 0 ? "+" : "") + spread.toFixed(4)}R · monotone: ${monotone}`);
if (fiveVsRest) {
  const f = fiveVsRest;
  console.log(`  the filter's own cut: unanimous ${(f.unanimousMeanR >= 0 ? "+" : "") + f.unanimousMeanR.toFixed(4)}R (${f.unanimousTrades})`
    + ` vs rejected ${(f.rejectedMeanR >= 0 ? "+" : "") + f.rejectedMeanR.toFixed(4)}R (${f.rejectedTrades})`
    + ` · ${(f.differenceR >= 0 ? "+" : "") + f.differenceR.toFixed(4)}R, Welch t = ${f.welchT.toFixed(2)}`);
}

console.log("\nC. four selectors, identical geometry, identical days");
console.log("  selector       trades   mean net R    win%       t");
for (const [k, v] of Object.entries(out.selectors)) {
  if (!v) { console.log(`  ${k.padEnd(15)} no trades`); continue; }
  console.log(`  ${k.padEnd(15)}${String(v.trades).padStart(6)}`
    + `${(v.meanNetR >= 0 ? "+" : "") + v.meanNetR.toFixed(4)}`.padStart(13)
    + `${v.winPct.toFixed(0)}%`.padStart(8)
    + (v.tStat == null ? "     n/a" : v.tStat.toFixed(2).padStart(8)));
}

const d = out.derived;
console.log(`\n  the whole engine over the sign of the last ${HORIZON} days: `
  + `${(d.engineOverMomentumR >= 0 ? "+" : "") + d.engineOverMomentumR.toFixed(4)}R`);
if (d.priorWalk) {
  console.log(`  the same quantity a week ago (${d.priorWalk.pairs} pairs, ${d.priorWalk.boardOnlyTrades} trades): `
    + `${(d.priorWalk.boardOnlyR >= 0 ? "+" : "") + d.priorWalk.boardOnlyR.toFixed(4)}R`);
  console.log(`  run-to-run gap ${(d.runToRunGapR >= 0 ? "+" : "") + d.runToRunGapR.toFixed(4)}R`
    + ` — ${d.gapOverClaimedEdge.toFixed(1)}x the edge it claims to add`);
}
