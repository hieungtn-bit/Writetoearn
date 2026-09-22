/**
 * Why does this desk keep saying WAIT, and is that a finding or a defect?
 *
 * A trader's complaint, and a fair one: prices move hard, the system says stand
 * aside, and 20 of 21 scored calls carry the same bias. A model that returns one
 * answer regardless of input is not analysing — it is defaulting. So rather than
 * defend the output, this tests three explanations that would each produce it.
 *
 *   H1. **The grid is long-only.** Every geometry measured this week buys and
 *       holds to a target above entry. With BTC under its 200-day and alts
 *       bleeding, long-only expectancy is negative almost by construction, and
 *       the only alternative left on the menu is WAIT. If shorts pay where longs
 *       do not, the WAIT was never a market judgement — it was a missing branch.
 *
 *   H2. **The horizons are far too long.** 30, 60 and 90 days were the only
 *       windows tested. A trader watching a token move 20% in three days is in a
 *       different business, and a swing that resolves in a week is invisible to a
 *       quarterly grid.
 *
 *   H3. **The market is genuinely poor and WAIT is right.** The null. It only
 *       survives if H1 and H2 are cleared and both directions still lose across
 *       every horizon.
 *
 * The counterfactual settles the complaint directly: what would simply being
 * long every candidate have paid over the same period the desk was saying WAIT?
 * If that number is positive, the caution cost money and the criticism stands.
 *
 * Reproducible:
 *   node research/why-always-wait.mjs > research/why-always-wait.json
 */

import { analyzeAsset, atr, fetchKlines, mean } from "../src/analysis.mjs";

const CANDIDATES = [
  { asset: "ICP", symbol: "ICPUSDT" },
  { asset: "ENA", symbol: "ENAUSDT" },
  { asset: "SUI", symbol: "SUIUSDT" },
  { asset: "CRV", symbol: "CRVUSDT" },
  { asset: "BICO", symbol: "BICOUSDT" },
  { asset: "BTC", symbol: "BTCUSDT" },
];

const retry = async (fn, n = 6) => {
  let last;
  for (let i = 0; i < n; i++) {
    try { return await fn(); } catch (e) { last = e; await new Promise((r) => setTimeout(r, 1200 * (i + 1))); }
  }
  throw last;
};

const median = (xs) => {
  const s = [...xs].sort((a, b) => a - b);
  const m = s.length >> 1;
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};

/**
 * One geometry, walked bar by bar, in either direction.
 *
 * A short is not a long with the signs flipped in the arithmetic only — the
 * stop sits *above* entry and the target below, so the bar-by-bar test has to
 * check the high for the stop and the low for the target. Getting that backwards
 * is the classic way a short backtest reports a fortune.
 *
 * Unresolved episodes close at the market, in the direction actually held.
 */
const walk = (candles, { direction, stopPct, targetPct, horizon }) => {
  const long = direction === "long";
  let hit = 0, stopped = 0, n = 0;
  const open = [];
  for (let i = 0; i < candles.length - horizon; i++) {
    const entry = candles[i].close;
    const stop = long ? entry * (1 - stopPct / 100) : entry * (1 + stopPct / 100);
    const target = long ? entry * (1 + targetPct / 100) : entry * (1 - targetPct / 100);
    n++;
    let done = false;
    for (let j = i + 1; j <= i + horizon; j++) {
      const c = candles[j];
      // The stop is checked first, so a bar reaching both is charged to it.
      if (long ? c.low <= stop : c.high >= stop) { stopped++; done = true; break; }
      if (long ? c.high >= target : c.low <= target) { hit++; done = true; break; }
    }
    if (!done) {
      const movePct = (candles[i + horizon].close / entry - 1) * 100;
      open.push(long ? movePct : -movePct);
    }
  }
  const rr = targetPct / stopPct;
  const openR = open.reduce((s, m) => s + m / stopPct, 0);
  return {
    n,
    hitPct: (hit / n) * 100,
    stoppedPct: (stopped / n) * 100,
    unresolvedPct: (open.length / n) * 100,
    rr,
    expectancyR: (hit * rr - stopped + openR) / n,
    effectiveN: n / horizon,
  };
};

const STOP_ATRS = [1, 1.5, 2, 3];
const RRS = [1, 1.5, 2, 3];
/** Short horizons added: a swing that resolves in days is invisible to a quarter. */
const HORIZONS = [3, 5, 10, 30, 60, 90];
const MAX_STOP_PCT = 60;

const rows = [];
for (const c of CANDIDATES) {
  const daily = await retry(() => fetchKlines(c.symbol, { interval: "1d", limit: 1000 }));
  const analysis = await retry(() => analyzeAsset(c.symbol));
  const atrPct = (atr(daily, 14) / analysis.price) * 100;

  const cells = [];
  for (const direction of ["long", "short"]) {
    for (const stopAtr of STOP_ATRS) {
      const stopPct = stopAtr * atrPct;
      if (stopPct >= MAX_STOP_PCT) continue;
      for (const rr of RRS) {
        for (const horizon of HORIZONS) {
          cells.push({
            direction, stopAtr, stopPct, rr, horizonDays: horizon,
            ...walk(daily, { direction, stopPct, targetPct: stopPct * rr, horizon }),
          });
        }
      }
    }
  }

  const summarise = (subset) => subset.length ? {
    cells: subset.length,
    positive: subset.filter((x) => x.expectancyR > 0).length,
    positiveSharePct: (subset.filter((x) => x.expectancyR > 0).length / subset.length) * 100,
    medianExpectancyR: median(subset.map((x) => x.expectancyR)),
    best: [...subset].sort((a, b) => b.expectancyR - a.expectancyR)[0],
  } : null;

  rows.push({
    asset: c.asset,
    price: analysis.price,
    atrPct,
    long: summarise(cells.filter((x) => x.direction === "long")),
    short: summarise(cells.filter((x) => x.direction === "short")),
    byHorizon: HORIZONS.map((h) => ({
      horizonDays: h,
      long: summarise(cells.filter((x) => x.direction === "long" && x.horizonDays === h)),
      short: summarise(cells.filter((x) => x.direction === "short" && x.horizonDays === h)),
    })),
    overall: summarise(cells),
  });
}

/**
 * The counterfactual the complaint deserves.
 *
 * Over the window the desk was publishing WAIT, what would simply holding each
 * candidate have paid? No stop, no target, no skill — just exposure. If this is
 * positive, standing aside cost money and the criticism is correct on its own
 * terms.
 */
const HOLD_DAYS = [7, 14, 30];
const holding = [];
for (const c of CANDIDATES) {
  const daily = await retry(() => fetchKlines(c.symbol, { interval: "1d", limit: 200 }));
  const row = { asset: c.asset };
  for (const d of HOLD_DAYS) {
    const from = daily.at(-1 - d)?.close;
    const to = daily.at(-1)?.close;
    row[`hold${d}dPct`] = from ? (to / from - 1) * 100 : null;
    // The worst drawdown along the way, because a return you could not sit
    // through is a return you did not get.
    const window = daily.slice(-1 - d);
    let peak = window[0].close, worst = 0;
    for (const k of window) {
      peak = Math.max(peak, k.high);
      worst = Math.min(worst, (k.low / peak - 1) * 100);
    }
    row[`worstDrawdown${d}dPct`] = worst;
  }
  holding.push(row);
}

const avgHold = (d) => mean(holding.map((h) => h[`hold${d}dPct`]).filter((v) => v != null));

console.log(JSON.stringify({
  measuredAt: new Date().toISOString(),
  method: {
    question: "Is WAIT a market judgement or a missing branch?",
    hypotheses: {
      H1: "The grid was long-only, so WAIT was the only alternative to a bad long.",
      H2: "Horizons of 30-90 days cannot see a swing that resolves in days.",
      H3: "The market is genuinely poor and WAIT is correct.",
    },
    walk: "Bar by bar, both directions. A short's stop sits above entry, so the high is checked for the stop and the low for the target. A bar reaching both is charged to the stop.",
    unresolved: "Closed at the market in the direction held, not counted as flat.",
    grid: `${STOP_ATRS.length} stop distances x ${RRS.length} reward ratios x ${HORIZONS.length} horizons x 2 directions; stops wider than ${MAX_STOP_PCT}% rejected as untradeable.`,
    counterfactual: "Plain buy-and-hold over the window the desk was saying WAIT, with the worst drawdown along the way.",
  },
  rows,
  holding,
  holdingAverages: Object.fromEntries(HOLD_DAYS.map((d) => [`avg${d}dPct`, avgHold(d)])),
}, null, 2));
