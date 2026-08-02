/**
 * Computed technical analysis from real candles.
 *
 * Everything here is derived arithmetic over Binance spot klines — no opinion,
 * no model output. That matters twice over: it is what makes "deep analysis"
 * defensible, and it is what lets the numeric verifier accept the figures.
 */

const SPOT_BASE = "https://data-api.binance.vision/api/v3";
const TIMEOUT_MS = 20_000;

const RETRY_DELAYS_MS = [400, 1200, 3000];

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/**
 * Klines with retry.
 *
 * The exchange answers a burst of concurrent requests from one host with 503s,
 * so a transient failure here is expected rather than exceptional. An
 * unattended slot run that gives up on the first 503 silently loses the post.
 */
export async function fetchKlines(symbol, { interval = "1d", limit = 200, fetchImpl = globalThis.fetch } = {}) {
  let lastError;

  for (let attempt = 0; attempt <= RETRY_DELAYS_MS.length; attempt++) {
    if (attempt) await sleep(RETRY_DELAYS_MS[attempt - 1]);
    try {
      const res = await fetchImpl(
        `${SPOT_BASE}/klines?symbol=${symbol}&interval=${interval}&limit=${limit}`,
        { signal: AbortSignal.timeout(TIMEOUT_MS) },
      );
      if (!res.ok) throw new Error(`klines ${symbol} ${interval}: HTTP ${res.status}`);
      const rows = await res.json();
      return rows.map((r) => ({
        openTime: Number(r[0]),
        open: Number(r[1]),
        high: Number(r[2]),
        low: Number(r[3]),
        close: Number(r[4]),
        volume: Number(r[5]),
        quoteVolume: Number(r[7]),
      }));
    } catch (err) {
      lastError = err;
    }
  }
  throw lastError;
}

/**
 * Fetches daily candles for a set of symbols, a few at a time.
 *
 * Serialising in small batches is what keeps the whole brief from tripping the
 * exchange's burst limit — the previous version fired every symbol at once and
 * regularly took the entire collection down with it.
 */
export async function fetchDailyCandles(symbols, { limit = 120, concurrency = 2, fetchImpl = globalThis.fetch } = {}) {
  const out = {};
  for (let i = 0; i < symbols.length; i += concurrency) {
    const batch = symbols.slice(i, i + concurrency);
    const results = await Promise.all(
      batch.map((s) => fetchKlines(s, { interval: "1d", limit, fetchImpl })),
    );
    batch.forEach((s, j) => (out[s] = results[j]));
  }
  return out;
}

// ---------------------------------------------------------------- primitives

export function mean(xs) {
  if (!xs.length) return NaN;
  return xs.reduce((a, b) => a + b, 0) / xs.length;
}

/** Sample standard deviation (n-1), which is what you want for a sampled series. */
export function stdev(xs) {
  if (xs.length < 2) return NaN;
  const m = mean(xs);
  return Math.sqrt(xs.reduce((a, x) => a + (x - m) ** 2, 0) / (xs.length - 1));
}

/** Log returns, which compound correctly and are the right input for volatility. */
export function logReturns(closes) {
  const out = [];
  for (let i = 1; i < closes.length; i++) out.push(Math.log(closes[i] / closes[i - 1]));
  return out;
}

export function pctChange(from, to) {
  return ((to - from) / from) * 100;
}

// ---------------------------------------------------------------- indicators

/** Annualised realised volatility, in percent. Crypto trades 365 days. */
export function realizedVolatility(closes, { periods = 30, annualize = 365 } = {}) {
  const returns = logReturns(closes.slice(-(periods + 1)));
  if (returns.length < 2) return NaN;
  return stdev(returns) * Math.sqrt(annualize) * 100;
}

/** Wilder's ATR, then expressed as a percentage of price for cross-asset comparison. */
export function atr(candles, period = 14) {
  if (candles.length < period + 1) return NaN;
  const trs = [];
  for (let i = 1; i < candles.length; i++) {
    const { high, low } = candles[i];
    const prevClose = candles[i - 1].close;
    trs.push(Math.max(high - low, Math.abs(high - prevClose), Math.abs(low - prevClose)));
  }

  // Seed with a simple average, then smooth — the standard Wilder construction.
  let value = mean(trs.slice(0, period));
  for (let i = period; i < trs.length; i++) value = (value * (period - 1) + trs[i]) / period;
  return value;
}

/** Wilder's RSI. Returns NaN when there is not enough history to seed it. */
export function rsi(closes, period = 14) {
  if (closes.length < period + 1) return NaN;

  let gains = 0;
  let losses = 0;
  for (let i = 1; i <= period; i++) {
    const diff = closes[i] - closes[i - 1];
    if (diff >= 0) gains += diff;
    else losses -= diff;
  }
  let avgGain = gains / period;
  let avgLoss = losses / period;

  for (let i = period + 1; i < closes.length; i++) {
    const diff = closes[i] - closes[i - 1];
    avgGain = (avgGain * (period - 1) + Math.max(diff, 0)) / period;
    avgLoss = (avgLoss * (period - 1) + Math.max(-diff, 0)) / period;
  }

  if (avgLoss === 0) return avgGain === 0 ? 50 : 100;
  return 100 - 100 / (1 + avgGain / avgLoss);
}

export function sma(values, period) {
  if (values.length < period) return NaN;
  return mean(values.slice(-period));
}

/** Where price sits inside a range, 0 = at the floor, 100 = at the ceiling. */
export function rangePosition(price, low, high) {
  if (!(high > low)) return NaN;
  return ((price - low) / (high - low)) * 100;
}

/**
 * How unusual the latest volume is, in standard deviations from the trailing
 * mean. Above ~2 is a genuine anomaly worth writing about.
 */
export function volumeZScore(volumes, lookback = 30) {
  const window = volumes.slice(-(lookback + 1));
  if (window.length < 3) return NaN;
  const history = window.slice(0, -1);
  const latest = window.at(-1);
  const m = mean(history);
  const sd = stdev(history);

  // A history with no variance makes any deviation infinitely unusual. Reporting
  // 0 there would call a volume explosion "perfectly normal", so clamp to a
  // magnitude far past any threshold a caller would test against.
  if (!sd) return latest === m ? 0 : Math.sign(latest - m) * 10;

  return (latest - m) / sd;
}

/** Pearson correlation over paired series; used on returns, not prices. */
export function correlation(a, b) {
  const n = Math.min(a.length, b.length);
  if (n < 3) return NaN;
  const x = a.slice(-n);
  const y = b.slice(-n);
  const mx = mean(x);
  const my = mean(y);

  let num = 0;
  let dx = 0;
  let dy = 0;
  for (let i = 0; i < n; i++) {
    const a1 = x[i] - mx;
    const b1 = y[i] - my;
    num += a1 * b1;
    dx += a1 ** 2;
    dy += b1 ** 2;
  }
  if (!dx || !dy) return NaN;
  return num / Math.sqrt(dx * dy);
}

/**
 * 30-day return per unit of annualised volatility.
 *
 * Not a Sharpe ratio — no risk-free rate, and the horizons differ — so it is
 * only meaningful *relative* to another asset measured the same way. That is
 * exactly the comparison worth making: two assets that both rose are not
 * equally good if one of them tripled the volatility to do it.
 */
export function riskAdjusted(returnPct, volPct) {
  if (!Number.isFinite(returnPct) || !Number.isFinite(volPct) || volPct === 0) return NaN;
  return returnPct / volPct;
}

/** Is the recent range tighter or wider than the longer-run range? */
export function rangeCompression(candles, { recent = 7, base = 30 } = {}) {
  if (candles.length < base) return NaN;
  const span = (slice) => Math.max(...slice.map((c) => c.high)) - Math.min(...slice.map((c) => c.low));
  const baseSpan = span(candles.slice(-base));
  if (!baseSpan) return NaN;
  return (span(candles.slice(-recent)) / baseSpan) * 100;
}

// ------------------------------------------------------------- per-asset roll-up

/**
 * Full computed picture for one symbol.
 * @returns {Promise<object>} every field a number the verifier can vouch for
 */
export async function analyzeAsset(symbol, { fetchImpl = globalThis.fetch, candles } = {}) {
  const daily = candles ?? (await fetchKlines(symbol, { interval: "1d", limit: 120, fetchImpl }));
  const closes = daily.map((c) => c.close);
  const volumes = daily.map((c) => c.quoteVolume);
  const price = closes.at(-1);

  const window = (n) => daily.slice(-n);
  const high = (n) => Math.max(...window(n).map((c) => c.high));
  const low = (n) => Math.min(...window(n).map((c) => c.low));

  const atr14 = atr(daily, 14);

  // Today's move measured in daily standard deviations. A drop can feel violent
  // and still be an ordinary day for the asset's own volatility — this is the
  // number that tells the two apart, and it is the honest answer to "is this
  // actually a big move?"
  const vol30 = realizedVolatility(closes, { periods: 30 });
  const dailySigmaPct = vol30 / Math.sqrt(365);
  const todayChangePct = pctChange(closes.at(-2) ?? closes[0], price);
  const sigmaMove = dailySigmaPct ? todayChangePct / dailySigmaPct : NaN;

  return {
    symbol,
    price,
    todayChangePct,
    dailySigmaPct,
    sigmaMove,
    change7dPct: pctChange(closes.at(-8) ?? closes[0], price),
    change30dPct: pctChange(closes.at(-31) ?? closes[0], price),
    rsi14: rsi(closes, 14),
    atr14,
    atrPct: (atr14 / price) * 100,
    realizedVol30d: realizedVolatility(closes, { periods: 30 }),
    realizedVol7d: realizedVolatility(closes, { periods: 7 }),
    rangePosition30d: rangePosition(price, low(30), high(30)),
    high30d: high(30),
    low30d: low(30),
    /** Width of the 30-day range as a share of its floor — the compression measure. */
    rangeWidth30dPct: low(30) ? ((high(30) - low(30)) / low(30)) * 100 : NaN,
    returnPerVol30d: riskAdjusted(
      pctChange(closes.at(-31) ?? closes[0], price),
      realizedVolatility(closes, { periods: 30 }),
    ),
    sma20: sma(closes, 20),
    sma50: sma(closes, 50),
    volumeZScore: volumeZScore(volumes, 30),
    rangeCompressionPct: rangeCompression(daily),
    returns: logReturns(closes.slice(-31)),
  };
}

/**
 * Cross-asset view: who is leading, who is lagging, and how tightly the group
 * is moving together. Relative strength is the most useful multi-asset signal
 * available from spot data alone.
 */
export async function analyzeUniverse(symbols, { base = "BTCUSDT", fetchImpl = globalThis.fetch, candlesBySymbol } = {}) {
  const candles = candlesBySymbol ?? (await fetchDailyCandles(symbols, { fetchImpl }));
  const assets = await Promise.all(
    symbols.map((s) => analyzeAsset(s, { fetchImpl, candles: candles[s] })),
  );
  const byName = Object.fromEntries(assets.map((a) => [a.symbol, a]));
  const anchor = byName[base];

  const relativeStrength = assets
    .map((a) => ({
      symbol: a.symbol,
      change7dPct: a.change7dPct,
      /** Outperformance against the anchor over 7 days, in percentage points. */
      vsBase7dPct: anchor ? a.change7dPct - anchor.change7dPct : NaN,
    }))
    .sort((x, y) => y.change7dPct - x.change7dPct);

  const correlations = [];
  for (let i = 0; i < assets.length; i++) {
    for (let j = i + 1; j < assets.length; j++) {
      correlations.push({
        pair: `${assets[i].symbol}/${assets[j].symbol}`,
        correlation30d: correlation(assets[i].returns, assets[j].returns),
      });
    }
  }

  return {
    base,
    assets: assets.map(({ returns, ...rest }) => rest), // returns are an intermediate, not content
    relativeStrength,
    correlations,
    leader: relativeStrength[0]?.symbol ?? null,
    laggard: relativeStrength.at(-1)?.symbol ?? null,
  };
}

/** Human-readable rendering, for eyeballing and for the composer prompt. */
export function formatAnalysis(uni) {
  const lines = ["Computed analysis (Binance spot daily candles)", ""];

  lines.push("Per asset");
  for (const a of uni.assets) {
    lines.push(
      `  ${a.symbol.padEnd(9)} 7d ${fmtPct(a.change7dPct)}  30d ${fmtPct(a.change30dPct)}  ` +
        `RSI ${a.rsi14.toFixed(1)}  ATR ${a.atrPct.toFixed(2)}%  ` +
        `vol30d ${a.realizedVol30d.toFixed(1)}%  range ${a.rangePosition30d.toFixed(0)}%`,
    );
  }
  lines.push("");

  lines.push(`Relative strength, 7d (vs ${uni.base})`);
  for (const r of uni.relativeStrength) {
    const vs = Number.isFinite(r.vsBase7dPct) ? `  ${fmtPct(r.vsBase7dPct)} vs base` : "";
    lines.push(`  ${r.symbol.padEnd(9)} ${fmtPct(r.change7dPct)}${vs}`);
  }
  lines.push(`  leader: ${uni.leader}   laggard: ${uni.laggard}`);
  lines.push("");

  lines.push("30d return correlation");
  for (const c of uni.correlations) {
    lines.push(`  ${c.pair.padEnd(22)} ${c.correlation30d.toFixed(2)}`);
  }
  lines.push("");
  lines.push("Range position: 0% = at the 30d floor, 100% = at the 30d high.");

  return lines.join("\n");
}

function fmtPct(n) {
  return `${n >= 0 ? "+" : ""}${n.toFixed(2)}%`;
}
