/**
 * Does an exploding volume z-score predict the next big move?
 *
 * BANK, GIGGLE and ENA are the three names people point at when they ask how to
 * find the next one. Measured the day before each of their largest single-day
 * gains, all three shared exactly one precursor: a volume z-score already far
 * above normal. None of them was quietly accumulating.
 *
 * This measures what that precursor is actually worth, including the split
 * everybody assumes runs the other way — whether it is better to buy the pair
 * that has not moved yet or the one already running.
 *
 * Reproducible: `node research/volume-signal.mjs > research/volume-signal.json`
 * Every figure in the published article comes from that file.
 */

import { fetchAllTickers } from "../src/pulse.mjs";
import { fetchKlines, rsi, volumeZScore } from "../src/analysis.mjs";

const Z = 3.5;        // signal threshold on the completed-day volume z-score
const HORIZON = 5;    // trading days measured forward
const WIN = 30;       // a "hit" is +30% or better at any point in the window
const COILED_MAX = 60;   // range position below this = "has not run yet"
const SCAN_MIN_VOLUME = 3e6;   // liquidity floor for the live watchlist scan
const MIN_BASELINE = 1.5e6;    // baseline turnover a candidate must already have
const REFERENCE = ["BANKUSDT", "GIGGLEUSDT", "ENAUSDT"];

const retry = async (fn, n = 5) => {
  let last;
  for (let i = 0; i < n; i++) {
    try { return await fn(); } catch (e) { last = e; await new Promise((r) => setTimeout(r, 900 * (i + 1))); }
  }
  throw last;
};

const EXCLUDED = /(UP|DOWN|BULL|BEAR)USDT$|^(USDC|FDUSD|TUSD|BUSD|DAI|EUR|AEUR|USDP|XUSD)USDT$/;

/**
 * What each reference coin looked like the day before its largest gain.
 *
 * Hardcoding this table into an article would make its most load-bearing claim
 * the one number nobody can check. Measuring it here puts it under the same
 * gate as everything else.
 */
async function referenceProfiles() {
  const out = [];
  for (const sym of REFERENCE) {
    const candles = await retry(() => fetchKlines(sym, { limit: 200 })).catch(() => null);
    if (!candles) continue;
    let best = -Infinity, bi = -1;
    for (let i = 45; i < candles.length; i++) {
      const g = candles[i].close / candles[i - 1].close - 1;
      if (g > best) { best = g; bi = i; }
    }
    const hist = candles.slice(0, bi);              // strictly the day before
    const vols = hist.map((c) => c.quoteVolume);
    const closes = hist.map((c) => c.close);
    const w30 = hist.slice(-30);
    const hi = Math.max(...w30.map((c) => c.high));
    const lo = Math.min(...w30.map((c) => c.low));
    const recent3 = vols.slice(-3).reduce((a, b) => a + b, 0) / 3;
    const prior = vols.slice(-30, -3).reduce((a, b) => a + b, 0) / 27;
    out.push({
      symbol: sym.replace(/USDT$/, ""),
      launchDate: new Date(candles[bi].openTime).toISOString().slice(0, 10),
      launchGainPct: best * 100,
      priorVolumeZ: volumeZScore(vols, 30),
      priorVolTrendPct: prior ? (recent3 / prior - 1) * 100 : NaN,
      priorRsi14: rsi(closes, 14),
      priorRangePosPct: hi > lo ? ((closes.at(-1) - lo) / (hi - lo)) * 100 : NaN,
      priorBaselineTurnover: vols.slice(-31, -1).reduce((a, b) => a + b, 0) / 30,
    });
  }
  return out;
}

const profiles = await referenceProfiles();
const tickers = await retry(() => fetchAllTickers());
const universe = tickers
  .filter((t) => t.symbol.endsWith("USDT") && !EXCLUDED.test(t.symbol))
  .filter((t) => t.quoteVolume24h >= 2e6)
  .sort((a, b) => b.quoteVolume24h - a.quoteVolume24h)
  .slice(0, 90)
  .map((t) => t.symbol);

const all = [], sig = [], coiled = [], extended = [];
let pairs = 0;

for (let i = 0; i < universe.length; i += 3) {
  const batch = universe.slice(i, i + 3);
  const sets = await Promise.all(batch.map((s) => retry(() => fetchKlines(s, { limit: 400 })).catch(() => null)));
  for (const candles of sets) {
    if (!candles || candles.length < 120) continue;
    pairs++;
    const done = candles.slice(0, -1); // the live candle has incomplete volume
    for (let d = 40; d < done.length - HORIZON; d++) {
      const z = volumeZScore(done.slice(0, d + 1).map((c) => c.quoteVolume), 30);
      const entry = done[d].close;
      const fwd = done.slice(d + 1, d + 1 + HORIZON);
      const rec = {
        maxGain: (Math.max(...fwd.map((c) => c.high)) / entry - 1) * 100,
        endRet: (fwd.at(-1).close / entry - 1) * 100,
      };
      all.push(rec);
      if (!Number.isFinite(z) || z < Z) continue;

      const w30 = done.slice(d - 29, d + 1);
      const hi = Math.max(...w30.map((c) => c.high));
      const lo = Math.min(...w30.map((c) => c.low));
      const pos = hi > lo ? ((entry - lo) / (hi - lo)) * 100 : NaN;

      sig.push(rec);
      if (Number.isFinite(pos)) (pos < COILED_MAX ? coiled : extended).push(rec);
    }
  }
}

const med = (xs) => {
  const s = [...xs].sort((a, b) => a - b);
  const m = s.length >> 1;
  return s.length ? (s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2) : NaN;
};
const pct = (xs, f) => (xs.filter(f).length / xs.length) * 100;
const summarise = (xs) => ({
  n: xs.length,
  hitPct: pct(xs, (x) => x.maxGain >= WIN),
  medianPeakPct: med(xs.map((x) => x.maxGain)),
  medianClosePct: med(xs.map((x) => x.endRet)),
  endedLowerPct: pct(xs, (x) => x.endRet < 0),
});

const baseline = summarise(all), signal = summarise(sig);
const cSum = summarise(coiled), eSum = summarise(extended);

console.log(JSON.stringify({
  measuredAt: new Date().toISOString(),
  method: {
    zThreshold: Z, horizonDays: HORIZON, winThresholdPct: WIN, coiledMaxRangePct: COILED_MAX,
    scanMinVolume: SCAN_MIN_VOLUME, minBaselineTurnover: MIN_BASELINE,
  },
  referenceProfiles: profiles,
  pairsSampled: pairs,
  baseline,
  signal,
  coiled: cSum,
  extended: eSum,
  // Ratios the article leans on. Derived here rather than in prose so the
  // published figure and the measurement cannot drift apart.
  derived: {
    liftVsBaseline: signal.hitPct / baseline.hitPct,
    extendedVsCoiledRatio: eSum.hitPct / cSum.hitPct,
    signalMissPct: 100 - signal.hitPct,
  },
}, null, 2));
