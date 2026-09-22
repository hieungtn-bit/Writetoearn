/**
 * Auditing a full-market "multiplier scan" that returned zero candidates.
 *
 * The note reaches the right answer — nothing qualifies — and this desk agrees
 * with standing aside today. But it gives a reason that can be checked: that
 * free public data cannot supply the four numbers its rules demand (overhead
 * supply %, volume trend %, range position %, and BTC beta), so no name can be
 * ranked.
 *
 * Three of those four are computed here every day from free Binance candles,
 * and the fourth is a regression on the same candles. So the constraint is
 * about the author's sources rather than about the world, and the post can say
 * so with the numbers in hand.
 *
 * That matters because it changes what the empty result means. "I could not
 * measure it" and "I measured it and there is nothing there" look identical on
 * the page and are completely different claims. This file produces the second
 * one, by testing the premise a multiplier scan rests on:
 *
 *   does buying a deep drawdown actually pay?
 *
 * Every pair-day is bucketed by how far price sits below its own 90-day high,
 * then scored forward against the universe's baseline and, separately, traded
 * at the fixed 1.5 ATR geometry this desk settled on. If the deep buckets do
 * not outperform, the scan's whole premise fails — and the honest empty result
 * is better supported by that than by a missing data source.
 *
 * The note's qualitative claims about today's dumpers are also counted rather
 * than accepted, since "most of them have negative volume trend" is a
 * proportion and proportions can be measured.
 */

import { writeFileSync } from "node:fs";
import { analyzeAsset, atr, fetchKlines } from "../src/analysis.mjs";
import { liveUniverse } from "../src/universe.mjs";
import { volumeProfile } from "../src/profile.mjs";

const PAIRS = Number(process.env.PAIRS ?? 100);
const HIGH_WINDOW = 90;
const WINDOW = 30;
const HORIZONS = [30, 90];
const STOP_ATR = 1.5;
const RR = 2;
const FEE_PCT = 0.2;
/** Drawdown from the 90-day high, in the bands the note talks about. */
const BANDS = [[0, 20], [20, 40], [40, 60], [60, 80], [80, 100]];

/** Exactly as the note states them. */
const NOTE = {
  statedBtcDominancePct: [56.1, 56.2],
  statedThreshold: 6.5,
  statedCandidates: 0,
  requiredFields: ["overhead supply %", "volume trend %", "range position %", "BTC beta"],
  claimedDumpRange: [70, 95],
};

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

const overheadProxy = (candles, i) => {
  const w = candles.slice(Math.max(0, i - WINDOW + 1), i + 1);
  const total = w.reduce((s, c) => s + c.quoteVolume, 0);
  if (!(total > 0)) return null;
  const above = w.filter((c) => typicalPrice(c) > candles[i].close)
    .reduce((s, c) => s + c.quoteVolume, 0);
  return (above / total) * 100;
};

/** How far below its own 90-day high a bar closed. */
const drawdownFromHigh = (candles, i) => {
  if (i < HIGH_WINDOW) return null;
  const hi = Math.max(...candles.slice(i - HIGH_WINDOW + 1, i + 1).map((c) => c.high));
  return hi > 0 ? ((candles[i].close / hi) - 1) * 100 : null;
};

const dominance = await retry(async () => {
  const r = await fetch("https://api.coingecko.com/api/v3/global");
  if (!r.ok) throw new Error(`global -> ${r.status}`);
  return (await r.json()).data.market_cap_percentage.btc;
}).catch(() => null);

const { symbols } = await retry(() => liveUniverse({ limit: PAIRS }));

/** BTC's daily returns, so a beta can be regressed against them. */
const btc = await retry(() => fetchKlines("BTCUSDT", { interval: "1d", limit: 1000 }));
const btcReturnAt = new Map();
for (let i = 1; i < btc.length; i++) {
  btcReturnAt.set(new Date(btc[i].openTime).toISOString().slice(0, 10), (btc[i].close / btc[i - 1].close - 1) * 100);
}

const series = [];
const today = [];
for (const [i, symbol] of symbols.entries()) {
  process.stderr.write(`\r${i + 1}/${symbols.length} ${symbol.padEnd(14)}`);
  try {
    const daily = await retry(() => fetchKlines(symbol, { interval: "1d", limit: 1000 }));
    if (daily.length < 200) continue;
    const analysis = await retry(() => analyzeAsset(symbol, { candles: daily }));
    const atrPct = (atr(daily, 14) / analysis.price) * 100;
    if (!Number.isFinite(atrPct) || atrPct <= 0) continue;
    series.push({ symbol, daily, atrPct });

    /**
     * The four fields the note says cannot be obtained, for every pair that is
     * deeply down from its own high. Three come from candles the exchange
     * serves free; the fourth is a regression on those same candles.
     */
    const last = daily.length - 1;
    const dd = drawdownFromHigh(daily, last);
    if (dd == null) continue;

    const recent3 = daily.slice(-3).reduce((s, c) => s + c.quoteVolume, 0) / 3;
    const prior27 = daily.slice(-30, -3).reduce((s, c) => s + c.quoteVolume, 0) / 27;

    // Beta against BTC over the last 180 days, from paired daily returns.
    const paired = [];
    for (let k = daily.length - 180; k < daily.length; k++) {
      if (k < 1) continue;
      const d = new Date(daily[k].openTime).toISOString().slice(0, 10);
      const b = btcReturnAt.get(d);
      if (b == null) continue;
      paired.push([b, (daily[k].close / daily[k - 1].close - 1) * 100]);
    }
    let beta = null;
    if (paired.length > 60) {
      const mb = paired.reduce((s, p) => s + p[0], 0) / paired.length;
      const ma = paired.reduce((s, p) => s + p[1], 0) / paired.length;
      const cov = paired.reduce((s, p) => s + (p[0] - mb) * (p[1] - ma), 0) / paired.length;
      const varB = paired.reduce((s, p) => s + (p[0] - mb) ** 2, 0) / paired.length;
      beta = varB > 0 ? cov / varB : null;
    }

    today.push({
      symbol,
      price: analysis.price,
      drawdownFromHighPct: dd,
      overheadPct: overheadProxy(daily, last),
      volumeTrendPct: prior27 > 0 ? ((recent3 - prior27) / prior27) * 100 : null,
      rangePosition30d: analysis.rangePosition30d,
      btcBeta: beta,
      turnoverUsd: analysis.avgQuoteVolume30d,
      atrPct,
    });
  } catch { /* absent rather than guessed */ }
}
process.stderr.write("\r");

/** The premise: does a deep drawdown pay? */
const labelled = [];
for (const s of series) {
  for (let i = HIGH_WINDOW; i < s.daily.length; i++) {
    const dd = drawdownFromHigh(s.daily, i);
    if (dd == null) continue;
    labelled.push({ s, i, depth: Math.abs(dd) });
  }
}

const forwardOf = (s, i, h) =>
  (i + h < s.daily.length ? ((s.daily[i + h].close / s.daily[i].close) - 1) * 100 : null);

const baseline = {};
for (const h of HORIZONS) {
  const rs = labelled.map((d) => forwardOf(d.s, d.i, h)).filter((v) => v != null);
  baseline[h] = { medianPct: median(rs), upSharePct: (rs.filter((v) => v > 0).length / rs.length) * 100, days: rs.length };
}

const bands = BANDS.map(([lo, hi]) => {
  const rows = labelled.filter((d) => d.depth >= lo && d.depth < (hi === 100 ? 1e9 : hi));
  const forward = {};
  for (const h of HORIZONS) {
    const rs = rows.map((d) => forwardOf(d.s, d.i, h)).filter((v) => v != null);
    if (!rs.length) continue;
    // The "multiplier" question, asked directly rather than through a median.
    const doubled = rs.filter((v) => v >= 100).length;
    const upHalf = rs.filter((v) => v >= 50).length;
    forward[h] = {
      medianPct: median(rs),
      differencePct: median(rs) - baseline[h].medianPct,
      upSharePct: (rs.filter((v) => v > 0).length / rs.length) * 100,
      doubledSharePct: (doubled / rs.length) * 100,
      upFiftySharePct: (upHalf / rs.length) * 100,
      days: rs.length,
      effectiveN: rs.length / h,
    };
  }
  return { band: [lo, hi], days: rows.length, sharePct: (rows.length / labelled.length) * 100, forward };
});

/** And can the deepest band be traded at the desk's fixed geometry? */
const tradeDeep = (minDepth) => {
  const perPair = [];
  for (const s of series) {
    const stopPct = STOP_ATR * s.atrPct;
    if (!(stopPct > 0) || stopPct >= 60) continue;
    const entries = [];
    for (let i = HIGH_WINDOW; i < s.daily.length; i++) {
      const dd = drawdownFromHigh(s.daily, i);
      if (dd != null && Math.abs(dd) >= minDepth) entries.push(i);
    }
    if (entries.length < 30) continue;
    const horizon = 30;
    let hit = 0, stopped = 0, openR = 0, n = 0;
    for (const i of entries) {
      if (i + horizon >= s.daily.length) continue;
      const entry = s.daily[i].close;
      const stop = entry * (1 - stopPct / 100);
      const target = entry * (1 + stopPct * RR / 100);
      n++;
      let done = false;
      for (let j = i + 1; j <= i + horizon; j++) {
        const c = s.daily[j];
        if (c.low <= stop) { stopped++; done = true; break; }
        if (c.high >= target) { hit++; done = true; break; }
      }
      if (!done) openR += ((s.daily[i + horizon].close / entry - 1) * 100) / stopPct;
    }
    if (!n) continue;
    const e = (hit * RR - stopped + openR) / n;
    perPair.push({ symbol: s.symbol, expectancyR: e, netR: e - FEE_PCT / stopPct });
  }
  return perPair.length ? {
    pairs: perPair.length,
    medianExpectancyR: median(perPair.map((p) => p.expectancyR)),
    medianNetR: median(perPair.map((p) => p.netR)),
    pairsPositiveNet: perPair.filter((p) => p.netR > 0).length,
  } : null;
};

/** The note's description of today's dumpers, counted. */
const dumpers = today.filter((t) => Math.abs(t.drawdownFromHighPct) >= 60);
const deepDumpers = today.filter((t) => Math.abs(t.drawdownFromHighPct) >= NOTE.claimedDumpRange[0]);
const withAllFour = today.filter((t) =>
  t.overheadPct != null && t.volumeTrendPct != null && t.rangePosition30d != null && t.btcBeta != null);

const out = {
  measuredAt: new Date().toISOString(),
  note: NOTE,
  dominance: {
    measuredPct: dominance,
    statedRange: NOTE.statedBtcDominancePct,
    matches: dominance != null
      && dominance >= NOTE.statedBtcDominancePct[0] - 0.3
      && dominance <= NOTE.statedBtcDominancePct[1] + 0.3,
  },
  universe: series.length,
  fieldsAvailable: {
    scanned: today.length,
    withAllFourFields: withAllFour.length,
    sharePct: (withAllFour.length / today.length) * 100,
  },
  dumpersToday: {
    over60: dumpers.length,
    over70: deepDumpers.length,
    medianOverhead: median(dumpers.map((d) => d.overheadPct).filter((v) => v != null)),
    medianVolumeTrend: median(dumpers.map((d) => d.volumeTrendPct).filter((v) => v != null)),
    medianRangePosition: median(dumpers.map((d) => d.rangePosition30d).filter((v) => v != null)),
    medianBeta: median(dumpers.map((d) => d.btcBeta).filter((v) => v != null)),
    negativeVolumeTrendShare: dumpers.length
      ? (dumpers.filter((d) => d.volumeTrendPct != null && d.volumeTrendPct < 0).length / dumpers.length) * 100 : null,
    detail: dumpers.sort((a, b) => a.drawdownFromHighPct - b.drawdownFromHighPct).slice(0, 10),
  },
  baseline,
  bands,
  trades: { deep60: tradeDeep(60), deep40: tradeDeep(40), shallow: tradeDeep(0) },
  labelledDays: labelled.length,
};
writeFileSync("research/multiplier-audit.json", `${JSON.stringify(out, null, 2)}\n`);

console.log(`BTC.D measured ${dominance?.toFixed(2)}% vs stated ${NOTE.statedBtcDominancePct.join("-")} → ${out.dominance.matches}`);
console.log(`universe ${series.length} pairs · ${labelled.length} labelled days`);
console.log(`all four "unavailable" fields computed for ${withAllFour.length}/${today.length} pairs (${out.fieldsAvailable.sharePct.toFixed(0)}%)\n`);

console.log("drawdown from 90d high     share   30d med   vs base   90d med   vs base   doubled%  n(eff 90d)");
for (const b of bands) {
  const f30 = b.forward[30], f90 = b.forward[90];
  if (!f30 || !f90) continue;
  console.log(
    `${("-" + b.band[0] + " to -" + b.band[1] + "%").padEnd(24)}`
    + `${b.sharePct.toFixed(1)}%`.padStart(8)
    + `${f30.medianPct.toFixed(2)}%`.padStart(10)
    + `${f30.differencePct.toFixed(2)}`.padStart(10)
    + `${f90.medianPct.toFixed(2)}%`.padStart(10)
    + `${f90.differencePct.toFixed(2)}`.padStart(10)
    + `${f90.doubledSharePct.toFixed(2)}%`.padStart(11)
    + String(Math.round(f90.effectiveN)).padStart(12),
  );
}
console.log(`\nbaseline: 30d ${baseline[30].medianPct.toFixed(2)}%  90d ${baseline[90].medianPct.toFixed(2)}%`);

console.log(`\ntraded long at ${STOP_ATR} ATR, ${RR}:1, 30 days:`);
for (const [k, v] of Object.entries(out.trades)) {
  if (!v) { console.log(`  ${k.padEnd(9)} no pairs qualified`); continue; }
  console.log(`  ${k.padEnd(9)} E ${v.medianExpectancyR.toFixed(3)}  net ${v.medianNetR.toFixed(3)}  positive on ${v.pairsPositiveNet}/${v.pairs}`);
}

const d = out.dumpersToday;
console.log(`\ntoday: ${d.over60} pairs down 60%+ from their 90-day high, ${d.over70} down 70%+`);
if (d.over60) {
  console.log(`  median overhead ${d.medianOverhead?.toFixed(1)}% · volume trend ${d.medianVolumeTrend?.toFixed(1)}%`
    + ` · range position ${d.medianRangePosition?.toFixed(1)}% · beta ${d.medianBeta?.toFixed(2)}`);
  console.log(`  share with negative volume trend: ${d.negativeVolumeTrendShare?.toFixed(0)}%`);
}
