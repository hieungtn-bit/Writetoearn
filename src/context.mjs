/**
 * The situation an alert arrives into.
 *
 * Every detector in this repo reads one pair at a time. That is enough to find
 * a moving token and nowhere near enough to know whether it is worth anything,
 * and 2026-08-03 showed why: the three loudest volume events on the venue were
 * all tokens Binance had announced it was removing. The scanner was working
 * perfectly. The market simply had nothing better going on, and a detector with
 * no view of the whole board cannot tell those two situations apart.
 *
 * Four readings, each answering a question a z-score cannot:
 *
 *   breadth        is anything moving, or one name and 168 corpses
 *   concentration  is turnover spread across the board or hiding in ten pairs
 *   positioning    where the leverage actually sits
 *   funding        what the crowd is paying to believe
 *
 * None of them predicts a price. Together they say whether the board is one
 * where a breakout has anywhere to go — which is the question that matters
 * before deciding an alert is interesting.
 */

import { fetchAllTickers } from "./pulse.mjs";
import { fetchOnchain, valuationNote } from "./onchain.mjs";

const OKX_BASE = "https://www.okx.com/api/v5";
const GLOBAL_URL = "https://api.coingecko.com/api/v3/global";
const FNG_URL = "https://api.alternative.me/fng/?limit=30";
const TIMEOUT_MS = 20_000;
const EXCLUDED = /(UP|DOWN|BULL|BEAR)USDT$|^(USDC|FDUSD|TUSD|BUSD|DAI|EUR|AEUR|USDP|XUSD)USDT$/;

const median = (xs) => {
  const s = [...xs].sort((a, b) => a - b);
  if (!s.length) return NaN;
  const m = s.length >> 1;
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};

/**
 * How wide the day is, and how much of it is one or two names.
 *
 * The share of turnover held by the ten busiest pairs is the number that
 * separates a market from a queue: when it is high, "unusual volume" on pair
 * 140 is unusual against nothing.
 */
export function breadthFrom(tickers, { minVolume = 1e6 } = {}) {
  const universe = tickers
    .filter((t) => t.symbol.endsWith("USDT") && !EXCLUDED.test(t.symbol))
    .filter((t) => Number.isFinite(t.quoteVolume24h) && t.quoteVolume24h >= minVolume)
    .filter((t) => Number.isFinite(t.change24hPct));
  if (!universe.length) return null;

  const btc = universe.find((t) => t.symbol === "BTCUSDT");
  const alts = universe.filter((t) => !["BTCUSDT", "ETHUSDT"].includes(t.symbol));
  const totalTurnover = universe.reduce((s, t) => s + t.quoteVolume24h, 0);
  const byVolume = [...universe].sort((a, b) => b.quoteVolume24h - a.quoteVolume24h);

  return {
    pairs: universe.length,
    advancingPct: (universe.filter((t) => t.change24hPct > 0).length / universe.length) * 100,
    medianAltChangePct: median(alts.map((t) => t.change24hPct)),
    btcChangePct: btc?.change24hPct ?? NaN,
    /** Alts outperforming BTC. Low means the board is not leading anywhere. */
    beatingBtcPct: btc ? (alts.filter((t) => t.change24hPct > btc.change24hPct).length / alts.length) * 100 : NaN,
    btcTurnoverSharePct: btc ? (btc.quoteVolume24h / totalTurnover) * 100 : NaN,
    top10TurnoverSharePct: (byVolume.slice(0, 10).reduce((s, t) => s + t.quoteVolume24h, 0) / totalTurnover) * 100,
  };
}

/** Open interest per instrument, venue-wide, in one request. */
export async function fetchOpenInterest({ fetchImpl = globalThis.fetch } = {}) {
  const res = await fetchImpl(`${OKX_BASE}/public/open-interest?instType=SWAP`, {
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  if (!res.ok) throw new Error(`open-interest: HTTP ${res.status}`);
  const body = await res.json();
  return (body?.data ?? [])
    .filter((r) => r.instId?.endsWith("-USDT-SWAP"))
    .map((r) => ({ instId: r.instId, asset: r.instId.replace("-USDT-SWAP", ""), oiUsd: Number(r.oiUsd) }))
    .filter((r) => Number.isFinite(r.oiUsd));
}

/**
 * Where the leverage sits.
 *
 * Concentration in the majors is the tell that matters for an alt breakout: if
 * two thirds of all open interest is BTC and ETH, there is no positioning in
 * the rest of the board, and a move there has no leveraged fuel behind it.
 */
export function positioningFrom(rows) {
  if (!rows.length) return null;
  const total = rows.reduce((s, r) => s + r.oiUsd, 0);
  const majors = rows.filter((r) => ["BTC", "ETH"].includes(r.asset)).reduce((s, r) => s + r.oiUsd, 0);
  return {
    instruments: rows.length,
    totalOpenInterestUsd: total,
    majorSharePct: (majors / total) * 100,
    altOpenInterestUsd: total - majors,
  };
}

/**
 * What the crowd pays to hold its view, across the instruments that matter.
 *
 * Weighted by open interest as well as counted, because a 90% rate on a
 * $2M instrument and a 4% rate on a $2B one are not the same fact, and the
 * unweighted median quietly treats them as if they were.
 */
export async function fundingMood(rows, { fetchImpl = globalThis.fetch, top = 40, concurrency = 6 } = {}) {
  const targets = [...rows].sort((a, b) => b.oiUsd - a.oiUsd).slice(0, top);
  const out = [];

  for (let i = 0; i < targets.length; i += concurrency) {
    const batch = await Promise.all(
      targets.slice(i, i + concurrency).map(async (r) => {
        try {
          const res = await fetchImpl(`${OKX_BASE}/public/funding-rate?instId=${r.instId}`, {
            signal: AbortSignal.timeout(TIMEOUT_MS),
          });
          const body = await res.json();
          const rate = Number(body?.data?.[0]?.fundingRate);
          // Three funding periods a day is the OKX schedule this repo already
          // assumes elsewhere; keeping it consistent matters more than precision.
          return Number.isFinite(rate) ? { asset: r.asset, annualisedPct: rate * 3 * 365 * 100, oiUsd: r.oiUsd } : null;
        } catch {
          return null;
        }
      }),
    );
    out.push(...batch.filter(Boolean));
  }
  if (!out.length) return null;

  const weight = out.reduce((s, r) => s + r.oiUsd, 0);
  const sorted = [...out].sort((a, b) => b.annualisedPct - a.annualisedPct);
  return {
    sampled: out.length,
    positiveSharePct: (out.filter((r) => r.annualisedPct > 0).length / out.length) * 100,
    medianAnnualisedPct: median(out.map((r) => r.annualisedPct)),
    oiWeightedAnnualisedPct: out.reduce((s, r) => s + r.annualisedPct * r.oiUsd, 0) / weight,
    hottestLongs: sorted.slice(0, 3).map((r) => ({ asset: r.asset, annualisedPct: r.annualisedPct })),
    crowdedShorts: sorted.slice(-3).reverse().map((r) => ({ asset: r.asset, annualisedPct: r.annualisedPct })),
  };
}

/**
 * Where the whole asset class sits, and how much of it is Bitcoin.
 *
 * Dominance is the one number that separates "crypto is up" from "Bitcoin is
 * up and everything else is bleeding into it", and no per-pair scan can see it.
 */
export async function fetchGlobal({ fetchImpl = globalThis.fetch } = {}) {
  try {
    const res = await fetchImpl(GLOBAL_URL, { signal: AbortSignal.timeout(TIMEOUT_MS) });
    if (!res.ok) return null;
    const d = (await res.json())?.data;
    if (!d) return null;
    return {
      btcDominancePct: d.market_cap_percentage?.btc,
      ethDominancePct: d.market_cap_percentage?.eth,
      totalMarketCapUsd: d.total_market_cap?.usd,
      totalVolumeUsd: d.total_volume?.usd,
      marketCapChange24hPct: d.market_cap_change_percentage_24h_usd,
    };
  } catch {
    return null;
  }
}

/**
 * The crowd's mood, as a number with a month of history behind it.
 *
 * Funding says what the leveraged crowd is paying. This says what everyone
 * else feels, which is a different question and often the opposite answer.
 * Reported with its own 30-day range, because a reading of 28 means nothing
 * until you know whether the month has run 20-33 or 20-90.
 */
export async function fetchSentiment({ fetchImpl = globalThis.fetch } = {}) {
  try {
    const res = await fetchImpl(FNG_URL, { signal: AbortSignal.timeout(TIMEOUT_MS) });
    if (!res.ok) return null;
    const rows = (await res.json())?.data ?? [];
    if (!rows.length) return null;
    const values = rows.map((r) => Number(r.value)).filter(Number.isFinite);
    return {
      value: Number(rows[0].value),
      label: rows[0].value_classification,
      weekAgo: rows[7] ? Number(rows[7].value) : NaN,
      monthAgo: rows.at(-1) ? Number(rows.at(-1).value) : NaN,
      min30d: Math.min(...values),
      max30d: Math.max(...values),
    };
  } catch {
    return null;
  }
}

/**
 * The whole picture, degrading gracefully.
 *
 * Any leg can fail and the rest still reports. Context is an annotation on an
 * alert, never a precondition for raising one — a scanner that goes silent
 * because a funding endpoint timed out is worse than one with no context.
 */
export async function marketContext({ fetchImpl = globalThis.fetch, minVolume = 1e6 } = {}) {
  const out = {
    measuredAt: new Date().toISOString(),
    breadth: null, positioning: null, funding: null, global: null, sentiment: null, onchain: null,
  };

  try {
    out.breadth = breadthFrom(await fetchAllTickers(fetchImpl), { minVolume });
  } catch { /* leave null */ }

  [out.global, out.sentiment, out.onchain] = await Promise.all([
    fetchGlobal({ fetchImpl }),
    fetchSentiment({ fetchImpl }),
    fetchOnchain({ fetchImpl }),
  ]);

  try {
    const oi = await fetchOpenInterest({ fetchImpl });
    out.positioning = positioningFrom(oi);
    out.funding = await fundingMood(oi, { fetchImpl });
  } catch { /* leave null */ }

  return out;
}

const f1 = (v) => (Number.isFinite(v) ? v.toFixed(1) : "—");
const f2 = (v) => (Number.isFinite(v) ? v.toFixed(2) : "—");
const sign = (v) => (Number.isFinite(v) && v >= 0 ? "+" : "");

/**
 * One line saying whether the board is worth trading, and why.
 *
 * Deliberately a description, not a score. A single "regime = 3/10" number
 * would be acted on as if it were measured, and none of this is measured
 * against outcomes yet.
 */
export function regimeNote({ breadth, positioning }) {
  if (!breadth) return "Board unreadable: breadth data unavailable.";
  const narrow = breadth.top10TurnoverSharePct >= 60;
  const noLead = Number.isFinite(breadth.beatingBtcPct) && breadth.beatingBtcPct < 40;
  const majorsHold = positioning && positioning.majorSharePct >= 60;

  if (narrow && noLead) {
    return majorsHold
      ? "Narrow and leaderless: turnover concentrated in the top names, most alts trailing BTC, and the leverage sits in the majors. A breakout down the board has little behind it."
      : "Narrow and leaderless: turnover concentrated in the top names and most alts trailing BTC.";
  }
  if (narrow) return "Narrow: turnover concentrated in the top names, so an outlier is unusual against a thin field.";
  if (noLead) return "No leadership: most alts are trailing BTC.";
  return "Broad: turnover spread across the board and alts keeping pace.";
}

export function formatContext(ctx) {
  const { breadth: b, positioning: p, funding: f } = ctx;
  const lines = ["Market context"];

  if (b) {
    lines.push(
      `  breadth       ${b.pairs} pairs, ${f1(b.advancingPct)}% advancing, ` +
        `median alt ${sign(b.medianAltChangePct)}${f2(b.medianAltChangePct)}% vs BTC ${sign(b.btcChangePct)}${f2(b.btcChangePct)}%`,
      `  leadership    ${f1(b.beatingBtcPct)}% of alts beating BTC`,
      `  concentration top 10 pairs hold ${f1(b.top10TurnoverSharePct)}% of turnover, BTC alone ${f1(b.btcTurnoverSharePct)}%`,
    );
  }
  if (p) {
    lines.push(
      `  positioning   $${(p.totalOpenInterestUsd / 1e9).toFixed(2)}B open interest, ` +
        `${f1(p.majorSharePct)}% in BTC+ETH, $${(p.altOpenInterestUsd / 1e9).toFixed(2)}B across the rest`,
    );
  }
  if (f) {
    lines.push(
      `  crowd         ${f1(f.positiveSharePct)}% paying to be long, median ${sign(f.medianAnnualisedPct)}${f2(f.medianAnnualisedPct)}% annualised ` +
        `(${sign(f.oiWeightedAnnualisedPct)}${f2(f.oiWeightedAnnualisedPct)}% weighted)`,
      `  hottest       ${f.hottestLongs.map((r) => `${r.asset} ${sign(r.annualisedPct)}${f1(r.annualisedPct)}%`).join(", ")}`,
      `  most shorted  ${f.crowdedShorts.map((r) => `${r.asset} ${sign(r.annualisedPct)}${f1(r.annualisedPct)}%`).join(", ")}`,
    );
  }
  if (ctx.global) {
    const g = ctx.global;
    lines.push(
      `  asset class   $${(g.totalMarketCapUsd / 1e12).toFixed(3)}T total, ` +
        `${sign(g.marketCapChange24hPct)}${f2(g.marketCapChange24hPct)}% in 24h, ` +
        `BTC dominance ${f1(g.btcDominancePct)}%`,
    );
  }
  if (ctx.sentiment) {
    const s2v = ctx.sentiment;
    lines.push(
      `  mood          ${s2v.value} (${s2v.label}), ${s2v.weekAgo} a week ago, ` +
        `${s2v.monthAgo} a month ago, 30-day range ${s2v.min30d}-${s2v.max30d}`,
    );
  }
  if (ctx.onchain?.mvrvZscore) {
    const z = ctx.onchain.mvrvZscore;
    const rp = ctx.onchain.realizedPrice;
    lines.push(
      `  valuation     MVRV Z ${f2(z.value)} at the ${f1(z.percentile)}th percentile ` +
        `of ${z.observations} days (low ${f2(z.min)})` +
        (rp ? `, cost basis ${Math.round(rp.value).toLocaleString("en-US")}` : ""),
    );
  }
  lines.push("", regimeNote(ctx));
  if (ctx.onchain) lines.push(valuationNote(ctx.onchain));
  return lines.join("\n");
}
