/**
 * Market data collection.
 *
 * The rule this module exists to enforce: a number either came from a live
 * response in this run, or it does not appear in the brief at all. Anything a
 * source refused to give us is listed under `unavailable` with the reason, so a
 * writer downstream can see the hole instead of filling it from memory.
 *
 * Every value carries the venue it came from. Funding rates in particular are
 * NOT Binance's — see FUNDING_VENUE below.
 */

const SPOT_BASE = "https://data-api.binance.vision/api/v3";
const COINGECKO_BASE = "https://api.coingecko.com/api/v3";
const OKX_BASE = "https://www.okx.com/api/v5";
const NEWS_RSS = "https://cointelegraph.com/rss";

/**
 * Binance's own futures API (fapi.binance.com) geo-blocks this host, so funding
 * comes from OKX perps instead. It tracks Binance closely but is a different
 * venue and must always be labelled as such in anything published.
 */
export const FUNDING_VENUE = "OKX perpetual swaps";
export const SPOT_VENUE = "Binance spot";

const DEFAULT_SYMBOLS = ["BTCUSDT", "ETHUSDT", "SOLUSDT"];
const TIMEOUT_MS = 20_000;

async function getJson(url, fetchImpl) {
  const res = await fetchImpl(url, { signal: AbortSignal.timeout(TIMEOUT_MS) });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

async function getText(url, fetchImpl) {
  const res = await fetchImpl(url, { signal: AbortSignal.timeout(TIMEOUT_MS) });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.text();
}

/** Binance spot ticker: price, 24h change, quote volume. */
export async function fetchSpot(symbols = DEFAULT_SYMBOLS, fetchImpl = globalThis.fetch) {
  const query = encodeURIComponent(JSON.stringify(symbols));
  const rows = await getJson(`${SPOT_BASE}/ticker/24hr?symbols=${query}`, fetchImpl);
  return rows.map((r) => ({
    symbol: r.symbol,
    price: Number(r.lastPrice),
    change24hPct: Number(r.priceChangePercent),
    high24h: Number(r.highPrice),
    low24h: Number(r.lowPrice),
    quoteVolume24h: Number(r.quoteVolume),
    /** Exchange-reported close time; proves how fresh the number is. */
    asOf: new Date(Number(r.closeTime)).toISOString(),
    venue: SPOT_VENUE,
  }));
}

/** Perp funding rate. OKX, not Binance — callers must surface the venue. */
export async function fetchFunding(instIds = ["BTC-USDT-SWAP", "ETH-USDT-SWAP"], fetchImpl = globalThis.fetch) {
  const out = [];
  for (const instId of instIds) {
    const body = await getJson(`${OKX_BASE}/public/funding-rate?instId=${instId}`, fetchImpl);
    const row = body?.data?.[0];
    if (!row) continue;
    out.push({
      instId,
      fundingRatePct: Number(row.fundingRate) * 100,
      nextFundingTime: new Date(Number(row.fundingTime)).toISOString(),
      venue: FUNDING_VENUE,
    });
  }
  return out;
}

/** CoinGecko's trending list — a decent read on retail attention. */
export async function fetchTrending(fetchImpl = globalThis.fetch) {
  const body = await getJson(`${COINGECKO_BASE}/search/trending`, fetchImpl);
  return (body?.coins ?? []).slice(0, 7).map(({ item }) => ({
    name: item.name,
    symbol: String(item.symbol).toUpperCase(),
    marketCapRank: item.market_cap_rank ?? null,
    source: "CoinGecko trending",
  }));
}

/** Recent headlines, filtered to the requested lookback window. */
export async function fetchNews(hours = 24, fetchImpl = globalThis.fetch) {
  const xml = await getText(NEWS_RSS, fetchImpl);
  const cutoff = Date.now() - hours * 3_600_000;
  const items = [];

  for (const block of xml.split("<item>").slice(1)) {
    const title = decodeXml(pick(block, "title"));
    const pubDate = pick(block, "pubDate");
    const link = pick(block, "link");
    if (!title || !pubDate) continue;

    const published = new Date(pubDate);
    if (Number.isNaN(published.getTime()) || published.getTime() < cutoff) continue;

    items.push({
      title,
      publishedAt: published.toISOString(),
      link: link || null,
      source: "Cointelegraph",
    });
  }
  return items.slice(0, 12);
}

function pick(block, tag) {
  const match = new RegExp(`<${tag}[^>]*>([\\s\\S]*?)</${tag}>`).exec(block);
  if (!match) return "";
  return match[1].replace(/^<!\[CDATA\[/, "").replace(/\]\]>$/, "").trim();
}

function decodeXml(s) {
  return s
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, "&");
}

/**
 * Runs every collector, tolerating individual failures.
 *
 * A source that fails lands in `unavailable` rather than being dropped
 * silently — the difference between "we know we don't know" and a writer
 * quietly inventing a plausible figure.
 */
export async function collectBrief({
  symbols = DEFAULT_SYMBOLS,
  newsHours = 24,
  fetchImpl = globalThis.fetch,
} = {}) {
  const brief = {
    generatedAt: new Date().toISOString(),
    spot: [],
    funding: [],
    trending: [],
    news: [],
    unavailable: [],
    notes: [],
  };

  const tasks = [
    ["spot", () => fetchSpot(symbols, fetchImpl)],
    ["funding", () => fetchFunding(undefined, fetchImpl)],
    ["trending", () => fetchTrending(fetchImpl)],
    ["news", () => fetchNews(newsHours, fetchImpl)],
  ];

  const results = await Promise.allSettled(tasks.map(([, run]) => run()));

  results.forEach((result, i) => {
    const [key] = tasks[i];
    if (result.status === "fulfilled") brief[key] = result.value;
    else brief.unavailable.push({ field: key, reason: result.reason?.message ?? String(result.reason) });
  });

  // Structural gaps that no retry will fix, stated once so they are never
  // mistaken for data we simply forgot to fetch.
  brief.unavailable.push(
    { field: "openInterest", reason: "fapi.binance.com is geo-blocked from this host; no substitute configured" },
    { field: "longShortRatio", reason: "fapi.binance.com is geo-blocked from this host; no substitute configured" },
  );

  if (brief.funding.length) {
    brief.notes.push(`Funding is from ${FUNDING_VENUE}, not Binance Futures. Label it or omit it.`);
  }

  return brief;
}

/** Human-readable rendering for eyeballing a brief before it drives a post. */
export function formatBrief(brief) {
  const lines = [`Market brief — ${brief.generatedAt}`, ""];

  if (brief.spot.length) {
    lines.push(`Spot (${SPOT_VENUE})`);
    for (const s of brief.spot) {
      const sign = s.change24hPct >= 0 ? "+" : "";
      lines.push(
        `  ${s.symbol.padEnd(9)} $${fmt(s.price)}  ${sign}${s.change24hPct.toFixed(2)}%  ` +
          `24h ${fmt(s.low24h)}–${fmt(s.high24h)}  vol $${(s.quoteVolume24h / 1e6).toFixed(0)}M`,
      );
    }
    lines.push("");
  }

  if (brief.funding.length) {
    lines.push(`Funding (${FUNDING_VENUE})`);
    for (const f of brief.funding) {
      lines.push(`  ${f.instId.padEnd(15)} ${f.fundingRatePct >= 0 ? "+" : ""}${f.fundingRatePct.toFixed(4)}%  next ${f.nextFundingTime}`);
    }
    lines.push("");
  }

  if (brief.trending.length) {
    lines.push("Trending (CoinGecko)");
    lines.push(`  ${brief.trending.map((t) => t.symbol).join(", ")}`);
    lines.push("");
  }

  if (brief.news.length) {
    lines.push(`News (last ${brief.news.length} headlines)`);
    for (const n of brief.news.slice(0, 8)) lines.push(`  • ${n.title}`);
    lines.push("");
  }

  if (brief.unavailable.length) {
    lines.push("UNAVAILABLE — do not write about these, and do not estimate them:");
    for (const u of brief.unavailable) lines.push(`  ✗ ${u.field}: ${u.reason}`);
    lines.push("");
  }

  for (const note of brief.notes) lines.push(`Note: ${note}`);

  return lines.join("\n");
}

function fmt(n) {
  return n >= 1000 ? n.toLocaleString("en-US", { maximumFractionDigits: 0 }) : String(n);
}
