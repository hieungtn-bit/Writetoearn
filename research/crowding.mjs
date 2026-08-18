/**
 * Is the one working trade being priced away, or is this just the alt cycle?
 *
 * Shorting liquid alts against BTC has paid +0.2866R a month for seventy-nine
 * months. 2026 is its weakest year since 2021. When I reported that, I said the
 * difference between "the cycle is against it" and "the edge is being arbitraged"
 * needed more months rather than more analysis.
 *
 * That was half wrong, and this file is the correction. Crowding leaves
 * fingerprints that are observable *now*: if everyone has piled into the same
 * short, the alt perpetuals carry more open interest, their funding turns
 * negative against BTC's, and the account ratios lean long against a short
 * crowd. None of that requires waiting.
 *
 * The futures API is geo-blocked here, but the public archive publishes daily
 * metrics files per symbol — open interest, the global account long/short ratio,
 * the top-trader ratio, and taker flow. Sampled weekly, because crowding is a
 * slow state and reading it daily would buy noise at thirty times the requests.
 *
 * Two questions, in order of how hard they are to argue with:
 *
 *   A. Has crowding trended? Compare the recent window against the earlier one.
 *      This needs no return data at all and no model — just whether the
 *      positioning against BTC looks more one-sided now than it did.
 *
 *   B. Does crowding at entry predict the trade's forward result? Join the
 *      weekly crowding reading to the trade's own per-rebalance series, which
 *      structural-edge exports precisely so this file does not have to
 *      re-implement the scoring and drift away from it.
 *
 * A finding either way is useful. If crowding has risen *and* predicts worse
 * returns, the edge is being competed away and the desk should say so while it
 * is still paying. If crowding is flat, 2026 is the cycle and the trade should
 * be left alone.
 */

import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync, unlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const KLINES = ".cache/klines";
const OUT = ".cache/metrics";
const BASE = "https://data.binance.vision/data/futures/um/daily/metrics";
const NUMERAIRE = "BTCUSDT";

const MAX_ALTS = Number(process.env.MAX_ALTS ?? 20);
const WEEKS = Number(process.env.WEEKS ?? 104);
const CONCURRENCY = Number(process.env.CONCURRENCY ?? 8);
const MIN_TURNOVER_USD = 2e6;

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
const welch = (a, b) => {
  const sd = (xs) => {
    const m = mean(xs);
    return Math.sqrt(xs.reduce((s, x) => s + (x - m) ** 2, 0) / (xs.length - 1));
  };
  if (a.length < 2 || b.length < 2) return null;
  const va = sd(a) ** 2 / a.length, vb = sd(b) ** 2 / b.length;
  return va + vb > 0 ? (mean(a) - mean(b)) / Math.sqrt(va + vb) : null;
};
const corr = (a, b) => {
  const n = Math.min(a.length, b.length);
  if (n < 3) return null;
  const ma = mean(a.slice(0, n)), mb = mean(b.slice(0, n));
  let num = 0, da = 0, db = 0;
  for (let i = 0; i < n; i++) {
    const x = a[i] - ma, y = b[i] - mb;
    num += x * y; da += x * x; db += y * y;
  }
  return da > 0 && db > 0 ? num / Math.sqrt(da * db) : null;
};

const dayOf = (c) => new Date(c.openTime).toISOString().slice(0, 10);

/* ---- universe: the liquid alts the trade actually touches, plus BTC ---- */
if (!existsSync(KLINES)) throw new Error("No candle cache. Run research/structural-edge.mjs first.");
const cached = [];
for (const f of readdirSync(KLINES).filter((n) => n.endsWith(".json"))) {
  const symbol = f.replace(/-\d{4}-\d{2}-\d{2}\.json$/, "");
  const daily = JSON.parse(readFileSync(`${KLINES}/${f}`, "utf8"));
  if (daily.length < 200) continue;
  const turnover = mean(daily.slice(-30).map((c) => c.quoteVolume));
  if (!(turnover >= MIN_TURNOVER_USD)) continue;
  cached.push({ symbol, turnover, lastDay: dayOf(daily.at(-1)) });
}
cached.sort((a, b) => b.turnover - a.turnover);
const alts = cached.filter((s) => s.symbol !== NUMERAIRE).slice(0, MAX_ALTS);
const universe = [{ symbol: NUMERAIRE }, ...alts].map((s) => s.symbol);

/** One sampled day per week, walking back from the freshest complete day. */
const latest = cached.map((s) => s.lastDay).sort().at(-1);
const sampleDays = [];
for (let w = 1; w <= WEEKS; w++) {
  const d = new Date(`${latest}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() - w * 7);
  sampleDays.push(d.toISOString().slice(0, 10));
}
sampleDays.reverse();

mkdirSync(OUT, { recursive: true });

/**
 * One symbol-day of derivatives metrics, reduced to daily medians.
 *
 * The archive publishes every five minutes; intraday swings in the account
 * ratio are noise for a question about positioning over months, so the day is
 * collapsed to its median before anything is compared.
 */
async function metricsForDay(symbol, date) {
  const cacheFile = `${OUT}/${symbol}-${date}.json`;
  if (existsSync(cacheFile)) return JSON.parse(readFileSync(cacheFile, "utf8"));

  const res = await fetch(`${BASE}/${symbol}/${symbol}-metrics-${date}.zip`, {
    signal: AbortSignal.timeout(60_000),
  });
  if (res.status === 404) {
    writeFileSync(cacheFile, JSON.stringify({ symbol, date, absent: true }));
    return { symbol, date, absent: true };
  }
  if (!res.ok) throw new Error(`${symbol} ${date}: HTTP ${res.status}`);

  const zip = join(tmpdir(), `mx-${symbol}-${date}.zip`);
  writeFileSync(zip, Buffer.from(await res.arrayBuffer()));
  let csv;
  try {
    csv = execFileSync("unzip", ["-p", zip], { encoding: "utf8", maxBuffer: 1 << 26 });
  } finally {
    try { unlinkSync(zip); } catch { /* already gone */ }
  }

  const oiUsd = [], accountLS = [], topLS = [], takerLS = [];
  for (const line of csv.split("\n")) {
    const p = line.split(",");
    if (p.length < 8 || p[0] === "create_time") continue;
    const oi = Number(p[3]), acc = Number(p[6]), top = Number(p[5]), tak = Number(p[7]);
    if (Number.isFinite(oi) && oi > 0) oiUsd.push(oi);
    if (Number.isFinite(acc) && acc > 0) accountLS.push(acc);
    if (Number.isFinite(top) && top > 0) topLS.push(top);
    if (Number.isFinite(tak) && tak > 0) takerLS.push(tak);
  }
  if (!oiUsd.length) {
    writeFileSync(cacheFile, JSON.stringify({ symbol, date, absent: true }));
    return { symbol, date, absent: true };
  }

  const out = {
    symbol, date,
    oiUsd: median(oiUsd),
    accountLongShort: median(accountLS),
    topTraderLongShort: median(topLS),
    takerLongShort: median(takerLS),
  };
  writeFileSync(cacheFile, JSON.stringify(out));
  return out;
}

const jobs = [];
for (const symbol of universe) for (const date of sampleDays) jobs.push([symbol, date]);
const total = jobs.length;
const rows = [];
let done = 0;

await Promise.all(Array.from({ length: CONCURRENCY }, async () => {
  while (jobs.length) {
    const [symbol, date] = jobs.shift();
    try {
      const r = await metricsForDay(symbol, date);
      if (r && !r.absent) rows.push(r);
    } catch { /* absent rather than guessed */ }
    done += 1;
    if (done % 25 === 0) process.stderr.write(`\r${done}/${total} ${symbol.padEnd(14)}`);
  }
}));
process.stderr.write("\r");

/* ---- weekly crowding readings ---- */
const byDate = {};
for (const r of rows) (byDate[r.date] ??= []).push(r);

const weekly = Object.keys(byDate).sort().map((date) => {
  const all = byDate[date];
  const btc = all.find((r) => r.symbol === NUMERAIRE) ?? null;
  const altRows = all.filter((r) => r.symbol !== NUMERAIRE);
  if (altRows.length < 5 || !btc) return null;

  const medAccount = median(altRows.map((r) => r.accountLongShort));
  const medTop = median(altRows.map((r) => r.topTraderLongShort));
  return {
    date,
    alts: altRows.length,
    altOiUsd: altRows.reduce((a, r) => a + r.oiUsd, 0),
    btcOiUsd: btc.oiUsd,
    /** Alt open interest relative to BTC's — how much of the risk sits in alts. */
    altOiShareOfBtc: altRows.reduce((a, r) => a + r.oiUsd, 0) / btc.oiUsd,
    altAccountLongShort: medAccount,
    btcAccountLongShort: btc.accountLongShort,
    /**
     * The crowding reading.
     *
     * A short crowd shows up as retail accounts leaning *long* against them —
     * the account ratio counts accounts, and the crowded professional short
     * sits opposite a mass of small longs. So a high alt ratio relative to
     * BTC's is the fingerprint of a crowded alt short.
     */
    accountRatioVsBtc: medAccount / btc.accountLongShort,
    topTraderVsBtc: medTop / btc.topTraderLongShort,
  };
}).filter(Boolean);

/* ---- A. has it trended? ---- */
const half = Math.floor(weekly.length / 2);
const early = weekly.slice(0, half), late = weekly.slice(half);
const compare = (pick) => ({
  early: mean(early.map(pick)),
  late: mean(late.map(pick)),
  changePct: mean(early.map(pick)) ? ((mean(late.map(pick)) / mean(early.map(pick))) - 1) * 100 : null,
  welchT: welch(late.map(pick), early.map(pick)),
});

const trend = {
  weeks: weekly.length,
  earlyFrom: early[0]?.date ?? null,
  earlyTo: early.at(-1)?.date ?? null,
  lateFrom: late[0]?.date ?? null,
  lateTo: late.at(-1)?.date ?? null,
  altOiShareOfBtc: compare((w) => w.altOiShareOfBtc),
  accountRatioVsBtc: compare((w) => w.accountRatioVsBtc),
  topTraderVsBtc: compare((w) => w.topTraderVsBtc),
};

/* ---- B. does it predict the trade? ---- */
const S = existsSync("research/structural-edge.json")
  ? JSON.parse(readFileSync("research/structural-edge.json", "utf8")) : null;

let prediction = null;
if (S?.monthlySeries?.length) {
  const paired = [];
  for (const m of S.monthlySeries) {
    if (m.afterFundingR == null) continue;
    // The crowding reading in force at entry: the latest weekly sample at or
    // before the rebalance. Never a later one — that would be look-ahead.
    const prior = weekly.filter((w) => w.date <= m.date);
    if (!prior.length) continue;
    const w = prior.at(-1);
    if ((Date.parse(m.date) - Date.parse(w.date)) > 21 * 86_400_000) continue;
    paired.push({ date: m.date, crowding: w.accountRatioVsBtc, oiShare: w.altOiShareOfBtc, r: m.afterFundingR });
  }

  if (paired.length >= 12) {
    const sorted = [...paired].sort((a, b) => a.crowding - b.crowding);
    const cut = Math.floor(sorted.length / 3);
    const low = sorted.slice(0, cut), high = sorted.slice(-cut);
    prediction = {
      pairedRebalances: paired.length,
      correlationCrowdingVsReturn: corr(paired.map((p) => p.crowding), paired.map((p) => p.r)),
      leastCrowdedThird: { rebalances: low.length, meanR: mean(low.map((p) => p.r)), tStat: tStat(low.map((p) => p.r)) },
      mostCrowdedThird: { rebalances: high.length, meanR: mean(high.map((p) => p.r)), tStat: tStat(high.map((p) => p.r)) },
      differenceR: mean(low.map((p) => p.r)) - mean(high.map((p) => p.r)),
      welchT: welch(low.map((p) => p.r), high.map((p) => p.r)),
    };
  }
}

const out = {
  measuredAt: new Date().toISOString(),
  source: "data.binance.vision futures daily metrics, USDS-M perpetuals",
  note: "The futures API answers 451 from here; these are the exchange's own published dumps, sampled one day per week.",
  altsTracked: alts.length,
  weeksRequested: WEEKS,
  weeksWithData: weekly.length,
  symbolDaysFetched: rows.length,
  trend,
  prediction,
  weekly,
};
writeFileSync("research/crowding.json", `${JSON.stringify(out, null, 2)}\n`);

const f = (v, dp = 3) => (v == null ? "—" : v.toFixed(dp));
console.log(`${alts.length} alts + BTC · ${weekly.length} weeks with data · ${rows.length} symbol-days\n`);

console.log("A. has positioning against BTC got more one-sided?");
console.log(`  ${trend.earlyFrom} → ${trend.earlyTo}   vs   ${trend.lateFrom} → ${trend.lateTo}`);
console.log("  measure                        earlier      recent    change    Welch t");
for (const [k, label] of [
  ["altOiShareOfBtc", "alt OI / BTC OI"],
  ["accountRatioVsBtc", "alt account L/S vs BTC"],
  ["topTraderVsBtc", "top trader L/S vs BTC"],
]) {
  const c = trend[k];
  console.log(`  ${label.padEnd(28)}${f(c.early).padStart(9)}${f(c.late).padStart(12)}`
    + `${(c.changePct >= 0 ? "+" : "") + c.changePct.toFixed(1) + "%"}`.padStart(10)
    + `${f(c.welchT, 2)}`.padStart(11));
}

if (prediction) {
  const p = prediction;
  console.log("\nB. does crowding at entry predict the trade's result?");
  console.log(`  ${p.pairedRebalances} rebalances matched to a crowding reading`);
  console.log(`  correlation crowding vs forward R: ${f(p.correlationCrowdingVsReturn, 3)}`);
  console.log(`  least crowded third: ${f(p.leastCrowdedThird.meanR)}R (${p.leastCrowdedThird.rebalances})`);
  console.log(`  most crowded third:  ${f(p.mostCrowdedThird.meanR)}R (${p.mostCrowdedThird.rebalances})`);
  console.log(`  difference ${f(p.differenceR)}R · Welch t ${f(p.welchT, 2)}`);
} else {
  console.log("\nB. not enough overlap between the crowding samples and the trade's rebalances.");
}
