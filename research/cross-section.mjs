/**
 * Does picking *which* alts to short add anything, or is the edge only breadth?
 *
 * The structural study established one thing that survives: shorting liquid
 * alts against BTC, +0.2866R a month after funding over 79 months. But it
 * shorted *every* liquid alt indiscriminately. That is not a watchlist, and
 * every request this desk gets is really a request for a watchlist.
 *
 * So the obvious next question, and the one that decides whether "tokens to
 * watch" is a defensible product here at all: if the alts are ranked by how
 * they have done against BTC lately and split into groups, do the groups differ
 * going forward?
 *
 * Two ways it could pay, and they are opposites:
 *
 *   Cross-sectional momentum. The alts that already lost most against BTC keep
 *   losing. Then a watchlist is the weak end, and selection adds to breadth.
 *
 *   Cross-sectional reversal. The alts that lost most bounce hardest. Then the
 *   watchlist is the strong end, and every "these are down, they will keep
 *   falling" list has the sign backwards.
 *
 * Note that this is *not* the question the persistence study answered. That one
 * asked whether an asset's own direction continues in time, and found a coin
 * toss. This asks whether assets differ from each other in a way that persists,
 * which is a separate effect and is well documented in other markets. A flat
 * result in one does not settle the other.
 *
 * The universe is pinned to the candle cache, so re-running cannot redraw the
 * sample underneath the answer.
 */

import { existsSync, readFileSync, readdirSync, writeFileSync } from "node:fs";

const CACHE = ".cache/klines";
const NUMERAIRE = "BTCUSDT";
const HORIZON = 30;
const RR = 2;
const FEE_PCT = 0.4;
const STOP_VOL_MULT = 2.5;
const MIN_TURNOVER_USD = 2e6;
const MIN_HISTORY = 60;
/** Trailing window the ranking is formed on. */
const RANK_LOOKBACK = 30;
const GROUPS = 5;

if (!existsSync(CACHE)) throw new Error("No candle cache. Run research/structural-edge.mjs first.");

const mean = (xs) => (xs.length ? xs.reduce((a, x) => a + x, 0) / xs.length : null);
const median = (xs) => {
  if (!xs.length) return null;
  const v = [...xs].sort((a, b) => a - b);
  return v.length % 2 ? v[v.length >> 1] : (v[v.length / 2 - 1] + v[v.length / 2]) / 2;
};
const tStat = (xs) => {
  if (xs.length < 2) return null;
  const m = mean(xs);
  const s = Math.sqrt(xs.reduce((a, x) => a + (x - m) ** 2, 0) / (xs.length - 1));
  return s > 0 ? m / (s / Math.sqrt(xs.length)) : null;
};
const sd = (xs) => {
  if (xs.length < 2) return null;
  const m = mean(xs);
  return Math.sqrt(xs.reduce((s, x) => s + (x - m) ** 2, 0) / (xs.length - 1));
};
/** Welch, so the two groups may differ in spread as well as in size. */
const welch = (a, b) => {
  if (a.length < 2 || b.length < 2) return null;
  const va = sd(a) ** 2 / a.length, vb = sd(b) ** 2 / b.length;
  return va + vb > 0 ? (mean(a) - mean(b)) / Math.sqrt(va + vb) : null;
};

const dayOf = (c) => new Date(c.openTime).toISOString().slice(0, 10);

const files = readdirSync(CACHE).filter((f) => f.endsWith(".json"));
const series = [];
for (const f of files) {
  const symbol = f.replace(/-\d{4}-\d{2}-\d{2}\.json$/, "");
  const daily = JSON.parse(readFileSync(`${CACHE}/${f}`, "utf8"));
  if (daily.length < MIN_HISTORY + HORIZON) continue;
  series.push({ symbol, daily, index: new Map(daily.map((c, i) => [dayOf(c), i])) });
}

const btc = series.find((s) => s.symbol === NUMERAIRE);
if (!btc) throw new Error(`${NUMERAIRE} missing from the cache.`);
const btcClose = new Map(btc.daily.map((c) => [dayOf(c), c.close]));

for (const s of series) {
  if (s.symbol === NUMERAIRE) continue;
  s.ratio = s.daily.map((c) => {
    const p = btcClose.get(dayOf(c));
    return p ? c.close / p : null;
  });
  s.ok = s.ratio.every((v) => v != null);
}

const ccVolPct = (closes, t, n = 14) => {
  if (t < n) return null;
  let sum = 0;
  for (let i = t - n + 1; i <= t; i++) sum += Math.abs(closes[i] / closes[i - 1] - 1);
  return (sum / n) * 100;
};

/** Short the ratio, stop checked before target, exit bar returned. */
const scoreShort = (closes, t, stopPct) => {
  if (t + HORIZON >= closes.length) return null;
  const entry = closes[t];
  const stop = entry * (1 + stopPct / 100);
  const target = entry * (1 - stopPct * RR / 100);
  for (let j = t + 1; j <= t + HORIZON; j++) {
    if (closes[j] >= stop) return -1;
    if (closes[j] <= target) return RR;
  }
  return -((closes[t + HORIZON] / entry - 1) * 100) / stopPct;
};

const calendar = btc.daily.map(dayOf);
/** group index -> array of net R; and the same keyed by date for significance. */
const groups = Array.from({ length: GROUPS }, () => []);
const groupsByDate = Array.from({ length: GROUPS }, () => ({}));
const allByDate = {};
let rebalances = 0;

for (let k = MIN_HISTORY + RANK_LOOKBACK; k + HORIZON < calendar.length; k += HORIZON) {
  const date = calendar[k];
  const candidates = [];

  for (const s of series) {
    if (s.symbol === NUMERAIRE || !s.ok) continue;
    const t = s.index.get(date);
    if (t == null || t < MIN_HISTORY + RANK_LOOKBACK || t + HORIZON >= s.daily.length) continue;

    const turnoverUsd = s.daily.slice(t - 29, t + 1).reduce((a, c) => a + c.quoteVolume, 0) / 30;
    if (!(turnoverUsd >= MIN_TURNOVER_USD)) continue;

    const vol = ccVolPct(s.ratio, t);
    if (vol == null) continue;
    const stopPct = STOP_VOL_MULT * vol;
    if (!(stopPct > 0 && stopPct < 60)) continue;

    // The ranking signal: how this alt has done against BTC over the lookback.
    const trailing = s.ratio[t] / s.ratio[t - RANK_LOOKBACK] - 1;
    const r = scoreShort(s.ratio, t, stopPct);
    if (r == null) continue;

    candidates.push({ symbol: s.symbol, trailing, net: r - FEE_PCT / stopPct });
  }

  // Groups need enough names to be groups at all.
  if (candidates.length < GROUPS * 3) continue;
  rebalances += 1;

  candidates.sort((a, b) => a.trailing - b.trailing); // weakest vs BTC first
  const per = candidates.length / GROUPS;
  candidates.forEach((c, i) => {
    const g = Math.min(GROUPS - 1, Math.floor(i / per));
    groups[g].push(c.net);
    (groupsByDate[g][date] ??= []).push(c.net);
    (allByDate[date] ??= []).push(c.net);
  });
}

const describe = (xs, byDate) => {
  const dateMeans = Object.values(byDate).map(mean);
  return {
    trades: xs.length,
    months: dateMeans.length,
    meanNetR: mean(xs),
    medianNetR: median(xs),
    tStatByMonth: tStat(dateMeans),
    monthsPositivePct: dateMeans.length
      ? (dateMeans.filter((v) => v > 0).length / dateMeans.length) * 100 : null,
  };
};

const LABELS = [
  "weakest vs BTC",
  "weak",
  "middle",
  "strong",
  "strongest vs BTC",
];

const table = groups.map((g, i) => ({
  group: i + 1, label: LABELS[i], ...describe(g, groupsByDate[i]),
}));

const all = describe(groups.flat(), allByDate);

/**
 * The comparison that decides it.
 *
 * Per month, so the same cross-sectional correlation that inflated the earlier
 * study cannot inflate this one — every alt in a group moves with the others on
 * the day they are all opened.
 */
const meansOf = (byDate) => Object.values(byDate).map(mean);
const weakest = meansOf(groupsByDate[0]);
const strongest = meansOf(groupsByDate[GROUPS - 1]);
const spread = {
  weakestMeanR: mean(weakest),
  strongestMeanR: mean(strongest),
  differenceR: mean(weakest) - mean(strongest),
  welchTByMonth: welch(weakest, strongest),
  /** Positive means shorting past losers beat shorting past winners. */
  favours: mean(weakest) > mean(strongest) ? "momentum" : "reversal",
};

const monotoneDown = table.every((r, i) => i === 0 || r.meanNetR <= table[i - 1].meanNetR);
const monotoneUp = table.every((r, i) => i === 0 || r.meanNetR >= table[i - 1].meanNetR);

const out = {
  measuredAt: new Date().toISOString(),
  universePinnedToCache: true,
  pairs: series.length - 1,
  rebalances,
  rules: {
    horizonDays: HORIZON, rewardRatio: RR, feePct: FEE_PCT,
    stopVolMultiple: STOP_VOL_MULT, rankLookbackDays: RANK_LOOKBACK,
    groups: GROUPS, minTurnoverUsd: MIN_TURNOVER_USD,
  },
  question: "Shorting alts against BTC works. Does it matter which ones you pick?",
  byGroup: table,
  allAlts: all,
  spread,
  monotone: monotoneDown || monotoneUp,
  /** Best group minus the take-everything result: what selection would add. */
  bestGroupOverAllR: Math.max(...table.map((r) => r.meanNetR)) - all.meanNetR,
};
writeFileSync("research/cross-section.json", `${JSON.stringify(out, null, 2)}\n`);

const f = (v, dp = 4) => (v == null ? "—" : (v >= 0 ? "+" : "") + v.toFixed(dp));
console.log(`${out.pairs} alts · ${rebalances} non-overlapping rebalances · ranked on trailing ${RANK_LOOKBACK}d vs BTC\n`);
console.log("shorting each group against BTC, identical geometry");
console.log("  group              trades   months   mean net R   t(month)   +months");
for (const r of table) {
  console.log(`  ${r.label.padEnd(19)}${String(r.trades).padStart(6)}${String(r.months).padStart(9)}`
    + `${f(r.meanNetR)}`.padStart(13)
    + `${r.tStatByMonth == null ? "—" : r.tStatByMonth.toFixed(2)}`.padStart(11)
    + `${r.monthsPositivePct.toFixed(0)}%`.padStart(10));
}
console.log(`  ${"— take everything —".padEnd(19)}${String(all.trades).padStart(6)}${String(all.months).padStart(9)}`
  + `${f(all.meanNetR)}`.padStart(13)
  + `${all.tStatByMonth.toFixed(2)}`.padStart(11)
  + `${all.monthsPositivePct.toFixed(0)}%`.padStart(10));

console.log(`\n  weakest minus strongest: ${f(spread.differenceR)}R · Welch t by month `
  + `${spread.welchTByMonth == null ? "—" : spread.welchTByMonth.toFixed(2)} · leans ${spread.favours}`);
console.log(`  monotone across groups: ${out.monotone}`);
console.log(`  best group over taking everything: ${f(out.bestGroupOverAllR)}R`);
