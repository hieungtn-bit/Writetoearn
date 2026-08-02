/**
 * Is a tight range a signal, or is it just what most charts look like?
 *
 * Every scan that recommends a "coiling base" treats compression as evidence.
 * Nobody publishes the base rate: how often a pair is compressed at all, and
 * how often compression is followed by anything. Without that denominator,
 * "it is consolidating" describes the majority of the market on the majority of
 * days and predicts nothing.
 *
 * Measures compression on its own and in combination with the volume signal
 * from volume-signal.mjs, so the two can be compared on the same sample.
 *
 * Reproducible:
 *   node research/compression-signal.mjs > research/compression-signal.json
 */

import { fetchAllTickers } from "../src/pulse.mjs";
import { fetchKlines, volumeZScore } from "../src/analysis.mjs";

const TIGHT = 35;        // 7-day span at or below this share of the 30-day span
const Z = 3.5;           // the volume signal, for the combination test
const HORIZONS = [5, 10];
const WIN = 30;          // a "hit" is +30% or better at any point in the window

const retry = async (fn, n = 5) => {
  let last;
  for (let i = 0; i < n; i++) {
    try { return await fn(); } catch (e) { last = e; await new Promise((r) => setTimeout(r, 900 * (i + 1))); }
  }
  throw last;
};

const EXCLUDED = /(UP|DOWN|BULL|BEAR)USDT$|^(USDC|FDUSD|TUSD|BUSD|DAI|EUR|AEUR|USDP|XUSD)USDT$/;

const tickers = await retry(() => fetchAllTickers());
const universe = tickers
  .filter((t) => t.symbol.endsWith("USDT") && !EXCLUDED.test(t.symbol))
  .filter((t) => t.quoteVolume24h >= 2e6)
  .sort((a, b) => b.quoteVolume24h - a.quoteVolume24h)
  .slice(0, 90)
  .map((t) => t.symbol);

const rows = [];       // every observation: compression, z, forward outcomes
let pairs = 0;

const span = (s) => Math.max(...s.map((c) => c.high)) - Math.min(...s.map((c) => c.low));

for (let i = 0; i < universe.length; i += 3) {
  const batch = universe.slice(i, i + 3);
  const sets = await Promise.all(batch.map((s) => retry(() => fetchKlines(s, { limit: 400 })).catch(() => null)));
  for (const candles of sets) {
    if (!candles || candles.length < 120) continue;
    pairs++;
    const done = candles.slice(0, -1); // the live candle has partial volume and range
    for (let d = 40; d < done.length - Math.max(...HORIZONS); d++) {
      const w30 = done.slice(d - 29, d + 1);
      const base = span(w30);
      if (!base) continue;

      const entry = done[d].close;
      const rec = {
        compression: (span(done.slice(d - 6, d + 1)) / base) * 100,
        z: volumeZScore(done.slice(0, d + 1).map((c) => c.quoteVolume), 30),
      };
      for (const h of HORIZONS) {
        const fwd = done.slice(d + 1, d + 1 + h);
        rec[`max${h}`] = (Math.max(...fwd.map((c) => c.high)) / entry - 1) * 100;
        rec[`end${h}`] = (fwd.at(-1).close / entry - 1) * 100;
      }
      rows.push(rec);
    }
  }
}

const med = (xs) => {
  const s = [...xs].sort((a, b) => a - b);
  const m = s.length >> 1;
  return s.length ? (s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2) : NaN;
};
const pct = (xs, f) => (xs.length ? (xs.filter(f).length / xs.length) * 100 : NaN);

const summarise = (xs) => {
  const out = { n: xs.length };
  for (const h of HORIZONS) {
    out[`hit${h}dPct`] = pct(xs, (x) => x[`max${h}`] >= WIN);
    out[`medianPeak${h}dPct`] = med(xs.map((x) => x[`max${h}`]));
    out[`medianClose${h}dPct`] = med(xs.map((x) => x[`end${h}`]));
    out[`endedLower${h}dPct`] = pct(xs, (x) => x[`end${h}`] < 0);
  }
  return out;
};

/**
 * How much of the apparent edge survives the overlap.
 *
 * Daily observations with a 10-day forward window share nine days out of ten
 * with their neighbours, so the raw count massively overstates how much
 * independent evidence there is. Dividing by the horizon is the crude
 * correction, and crude is enough to show whether a difference is worth
 * discussing at all.
 */
function significance(a, b, horizon) {
  const rate = (xs) => xs.filter((x) => x[`max${horizon}`] >= WIN).length / xs.length;
  const pa = rate(a), pb = rate(b);
  const na = a.length / horizon, nb = b.length / horizon; // de-overlapped
  const se = Math.sqrt((pa * (1 - pa)) / na + (pb * (1 - pb)) / nb);
  return {
    effectiveNCompressed: na,
    effectiveNLoose: nb,
    differencePp: (pa - pb) * 100,
    standardErrorPp: se * 100,
    sigmas: se ? (pa - pb) / se : NaN,
  };
}

const compressed = rows.filter((r) => r.compression <= TIGHT);
const loose = rows.filter((r) => r.compression > TIGHT);
const volSignal = rows.filter((r) => Number.isFinite(r.z) && r.z >= Z);
const both = rows.filter((r) => r.compression <= TIGHT && Number.isFinite(r.z) && r.z >= Z);

const baseline = summarise(rows);
const comp = summarise(compressed);

console.log(JSON.stringify({
  measuredAt: new Date().toISOString(),
  method: { tightThresholdPct: TIGHT, zThreshold: Z, horizonsDays: HORIZONS, winThresholdPct: WIN },
  pairsSampled: pairs,

  // The denominator nobody publishes: how ordinary is a tight range?
  howCommon: {
    compressedSharePct: pct(rows, (r) => r.compression <= TIGHT),
    medianCompressionPct: med(rows.map((r) => r.compression)),
    quartile1CompressionPct: [...rows.map((r) => r.compression)].sort((a, b) => a - b)[Math.floor(rows.length * 0.25)],
  },

  baseline,
  compressed: comp,
  loose: summarise(loose),
  volumeSignal: summarise(volSignal),
  compressedAndVolume: summarise(both),

  derived: {
    compressionLift5d: comp.hit5dPct / baseline.hit5dPct,
    compressionLift10d: comp.hit10dPct / baseline.hit10dPct,
    volumeLift10d: summarise(volSignal).hit10dPct / baseline.hit10dPct,
    ...significance(compressed, loose, 10),
  },
}, null, 2));
