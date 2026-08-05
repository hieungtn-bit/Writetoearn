/**
 * After a volume alert, is there a trade on the other side?
 *
 * Everything measured here so far asks one question: does price reach +10%.
 * `short-signal.mjs` does look down, but on daily candles over five and ten
 * days, and nothing in it cleared 1.9 sigma. The one result that survived is
 * hourly — turnover at z >= 5, twelve-hour horizon — and on that clock the
 * short side has never been asked at all.
 *
 * So this asks both sides of the same alert, on the same bars, with symmetric
 * targets: does price touch +10% (long), does it touch -10% (short).
 *
 * The number that decides whether either is tradeable is neither of those. Over
 * twelve volatile hours a pair can touch both, and a hit rate computed on highs
 * and lows separately will happily report a 40% long edge and a 40% short edge
 * on the same rows — an arbitrage that does not exist. So the path is walked
 * hour by hour and the *first* target reached is recorded:
 *
 *   longFirst    +10% reached in an hour whose low did not reach -10%
 *   shortFirst   -10% reached in an hour whose high did not reach +10%
 *   sameHour     one hourly candle spans both; unattributable at this
 *                resolution, so it is counted and given to neither
 *   neither      twelve hours passed without either target
 *
 * `sameHour` is reported rather than split, because splitting it is exactly the
 * assumption that makes backtests look better than they trade.
 *
 * Reproducible:
 *   node research/two-sided.mjs > research/two-sided.json
 */

import { fetchAllTickers } from "../src/pulse.mjs";
import { fetchKlines } from "../src/analysis.mjs";

const LOOKBACK = 168;
const HORIZON = 12;
const TARGET = 10;      // symmetric: +10% for the long, -10% for the short
const PAIRS = 60;
const ALERT_Z = 5;

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
  .filter((t) => t.quoteVolume24h >= 1e6)
  .sort((a, b) => b.quoteVolume24h - a.quoteVolume24h)
  .slice(0, PAIRS)
  .map((t) => t.symbol);

const stat = (xs) => {
  const mu = xs.reduce((a, b) => a + b, 0) / xs.length;
  return [mu, Math.sqrt(xs.reduce((a, b) => a + (b - mu) ** 2, 0) / (xs.length - 1))];
};

/** Walks the forward window one bar at a time and returns which side paid first. */
function race(entry, forward) {
  const up = entry * (1 + TARGET / 100);
  const down = entry * (1 - TARGET / 100);
  for (const c of forward) {
    const hitUp = c.high >= up;
    const hitDown = c.low <= down;
    if (hitUp && hitDown) return "sameHour";
    if (hitUp) return "longFirst";
    if (hitDown) return "shortFirst";
  }
  return "neither";
}

const rows = [];
let pairs = 0;

for (let i = 0; i < universe.length; i += 4) {
  const sets = await Promise.all(
    universe.slice(i, i + 4).map((s) =>
      retry(() => fetchKlines(s, { interval: "1h", limit: 720 })).catch(() => null),
    ),
  );
  for (const candles of sets) {
    if (!candles || candles.length < 300) continue;
    pairs++;
    const done = candles.slice(0, -1);
    const qv = done.map((c) => c.quoteVolume);

    for (let j = LOOKBACK; j < done.length - HORIZON; j++) {
      const [mu, sd] = stat(qv.slice(j - LOOKBACK, j));
      if (!sd) continue;
      const prev = done[j - 1];
      if (!prev?.close) continue;
      const entry = done[j].close;
      const fwd = done.slice(j + 1, j + 1 + HORIZON);
      rows.push({
        z: (qv[j] - mu) / sd,
        triggerPct: (entry / prev.close - 1) * 100,
        // Naive one-sided views, kept so the gap between them and the race is
        // visible rather than argued.
        touchedUp: Math.max(...fwd.map((c) => c.high)) / entry - 1 >= TARGET / 100,
        touchedDown: Math.min(...fwd.map((c) => c.low)) / entry - 1 <= -TARGET / 100,
        outcome: race(entry, fwd),
        endPct: (fwd.at(-1).close / entry - 1) * 100,
      });
    }
  }
}

const pct = (xs, f) => (xs.length ? (xs.filter(f).length / xs.length) * 100 : NaN);
const summarise = (xs) => ({
  n: xs.length,
  touchedUpPct: pct(xs, (x) => x.touchedUp),
  touchedDownPct: pct(xs, (x) => x.touchedDown),
  touchedBothPct: pct(xs, (x) => x.touchedUp && x.touchedDown),
  longFirstPct: pct(xs, (x) => x.outcome === "longFirst"),
  shortFirstPct: pct(xs, (x) => x.outcome === "shortFirst"),
  sameHourPct: pct(xs, (x) => x.outcome === "sameHour"),
  neitherPct: pct(xs, (x) => x.outcome === "neither"),
  endedHigherPct: pct(xs, (x) => x.endPct > 0),
});

/** De-overlapped on the stated field: consecutive windows share eleven hours. */
function significance(a, b, field) {
  const rate = (xs) => xs.filter((x) => x.outcome === field).length / xs.length;
  const pa = rate(a), pb = rate(b);
  const na = a.length / HORIZON, nb = b.length / HORIZON;
  const se = Math.sqrt((pa * (1 - pa)) / na + (pb * (1 - pb)) / nb);
  return { differencePp: (pa - pb) * 100, standardErrorPp: se * 100, sigmas: se ? (pa - pb) / se : NaN };
}

const baseline = summarise(rows);
const alerts = rows.filter((r) => r.z >= ALERT_Z);

const BUCKETS = {
  upHard: (r) => r.triggerPct > 2,
  upMild: (r) => r.triggerPct > 0 && r.triggerPct <= 2,
  downMild: (r) => r.triggerPct <= 0 && r.triggerPct >= -2,
  downHard: (r) => r.triggerPct < -2,
};

const buckets = {};
for (const [name, f] of Object.entries(BUCKETS)) {
  const group = alerts.filter(f);
  if (group.length < 30) { buckets[name] = { n: group.length, note: "too few to read" }; continue; }
  buckets[name] = {
    ...summarise(group),
    longVsAllAlerts: significance(group, alerts, "longFirst"),
    shortVsAllAlerts: significance(group, alerts, "shortFirst"),
    longVsRandomHour: significance(group, rows, "longFirst"),
    shortVsRandomHour: significance(group, rows, "shortFirst"),
  };
}

console.log(JSON.stringify({
  measuredAt: new Date().toISOString(),
  method: {
    interval: "1h",
    lookbackHours: LOOKBACK,
    horizonHours: HORIZON,
    targetPct: TARGET,
    alertThresholdZ: ALERT_Z,
    resolution: "The first target reached is decided bar by bar. An hourly candle spanning both targets is counted as sameHour and awarded to neither.",
    note: "touchedUpPct and touchedDownPct are the naive one-sided views and will sum past 100. longFirstPct and shortFirstPct are what a position would actually have collected.",
  },
  pairsSampled: pairs,
  baseline,
  allAlerts: {
    ...summarise(alerts),
    longVsRandomHour: significance(alerts, rows, "longFirst"),
    shortVsRandomHour: significance(alerts, rows, "shortFirst"),
  },
  buckets,
}, null, 2));
