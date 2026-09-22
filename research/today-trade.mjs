/**
 * If a position has to go on today: which one, at what geometry, and what the
 * outcome distribution actually looks like.
 *
 * "Forecast the profit" is the request most likely to produce a lie, because
 * the honest answer is not a number. A single expected figure hides the shape
 * that decides whether anyone can hold the trade — so this reports the whole
 * distribution of outcomes for the chosen geometry, walked bar by bar, and
 * leads with the loss percentiles rather than the gain.
 *
 * Three things are measured:
 *
 *   1. The macro claims in the scan under discussion — BTC's level and
 *      dominance — because a plan built on a mis-stated regime is a plan for a
 *      different market.
 *
 *   2. Every candidate on one ruler, including the two the scan flags as
 *      short-term volume spikes and has never measured.
 *
 *   3. For the best candidate, the outcome distribution rather than a target:
 *      percentiles of realised return over the holding horizon, the share of
 *      episodes that end below the entry, and how deep a *winning* episode digs
 *      before it resolves.
 *
 * Reproducible:
 *   node research/today-trade.mjs > research/today-trade.json
 */

import { analyzeAsset, atr, correlation, fetchKlines, logReturns, mean, sma } from "../src/analysis.mjs";
import { stageOf } from "../src/stage.mjs";
import { fetchFundingHistory } from "../src/market.mjs";

const CANDIDATES = [
  { asset: "ICP", symbol: "ICPUSDT" },
  { asset: "ENA", symbol: "ENAUSDT" },
  { asset: "SUI", symbol: "SUIUSDT" },
  { asset: "CRV", symbol: "CRVUSDT" },
  { asset: "BICO", symbol: "BICOUSDT" },
];

/** The scan's macro framing, so it is checked rather than inherited. */
const SCAN = { btcLow: 63_900, btcHigh: 64_000, dominancePct: 56.55 };

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
const pctile = (xs, p) => {
  const s = [...xs].sort((a, b) => a - b);
  return s[Math.min(s.length - 1, Math.max(0, Math.floor(s.length * p)))];
};

const btcDaily = await retry(() => fetchKlines("BTCUSDT", { interval: "1d", limit: 400 }));
const btcAnalysis = await retry(() => analyzeAsset("BTCUSDT"));
const btcCloses = btcDaily.map((c) => c.close);

const global = await retry(async () => {
  const res = await fetch("https://api.coingecko.com/api/v3/global", { signal: AbortSignal.timeout(25_000) });
  if (!res.ok) throw new Error(`coingecko global: HTTP ${res.status}`);
  return (await res.json()).data;
}).catch(() => null);

const btc = {
  price: btcAnalysis.price,
  claimedBand: [SCAN.btcLow, SCAN.btcHigh],
  insideClaimedBand: btcAnalysis.price >= SCAN.btcLow && btcAnalysis.price <= SCAN.btcHigh,
  sma50: sma(btcCloses, 50),
  sma200: sma(btcCloses, 200),
  belowSma200: btcAnalysis.price < sma(btcCloses, 200),
  rangePosition30d: btcAnalysis.rangePosition30d,
  rsi14: btcAnalysis.rsi14,
  atrPct: (atr(btcDaily, 14) / btcAnalysis.price) * 100,
  dominanceClaimedPct: SCAN.dominancePct,
  dominancePct: global?.market_cap_percentage?.btc ?? null,
};

/**
 * Path-aware first touch, with the unresolved episodes marked to market.
 *
 * A bar reaching both levels is charged to the stop, as always. The change that
 * matters is what happens to episodes that reach neither.
 *
 * Counting them as flat is the convention, and for a tight stop on a long
 * horizon it is nearly harmless because almost everything resolves. For a wide
 * stop on a short horizon it is badly wrong: a 51% stop over thirty days leaves
 * three quarters of episodes unresolved, and calling three quarters of the
 * sample "zero" produced a cell reading +0.115R whose actual median outcome was
 * -7.4%. The position does not vanish at the horizon — it gets closed at
 * whatever the market is, and that price is part of the result.
 *
 * So both figures are returned. `expectancyR` is the conventional one, kept for
 * comparison; `expectancyFullR` closes the open positions at the market and is
 * the one a decision should use.
 */
const firstTouch = (candles, upPct, downPct, horizon) => {
  let up = 0, down = 0, n = 0;
  const unresolved = [];
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
    if (!done) unresolved.push((candles[i + horizon].close / entry - 1) * 100);
  }
  const rr = upPct / downPct;
  // Each unresolved episode is worth its mark-to-market move divided by the
  // risk, so it lands on the same R scale as a stop or a target.
  const openR = unresolved.reduce((s, movePct) => s + movePct / downPct, 0);
  return {
    n,
    upPct: (up / n) * 100,
    downPct: (down / n) * 100,
    unresolvedPct: (unresolved.length / n) * 100,
    rr,
    expectancyR: (up / n) * rr - (down / n),
    expectancyFullR: ((up * rr) - down + openR) / n,
    effectiveN: n / horizon,
  };
};

const STOP_ATRS = [1, 1.5, 2, 2.5, 3, 4];
const RRS = [1, 1.5, 2, 3, 5];
const HORIZONS = [30, 60, 90];

const rows = [];
for (const c of CANDIDATES) {
  const daily = await retry(() => fetchKlines(c.symbol, { interval: "1d", limit: 1000 }));
  const analysis = await retry(() => analyzeAsset(c.symbol));
  const stage = await retry(() => stageOf(c.asset)).catch(() => null);
  const funding = await retry(() => fetchFundingHistory(`${c.asset}-USDT-SWAP`)).catch(() => null);
  const price = analysis.price;
  const atrPct = (atr(daily, 14) / price) * 100;

  const vols = daily.slice(-31, -1).map((k) => k.quoteVolume);
  const vMean = vols.reduce((a, b) => a + b, 0) / vols.length;
  const vSd = Math.sqrt(vols.reduce((a, b) => a + (b - vMean) ** 2, 0) / (vols.length - 1));

  const beta = (() => {
    const x = logReturns(btcCloses.slice(-31));
    const y = logReturns(daily.map((k) => k.close).slice(-31));
    const n = Math.min(x.length, y.length);
    const xs = x.slice(-n), ys = y.slice(-n);
    const mx = mean(xs), my = mean(ys);
    const cov = xs.reduce((s, v, i) => s + (v - mx) * (ys[i] - my), 0) / (n - 1);
    const varx = xs.reduce((s, v) => s + (v - mx) ** 2, 0) / (n - 1);
    const r = correlation(ys, xs);
    return { beta: cov / varx, r, varianceExplainedPct: r ** 2 * 100 };
  })();

  /**
   * The grid, with the cells that cannot be traded thrown out.
   *
   * BICO's daily range is 25.9%, so a stop four ranges wide sits 102% below
   * entry — a negative price. It can never be hit, so every such cell scored a
   * perfect zero stop rate and looked positive, and half of BICO's grid was
   * made of them. The ranking then chose BICO on the strength of trades that
   * are arithmetically impossible.
   *
   * A stop is only a stop if price can reach it, and a stop most of the way to
   * zero is not risk management, it is a decision to hold through anything. The
   * cap is the honest expression of that: past it, the cell is not a plan.
   */
  const MAX_STOP_PCT = 60;
  const grid = [];
  const rejected = [];
  for (const stopAtr of STOP_ATRS) {
    for (const rr of RRS) {
      for (const horizon of HORIZONS) {
        const stopPct = stopAtr * atrPct;
        if (stopPct >= MAX_STOP_PCT) {
          rejected.push({ stopAtr, rr, horizonDays: horizon, stopPct, reason: "stop wider than the cap" });
          continue;
        }
        const f = firstTouch(daily, stopPct * rr, stopPct, horizon);
        grid.push({ stopAtr, stopPct, rr, horizonDays: horizon, targetPct: stopPct * rr, ...f });
      }
    }
  }
  const positive = grid.filter((g) => g.expectancyFullR > 0);
  const best = [...grid].sort((a, b) => b.expectancyFullR - a.expectancyFullR)[0] ?? null;

  rows.push({
    asset: c.asset,
    price,
    atrPct,
    rsi14: analysis.rsi14,
    rangePosition30d: analysis.rangePosition30d,
    underwaterPct: stage?.underwaterPct ?? null,
    volumeTrendPct: stage?.volumeTrendPct ?? null,
    stage: stage?.stage ?? null,
    volumeZScoreCompleted: (daily.at(-2).quoteVolume - vMean) / vSd,
    upDownVolumeRatio30d: analysis.upDownVolumeRatio30d,
    quoteVolume24hUsd: analysis.quoteVolumeLatest ?? null,
    funding: funding && {
      annualised7dPct: funding.annualised7dPct,
      annualisedPrior14dPct: funding.annualisedPrior14dPct,
    },
    ...beta,
    positiveCells: positive.length,
    cellsTried: grid.length,
    cellsRejectedAsUntradeable: rejected.length,
    positiveSharePct: grid.length ? (positive.length / grid.length) * 100 : 0,
    medianExpectancyR: grid.length ? median(grid.map((g) => g.expectancyFullR)) : null,
    best,
    candles: daily.length,
  });
}

/**
 * The candidate a plan would actually go on.
 *
 * Ranked by the share of geometries that pay rather than by the single best
 * cell, because one bright cell in a field of losses is a search artefact and a
 * broad positive region is a property of the pair.
 */
const ranked = [...rows]
  // A pair whose whole grid is untradeable has nothing to rank.
  .filter((r) => r.cellsTried > 0 && r.best)
  .sort((a, b) => b.positiveSharePct - a.positiveSharePct);
const pick = ranked[0];

/**
 * The outcome distribution for the chosen geometry.
 *
 * Not an expected value. Every historical episode is walked to its resolution
 * and the realised return recorded, so the answer to "what will I make" is a
 * spread with a shape rather than a single number that nobody experiences.
 */
const distribution = await (async () => {
  const daily = await retry(() => fetchKlines(`${pick.asset}USDT`, { interval: "1d", limit: 1000 }));
  const { stopPct, targetPct, horizonDays } = pick.best;
  const outcomes = [];
  const worstOnWinners = [];
  for (let i = 0; i < daily.length - horizonDays; i++) {
    const entry = daily[i].close;
    const target = entry * (1 + targetPct / 100);
    const stop = entry * (1 - stopPct / 100);
    let low = entry, resolved = null;
    for (let j = i + 1; j <= i + horizonDays; j++) {
      low = Math.min(low, daily[j].low);
      if (daily[j].low <= stop) { resolved = -stopPct; break; }
      if (daily[j].high >= target) { resolved = targetPct; worstOnWinners.push((low / entry - 1) * 100); break; }
    }
    // Unresolved episodes close at the market, which is what actually happens
    // to a position when neither level is reached inside the horizon.
    outcomes.push(resolved ?? (daily[i + horizonDays].close / entry - 1) * 100);
  }
  return {
    episodes: outcomes.length,
    effectiveN: outcomes.length / horizonDays,
    winSharePct: (outcomes.filter((o) => o > 0).length / outcomes.length) * 100,
    lossSharePct: (outcomes.filter((o) => o < 0).length / outcomes.length) * 100,
    meanPct: mean(outcomes),
    medianPct: median(outcomes),
    p10Pct: pctile(outcomes, 0.10),
    p25Pct: pctile(outcomes, 0.25),
    p75Pct: pctile(outcomes, 0.75),
    p90Pct: pctile(outcomes, 0.90),
    worstPct: Math.min(...outcomes),
    bestPct: Math.max(...outcomes),
    drawdownOnWinners: worstOnWinners.length
      ? { n: worstOnWinners.length, medianPct: median(worstOnWinners), p10Pct: pctile(worstOnWinners, 0.10) }
      : null,
  };
})();

/** Sizing so one full stop costs exactly 1% of the account. */
const plan = {
  asset: pick.asset,
  entry: pick.price,
  stop: pick.price * (1 - pick.best.stopPct / 100),
  stopPct: pick.best.stopPct,
  target: pick.price * (1 + pick.best.targetPct / 100),
  targetPct: pick.best.targetPct,
  horizonDays: pick.best.horizonDays,
  rr: pick.best.rr,
  hitPct: pick.best.upPct,
  stopHitPct: pick.best.downPct,
  breakevenWinRatePct: 100 / (1 + pick.best.rr),
  expectancyR: pick.best.expectancyR,
  expectancyFullR: pick.best.expectancyFullR,
  unresolvedPct: pick.best.unresolvedPct,
  positionUsdPer1000: (1000 * 0.01) / (pick.best.stopPct / 100),
  maxLeverage: 100 / pick.best.stopPct,
  /** Expected money on a $1,000 account, risking 1% — the honest headline. */
  expectedUsdPer1000: pick.best.expectancyFullR * 10,
};

console.log(JSON.stringify({
  measuredAt: new Date().toISOString(),
  method: {
    firstTouch: "Walked bar by bar. A bar touching both levels is charged to the stop.",
    overlap: "Windows overlap; effectiveN = n / horizon is the de-overlapped count.",
    ranking: "Candidates ranked by the share of geometries that pay, not by the single best cell. One bright cell in a field of losses is a search artefact.",
    distribution: "Every historical episode walked to resolution; unresolved ones closed at the market. Reported as percentiles, because an expected value is a number nobody experiences.",
    unavailable: "Binance futures is geo-blocked from this host. Funding is OKX. No liquidation or open-interest feed.",
  },
  btc,
  candidates: rows,
  ranked: ranked.map((r) => ({ asset: r.asset, positiveSharePct: r.positiveSharePct, medianExpectancyR: r.medianExpectancyR })),
  plan,
  distribution,
}, null, 2));
