/**
 * A 4-hour technical read on ICP, checked bar by bar.
 *
 * Almost everything in a chart-levels note is measurable, and the parts that
 * are not measurable are usually the parts doing the persuading. Three layers
 * are separated here because they fail differently:
 *
 *   1. Descriptions of now — the range, RSI, the moving averages, whether volume
 *      has expanded. Lookups. Either the number matches or it does not.
 *
 *   2. Descriptions of what happened — "the low held well", "the high was
 *      repeatedly rejected". These sound like observations and are really
 *      counts, so they are counted: how often price entered each named zone and
 *      what it did next.
 *
 *   3. The idea underneath all of it — that a support level carries information.
 *      That one is a base rate and nobody quotes it. It is measured here by
 *      defining a support test mechanically (price coming within a small
 *      distance of its trailing low) and asking what happened afterwards,
 *      against the unconditional rate over the same bars. If touching support
 *      does not beat the base rate, the level is decoration.
 *
 * The proposed trade is measured too, path-aware: entry in the stated support
 * zone, stop below the stated invalidation, targets at the stated resistances.
 * Walked bar by bar so whichever level is reached first is the one that counts,
 * and a bar touching both is charged to the stop, since a 4-hour candle does
 * not reveal the order inside it.
 *
 * One thing worth stating before any of it: a range 8-9% wide on a pair whose
 * ordinary day covers 3.6% is barely two days across. Whether that deserves the
 * word "compression" is a question the numbers answer, not the chart.
 *
 * Reproducible:
 *   node research/icp-4h-check.mjs > research/icp-4h-check.json
 */

import { analyzeAsset, atr, fetchKlines, rsi, sma } from "../src/analysis.mjs";

const SYMBOL = "ICPUSDT";
const BARS = 1000;

/** The note as written, in numbers. Midpoints where it quotes a band. */
const NOTE = {
  priceBand: [2.18, 2.21],
  rangeLow: 2.08, rangeHigh: 2.26,
  supportNear: [2.15, 2.17],
  supportMain: [2.08, 2.12],
  supportDeep: [2.00, 2.05],
  resistNear: [2.22, 2.26],
  resistNext: [2.30, 2.35],
  resistFar: [2.40, 2.45],
  rsiBand: [55, 65],
  trade: { entry: 2.135, stop: 2.075, targets: [2.26, 2.35] },
  recentSessions: 60,
};

const retry = async (fn, n = 6) => {
  let last;
  for (let i = 0; i < n; i++) {
    try { return await fn(); } catch (e) { last = e; await new Promise((r) => setTimeout(r, 1200 * (i + 1))); }
  }
  throw last;
};

const h4 = await retry(() => fetchKlines(SYMBOL, { interval: "4h", limit: BARS }));
const daily = await retry(() => fetchKlines(SYMBOL, { interval: "1d", limit: 120 }));
const analysis = await retry(() => analyzeAsset(SYMBOL));

const closes = h4.map((c) => c.close);
const price = analysis.price;

/* ---------- layer 1: descriptions of now ---------- */

const recent = h4.slice(-NOTE.recentSessions);
const recentLow = Math.min(...recent.map((c) => c.low));
const recentHigh = Math.max(...recent.map((c) => c.high));

const vols4h = h4.slice(-31, -1).map((c) => c.quoteVolume);
const vMean = vols4h.reduce((a, b) => a + b, 0) / vols4h.length;
const vSd = Math.sqrt(vols4h.reduce((a, b) => a + (b - vMean) ** 2, 0) / (vols4h.length - 1));

const atr4h = atr(h4, 14);
const atrDaily = atr(daily, 14);

const now = {
  price,
  priceInsideClaimedBand: price >= NOTE.priceBand[0] && price <= NOTE.priceBand[1],
  rsi14: rsi(closes, 14),
  rsiInsideClaimedBand: null,
  sma10: sma(closes, 10),
  sma20: sma(closes, 20),
  sma50: sma(closes, 50),
  sma200: sma(closes, 200),
  atr4hPct: (atr4h / price) * 100,
  atrDailyPct: (atrDaily / price) * 100,
  volumeZScoreCompleted: (h4.at(-2).quoteVolume - vMean) / vSd,
  volume6barsVsPrior24Pct: (() => {
    const r = h4.slice(-7, -1).map((c) => c.quoteVolume);
    const p = h4.slice(-31, -7).map((c) => c.quoteVolume);
    return ((r.reduce((a, b) => a + b, 0) / r.length) / (p.reduce((a, b) => a + b, 0) / p.length) - 1) * 100;
  })(),
};
now.rsiInsideClaimedBand = now.rsi14 >= NOTE.rsiBand[0] && now.rsi14 <= NOTE.rsiBand[1];

/**
 * The range, in units of an ordinary day.
 *
 * The word "compression" implies price is unusually still. A box two daily
 * ranges wide is not stillness — it is two days of normal movement with a line
 * drawn round it, and the distinction decides whether a breakout means anything.
 */
const claimedRangeWidthPct = (NOTE.rangeHigh / NOTE.rangeLow - 1) * 100;
const range = {
  claimed: [NOTE.rangeLow, NOTE.rangeHigh],
  claimedWidthPct: claimedRangeWidthPct,
  actualLow: recentLow,
  actualHigh: recentHigh,
  actualWidthPct: (recentHigh / recentLow - 1) * 100,
  bars: NOTE.recentSessions,
  widthInDailyAtr: claimedRangeWidthPct / now.atrDailyPct,
  /** Bars in the window that closed outside the claimed box, either side. */
  closesOutsidePct: (recent.filter((c) => c.close < NOTE.rangeLow || c.close > NOTE.rangeHigh).length
    / recent.length) * 100,
  tradedAboveClaimedHigh: recentHigh > NOTE.rangeHigh,
  tradedBelowClaimedLow: recentLow < NOTE.rangeLow,
};

/* ---------- layer 2: counting what actually happened ---------- */

/**
 * Zone visits and what followed.
 *
 * "Held well" and "repeatedly rejected" are claims about counts, so they get
 * counts. A visit is a bar whose range overlaps the zone; the outcome is where
 * price stood a fixed number of bars later, which is the plainest reading that
 * does not smuggle in a target.
 */
const zoneStats = (zone, lookahead = 12) => {
  const [lo, hi] = zone;
  let visits = 0, higherAfter = 0, lowerAfter = 0, brokeThrough = 0;
  for (let i = 0; i < recent.length - lookahead; i++) {
    const c = recent[i];
    if (c.high < lo || c.low > hi) continue;
    visits++;
    const later = recent[i + lookahead].close;
    if (later > hi) higherAfter++;
    else if (later < lo) lowerAfter++;
    // Closing below a support zone, or above a resistance zone, is the level
    // failing in the direction it was supposed to hold.
    if (recent.slice(i + 1, i + 1 + lookahead).some((x) => x.close < lo)) brokeThrough++;
  }
  return { zone, visits, higherAfter, lowerAfter, brokeThroughDown: brokeThrough, lookaheadBars: lookahead };
};

const zones = {
  supportNear: zoneStats(NOTE.supportNear),
  supportMain: zoneStats(NOTE.supportMain),
  supportDeep: zoneStats(NOTE.supportDeep),
  resistNear: zoneStats(NOTE.resistNear),
  resistNext: zoneStats(NOTE.resistNext),
};

/* ---------- layer 3: does support carry information at all ---------- */

/**
 * A support test, defined mechanically so it can be counted.
 *
 * Price within `nearPct` of its own trailing low. Then: over the next
 * `lookahead` bars, did it close higher than where it started, and how does
 * that compare with the unconditional rate over the same bars? The comparison
 * is the whole point — a 50% bounce rate is only interesting if the market
 * does not do that anyway.
 */
const supportTest = ({ lookback = 20, nearPct = 1.0, lookahead = 12 } = {}) => {
  let tests = 0, up = 0;
  let allBars = 0, allUp = 0;
  for (let i = lookback; i < h4.length - lookahead; i++) {
    const trailingLow = Math.min(...h4.slice(i - lookback, i).map((c) => c.low));
    const here = h4[i].close;
    const later = h4[i + lookahead].close;
    allBars++;
    if (later > here) allUp++;
    if (here <= trailingLow * (1 + nearPct / 100)) {
      tests++;
      if (later > here) up++;
    }
  }
  return {
    lookbackBars: lookback, nearPct, lookaheadBars: lookahead,
    tests, bouncePct: tests ? (up / tests) * 100 : null,
    baselineBars: allBars, baselineUpPct: (allUp / allBars) * 100,
    /** Positive means touching support beat simply being in the market. */
    edgePp: tests ? (up / tests) * 100 - (allUp / allBars) * 100 : null,
    effectiveTests: tests / lookahead,
    /**
     * The same edge stated twice, because the honest answer sits between them.
     *
     * Overlapping windows share bars, so treating all of them as independent
     * inflates the sample and any significance computed from it. De-overlapping
     * by the lookahead is the conservative correction. Both are reported: the
     * naive figure is what a backtest usually prints, the de-overlapped one is
     * what the evidence can actually carry, and quoting only the first is how a
     * coin flip gets published as an edge.
     */
    sigmasNaive: tests
      ? ((up / tests) - allUp / allBars)
        / Math.sqrt(((allUp / allBars) * (1 - allUp / allBars)) / tests)
      : null,
    sigmasDeOverlapped: tests
      ? ((up / tests) - allUp / allBars)
        / Math.sqrt(((allUp / allBars) * (1 - allUp / allBars)) / (tests / lookahead))
      : null,
  };
};

const support = [
  supportTest({ nearPct: 0.5 }),
  supportTest({ nearPct: 1.0 }),
  supportTest({ nearPct: 2.0 }),
];

/* ---------- the proposed trade, walked bar by bar ---------- */

const t = NOTE.trade;
const riskPct = (1 - t.stop / t.entry) * 100;

const firstTouch = (candles, upPct, downPct, horizon) => {
  let up = 0, down = 0, neither = 0, n = 0;
  for (let i = 0; i < candles.length - horizon; i++) {
    const entry = candles[i].close;
    const target = entry * (1 + upPct / 100);
    const stop = entry * (1 - downPct / 100);
    n++;
    let done = false;
    for (let j = i + 1; j <= i + horizon; j++) {
      if (candles[j].low <= stop) { down++; done = true; break; }
      if (candles[j].high >= target) { up++; done = true; break; }
    }
    if (!done) neither++;
  }
  return { n, upPct: (up / n) * 100, downPct: (down / n) * 100,
    neitherPct: (neither / n) * 100, effectiveN: n / horizon };
};

// Six bars a day on a 4-hour chart, so these are roughly two and five days.
const HORIZONS = [12, 30];
const trade = {
  entry: t.entry, stop: t.stop, riskPct,
  /** How tight the stop is against a single 4-hour bar's ordinary range. */
  stopIn4hAtr: riskPct / now.atr4hPct,
  stopInDailyAtr: riskPct / now.atrDailyPct,
  targets: t.targets.map((target) => {
    const rewardPct = (target / t.entry - 1) * 100;
    const rr = rewardPct / riskPct;
    return {
      target, rewardPct, rr,
      breakevenWinRatePct: 100 / (1 + rr),
      byHorizon: HORIZONS.map((h) => {
        const r = firstTouch(h4, rewardPct, riskPct, h);
        return { horizonBars: h, ...r, expectancyR: (r.upPct / 100) * rr - (r.downPct / 100) };
      }),
    };
  }),
};

console.log(JSON.stringify({
  measuredAt: new Date().toISOString(),
  symbol: SYMBOL,
  interval: "4h",
  method: {
    bars: h4.length,
    recentWindowBars: NOTE.recentSessions,
    firstTouch: "Walked bar by bar. A bar touching both levels is charged to the stop.",
    overlap: "Windows overlap; effectiveN = n / horizon is the de-overlapped count.",
    supportDefinition: "A support test is price within nearPct of its trailing 20-bar low. The bounce rate is reported against the unconditional rate over the same bars, because a rate without a baseline says nothing.",
    unavailable: "Binance futures is geo-blocked from this host; nothing here uses funding or open interest.",
  },
  note: NOTE,
  now,
  range,
  zones,
  support,
  trade,
}, null, 2));
