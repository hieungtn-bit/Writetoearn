/**
 * Does finer time resolution buy an edge that better features cannot?
 *
 * breakout-signal.mjs tested seven conditions on daily candles across 43,088
 * pair-days and found nothing: the best was oversold at 1.22x lift and 1.57
 * sigma, and the compression thesis this desk had been publishing came out at
 * 1.01x. That result is about *prediction* — trying to see a move before it
 * exists — and the conclusion there is that daily OHLCV cannot do it.
 *
 * This asks a different question. Not "what precedes a move" but "how fast can
 * we see one that has already started". A daily candle cannot report anything
 * until 00:00 UTC no matter how violent the session was; an hourly candle
 * reports within the hour. BICO is the case in point: hourly turnover hit 6.7
 * sigma at 2026-08-02T14:00 with price at 0.01220, while the daily detector
 * did not fire until the following day at 0.01742 — a 43% worse entry for the
 * same event.
 *
 * One case proves nothing, so this measures the whole venue. The outcome is
 * deliberately modest — did price reach +10% within twelve hours — because the
 * claim being tested is that we can be early, not that we can be right.
 *
 * Reproducible:
 *   node research/intraday-signal.mjs > research/intraday-signal.json
 */

import { fetchAllTickers } from "../src/pulse.mjs";
import { fetchKlines } from "../src/analysis.mjs";

const LOOKBACK = 168;   // trailing hours the z-score is measured against
const HORIZON = 12;     // hours of look-ahead
const TARGET = 10;      // a "follow-through" is this much above the alert close
const PAIRS = 60;
const THRESHOLDS = [3, 5, 8, 12];

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
      // Causal: the baseline uses only hours strictly before the one measured.
      const [mu, sd] = stat(qv.slice(j - LOOKBACK, j));
      if (!sd) continue;
      const fwd = done.slice(j + 1, j + 1 + HORIZON);
      rows.push({
        z: (qv[j] - mu) / sd,
        gainPct: (Math.max(...fwd.map((c) => c.high)) / done[j].close - 1) * 100,
        endPct: (fwd.at(-1).close / done[j].close - 1) * 100,
      });
    }
  }
}

const pct = (xs, f) => (xs.length ? (xs.filter(f).length / xs.length) * 100 : NaN);
const summarise = (xs) => ({
  n: xs.length,
  followThroughPct: pct(xs, (x) => x.gainPct >= TARGET),
  endedHigherPct: pct(xs, (x) => x.endPct > 0),
});

/** De-overlapped: consecutive 12-hour windows share eleven of their hours. */
function significance(a, b) {
  const rate = (xs) => xs.filter((x) => x.gainPct >= TARGET).length / xs.length;
  const pa = rate(a), pb = rate(b);
  const na = a.length / HORIZON, nb = b.length / HORIZON;
  const se = Math.sqrt((pa * (1 - pa)) / na + (pb * (1 - pb)) / nb);
  return { differencePp: (pa - pb) * 100, standardErrorPp: se * 100, sigmas: se ? (pa - pb) / se : NaN };
}

const baseline = summarise(rows);
const out = {
  measuredAt: new Date().toISOString(),
  method: {
    interval: "1h",
    lookbackHours: LOOKBACK,
    horizonHours: HORIZON,
    targetGainPct: TARGET,
    note: "Detection latency, not prediction. The alert fires on a move already under way.",
  },
  pairsSampled: pairs,
  baseline,
  thresholds: {},
};

for (const z of THRESHOLDS) {
  const hit = rows.filter((r) => r.z >= z);
  if (!hit.length) { out.thresholds[`z${z}`] = { n: 0, note: "empty group" }; continue; }
  const s = summarise(hit);
  out.thresholds[`z${z}`] = {
    ...s,
    liftVsBaseline: s.followThroughPct / baseline.followThroughPct,
    alertsPerPairPerDay: (hit.length / pairs) / (rows.length / pairs / 24),
    ...significance(hit, rows),
  };
}

console.log(JSON.stringify(out, null, 2));
