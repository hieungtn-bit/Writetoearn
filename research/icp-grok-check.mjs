/**
 * Checking a third-party ICP call against the tape, claim by claim.
 *
 * The assessment under test makes six checkable statements — that price is near
 * the bottom of its range, that volume has not expanded, that resistance sits at
 * 2.30–2.35, that correlation to BTC is "medium to strong", a target ladder at
 * 2.50 / 2.80 / 3.30, and a stop below 2.10–2.13. Each is measurable from free
 * data, so each is measured rather than argued with.
 *
 * Two things are measured that the assessment left unquantified, because they
 * are where a plan of this shape usually fails:
 *
 *   1. The stop against a week. The same test that showed BNB's day-ATR stop
 *      sits inside the quietest quarter of weeks applies here: a stop is only
 *      real if it is wider than ordinary movement over the horizon it is held.
 *
 *   2. Reward against risk, and then the historical hit rate at that geometry.
 *      Entering on a close above resistance and stopping below the base puts the
 *      stop further away than the first target — so the plan needs to win more
 *      often than it loses just to break even. Whether it does is a base rate,
 *      not an opinion, and it is measured path-aware: walked bar by bar so that
 *      whichever level is touched first is the one that counts. Reading highs
 *      and lows separately would let both sides "win" the same episode.
 *
 * Reproducible:
 *   node research/icp-grok-check.mjs > research/icp-grok-check.json
 */

import { analyzeAsset, correlation, fetchKlines, logReturns } from "../src/analysis.mjs";
import { findBase } from "../src/pbbe.mjs";

const SYMBOL = "ICPUSDT";
const BASE = "BTCUSDT";

/** The claims as stated, in numbers, so nothing is re-interpreted downstream. */
const CLAIM = {
  entryLow: 2.30, entryHigh: 2.35,
  stopLow: 2.10, stopHigh: 2.13,
  targets: [2.50, 2.80, 3.30],
};

const retry = async (fn, n = 6) => {
  let last;
  for (let i = 0; i < n; i++) {
    try { return await fn(); } catch (e) { last = e; await new Promise((r) => setTimeout(r, 1100 * (i + 1))); }
  }
  throw last;
};

const median = (xs) => {
  const s = [...xs].sort((a, b) => a - b);
  const m = s.length >> 1;
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};
const pctile = (xs, p) => {
  const s = [...xs].sort((a, b) => a - b);
  return s[Math.min(s.length - 1, Math.floor(s.length * p))];
};

const analysis = await retry(() => analyzeAsset(SYMBOL));
const daily = await retry(() => fetchKlines(SYMBOL, { interval: "1d", limit: 1000 }));
const btcDaily = await retry(() => fetchKlines(BASE, { interval: "1d", limit: 1000 }));
const weekly = (await retry(() => fetchKlines(SYMBOL, { interval: "1w", limit: 105 }))).slice(0, -1);

const price = analysis.price;
const base = findBase(daily.slice(-60));

/* ---------- claim: "near the bottom of the range" ---------- */

/**
 * Range position on three windows.
 *
 * One window is a choice, and the claim is sensitive to which one — so all three
 * are reported. A statement that is true only on the widest lookback and false
 * on the others is not a statement about where price is today.
 */
const rangeAt = (days) => {
  const win = daily.slice(-days);
  const low = Math.min(...win.map((c) => c.low));
  const high = Math.max(...win.map((c) => c.high));
  return { days, low, high, positionPct: ((price - low) / (high - low)) * 100 };
};
const ranges = [30, 60, 90].map(rangeAt);

/* ---------- claim: "volume still weak, no clear expansion" ---------- */

const vols = daily.slice(-31, -1).map((c) => c.quoteVolume);
const vMean = vols.reduce((a, b) => a + b, 0) / vols.length;
const vSd = Math.sqrt(vols.reduce((a, b) => a + (b - vMean) ** 2, 0) / (vols.length - 1));
const lastCompleted = daily[daily.length - 2];
const volume = {
  zScoreCompleted: (lastCompleted.quoteVolume - vMean) / vSd,
  last3dVsPrior10dPct: (() => {
    const recent = daily.slice(-4, -1).map((c) => c.quoteVolume);
    const prior = daily.slice(-14, -4).map((c) => c.quoteVolume);
    const r = recent.reduce((a, b) => a + b, 0) / recent.length;
    const p = prior.reduce((a, b) => a + b, 0) / prior.length;
    return (r / p - 1) * 100;
  })(),
  mean30dUsd: vMean,
};

/* ---------- claim: "correlation to BTC is medium to strong" ---------- */

const corrOver = (days) => {
  const a = logReturns(daily.slice(-(days + 1)).map((c) => c.close));
  const b = logReturns(btcDaily.slice(-(days + 1)).map((c) => c.close));
  const n = Math.min(a.length, b.length);
  return { days, r: correlation(a.slice(-n), b.slice(-n)), n };
};
const correlations = [30, 60, 90].map(corrOver);

/* ---------- the stop, against a week ---------- */

const weekRanges = weekly.filter((c) => c.low > 0).map((c) => ((c.high - c.low) / c.low) * 100);
const weekMedian = median(weekRanges);

/**
 * Two entries, because the assessment gives a band rather than a price.
 *
 * "spot" is the stop measured from today's price — what a reader already long
 * would feel. "trigger" is measured from the entry the assessment actually
 * specifies, a close above resistance, which is the geometry that decides
 * whether the plan can pay.
 */
const geometry = (entry, stop, targets) => {
  const riskPct = (1 - stop / entry) * 100;
  return {
    entry, stop, riskPct,
    targets: targets.map((t) => ({
      price: t,
      rewardPct: (t / entry - 1) * 100,
      rr: (t / entry - 1) / (1 - stop / entry),
    })),
    /** Win rate needed at the first target for the plan to break even. */
    breakevenWinRatePct: 100 / (1 + (targets[0] / entry - 1) / (1 - stop / entry)),
  };
};

const entryMid = (CLAIM.entryLow + CLAIM.entryHigh) / 2;
const stopMid = (CLAIM.stopLow + CLAIM.stopHigh) / 2;
const spot = geometry(price, stopMid, CLAIM.targets);
const trigger = geometry(entryMid, stopMid, CLAIM.targets);

/* ---------- base rates, walked bar by bar ---------- */

/**
 * Path-aware first-touch over a horizon.
 *
 * From every historical day, walk forward and record which level the bar-by-bar
 * path reaches first. Reading the horizon's high and low separately would count
 * an episode as reaching both, and the pair would sum past 100 describing a
 * trade nobody could have taken.
 *
 * Intraday order inside a single bar is unknowable from daily candles, so a bar
 * touching both levels is charged to the stop. That is the pessimistic reading
 * and the honest one — a plan should not be credited with the ambiguous case.
 */
const firstTouch = (candles, upPct, downPct, horizon) => {
  let up = 0, down = 0, neither = 0, n = 0;
  for (let i = 0; i < candles.length - horizon; i++) {
    const entry = candles[i].close;
    const target = entry * (1 + upPct / 100);
    const stop = entry * (1 - downPct / 100);
    n++;
    let done = false;
    for (let j = i + 1; j <= i + horizon; j++) {
      const c = candles[j];
      if (c.low <= stop) { down++; done = true; break; }
      if (c.high >= target) { up++; done = true; break; }
    }
    if (!done) neither++;
  }
  return {
    n, up, down, neither,
    upPct: (up / n) * 100,
    downPct: (down / n) * 100,
    neitherPct: (neither / n) * 100,
    /** Effective independent episodes once the overlap is removed. */
    effectiveN: n / horizon,
  };
};

/** Unconditional: does the ladder get reached before the stop, from any day? */
const HORIZONS = [14, 30, 60];
const ladder = CLAIM.targets.map((t, k) => ({
  target: t,
  rewardPct: trigger.targets[k].rewardPct,
  byHorizon: HORIZONS.map((h) => ({
    horizonDays: h,
    ...firstTouch(daily, trigger.targets[k].rewardPct, trigger.riskPct, h),
  })),
}));

/**
 * Conditional: only days that satisfy the assessment's own trigger.
 *
 * A close above the prior 30-day high is the closest measurable reading of
 * "close clearly above resistance". If the trigger carries information, these
 * days should beat the unconditional rate; if they do not, the trigger is
 * decoration.
 */
const breakoutDays = (() => {
  const out = [];
  for (let i = 30; i < daily.length; i++) {
    const prior = daily.slice(i - 30, i);
    if (daily[i].close > Math.max(...prior.map((c) => c.high))) out.push(i);
  }
  return out;
})();

const conditional = (upPct, downPct, horizon) => {
  let up = 0, down = 0, neither = 0, n = 0;
  for (const i of breakoutDays) {
    if (i + horizon >= daily.length) continue;
    const entry = daily[i].close;
    const target = entry * (1 + upPct / 100);
    const stop = entry * (1 - downPct / 100);
    n++;
    let done = false;
    for (let j = i + 1; j <= i + horizon; j++) {
      const c = daily[j];
      if (c.low <= stop) { down++; done = true; break; }
      if (c.high >= target) { up++; done = true; break; }
    }
    if (!done) neither++;
  }
  return { n, up, down, neither, upPct: n ? (up / n) * 100 : null, downPct: n ? (down / n) * 100 : null,
    neitherPct: n ? (neither / n) * 100 : null, effectiveN: n / horizon };
};

const triggered = HORIZONS.map((h) => ({
  horizonDays: h,
  ...conditional(trigger.targets[0].rewardPct, trigger.riskPct, h),
}));

/**
 * The same ladder entered here instead of on the breakout.
 *
 * Carried because it isolates what waiting costs. The stop is fixed by the
 * assessment, so entering higher does not move the stop — it only widens the
 * risk leg and shortens the reward leg. Measuring both entries at the same
 * targets turns that into a number rather than an objection.
 */
const spotLadder = CLAIM.targets.map((t, k) => ({
  target: t,
  rewardPct: spot.targets[k].rewardPct,
  byHorizon: HORIZONS.map((h) => ({
    horizonDays: h,
    ...firstTouch(daily, spot.targets[k].rewardPct, spot.riskPct, h),
  })),
}));

/** Expectancy in R at the first target, 30-day horizon, unresolved counted flat. */
const expectancyR = (g, rates) => {
  const r = rates.find((x) => x.horizonDays === 30);
  return (r.upPct / 100) * g.targets[0].rr - (r.downPct / 100);
};

console.log(JSON.stringify({
  measuredAt: new Date().toISOString(),
  symbol: SYMBOL,
  price,
  method: {
    candles: daily.length,
    weeksSampled: weekRanges.length,
    firstTouch: "Walked bar by bar. A bar touching both levels is charged to the stop.",
    overlap: "Windows overlap; effectiveN = n / horizon is the de-overlapped count.",
    note: "Binance futures is geo-blocked from this machine; nothing here uses funding or open interest.",
  },
  claim: CLAIM,
  rangePosition: ranges,
  volume,
  correlations,
  resistance: {
    high30d: analysis.high30d,
    baseHigh: base?.high ?? null,
    baseWidthPct: base?.widthPct ?? null,
    claimedLow: CLAIM.entryLow,
    /** Positive means the claimed resistance sits above the actual 30-day high. */
    claimedAboveHigh30dPct: (CLAIM.entryLow / analysis.high30d - 1) * 100,
  },
  weeklyRange: {
    weeks: weekRanges.length,
    p25Pct: pctile(weekRanges, 0.25),
    medianPct: weekMedian,
    p75Pct: pctile(weekRanges, 0.75),
    p90Pct: pctile(weekRanges, 0.90),
  },
  atrPct: analysis.atrPct,
  stopVsMovement: {
    spotRiskPct: spot.riskPct,
    triggerRiskPct: trigger.riskPct,
    spotStopInDailyAtr: spot.riskPct / analysis.atrPct,
    /** Below 1 means an ordinary week is wider than the whole stop. */
    triggerStopOverMedianWeek: trigger.riskPct / weekMedian,
  },
  geometry: { spot, trigger },
  baseRates: { ladder, spotLadder, triggered },
  expectancyR30d: {
    trigger: expectancyR(trigger, ladder[0].byHorizon),
    spot: expectancyR(spot, spotLadder[0].byHorizon),
    note: "Positive means the geometry paid over ICP's own history. Unresolved episodes counted as zero.",
  },
}, null, 2));
