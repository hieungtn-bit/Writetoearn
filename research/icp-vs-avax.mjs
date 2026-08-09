/**
 * ICP against AVAX, measured under one rule for both.
 *
 * A comparison arrived on the desk arguing that ICP has the cleaner base and
 * AVAX the better liquidity. Both halves turn out to be checkable, and checking
 * them changes what the comparison is about.
 *
 * The base claim is measured with `findBase` — the same detector applied to both
 * pairs, so "cleaner" stops being a chart opinion and becomes a width in per
 * cent. The liquidity claim is measured twice, in level and relative to size,
 * because those give opposite answers and only one of them was reported.
 *
 * The figure neither side of the original comparison mentioned is drawdown from
 * the all-time high. It is the largest number in the entire comparison and it
 * was absent, so it is computed here and carried at the top.
 *
 * What this deliberately does NOT do is treat a tight base as a forecast.
 * `research/breakout-signal.mjs` measured compression across 43,088 pair-days at
 * 1.01x lift and 0.09 sigma — indistinguishable from random. A base is a
 * description of where price has been, and this file records it as one.
 *
 * Reproducible:
 *   node research/icp-vs-avax.mjs > research/icp-vs-avax.json
 */

import { analyzeAsset, fetchKlines } from "../src/analysis.mjs";
import { findBase } from "../src/pbbe.mjs";
import { stageOf } from "../src/stage.mjs";
import { fetchAllTickers } from "../src/pulse.mjs";

const PAIRS = [
  { symbol: "ICPUSDT", asset: "ICP", geckoId: "internet-computer" },
  { symbol: "AVAXUSDT", asset: "AVAX", geckoId: "avalanche-2" },
];

const retry = async (fn, n = 6) => {
  let last;
  for (let i = 0; i < n; i++) {
    try { return await fn(); } catch (e) { last = e; await new Promise((r) => setTimeout(r, 1100 * (i + 1))); }
  }
  throw last;
};

const gecko = await retry(async () => {
  const ids = PAIRS.map((p) => p.geckoId).join(",");
  const res = await fetch(
    `https://api.coingecko.com/api/v3/coins/markets?vs_currency=usd&ids=${ids}`
      + "&price_change_percentage=7d,30d",
    { signal: AbortSignal.timeout(25_000) });
  if (!res.ok) throw new Error(`coingecko: HTTP ${res.status}`);
  return res.json();
});

/** Open interest on the one venue reachable from here. */
async function okxOpenInterest(asset) {
  try {
    const res = await fetch(
      `https://www.okx.com/api/v5/public/open-interest?instType=SWAP&instId=${asset}-USDT-SWAP`,
      { signal: AbortSignal.timeout(15_000) });
    const row = (await res.json())?.data?.[0];
    return row ? { coins: Number(row.oiCcy), usd: Number(row.oiUsd) } : null;
  } catch { return null; }
}

const tickers = await retry(() => fetchAllTickers());
const out = {};

for (const p of PAIRS) {
  const g = gecko.find((x) => x.id === p.geckoId);
  const t = tickers.find((x) => x.symbol === p.symbol);
  const daily = await retry(() => fetchKlines(p.symbol, { interval: "1d", limit: 60 }));
  const a = await retry(() => analyzeAsset(p.symbol));
  const st = await retry(() => stageOf(p.asset));
  const base = findBase(daily);
  const oi = await okxOpenInterest(p.asset);

  out[p.asset] = {
    price: a.price,
    marketCapUsd: g.market_cap,
    marketCapRank: g.market_cap_rank,
    /** Every venue, per CoinGecko. */
    globalVolume24hUsd: g.total_volume,
    /** This venue only. Binance spot is where the base was detected. */
    binanceSpotVolume24hUsd: t.quoteVolume24h,
    /**
     * Turnover as a share of market value.
     *
     * The comparison reported the level and concluded AVAX is the more liquid
     * asset. In level that is true. As a share of what there is to trade, the
     * two are almost identical, which makes the liquidity gap a size difference
     * rather than a quality one — a distinction the level alone hides.
     */
    volumeToMarketCapPct: (g.total_volume / g.market_cap) * 100,
    change7dPct: g.price_change_percentage_7d_in_currency,
    change30dPct: g.price_change_percentage_30d_in_currency,
    /** The number the original comparison never mentions. */
    athUsd: g.ath,
    fromAthPct: (g.current_price / g.ath - 1) * 100,
    multipleToReclaimAth: g.ath / g.current_price,
    base: base && {
      days: base.days,
      widthPct: base.widthPct,
      high: base.high,
      fromBaseTopPct: (a.price / base.high - 1) * 100,
    },
    atrPct: a.atrPct,
    rsi14: a.rsi14,
    rangePosition30d: a.rangePosition30d,
    /** Share of the month's turnover done above the current price. */
    underwaterPct: st.underwaterPct,
    volumeTrendPct: st.volumeTrendPct,
    /** Share of the month's turnover in its three busiest days. */
    topThreeDaySharePct: st.concentrationPct,
    stage: st.stage,
    okxOpenInterest: oi,
  };
}

const icp = out.ICP, avax = out.AVAX;

console.log(JSON.stringify({
  measuredAt: new Date().toISOString(),
  method: {
    baseDetector: "src/pbbe.mjs findBase — the same rule applied to both pairs, so 'cleaner base' is a width rather than an opinion",
    caveat: "A tight base is a description of the past. research/breakout-signal.mjs measured compression at 1.01x lift and 0.09 sigma across 43,088 pair-days; it forecasts nothing.",
    openInterest: "OKX only. Binance's futures endpoint is geo-blocked from this machine, so aggregate figures quoted elsewhere cannot be checked here.",
    unverified: "Throughput and transactions-per-second claims are off-chain data this repo cannot fetch, and are therefore not recorded.",
  },
  pairs: out,
  contrasts: {
    marketCapRatio: avax.marketCapUsd / icp.marketCapUsd,
    globalVolumeRatio: avax.globalVolume24hUsd / icp.globalVolume24hUsd,
    /** Near one means the liquidity advantage is entirely a size advantage. */
    volumeToMarketCapRatio: avax.volumeToMarketCapPct / icp.volumeToMarketCapPct,
    baseWidthGapPp: avax.base.widthPct - icp.base.widthPct,
    fromBaseTopGapPp: icp.base.fromBaseTopPct - avax.base.fromBaseTopPct,
    /** The gap that separates them most, and the one nobody cited. */
    underwaterGapPp: avax.underwaterPct - icp.underwaterPct,
    volumeTrendGapPp: icp.volumeTrendPct - avax.volumeTrendPct,
    athDrawdownGapPp: icp.fromAthPct - avax.fromAthPct,
  },
}, null, 2));
