/**
 * Does trapped overhead supply predict anything, or have I been quoting a
 * decoration for weeks?
 *
 * "Overhead" — the share of recent turnover that changed hands above the
 * current price, i.e. the money currently underwater — is the number this desk
 * reaches for most often. It led the counter-argument in the BNB posts, it is
 * the first line of every stage read, and I called BNB's 3.17% "the best number
 * on the board". In all that time I have never checked whether a low reading is
 * followed by better returns than a high one.
 *
 * That is the same failure I published twice today about other things, so it
 * gets the same treatment.
 *
 * Two things are measured.
 *
 * First, prediction: bucket every historical day of every pair by its overhead
 * reading and compare what followed against the same universe's baseline. If
 * the buckets are indistinguishable, the metric describes the present and
 * forecasts nothing, and I should say so in the same posts that quote it.
 *
 * Second, tradability: a difference in median return is not an edge until it
 * survives a stop, a target and a fee. The extreme buckets are therefore walked
 * with a 1.5 ATR stop — the width research/stop-law.json crowned this morning —
 * bar by bar, stop charged first when a bar reaches both.
 *
 * A caveat with a number rather than a hedge: history has to use a daily-bar
 * proxy, since hourly data reaches back only six weeks. The same day is
 * therefore measured both ways on the live universe, and the disagreement
 * between them is reported, so nobody reads the historical figures as if they
 * came from the hourly profile the board actually publishes.
 */

import { writeFileSync } from "node:fs";
import { analyzeAsset, atr, fetchKlines } from "../src/analysis.mjs";
import { liveUniverse } from "../src/universe.mjs";
import { volumeProfile } from "../src/profile.mjs";
import { walk } from "../src/signals.mjs";

const PAIRS = Number(process.env.PAIRS ?? 100);
const WINDOW = 30;
const HORIZONS = [10, 30];
const BANDS = [[0, 20], [20, 40], [40, 60], [60, 80], [80, 100]];
const STOP_ATR = 1.5;
const RR = 2;
const FEE_PCT = 0.2;

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

/**
 * Share of the trailing window's turnover done above today's close.
 *
 * This is the daily-bar proxy, not the hourly volume profile. A whole day's
 * turnover is charged to one side of the price by its typical price, which is
 * exactly the coarseness the board moved away from — but it is the only version
 * that can be computed back over years, so it is what the history uses and the
 * disagreement is measured separately below.
 */
const overheadProxy = (candles, i) => {
  const w = candles.slice(i - WINDOW + 1, i + 1);
  const total = w.reduce((s, c) => s + c.quoteVolume, 0);
  if (!(total > 0)) return null;
  const above = w.filter((c) => typicalPrice(c) > candles[i].close)
    .reduce((s, c) => s + c.quoteVolume, 0);
  return (above / total) * 100;
};

const { symbols } = await retry(() => liveUniverse({ limit: PAIRS }));

const series = [];
const proxyVsProfile = [];
for (const [i, symbol] of symbols.entries()) {
  process.stderr.write(`\r${i + 1}/${symbols.length} ${symbol.padEnd(14)}`);
  try {
    const daily = await retry(() => fetchKlines(symbol, { interval: "1d", limit: 1000 }));
    if (daily.length < 300) continue;
    const analysis = await retry(() => analyzeAsset(symbol, { candles: daily }));
    const atrPct = (atr(daily, 14) / analysis.price) * 100;
    if (!Number.isFinite(atrPct) || atrPct <= 0) continue;
    series.push({ symbol, daily, atrPct, price: analysis.price });

    // The proxy against the real thing, on the one day both can be computed.
    const hourly = await retry(() => fetchKlines(symbol, { interval: "1h", limit: 720 }));
    if (hourly.length >= 700) {
      const profile = volumeProfile(hourly, analysis.price);
      const proxy = overheadProxy(daily, daily.length - 1);
      if (profile && proxy != null) {
        proxyVsProfile.push({
          symbol, proxyPct: proxy, profilePct: profile.overheadPct,
          differencePct: proxy - profile.overheadPct,
        });
      }
    }
  } catch { /* absent rather than guessed */ }
}
process.stderr.write("\r");

/** Every day of every pair, labelled by its overhead reading. */
const labelled = [];
for (const s of series) {
  for (let i = WINDOW; i < s.daily.length; i++) {
    const oh = overheadProxy(s.daily, i);
    if (oh == null) continue;
    labelled.push({ symbol: s.symbol, i, overheadPct: oh, series: s });
  }
}

const forwardOf = (s, i, h) =>
  (i + h < s.daily.length ? ((s.daily[i + h].close / s.daily[i].close) - 1) * 100 : null);

/** Baseline: every labelled day, regardless of reading. */
const baseline = {};
for (const h of HORIZONS) {
  const rs = labelled.map((d) => forwardOf(d.series, d.i, h)).filter((v) => v != null);
  baseline[h] = { medianPct: median(rs), upSharePct: (rs.filter((v) => v > 0).length / rs.length) * 100, days: rs.length };
}

const bands = BANDS.map(([lo, hi]) => {
  const rows = labelled.filter((d) => d.overheadPct >= lo && d.overheadPct < (hi === 100 ? 100.0001 : hi));
  const forward = {};
  for (const h of HORIZONS) {
    const rs = rows.map((d) => forwardOf(d.series, d.i, h)).filter((v) => v != null);
    if (!rs.length) continue;
    forward[h] = {
      medianPct: median(rs),
      differencePct: median(rs) - baseline[h].medianPct,
      upSharePct: (rs.filter((v) => v > 0).length / rs.length) * 100,
      days: rs.length,
      effectiveN: rs.length / h,
    };
  }
  return {
    band: [lo, hi],
    days: rows.length,
    sharePct: (rows.length / labelled.length) * 100,
    forward,
  };
});

/**
 * The tradeable form, on the two extreme buckets.
 *
 * A gap between medians is not an edge. Each pair is walked over only the days
 * that carried the reading, with a stop, a target and a fee, so the answer is
 * in the units a position is actually sized in.
 */
const tradeBand = (lo, hi, direction) => {
  const perPair = [];
  for (const s of series) {
    const stopPct = STOP_ATR * s.atrPct;
    if (!(stopPct > 0) || stopPct >= 60) continue;
    const days = [];
    for (let i = WINDOW; i < s.daily.length; i++) {
      const oh = overheadProxy(s.daily, i);
      if (oh != null && oh >= lo && oh < (hi === 100 ? 100.0001 : hi)) days.push(i);
    }
    if (days.length < 30) continue;
    // Walk only the qualifying entries, with the board's own path rule.
    const horizon = 30;
    let hit = 0, stopped = 0, openR = 0, n = 0;
    for (const i of days) {
      if (i + horizon >= s.daily.length) continue;
      const entry = s.daily[i].close;
      const long = direction === "long";
      const stop = long ? entry * (1 - stopPct / 100) : entry * (1 + stopPct / 100);
      const target = long ? entry * (1 + stopPct * RR / 100) : entry * (1 - stopPct * RR / 100);
      n++;
      let done = false;
      for (let j = i + 1; j <= i + horizon; j++) {
        const c = s.daily[j];
        if (long ? c.low <= stop : c.high >= stop) { stopped++; done = true; break; }
        if (long ? c.high >= target : c.low <= target) { hit++; done = true; break; }
      }
      if (!done) {
        const move = (s.daily[i + horizon].close / entry - 1) * 100;
        openR += (long ? move : -move) / stopPct;
      }
    }
    if (!n) continue;
    const e = (hit * RR - stopped + openR) / n;
    perPair.push({ symbol: s.symbol, expectancyR: e, netR: e - FEE_PCT / stopPct, n, effectiveN: n / horizon });
  }
  return perPair.length ? {
    pairs: perPair.length,
    medianExpectancyR: median(perPair.map((p) => p.expectancyR)),
    medianNetR: median(perPair.map((p) => p.netR)),
    pairsPositiveNet: perPair.filter((p) => p.netR > 0).length,
    medianEffectiveN: median(perPair.map((p) => p.effectiveN)),
  } : null;
};

const trades = {
  lowOverheadLong: tradeBand(0, 20, "long"),
  highOverheadLong: tradeBand(80, 100, "long"),
  lowOverheadShort: tradeBand(0, 20, "short"),
  highOverheadShort: tradeBand(80, 100, "short"),
};

const spread = (h) => bands[0].forward[h].medianPct - bands[4].forward[h].medianPct;

const out = {
  measuredAt: new Date().toISOString(),
  pairs: series.length,
  windowDays: WINDOW,
  horizons: HORIZONS,
  stopAtr: STOP_ATR,
  rewardRatio: RR,
  feePct: FEE_PCT,
  labelledDays: labelled.length,
  baseline,
  bands,
  spread10: spread(10),
  spread30: spread(30),
  trades,
  proxyCheck: {
    pairs: proxyVsProfile.length,
    medianAbsDifferencePct: median(proxyVsProfile.map((p) => Math.abs(p.differencePct))),
    worstAbsDifferencePct: Math.max(...proxyVsProfile.map((p) => Math.abs(p.differencePct))),
    medianProxyPct: median(proxyVsProfile.map((p) => p.proxyPct)),
    medianProfilePct: median(proxyVsProfile.map((p) => p.profilePct)),
    detail: proxyVsProfile.sort((a, b) => Math.abs(b.differencePct) - Math.abs(a.differencePct)).slice(0, 12),
  },
};
writeFileSync("research/overhead-test.json", `${JSON.stringify(out, null, 2)}\n`);

console.log(`${series.length} pairs · ${labelled.length} labelled days · ${WINDOW}-day window\n`);
console.log("overhead band     share    10d med    vs base    30d med    vs base   n(eff 30d)");
for (const b of bands) {
  const f10 = b.forward[10], f30 = b.forward[30];
  console.log(
    `${(b.band[0] + "-" + b.band[1] + "%").padEnd(16)}`
    + `${b.sharePct.toFixed(1)}%`.padStart(7)
    + `${f10.medianPct.toFixed(2)}%`.padStart(11)
    + `${f10.differencePct.toFixed(2)}`.padStart(11)
    + `${f30.medianPct.toFixed(2)}%`.padStart(11)
    + `${f30.differencePct.toFixed(2)}`.padStart(11)
    + String(Math.round(f30.effectiveN)).padStart(12),
  );
}
console.log(`\nbaseline: 10d ${baseline[10].medianPct.toFixed(2)}%  30d ${baseline[30].medianPct.toFixed(2)}%`);
console.log(`spread lowest band minus highest: 10d ${out.spread10.toFixed(2)} pts · 30d ${out.spread30.toFixed(2)} pts`);

console.log(`\ntraded with a ${STOP_ATR} ATR stop, ${RR}:1 target, 30-day horizon:`);
for (const [k, v] of Object.entries(trades)) {
  if (!v) { console.log(`  ${k.padEnd(20)} no pairs qualified`); continue; }
  console.log(`  ${k.padEnd(20)} E ${v.medianExpectancyR.toFixed(3)}  net ${v.medianNetR.toFixed(3)}`
    + `  positive on ${v.pairsPositiveNet}/${v.pairs} pairs  n≈${Math.round(v.medianEffectiveN)}`);
}

const p = out.proxyCheck;
console.log(`\nthe daily proxy against the hourly profile, today, ${p.pairs} pairs:`);
console.log(`  median absolute disagreement ${p.medianAbsDifferencePct.toFixed(1)} points · worst ${p.worstAbsDifferencePct.toFixed(1)}`);
console.log(`  median proxy ${p.medianProxyPct.toFixed(1)}% vs median profile ${p.medianProfilePct.toFixed(1)}%`);
