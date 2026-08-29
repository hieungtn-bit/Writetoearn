/**
 * BNB and BTC, measured — including the overhead figure two readers in a row
 * have now estimated as "medium" when it is close to zero.
 *
 * Overhead is computed twice on purpose. `computeStageMetrics` charges a whole
 * daily bar to one side of the current price, which was measured this week to
 * carry an error of up to eleven points where price sits mid-profile. So a
 * proper volume profile is built alongside it from hourly bars, and both are
 * reported. Where the two agree, the number is safe to publish.
 *
 * BTC gets the same treatment because it is the thing the rest of the board
 * depends on, and because the board currently refuses to call it — a refusal
 * is worth explaining rather than leaving as a blank.
 */

import { writeFileSync } from "node:fs";
import { analyzeAsset, atr, fetchKlines } from "../src/analysis.mjs";
import { AGREEMENT_WINDOWS, grid, summarise, signalFor } from "../src/signals.mjs";
import { computeStageMetrics, stageOf } from "../src/stage.mjs";

const BINS = 200, PROFILE_DAYS = 30;

const median = (xs) => {
  const s = [...xs].sort((a, b) => a - b);
  return s.length % 2 ? s[s.length >> 1] : (s[s.length / 2 - 1] + s[s.length / 2]) / 2;
};

/** Volume at price from hourly bars, spread across each bar's range by overlap. */
function volumeProfile(hourly, price) {
  const lo = Math.min(...hourly.map((c) => c.low));
  const hi = Math.max(...hourly.map((c) => c.high));
  const w = (hi - lo) / BINS;
  const bins = new Array(BINS).fill(0);
  for (const c of hourly) {
    const span = c.high - c.low;
    if (span <= 0) {
      bins[Math.min(BINS - 1, Math.max(0, Math.floor((c.close - lo) / w)))] += c.quoteVolume;
      continue;
    }
    const f = Math.max(0, Math.floor((c.low - lo) / w));
    const l = Math.min(BINS - 1, Math.floor((c.high - lo) / w));
    for (let i = f; i <= l; i++) {
      const ov = Math.min(c.high, lo + (i + 1) * w) - Math.max(c.low, lo + i * w);
      if (ov > 0) bins[i] += c.quoteVolume * (ov / span);
    }
  }
  const total = bins.reduce((s, v) => s + v, 0);
  let pocI = 0;
  for (let i = 1; i < BINS; i++) if (bins[i] > bins[pocI]) pocI = i;
  let lower = pocI, upper = pocI, acc = bins[pocI];
  while (acc < total * 0.7 && (lower > 0 || upper < BINS - 1)) {
    const below = lower > 0 ? bins[lower - 1] : -1;
    const above = upper < BINS - 1 ? bins[upper + 1] : -1;
    if (above >= below) { upper += 1; acc += bins[upper]; } else { lower -= 1; acc += bins[lower]; }
  }
  let overhead = 0;
  for (let i = 0; i < BINS; i++) if (lo + (i + 0.5) * w > price) overhead += bins[i];
  return {
    pocPrice: lo + (pocI + 0.5) * w,
    valueAreaLow: lo + lower * w,
    valueAreaHigh: lo + (upper + 1) * w,
    overheadPct: (overhead / total) * 100,
  };
}

const btcDaily = await fetchKlines("BTCUSDT", { interval: "1d", limit: 1000 });
const btcRets = btcDaily.slice(1).map((c, i) => Math.log(c.close / btcDaily[i].close));

const rows = {};
for (const name of ["BNB", "BTC"]) {
  const symbol = `${name}USDT`;
  const candles = await fetchKlines(symbol, { interval: "1d", limit: 1000 });
  const hourly = await fetchKlines(symbol, { interval: "1h", limit: PROFILE_DAYS * 24 });
  const analysis = await analyzeAsset(symbol, { candles });
  const price = analysis.price;
  const atrPct = (atr(candles, 14) / price) * 100;
  const stage = await stageOf(name).catch(() => null);
  const daily30 = computeStageMetrics(candles.slice(-PROFILE_DAYS), price);
  const profile = volumeProfile(hourly, price);

  const last30 = candles.slice(-30);
  const lo30 = Math.min(...last30.map((c) => c.low));
  const hi30 = Math.max(...last30.map((c) => c.high));

  const highs = candles.map((c) => c.high);
  const ath = Math.max(...highs);
  const athDate = new Date(candles[highs.indexOf(ath)].openTime).toISOString().slice(0, 10);
  const last90 = candles.slice(-90);
  const recentHigh = Math.max(...last90.map((c) => c.high));

  const weeks = [];
  for (let i = 0; i + 7 <= candles.length; i += 7) {
    const w = candles.slice(i, i + 7);
    const l = Math.min(...w.map((c) => c.low));
    weeks.push(((Math.max(...w.map((c) => c.high)) - l) / l) * 100);
  }

  /** Both directions, every lookback — the stability check from post 70. */
  const byWindow = {};
  for (const days of AGREEMENT_WINDOWS) {
    if (candles.length < days + 30) continue;
    const s = candles.slice(-days);
    const long = summarise(grid(s, atrPct, { direction: "long" }));
    const short = summarise(grid(s, atrPct, { direction: "short" }));
    byWindow[days] = {
      long: long && { positive: `${long.positive}/${long.cells}`, medianR: long.medianExpectancyR },
      short: short && { positive: `${short.positive}/${short.cells}`, medianR: short.medianExpectancyR },
    };
  }

  const signal = signalFor({
    symbol, candles, atrPct, price,
    turnoverUsd: Number.isFinite(analysis.avgQuoteVolume30d) ? analysis.avgQuoteVolume30d : null,
  });

  let beta = null, r = null;
  if (name !== "BTC") {
    const a = candles.slice(1).map((c, i) => Math.log(c.close / candles[i].close)).slice(-30);
    const b = btcRets.slice(-30);
    const mean = (xs) => xs.reduce((s, x) => s + x, 0) / xs.length;
    const ma = mean(a), mb = mean(b);
    const cov = a.reduce((s, x, i) => s + (x - ma) * (b[i] - mb), 0) / (a.length - 1);
    const varB = b.reduce((s, x) => s + (x - mb) ** 2, 0) / (b.length - 1);
    const sdA = Math.sqrt(a.reduce((s, x) => s + (x - ma) ** 2, 0) / (a.length - 1));
    beta = cov / varB;
    r = cov / (sdA * Math.sqrt(varB));
  }

  rows[name] = {
    price, atrPct,
    sma20: analysis.sma20, sma50: analysis.sma50, sma200: analysis.sma200,
    rsi14: analysis.rsi14,
    range30: { low: lo30, high: hi30, widthPct: ((hi30 - lo30) / lo30) * 100, positionPct: analysis.rangePosition30d },
    overhead: {
      byDailyBarsPct: daily30.underwaterPct,
      byProfilePct: profile.overheadPct,
      agreeWithin2Points: Math.abs(daily30.underwaterPct - profile.overheadPct) < 2,
    },
    profile,
    vwap30d: daily30.vwap,
    volumeTrendPct: stage?.volumeTrendPct ?? null,
    stage: stage?.stage ?? null,
    turnoverUsd: analysis.avgQuoteVolume30d,
    ath, athDate, drawdownFromAthPct: (1 - price / ath) * 100,
    recentHigh, fromRecentHighPct: (price / recentHigh - 1) * 100,
    medianWeekPct: median(weeks),
    beta, r, rSquaredPct: r == null ? null : r * r * 100,
    byWindow,
    call: {
      bias: signal.bias, reason: signal.reason, tradeable: signal.tradeable,
      agreeing: signal.agreement?.agreeing ?? null,
      windows: signal.agreement?.windows ?? null,
      plan: signal.plan && {
        horizonDays: signal.plan.horizonDays, entry: signal.plan.entry,
        stop: signal.plan.stop, target: signal.plan.target,
        stopPct: signal.plan.stopPct, hitPct: signal.plan.hitPct,
        expectancyR: signal.plan.expectancyR, effectiveN: signal.plan.effectiveN,
      },
      recentLongR: signal.regime?.recentLongR ?? null,
      recentShortR: signal.regime?.recentShortR ?? null,
    },
  };
}

/** BTC dominance, for the claim that this is or is not an altseason. */
let dominance = null;
try {
  const g = await fetch("https://api.coingecko.com/api/v3/global").then((x) => x.json());
  dominance = g.data.market_cap_percentage.btc;
} catch { /* reported as unavailable rather than guessed */ }

const out = { measuredAt: new Date().toISOString(), btcDominancePct: dominance, ...rows };
writeFileSync("research/bnb-btc.json", `${JSON.stringify(out, null, 2)}\n`);

for (const [name, d] of Object.entries(rows)) {
  console.log(`\n=== ${name}  $${d.price}`);
  console.log(`  call ${d.call.bias} ${d.call.agreeing == null ? "" : `${d.call.agreeing}/${d.call.windows}`} — ${d.call.reason}`);
  console.log(`  recent grid: long ${d.call.recentLongR?.toFixed(3)}R · short ${d.call.recentShortR?.toFixed(3)}R`);
  console.log(`  30d range $${d.range30.low} – $${d.range30.high} (${d.range30.widthPct.toFixed(1)}% wide) → position ${d.range30.positionPct.toFixed(1)}%`);
  console.log(`  overhead: daily-bar ${d.overhead.byDailyBarsPct.toFixed(1)}%  profile ${d.overhead.byProfilePct.toFixed(1)}%  agree=${d.overhead.agreeWithin2Points}`);
  console.log(`  POC $${d.profile.pocPrice.toFixed(2)}  value area $${d.profile.valueAreaLow.toFixed(2)}–$${d.profile.valueAreaHigh.toFixed(2)}  VWAP $${d.vwap30d.toFixed(2)}`);
  console.log(`  SMA20 ${d.sma20?.toFixed(2)} SMA50 ${d.sma50?.toFixed(2)} SMA200 ${d.sma200?.toFixed(2)} · RSI ${d.rsi14.toFixed(1)}`);
  console.log(`  volume trend ${d.volumeTrendPct?.toFixed(1)}% · stage ${d.stage} · turnover $${(d.turnoverUsd / 1e6).toFixed(1)}M`);
  console.log(`  ATH $${d.ath} (${d.athDate}) → ${d.drawdownFromAthPct.toFixed(1)}% · recent high $${d.recentHigh} → ${d.fromRecentHighPct.toFixed(1)}%`);
  console.log(`  ATR ${d.atrPct.toFixed(2)}% · median week ${d.medianWeekPct.toFixed(1)}%`);
  if (d.beta != null) console.log(`  beta ${d.beta.toFixed(2)} · r ${d.r.toFixed(2)} · BTC explains ${d.rSquaredPct.toFixed(1)}%`);
  for (const [w, v] of Object.entries(d.byWindow)) {
    console.log(`    ${String(w).padStart(4)}d  long ${String(v.long?.positive).padStart(6)} ${v.long?.medianR.toFixed(3).padStart(7)}R`
      + `   short ${String(v.short?.positive).padStart(6)} ${v.short?.medianR.toFixed(3).padStart(7)}R`);
  }
}
console.log(`\nBTC dominance: ${dominance == null ? "unavailable" : `${dominance.toFixed(2)}%`}`);
