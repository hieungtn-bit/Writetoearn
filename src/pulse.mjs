/**
 * Exchange-wide event detector.
 *
 * The screener watches a fixed list of 26 liquid pairs, which is right for
 * research and wrong for reach. Measured across two large Square accounts, the
 * single highest-reach post on each was about $BANK during its collapse —
 * 166.6k views on one, 235.3k on the other, for posts of four and twenty words.
 * Neither account out-wrote us. They were *looking at the coin that was moving*,
 * and $BANK is not in our universe, so we could not have written it.
 *
 * This scans every USDT spot pair in one request and ranks what is actually
 * happening today, so the day's event is something we can see rather than
 * something we read about afterwards.
 */

import { fetchKlines, realizedVolatility, volumeZScore } from "./analysis.mjs";

const SPOT_BASE = "https://data-api.binance.vision/api/v3";
const TIMEOUT_MS = 20_000;

/**
 * Leveraged tokens and wrapped stables move for reasons that have nothing to do
 * with the market and would dominate any ranking by percentage change.
 */
const EXCLUDED = /(UP|DOWN|BULL|BEAR)USDT$|^(USDC|FDUSD|TUSD|BUSD|DAI|EUR|AEUR|USDP|XUSD)USDT$/;

/** Every 24h ticker on the venue, in one request. */
export async function fetchAllTickers(fetchImpl = globalThis.fetch) {
  const res = await fetchImpl(`${SPOT_BASE}/ticker/24hr`, { signal: AbortSignal.timeout(TIMEOUT_MS) });
  if (!res.ok) throw new Error(`ticker/24hr: HTTP ${res.status}`);
  const rows = await res.json();
  return rows.map((r) => ({
    symbol: r.symbol,
    price: Number(r.lastPrice),
    change24hPct: Number(r.priceChangePercent),
    quoteVolume24h: Number(r.quoteVolume),
    high24h: Number(r.highPrice),
    low24h: Number(r.lowPrice),
    trades24h: Number(r.count),
  }));
}

/**
 * Narrows the venue to pairs worth writing about, ranked by how far today's
 * move is from ordinary.
 *
 * A liquidity floor is not a detail: without it the ranking fills with dead
 * pairs whose 80% move was one fill, and those are the posts that destroy a
 * track record. The floor is on *quote* volume so it means the same thing in
 * dollars across every pair.
 */
export function rankTickers(tickers, { minVolume = 5e6, limit = 15 } = {}) {
  return tickers
    .filter((t) => t.symbol.endsWith("USDT") && !EXCLUDED.test(t.symbol))
    .filter((t) => Number.isFinite(t.quoteVolume24h) && t.quoteVolume24h >= minVolume)
    .filter((t) => Number.isFinite(t.change24hPct))
    .map((t) => ({
      ...t,
      /** Intraday range as a share of the low — how violent the session was. */
      range24hPct: t.low24h ? ((t.high24h - t.low24h) / t.low24h) * 100 : NaN,
    }))
    .sort((a, b) => Math.abs(b.change24hPct) - Math.abs(a.change24hPct))
    .slice(0, limit);
}

/**
 * Adds the history a single ticker cannot carry: is today's volume unusual for
 * *this* pair, and is the move large relative to its own volatility?
 *
 * A 20% day on a pair that moves 20% every week is not an event. The ranking
 * above cannot tell the difference; this can, and it is the difference between
 * covering a story and manufacturing one.
 */
export async function enrich(rows, { fetchImpl = globalThis.fetch, concurrency = 3 } = {}) {
  const out = [];
  for (let i = 0; i < rows.length; i += concurrency) {
    const batch = rows.slice(i, i + concurrency);
    const done = await Promise.all(
      batch.map(async (row) => {
        try {
          const candles = await fetchKlines(row.symbol, { limit: 90, fetchImpl });
          const closes = candles.map((c) => c.close);
          const vol30 = realizedVolatility(closes, { periods: 30 });
          const dailySigmaPct = vol30 / Math.sqrt(365);
          return {
            ...row,
            volumeZScore: volumeZScore(candles.map((c) => c.quoteVolume), 30),
            realizedVol30d: vol30,
            sigmaMove: dailySigmaPct ? row.change24hPct / dailySigmaPct : NaN,
            /**
             * Intraday range in units of the pair's own daily volatility.
             *
             * Close-to-close alone misses the shape that matters most: a pair
             * that spikes and round-trips finishes near flat while having been
             * the most violent thing on the venue. UTK printed a 260% range on
             * a +16% close, and the first version of this detector discarded it.
             */
            rangeSigma: dailySigmaPct ? row.range24hPct / dailySigmaPct : NaN,
            listedDays: candles.length,
          };
        } catch {
          return { ...row, volumeZScore: NaN, realizedVol30d: NaN, sigmaMove: NaN, listedDays: NaN };
        }
      }),
    );
    out.push(...done);
  }
  return out;
}

/**
 * An event is a move that is large *for this pair* and backed by turnover the
 * pair does not normally see. Requiring both is what separates a story from a
 * pair that is simply volatile every day.
 */
export function isEvent(row, { minSigma = 2.5, minRangeSigma = 5, minVolumeZ = 2 } = {}) {
  if (!Number.isFinite(row.volumeZScore) || row.volumeZScore < minVolumeZ) return false;

  const moved = Number.isFinite(row.sigmaMove) && Math.abs(row.sigmaMove) >= minSigma;
  const thrashed = Number.isFinite(row.rangeSigma) && row.rangeSigma >= minRangeSigma;
  return moved || thrashed;
}

export async function pulse({ minVolume = 5e6, limit = 15, fetchImpl = globalThis.fetch } = {}) {
  const tickers = await fetchAllTickers(fetchImpl);
  const ranked = rankTickers(tickers, { minVolume, limit });
  const rows = await enrich(ranked, { fetchImpl });
  return {
    scannedPairs: tickers.length,
    rows: rows.sort((a, b) => (b.rangeSigma || 0) - (a.rangeSigma || 0)),
    events: rows.filter((r) => isEvent(r)),
    scannedAt: new Date().toISOString(),
  };
}

const f1 = (v) => (Number.isFinite(v) ? v.toFixed(1) : "—");
const f2 = (v) => (Number.isFinite(v) ? v.toFixed(2) : "—");
const money = (v) => (v >= 1e9 ? `$${(v / 1e9).toFixed(2)}B` : `$${(v / 1e6).toFixed(1)}M`);

export function formatPulse({ scannedPairs, rows, events }) {
  const lines = [`Exchange pulse — ${scannedPairs} pairs scanned, ${rows.length} ranked`, ""];
  lines.push("  PAIR            24h        range     vol24h      volZ    sigma   rngSig");
  for (const r of rows) {
    lines.push(
      `  ${r.symbol.replace(/USDT$/, "").padEnd(12)} ${`${r.change24hPct >= 0 ? "+" : ""}${f1(r.change24hPct)}%`.padStart(8)} ` +
        `${`${f1(r.range24hPct)}%`.padStart(9)} ${money(r.quoteVolume24h).padStart(9)} ` +
        `${f1(r.volumeZScore).padStart(8)} ${f2(r.sigmaMove).padStart(8)} ${f1(r.rangeSigma).padStart(8)}`,
    );
  }
  lines.push("");
  lines.push(
    events.length
      ? `Events (volZ>=2 with |sigma|>=2.5 or range>=5 sigma): ${events.map((e) => e.symbol.replace(/USDT$/, "")).join(", ")}`
      : "No event today: nothing is moving far enough on unusual enough volume. Do not manufacture one.",
  );
  return lines.join("\n");
}
