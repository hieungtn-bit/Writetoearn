/**
 * The market crypto keeps insisting it has decoupled from.
 *
 * Every other source here is a crypto venue, which makes the system unable to
 * answer the question that was staring at it: on 2026-08-03 the hottest funding
 * rates on the whole board were tokenised equities and metals, not coins. That
 * is a statement about where confident money sits, and no amount of Binance
 * data can check it.
 *
 * Yahoo's chart endpoint serves indices, rates and commodities daily, free and
 * without a key. It is unofficial, so it is treated as an extra that can vanish:
 * every fetch fails to null and the crypto side of any report still prints.
 *
 * Correlation is the reading worth having. "Bitcoin is a hedge" and "Bitcoin is
 * a high-beta tech proxy" are both claims about the same number, and the number
 * is measurable rather than arguable.
 */

const CHART = "https://query1.finance.yahoo.com/v8/finance/chart";
const TIMEOUT_MS = 20_000;
const UA = "Mozilla/5.0 (compatible; maix8-research/1.0)";

/**
 * What to watch and why each one earns a request.
 *
 * Kept deliberately short. The point is the macro backdrop, not a stock screen:
 * two equity indices, the volatility the options market is charging for, the
 * long rate, the dollar, and gold as the competing store of value.
 */
export const SERIES = {
  sp500: { symbol: "^GSPC", label: "S&P 500" },
  nasdaq: { symbol: "^IXIC", label: "Nasdaq" },
  vix: { symbol: "^VIX", label: "VIX" },
  yield10y: { symbol: "^TNX", label: "US 10-year" },
  dollar: { symbol: "DX-Y.NYB", label: "Dollar index" },
  gold: { symbol: "GC=F", label: "Gold" },
};

/** One daily series, reduced to closes with dates. Null on any failure. */
export async function fetchSeries(symbol, { range = "1y", fetchImpl = globalThis.fetch } = {}) {
  try {
    const url = `${CHART}/${encodeURIComponent(symbol)}?range=${range}&interval=1d`;
    const res = await fetchImpl(url, { headers: { "User-Agent": UA }, signal: AbortSignal.timeout(TIMEOUT_MS) });
    if (!res.ok) return null;
    const r = (await res.json())?.chart?.result?.[0];
    const closes = r?.indicators?.quote?.[0]?.close;
    const stamps = r?.timestamp;
    if (!Array.isArray(closes) || !Array.isArray(stamps)) return null;

    // Yahoo pads holidays and halts with nulls; carrying them into a return
    // series produces NaN correlations that look like missing data rather than
    // the bad joins they are.
    const rows = stamps
      .map((t, i) => ({ date: new Date(t * 1000).toISOString().slice(0, 10), close: closes[i] }))
      .filter((x) => Number.isFinite(x.close));
    return rows.length > 30 ? { symbol, rows } : null;
  } catch {
    return null;
  }
}

const changeOver = (rows, days) => {
  const prior = rows.at(-1 - days);
  return prior ? (rows.at(-1).close / prior.close - 1) * 100 : NaN;
};

/** Where a value sits inside its own year, 0 at the low and 100 at the high. */
const positionInYear = (rows) => {
  const closes = rows.map((r) => r.close);
  const lo = Math.min(...closes);
  const hi = Math.max(...closes);
  return hi > lo ? ((rows.at(-1).close - lo) / (hi - lo)) * 100 : NaN;
};

export function summarise(series, label) {
  const rows = series.rows;
  return {
    label,
    symbol: series.symbol,
    last: rows.at(-1).close,
    asOf: rows.at(-1).date,
    change1dPct: changeOver(rows, 1),
    change30dPct: changeOver(rows, 21),   // 21 sessions is a trading month
    change1yPct: changeOver(rows, rows.length - 1),
    yearPositionPct: positionInYear(rows),
  };
}

/**
 * Correlation of daily returns, joined on the dates both markets actually
 * traded.
 *
 * Equities close at weekends and crypto does not, so an index-position join
 * silently pairs Bitcoin's Saturday with the index's Friday and reports a
 * relationship that is partly a calendar artefact.
 */
export function correlationOnDates(cryptoRows, equityRows) {
  const byDate = new Map(equityRows.map((r) => [r.date, r.close]));
  const paired = [];
  for (const r of cryptoRows) {
    const eq = byDate.get(r.date);
    if (Number.isFinite(eq)) paired.push([r.close, eq]);
  }
  if (paired.length < 30) return { correlation: NaN, sessions: paired.length };

  const a = [];
  const b = [];
  for (let i = 1; i < paired.length; i++) {
    a.push(Math.log(paired[i][0] / paired[i - 1][0]));
    b.push(Math.log(paired[i][1] / paired[i - 1][1]));
  }
  const mean = (xs) => xs.reduce((s, x) => s + x, 0) / xs.length;
  const ma = mean(a);
  const mb = mean(b);
  let num = 0;
  let da = 0;
  let db = 0;
  for (let i = 0; i < a.length; i++) {
    num += (a[i] - ma) * (b[i] - mb);
    da += (a[i] - ma) ** 2;
    db += (b[i] - mb) ** 2;
  }
  const denom = Math.sqrt(da * db);
  return { correlation: denom ? num / denom : NaN, sessions: a.length };
}

/** Everything, each leg independent. */
export async function fetchMacro({ fetchImpl = globalThis.fetch, range = "1y" } = {}) {
  const entries = await Promise.all(
    Object.entries(SERIES).map(async ([key, spec]) => {
      const s = await fetchSeries(spec.symbol, { range, fetchImpl });
      return [key, s ? { ...summarise(s, spec.label), rows: s.rows } : null];
    }),
  );
  const out = {};
  for (const [k, v] of entries) if (v) out[k] = v;
  return Object.keys(out).length ? out : null;
}

const f2 = (v) => (Number.isFinite(v) ? v.toFixed(2) : "—");
const f0 = (v) => (Number.isFinite(v) ? v.toFixed(0) : "—");
const sign = (v) => (Number.isFinite(v) && v >= 0 ? "+" : "");

export function formatMacro(macro, { correlations } = {}) {
  if (!macro) return "Macro series unavailable.";
  const any = Object.values(macro)[0];
  const lines = [`US market — close of ${any.asOf}`, "",
    "  SERIES            last       1d       1m       1y   position in year"];
  for (const m of Object.values(macro)) {
    lines.push(
      `  ${m.label.padEnd(15)} ${f2(m.last).padStart(9)} ` +
        `${(`${sign(m.change1dPct)}${f2(m.change1dPct)}%`).padStart(8)} ` +
        `${(`${sign(m.change30dPct)}${f2(m.change30dPct)}%`).padStart(8)} ` +
        `${(`${sign(m.change1yPct)}${f2(m.change1yPct)}%`).padStart(8)} ` +
        `${(`${f0(m.yearPositionPct)}%`).padStart(10)}`,
    );
  }
  if (correlations) {
    lines.push("", "  BTC daily-return correlation, joined on shared sessions:");
    for (const [label, c] of Object.entries(correlations)) {
      lines.push(`   ${label.padEnd(16)} ${f2(c.correlation).padStart(6)}   over ${c.sessions} sessions`);
    }
  }
  return lines.join("\n");
}
