/**
 * ICP, the whole picture, and the question the breakout actually raises.
 *
 * A pair that has just printed a four-sigma volume day at the top of its month
 * does not need another description of how clean it looks. It needs the one
 * measurement nobody takes: **what has historically happened next.**
 *
 * So the centre of this file is a conditional base rate. Take every past day
 * where volume ran hot and price sat high in its own range — the state ICP is
 * in right now — and walk forward. Compare against the unconditional rate over
 * the same candles. If the state carries information, the two differ; if it does
 * not, then "clean structure" is a description of the past with no claim on the
 * future, and the trade has to be justified some other way.
 *
 * Three other things are measured because they decide whether a plan is
 * executable rather than whether it is attractive:
 *
 *   - Order book depth. A setup you cannot exit is not a setup. Depth within a
 *     few percent of mid is the only honest read on what size the plan supports,
 *     and it is free from the same endpoint the prices come from.
 *
 *   - Supply. An asset with no maximum supply dilutes its holders on a schedule,
 *     and the rate is checkable rather than a matter of opinion.
 *
 *   - Drawdown inside a hold. Expectancy says whether a plan pays; it says
 *     nothing about how far underwater you sit on the way. The worst excursion
 *     before a winning trade resolves is what actually makes people abandon a
 *     correct plan, so it is measured separately.
 *
 * Reproducible:
 *   node research/icp-full.mjs > research/icp-full.json
 */

import {
  analyzeAsset, atr, correlation, fetchKlines, logReturns, mean, rsi, sma,
} from "../src/analysis.mjs";
import { findBase } from "../src/pbbe.mjs";
import { stageOf } from "../src/stage.mjs";
import { fetchFundingHistory } from "../src/market.mjs";

const SYMBOL = "ICPUSDT";
const ASSET = "ICP";

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

const daily = await retry(() => fetchKlines(SYMBOL, { interval: "1d", limit: 1000 }));
const h4 = await retry(() => fetchKlines(SYMBOL, { interval: "4h", limit: 500 }));
const weekly = (await retry(() => fetchKlines(SYMBOL, { interval: "1w", limit: 105 }))).slice(0, -1);
const btcDaily = await retry(() => fetchKlines("BTCUSDT", { interval: "1d", limit: 400 }));
const btcAnalysis = await retry(() => analyzeAsset("BTCUSDT"));
const analysis = await retry(() => analyzeAsset(SYMBOL));
const stage = await retry(() => stageOf(ASSET)).catch(() => null);
const funding = await retry(() => fetchFundingHistory(`${ASSET}-USDT-SWAP`)).catch(() => null);

const price = analysis.price;
const atrPct = (atr(daily, 14) / price) * 100;

const gecko = await retry(async () => {
  const res = await fetch(
    "https://api.coingecko.com/api/v3/coins/markets?vs_currency=usd&ids=internet-computer"
    + "&price_change_percentage=7d,30d,1y",
    { signal: AbortSignal.timeout(25_000) });
  if (!res.ok) throw new Error(`coingecko: HTTP ${res.status}`);
  return (await res.json())[0];
});

/**
 * Supply, checked rather than assumed.
 *
 * A null max supply is not a missing field — it is the answer. It means holders
 * are diluted on an ongoing schedule, and the inflation rate belongs in the
 * risk column of any multi-month plan.
 */
const supplyDetail = await retry(async () => {
  const res = await fetch(
    "https://api.coingecko.com/api/v3/coins/internet-computer"
    + "?localization=false&tickers=false&market_data=true&community_data=false&developer_data=false",
    { signal: AbortSignal.timeout(25_000) });
  if (!res.ok) throw new Error(`coingecko detail: HTTP ${res.status}`);
  const j = await res.json();
  return {
    circulating: j.market_data?.circulating_supply ?? null,
    total: j.market_data?.total_supply ?? null,
    max: j.market_data?.max_supply ?? null,
    genesisDate: j.genesis_date ?? null,
  };
}).catch(() => null);

/**
 * Order book depth — the executability question.
 *
 * Notional resting within a given distance of mid, both sides. A plan whose
 * size exceeds the book inside its own stop distance is a plan that moves the
 * market against itself on the way out.
 */
const book = await (async () => {
  try {
    const res = await fetch(
      `https://data-api.binance.vision/api/v3/depth?symbol=${SYMBOL}&limit=1000`,
      { signal: AbortSignal.timeout(20_000) });
    if (!res.ok) throw new Error(`depth: HTTP ${res.status}`);
    const j = await res.json();
    const bids = j.bids.map(([p, q]) => [Number(p), Number(q)]);
    const asks = j.asks.map(([p, q]) => [Number(p), Number(q)]);
    const mid = (bids[0][0] + asks[0][0]) / 2;
    const within = (pct) => ({
      pct,
      bidUsd: bids.filter(([p]) => p >= mid * (1 - pct / 100)).reduce((s, [p, q]) => s + p * q, 0),
      askUsd: asks.filter(([p]) => p <= mid * (1 + pct / 100)).reduce((s, [p, q]) => s + p * q, 0),
    });
    return {
      mid,
      spreadPct: ((asks[0][0] - bids[0][0]) / mid) * 100,
      depth: [0.5, 1, 2, 5].map(within),
    };
  } catch { return null; }
})();

/* ---------- structure across timeframes ---------- */

const closesD = daily.map((c) => c.close);
const closes4 = h4.map((c) => c.close);
const closesW = weekly.map((c) => c.close);
const base = findBase(daily.slice(-60));

const structure = {
  daily: {
    rsi14: rsi(closesD, 14), sma20: sma(closesD, 20), sma50: sma(closesD, 50),
    sma200: sma(closesD, 200), atrPct,
    aboveAll: price > sma(closesD, 20) && price > sma(closesD, 50) && price > sma(closesD, 200),
    goldenCross: sma(closesD, 50) > sma(closesD, 200),
  },
  h4: { rsi14: rsi(closes4, 14), sma50: sma(closes4, 50), sma200: sma(closes4, 200) },
  weekly: { rsi14: rsi(closesW, 14), sma20: sma(closesW, 20), sma50: sma(closesW, 50) },
  base: base && {
    days: base.days, widthPct: base.widthPct, high: base.high, low: base.low,
    fromBaseTopPct: (price / base.high - 1) * 100,
  },
  high30d: analysis.high30d, low30d: analysis.low30d,
  rangePosition30d: analysis.rangePosition30d,
  high90d: Math.max(...daily.slice(-90).map((c) => c.high)),
  low90d: Math.min(...daily.slice(-90).map((c) => c.low)),
  high365d: Math.max(...daily.slice(-365).map((c) => c.high)),
};

/* ---------- the conditional: what follows a state like today's ---------- */

const vz = (i) => {
  const win = daily.slice(Math.max(0, i - 30), i).map((c) => c.quoteVolume);
  if (win.length < 10) return NaN;
  const m = win.reduce((a, b) => a + b, 0) / win.length;
  const sd = Math.sqrt(win.reduce((a, b) => a + (b - m) ** 2, 0) / (win.length - 1));
  return (daily[i].quoteVolume - m) / sd;
};
const rangePosAt = (i) => {
  const win = daily.slice(Math.max(0, i - 30), i + 1);
  const lo = Math.min(...win.map((c) => c.low)), hi = Math.max(...win.map((c) => c.high));
  return ((daily[i].close - lo) / (hi - lo)) * 100;
};

const todayVolZ = (() => {
  const win = daily.slice(-31, -1).map((c) => c.quoteVolume);
  const m = win.reduce((a, b) => a + b, 0) / win.length;
  const sd = Math.sqrt(win.reduce((a, b) => a + (b - m) ** 2, 0) / (win.length - 1));
  return (daily.at(-2).quoteVolume - m) / sd;
})();

/**
 * Forward outcome from a given day, at fixed horizons.
 *
 * Deliberately plain: the return from close to close, plus the best and worst
 * excursion in between. No stop, no target — the point is to see the shape of
 * what follows the state, not to score a plan.
 */
const forward = (i, horizon) => {
  const entry = daily[i].close;
  const win = daily.slice(i + 1, i + 1 + horizon);
  if (win.length < horizon) return null;
  return {
    endPct: (win.at(-1).close / entry - 1) * 100,
    bestPct: (Math.max(...win.map((c) => c.high)) / entry - 1) * 100,
    worstPct: (Math.min(...win.map((c) => c.low)) / entry - 1) * 100,
  };
};

const HORIZONS = [5, 10, 30];
const conditionalStates = [
  { key: "hotVolumeHighInRange", label: "volZ ≥ 3 and range position ≥ 85 — today's state",
    test: (i) => vz(i) >= 3 && rangePosAt(i) >= 85 },
  { key: "hotVolume", label: "volZ ≥ 3, any range position", test: (i) => vz(i) >= 3 },
  { key: "highInRange", label: "range position ≥ 85, any volume", test: (i) => rangePosAt(i) >= 85 },
];

const conditionals = conditionalStates.map((s) => {
  const byHorizon = HORIZONS.map((h) => {
    const hits = [], all = [];
    for (let i = 30; i < daily.length - h; i++) {
      const f = forward(i, h);
      if (!f) continue;
      all.push(f);
      if (s.test(i)) hits.push(f);
    }
    const stat = (rows) => rows.length ? {
      n: rows.length,
      medianEndPct: median(rows.map((r) => r.endPct)),
      higherPct: (rows.filter((r) => r.endPct > 0).length / rows.length) * 100,
      medianBestPct: median(rows.map((r) => r.bestPct)),
      medianWorstPct: median(rows.map((r) => r.worstPct)),
      p10EndPct: pctile(rows.map((r) => r.endPct), 0.10),
      p90EndPct: pctile(rows.map((r) => r.endPct), 0.90),
    } : null;
    const c = stat(hits), b = stat(all);
    return {
      horizonDays: h,
      conditional: c,
      baseline: b,
      /** Difference in the share that ends higher — the readable comparison. */
      edgePp: c && b ? c.higherPct - b.higherPct : null,
      /** De-overlapped, because these windows share candles. */
      effectiveN: c ? c.n / h : null,
      sigmasDeOverlapped: c && b
        ? ((c.higherPct - b.higherPct) / 100)
          / Math.sqrt(((b.higherPct / 100) * (1 - b.higherPct / 100)) / (c.n / h))
        : null,
    };
  });
  return { key: s.key, label: s.label, byHorizon };
});

/* ---------- drawdown inside a winning hold ---------- */

/**
 * How far underwater a correct trade goes before it resolves.
 *
 * Expectancy is silent on this and it is what makes people abandon a plan that
 * was working. Measured only on episodes that eventually reached the target, so
 * it answers "if I am right, how bad does it get first".
 */
const excursionOnWinners = (upPct, downPct, horizon) => {
  const worst = [];
  for (let i = 0; i < daily.length - horizon; i++) {
    const entry = daily[i].close;
    const target = entry * (1 + upPct / 100);
    const stop = entry * (1 - downPct / 100);
    let low = entry;
    for (let j = i + 1; j <= i + horizon; j++) {
      low = Math.min(low, daily[j].low);
      if (daily[j].low <= stop) break;
      if (daily[j].high >= target) { worst.push((low / entry - 1) * 100); break; }
    }
  }
  return worst.length
    ? { winners: worst.length, medianWorstPct: median(worst), p90WorstPct: pctile(worst, 0.10) }
    : null;
};

/** The geometry post 67's grid search selected: 4 daily ranges, 3:1, 90 days. */
const PLAN_STOP_ATR = 4, PLAN_RR = 3, PLAN_HORIZON = 90;
const planStopPct = PLAN_STOP_ATR * atrPct;
const planTargetPct = planStopPct * PLAN_RR;

const weekRanges = weekly.filter((c) => c.low > 0).map((c) => ((c.high - c.low) / c.low) * 100);

const btcLink = [30, 90].map((days) => {
  const x = logReturns(btcDaily.map((c) => c.close).slice(-(days + 1)));
  const y = logReturns(closesD.slice(-(days + 1)));
  const n = Math.min(x.length, y.length);
  const xs = x.slice(-n), ys = y.slice(-n);
  const mx = mean(xs), my = mean(ys);
  const cov = xs.reduce((s, v, i) => s + (v - mx) * (ys[i] - my), 0) / (n - 1);
  const varx = xs.reduce((s, v) => s + (v - mx) ** 2, 0) / (n - 1);
  const r = correlation(ys, xs);
  return { days, beta: cov / varx, r, varianceExplainedPct: r ** 2 * 100 };
});

console.log(JSON.stringify({
  measuredAt: new Date().toISOString(),
  symbol: SYMBOL,
  price,
  method: {
    candles: daily.length,
    conditional: "Forward returns from days matching a state, against the unconditional rate over the same candles. Overlapping windows are de-overlapped by the horizon before any sigma.",
    excursion: "Worst drawdown measured only on episodes that reached the target, so it answers how bad it gets when the trade is right.",
    unavailable: "Binance futures is geo-blocked from this host. Funding and open interest are OKX only, labelled as such. No liquidation feed at any price this desk pays.",
  },
  fundamentals: {
    marketCapUsd: gecko.market_cap,
    marketCapRank: gecko.market_cap_rank,
    volume24hUsd: gecko.total_volume,
    volumeToMarketCapPct: (gecko.total_volume / gecko.market_cap) * 100,
    athUsd: gecko.ath,
    athDate: gecko.ath_date?.slice(0, 10),
    fromAthPct: (price / gecko.ath - 1) * 100,
    multipleToReclaimAth: gecko.ath / price,
    change7dPct: gecko.price_change_percentage_7d_in_currency,
    change30dPct: gecko.price_change_percentage_30d_in_currency,
    change1yPct: gecko.price_change_percentage_1y_in_currency,
    supply: supplyDetail,
    hasMaxSupply: Boolean(supplyDetail?.max),
  },
  structure,
  todayVolZ,
  positioning: {
    underwaterPct: stage?.underwaterPct ?? null,
    vsVwapPct: stage?.vsVwapPct ?? null,
    volumeTrendPct: stage?.volumeTrendPct ?? null,
    concentrationPct: stage?.concentrationPct ?? null,
    stage: stage?.stage ?? null,
    upDownVolumeRatio30d: analysis.upDownVolumeRatio30d,
    upDownVolumeRatio90d: analysis.upDownVolumeRatio90d,
    funding: funding && {
      annualised7dPct: funding.annualised7dPct,
      annualisedPrior14dPct: funding.annualisedPrior14dPct,
      negativeSharePct: funding.negativeSharePct,
    },
  },
  book,
  btcLink,
  btcContext: {
    price: btcAnalysis.price,
    sma50: sma(btcDaily.map((c) => c.close), 50),
    sma200: sma(btcDaily.map((c) => c.close), 200),
    rangePosition30d: btcAnalysis.rangePosition30d,
    rsi14: btcAnalysis.rsi14,
  },
  weeklyRange: {
    weeks: weekRanges.length,
    p25Pct: pctile(weekRanges, 0.25),
    medianPct: median(weekRanges),
    p75Pct: pctile(weekRanges, 0.75),
    p90Pct: pctile(weekRanges, 0.90),
  },
  conditionals,
  plan: {
    stopAtr: PLAN_STOP_ATR, rr: PLAN_RR, horizonDays: PLAN_HORIZON,
    entry: price,
    stopPct: planStopPct, stop: price * (1 - planStopPct / 100),
    targetPct: planTargetPct, target: price * (1 + planTargetPct / 100),
    breakevenWinRatePct: 100 / (1 + PLAN_RR),
    /** Sizing so a full stop costs exactly 1% of the account. */
    positionUsdPer1000: 1000 * 0.01 / (planStopPct / 100),
    /** Leverage above this liquidates before the stop can fill. */
    maxLeverage: 100 / planStopPct,
    excursion: excursionOnWinners(planTargetPct, planStopPct, PLAN_HORIZON),
  },
}, null, 2));
