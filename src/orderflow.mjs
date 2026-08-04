/**
 * Who is crossing the spread.
 *
 * Every other channel in this repo reads candles: what price did, and how much
 * traded. None of them can see *which side initiated*. A candle that closes
 * flat on heavy volume looks identical whether buyers lifted every offer and
 * were absorbed, or sellers hit every bid and were absorbed — and those are
 * opposite situations.
 *
 * Binance publishes it. Each aggregated trade carries `m`: true when the buyer
 * was the maker, which means the *seller* crossed the spread. Summing quote
 * value by side gives the taker imbalance directly, with no model in between.
 *
 * The idea came from reading someone else's TradingView panel, which leads with
 * a "Lực Mua/Bán" figure. That panel gives no method and no base rate, so the
 * number itself is unusable — but the channel it points at is real and free,
 * and this measures it in a way that can be checked.
 */

const SPOT_BASE = "https://data-api.binance.vision/api/v3";
const TIMEOUT_MS = 20_000;
const MAX_TRADES = 60_000;

/**
 * Taker buy/sell split over a window, walked page by page.
 *
 * Bounded by MAX_TRADES because a busy hour on a major pair can run to
 * hundreds of thousands of prints, and a scanner must not hang on one symbol.
 * When the cap is hit the result says so rather than quietly reporting a
 * partial window as if it were the whole thing.
 */
export async function takerFlow(
  symbol,
  { minutes = 60, fetchImpl = globalThis.fetch, now = Date.now() } = {},
) {
  const start = now - minutes * 60_000;
  let cursor = start;
  let buyQuote = 0;
  let sellQuote = 0;
  let trades = 0;
  let truncated = false;

  while (true) {
    const url =
      `${SPOT_BASE}/aggTrades?symbol=${symbol}` +
      `&startTime=${cursor}&endTime=${Math.min(cursor + 3_600_000, now)}&limit=1000`;
    const res = await fetchImpl(url, { signal: AbortSignal.timeout(TIMEOUT_MS) });
    if (!res.ok) throw new Error(`aggTrades ${symbol}: HTTP ${res.status}`);
    const page = await res.json();
    if (!Array.isArray(page) || !page.length) break;

    for (const t of page) {
      const quote = Number(t.p) * Number(t.q);
      if (!Number.isFinite(quote)) continue;
      // m === true: the buyer was the maker, so the seller took the offer.
      if (t.m) sellQuote += quote;
      else buyQuote += quote;
      trades++;
    }

    const last = page.at(-1).T;
    if (page.length < 1000 || last >= now) break;
    if (trades >= MAX_TRADES) { truncated = true; break; }
    cursor = last + 1;
  }

  const total = buyQuote + sellQuote;
  if (!total) return null;

  return {
    symbol,
    minutes,
    trades,
    truncated,
    buyQuote,
    sellQuote,
    buySharePct: (buyQuote / total) * 100,
    /** Positive means buyers crossed the spread for more value than sellers. */
    imbalancePct: ((buyQuote - sellQuote) / total) * 100,
    averageTradeUsd: total / trades,
  };
}

/**
 * Whether the flow agrees with the price it produced.
 *
 * This is the reading worth having, and the one a raw percentage cannot give.
 * Sellers dominating while price holds is absorption: someone is taking the
 * other side in size without needing to move the quote. The mirror — buyers
 * dominating while price fails to rise — is distribution into strength.
 *
 * Named as descriptions, not signals. Nothing here has been measured against
 * outcomes, and the moment one of these strings is treated as a trade trigger
 * it becomes the same unfounded claim this repo keeps having to retract.
 */
export function flowVsPrice(flow, changePct, { minImbalance = 10, minMove = 0.15 } = {}) {
  if (!flow || !Number.isFinite(changePct)) return null;
  const sellers = flow.imbalancePct <= -minImbalance;
  const buyers = flow.imbalancePct >= minImbalance;
  const rose = changePct >= minMove;
  const fell = changePct <= -minMove;

  if (sellers && rose) return "absorption: sellers crossed the spread and price rose anyway";
  if (buyers && fell) return "distribution: buyers crossed the spread and price fell anyway";
  if (sellers && fell) return "agreement: sellers led and price followed";
  if (buyers && rose) return "agreement: buyers led and price followed";
  return "no read: neither the flow nor the move is decisive";
}

const f1 = (v) => (Number.isFinite(v) ? v.toFixed(1) : "—");

export function formatFlow(flow, changePct) {
  if (!flow) return "No trades in the window.";
  const lines = [
    `Order flow — ${flow.symbol}, last ${flow.minutes} minutes${flow.truncated ? " (capped)" : ""}`,
    `  trades        ${flow.trades.toLocaleString()}, average $${Math.round(flow.averageTradeUsd).toLocaleString()}`,
    `  taker buy     $${(flow.buyQuote / 1e6).toFixed(2)}M   ${f1(flow.buySharePct)}%`,
    `  taker sell    $${(flow.sellQuote / 1e6).toFixed(2)}M   ${f1(100 - flow.buySharePct)}%`,
    `  imbalance     ${flow.imbalancePct >= 0 ? "+" : ""}${f1(flow.imbalancePct)}%`,
  ];
  const read = flowVsPrice(flow, changePct);
  if (read) lines.push("", read);
  return lines.join("\n");
}
