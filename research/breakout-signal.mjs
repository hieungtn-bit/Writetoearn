/**
 * What precedes an explosive single day?
 *
 * BICO closed +36.9% on 2026-08-02 after months of drift, and nothing in this
 * repo saw it coming. Two reasons, and they are different failures:
 *
 *   1. The pulse detector *did* fire — but only on the day, and only because
 *      turnover jumped to $16M. The day before, BICO traded $0.63M. Every
 *      scanner here carries a liquidity floor between $2M and $5M, which is
 *      correct for ranking today's event and fatal for finding tomorrow's:
 *      the floor is exactly the thing a pre-breakout base is sitting below.
 *   2. The compression thesis would have missed it anyway. BICO's 30-day range
 *      width sat at the 54th percentile of its own history. Utterly ordinary.
 *
 * So this measures a different question from compression-signal.mjs. Not "does
 * a tight range precede a large move" but "does anything visible in a quiet,
 * illiquid pair precede an explosive day". The universe deliberately reaches
 * far below the floors used elsewhere.
 *
 * The one shape BICO did have: money leaning to up days (flow 1.378 over 30d)
 * while price sat at 8% of its 30-day range. Buying, quietly, at the floor.
 * That is the lead hypothesis — and it is tested here against the alternatives
 * rather than assumed.
 *
 * Reproducible:
 *   node research/breakout-signal.mjs > research/breakout-signal.json
 */

import { fetchAllTickers } from "../src/pulse.mjs";
import { fetchKlines, volumeZScore, rsi, upDownRatio, realizedVolatility } from "../src/analysis.mjs";

const HORIZON = 5;      // look-ahead window, trading days
const POP = 25;         // an "explosive day" is a close-to-close gain of this much
const MIN_TURNOVER = 3e5;  // deliberately far below the 5M pulse floor
const MAX_TURNOVER = 2e7;  // above this a pair is already discovered
const PAIRS = 180;

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
  .filter((t) => t.quoteVolume24h >= MIN_TURNOVER && t.quoteVolume24h <= MAX_TURNOVER)
  .sort((a, b) => b.quoteVolume24h - a.quoteVolume24h)
  .slice(0, PAIRS)
  .map((t) => t.symbol);

const rows = [];
let pairs = 0;

for (let i = 0; i < universe.length; i += 3) {
  const batch = universe.slice(i, i + 3);
  const sets = await Promise.all(
    batch.map((s) => retry(() => fetchKlines(s, { limit: 400 })).catch(() => null)),
  );
  for (const candles of sets) {
    if (!candles || candles.length < 150) continue;
    pairs++;
    const done = candles.slice(0, -1);

    // Rolling 30-day range widths, so "compressed" means compressed for this
    // pair rather than compressed compared to Bitcoin.
    const widths = [];
    for (let d = 0; d < done.length; d++) {
      if (d < 29) { widths.push(NaN); continue; }
      const w = done.slice(d - 29, d + 1);
      const lo = Math.min(...w.map((c) => c.low));
      widths.push(lo ? ((Math.max(...w.map((c) => c.high)) - lo) / lo) * 100 : NaN);
    }

    for (let d = 90; d < done.length - HORIZON; d++) {
      const w30 = done.slice(d - 29, d + 1);
      const w90 = done.slice(d - 89, d + 1);
      const entry = done[d].close;
      const hi = Math.max(...w30.map((c) => c.high));
      const lo = Math.min(...w30.map((c) => c.low));
      if (!(hi > lo)) continue;

      const priorWidths = widths.slice(0, d + 1).filter(Number.isFinite);
      const widthPct = priorWidths.length
        ? (priorWidths.filter((v) => v < widths[d]).length / priorWidths.length) * 100
        : NaN;

      const avgTurnover = w30.reduce((s, c) => s + c.quoteVolume, 0) / w30.length;
      if (avgTurnover < MIN_TURNOVER) continue;

      // The outcome: the largest single-day gain in the look-ahead window, and
      // whether the pair got anywhere at all over the same span.
      const fwd = done.slice(d + 1, d + 1 + HORIZON);
      let bestDay = -Infinity;
      for (let j = 0; j < fwd.length; j++) {
        const prev = j === 0 ? done[d] : fwd[j - 1];
        bestDay = Math.max(bestDay, (fwd[j].close / prev.close - 1) * 100);
      }

      // Normalised outcome. A compressed pair is low-volatility by construction,
      // so counting raw +25% days would penalise it mechanically and the whole
      // result would be an artifact of the definition. Measuring the best day in
      // units of the pair's own daily sigma removes that.
      const sig = realizedVolatility(done.slice(0, d + 1).map((c) => c.close), { periods: 30 }) / Math.sqrt(365);

      rows.push({
        rangePos: ((entry - lo) / (hi - lo)) * 100,
        widthPct,
        flow30: upDownRatio(w30),
        flow90: upDownRatio(w90),
        z: volumeZScore(done.slice(0, d + 1).map((c) => c.quoteVolume), 30),
        rsi: rsi(done.slice(0, d + 1).map((c) => c.close), 14),
        vol30: realizedVolatility(done.slice(0, d + 1).map((c) => c.close), { periods: 30 }),
        change30: (entry / done[d - 29].close - 1) * 100,
        bestDay,
        bestDaySigma: sig ? bestDay / sig : NaN,
        endPct: (fwd.at(-1).close / entry - 1) * 100,
      });
    }
  }
}

const med = (xs) => {
  const s = [...xs].sort((a, b) => a - b);
  const m = s.length >> 1;
  return s.length ? (s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2) : NaN;
};
const pct = (xs, f) => (xs.length ? (xs.filter(f).length / xs.length) * 100 : NaN);

const SIGMA_POP = 4;   // an explosive day measured in the pair's own volatility

const summarise = (xs) => ({
  n: xs.length,
  popPct: pct(xs, (x) => x.bestDay >= POP),
  sigmaPopPct: pct(xs, (x) => x.bestDaySigma >= SIGMA_POP),
  medianBestDaySigma: med(xs.map((x) => x.bestDaySigma).filter(Number.isFinite)),
  bigPopPct: pct(xs, (x) => x.bestDay >= 40),
  medianBestDayPct: med(xs.map((x) => x.bestDay)),
  medianEndPct: med(xs.map((x) => x.endPct)),
  endedHigherPct: pct(xs, (x) => x.endPct > 0),
});

/** De-overlapped, since consecutive look-ahead windows share most of their days. */
function significance(a, b, field = "bestDay", threshold = POP) {
  const rate = (xs) => xs.filter((x) => x[field] >= threshold).length / xs.length;
  const pa = rate(a), pb = rate(b);
  const na = a.length / HORIZON, nb = b.length / HORIZON;
  const se = Math.sqrt((pa * (1 - pa)) / na + (pb * (1 - pb)) / nb);
  return { differencePp: (pa - pb) * 100, standardErrorPp: se * 100, sigmas: se ? (pa - pb) / se : NaN };
}

const ok = (v) => Number.isFinite(v);
const CONDITIONS = {
  /** The BICO shape: money leaning to up days while price sits at the range floor. */
  quietBidAtFloor: (r) => ok(r.rangePos) && r.rangePos <= 20 && ok(r.flow30) && r.flow30 >= 1.2,
  /** The thesis this desk has been publishing. Tested, not assumed. */
  compressed: (r) => ok(r.widthPct) && r.widthPct <= 20,
  /** Buying that has not yet shown up as noise. */
  quietAccumulation: (r) => ok(r.flow30) && r.flow30 >= 1.3 && ok(r.z) && r.z <= 0,
  /** Money in, price down — the classic divergence claim. */
  flowDivergence: (r) => ok(r.flow30) && r.flow30 >= 1.2 && ok(r.change30) && r.change30 < 0,
  /** Turnover drained out of the pair entirely. */
  dormant: (r) => ok(r.z) && r.z <= -0.5,
  /** Simply beaten down. */
  oversold: (r) => ok(r.rsi) && r.rsi <= 35,
  /** Both halves of the lead hypothesis, plus silence. */
  quietBidAtFloorDormant: (r) =>
    ok(r.rangePos) && r.rangePos <= 20 && ok(r.flow30) && r.flow30 >= 1.2 && ok(r.z) && r.z <= 0,
};

const baseline = summarise(rows);
const out = {
  measuredAt: new Date().toISOString(),
  method: {
    popThresholdPct: POP,
    sigmaPopThreshold: SIGMA_POP,
    horizonDays: HORIZON,
    minAvgTurnoverUsd: MIN_TURNOVER,
    maxTurnoverUsd: MAX_TURNOVER,
    note: "Universe deliberately reaches below the 5M floor the pulse detector uses.",
  },
  pairsSampled: pairs,
  baseline,
  conditions: {},
};

for (const [name, test] of Object.entries(CONDITIONS)) {
  const hit = rows.filter(test);
  const rest = rows.filter((r) => !test(r));
  if (!hit.length || !rest.length) { out.conditions[name] = { n: hit.length, note: "empty group" }; continue; }
  const s = summarise(hit);
  out.conditions[name] = {
    ...s,
    liftVsBaseline: s.popPct / baseline.popPct,
    ...significance(hit, rest),
    normalised: {
      liftVsBaseline: s.sigmaPopPct / baseline.sigmaPopPct,
      ...significance(hit, rest, "bestDaySigma", SIGMA_POP),
    },
  };
}

console.log(JSON.stringify(out, null, 2));
