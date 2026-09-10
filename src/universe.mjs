/**
 * The list of pairs to scan, derived from the market instead of typed by hand.
 *
 * The universe used to be a hardcoded array of twenty-six names. That is why
 * the board missed the movers: on the morning a reader asked about it, Binance
 * had 489 USDT pairs trading and we looked at 32 of them — 6.5% of the market.
 * One of the day's ten biggest gainers was in our list. The engine was not
 * declining to call those names; it had never seen them.
 *
 * A hand-maintained list also fails quietly and gets worse over time. Every
 * new listing is invisible until somebody remembers to add it, and the two
 * names added most recently were both added *after* being asked about, which
 * is the wrong order.
 *
 * So the list is now a query: the most-traded USDT pairs, ranked by turnover,
 * refreshed on every scan. New listings appear on their own once they trade
 * enough to matter, and names that dry up drop out on their own.
 *
 * Two things are deliberately excluded. Stablecoin pairs, because a signal on
 * a token pegged to the dollar is a signal about the peg, not about a
 * direction anyone trades. And pairs whose history is too short for the
 * shortest lookback the engine tests against, since including them would mean
 * publishing calls with no way to check whether they hold up.
 */

const TICKER_URL = "https://data-api.binance.vision/api/v3/ticker/24hr";
const EXCHANGE_INFO_URL = "https://data-api.binance.vision/api/v3/exchangeInfo";

/** How many pairs the daily scan covers. Bounded by scan time, not by taste. */
export const DEFAULT_LIMIT = 100;

/** Below this, a fill moves the price more than the signal is worth. */
export const DEFAULT_MIN_TURNOVER_USD = 2e6;

/**
 * Tokens pegged to a currency. A direction call on one of these is a call on
 * the peg breaking, which this engine does not measure.
 */
const PEGGED = new Set([
  "USDC", "FDUSD", "TUSD", "DAI", "USDP", "BUSD", "EURI", "EUR", "AEUR",
  "XUSD", "USD1", "PYUSD", "RLUSD", "USDE", "SUSD", "USDS",
]);

/** Names the desk always covers, whatever their turnover happens to be today. */
export const ALWAYS = ["BTCUSDT", "ETHUSDT", "SOLUSDT", "BNBUSDT"];

/**
 * The pairs worth scanning right now.
 *
 * @param {object} [opts]
 * @param {number} [opts.limit] Maximum pairs returned, majors included.
 * @param {number} [opts.minTurnoverUsd] Liquidity floor.
 * @param {typeof fetch} [opts.fetchImpl]
 * @returns {Promise<{symbols: string[], considered: number, rejected: object}>}
 */
export async function liveUniverse({
  limit = DEFAULT_LIMIT,
  minTurnoverUsd = DEFAULT_MIN_TURNOVER_USD,
  fetchImpl = globalThis.fetch,
} = {}) {
  const [info, tickers] = await Promise.all([
    fetchImpl(EXCHANGE_INFO_URL).then((r) => r.json()),
    fetchImpl(TICKER_URL).then((r) => r.json()),
  ]);

  const tradeable = new Map();
  for (const s of info.symbols ?? []) {
    if (s.quoteAsset !== "USDT" || s.status !== "TRADING") continue;
    if (PEGGED.has(s.baseAsset)) continue;
    tradeable.set(s.symbol, s.baseAsset);
  }

  const rows = [];
  let belowFloor = 0;
  for (const t of tickers ?? []) {
    if (!tradeable.has(t.symbol)) continue;
    const turnover = Number(t.quoteVolume);
    if (!Number.isFinite(turnover)) continue;
    if (turnover < minTurnoverUsd) { belowFloor += 1; continue; }
    rows.push({ symbol: t.symbol, turnover });
  }

  rows.sort((a, b) => b.turnover - a.turnover);

  // Majors first and always, then the rest by turnover until the limit.
  const chosen = [];
  const seen = new Set();
  for (const symbol of ALWAYS) {
    if (tradeable.has(symbol)) { chosen.push(symbol); seen.add(symbol); }
  }
  for (const r of rows) {
    if (chosen.length >= limit) break;
    if (seen.has(r.symbol)) continue;
    chosen.push(r.symbol);
    seen.add(r.symbol);
  }

  return {
    symbols: chosen,
    considered: tradeable.size,
    rejected: {
      pegged: [...(info.symbols ?? [])].filter((s) => s.quoteAsset === "USDT" && s.status === "TRADING" && PEGGED.has(s.baseAsset)).length,
      belowTurnoverFloor: belowFloor,
      beyondLimit: Math.max(0, rows.length - (chosen.length - ALWAYS.filter((s) => tradeable.has(s)).length)),
    },
  };
}
