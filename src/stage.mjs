/**
 * Where in its life cycle is a move?
 *
 * The metric most people reach for — what share of the money that traded is
 * now underwater — reads near zero both for a move still recruiting buyers and
 * for one that has run out of them. It cannot tell those apart. What separates
 * them is whether participation is still arriving: recent turnover measured
 * against the turnover that came before it.
 *
 * Everything here derives from daily candles, so it costs one fetch and can be
 * reproduced by hand from a candle export.
 */

import { fetchKlines, rsi } from "./analysis.mjs";

export const DEFAULT_DAYS = 30;

/** Days of turnover compared against the rest of the window. */
const RECENT_DAYS = 3;

/**
 * Classification thresholds. These are calibration starting points, not laws —
 * they were chosen to separate observed cases legibly, and any serious use
 * should re-fit them per asset class.
 */
export const THRESHOLDS = {
  hangoverDrawdownPct: -60,
  breakdownVsVwapPct: -15,
  breakdownUnderwaterPct: 70,
  liveUnderwaterPct: 25,
  movePricePct: 5,
  drainingVolumePct: -20,
  expandingVolumePct: 20,
  quietConcentrationPct: 20,
  quietVolumeSwingPct: 40,
};

export const STAGE = {
  QUIET: "1 quiet",
  EXPANSION: "2 expansion",
  EXHAUSTION: "3 exhaustion",
  BREAKDOWN: "4 breakdown",
  HANGOVER: "5 hangover",
  MIXED: "mixed",
};

const NOTE = {
  [STAGE.QUIET]: "turnover is structural, no event in progress",
  [STAGE.EXPANSION]: "price and participation rising together",
  [STAGE.EXHAUSTION]: "price still rising while participation drains",
  [STAGE.BREAKDOWN]: "price below the window VWAP, most money underwater",
  [STAGE.HANGOVER]: "deep drawdown and the liquidity has left",
  [STAGE.MIXED]: "no clean stage; read the metrics directly",
};

const typicalPrice = (k) => (k.high + k.low + k.close) / 3;

/**
 * The five numbers the classification runs on.
 *
 * @param {{high:number,low:number,close:number,quoteVolume:number}[]} candles
 *   Daily candles, oldest first, already trimmed to the window.
 * @param {number} [price] Current price; defaults to the last close.
 */
export function computeStageMetrics(candles, price = candles.at(-1)?.close) {
  if (!candles?.length) throw new Error("Cannot stage an empty candle series.");
  if (candles.length <= RECENT_DAYS) {
    throw new Error(`Need more than ${RECENT_DAYS} candles to compare recent turnover against prior.`);
  }

  const turnover = candles.reduce((s, k) => s + k.quoteVolume, 0);
  if (turnover <= 0) throw new Error("Cannot stage a series with no turnover.");

  const vwap = candles.reduce((s, k) => s + typicalPrice(k) * k.quoteVolume, 0) / turnover;

  // Share of turnover done at a typical price above where it trades now — a
  // proxy for money currently at a loss.
  const above = candles
    .filter((k) => typicalPrice(k) > price)
    .reduce((s, k) => s + k.quoteVolume, 0);

  const recent = candles.slice(-RECENT_DAYS);
  const prior = candles.slice(0, -RECENT_DAYS);
  const recentMean = recent.reduce((s, k) => s + k.quoteVolume, 0) / recent.length;
  const priorMean = prior.reduce((s, k) => s + k.quoteVolume, 0) / prior.length;

  const busiest = [...candles].sort((a, b) => b.quoteVolume - a.quoteVolume).slice(0, 3);
  const high = Math.max(...candles.map((k) => k.high));
  const anchor = candles.at(-(RECENT_DAYS + 1)).close;

  return {
    price,
    vwap,
    turnover,
    underwaterPct: (above / turnover) * 100,
    vsVwapPct: ((price - vwap) / vwap) * 100,
    volumeTrendPct: priorMean > 0 ? ((recentMean - priorMean) / priorMean) * 100 : 0,
    recentPricePct: anchor > 0 ? ((price - anchor) / anchor) * 100 : 0,
    concentrationPct: (busiest.reduce((s, k) => s + k.quoteVolume, 0) / turnover) * 100,
    drawdownPct: ((price - high) / high) * 100,
    high,
    days: candles.length,
  };
}

/**
 * First matching rule wins, so the order encodes precedence: a finished move is
 * classified as finished before any judgement about live participation.
 *
 * @returns {{stage: string, note: string}}
 */
export function classifyStage(m, t = THRESHOLDS) {
  const live = m.underwaterPct < t.liveUnderwaterPct;
  const moving = m.recentPricePct > t.movePricePct;

  let stage;
  if (m.drawdownPct < t.hangoverDrawdownPct && m.volumeTrendPct < 0) {
    stage = STAGE.HANGOVER;
  } else if (m.vsVwapPct < t.breakdownVsVwapPct && m.underwaterPct > t.breakdownUnderwaterPct) {
    stage = STAGE.BREAKDOWN;
  } else if (live && moving && m.volumeTrendPct < t.drainingVolumePct) {
    stage = STAGE.EXHAUSTION;
  } else if (live && moving && m.volumeTrendPct > t.expandingVolumePct) {
    stage = STAGE.EXPANSION;
  } else if (
    m.concentrationPct < t.quietConcentrationPct &&
    Math.abs(m.volumeTrendPct) < t.quietVolumeSwingPct
  ) {
    stage = STAGE.QUIET;
  } else {
    stage = STAGE.MIXED;
  }

  return { stage, note: NOTE[stage] };
}

/**
 * Accepts BTC, btc or BTCUSDT and returns a Binance spot symbol.
 *
 * BTC and ETH are quote assets as well as base assets, so a bare "BTC" must not
 * be mistaken for a complete pair — a quote suffix only counts when something
 * precedes it.
 */
export function normalizeSymbol(input) {
  const s = String(input).trim().toUpperCase();
  if (!s) throw new Error("Empty symbol.");
  return /^.{2,}(USDT|USDC|BTC|ETH|FDUSD)$/.test(s) ? s : `${s}USDT`;
}

/**
 * @param {string} symbol
 * @param {{days?: number, fetchImpl?: Function, candles?: object[]}} [opts]
 */
export async function stageOf(symbol, { days = DEFAULT_DAYS, fetchImpl, candles } = {}) {
  const sym = normalizeSymbol(symbol);
  const series =
    candles ?? (await fetchKlines(sym, { limit: Math.max(days + 30, 120), fetchImpl }));
  const window = series.slice(-days);

  const metrics = computeStageMetrics(window);
  const { stage, note } = classifyStage(metrics);

  // RSI has its own fixed lookback, so it is measured on everything fetched
  // rather than on the display window — a 14-day window would otherwise leave
  // RSI-14 undefined. It stays null when even that is too short to define it.
  const rsi14 = rsi(series.map((k) => k.close));

  return {
    symbol: sym,
    rsi14: Number.isFinite(rsi14) ? rsi14 : null,
    ...metrics,
    stage,
    note,
  };
}

const pad = (s, n) => String(s).padStart(n);
const signed = (v, d = 1) => (v >= 0 ? "+" : "") + v.toFixed(d);

export function formatStage(rows, { days = DEFAULT_DAYS } = {}) {
  const lines = [
    `Move stage — ${days}d window, Binance spot daily candles`,
    "",
    "  PAIR        under%   vsVWAP    vol_trend   price_3d   from_high   top3%    RSI",
  ];

  for (const r of rows) {
    lines.push(
      "  " +
        r.symbol.replace(/USDT$/, "").padEnd(10) +
        pad(r.underwaterPct.toFixed(1), 6) +
        pad(signed(r.vsVwapPct), 9) +
        pad(signed(r.volumeTrendPct), 12) +
        pad(signed(r.recentPricePct), 11) +
        pad(signed(r.drawdownPct), 12) +
        pad(r.concentrationPct.toFixed(1), 8) +
        pad(Number.isFinite(r.rsi14) ? r.rsi14.toFixed(0) : "—", 7),
    );
  }

  lines.push("", "Stage");
  for (const r of rows) lines.push(`  ${r.symbol.replace(/USDT$/, "").padEnd(10)} ${r.stage} — ${r.note}`);

  lines.push(
    "",
    "under%    share of window turnover done above the current price",
    "vol_trend last 3 days' average turnover vs the prior days'",
    "top3%     share of turnover in the three busiest days",
    "",
    "A stage is a risk gradient, not an entry signal. Thresholds are starting",
    "points to calibrate, and stage 3 can persist or resume higher.",
  );
  return lines.join("\n");
}
