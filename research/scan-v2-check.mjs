/**
 * The revised scan: filling the gaps it declares, and testing the fix it made.
 *
 * This version of the scan corrected itself. It dropped the volume description
 * that was backwards, it carries overhead supply where it has a figure, it says
 * to move the stop when waiting for a break, and it closes by demanding a
 * probability and a sample size. Those are real improvements and they change
 * what is worth measuring: repeating the same audit would be scoring a paper
 * that has already been rewritten.
 *
 * So three new things are measured instead.
 *
 *   1. The two numbers it says are unavailable. It marks SUI's overhead supply
 *      as "no accurate free figure, confidence reduced" and leaves XLM's blank.
 *      Both are computable from public candles, and a gap that can be closed in
 *      one fetch should be closed rather than declared.
 *
 *   2. Whether the more modest target fixes the arithmetic. Moving from 2x to
 *      1.5x shortens the reward leg without moving the stop, which is the same
 *      geometry problem in the other direction — it should raise the hit rate
 *      and lower the payoff. Whether the trade comes out positive is a question
 *      about the product of the two, not about either one.
 *
 *   3. Beta, not correlation. The scan says ICP has "high BTC beta". Those are
 *      different quantities: correlation says how tightly two series move
 *      together, beta says how far one moves when the other moves one percent.
 *      A pair can be loosely correlated and high beta at once, and the risk that
 *      matters to a position is the second one.
 *
 * Comparability required one choice, made explicitly. The scan states an
 * invalidation for ICP and ENA and none for SUI or XLM, so every pair is also
 * measured against a uniform structural stop — its own 30-day low — and the
 * two named stops are carried alongside rather than instead.
 *
 * Reproducible:
 *   node research/scan-v2-check.mjs > research/scan-v2-check.json
 */

import { analyzeAsset, correlation, fetchKlines, logReturns, mean } from "../src/analysis.mjs";
import { stageOf } from "../src/stage.mjs";

const SCAN = [
  { asset: "ICP", symbol: "ICPUSDT", geckoId: "internet-computer", score: 7.3,
    priceLow: 2.18, priceHigh: 2.21, statedStop: 2.115, betaClaim: "cao" },
  { asset: "ENA", symbol: "ENAUSDT", geckoId: "ethena", score: 6.9,
    priceLow: 0.076, priceHigh: 0.089, statedStop: 0.0775, betaClaim: null },
  { asset: "SUI", symbol: "SUIUSDT", geckoId: "sui", score: 6.7,
    priceLow: 0.69, priceHigh: 0.72, statedStop: null, betaClaim: null },
  { asset: "XLM", symbol: "XLMUSDT", geckoId: "stellar", score: 6.5,
    priceLow: 0.16, priceHigh: 0.18, statedStop: null, betaClaim: null },
];

const MULTIPLES = [1.5, 2];
const HORIZON = 90;

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
  return Object.fromEntries((await res.json()).map((r) => [r.id, r]));
});

const btcDaily = await retry(() => fetchKlines("BTCUSDT", { interval: "1d", limit: 400 }));

/**
 * Path-aware first touch. A bar reaching both levels is charged to the stop,
 * because daily candles do not reveal intraday order and the ambiguous case
 * should not be credited to the forecast.
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
  return { n, upPct: (up / n) * 100, downPct: (down / n) * 100,
    neitherPct: (neither / n) * 100, effectiveN: n / horizon };
};

const bare = (candles, upPct, horizon) => {
  let hit = 0, n = 0;
  for (let i = 0; i < candles.length - horizon; i++) {
    const target = candles[i].close * (1 + upPct / 100);
    n++;
    if (candles.slice(i + 1, i + 1 + horizon).some((c) => c.high >= target)) hit++;
  }
  return { n, hitPct: (hit / n) * 100, effectiveN: n / horizon };
};

/**
 * Beta and correlation from the same returns, kept together deliberately.
 *
 * Beta is the regression slope: how far this asset moves per one percent of
 * BTC. Correlation is how reliably it moves at all. Reporting one as if it
 * were the other is the most common way a risk claim goes wrong, so both
 * travel in the same object.
 */
const betaAndCorrelation = (assetCloses, btcCloses, days) => {
  const a = logReturns(assetCloses.slice(-(days + 1)));
  const b = logReturns(btcCloses.slice(-(days + 1)));
  const n = Math.min(a.length, b.length);
  const x = b.slice(-n), yv = a.slice(-n);
  const mx = mean(x), my = mean(yv);
  const cov = x.reduce((acc, v, i) => acc + (v - mx) * (yv[i] - my), 0) / (n - 1);
  const varx = x.reduce((acc, v) => acc + (v - mx) ** 2, 0) / (n - 1);
  const r = correlation(yv, x);
  return { days, n, beta: cov / varx, r, varianceExplainedPct: r ** 2 * 100 };
};

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

  /**
   * The uniform structural stop: this pair's own 30-day low.
   *
   * Needed because the scan names an invalidation for two of the four. Scoring
   * SUI and XLM against a level it never gave would be inventing its plan for
   * it; scoring them against nothing would leave the comparison one-sided.
   */
  const low30 = Math.min(...daily.slice(-30).map((c) => c.low));
  const structuralStopPct = (1 - low30 / price) * 100;
  const statedStopPct = s.statedStop ? (1 - s.statedStop / price) * 100 : null;

  const ladder = MULTIPLES.map((m) => {
    const rewardPct = (m - 1) * 100;
    const withStructural = firstTouch(daily, rewardPct, structuralStopPct, HORIZON);
    const withStated = statedStopPct ? firstTouch(daily, rewardPct, statedStopPct, HORIZON) : null;
    const rrStructural = rewardPct / structuralStopPct;
    return {
      multiple: m,
      targetPrice: price * m,
      rewardPct,
      bare: bare(daily, rewardPct, HORIZON),
      structural: {
        stopPct: structuralStopPct, rr: rrStructural, ...withStructural,
        expectancyR: (withStructural.upPct / 100) * rrStructural - (withStructural.downPct / 100),
      },
      stated: withStated && {
        stopPct: statedStopPct, rr: rewardPct / statedStopPct, ...withStated,
        expectancyR: (withStated.upPct / 100) * (rewardPct / statedStopPct) - (withStated.downPct / 100),
      },
    };
  });

  rows.push({
    asset: s.asset,
    claimed: {
      score: s.score, priceBand: [s.priceLow, s.priceHigh],
      statedStop: s.statedStop, betaClaim: s.betaClaim,
      overheadStated: s.asset === "ICP" ? 7 : s.asset === "ENA" ? 22 : null,
    },
    measured: {
      price,
      priceInsideClaimedBand: price >= s.priceLow && price <= s.priceHigh,
      marketCapUsd: g?.market_cap ?? null,
      marketCapRank: g?.market_cap_rank ?? null,
      fromAthPct: g ? (price / g.ath - 1) * 100 : null,
      multipleToReclaimAth: g ? g.ath / price : null,
      /** The figure the scan marks as unavailable for SUI and blank for XLM. */
      underwaterPct: stage?.underwaterPct ?? null,
      volumeTrendPct: stage?.volumeTrendPct ?? null,
      stage: stage?.stage ?? null,
      volumeZScoreCompleted: (daily.at(-2).quoteVolume - vMean) / vSd,
      rsi14: analysis.rsi14,
      atrPct: analysis.atrPct,
      rangePosition30d: analysis.rangePosition30d,
      low30d: low30,
      structuralStopPct,
      statedStopPct,
      /**
       * The stop measured in units of the pair's own daily range.
       *
       * The variable that turns out to explain which target wins. A stop is not
       * tight or wide in percent — it is tight or wide relative to how far the
       * asset moves in an ordinary day. Below about one daily range the stop is
       * hit almost regardless of where the target sits, so the smaller target
       * buys a worse payoff for the same near-certain loss.
       */
      structuralStopInAtr: structuralStopPct / analysis.atrPct,
      statedStopInAtr: statedStopPct ? statedStopPct / analysis.atrPct : null,
    },
    btc: [30, 90].map((d) => betaAndCorrelation(daily.map((c) => c.close), btcDaily.map((c) => c.close), d)),
    ladder,
    candles: daily.length,
  });
}

/**
 * Does the smaller target rescue the trade?
 *
 * The scan's own revision, tested on its own terms: same stop, shorter reward
 * leg. Compared on the uniform structural stop so all four are on one ruler.
 */
const targetComparison = rows.map((r) => {
  const at = (m) => r.ladder.find((l) => l.multiple === m).structural;
  return {
    asset: r.asset,
    at1_5x: { hitPct: at(1.5).upPct, rr: at(1.5).rr, expectancyR: at(1.5).expectancyR },
    at2x: { hitPct: at(2).upPct, rr: at(2).rr, expectancyR: at(2).expectancyR },
    smallerTargetHelps: at(1.5).expectancyR > at(2).expectancyR,
    eitherPositive: at(1.5).expectancyR > 0 || at(2).expectancyR > 0,
  };
});

console.log(JSON.stringify({
  measuredAt: new Date().toISOString(),
  method: {
    horizonDays: HORIZON,
    firstTouch: "Walked bar by bar. A bar touching both levels is charged to the stop.",
    overlap: "Windows overlap; effectiveN = n / horizon is the de-overlapped count.",
    stopChoice: "The scan names an invalidation for ICP and ENA only, so every pair is also measured against its own 30-day low as a uniform structural stop. Both readings are reported.",
    beta: "Regression slope of daily log returns on BTC's, alongside correlation from the same returns. They are different quantities and the scan's 'high beta' claim is about the first.",
    unavailable: "Binance futures is geo-blocked from this host, so nothing here uses funding or open interest.",
  },
  rows,
  targetComparison,
}, null, 2));
