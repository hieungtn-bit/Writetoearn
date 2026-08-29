/**
 * Auditing a multi-timeframe BTC note against the exchange, line by line.
 *
 * A reader sent a long BTC analysis with a WAIT recommendation and two
 * conditional triggers. The conclusion matches my own board, so this is not an
 * argument about direction — it is a check of the numbers underneath, which is
 * the part nobody does.
 *
 * Four kinds of claim are separable here:
 *
 *   1. Prices and levels, which the exchange settles outright.
 *   2. Arithmetic internal to the note — a stated reward-to-risk either follows
 *      from the stated entry, stop and target or it does not.
 *   3. Free public readings (dominance, the Fear & Greed index) that can be
 *      fetched and compared.
 *   4. On-chain and ETF figures, which are blocked from this host and are
 *      therefore recorded as unverified rather than waved through.
 *
 * The trigger structure itself is also testable. "Wait for a close above
 * resistance on rising volume, then enter" is a strategy, not a level, so it is
 * walked bar by bar over BTC's own history with the note's exact geometry —
 * path-aware, stop charged first when a bar reaches both.
 *
 * The four fields the note says it lacks for BNB and ICP are filled in from
 * measurement rather than left blank, because "data not available" is a claim
 * about the author's sources, not about the world.
 */

import { writeFileSync } from "node:fs";
import { analyzeAsset, atr, fetchKlines } from "../src/analysis.mjs";
import { volumeProfile } from "../src/profile.mjs";
import { walk } from "../src/signals.mjs";

const retry = async (fn, n = 6) => {
  let last;
  for (let i = 0; i < n; i++) {
    try { return await fn(); } catch (e) { last = e; await new Promise((r) => setTimeout(r, 1200 * (i + 1))); }
  }
  throw last;
};

const mid = ([a, b]) => (a + b) / 2;
const median = (xs) => {
  if (!xs.length) return null;
  const s = [...xs].sort((a, b) => a - b);
  const m = s.length >> 1;
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};

/** Exactly as written in the note. */
const NOTE = {
  statedPriceBand: [62500, 62800],
  statedAugustRange: [62200, 65400],
  statedSupport: [62200, 62400],
  statedResistance: [63800, 64500],
  statedFearGreed: 38,
  statedBtcDominancePct: 56.1,
  statedRealizedPrice: 52667,
  statedMvrv: 1.19,
  long: { entry: [63900, 64300], stop: [62200, 62400], tp1: [65800, 66200], tp2: [67000, 67500], statedRr: [1.8, 2.2] },
  short: { entry: [62000, 62300], stop: [63600, 63800], tp1: [60500, 60800], tp2: [59200, 59600], statedRr: [1.8, 2.2] },
  /** The alt levels the note offers qualitatively, so they can be sized. */
  icpTightRange: [2.0, 2.4],
  icpInvalidation: [2.00, 2.05],
  bnbInvalidation: [585, 590],
};

const daily = await retry(() => fetchKlines("BTCUSDT", { interval: "1d", limit: 1000 }));
const hourly = await retry(() => fetchKlines("BTCUSDT", { interval: "1h", limit: 720 }));
if (hourly.length < 700) throw new Error(`only ${hourly.length} hourly bars; the profile would be wrong`);
const analysis = await retry(() => analyzeAsset("BTCUSDT", { candles: daily }));
const price = analysis.price;
const atrPct = (atr(daily, 14) / price) * 100;
const profile = volumeProfile(hourly, price);

const iso = (c) => new Date(c.openTime).toISOString().slice(0, 10);
const august = daily.filter((c) => iso(c).startsWith("2026-08"));
const augustLow = Math.min(...august.map((c) => c.low));
const augustHigh = Math.max(...august.map((c) => c.high));
const lowestAugustClose = Math.min(...august.map((c) => c.close));
const lowestCloseDay = iso(august.find((c) => c.close === lowestAugustClose));
const today = daily.at(-1);

/** Lower highs since the month's peak — the note's structural claim. */
const peakIdx = august.findIndex((c) => c.high === augustHigh);
const sincePeak = august.slice(peakIdx);
const lowerHighs = sincePeak.every((c, k) => k === 0 || c.high < sincePeak[k - 1].high);

const avgVol30 = daily.slice(-30).reduce((s, c) => s + c.quoteVolume, 0) / 30;

/** Reward-to-risk, computed from the note's own numbers rather than asserted. */
const geometry = (side) => {
  const t = NOTE[side];
  const long = side === "long";
  const e = mid(t.entry), s = mid(t.stop);
  const riskPct = Math.abs(e - s) / e * 100;
  const leg = (band) => {
    const p = mid(band);
    const rewardPct = Math.abs(p - e) / e * 100;
    return { target: p, rewardPct, rr: rewardPct / riskPct, breakEvenHitPct: 100 / (1 + rewardPct / riskPct) };
  };
  // The most favourable corner of every band, which is the only reading under
  // which the note's stated ratio could be reached.
  const bestE = long ? t.entry[0] : t.entry[1];
  const bestS = long ? t.stop[1] : t.stop[0];
  const bestT = long ? t.tp2[1] : t.tp2[0];
  const bestRisk = Math.abs(bestE - bestS) / bestE * 100;
  return {
    entry: e, stop: s, riskPct,
    stopInAtr: riskPct / atrPct,
    feeR: 0.2 / riskPct,
    tp1: leg(t.tp1), tp2: leg(t.tp2),
    statedRr: t.statedRr,
    // Break-even at the advertised ratio, and how far the real geometry lifts
    // it. This is the number that decides how often you must be right.
    advertisedBreakEvenPct: 100 / (1 + t.statedRr[0]),
    breakEvenLiftPct: leg(t.tp1).breakEvenHitPct - 100 / (1 + t.statedRr[0]),
    bestCaseRr: (Math.abs(bestT - bestE) / bestE * 100) / bestRisk,
    bestCaseRiskPct: bestRisk,
  };
};
const long = geometry("long");
const short = geometry("short");

/**
 * The trigger structure, tested on BTC's own history.
 *
 * The note does not say "buy here", it says "buy if price reclaims a level on
 * rising volume". That is a rule, so it can be scored. A reclaim is proxied as
 * a daily close above the highest close of the previous ten days with turnover
 * above its twenty-day average; the breakdown is the mirror. Each signal is
 * then walked with the note's own stop and target.
 */
const triggerTest = (direction, riskPct, rewardPct) => {
  const LOOK = 10, VOL = 20;
  const entries = [];
  for (let i = Math.max(LOOK, VOL); i < daily.length; i++) {
    const prior = daily.slice(i - LOOK, i);
    const volAvg = daily.slice(i - VOL, i).reduce((s, c) => s + c.quoteVolume, 0) / VOL;
    if (daily[i].quoteVolume <= volAvg) continue;
    const breakout = direction === "long"
      ? daily[i].close > Math.max(...prior.map((c) => c.close))
      : daily[i].close < Math.min(...prior.map((c) => c.close));
    if (breakout) entries.push(i);
  }
  // Walk only from the signal bars, using the same path-aware rule as the board.
  const horizon = 10;
  let hit = 0, stopped = 0, openR = 0, n = 0;
  for (const i of entries) {
    if (i + horizon >= daily.length) continue;
    const entry = daily[i].close;
    const stop = direction === "long" ? entry * (1 - riskPct / 100) : entry * (1 + riskPct / 100);
    const target = direction === "long" ? entry * (1 + rewardPct / 100) : entry * (1 - rewardPct / 100);
    n++;
    let done = false;
    for (let j = i + 1; j <= i + horizon; j++) {
      const c = daily[j];
      if (direction === "long" ? c.low <= stop : c.high >= stop) { stopped++; done = true; break; }
      if (direction === "long" ? c.high >= target : c.low <= target) { hit++; done = true; break; }
    }
    if (!done) {
      const move = (daily[i + horizon].close / entry - 1) * 100;
      openR += (direction === "long" ? move : -move) / riskPct;
    }
  }
  const rr = rewardPct / riskPct;
  return n ? {
    signals: n,
    hitPct: (hit / n) * 100,
    stoppedPct: (stopped / n) * 100,
    rr,
    breakEvenHitPct: 100 / (1 + rr),
    expectancyR: (hit * rr - stopped + openR) / n,
    netR: (hit * rr - stopped + openR) / n - 0.2 / riskPct,
    effectiveN: n / horizon,
  } : null;
};

const triggers = {
  longTp1: triggerTest("long", long.riskPct, long.tp1.rewardPct),
  longTp2: triggerTest("long", long.riskPct, long.tp2.rewardPct),
  shortTp1: triggerTest("short", short.riskPct, short.tp1.rewardPct),
  shortTp2: triggerTest("short", short.riskPct, short.tp2.rewardPct),
};

/** A plain hold from a signal, so the geometry can be told apart from the edge. */
const holdAfterSignal = (direction) => {
  const LOOK = 10, VOL = 20, H = 10;
  const rs = [];
  for (let i = Math.max(LOOK, VOL); i < daily.length - H; i++) {
    const prior = daily.slice(i - LOOK, i);
    const volAvg = daily.slice(i - VOL, i).reduce((s, c) => s + c.quoteVolume, 0) / VOL;
    if (daily[i].quoteVolume <= volAvg) continue;
    const breakout = direction === "long"
      ? daily[i].close > Math.max(...prior.map((c) => c.close))
      : daily[i].close < Math.min(...prior.map((c) => c.close));
    if (!breakout) continue;
    const move = (daily[i + H].close / daily[i].close - 1) * 100;
    rs.push(direction === "long" ? move : -move);
  }
  return { medianPct: median(rs), upSharePct: (rs.filter((v) => v > 0).length / rs.length) * 100, n: rs.length };
};

/** Free public readings the note quotes, fetched rather than assumed. */
const fetchJson = async (url) => {
  const r = await fetch(url);
  if (!r.ok) throw new Error(`${url} -> ${r.status}`);
  return r.json();
};
let dominancePct = null, fearGreed = null;
try { dominancePct = (await retry(() => fetchJson("https://api.coingecko.com/api/v3/global"))).data.market_cap_percentage.btc; } catch { /* recorded as null */ }
try { fearGreed = Number((await retry(() => fetchJson("https://api.alternative.me/fng/?limit=1"))).data[0].value); } catch { /* recorded as null */ }

/** The four fields the note says it cannot get for BNB and ICP. */
const alts = {};
for (const symbol of ["BNBUSDT", "ICPUSDT"]) {
  const d = await retry(() => fetchKlines(symbol, { interval: "1d", limit: 400 }));
  const h = await retry(() => fetchKlines(symbol, { interval: "1h", limit: 720 }));
  if (h.length < 700) throw new Error(`${symbol}: only ${h.length} hourly bars`);
  const a = await retry(() => analyzeAsset(symbol, { candles: d }));
  const p = volumeProfile(h, a.price);
  const recent3 = d.slice(-3).reduce((s, c) => s + c.quoteVolume, 0) / 3;
  const prior27 = d.slice(-30, -3).reduce((s, c) => s + c.quoteVolume, 0) / 27;
  // The same comparison over a quarter, because a three-day window against a
  // month can be moved by one busy Tuesday.
  const prior87 = d.slice(-90, -3).reduce((s, c) => s + c.quoteVolume, 0) / 87;
  const weeks = [];
  for (let i = 0; i + 7 <= d.length; i += 7) {
    const w = d.slice(i, i + 7);
    const lo = Math.min(...w.map((c) => c.low));
    weeks.push(((Math.max(...w.map((c) => c.high)) - lo) / lo) * 100);
  }
  alts[symbol] = {
    price: a.price,
    overheadPct: p.overheadPct,
    volumeTrend30dPct: ((recent3 - prior27) / prior27) * 100,
    volumeTrend90dPct: ((recent3 - prior87) / prior87) * 100,
    rangePosition30d: a.rangePosition30d,
    atrPct: (atr(d, 14) / a.price) * 100,
    medianWeekPct: median(weeks),
    turnoverUsd: a.avgQuoteVolume30d,
    pocPrice: p.pocPrice,
    valueArea: [p.valueAreaLow, p.valueAreaHigh],
    priceVsValueArea: a.price > p.valueAreaHigh ? "above" : a.price < p.valueAreaLow ? "below" : "inside",
  };
}

const out = {
  measuredAt: new Date().toISOString(),
  note: NOTE,
  btc: {
    price,
    atrPct,
    rsi14: analysis.rsi14,
    change7dPct: analysis.change7dPct,
    todayOpenClose: { day: iso(today), close: today.close, low: today.low, high: today.high },
    dayStillOpen: true,
    augustLow, augustHigh, lowestAugustClose, lowestCloseDay,
    priceInStatedBand: price >= NOTE.statedPriceBand[0] && price <= NOTE.statedPriceBand[1],
    isLowestCloseOfAugust: today.close <= lowestAugustClose,
    augustRangeMatches: Math.abs(augustLow - NOTE.statedAugustRange[0]) < 200
      && Math.abs(augustHigh - NOTE.statedAugustRange[1]) < 200,
    lowerHighsSincePeak: lowerHighs,
    supportTests: august.filter((c) => c.low <= NOTE.statedSupport[1]).map(iso),
    todayVolumeVsAvg30Pct: ((today.quoteVolume - avgVol30) / avgVol30) * 100,
    profile,
    priceVsValueArea: price > profile.valueAreaHigh ? "above" : price < profile.valueAreaLow ? "below" : "inside",
    resistanceContainsPoc: profile.pocPrice >= NOTE.statedResistance[0] && profile.pocPrice <= NOTE.statedResistance[1],
    impliedMvrv: price / NOTE.statedRealizedPrice,
    mvrvConsistent: Math.abs(price / NOTE.statedRealizedPrice - NOTE.statedMvrv) < 0.03,
  },
  measuredReadings: {
    btcDominancePct: dominancePct,
    dominanceMatches: dominancePct != null && Math.abs(dominancePct - NOTE.statedBtcDominancePct) < 0.5,
    fearGreed,
    fearGreedMatches: fearGreed != null && Math.abs(fearGreed - NOTE.statedFearGreed) <= 3,
  },
  unverifiable: [
    "realized price, MVRV, MVRV Z-score, NUPL, SOPR — on-chain hosts are blocked here",
    "ETF net flows — no free source reachable from this host",
    "open interest and funding — the derivatives endpoint returns 451 here",
  ],
  /** The note's alt levels, converted into the units a stop is judged in. */
  altLevels: {
    icpTightRangeWidthPct: (NOTE.icpTightRange[1] - NOTE.icpTightRange[0]) / mid(NOTE.icpTightRange) * 100,
    icpInvalidationPct: (alts.ICPUSDT.price - mid(NOTE.icpInvalidation)) / alts.ICPUSDT.price * 100,
    icpInvalidationAtr: ((alts.ICPUSDT.price - mid(NOTE.icpInvalidation)) / alts.ICPUSDT.price * 100) / alts.ICPUSDT.atrPct,
    bnbInvalidationPct: (alts.BNBUSDT.price - mid(NOTE.bnbInvalidation)) / alts.BNBUSDT.price * 100,
    bnbInvalidationAtr: ((alts.BNBUSDT.price - mid(NOTE.bnbInvalidation)) / alts.BNBUSDT.price * 100) / alts.BNBUSDT.atrPct,
    bnbInvalidationInsideValueArea: mid(NOTE.bnbInvalidation) >= alts.BNBUSDT.valueArea[0]
      && mid(NOTE.bnbInvalidation) <= alts.BNBUSDT.valueArea[1],
  },
  geometry: { long, short },
  triggers,
  holdAfterSignal: { long: holdAfterSignal("long"), short: holdAfterSignal("short") },
  alts,
};
writeFileSync("research/btc-audit.json", `${JSON.stringify(out, null, 2)}\n`);

console.log(`BTC $${price} · ATR ${atrPct.toFixed(2)}% · RSI ${analysis.rsi14.toFixed(0)}`);
console.log(`today ${iso(today)} (still open) close ${today.close} low ${today.low}`);
console.log(`stated price band ${NOTE.statedPriceBand.join("-")} → price in band: ${out.btc.priceInStatedBand}`);
console.log(`lowest August close ${lowestAugustClose} on ${lowestCloseDay} → today is lowest: ${out.btc.isLowestCloseOfAugust}`);
console.log(`August range ${augustLow}-${augustHigh} → matches stated: ${out.btc.augustRangeMatches}`);
console.log(`lower highs since peak: ${lowerHighs}`);
console.log(`support ${NOTE.statedSupport.join("-")} tested on: ${out.btc.supportTests.join(", ") || "never"}`);
console.log(`POC ${profile.pocPrice.toFixed(0)} · value area ${profile.valueAreaLow.toFixed(0)}-${profile.valueAreaHigh.toFixed(0)} · price ${out.btc.priceVsValueArea}`);
console.log(`resistance band contains POC: ${out.btc.resistanceContainsPoc}`);
console.log(`implied MVRV ${out.btc.impliedMvrv.toFixed(3)} vs stated ${NOTE.statedMvrv} → consistent: ${out.btc.mvrvConsistent}`);
console.log(`BTC.D measured ${dominancePct?.toFixed(2)}% vs stated ${NOTE.statedBtcDominancePct}% → ${out.measuredReadings.dominanceMatches}`);
console.log(`Fear & Greed measured ${fearGreed} vs stated ${NOTE.statedFearGreed} → ${out.measuredReadings.fearGreedMatches}`);

for (const [name, g] of [["LONG", long], ["SHORT", short]]) {
  console.log(`\n${name}: entry ${g.entry} stop ${g.stop} · risk ${g.riskPct.toFixed(2)}% = ${g.stopInAtr.toFixed(2)} ATR · fee ${g.feeR.toFixed(3)}R`);
  console.log(`  TP1 ${g.tp1.target} → +${g.tp1.rewardPct.toFixed(2)}% · R:R ${g.tp1.rr.toFixed(2)} · break-even hit ${g.tp1.breakEvenHitPct.toFixed(1)}%`);
  console.log(`  TP2 ${g.tp2.target} → +${g.tp2.rewardPct.toFixed(2)}% · R:R ${g.tp2.rr.toFixed(2)} · break-even hit ${g.tp2.breakEvenHitPct.toFixed(1)}%`);
  console.log(`  stated R:R ${g.statedRr.join("-")} · best corner of every band ${g.bestCaseRr.toFixed(2)}`);
}

console.log("\ntrigger structure on BTC's own history (10-day close breakout on rising volume):");
console.log("                signals   hit%   stopped%    R:R   need%   E(R)   net(R)");
for (const [k, t] of Object.entries(triggers)) {
  if (!t) continue;
  console.log(`  ${k.padEnd(12)}${String(t.signals).padStart(8)}${t.hitPct.toFixed(1).padStart(8)}`
    + t.stoppedPct.toFixed(1).padStart(11) + t.rr.toFixed(2).padStart(7)
    + t.breakEvenHitPct.toFixed(1).padStart(8) + t.expectancyR.toFixed(3).padStart(8) + t.netR.toFixed(3).padStart(9));
}
console.log(`\njust holding 10 days after a signal: long ${out.holdAfterSignal.long.medianPct.toFixed(2)}% (n=${out.holdAfterSignal.long.n})`
  + ` · short ${out.holdAfterSignal.short.medianPct.toFixed(2)}% (n=${out.holdAfterSignal.short.n})`);

console.log(`\nnote's alt levels: ICP band ${out.altLevels.icpTightRangeWidthPct.toFixed(1)}% wide`
  + ` · ICP invalidation ${out.altLevels.icpInvalidationAtr.toFixed(2)} ATR`
  + ` · BNB invalidation ${out.altLevels.bnbInvalidationAtr.toFixed(2)} ATR, inside value area: ${out.altLevels.bnbInvalidationInsideValueArea}`);
console.log("\nthe four fields the note says it lacks:");
for (const [s, a] of Object.entries(alts)) {
  console.log(`  ${s.padEnd(9)} overhead ${a.overheadPct.toFixed(2)}%  volume trend ${a.volumeTrend30dPct.toFixed(1)}%`
    + `  range position ${a.rangePosition30d.toFixed(1)}%  median week ${a.medianWeekPct.toFixed(1)}%`
    + `  price ${a.priceVsValueArea} value area`);
}
