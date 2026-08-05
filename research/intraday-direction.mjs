/**
 * When the volume alert fires, does the direction of the trigger hour matter?
 *
 * `intraday-signal.mjs` measured the one thing in this repo that survived
 * contact with data: hourly turnover at z >= 5 is followed by a 10% gain within
 * twelve hours 4.44x more often than a random hour. That result is the basis of
 * every alert `wte scan` emits.
 *
 * It was measured on volume alone. `alertsFrom` filters on `volumeZScore` and
 * nothing else, so the alert list mixes two situations that look nothing alike
 * on a chart: a pair whose hour was violent and up, and a pair whose hour was
 * violent and down. Today's scan returned both — FIDA at +4.23% and HEI at
 * -18.45%, in the same six-name list, with the same claimed edge behind them.
 *
 * Recommending a name off that list means implicitly assuming direction does
 * not matter, and nobody has checked. This checks. The split is stated before
 * the run so it cannot be chosen after seeing the answer:
 *
 *   up hard    trigger hour closed more than +2%
 *   up mild    0 to +2%
 *   down mild  -2% to 0
 *   down hard  worse than -2%
 *
 * The comparison that decides anything is each bucket against the *pooled*
 * z >= 5 group, not against a random hour. Beating a random hour only restates
 * the result we already have.
 *
 * Reproducible:
 *   node research/intraday-direction.mjs > research/intraday-direction.json
 */

import { fetchAllTickers } from "../src/pulse.mjs";
import { fetchKlines } from "../src/analysis.mjs";

const LOOKBACK = 168;
const HORIZON = 12;
const TARGET = 10;
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
      const fwd = done.slice(j + 1, j + 1 + HORIZON);
      rows.push({
        z: (qv[j] - mu) / sd,
        // The trigger hour's own return — what a reader sees in the 1h column
        // when the alert prints, and the only thing distinguishing FIDA from HEI.
        triggerPct: (done[j].close / prev.close - 1) * 100,
        gainPct: (Math.max(...fwd.map((c) => c.high)) / done[j].close - 1) * 100,
        // Downside over the same window. A bucket can reach +10% as often as
        // another and still be untradeable if it goes to -20% first, and the
        // hit rate alone cannot say so.
        drawdownPct: (Math.min(...fwd.map((c) => c.low)) / done[j].close - 1) * 100,
        endPct: (fwd.at(-1).close / done[j].close - 1) * 100,
      });
    }
  }
}

const pct = (xs, f) => (xs.length ? (xs.filter(f).length / xs.length) * 100 : NaN);
const median = (xs) => {
  if (!xs.length) return NaN;
  const s = [...xs].sort((a, b) => a - b);
  const m = s.length >> 1;
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};
const summarise = (xs) => ({
  n: xs.length,
  followThroughPct: pct(xs, (x) => x.gainPct >= TARGET),
  endedHigherPct: pct(xs, (x) => x.endPct > 0),
  medianGainPct: median(xs.map((x) => x.gainPct)),
  medianDrawdownPct: median(xs.map((x) => x.drawdownPct)),
  medianEndPct: median(xs.map((x) => x.endPct)),
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
  if (group.length < 30) {
    buckets[name] = { n: group.length, note: "too few to read" };
    continue;
  }
  const s = summarise(group);
  buckets[name] = {
    ...s,
    liftVsRandomHour: s.followThroughPct / baseline.followThroughPct,
    liftVsAllAlerts: s.followThroughPct / summarise(alerts).followThroughPct,
    // The test that matters: is this bucket different from the alert list we
    // already emit, or is the split describing noise?
    vsAllAlerts: significance(group, alerts),
    vsRandomHour: significance(group, rows),
  };
}

// The same question asked without buckets, so a threshold choice cannot
// manufacture the answer: correlation between trigger return and what followed.
const corr = (a, b) => {
  const [ma] = stat(a), [mb] = stat(b);
  let num = 0, da = 0, db = 0;
  for (let i = 0; i < a.length; i++) {
    num += (a[i] - ma) * (b[i] - mb);
    da += (a[i] - ma) ** 2;
    db += (b[i] - mb) ** 2;
  }
  return num / Math.sqrt(da * db);
};

console.log(JSON.stringify({
  measuredAt: new Date().toISOString(),
  method: {
    interval: "1h",
    lookbackHours: LOOKBACK,
    horizonHours: HORIZON,
    targetGainPct: TARGET,
    alertThresholdZ: ALERT_Z,
    buckets: "trigger-hour return: >+2, 0..+2, -2..0, <-2",
    note: "Buckets fixed before the run. Each is tested against the pooled alert group, because beating a random hour only restates the known result.",
  },
  pairsSampled: pairs,
  baseline,
  allAlerts: { ...summarise(alerts), ...significance(alerts, rows) },
  buckets,
  triggerReturnVsOutcome: {
    withGain: alerts.length > 2 ? corr(alerts.map((r) => r.triggerPct), alerts.map((r) => r.gainPct)) : NaN,
    withEnd: alerts.length > 2 ? corr(alerts.map((r) => r.triggerPct), alerts.map((r) => r.endPct)) : NaN,
    note: "Across the alert group only. A near-zero correlation means the 1h column carries no information about what follows.",
  },
}, null, 2));
