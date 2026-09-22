/**
 * ENA and ICP, everything this desk can reach — and what geometry their own
 * history actually supports.
 *
 * The usual shape of this work is to take someone's proposed entry, stop and
 * target and score it. That answers whether one plan pays. It does not answer
 * the more useful question, which is whether ANY plan on this pair pays, and if
 * so what shape it has.
 *
 * So the second half searches a grid: stop distances expressed in the pair's own
 * daily ranges, targets as multiples of that stop, every cell measured path-aware
 * over three horizons. That search is also the danger. Trying sixty cells and
 * reporting the best one manufactures a winner out of noise every time, so three
 * things are carried alongside the best cell and none of them are optional:
 *
 *   - how many cells were tried,
 *   - how many came out positive at all — a handful is noise, a broad plateau is
 *     structure,
 *   - and the median cell, which no amount of searching can flatter.
 *
 * A grid where forty of sixty cells pay is telling you something about the pair.
 * A grid where two do is telling you about the grid.
 *
 * The BTC context is measured rather than assumed, because the scan this responds
 * to quotes a price band and an invalidation level, and whether price is already
 * sitting on that level changes what the whole watchlist means.
 *
 * Reproducible:
 *   node research/ena-icp-deep.mjs > research/ena-icp-deep.json
 */

import {
  analyzeAsset, atr, correlation, fetchKlines, logReturns, mean, sma,
} from "../src/analysis.mjs";
import { findBase } from "../src/pbbe.mjs";
import { stageOf } from "../src/stage.mjs";
import { fetchFundingHistory } from "../src/market.mjs";

const ASSETS = [
  { asset: "ENA", symbol: "ENAUSDT", geckoId: "ethena" },
  { asset: "ICP", symbol: "ICPUSDT", geckoId: "internet-computer" },
];

/** The scan's own BTC framing, so it can be checked rather than paraphrased. */
const SCAN_BTC = { bandLow: 64_800, bandHigh: 65_200, invalidationLow: 63_500, invalidationHigh: 64_000 };

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
  return s[Math.min(s.length - 1, Math.floor(s.length * p))];
};

/* ---------- BTC context, measured ---------- */

const btcDaily = await retry(() => fetchKlines("BTCUSDT", { interval: "1d", limit: 400 }));
const btcAnalysis = await retry(() => analyzeAsset("BTCUSDT"));
const btcCloses = btcDaily.map((c) => c.close);
const btcSma50 = sma(btcCloses, 50), btcSma200 = sma(btcCloses, 200);

const btc = {
  price: btcAnalysis.price,
  claimedBand: [SCAN_BTC.bandLow, SCAN_BTC.bandHigh],
  insideClaimedBand: btcAnalysis.price >= SCAN_BTC.bandLow && btcAnalysis.price <= SCAN_BTC.bandHigh,
  sma50: btcSma50,
  sma200: btcSma200,
  deathCross: btcSma50 < btcSma200,
  aboveSma200: btcAnalysis.price > btcSma200,
  rsi14: btcAnalysis.rsi14,
  rangePosition30d: btcAnalysis.rangePosition30d,
  change30dPct: btcAnalysis.change30dPct,
  /**
   * Distance to the scan's own kill switch.
   *
   * Negative means price is already inside the band the scan says invalidates
   * its whole watchlist, which is a different situation from the one the scan
   * describes and changes what every row below means.
   */
  invalidationBand: [SCAN_BTC.invalidationLow, SCAN_BTC.invalidationHigh],
  distanceToInvalidationPct: (btcAnalysis.price / SCAN_BTC.invalidationHigh - 1) * 100,
  alreadyInsideInvalidation: btcAnalysis.price <= SCAN_BTC.invalidationHigh,
};

/* ---------- path-aware machinery ---------- */

/**
 * First touch, walked bar by bar. A bar reaching both levels is charged to the
 * stop: daily candles do not reveal intraday order, and the ambiguous case must
 * not be credited to the trade.
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
  const rr = upPct / downPct;
  return {
    n, upPct: (up / n) * 100, downPct: (down / n) * 100, neitherPct: (neither / n) * 100,
    effectiveN: n / horizon, rr,
    expectancyR: (up / n) * rr - (down / n),
  };
};

/** Stop distances in daily ranges, and targets as multiples of the stop. */
const STOP_ATRS = [1, 1.5, 2, 2.5, 3, 4];
const RR_TARGETS = [1, 1.5, 2, 3, 5];
const HORIZONS = [30, 60, 90];

const rows = [];
for (const a of ASSETS) {
  const daily = await retry(() => fetchKlines(a.symbol, { interval: "1d", limit: 1000 }));
  const weekly = (await retry(() => fetchKlines(a.symbol, { interval: "1w", limit: 105 }))).slice(0, -1);
  const analysis = await retry(() => analyzeAsset(a.symbol));
  const stage = await retry(() => stageOf(a.asset)).catch(() => null);
  const funding = await retry(() => fetchFundingHistory(`${a.asset}-USDT-SWAP`)).catch(() => null);
  const price = analysis.price;
  const atrPct = (atr(daily, 14) / price) * 100;

  const gecko = await retry(async () => {
    const res = await fetch(
      `https://api.coingecko.com/api/v3/coins/markets?vs_currency=usd&ids=${a.geckoId}`
      + "&price_change_percentage=7d,30d,1y",
      { signal: AbortSignal.timeout(25_000) });
    if (!res.ok) throw new Error(`coingecko: HTTP ${res.status}`);
    return (await res.json())[0];
  });

  const okxOi = await (async () => {
    try {
      const res = await fetch(
        `https://www.okx.com/api/v5/public/open-interest?instType=SWAP&instId=${a.asset}-USDT-SWAP`,
        { signal: AbortSignal.timeout(15_000) });
      const row = (await res.json())?.data?.[0];
      return row ? { coins: Number(row.oiCcy), usd: Number(row.oiUsd) } : null;
    } catch { return null; }
  })();

  const base = findBase(daily.slice(-60));

  const vols = daily.slice(-31, -1).map((c) => c.quoteVolume);
  const vMean = vols.reduce((x, y) => x + y, 0) / vols.length;
  const vSd = Math.sqrt(vols.reduce((x, y) => x + (y - vMean) ** 2, 0) / (vols.length - 1));

  const betaFor = (days) => {
    const x = logReturns(btcCloses.slice(-(days + 1)));
    const y = logReturns(daily.map((c) => c.close).slice(-(days + 1)));
    const n = Math.min(x.length, y.length);
    const xs = x.slice(-n), ys = y.slice(-n);
    const mx = mean(xs), my = mean(ys);
    const cov = xs.reduce((s, v, i) => s + (v - mx) * (ys[i] - my), 0) / (n - 1);
    const varx = xs.reduce((s, v) => s + (v - mx) ** 2, 0) / (n - 1);
    const r = correlation(ys, xs);
    return { days, beta: cov / varx, r, varianceExplainedPct: r ** 2 * 100 };
  };

  const weekRanges = weekly.filter((c) => c.low > 0).map((c) => ((c.high - c.low) / c.low) * 100);

  /**
   * The grid.
   *
   * Every combination of stop distance and reward-to-risk, on every horizon.
   * The point is the shape of the surface, not the winner — a broad region of
   * positive cells means the pair rewards a family of plans, while one bright
   * cell in a field of losses means the search found noise.
   */
  const grid = [];
  for (const stopAtr of STOP_ATRS) {
    const stopPct = stopAtr * atrPct;
    for (const rr of RR_TARGETS) {
      for (const horizon of HORIZONS) {
        const r = firstTouch(daily, stopPct * rr, stopPct, horizon);
        grid.push({
          stopAtr, stopPct, rr, horizonDays: horizon,
          targetPct: stopPct * rr,
          hitPct: r.upPct, stopHitPct: r.downPct, unresolvedPct: r.neitherPct,
          breakevenWinRatePct: 100 / (1 + rr),
          expectancyR: r.expectancyR,
          effectiveN: r.effectiveN,
        });
      }
    }
  }

  const sorted = [...grid].sort((x, y) => y.expectancyR - x.expectancyR);
  const positive = grid.filter((c) => c.expectancyR > 0);

  rows.push({
    asset: a.asset,
    price,
    fundamentals: {
      marketCapUsd: gecko.market_cap,
      marketCapRank: gecko.market_cap_rank,
      volume24hUsd: gecko.total_volume,
      volumeToMarketCapPct: (gecko.total_volume / gecko.market_cap) * 100,
      athUsd: gecko.ath,
      athDate: gecko.ath_date?.slice(0, 10),
      fromAthPct: (price / gecko.ath - 1) * 100,
      multipleToReclaimAth: gecko.ath / price,
      circulatingSupply: gecko.circulating_supply,
      maxSupply: gecko.max_supply,
      supplyNotCirculatingPct: gecko.max_supply
        ? (1 - gecko.circulating_supply / gecko.max_supply) * 100 : null,
      change7dPct: gecko.price_change_percentage_7d_in_currency,
      change30dPct: gecko.price_change_percentage_30d_in_currency,
      change1yPct: gecko.price_change_percentage_1y_in_currency,
    },
    technical: {
      rsi14: analysis.rsi14,
      atrPct,
      realizedVol30d: analysis.realizedVol30d,
      high30d: analysis.high30d,
      low30d: analysis.low30d,
      rangePosition30d: analysis.rangePosition30d,
      sma20: analysis.sma20,
      sma50: analysis.sma50,
      aboveSma20: price > analysis.sma20,
      aboveSma50: price > analysis.sma50,
      upDownVolumeRatio30d: analysis.upDownVolumeRatio30d,
      upDownVolumeRatio90d: analysis.upDownVolumeRatio90d,
      volumeZScoreCompleted: (daily.at(-2).quoteVolume - vMean) / vSd,
      base: base && {
        days: base.days, widthPct: base.widthPct, high: base.high, low: base.low,
        fromBaseTopPct: (price / base.high - 1) * 100,
      },
    },
    positioning: {
      underwaterPct: stage?.underwaterPct ?? null,
      vsVwapPct: stage?.vsVwapPct ?? null,
      volumeTrendPct: stage?.volumeTrendPct ?? null,
      concentrationPct: stage?.concentrationPct ?? null,
      stage: stage?.stage ?? null,
      funding: funding && {
        annualised7dPct: funding.annualised7dPct,
        annualisedPrior14dPct: funding.annualisedPrior14dPct,
        negativeSharePct: funding.negativeSharePct,
        cooling: funding.annualised7dPct < funding.annualisedPrior14dPct,
      },
      okxOpenInterest: okxOi,
      /** Open interest against a day's turnover — how levered the float is. */
      oiToVolume24h: okxOi ? okxOi.usd / gecko.total_volume : null,
    },
    btcLink: [30, 90].map(betaFor),
    weeklyRange: {
      weeks: weekRanges.length,
      p25Pct: pctile(weekRanges, 0.25),
      medianPct: median(weekRanges),
      p75Pct: pctile(weekRanges, 0.75),
      p90Pct: pctile(weekRanges, 0.90),
      /** A stop that clears half of all weeks, as a share of a daily range. */
      halfMedianWeekInAtr: (median(weekRanges) / 2) / atrPct,
    },
    geometry: {
      stopAtrsTried: STOP_ATRS,
      rrTried: RR_TARGETS,
      horizonsTried: HORIZONS,
      cellsTried: grid.length,
      positiveCells: positive.length,
      positiveSharePct: (positive.length / grid.length) * 100,
      medianExpectancyR: median(grid.map((c) => c.expectancyR)),
      best: sorted[0],
      runnerUp: sorted[1],
      worst: sorted[sorted.length - 1],
      /**
       * The best cell restated as the price levels it implies from here, so the
       * finding is usable rather than abstract.
       */
      bestAsPrices: {
        entry: price,
        stop: price * (1 - sorted[0].stopPct / 100),
        target: price * (1 + sorted[0].targetPct / 100),
      },
      grid,
    },
    candles: daily.length,
  });
}

console.log(JSON.stringify({
  measuredAt: new Date().toISOString(),
  method: {
    firstTouch: "Walked bar by bar. A bar touching both levels is charged to the stop.",
    overlap: "Windows overlap; effectiveN = n / horizon is the de-overlapped count.",
    gridWarning: "The grid is a multiple comparison. Cells tried, positive share and median cell are reported alongside the best cell, because the best of sixty cells is a winner by construction.",
    funding: "OKX. Binance futures is geo-blocked from this host, so no Binance funding, open interest or long/short ratio appears anywhere here.",
    scanClaim: "The scan under discussion quotes BTC at 64,800-65,200 and names 63,500-64,000 as the level that invalidates its watchlist.",
  },
  btc,
  rows,
}, null, 2));
