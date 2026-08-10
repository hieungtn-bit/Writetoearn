/**
 * BNB, every angle this desk can actually reach, plus what a week is worth.
 *
 * A weekly trading plan needs a weekly distance. Sizing a stop off a daily ATR
 * and then holding for five days is the mistake that makes a plan look tight on
 * paper and get swept on Tuesday, so the week is measured directly: two years of
 * completed calendar weeks, high to low, as percentiles.
 *
 * Everything else is gathered rather than argued. Where a figure cannot be
 * reached from here it is left out instead of estimated — Binance's futures
 * endpoint is geo-blocked, so open interest is OKX only and aggregate figures
 * quoted elsewhere are not repeated.
 *
 * One caution belongs at the top rather than in a footnote. This is the token of
 * the exchange this desk publishes on. Nothing here is softened for that, and
 * the numbers that argue against a long — participation falling into a
 * range-high, ninety-day flow still negative — are carried in the same table as
 * the ones that argue for it.
 *
 * Reproducible:
 *   node research/bnb-week.mjs > research/bnb-week.json
 */

import { analyzeAsset, fetchKlines } from "../src/analysis.mjs";
import { findBase } from "../src/pbbe.mjs";
import { stageOf } from "../src/stage.mjs";
import { fetchFundingHistory } from "../src/market.mjs";
import { buildCard } from "../src/card.mjs";
import { bandsFor, clusterMap, fetchPositionTiers, nearestClusters } from "../src/liquidation.mjs";

const SYMBOL = "BNBUSDT";
const ASSET = "BNB";
const WEEKS = 104;

const retry = async (fn, n = 6) => {
  let last;
  for (let i = 0; i < n; i++) {
    try { return await fn(); } catch (e) { last = e; await new Promise((r) => setTimeout(r, 1100 * (i + 1))); }
  }
  throw last;
};

/** Completed calendar weeks only — the one in progress has no range yet. */
const weekly = (await retry(() => fetchKlines(SYMBOL, { interval: "1w", limit: WEEKS + 1 }))).slice(0, -1);
const weekRanges = weekly
  .filter((c) => c.low > 0)
  .map((c) => ({
    week: new Date(c.openTime).toISOString().slice(0, 10),
    rangePct: ((c.high - c.low) / c.low) * 100,
    returnPct: (c.close / c.open - 1) * 100,
  }));

const sorted = [...weekRanges.map((w) => w.rangePct)].sort((a, b) => a - b);
const q = (p) => sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * p))];
const median = (xs) => {
  const s = [...xs].sort((a, b) => a - b);
  const m = s.length >> 1;
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};

const analysis = await retry(() => analyzeAsset(SYMBOL));
const daily = await retry(() => fetchKlines(SYMBOL, { interval: "1d", limit: 60 }));
// The cluster map decays by hours, so it needs an hourly series rather than daily.
const hourly = await retry(() => fetchKlines(SYMBOL, { interval: "1h", limit: 200 }));
const base = findBase(daily);
const stage = await retry(() => stageOf(ASSET));
const funding = await retry(() => fetchFundingHistory(`${ASSET}-USDT-SWAP`)).catch(() => null);

const gecko = await retry(async () => {
  const res = await fetch(
    "https://api.coingecko.com/api/v3/coins/markets?vs_currency=usd&ids=binancecoin"
      + "&price_change_percentage=7d,30d,1y",
    { signal: AbortSignal.timeout(25_000) });
  if (!res.ok) throw new Error(`coingecko: HTTP ${res.status}`);
  return (await res.json())[0];
});

const okxOi = await (async () => {
  try {
    const res = await fetch(
      `https://www.okx.com/api/v5/public/open-interest?instType=SWAP&instId=${ASSET}-USDT-SWAP`,
      { signal: AbortSignal.timeout(15_000) });
    const row = (await res.json())?.data?.[0];
    return row ? { coins: Number(row.oiCcy), usd: Number(row.oiUsd) } : null;
  } catch { return null; }
})();

// Defaults to an empty list rather than null: buildCard treats [] as "no venue
// tiers known" and still produces a plan, where null throws inside mmrFor.
// The parameter is an instrument family, not an asset: "BNB" silently returns
// nothing and every leverage figure downstream quietly loses its venue anchor.
const tiers = (await retry(() => fetchPositionTiers(`${ASSET}-USDT`)).catch(() => null)) ?? [];
const clusters = (() => {
  try {
    // Tiers are the second positional argument, not part of the options bag.
    const map = clusterMap(hourly, tiers, { price: analysis.price });
    return nearestClusters(map, analysis.price, { top: 3 });
  } catch { return null; }
})();

/**
 * Two plans, because the horizon changes the stop.
 *
 * The default card sizes off 1.5 daily ATR, which is right for a day trade and
 * wrong for a week: the median completed week on this pair travels several times
 * that distance. The weekly plan is sized so the stop clears the median week
 * instead, and both are carried so the difference is visible rather than argued.
 */
const dayPlan = buildCard({ symbol: SYMBOL, price: analysis.price, atrPct: analysis.atrPct, tiers });
const weeklyStopPct = median(weekRanges.map((w) => w.rangePct)) / 2;
const weekPlan = buildCard({
  symbol: SYMBOL,
  price: analysis.price,
  atrPct: analysis.atrPct,
  tiers,
  stopAtr: weeklyStopPct / analysis.atrPct,
});

console.log(JSON.stringify({
  measuredAt: new Date().toISOString(),
  symbol: SYMBOL,
  method: {
    weeksSampled: weekRanges.length,
    note: "Completed calendar weeks only. A weekly plan sized off a daily ATR is the reason a stop looks tight on paper and gets swept mid-week.",
    openInterest: "OKX only; Binance futures is geo-blocked from this machine.",
    disclosure: "BNB is the token of the exchange this desk publishes on. Figures arguing against a long are carried in the same table as those arguing for it.",
  },
  price: analysis.price,
  fundamentals: {
    marketCapUsd: gecko.market_cap,
    marketCapRank: gecko.market_cap_rank,
    volume24hUsd: gecko.total_volume,
    /**
     * Turnover against market value.
     *
     * Worth carrying because it is the number that separates BNB from the mid
     * caps measured this week: ICP and AVAX both turn over roughly 3.7% of their
     * market value a day. A far lower figure says the float is held rather than
     * traded, which cuts both ways — less supply pressing on any rally, and less
     * depth to exit into.
     */
    volumeToMarketCapPct: (gecko.total_volume / gecko.market_cap) * 100,
    athUsd: gecko.ath,
    athDate: gecko.ath_date?.slice(0, 10),
    fromAthPct: (gecko.current_price / gecko.ath - 1) * 100,
    circulatingSupply: gecko.circulating_supply,
    maxSupply: gecko.max_supply,
    /** How much of the cap has never reached circulation, burns included. */
    supplyNotCirculatingPct: gecko.max_supply
      ? (1 - gecko.circulating_supply / gecko.max_supply) * 100 : null,
    change1yPct: gecko.price_change_percentage_1y_in_currency,
  },
  technical: {
    change7dPct: analysis.change7dPct,
    change30dPct: analysis.change30dPct,
    rsi14: analysis.rsi14,
    atrPct: analysis.atrPct,
    realizedVol30d: analysis.realizedVol30d,
    high30d: analysis.high30d,
    low30d: analysis.low30d,
    rangePosition30d: analysis.rangePosition30d,
    sma20: analysis.sma20,
    sma50: analysis.sma50,
    volumeZScoreCompleted: analysis.volumeZScoreCompleted,
    upDownVolumeRatio30d: analysis.upDownVolumeRatio30d,
    upDownVolumeRatio90d: analysis.upDownVolumeRatio90d,
    base: base && {
      days: base.days, widthPct: base.widthPct, high: base.high,
      fromBaseTopPct: (analysis.price / base.high - 1) * 100,
    },
  },
  positioning: {
    underwaterPct: stage.underwaterPct,
    vsVwapPct: stage.vsVwapPct,
    volumeTrendPct: stage.volumeTrendPct,
    topThreeDaySharePct: stage.concentrationPct,
    stage: stage.stage,
    funding: funding && {
      annualised7dPct: funding.annualised7dPct,
      annualisedPrior14dPct: funding.annualisedPrior14dPct,
      negativeSharePct: funding.negativeSharePct,
    },
    okxOpenInterest: okxOi,
    liquidationClusters: clusters,
  },
  weeklyRange: {
    weeks: weekRanges.length,
    p25Pct: q(0.25),
    medianPct: median(weekRanges.map((w) => w.rangePct)),
    p75Pct: q(0.75),
    p90Pct: q(0.90),
    positiveWeeksPct: (weekRanges.filter((w) => w.returnPct > 0).length / weekRanges.length) * 100,
    medianReturnPct: median(weekRanges.map((w) => w.returnPct)),
  },
  dayPlan,
  weekPlan,
  /** How many times the day-trade stop fits inside a median week. */
  medianWeekOverDayStop: median(weekRanges.map((w) => w.rangePct)) / dayPlan.stopDistancePct,
}, null, 2));
