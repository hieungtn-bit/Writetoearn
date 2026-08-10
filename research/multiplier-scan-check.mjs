/**
 * Auditing a "2x-3x multiplier scan" against the tape.
 *
 * The scan under test scores four pairs and attaches a target multiple to each.
 * Three kinds of claim in it are checkable and each is checked separately,
 * because they fail for different reasons:
 *
 *   1. Facts about right now — price, market cap, distance from the all-time
 *      high, whether volume is expanding. These are lookups.
 *
 *   2. Arithmetic — a "2x" and a "3x" quoted as prices. A multiple that does not
 *      match its own stated entry is not a forecast, it is a typo, and it is
 *      worth separating from the forecasts so the real disagreements stand out.
 *
 *   3. The multiple itself. "2x is a probabilistic target" is the scan's own
 *      hedge and it carries no number. It can be given one: how often has each
 *      pair actually doubled from an arbitrary day, over a horizon someone would
 *      hold. That is a base rate, and it is measured path-aware — walked bar by
 *      bar, so an episode that hits the invalidation level first is counted as
 *      the loss it would have been rather than as a double that happened later.
 *
 * The scan's own risk note says to wait for a resistance break before entering.
 * That advice is measurable and it is measured here too: entering at the stated
 * resistance while keeping the stated invalidation widens the risk leg without
 * moving the target, so both geometries are carried at the same targets.
 *
 * Reproducible:
 *   node research/multiplier-scan-check.mjs > research/multiplier-scan-check.json
 */

import { analyzeAsset, correlation, fetchKlines, logReturns } from "../src/analysis.mjs";
import { stageOf } from "../src/stage.mjs";

/** The scan as written, in numbers. Midpoints where it quotes a band. */
const SCAN = [
  { asset: "ICP", symbol: "ICPUSDT", geckoId: "internet-computer",
    score: 7.6, priceLow: 2.17, priceHigh: 2.21, mcLowUsd: 1.21e9, mcHighUsd: 1.23e9,
    fromAthClaimPct: -99, resistance: 2.325, invalidation: 2.115,
    targets: { "2x": 4.35, "3x": 6.55 }, volumeClaim: "yếu" },
  { asset: "ENA", symbol: "ENAUSDT", geckoId: "ethena",
    score: 7.2, priceLow: 0.089, priceHigh: 0.092, mcLowUsd: 8.8e8, mcHighUsd: 8.8e8,
    fromAthClaimPct: -90, resistance: 0.105, invalidation: 0.0775,
    targets: { "2x": 0.18, "3x": 0.27 }, volumeClaim: "cải thiện" },
  { asset: "ONDO", symbol: "ONDOUSDT", geckoId: "ondo-finance",
    score: 7.0, priceLow: 0.35, priceHigh: 0.38, mcLowUsd: 1.7e9, mcHighUsd: 1.9e9,
    fromAthClaimPct: -80, resistance: 0.435, invalidation: 0.325,
    targets: { "2x": 0.73 }, volumeClaim: "ổn định" },
  { asset: "ARB", symbol: "ARBUSDT", geckoId: "arbitrum",
    score: 6.7, priceLow: 0.08, priceHigh: 0.08, mcLowUsd: 5.0e8, mcHighUsd: 5.0e8,
    fromAthClaimPct: -97, resistance: 0.105, invalidation: 0.07,
    targets: { "2x": 0.16, "2.5x": 0.20 }, volumeClaim: null },
];

const retry = async (fn, n = 6) => {
  let last;
  for (let i = 0; i < n; i++) {
    try { return await fn(); } catch (e) { last = e; await new Promise((r) => setTimeout(r, 1200 * (i + 1))); }
  }
  throw last;
};

const gecko = await retry(async () => {
  const ids = SCAN.map((s) => s.geckoId).join(",");
  const res = await fetch(
    `https://api.coingecko.com/api/v3/coins/markets?vs_currency=usd&ids=${ids}`,
    { signal: AbortSignal.timeout(25_000) });
  if (!res.ok) throw new Error(`coingecko: HTTP ${res.status}`);
  const rows = await res.json();
  return Object.fromEntries(rows.map((r) => [r.id, r]));
});

const btcDaily = await retry(() => fetchKlines("BTCUSDT", { interval: "1d", limit: 400 }));

/**
 * Path-aware first touch, walked bar by bar.
 *
 * Reading a horizon's high and low separately would let the same episode count
 * as reaching both levels, and the two rates would sum past 100 while describing
 * a trade nobody could have taken. A bar that touches both is charged to the
 * downside: intraday order is unknowable from daily candles, and the ambiguous
 * case should not be credited to the forecast.
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
      if (candles[j].low <= stop) { down++; done = true; break; }
      if (candles[j].high >= target) { up++; done = true; break; }
    }
    if (!done) neither++;
  }
  return { n, upPct: (up / n) * 100, downPct: (down / n) * 100, neitherPct: (neither / n) * 100,
    effectiveN: n / horizon };
};

/** Bare doubling, no stop: has the pair ever gone up this much in this window? */
const reachedWithin = (candles, upPct, horizon) => {
  let hit = 0, n = 0;
  for (let i = 0; i < candles.length - horizon; i++) {
    const target = candles[i].close * (1 + upPct / 100);
    n++;
    if (candles.slice(i + 1, i + 1 + horizon).some((c) => c.high >= target)) hit++;
  }
  return { n, hitPct: (hit / n) * 100, effectiveN: n / horizon };
};

const HORIZONS = [90, 180];

const rows = [];
for (const s of SCAN) {
  const g = gecko[s.geckoId];
  const daily = await retry(() => fetchKlines(s.symbol, { interval: "1d", limit: 1000 }));
  const analysis = await retry(() => analyzeAsset(s.symbol));
  const stage = await retry(() => stageOf(s.asset)).catch(() => null);
  const price = analysis.price;

  const vols = daily.slice(-31, -1).map((c) => c.quoteVolume);
  const vMean = vols.reduce((a, b) => a + b, 0) / vols.length;
  const vSd = Math.sqrt(vols.reduce((a, b) => a + (b - vMean) ** 2, 0) / (vols.length - 1));
  const recent = daily.slice(-4, -1).map((c) => c.quoteVolume);
  const prior = daily.slice(-14, -4).map((c) => c.quoteVolume);

  const btcR = (() => {
    const a = logReturns(daily.slice(-31).map((c) => c.close));
    const b = logReturns(btcDaily.slice(-31).map((c) => c.close));
    const n = Math.min(a.length, b.length);
    return correlation(a.slice(-n), b.slice(-n));
  })();

  /**
   * Two entries at the same targets.
   *
   * The scan fixes the invalidation level, so entering at its stated resistance
   * instead of at spot lengthens the risk leg and shortens every reward leg.
   * Carrying both makes what the scan's own advice costs a number.
   */
  const geometryFor = (entry) => {
    const riskPct = (1 - s.invalidation / entry) * 100;
    return {
      entry, riskPct,
      targets: Object.entries(s.targets).map(([label, t]) => ({
        label, price: t,
        rewardPct: (t / entry - 1) * 100,
        rr: (t / entry - 1) / (1 - s.invalidation / entry),
        /** What the multiple really is once measured from this entry. */
        actualMultiple: t / entry,
      })),
    };
  };
  const spot = geometryFor(price);
  const trigger = geometryFor(s.resistance);

  const doubleReward = (2 - 1) * 100;
  rows.push({
    asset: s.asset,
    claimed: {
      score: s.score,
      priceBand: [s.priceLow, s.priceHigh],
      marketCapBand: [s.mcLowUsd, s.mcHighUsd],
      fromAthPct: s.fromAthClaimPct,
      resistance: s.resistance,
      invalidation: s.invalidation,
      targets: s.targets,
      volume: s.volumeClaim,
    },
    measured: {
      price,
      priceInsideClaimedBand: price >= s.priceLow && price <= s.priceHigh,
      marketCapUsd: g?.market_cap ?? null,
      marketCapInsideClaimedBand: g ? g.market_cap >= s.mcLowUsd * 0.9 && g.market_cap <= s.mcHighUsd * 1.1 : null,
      marketCapRank: g?.market_cap_rank ?? null,
      athUsd: g?.ath ?? null,
      fromAthPct: g ? (price / g.ath - 1) * 100 : null,
      /** How many times over price must multiply to see its old high again. */
      multipleToReclaimAth: g ? g.ath / price : null,
      volumeZScoreCompleted: (daily.at(-2).quoteVolume - vMean) / vSd,
      volume3dVsPrior10dPct:
        ((recent.reduce((a, b) => a + b, 0) / recent.length)
          / (prior.reduce((a, b) => a + b, 0) / prior.length) - 1) * 100,
      volumeTrendPct: stage?.volumeTrendPct ?? null,
      underwaterPct: stage?.underwaterPct ?? null,
      stage: stage?.stage ?? null,
      rsi14: analysis.rsi14,
      atrPct: analysis.atrPct,
      rangePosition30d: analysis.rangePosition30d,
      btcCorrelation30d: btcR,
      /** Squared, because r is routinely misread as a share of movement. */
      btcVarianceExplainedPct: btcR ** 2 * 100,
    },
    geometry: { spot, trigger },
    /**
     * The multiple, as a base rate.
     *
     * Two readings. "bare" asks only whether the pair ever traded 100% higher
     * inside the window — the friendliest possible test, no stop, no path. The
     * stopped reading applies the scan's own invalidation level, which is what a
     * reader following the scan would actually experience.
     */
    doubling: HORIZONS.map((h) => ({
      horizonDays: h,
      bare: reachedWithin(daily, doubleReward, h),
      withStatedStop: firstTouch(daily, doubleReward, spot.riskPct, h),
      withStatedStopAfterWaiting: firstTouch(daily, (2 - 1) * 100 - (s.resistance / price - 1) * 100, trigger.riskPct, h),
    })),
    /**
     * Expectancy in R at the 2x target, spot entry, 90-day horizon.
     *
     * The number that decides whether any of this pays. A reward-to-risk of 20
     * reads as a gift until it is multiplied by how often it lands: a 3% hit
     * rate against a 96% stop rate turns a 20:1 payoff into a losing bet, and
     * nothing in a scan that quotes only the payoff will tell a reader that.
     * Unresolved episodes are counted flat.
     */
    expectancyR90d: null,
    candles: daily.length,
  });
}

for (const r of rows) {
  const two = r.geometry.spot.targets.find((t) => t.label === "2x");
  const d = r.doubling.find((x) => x.horizonDays === 90).withStatedStop;
  r.expectancyR90d = two ? (d.upPct / 100) * two.rr - (d.downPct / 100) : null;
}

/**
 * Does the scan's own score order the setups the way expectancy does?
 *
 * Spearman on four items, which is far too few for the coefficient to carry a
 * significance claim — that caveat travels with the number wherever it goes.
 * It is still worth computing: a score presented to three significant figures is
 * making an implicit promise that a higher number means a better setup, and the
 * cheapest honest test of that promise is whether the ordering survives contact
 * with a measured outcome.
 */
const ranking = (() => {
  const rank = (key, dir) =>
    [...rows].sort((a, b) => dir * (key(b) - key(a))).map((r) => r.asset);
  const byScore = rank((r) => r.claimed.score, 1);
  const byExpectancy = rank((r) => r.expectancyR90d ?? -Infinity, 1);
  const pos = (list, a) => list.indexOf(a) + 1;
  const n = rows.length;
  const dSq = rows.reduce((acc, r) => acc + (pos(byScore, r.asset) - pos(byExpectancy, r.asset)) ** 2, 0);
  return {
    byScore, byExpectancy,
    spearmanRho: 1 - (6 * dSq) / (n * (n * n - 1)),
    caveat: "Four items. Rho here is descriptive, not a significance test — it says the ordering is not demonstrated, not that it is disproved.",
  };
})();

/** How many of the scan's volume descriptions match the measured trend. */
const volumeAudit = rows
  .filter((r) => r.claimed.volume)
  .map((r) => ({
    asset: r.asset,
    said: r.claimed.volume,
    trendPct: r.measured.volumeTrendPct,
    zScore: r.measured.volumeZScoreCompleted,
    // "yếu" should pair with a falling trend; "cải thiện"/"ổn định" with a
    // trend that is not collapsing. Anything else is backwards.
    matches: r.claimed.volume === "yếu"
      ? r.measured.volumeTrendPct < 0
      : r.measured.volumeTrendPct > -20,
  }));

console.log(JSON.stringify({
  measuredAt: new Date().toISOString(),
  ranking,
  volumeAudit,
  method: {
    firstTouch: "Walked bar by bar. A bar touching both levels is charged to the stop.",
    overlap: "Windows overlap; effectiveN = n / horizon is the de-overlapped count.",
    marketCap: "CoinGecko. Binance futures is geo-blocked from this machine, so no funding or open interest is used.",
    note: "Prices move. Every figure here is from one fetch, timestamped above.",
  },
  rows,
}, null, 2));
