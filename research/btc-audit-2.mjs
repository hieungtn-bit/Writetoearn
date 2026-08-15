/**
 * The same reader's BTC note, one day later, checked against the same tests.
 *
 * Post 79 audited yesterday's version. This one restates the structure with
 * different levels, so the interesting question is not "is it right" but "what
 * moved" — and two things moved in opposite directions.
 *
 * The reward-to-risk arithmetic, which failed badly yesterday at both targets,
 * now reaches the advertised range at the second target on both sides. The stop
 * distances, which yesterday sat at 1.32 and 1.17 daily ATR and drew praise
 * here, have tightened to under one ATR — into the band research/stop-law.json
 * measured as the worst of the seven widths tested.
 *
 * Both are computed from the note's own numbers, so neither depends on my data
 * being right about anything.
 *
 * The moving averages, RSI and MACD it quotes are recomputed rather than
 * accepted, since those are the cheapest claims to check and the ones most
 * often carried over from a previous draft without re-reading.
 *
 * The alt claims about ICP and BMT are checked too, including the assertion
 * that overhead and range figures are unavailable — the same assertion post 83
 * answered by computing them for every pair.
 */

import { writeFileSync } from "node:fs";
import { analyzeAsset, atr, fetchKlines, rsi } from "../src/analysis.mjs";
import { volumeProfile } from "../src/profile.mjs";

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
const sma = (closes, n) => (closes.length < n ? null
  : closes.slice(-n).reduce((s, c) => s + c, 0) / n);
const ema = (xs, n) => {
  const k = 2 / (n + 1);
  let e = xs.slice(0, n).reduce((s, x) => s + x, 0) / n;
  for (let i = n; i < xs.length; i++) e = xs[i] * k + e * (1 - k);
  return e;
};

/** Exactly as written in the note. */
const NOTE = {
  statedPriceBand: [63000, 63100],
  statedSma50: 63500,
  statedSma200: 69000,
  statedRsi: [44, 45],
  statedMacdNegative: true,
  statedSupport: [62200, 62600],
  statedResistance: [63400, 63700],
  statedBtcDominancePct: [56.1, 56.4],
  statedMvrv: [1.20, 1.24],
  long: { entry: [63500, 63700], stop: [62200, 62400], tp1: [65200, 65500], tp2: [66500, 67000], statedRr: [1.8, 2.2] },
  short: { entry: [62100, 62300], stop: [63400, 63600], tp1: [60500, 60800], tp2: [59000, 59500], statedRr: [1.8, 2.2] },
  statedIcpPrice: [2.25, 2.28],
  statedIcpLow: 2.00,
  statedIcpLowDate: "2026-08-01",
  statedBmtPrice: 0.0163,
  /** Yesterday's note, for the comparison this file exists to make. */
  yesterday: { longStopInAtr: 1.32, shortStopInAtr: 1.17, longTp1Rr: 1.06, shortTp1Rr: 0.97, longTp2Rr: 1.75, shortTp2Rr: 1.77 },
};

const daily = await retry(() => fetchKlines("BTCUSDT", { interval: "1d", limit: 1000 }));
const hourly = await retry(() => fetchKlines("BTCUSDT", { interval: "1h", limit: 720 }));
if (hourly.length < 700) throw new Error(`only ${hourly.length} hourly bars`);
const analysis = await retry(() => analyzeAsset("BTCUSDT", { candles: daily }));
const price = analysis.price;
const atrPct = (atr(daily, 14) / price) * 100;
const profile = volumeProfile(hourly, price);
const closes = daily.map((c) => c.close);

const macd = (() => {
  const line = ema(closes, 12) - ema(closes, 26);
  // The signal needs a history of the line, so it is rebuilt bar by bar.
  const lineSeries = [];
  for (let i = 26; i <= closes.length; i++) {
    lineSeries.push(ema(closes.slice(0, i), 12) - ema(closes.slice(0, i), 26));
  }
  const signal = ema(lineSeries, 9);
  return { line, signal, histogram: line - signal, negative: line < 0 };
})();

/** Reward-to-risk from the note's own numbers, exactly as post 79 did it. */
const geometry = (side) => {
  const t = NOTE[side];
  const long = side === "long";
  const e = mid(t.entry), s = mid(t.stop);
  const riskPct = Math.abs(e - s) / e * 100;
  const leg = (bandName) => {
    const p = mid(t[bandName]);
    const rewardPct = Math.abs(p - e) / e * 100;
    return { target: p, rewardPct, rr: rewardPct / riskPct, breakEvenHitPct: 100 / (1 + rewardPct / riskPct) };
  };
  return {
    entry: e, stop: s, riskPct,
    stopInAtr: riskPct / atrPct,
    feeR: 0.2 / riskPct,
    tp1: leg("tp1"), tp2: leg("tp2"),
    statedRr: t.statedRr,
    tp1MeetsStated: leg("tp1").rr >= t.statedRr[0],
    tp2MeetsStated: leg("tp2").rr >= t.statedRr[0],
  };
};
const long = geometry("long");
const short = geometry("short");

const fetchJson = async (url) => {
  const r = await fetch(url);
  if (!r.ok) throw new Error(`${url} -> ${r.status}`);
  return r.json();
};
let dominancePct = null, fearGreed = null;
try { dominancePct = (await retry(() => fetchJson("https://api.coingecko.com/api/v3/global"))).data.market_cap_percentage.btc; } catch { /* null */ }
try { fearGreed = Number((await retry(() => fetchJson("https://api.alternative.me/fng/?limit=1"))).data[0].value); } catch { /* null */ }

/** The two alts the note names, with the fields it says are unavailable. */
const alts = {};
for (const symbol of ["ICPUSDT", "BMTUSDT"]) {
  try {
    const d = await retry(() => fetchKlines(symbol, { interval: "1d", limit: 400 }));
    const h = await retry(() => fetchKlines(symbol, { interval: "1h", limit: 720 }));
    const a = await retry(() => analyzeAsset(symbol, { candles: d }));
    const p = h.length >= 700 ? volumeProfile(h, a.price) : null;
    const recent3 = d.slice(-3).reduce((s, c) => s + c.quoteVolume, 0) / 3;
    const prior27 = d.slice(-30, -3).reduce((s, c) => s + c.quoteVolume, 0) / 27;
    const august = d.filter((c) => new Date(c.openTime).toISOString().slice(0, 10).startsWith("2026-08"));
    const augLow = Math.min(...august.map((c) => c.low));
    const augLowDay = new Date(august.find((c) => c.low === augLow).openTime).toISOString().slice(0, 10);
    alts[symbol] = {
      price: a.price,
      overheadPct: p?.overheadPct ?? null,
      volumeTrend30dPct: prior27 > 0 ? ((recent3 - prior27) / prior27) * 100 : null,
      rangePosition30d: a.rangePosition30d,
      atrPct: (atr(d, 14) / a.price) * 100,
      change7dPct: a.change7dPct,
      turnoverUsd: a.avgQuoteVolume30d,
      augustLow: augLow,
      augustLowDay: augLowDay,
      valueArea: p ? [p.valueAreaLow, p.valueAreaHigh] : null,
      priceVsValueArea: p ? (a.price > p.valueAreaHigh ? "above" : a.price < p.valueAreaLow ? "below" : "inside") : null,
    };
  } catch { alts[symbol] = null; }
}

const iso = (c) => new Date(c.openTime).toISOString().slice(0, 10);
const weeks = [];
for (let i = 0; i + 7 <= daily.length; i += 7) {
  const w = daily.slice(i, i + 7);
  const lo = Math.min(...w.map((c) => c.low));
  weeks.push(((Math.max(...w.map((c) => c.high)) - lo) / lo) * 100);
}

const out = {
  measuredAt: new Date().toISOString(),
  note: NOTE,
  btc: {
    price, atrPct,
    day: iso(daily.at(-1)),
    priceInStatedBand: price >= NOTE.statedPriceBand[0] && price <= NOTE.statedPriceBand[1],
    sma50: sma(closes, 50),
    sma200: sma(closes, 200),
    belowSma50: price < sma(closes, 50),
    belowSma200: price < sma(closes, 200),
    sma50Matches: Math.abs(sma(closes, 50) - NOTE.statedSma50) < 500,
    sma200Matches: Math.abs(sma(closes, 200) - NOTE.statedSma200) < 1500,
    rsi14: rsi(closes),
    rsiMatches: rsi(closes) >= NOTE.statedRsi[0] - 2 && rsi(closes) <= NOTE.statedRsi[1] + 2,
    macd,
    macdMatches: macd.negative === NOTE.statedMacdNegative,
    profile,
    priceVsValueArea: price > profile.valueAreaHigh ? "above" : price < profile.valueAreaLow ? "below" : "inside",
    resistanceContainsPoc: profile.pocPrice >= NOTE.statedResistance[0] && profile.pocPrice <= NOTE.statedResistance[1],
    medianWeekPct: median(weeks),
    change7dPct: analysis.change7dPct,
  },
  measuredReadings: {
    btcDominancePct: dominancePct,
    dominanceMatches: dominancePct != null
      && dominancePct >= NOTE.statedBtcDominancePct[0] - 0.3
      && dominancePct <= NOTE.statedBtcDominancePct[1] + 0.3,
    fearGreed,
  },
  geometry: { long, short },
  /** What changed since yesterday's version, which is why this file exists. */
  movement: {
    longStopInAtr: { yesterday: NOTE.yesterday.longStopInAtr, today: long.stopInAtr, tighter: long.stopInAtr < NOTE.yesterday.longStopInAtr },
    shortStopInAtr: { yesterday: NOTE.yesterday.shortStopInAtr, today: short.stopInAtr, tighter: short.stopInAtr < NOTE.yesterday.shortStopInAtr },
    bothStopsNowUnderOneAtr: long.stopInAtr < 1 && short.stopInAtr < 1,
    longTp2Rr: { yesterday: NOTE.yesterday.longTp2Rr, today: long.tp2.rr, improved: long.tp2.rr > NOTE.yesterday.longTp2Rr },
    shortTp2Rr: { yesterday: NOTE.yesterday.shortTp2Rr, today: short.tp2.rr, improved: short.tp2.rr > NOTE.yesterday.shortTp2Rr },
    tp2NowMeetsStated: long.tp2MeetsStated && short.tp2MeetsStated,
    tp1StillShort: !long.tp1MeetsStated && !short.tp1MeetsStated,
  },
  alts,
  unverifiable: [
    "MVRV, NUPL, SOPR, realized and STH cost basis — on-chain hosts blocked here",
    "ETF net flows and AUM — no free source reachable from this host",
    "exchange netflow and whale accumulation — same",
  ],
};
writeFileSync("research/btc-audit-2.json", `${JSON.stringify(out, null, 2)}\n`);

console.log(`BTC ${price} on ${out.btc.day} · ATR ${atrPct.toFixed(2)}%`);
console.log(`  stated band ${NOTE.statedPriceBand.join("-")} → in band: ${out.btc.priceInStatedBand}`);
console.log(`  50-SMA ${out.btc.sma50.toFixed(0)} (stated ${NOTE.statedSma50}) → ${out.btc.sma50Matches} · below it: ${out.btc.belowSma50}`);
console.log(`  200-SMA ${out.btc.sma200.toFixed(0)} (stated ${NOTE.statedSma200}) → ${out.btc.sma200Matches} · below it: ${out.btc.belowSma200}`);
console.log(`  RSI ${out.btc.rsi14.toFixed(1)} (stated ${NOTE.statedRsi.join("-")}) → ${out.btc.rsiMatches}`);
console.log(`  MACD line ${macd.line.toFixed(1)} signal ${macd.signal.toFixed(1)} → negative: ${macd.negative}, matches: ${out.btc.macdMatches}`);
console.log(`  POC ${profile.pocPrice.toFixed(0)} · VA ${profile.valueAreaLow.toFixed(0)}-${profile.valueAreaHigh.toFixed(0)} · price ${out.btc.priceVsValueArea}`);
console.log(`  resistance band contains POC: ${out.btc.resistanceContainsPoc}`);
console.log(`  BTC.D ${dominancePct?.toFixed(2)}% → ${out.measuredReadings.dominanceMatches} · F&G ${fearGreed}`);

for (const [name, g] of [["LONG", long], ["SHORT", short]]) {
  console.log(`\n${name}: entry ${g.entry} stop ${g.stop} · risk ${g.riskPct.toFixed(2)}% = ${g.stopInAtr.toFixed(2)} ATR · fee ${g.feeR.toFixed(3)}R`);
  console.log(`  TP1 R:R ${g.tp1.rr.toFixed(2)} (need ${g.tp1.breakEvenHitPct.toFixed(1)}% wins) · meets stated: ${g.tp1MeetsStated}`);
  console.log(`  TP2 R:R ${g.tp2.rr.toFixed(2)} (need ${g.tp2.breakEvenHitPct.toFixed(1)}% wins) · meets stated: ${g.tp2MeetsStated}`);
}

console.log("\nwhat moved since yesterday:");
const m = out.movement;
console.log(`  long stop  ${m.longStopInAtr.yesterday} → ${m.longStopInAtr.today.toFixed(2)} ATR ${m.longStopInAtr.tighter ? "(tighter)" : ""}`);
console.log(`  short stop ${m.shortStopInAtr.yesterday} → ${m.shortStopInAtr.today.toFixed(2)} ATR ${m.shortStopInAtr.tighter ? "(tighter)" : ""}`);
console.log(`  both now under 1 ATR: ${m.bothStopsNowUnderOneAtr}`);
console.log(`  long TP2 R:R  ${m.longTp2Rr.yesterday} → ${m.longTp2Rr.today.toFixed(2)} ${m.longTp2Rr.improved ? "(improved)" : ""}`);
console.log(`  short TP2 R:R ${m.shortTp2Rr.yesterday} → ${m.shortTp2Rr.today.toFixed(2)} ${m.shortTp2Rr.improved ? "(improved)" : ""}`);
console.log(`  TP2 now meets the stated range: ${m.tp2NowMeetsStated} · TP1 still short: ${m.tp1StillShort}`);

console.log("\nthe alts it says it cannot measure:");
for (const [s, a] of Object.entries(alts)) {
  if (!a) { console.log(`  ${s} unavailable`); continue; }
  console.log(`  ${s.padEnd(9)} ${a.price}  overhead ${a.overheadPct?.toFixed(1)}%  volume trend ${a.volumeTrend30dPct?.toFixed(1)}%`
    + `  range ${a.rangePosition30d.toFixed(1)}%  7d ${a.change7dPct.toFixed(2)}%  $${Math.round(a.turnoverUsd / 1e6)}M`
    + `  · August low ${a.augustLow} on ${a.augustLowDay}`);
}
