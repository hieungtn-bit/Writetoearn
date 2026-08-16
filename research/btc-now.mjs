/**
 * Where BTC actually is, computed rather than read off a chart.
 *
 * Two things about this desk shape what a BTC readout is allowed to say.
 *
 * The persistence study measured whether the sign of a trailing return
 * predicts the next one: 50.70% at a month, inside one standard error of a coin
 * toss at every horizon tested. So every figure here describes the present. Not
 * one of them forecasts the next month, and anything phrased as though it did
 * would contradict a measurement this desk published four hours ago.
 *
 * The structural study then found the one thing that has held: alts bleed
 * against BTC, +0.2806R a month after funding across 79 months, positive in all
 * eight calendar years. That makes BTC something specific — not a call, but the
 * numeraire. The interesting BTC question is no longer "up or down", it is how
 * the rest of the market is priced against it, so that is measured too.
 *
 * Everything below is fetched at run time and written to research/btc-now.json
 * so any figure can be recomputed.
 */

import { existsSync, readFileSync, writeFileSync } from "node:fs";
import {
  atr, fetchKlines, pctChange, rangePosition, realizedVolatility, rsi,
} from "../src/analysis.mjs";
import { fetchFunding, fetchFundingHistory } from "../src/market.mjs";
import { volumeProfile } from "../src/profile.mjs";
import { signalFor } from "../src/signals.mjs";
import { liveUniverse } from "../src/universe.mjs";

const SYMBOL = "BTCUSDT";
const FUNDING_CACHE = ".cache/funding";

const retry = async (fn, n = 5) => {
  let last;
  for (let i = 0; i < n; i++) {
    try { return await fn(); } catch (e) { last = e; await new Promise((r) => setTimeout(r, 900 * (i + 1))); }
  }
  throw last;
};

const median = (xs) => {
  if (!xs.length) return null;
  const v = [...xs].sort((a, b) => a - b);
  return v.length % 2 ? v[v.length >> 1] : (v[v.length / 2 - 1] + v[v.length / 2]) / 2;
};

const [daily, hourly] = await Promise.all([
  retry(() => fetchKlines(SYMBOL, { interval: "1d", limit: 400 })),
  retry(() => fetchKlines(SYMBOL, { interval: "1h", limit: 720 })),
]);

const closes = daily.map((c) => c.close);
const price = closes.at(-1);

const window = (n) => daily.slice(-n);
const spanOf = (n) => {
  const w = window(n);
  const high = Math.max(...w.map((c) => c.high));
  const low = Math.min(...w.map((c) => c.low));
  return {
    days: n, high, low,
    positionPct: rangePosition(price, low, high),
    changePct: pctChange(w[0].open, price),
    fromHighPct: pctChange(high, price),
    fromLowPct: pctChange(low, price),
  };
};

const atrPct = (atr(daily, 14) / price) * 100;

/** Where the volume actually traded, rather than where the candles drew. */
const profile = volumeProfile(hourly, price);

/**
 * The engine's own read, printed with its own sample attached.
 *
 * The bias is included because withholding it would be its own kind of
 * dishonesty, and the sample size is printed beside it because the engine's own
 * threshold is twelve independent episodes and it is frequently under that.
 */
const turnoverUsd = daily.slice(-30).reduce((a, c) => a + c.quoteVolume, 0) / 30;
let signal = null;
try { signal = signalFor({ symbol: SYMBOL, candles: daily, atrPct, price, turnoverUsd }); }
catch { /* absent rather than guessed */ }

/* ---- funding: what it costs to be long or short right now ---- */
const fundingRates = existsSync(`${FUNDING_CACHE}/${SYMBOL}.json`)
  ? JSON.parse(readFileSync(`${FUNDING_CACHE}/${SYMBOL}.json`, "utf8")).rates
  : [];
const fundingSeriesEnd = fundingRates.length
  ? new Date(fundingRates.at(-1)[0]).toISOString().slice(0, 10) : null;
const recentFunding = (days) => {
  if (!fundingRates.length) return null;
  const cutoff = fundingRates.at(-1)[0] - days * 86_400_000;
  const slice = fundingRates.filter((r) => r[0] >= cutoff);
  if (!slice.length) return null;
  const perInterval = slice.reduce((a, r) => a + r[1], 0) / slice.length;
  return {
    days, intervals: slice.length,
    meanPerIntervalPct: perInterval * 100,
    annualisedPct: perInterval * 3 * 365 * 100,
    positiveSharePct: (slice.filter((r) => r[1] > 0).length / slice.length) * 100,
  };
};

const [liveNow, liveHistory] = await Promise.all([
  retry(() => fetchFunding(["BTC-USDT-SWAP"])).catch(() => null),
  retry(() => fetchFundingHistory("BTC-USDT-SWAP", { limit: 90 })).catch(() => null),
]);
const liveFunding = liveNow?.[0] || liveHistory ? {
  venue: liveHistory?.venue ?? liveNow?.[0]?.venue ?? null,
  nextRatePct: liveNow?.[0]?.fundingRatePct ?? null,
  latestSettledPct: liveHistory?.latestPct ?? null,
  latestSettledTime: liveHistory?.latestTime ?? null,
  annualised7dPct: liveHistory?.annualised7dPct ?? null,
  annualisedWindowPct: liveHistory?.annualisedPct ?? null,
  windowDays: liveHistory?.windowDays ?? null,
  negativeSharePct: liveHistory?.negativeSharePct ?? null,
} : null;

/* ---- BTC as the numeraire: how is the rest of the board priced against it ---- */
const { symbols } = await retry(() => liveUniverse({ limit: 60 }));
const alts = symbols.filter((s) => s !== SYMBOL).slice(0, 45);
const btcByDay = new Map(daily.map((c) => [new Date(c.openTime).toISOString().slice(0, 10), c.close]));

const relative = [];
for (const symbol of alts) {
  try {
    const alt = await retry(() => fetchKlines(symbol, { interval: "1d", limit: 120 }), 3);
    if (alt.length < 91) continue;
    const day = (c) => new Date(c.openTime).toISOString().slice(0, 10);
    const at = (i) => {
      const b = btcByDay.get(day(alt[i]));
      return b ? alt[i].close / b : null;
    };
    const now = at(alt.length - 1), m1 = at(alt.length - 31), m3 = at(alt.length - 91);
    if (!now || !m1 || !m3) continue;
    relative.push({ symbol, vs30dPct: (now / m1 - 1) * 100, vs90dPct: (now / m3 - 1) * 100 });
  } catch { /* skip rather than guess */ }
}

const beatingBtc30 = relative.filter((r) => r.vs30dPct > 0).length;
const beatingBtc90 = relative.filter((r) => r.vs90dPct > 0).length;

const out = {
  measuredAt: new Date().toISOString(),
  symbol: SYMBOL,
  price,
  spans: [7, 30, 90, 365].map(spanOf),
  volatility: {
    atrPct,
    stopAt15AtrPct: 1.5 * atrPct,
    // realizedVolatility already returns percent; multiplying again reported
    // BTC at 2192% annualised, which is the kind of figure a reader should
    // never have to catch for me.
    realizedVol30Pct: realizedVolatility(closes, { periods: 30 }),
    realizedVol90Pct: realizedVolatility(closes, { periods: 90 }),
  },
  momentum: { rsi14: rsi(closes, 14) },
  profile: {
    pointOfControl: profile.pocPrice,
    overheadPct: profile.overheadPct,
    valueAreaLow: profile.valueAreaLow,
    valueAreaHigh: profile.valueAreaHigh,
    priceVsValueArea: price > profile.valueAreaHigh ? "above"
      : price < profile.valueAreaLow ? "below" : "inside",
    hoursCovered: hourly.length,
  },
  turnoverUsd,
  engine: signal ? {
    bias: signal.bias,
    reason: signal.reason,
    effectiveN: signal.plan?.effectiveN ?? null,
    expectancyR: signal.plan?.expectancyR ?? null,
    agreeingWindows: signal.agreement?.agreeing ?? null,
    windows: signal.agreement?.windows ?? null,
    regimeTurning: signal.regime?.turning ?? null,
  } : null,
  funding: {
    /**
     * Two sources, labelled, never spliced into one series.
     *
     * The Binance dumps are monthly and stop at the last complete month, so
     * they cannot answer "what is funding now" — asking them produced a "7d"
     * window that was really the last week of July. The live rate comes from
     * the venue this desk already quotes for funding; the long history stays
     * on Binance's own book, since a rate from a different order book is a
     * different number.
     */
    live: liveFunding,
    history: {
      source: "data.binance.vision monthly dumps, Binance USDS-M perpetual",
      through: fundingSeriesEnd,
      windows: [30, 90, 365].map(recentFunding).filter(Boolean),
    },
  },
  asNumeraire: {
    altsMeasured: relative.length,
    beatingBtc30d: beatingBtc30,
    beatingBtc90d: beatingBtc90,
    medianAltVsBtc30dPct: median(relative.map((r) => r.vs30dPct)),
    medianAltVsBtc90dPct: median(relative.map((r) => r.vs90dPct)),
    strongest: [...relative].sort((a, b) => b.vs30dPct - a.vs30dPct).slice(0, 5),
    weakest: [...relative].sort((a, b) => a.vs30dPct - b.vs30dPct).slice(0, 5),
  },
  /** What this desk has measured about whether any of the above predicts. */
  standing: (() => {
    const p = existsSync("research/persistence.json")
      ? JSON.parse(readFileSync("research/persistence.json", "utf8")) : null;
    const s = existsSync("research/structural-edge.json")
      ? JSON.parse(readFileSync("research/structural-edge.json", "utf8")) : null;
    return {
      directionPersistence30dPct: p?.persistence?.["30"]?.matchPct ?? null,
      persistenceZ: p?.persistence?.["30"]?.zVsCoinToss ?? null,
      shortAltsVsBtcAfterFundingR: s?.matched?.vsBtcAfterFunding?.meanNetR ?? null,
      shortAltsVsBtcT: s?.matched?.vsBtcAfterFunding?.tStatByMonth ?? null,
      shortAltsVsUsdtR: s?.matched?.vsUsdt?.meanNetR ?? null,
      shortAltsVsUsdtT: s?.matched?.vsUsdt?.tStatByMonth ?? null,
    };
  })(),
};
writeFileSync("research/btc-now.json", `${JSON.stringify(out, null, 2)}\n`);

const f = (v, dp = 2) => (v == null ? "—" : (v >= 0 ? "+" : "") + v.toFixed(dp));
console.log(`BTC ${price.toLocaleString("en-US")} · ${out.measuredAt.slice(0, 16).replace("T", " ")}Z\n`);

console.log("where it sits");
console.log("  window      low          high        position   change   from high");
for (const s of out.spans) {
  console.log(`  ${String(s.days + "d").padEnd(9)}${Math.round(s.low).toLocaleString("en-US").padStart(10)}`
    + `${Math.round(s.high).toLocaleString("en-US").padStart(14)}`
    + `${s.positionPct.toFixed(1) + "%"}`.padStart(11)
    + `${f(s.changePct, 1) + "%"}`.padStart(9)
    + `${f(s.fromHighPct, 1) + "%"}`.padStart(12));
}

const v = out.volatility;
console.log(`\nvolatility  ATR ${v.atrPct.toFixed(2)}% · a 1.5 ATR stop is ${v.stopAt15AtrPct.toFixed(2)}%`
  + ` · realised 30d ${v.realizedVol30Pct.toFixed(1)}% vs 90d ${v.realizedVol90Pct.toFixed(1)}% annualised`);
console.log(`RSI(14)     ${out.momentum.rsi14.toFixed(0)}`);

const pr = out.profile;
console.log(`\nvolume profile, last ${pr.hoursCovered} hours`);
console.log(`  point of control ${Math.round(pr.pointOfControl).toLocaleString("en-US")}`
  + ` · value area ${Math.round(pr.valueAreaLow).toLocaleString("en-US")}–${Math.round(pr.valueAreaHigh).toLocaleString("en-US")}`
  + ` · price is ${pr.priceVsValueArea} it`);
console.log(`  ${pr.overheadPct.toFixed(1)}% of that volume traded above the current price`);

if (out.engine) {
  const e = out.engine;
  console.log(`\nthe engine   ${e.bias} — ${e.reason}`);
  // A WAIT carries no plan and no agreement count, so printing empty columns
  // for them dresses an absence up as a measurement.
  console.log(e.effectiveN == null
    ? "  no plan, so no sample and no lookback count to report"
    : `  sample ${e.effectiveN.toFixed(1)} independent episodes`
      + ` · lookbacks agreeing ${e.agreeingWindows}/${e.windows}`);
  console.log(`  regime turning: ${e.regimeTurning}`);
}

const lf = out.funding.live;
if (lf) {
  console.log(`\nfunding now — ${lf.venue}`);
  console.log(`  last settled ${f(lf.latestSettledPct, 4)}% at ${lf.latestSettledTime?.slice(0, 16).replace("T", " ")}Z`
    + ` · next ${f(lf.nextRatePct, 4)}%`);
  console.log(`  annualised: ${f(lf.annualised7dPct, 1)}% over 7d · ${f(lf.annualisedWindowPct, 1)}% over ${Math.round(lf.windowDays)}d`
    + ` · negative in ${lf.negativeSharePct?.toFixed(0)}% of periods`);
}
const fh = out.funding.history;
if (fh.windows.length) {
  console.log(`\nfunding history — Binance perpetual, through ${fh.through} (dumps are monthly, so this stops at the last complete month)`);
  console.log("  window    per 8h     annualised   intervals positive");
  for (const w of fh.windows) {
    console.log(`  ${String(w.days + "d").padEnd(10)}${f(w.meanPerIntervalPct, 4) + "%"}`.padEnd(24)
      + `${f(w.annualisedPct, 1) + "%"}`.padStart(9)
      + `${w.positiveSharePct.toFixed(0) + "%"}`.padStart(18));
  }
}

const n = out.asNumeraire;
console.log(`\nBTC as the numeraire — ${n.altsMeasured} liquid alts priced against it`);
console.log(`  beating BTC over 30d: ${n.beatingBtc30d}/${n.altsMeasured}`
  + ` · over 90d: ${n.beatingBtc90d}/${n.altsMeasured}`);
console.log(`  median alt vs BTC: ${f(n.medianAltVsBtc30dPct, 1)}% over 30d · ${f(n.medianAltVsBtc90dPct, 1)}% over 90d`);
console.log(`  strongest: ${n.strongest.map((r) => `${r.symbol.replace("USDT", "")} ${f(r.vs30dPct, 0)}%`).join("  ")}`);
console.log(`  weakest:   ${n.weakest.map((r) => `${r.symbol.replace("USDT", "")} ${f(r.vs30dPct, 0)}%`).join("  ")}`);

const st = out.standing;
console.log(`\nwhat this desk has measured about predicting any of it`);
console.log(`  direction persistence at a month: ${st.directionPersistence30dPct?.toFixed(2)}% (z ${f(st.persistenceZ, 2)}) — a coin toss`);
console.log(`  short alts vs USDT: ${f(st.shortAltsVsUsdtR, 4)}R, t ${st.shortAltsVsUsdtT?.toFixed(2)} — nothing`);
console.log(`  short alts vs BTC, after funding: ${f(st.shortAltsVsBtcAfterFundingR, 4)}R, t ${st.shortAltsVsBtcT?.toFixed(2)}`);
