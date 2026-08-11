/**
 * Checking a reader's critique of an INJ long against measurement.
 *
 * The critique evaluates a specific ladder — entry 4.50–4.65, stop 4.25,
 * targets 5.08 / 5.50 / 6.20 — and grades it against the three-skill
 * framework. Two things need testing separately: whether that is the trade
 * this desk actually published (it is not), and whether the critique's
 * factual claims hold.
 *
 * Its central methodological claim is the one most worth testing: that public
 * data cannot supply an exact overhead-supply or volume-trend figure, so INJ
 * cannot be formally ranked. Both are computable from daily candles, which is
 * the whole argument of the "adjectives are not inputs" post.
 */

import { writeFileSync } from "node:fs";
import { analyzeAsset, atr, fetchKlines } from "../src/analysis.mjs";
import { walk } from "../src/signals.mjs";
import { stageOf } from "../src/stage.mjs";

const SYMBOL = "INJUSDT";
const candles = await fetchKlines(SYMBOL, { interval: "1d", limit: 1000 });
const analysis = await analyzeAsset(SYMBOL, { candles });
// Overhead supply and volume trend live in the stage module, not the analysis
// one — the same source the board itself uses for those two fields.
const stage = await stageOf("INJ").catch(() => null);
const price = analysis.price;
const atr14 = atr(candles, 14);
const atrPct = (atr14 / price) * 100;

const close = (c) => c.close;
const highs = candles.map((c) => c.high);
const lows = candles.map((c) => c.low);

/** All-time high in the fetched series, and the drawdown from it. */
const athIdx = highs.indexOf(Math.max(...highs));
const ath = highs[athIdx];
const athDate = new Date(candles[athIdx].openTime).toISOString().slice(0, 10);

/** The most recent swing high: highest high of the last 90 days. */
const last90 = candles.slice(-90);
const recentHigh = Math.max(...last90.map((c) => c.high));
const recentHighDate = new Date(
  last90[last90.map((c) => c.high).indexOf(recentHigh)].openTime,
).toISOString().slice(0, 10);

const rangeOf = (n) => {
  const w = candles.slice(-n);
  const lo = Math.min(...w.map((c) => c.low));
  const hi = Math.max(...w.map((c) => c.high));
  return { lo, hi, positionPct: ((price - lo) / (hi - lo)) * 100 };
};

/** Turnover: the exchange's own 24h quote volume, and the last daily bar. */
const ticker = await fetch(
  `https://data-api.binance.vision/api/v3/ticker/24hr?symbol=${SYMBOL}`,
).then((r) => r.json());

/** Trailing daily quote volume, to place the "$35–50M" claim. */
const quoteVol = candles.map((c) => c.quoteVolume);
const median = (xs) => [...xs].sort((a, b) => a - b)[xs.length >> 1];

/**
 * The reader's ladder, scored the same way the board scores its own: walk
 * bar by bar, a bar reaching both levels is charged to the stop, unresolved
 * positions close at the market.
 */
const ENTRY = 4.575;           // midpoint of the stated 4.50–4.65
const STOP = 4.25;
const stopPct = ((ENTRY - STOP) / ENTRY) * 100;
const targets = { TP1: 5.08, TP2: 5.50, TP3: 6.20 };

const theirs = {};
for (const [name, tp] of Object.entries(targets)) {
  const targetPct = ((tp - ENTRY) / ENTRY) * 100;
  const rr = targetPct / stopPct;
  for (const horizon of [5, 10, 30]) {
    const r = walk(candles.slice(-365), { direction: "long", stopPct, targetPct, horizon });
    theirs[`${name} · ${horizon}d`] = {
      rr: Number(rr.toFixed(2)),
      hitPct: Number(r.hitPct.toFixed(1)),
      stoppedPct: Number(r.stoppedPct.toFixed(1)),
      unresolvedPct: Number(r.unresolvedPct.toFixed(1)),
      expectancyR: Number(r.expectancyR.toFixed(3)),
      effectiveN: Number(r.effectiveN.toFixed(1)),
      breakEvenHitPct: Number((100 / (1 + rr)).toFixed(1)),
    };
  }
}

/** The board's own geometry, for the side-by-side. */
const boardStopPct = 11.187210677318477;
const boardTargetPct = 33.56163203195543;
const boardR = walk(candles.slice(-365), {
  direction: "long", stopPct: boardStopPct, targetPct: boardTargetPct, horizon: 30,
});

/** BTC beta and shared variance, 30 days of daily returns. */
const btc = await fetchKlines("BTCUSDT", { interval: "1d", limit: 200 });
const rets = (cs) => cs.slice(1).map((c, i) => Math.log(close(c) / close(cs[i])));
const a = rets(candles).slice(-30);
const b = rets(btc).slice(-30);
const mean = (xs) => xs.reduce((s, x) => s + x, 0) / xs.length;
const ma = mean(a), mb = mean(b);
const cov = a.reduce((s, x, i) => s + (x - ma) * (b[i] - mb), 0) / (a.length - 1);
const varB = b.reduce((s, x) => s + (x - mb) ** 2, 0) / (b.length - 1);
const sdA = Math.sqrt(a.reduce((s, x) => s + (x - ma) ** 2, 0) / (a.length - 1));
const beta = cov / varB;
const r = cov / (sdA * Math.sqrt(varB));

const out = {
  measuredAt: new Date().toISOString(),
  price,
  atrPct,
  claims: {
    "price 4.44–4.48": price >= 4.40 && price <= 4.52,
    "ATH about 52.6": Math.abs(ath - 52.6) / 52.6 < 0.1,
    "down more than 91% from ATH": (1 - price / ath) * 100 > 91,
    "recent high about 7.3": Math.abs(recentHigh - 7.3) / 7.3 < 0.1,
    "24h volume 35–50M": ticker.quoteVolume >= 35e6 && ticker.quoteVolume <= 50e6,
    "range position is low": rangeOf(30).positionPct < 35,
    "overhead is medium-high": stage?.underwaterPct != null && stage.underwaterPct < 70,
    "volume trend cannot be computed from public data": false,
    "overhead cannot be computed from public data": false,
  },
  ath: { price: ath, date: athDate, drawdownPct: (1 - price / ath) * 100 },
  recentHigh: { price: recentHigh, date: recentHighDate, fromHighPct: (price / recentHigh - 1) * 100 },
  range20d: rangeOf(20),
  range30d: rangeOf(30),
  turnover: {
    ticker24hQuoteUsd: Number(ticker.quoteVolume),
    lastDailyBarQuoteUsd: quoteVol.at(-1),
    median30dQuoteUsd: median(quoteVol.slice(-30)),
    boardFieldUsed: analysis.quoteVolumeLatest ?? null,
  },
  measured: {
    underwaterPct: stage?.underwaterPct ?? null,
    volumeTrendPct: stage?.volumeTrendPct ?? null,
    stage: stage?.stage ?? null,
    rangePosition30d: analysis.rangePosition30d,
    rsi14: analysis.rsi14,
    change7dPct: analysis.change7dPct,
    change30dPct: analysis.change30dPct,
  },
  btc: { beta, r, rSquaredPct: r * r * 100 },
  theirLadder: {
    entry: ENTRY, stop: STOP, stopPct,
    stopInAtr: stopPct / atrPct,
    cells: theirs,
  },
  boardCall: {
    entry: 4.481, stop: 3.9797010895493594, target: 5.984896731351923,
    stopPct: boardStopPct, targetPct: boardTargetPct,
    stopInAtr: boardStopPct / atrPct,
    hitPct: boardR.hitPct, expectancyR: boardR.expectancyR, effectiveN: boardR.effectiveN,
  },
};

writeFileSync("research/inj-check.json", `${JSON.stringify(out, null, 2)}\n`);
console.log(JSON.stringify(out, null, 2));
