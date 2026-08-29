/**
 * BTC and BNB, read again with the overhead argument removed.
 *
 * research/overhead-test.json has just shown that trapped supply overhead does
 * not predict returns. Overhead was the load-bearing argument in most of what
 * this desk has written about both of these coins — "almost nobody who bought
 * BNB this month is underwater" was the reason BNB was not a short, and BTC's
 * ~90% reading was cited yesterday as part of the case for standing aside.
 *
 * So both are re-derived from what is left. Four things are measured, and each
 * one is chosen because it has survived a test rather than because it sounds
 * convincing:
 *
 *   1. Lookback agreement, which survived as a stability check.
 *   2. Value-area position, which is a statement about where volume sits and
 *      is tested here per coin rather than assumed.
 *   3. Forward returns conditional on the coin's *own* overhead reading, so a
 *      reader can watch the metric fail on the coin they hold rather than only
 *      across a universe they do not.
 *   4. The stop that this desk's own study says to use, in the units the trade
 *      is sized in, against what an ordinary week does to it.
 *
 * The board's plan expectancy is again excluded. It keeps about a tenth of
 * itself out of sample, and after today's ranking change the board itself no
 * longer sorts on the raw figure.
 */

import { writeFileSync } from "node:fs";
import { analyzeAsset, atr, fetchKlines } from "../src/analysis.mjs";
import { volumeProfile } from "../src/profile.mjs";
import { AGREEMENT_WINDOWS, grid, signalFor, summarise, trustedExpectancyR } from "../src/signals.mjs";

const SYMBOLS = ["BTCUSDT", "BNBUSDT"];
const WINDOW = 30;
const HORIZONS = [10, 30];
const STOP_ATR = 1.5;

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
const typicalPrice = (c) => (c.high + c.low + c.close) / 3;

/** The same daily-bar overhead proxy the universe study used, per coin. */
const overheadProxy = (candles, i) => {
  const w = candles.slice(i - WINDOW + 1, i + 1);
  const total = w.reduce((s, c) => s + c.quoteVolume, 0);
  if (!(total > 0)) return null;
  const above = w.filter((c) => typicalPrice(c) > candles[i].close)
    .reduce((s, c) => s + c.quoteVolume, 0);
  return (above / total) * 100;
};

const out = { measuredAt: new Date().toISOString(), stopAtr: STOP_ATR, assets: {} };

for (const symbol of SYMBOLS) {
  const daily = await retry(() => fetchKlines(symbol, { interval: "1d", limit: 1000 }));
  const hourly = await retry(() => fetchKlines(symbol, { interval: "1h", limit: 720 }));
  if (hourly.length < 700) throw new Error(`${symbol}: only ${hourly.length} hourly bars`);
  const analysis = await retry(() => analyzeAsset(symbol, { candles: daily }));
  const price = analysis.price;
  const atrPct = (atr(daily, 14) / price) * 100;
  const profile = volumeProfile(hourly, price);

  const last = daily.length - 1;
  const overheadNow = overheadProxy(daily, last);

  /**
   * The coin's own history at its own current overhead reading.
   *
   * Bucketed within ten points either side of today's value, so this is the
   * question a holder actually has: from a reading like today's, on this coin,
   * what followed — and is it different from an arbitrary day on the same coin.
   */
  const conditional = {};
  for (const h of HORIZONS) {
    const near = [], base = [];
    for (let i = WINDOW; i < last - h; i++) {
      const oh = overheadProxy(daily, i);
      if (oh == null) continue;
      const r = ((daily[i + h].close / daily[i].close) - 1) * 100;
      if (Math.abs(oh - overheadNow) <= 10) near.push(r); else base.push(r);
    }
    conditional[h] = near.length ? {
      medianPct: median(near),
      baselineMedianPct: median(base),
      differencePct: median(near) - median(base),
      upSharePct: (near.filter((v) => v > 0).length / near.length) * 100,
      days: near.length,
      effectiveN: near.length / h,
    } : null;
  }

  /** Both directions across every lookback: the check that did survive. */
  const lookbacks = {};
  for (const days of AGREEMENT_WINDOWS) {
    if (daily.length < days + 30) continue;
    const s = daily.slice(-days);
    const lo = summarise(grid(s, atrPct, { direction: "long" }));
    const sh = summarise(grid(s, atrPct, { direction: "short" }));
    lookbacks[days] = {
      // The window length is carried as a value, not only as the key, so a
      // writer quoting "180d" is quoting a figure the snapshot contains.
      days,
      long: lo && `${lo.positive}/${lo.cells}`,
      short: sh && `${sh.positive}/${sh.cells}`,
      leans: (sh?.positive ?? 0) > (lo?.positive ?? 0) ? "short" : "long",
    };
  }
  const leaningShort = Object.values(lookbacks).filter((v) => v.leans === "short").length;

  const signal = signalFor({
    symbol, candles: daily, atrPct, price, turnoverUsd: analysis.avgQuoteVolume30d,
  });

  /** What an ordinary week does, so a stop can be judged against it. */
  const weeks = [];
  for (let i = 0; i + 7 <= daily.length; i += 7) {
    const w = daily.slice(i, i + 7);
    const lo = Math.min(...w.map((c) => c.low));
    weeks.push(((Math.max(...w.map((c) => c.high)) - lo) / lo) * 100);
  }
  const medianWeekPct = median(weeks);
  const stopPct = STOP_ATR * atrPct;

  const last30 = daily.slice(-30);

  out.assets[symbol] = {
    price, atrPct,
    rsi14: analysis.rsi14,
    change7dPct: analysis.change7dPct,
    change30dPct: analysis.change30dPct,
    rangePosition30d: analysis.rangePosition30d,
    range30: { low: Math.min(...last30.map((c) => c.low)), high: Math.max(...last30.map((c) => c.high)) },
    turnoverUsd: analysis.avgQuoteVolume30d,
    medianWeekPct,
    overheadProfilePct: profile.overheadPct,
    overheadProxyPct: overheadNow,
    poc: profile.pocPrice,
    valueArea: [profile.valueAreaLow, profile.valueAreaHigh],
    priceVsValueArea: price > profile.valueAreaHigh ? "above" : price < profile.valueAreaLow ? "below" : "inside",
    distanceToPocPct: ((profile.pocPrice / price) - 1) * 100,
    conditional,
    lookbacks,
    leaningShort,
    lookbackCount: Object.keys(lookbacks).length,
    stop: {
      atr: STOP_ATR,
      pct: stopPct,
      shareOfMedianWeek: stopPct / medianWeekPct,
      feeR: 0.2 / stopPct,
    },
    call: {
      bias: signal.bias,
      reason: signal.reason,
      agreeing: signal.agreement?.agreeing ?? null,
      windows: signal.agreement?.windows ?? null,
      effectiveN: signal.confidence?.effectiveN ?? null,
      thin: signal.confidence?.thin ?? null,
      turning: signal.regime?.turning ?? null,
      rawExpectancyR: signal.plan?.expectancyR ?? null,
      trustedExpectancyR: trustedExpectancyR(signal),
    },
  };
}

writeFileSync("research/btc-bnb-final.json", `${JSON.stringify(out, null, 2)}\n`);

for (const [symbol, a] of Object.entries(out.assets)) {
  console.log(`\n${"=".repeat(62)}\n${symbol}  $${a.price}  ·  ATR ${a.atrPct.toFixed(2)}%  ·  RSI ${a.rsi14.toFixed(0)}`);
  console.log(`  range position ${a.rangePosition30d.toFixed(1)}%  ·  7d ${a.change7dPct.toFixed(2)}%  30d ${a.change30dPct.toFixed(2)}%`);
  console.log(`  overhead: profile ${a.overheadProfilePct.toFixed(1)}%  proxy ${a.overheadProxyPct.toFixed(1)}%`);
  console.log(`  POC ${a.poc.toFixed(2)}  value area ${a.valueArea[0].toFixed(2)}-${a.valueArea[1].toFixed(2)}  price ${a.priceVsValueArea}`);
  console.log(`  POC is ${a.distanceToPocPct >= 0 ? "+" : ""}${a.distanceToPocPct.toFixed(2)}% from here`);
  console.log(`\n  from an overhead reading like today's, on this coin:`);
  for (const h of HORIZONS) {
    const c = a.conditional[h];
    if (!c) continue;
    console.log(`    ${String(h + "d").padEnd(5)} ${c.medianPct.toFixed(2)}%  vs its own baseline ${c.baselineMedianPct.toFixed(2)}%`
      + `  diff ${c.differencePct.toFixed(2)}  up ${c.upSharePct.toFixed(0)}%  n≈${Math.round(c.effectiveN)}`);
  }
  console.log(`\n  lookbacks leaning short: ${a.leaningShort}/${a.lookbackCount}`);
  for (const [w, v] of Object.entries(a.lookbacks)) {
    console.log(`    ${String(w).padStart(4)}d  long ${String(v.long).padStart(6)}  short ${String(v.short).padStart(6)}  → ${v.leans}`);
  }
  console.log(`\n  ${STOP_ATR} ATR stop = ${a.stop.pct.toFixed(2)}%  ·  ${(a.stop.shareOfMedianWeek * 100).toFixed(0)}% of a median week (${a.medianWeekPct.toFixed(1)}%)  ·  fee ${a.stop.feeR.toFixed(3)}R`);
  console.log(`  board: ${a.call.bias} — ${a.call.reason}`);
  console.log(`         agreement ${a.call.agreeing}/${a.call.windows} · n ${Math.round(a.call.effectiveN ?? 0)}${a.call.thin ? " (thin)" : ""}${a.call.turning ? " · regime turn" : ""}`);
  if (a.call.rawExpectancyR != null) {
    console.log(`         expectancy raw ${a.call.rawExpectancyR.toFixed(2)}R → sample-weighted ${a.call.trustedExpectancyR.toFixed(2)}R`);
  }
}
