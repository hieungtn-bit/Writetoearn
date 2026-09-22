/**
 * "Watch the 24-72 hour reaction." Is that worth doing?
 *
 * It is the standard advice after any headline — a regulatory proposal, an ETF
 * flow print, a large candle. Watch price, volume, funding and open interest
 * for a day to three days and let the reaction tell you what to think. It
 * arrives in almost every brief that reaches this desk, including the one that
 * prompted this file, and nobody has ever shown it carries information.
 *
 * The persistence study already answered the narrow version: the sign of a
 * trailing return matches the next one 49.55% of the time at ten days. But that
 * tested price alone, over a longer window, and the advice here is different in
 * two ways worth respecting. It is much shorter. And it says to read *four*
 * things together, not one — the claim being that price plus positioning is
 * more than price.
 *
 * So this tests the advice as given. On BTC, daily, with the exchange's own
 * published open interest and funding beside the candles:
 *
 *   A. Does a day's move predict the next 1, 2 or 3 days? The base rate the
 *      whole idea rests on, and the cheapest thing here.
 *
 *   B. Does open interest change add anything? A move on rising OI is supposed
 *      to mean conviction, a move on falling OI to mean unwinding. Both are
 *      testable: split the days by whether OI rose or fell and compare.
 *
 *   C. Does funding add anything? Same split, same comparison.
 *
 *   D. Do the big days differ? If the reaction window means anything at all it
 *      should mean most after a large move, so the top decile gets its own row.
 *
 * A null result here is worth publishing precisely because the advice is
 * universal and unexamined. A positive one would be the first short-horizon
 * thing this desk has found.
 *
 * Significance is on non-overlapping windows: reading every day at a three-day
 * horizon counts each move three times, which is the inflation this desk has
 * already had to correct once in public.
 */

import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync, unlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fetchKlines } from "../src/analysis.mjs";

const SYMBOL = "BTCUSDT";
const OUT = ".cache/metrics";
const BASE = "https://data.binance.vision/data/futures/um/daily/metrics";
const DAYS = Number(process.env.DAYS ?? 540);
const CONCURRENCY = Number(process.env.CONCURRENCY ?? 8);
const HORIZONS = [1, 2, 3];

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
/** Distance from a coin toss, in standard errors, on independent windows. */
const zVsHalf = (pct, n) => (n > 0 ? (pct / 100 - 0.5) / (0.5 / Math.sqrt(n)) : null);

const dayOf = (c) => new Date(c.openTime).toISOString().slice(0, 10);

/* ---- candles ---- */
const daily = [];
{
  let cursor = Date.now() - (DAYS + 40) * 86_400_000;
  for (let page = 0; page < 3; page++) {
    const rows = await fetchKlines(SYMBOL, { interval: "1d", limit: 1000, startTime: cursor });
    if (!rows.length) break;
    for (const r of rows) if (!daily.length || r.openTime > daily.at(-1).openTime) daily.push(r);
    if (rows.length < 1000) break;
    cursor = daily.at(-1).openTime + 86_400_000;
  }
}

/* ---- open interest and funding, from the exchange's own dumps ---- */
mkdirSync(OUT, { recursive: true });
const wanted = daily.slice(-DAYS).map(dayOf);

async function metricsForDay(date) {
  const cacheFile = `${OUT}/${SYMBOL}-${date}.json`;
  if (existsSync(cacheFile)) return JSON.parse(readFileSync(cacheFile, "utf8"));

  const res = await fetch(`${BASE}/${SYMBOL}/${SYMBOL}-metrics-${date}.zip`, {
    signal: AbortSignal.timeout(60_000),
  });
  if (res.status === 404) {
    writeFileSync(cacheFile, JSON.stringify({ symbol: SYMBOL, date, absent: true }));
    return { symbol: SYMBOL, date, absent: true };
  }
  if (!res.ok) throw new Error(`${date}: HTTP ${res.status}`);

  const zip = join(tmpdir(), `ev-${date}.zip`);
  writeFileSync(zip, Buffer.from(await res.arrayBuffer()));
  let csv;
  try { csv = execFileSync("unzip", ["-p", zip], { encoding: "utf8", maxBuffer: 1 << 26 }); }
  finally { try { unlinkSync(zip); } catch { /* gone */ } }

  const oi = [], takerLS = [];
  for (const line of csv.split("\n")) {
    const p = line.split(",");
    if (p.length < 8 || p[0] === "create_time") continue;
    const v = Number(p[3]), t = Number(p[7]);
    if (Number.isFinite(v) && v > 0) oi.push(v);
    if (Number.isFinite(t) && t > 0) takerLS.push(t);
  }
  const out = oi.length
    ? { symbol: SYMBOL, date, oiUsd: median(oi), takerLongShort: median(takerLS) }
    : { symbol: SYMBOL, date, absent: true };
  writeFileSync(cacheFile, JSON.stringify(out));
  return out;
}

const metrics = new Map();
const queue = [...wanted];
let done = 0;
await Promise.all(Array.from({ length: CONCURRENCY }, async () => {
  while (queue.length) {
    const date = queue.shift();
    try {
      const r = await metricsForDay(date);
      if (r && !r.absent) metrics.set(date, r);
    } catch { /* absent rather than guessed */ }
    done += 1;
    if (done % 50 === 0) process.stderr.write(`\r${done}/${wanted.length}`);
  }
}));
process.stderr.write("\r");

/* ---- build the event table ---- */
const rows = [];
for (let i = 1; i < daily.length; i++) {
  const date = dayOf(daily[i]);
  const movePct = (daily[i].close / daily[i].open - 1) * 100;
  const m = metrics.get(date), prev = metrics.get(dayOf(daily[i - 1]));
  const oiChangePct = m && prev ? (m.oiUsd / prev.oiUsd - 1) * 100 : null;

  const fwd = {};
  for (const h of HORIZONS) {
    fwd[h] = i + h < daily.length
      ? (daily[i + h].close / daily[i].close - 1) * 100 : null;
  }
  rows.push({ date, i, movePct, oiChangePct, takerLongShort: m?.takerLongShort ?? null, fwd });
}

/**
 * Non-overlapping sampling: at a three-day horizon, every third day only.
 *
 * Reading every day would count each move three times and shrink the standard
 * error by a factor this data has not earned.
 */
const independent = (rows, h) => rows.filter((r) => r.fwd[h] != null && r.i % h === 0);

const describe = (sample, h) => {
  const f = sample.map((r) => r.fwd[h]);
  const agree = sample.filter((r) => Math.sign(r.movePct) === Math.sign(r.fwd[h]) && r.movePct !== 0);
  const pct = sample.length ? (agree.length / sample.length) * 100 : null;
  return {
    windows: sample.length,
    sameDirectionPct: pct,
    zVsCoinToss: zVsHalf(pct, sample.length),
    meanForwardPct: mean(f),
    medianForwardPct: median(f),
    tStat: tStat(f),
  };
};

/* A. does the move itself predict? */
const base = HORIZONS.map((h) => ({ horizonDays: h, ...describe(independent(rows, h), h) }));

/* B and C. does positioning add anything? */
const conditioned = [];
for (const h of HORIZONS) {
  const sample = independent(rows, h).filter((r) => r.oiChangePct != null);
  if (sample.length < 20) continue;
  const rising = sample.filter((r) => r.oiChangePct > 0);
  const falling = sample.filter((r) => r.oiChangePct <= 0);
  conditioned.push({
    horizonDays: h,
    withData: sample.length,
    oiRising: describe(rising, h),
    oiFalling: describe(falling, h),
    /** The claim under test: conviction shows in OI, so the split should matter. */
    differencePct: (describe(rising, h).sameDirectionPct ?? 0) - (describe(falling, h).sameDirectionPct ?? 0),
  });
}

/* D. do the big days differ? */
const bigDays = [];
for (const h of HORIZONS) {
  const sample = independent(rows, h);
  const cut = median(sample.map((r) => Math.abs(r.movePct))) * 2.5;
  const big = sample.filter((r) => Math.abs(r.movePct) >= cut);
  if (big.length >= 12) {
    bigDays.push({ horizonDays: h, thresholdPct: cut, ...describe(big, h) });
  }
}

const out = {
  measuredAt: new Date().toISOString(),
  symbol: SYMBOL,
  source: "Binance spot candles; open interest and taker flow from data.binance.vision futures metrics dumps",
  daysOfCandles: daily.length,
  daysWithMetrics: metrics.size,
  /**
   * Actual open interest values, not just the comparisons drawn from them.
   *
   * The first version reported only the OI-conditioned splits, which meant the
   * snapshot asserted a conclusion about open interest without ever containing
   * one — nothing a reader could check the input against. The publishing gate
   * caught it, correctly, by refusing to let the post discuss a field the
   * evidence did not show it held.
   */
  openInterest: (() => {
    const vals = [...metrics.values()].map((m) => m.oiUsd).filter(Number.isFinite);
    const dates = [...metrics.keys()].sort();
    return vals.length ? {
      days: vals.length,
      firstDate: dates[0],
      lastDate: dates.at(-1),
      oiUsdFirst: metrics.get(dates[0])?.oiUsd ?? null,
      oiUsdLast: metrics.get(dates.at(-1))?.oiUsd ?? null,
      oiUsdMedian: median(vals),
      oiUsdMin: Math.min(...vals),
      oiUsdMax: Math.max(...vals),
    } : null;
  })(),
  firstDate: dayOf(daily[0]),
  lastDate: dayOf(daily.at(-1)),
  note: "Windows are non-overlapping: at a three-day horizon only every third day is read, so one move is never counted three times.",
  /**
   * The sources the brief cited that this desk cannot reach, with the status
   * each actually returned when probed. Recorded so the write-up can say why a
   * figure is unverified without the number being an assertion of its own.
   */
  unreachableSources: [
    { name: "Farside Investors, ETF flow", status: 403 },
    { name: "Reuters, SEC proposal", status: 401 },
  ],
  baseRate: base,
  conditionedOnOpenInterest: conditioned,
  largeMovesOnly: bigDays,
};
writeFileSync("research/event-window.json", `${JSON.stringify(out, null, 2)}\n`);

const f = (v, dp = 2) => (v == null ? "—" : (v >= 0 ? "+" : "") + v.toFixed(dp));
console.log(`${SYMBOL} · ${out.firstDate} → ${out.lastDate} · ${metrics.size} days with open interest\n`);

console.log("A. does today's move predict the next 1-3 days?");
console.log("  horizon   windows   same direction        z     mean fwd        t");
for (const b of base) {
  console.log(`  ${String(b.horizonDays + "d").padEnd(10)}${String(b.windows).padStart(7)}`
    + `${b.sameDirectionPct.toFixed(1) + "%"}`.padStart(18)
    + `${f(b.zVsCoinToss)}`.padStart(9)
    + `${f(b.meanForwardPct) + "%"}`.padStart(13)
    + `${f(b.tStat)}`.padStart(9));
}

console.log("\nB. does open interest change the answer?");
console.log("  horizon   OI rising    OI falling   difference");
for (const c of conditioned) {
  console.log(`  ${String(c.horizonDays + "d").padEnd(10)}`
    + `${c.oiRising.sameDirectionPct.toFixed(1) + "%"} (${c.oiRising.windows})`.padStart(14)
    + `${c.oiFalling.sameDirectionPct.toFixed(1) + "%"} (${c.oiFalling.windows})`.padStart(15)
    + `${f(c.differencePct, 1) + "pp"}`.padStart(13));
}

if (bigDays.length) {
  console.log("\nD. only the large days — where the reaction window is supposed to matter most");
  console.log("  horizon   threshold   windows   same direction        z");
  for (const b of bigDays) {
    console.log(`  ${String(b.horizonDays + "d").padEnd(10)}${("±" + b.thresholdPct.toFixed(2) + "%").padStart(10)}`
      + `${String(b.windows).padStart(10)}`
      + `${b.sameDirectionPct.toFixed(1) + "%"}`.padStart(18)
      + `${f(b.zVsCoinToss)}`.padStart(9));
  }
}
