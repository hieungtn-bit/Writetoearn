/**
 * Which tokens the exchange has announced it is removing.
 *
 * On 2026-08-03 the scanner's headline catch was VIC: 25.9 sigma of turnover,
 * +31% in an hour, and a replay showing it was legible four hours earlier at a
 * price 52% lower. It read as a vindication of the whole system.
 *
 * Binance had published "Binance Will Delist ACX, HFT, PIVX, PYR, VANRY, VIC on
 * 2026-08-17" that same day. Three of the eight alerts — VIC, HFT and PYR —
 * were the same announcement, and VANRY was a fourth just under the threshold.
 * The turnover was real. The cause was a delisting, and a delisting pump is a
 * countdown to a token that cannot be sold on this venue at all.
 *
 * Nothing in the market-data API exposes this. VIC's exchangeInfo entry is
 * byte-for-byte as healthy as BTC's: status TRADING, spot and margin allowed,
 * the same permission sets. Price and volume cannot see it, so no threshold on
 * price and volume could ever have caught it. It needs a different source.
 */

const ANNOUNCEMENTS =
  "https://www.binance.com/bapi/composite/v1/public/cms/article/list/query" +
  "?type=1&catalogId=%d&pageNo=1&pageSize=20";
const TIMEOUT_MS = 20_000;

/**
 * The announcement catalogs worth watching.
 *
 * Delisting was added first because it cost us a headline result. Listing is
 * its mirror and the larger catalog by far — a futures launch or a new spot
 * pair is the other half of the same class of event, the kind that moves a
 * token for a reason no price series contains.
 */
export const CATALOGS = { delisting: 161, listing: 48, news: 49 };

/**
 * Tokens named in a delisting title, e.g. "Binance Will Delist ACX, HFT, PIVX,
 * PYR, VANRY, VIC on 2026-08-17".
 *
 * Deliberately conservative: only uppercase runs of 2-10 characters, and only
 * from titles that actually announce a removal. A false positive here silences
 * a real alert, so the parse errs towards missing a token rather than inventing
 * one — the words below are the ones that would otherwise be read as tickers.
 */
const NOT_TICKERS = new Set([
  "BINANCE", "WILL", "DELIST", "AND", "ON", "THE", "OF", "TO", "FOR", "USD",
  "USDT", "USDC", "SPOT", "MARGIN", "LOAN", "FUTURES", "ALPHA", "REMOVE",
  "REMOVAL", "NOTICE", "UPDATE", "UPDATED", "REGARDING", "CONVERSION", "PERPETUAL",
  "CONTRACT", "TRADING", "PAIRS", "PAIR", "EARN", "POOL", "AEUR", "EUR", "VIP",
]);

const DELISTING_TITLE = /\b(delist|removal of spot|remove)\b/i;

export function tokensFromTitle(title) {
  if (!DELISTING_TITLE.test(title)) return [];
  return [...new Set(
    (title.match(/\b[A-Z][A-Z0-9]{1,9}\b/g) ?? []).filter((t) => !NOT_TICKERS.has(t)),
  )];
}

/**
 * Base assets with an open delisting announcement, mapped to the notice.
 *
 * Returns an empty map on any failure rather than throwing. That is the right
 * trade for a guard on a scanner: if the announcement feed is down, the scan
 * should still run and simply lose this annotation, not stop.
 */
export async function fetchDelistings(opts = {}) {
  return fetchCatalog(CATALOGS.delisting, opts);
}

/**
 * Recent announcement headlines from a catalog, newest first.
 *
 * Returned as text rather than parsed into tickers: a listing announcement is
 * a catalyst to read, not a filter to apply, and pretending otherwise would
 * invent structure the titles do not have.
 */
export async function fetchHeadlines(catalogId, { fetchImpl = globalThis.fetch, days = 7, limit = 8 } = {}) {
  try {
    const res = await fetchImpl(ANNOUNCEMENTS.replace("%d", String(catalogId)), {
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    if (!res.ok) return [];
    const body = await res.json();
    const cutoff = Date.now() - days * 86_400_000;
    return (body?.data?.catalogs?.[0]?.articles ?? [])
      .filter((a) => a?.title && a.releaseDate > cutoff)
      .slice(0, limit)
      .map((a) => ({ title: a.title, announcedAt: new Date(a.releaseDate).toISOString() }));
  } catch {
    return [];
  }
}

async function fetchCatalog(catalogId, { fetchImpl = globalThis.fetch, days = 45 } = {}) {
  const map = new Map();
  try {
    const res = await fetchImpl(ANNOUNCEMENTS.replace("%d", String(catalogId)), {
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    if (!res.ok) return map;
    const body = await res.json();
    const articles = body?.data?.catalogs?.[0]?.articles ?? [];
    const cutoff = Date.now() - days * 86_400_000;

    for (const a of articles) {
      if (!a?.title || !(a.releaseDate > cutoff)) continue;
      for (const token of tokensFromTitle(a.title)) {
        if (map.has(token)) continue;
        map.set(token, { token, title: a.title, announcedAt: new Date(a.releaseDate).toISOString() });
      }
    }
  } catch {
    return map;
  }
  return map;
}

/** The base asset a USDT pair trades, e.g. VICUSDT -> VIC. */
export const baseAsset = (symbol) => symbol.replace(/USDT$/, "");

/**
 * Splits alerts into the ones worth acting on and the ones a delisting explains.
 *
 * They are separated rather than silently dropped. A delisting pump is a real
 * event and sometimes the story worth writing — it just must never arrive
 * looking like an opportunity, which is exactly how it arrived the first time.
 */
export function partitionByDelisting(alerts, delistings) {
  const clean = [];
  const flagged = [];
  for (const a of alerts) {
    const notice = delistings.get(baseAsset(a.symbol));
    if (notice) flagged.push({ ...a, delisting: notice });
    else clean.push(a);
  }
  return { clean, flagged };
}
