/**
 * Which readings precede a fall?
 *
 * Every study in this repo so far measures the probability of a rise. That is
 * half a tool: a research desk that can only ever say "wait" on the way down is
 * not neutral, it is blind on one side. This measures the mirror image — what
 * conditions precede a drawdown — so a short can be argued from evidence
 * instead of vibes, and so "avoid" can be separated from "sell".
 *
 * Candidate bearish conditions, each testable and each with a story:
 *   trapped      most of the month's money sits above price
 *   distribution volume spiking while price falls
 *   overbought   RSI stretched
 *   eventDriven  turnover concentrated in a handful of days
 *   fading       price near its highs while participation drains
 *
 * Reproducible:
 *   node research/short-signal.mjs > research/short-signal.json
 */

import { fetchAllTickers } from "../src/pulse.mjs";
import { fetchKlines, volumeZScore, rsi, mean } from "../src/analysis.mjs";

const HORIZONS = [5, 10];
const DROP = 20;          // a short "hit" is -20% or worse at any point in the window

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

const rows = [];
let pairs = 0;

for (let i = 0; i < universe.length; i += 3) {
  const batch = universe.slice(i, i + 3);
  const sets = await Promise.all(batch.map((s) => retry(() => fetchKlines(s, { limit: 400 })).catch(() => null)));
  for (const candles of sets) {
    if (!candles || candles.length < 120) continue;
    pairs++;
    const done = candles.slice(0, -1);

    for (let d = 40; d < done.length - Math.max(...HORIZONS); d++) {
      const w30 = done.slice(d - 29, d + 1);
      const entry = done[d].close;
      const hi30 = Math.max(...w30.map((c) => c.high));
      const lo30 = Math.min(...w30.map((c) => c.low));
      if (!(hi30 > lo30)) continue;

      const vols = w30.map((c) => c.quoteVolume);
      const total = vols.reduce((s, v) => s + v, 0);
      if (!total) continue;

      // Share of the window's turnover done above the current price.
      const above = w30.filter((c) => (c.high + c.low) / 2 > entry).reduce((s, c) => s + c.quoteVolume, 0);
      const top3 = [...vols].sort((a, b) => b - a).slice(0, 3).reduce((s, v) => s + v, 0);
      const recent3 = mean(vols.slice(-3));
      const prior = mean(vols.slice(0, -3));

      const rec = {
        underwater: (above / total) * 100,
        z: volumeZScore(done.slice(0, d + 1).map((c) => c.quoteVolume), 30),
        rsi: rsi(done.slice(0, d + 1).map((c) => c.close), 14),
        rangePos: ((entry - lo30) / (hi30 - lo30)) * 100,
        concentration: (top3 / total) * 100,
        volTrend: prior ? (recent3 / prior - 1) * 100 : NaN,
        price3d: (entry / done[d - 3].close - 1) * 100,
      };
      for (const h of HORIZONS) {
        const fwd = done.slice(d + 1, d + 1 + h);
        rec[`drop${h}`] = (Math.min(...fwd.map((c) => c.low)) / entry - 1) * 100;
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
    out[`hit${h}dPct`] = pct(xs, (x) => x[`drop${h}`] <= -DROP);
    out[`medianTrough${h}dPct`] = med(xs.map((x) => x[`drop${h}`]));
    out[`medianClose${h}dPct`] = med(xs.map((x) => x[`end${h}`]));
    out[`endedHigher${h}dPct`] = pct(xs, (x) => x[`end${h}`] > 0);
  }
  return out;
};

/** De-overlapped comparison, since a 10-day window shares nine days with its neighbour. */
function significance(a, b, horizon) {
  const rate = (xs) => xs.filter((x) => x[`drop${horizon}`] <= -DROP).length / xs.length;
  const pa = rate(a), pb = rate(b);
  const na = a.length / horizon, nb = b.length / horizon;
  const se = Math.sqrt((pa * (1 - pa)) / na + (pb * (1 - pb)) / nb);
  return { differencePp: (pa - pb) * 100, standardErrorPp: se * 100, sigmas: se ? (pa - pb) / se : NaN };
}

const ok = (v) => Number.isFinite(v);
const CONDITIONS = {
  trapped: (r) => ok(r.underwater) && r.underwater >= 80,
  distribution: (r) => ok(r.z) && r.z >= 3.5 && ok(r.price3d) && r.price3d < 0,
  overbought: (r) => ok(r.rsi) && r.rsi >= 70,
  eventDriven: (r) => ok(r.concentration) && r.concentration >= 60,
  fading: (r) => ok(r.rangePos) && r.rangePos >= 80 && ok(r.volTrend) && r.volTrend < 0,
};

const baseline = summarise(rows);
const out = {
  measuredAt: new Date().toISOString(),
  method: { dropThresholdPct: DROP, horizonsDays: HORIZONS },
  pairsSampled: pairs,
  baseline,
  conditions: {},
};

for (const [name, test] of Object.entries(CONDITIONS)) {
  const hit = rows.filter(test);
  const rest = rows.filter((r) => !test(r));
  out.conditions[name] = {
    ...summarise(hit),
    liftVsBaseline: summarise(hit).hit10dPct / baseline.hit10dPct,
    ...significance(hit, rest, 10),
  };
}

console.log(JSON.stringify(out, null, 2));
