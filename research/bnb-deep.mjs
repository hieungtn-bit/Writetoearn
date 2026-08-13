/**
 * BNB after a failed attempt on its own ceiling.
 *
 * On 12 August BNB reached 620.55 — a new 30-day high — and closed the same
 * day at 610.44. It is the eighth time that band has turned it back. The
 * question a holder actually has is not "is the structure good" but "from
 * here, what has holding paid".
 *
 * Three things are measured, all conditional on the state BNB is in now:
 *
 *   1. forward returns from the top of its 30-day range, against a baseline
 *   2. what the path looks like — the drawdown you sit through to collect them
 *   3. what happened on the previous visits to this exact ceiling
 *
 * The third is the smallest sample and is reported as a count rather than a
 * rate, because eight events cannot support a percentage.
 */

import { writeFileSync } from "node:fs";
import { analyzeAsset, atr, fetchKlines } from "../src/analysis.mjs";
import { volumeProfile } from "../src/profile.mjs";
import { AGREEMENT_WINDOWS, grid, summarise, signalFor } from "../src/signals.mjs";

const SYMBOL = "BNBUSDT";
const ZONE = [612, 618];
const HORIZONS = [3, 5, 10, 30];

const retry = async (fn, n = 6) => {
  let last;
  for (let i = 0; i < n; i++) {
    try { return await fn(); } catch (e) { last = e; await new Promise((r) => setTimeout(r, 1200 * (i + 1))); }
  }
  throw last;
};

const daily = await retry(() => fetchKlines(SYMBOL, { interval: "1d", limit: 1000 }));
const hourly = await retry(() => fetchKlines(SYMBOL, { interval: "1h", limit: 720 }));
const h4 = await retry(() => fetchKlines(SYMBOL, { interval: "4h", limit: 500 }));
const analysis = await retry(() => analyzeAsset(SYMBOL, { candles: daily }));
const price = analysis.price;
const atrPct = (atr(daily, 14) / price) * 100;
const profile = volumeProfile(hourly, price);

const median = (xs) => {
  if (!xs.length) return null;
  const s = [...xs].sort((a, b) => a - b);
  return s.length % 2 ? s[s.length >> 1] : (s[s.length / 2 - 1] + s[s.length / 2]) / 2;
};
const quantile = (xs, p) => [...xs].sort((a, b) => a - b)[Math.floor(xs.length * p)];

const rangePos = (i, n = 30) => {
  const w = daily.slice(Math.max(0, i - n + 1), i + 1);
  const lo = Math.min(...w.map((c) => c.low));
  const hi = Math.max(...w.map((c) => c.high));
  return hi > lo ? ((daily[i].close - lo) / (hi - lo)) * 100 : 50;
};

/** Forward returns conditional on sitting at the top of the range, vs baseline. */
const forward = {};
for (const h of HORIZONS) {
  const hot = [], base = [];
  for (let i = 30; i < daily.length - h; i++) {
    const r = ((daily[i + h].close / daily[i].close) - 1) * 100;
    if (rangePos(i) >= 85) hot.push(r); else base.push(r);
  }
  forward[h] = {
    conditionalMedianPct: median(hot),
    baselineMedianPct: median(base),
    differencePct: median(hot) - median(base),
    upSharePct: (hot.filter((v) => v > 0).length / hot.length) * 100,
    days: hot.length,
    effectiveN: hot.length / h,
  };
}

/** The path: what you sit through over the next ten days from that state. */
const drops = [], rises = [], baseDrops = [];
for (let i = 30; i < daily.length - 10; i++) {
  const w = daily.slice(i + 1, i + 11);
  const drop = ((Math.min(...w.map((c) => c.low)) / daily[i].close) - 1) * 100;
  const rise = ((Math.max(...w.map((c) => c.high)) / daily[i].close) - 1) * 100;
  if (rangePos(i) >= 85) { drops.push(drop); rises.push(rise); } else baseDrops.push(drop);
}
const path = {
  medianDrawdownPct: median(drops),
  baselineDrawdownPct: median(baseDrops),
  medianRisePct: median(rises),
  painToGain: Math.abs(median(drops)) / median(rises),
  worstQuarterPct: quantile(drops, 0.25),
  worstTenthPct: quantile(drops, 0.10),
  days: drops.length,
};

/**
 * Previous visits to this ceiling, as a list rather than a rate.
 *
 * A touch needs a gap since the last one, and the final bars are dropped
 * because they have no outcome yet — a zone counted without that correction
 * reports rejections it has not observed.
 */
const visits = [];
let lastIdx = -Infinity;
for (let i = 0; i < h4.length - 12; i++) {
  if (h4[i].high < ZONE[0]) continue;
  if (i - lastIdx < 6) continue;
  lastIdx = i;
  const later = h4[i + 12];
  visits.push({
    at: new Date(h4[i].openTime).toISOString().slice(0, 10),
    high: h4[i].high,
    laterClose: later.close,
    rejected: later.close < ZONE[0],
    brokeThrough: later.close > ZONE[1],
  });
}

/** Daily closes above the ceiling, which is the test a break has to pass. */
const closesAbove = daily.slice(-30).filter((c) => c.close > ZONE[1]).length;
const last12 = daily.slice(-12).map((c) => ({
  day: new Date(c.openTime).toISOString().slice(0, 10),
  close: c.close, high: c.high, aboveZone: c.close > ZONE[1],
}));

const last30 = daily.slice(-30);
const high30 = Math.max(...last30.map((c) => c.high));
const highDay = last30.find((c) => c.high === high30);

/** Both directions across every lookback, the stability check. */
const byWindow = {};
for (const days of AGREEMENT_WINDOWS) {
  if (daily.length < days + 30) continue;
  const s = daily.slice(-days);
  const long = summarise(grid(s, atrPct, { direction: "long" }));
  const short = summarise(grid(s, atrPct, { direction: "short" }));
  byWindow[days] = {
    longPositive: long && `${long.positive}/${long.cells}`,
    longMedianR: long?.medianExpectancyR ?? null,
    shortPositive: short && `${short.positive}/${short.cells}`,
    shortMedianR: short?.medianExpectancyR ?? null,
  };
}

const signal = signalFor({
  symbol: SYMBOL, candles: daily, atrPct, price,
  turnoverUsd: analysis.avgQuoteVolume30d,
});

const weeks = [];
for (let i = 0; i + 7 <= daily.length; i += 7) {
  const w = daily.slice(i, i + 7);
  const lo = Math.min(...w.map((c) => c.low));
  weeks.push(((Math.max(...w.map((c) => c.high)) - lo) / lo) * 100);
}

const out = {
  measuredAt: new Date().toISOString(),
  price, atrPct,
  zone: ZONE,
  rangePosition30d: analysis.rangePosition30d,
  range30: { low: Math.min(...last30.map((c) => c.low)), high: high30 },
  highDay: highDay && {
    day: new Date(highDay.openTime).toISOString().slice(0, 10),
    high: highDay.high, close: highDay.close,
    gaveBackPct: ((highDay.close / highDay.high) - 1) * 100,
  },
  belowHighPct: ((price / high30) - 1) * 100,
  closesAboveZoneLast30: closesAbove,
  last12,
  visits: { total: visits.length, rejected: visits.filter((v) => v.rejected).length, detail: visits.slice(-8) },
  profile,
  overheadPct: profile?.overheadPct ?? null,
  rsi14: analysis.rsi14,
  change7dPct: analysis.change7dPct,
  change30dPct: analysis.change30dPct,
  volumeZScoreCompleted: analysis.volumeZScoreCompleted,
  turnoverUsd: analysis.avgQuoteVolume30d,
  medianWeekPct: median(weeks),
  forward, path, byWindow,
  call: {
    bias: signal.bias,
    agreeing: signal.agreement?.agreeing ?? null,
    windows: signal.agreement?.windows ?? null,
    plan: signal.plan,
  },
};
writeFileSync("research/bnb-deep.json", `${JSON.stringify(out, null, 2)}\n`);

console.log(`BNB $${price.toFixed(2)}  ·  range position ${analysis.rangePosition30d.toFixed(1)}%  ·  overhead ${out.overheadPct.toFixed(2)}%`);
console.log(`30d high ${high30} on ${out.highDay.day}, closed ${out.highDay.close} the same day (${out.highDay.gaveBackPct.toFixed(2)}%)`);
console.log(`daily closes above ${ZONE[1]} in 30 days: ${closesAbove}`);
console.log(`ceiling visits ${visits.length}, rejected ${visits.filter((v) => v.rejected).length}\n`);
console.log("forward from >=85% of the range:");
for (const h of HORIZONS) {
  const f = forward[h];
  console.log(`  ${String(h + "d").padEnd(5)} ${f.conditionalMedianPct.toFixed(2)}%  vs baseline ${f.baselineMedianPct.toFixed(2)}%`
    + `  diff ${f.differencePct.toFixed(2)}  up ${f.upSharePct.toFixed(0)}%  n≈${Math.round(f.effectiveN)}`);
}
console.log(`\npath over 10 days: drawdown ${path.medianDrawdownPct.toFixed(2)}% (baseline ${path.baselineDrawdownPct.toFixed(2)}%)`
  + `  rise ${path.medianRisePct.toFixed(2)}%  pain/gain ${path.painToGain.toFixed(2)}`);
console.log(`  worst quarter ${path.worstQuarterPct.toFixed(2)}%   worst tenth ${path.worstTenthPct.toFixed(2)}%`);
console.log(`\ncall: ${signal.bias} ${out.call.agreeing}/${out.call.windows} lookbacks`);
for (const [w, v] of Object.entries(byWindow)) {
  console.log(`  ${String(w).padStart(4)}d  long ${String(v.longPositive).padStart(6)}  short ${String(v.shortPositive).padStart(6)}`);
}
