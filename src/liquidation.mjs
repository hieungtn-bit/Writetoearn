/**
 * Where leveraged positions die, and where enough of them die together to matter.
 *
 * Price is pulled towards clusters of stops because a liquidation is a market
 * order nobody chose to send. That much is mechanical. What is *not* mechanical
 * is knowing where the positions are — no public feed says who is long at what
 * price with what leverage, and anyone who draws a confident liquidation heat
 * map from public data is modelling, not observing.
 *
 * So this separates two things that are usually mixed together:
 *
 *   bands     exact arithmetic. Given an entry, a leverage and the venue's real
 *             maintenance margin, the liquidation price is a fact.
 *   clusters  a model. It assumes each hour's turnover represents positions
 *             opened at that hour's typical price and still held. That
 *             assumption is wrong in detail and useful in aggregate, and it is
 *             labelled as an assumption everywhere it appears.
 *
 * The maintenance margin matters more than it looks. A widely copied formula
 * gives a long's liquidation as entry x (1 - 1/L), which ignores it. On BTC at
 * 100x that puts the level 1.00% below entry when the real one is 0.60% below
 * — the position is already gone by the time price reaches the number on the
 * chart. Being wrong in that direction is the expensive one.
 */

const OKX_BASE = "https://www.okx.com/api/v5";
const TIMEOUT_MS = 20_000;

/**
 * The venue's real margin tiers. Maintenance margin rises with position size,
 * so a single rate is an approximation even before the model starts.
 */
export async function fetchPositionTiers(instFamily = "BTC-USDT", { fetchImpl = globalThis.fetch } = {}) {
  const url = `${OKX_BASE}/public/position-tiers?instType=SWAP&tdMode=cross&instFamily=${instFamily}`;
  const res = await fetchImpl(url, { signal: AbortSignal.timeout(TIMEOUT_MS) });
  if (!res.ok) throw new Error(`position-tiers ${instFamily}: HTTP ${res.status}`);
  const body = await res.json();
  return (body?.data ?? [])
    .map((t) => ({ tier: Number(t.tier), maxLeverage: Number(t.maxLever), mmr: Number(t.mmr) }))
    .filter((t) => Number.isFinite(t.maxLeverage) && Number.isFinite(t.mmr))
    .sort((a, b) => a.tier - b.tier);
}

/**
 * The maintenance rate that applies to a position at this leverage.
 *
 * Tiers are ordered by position size: tier 1 is the smallest book and carries
 * the lowest maintenance rate, and the rate climbs as size does. The tier that
 * applies is therefore the *first* one permitting the leverage, not the last —
 * taking the last returned an 8.75% rate for a 10x position and put its
 * liquidation 1.37% away instead of 9.6%, which is not a rounding error but a
 * different trade.
 *
 * This assumes a position small enough for tier 1, which is true of anyone
 * reading this and false of a desk. Size is not something public data reveals.
 */
export function mmrFor(tiers, leverage) {
  const eligible = tiers.filter((t) => t.maxLeverage >= leverage);
  return eligible.length ? eligible[0].mmr : (tiers.at(0)?.mmr ?? 0.004);
}

/**
 * Exact liquidation price for one position.
 *
 * Solved from equity = maintenance margin. For a long, entry E at leverage L:
 *   E/L - (E - P) = mmr * P   ->   P = E * (1 - 1/L) / (1 - mmr)
 * and the mirror for a short. Fees and funding are excluded, which moves the
 * real level slightly *closer* to entry, not further — so this stays on the
 * conservative side of the mistake that matters.
 */
export function liquidationPrice(entry, leverage, mmr, side = "long") {
  if (!(entry > 0) || !(leverage > 1)) return NaN;
  return side === "long"
    ? (entry * (1 - 1 / leverage)) / (1 - mmr)
    : (entry * (1 + 1 / leverage)) / (1 + mmr);
}

/** The naive formula in wide circulation, kept only so the gap can be shown. */
export const naiveLiquidationPrice = (entry, leverage, side = "long") =>
  side === "long" ? entry * (1 - 1 / leverage) : entry * (1 + 1 / leverage);

/**
 * Liquidation bands for a position opened right now.
 *
 * This is the honest half: no assumption about anyone else's book, just the
 * arithmetic of what happens to *your* position at each leverage.
 */
export function bandsFor(price, tiers, { leverages = [10, 25, 50, 100] } = {}) {
  return leverages.map((leverage) => {
    const mmr = mmrFor(tiers, leverage);
    const long = liquidationPrice(price, leverage, mmr, "long");
    const short = liquidationPrice(price, leverage, mmr, "short");
    return {
      leverage,
      mmr,
      longLiquidation: long,
      shortLiquidation: short,
      longDistancePct: (long / price - 1) * 100,
      shortDistancePct: (short / price - 1) * 100,
      /**
       * How far below the real level the widely copied formula sits. Positive
       * means it flatters the position: it says you survive to a price you were
       * already liquidated at.
       */
      naiveLongUnderstatement: long - naiveLiquidationPrice(price, leverage, "long"),
    };
  });
}

/**
 * Where liquidations would cluster, under a stated assumption.
 *
 * Each candle contributes its turnover at its typical price, as a stand-in for
 * positions opened there. Recency-weighted with a half-life, because a
 * position opened three days ago is far less likely to still be open than one
 * opened this morning — without that, an old high-volume day dominates a map
 * of what is live now.
 *
 * Returns buckets in price order. The weights are relative and have no unit:
 * they say where positions concentrate, never how many dollars sit there.
 */
export function clusterMap(candles, tiers, {
  price,
  leverages = [25, 50, 100],
  bucketPct = 0.25,
  halfLifeHours = 24,
} = {}) {
  if (!candles?.length || !(price > 0)) return [];
  const latest = candles.at(-1).openTime;
  const buckets = new Map();

  for (const c of candles) {
    const typical = (c.high + c.low + c.close) / 3;
    if (!(typical > 0) || !(c.quoteVolume > 0)) continue;
    const ageHours = (latest - c.openTime) / 3_600_000;
    const recency = Math.pow(0.5, ageHours / halfLifeHours);

    for (const leverage of leverages) {
      const mmr = mmrFor(tiers, leverage);
      // Longs opened here die below; shorts opened here die above. Only the
      // side that has not already been stopped out is worth mapping, so a level
      // already passed by price is skipped rather than counted twice.
      for (const side of ["long", "short"]) {
        const level = liquidationPrice(typical, leverage, mmr, side);
        if (!Number.isFinite(level)) continue;
        if (side === "long" && level >= price) continue;
        if (side === "short" && level <= price) continue;

        const key = Math.round(Math.log(level / price) / Math.log(1 + bucketPct / 100));
        const bucket = buckets.get(key) ?? { key, level: 0, weight: 0, side };
        // Weight the bucket's representative level by its own contributions so
        // it lands where the mass is, not at the arbitrary bucket edge.
        bucket.level = (bucket.level * bucket.weight + level * c.quoteVolume * recency)
          / (bucket.weight + c.quoteVolume * recency);
        bucket.weight += c.quoteVolume * recency;
        bucket.side = side;
        buckets.set(key, bucket);
      }
    }
  }

  const rows = [...buckets.values()].filter((b) => b.weight > 0);
  const total = rows.reduce((s, b) => s + b.weight, 0);
  return rows
    .map((b) => ({
      level: b.level,
      side: b.side,
      sharePct: (b.weight / total) * 100,
      distancePct: (b.level / price - 1) * 100,
    }))
    .sort((a, b) => a.level - b.level);
}

/** The heaviest cluster on each side of the current price. */
export function nearestClusters(clusters, price, { top = 3 } = {}) {
  const below = clusters.filter((c) => c.level < price).sort((a, b) => b.sharePct - a.sharePct).slice(0, top);
  const above = clusters.filter((c) => c.level > price).sort((a, b) => b.sharePct - a.sharePct).slice(0, top);
  return { below, above };
}

const n0 = (v) => Math.round(v).toLocaleString("en-US");
const f2 = (v) => (Number.isFinite(v) ? v.toFixed(2) : "—");

export function formatLiquidation({ symbol, price, bands, clusters }) {
  const lines = [`Liquidation map — ${symbol} at ${n0(price)}`, ""];
  lines.push("  A position opened now is liquidated at:");
  lines.push("  LEV       long liq         short liq      mmr    naive formula misses by");
  for (const b of bands) {
    lines.push(
      `  ${String(b.leverage + "x").padEnd(6)} ${n0(b.longLiquidation).padStart(8)} (${f2(b.longDistancePct)}%)  ` +
        `${n0(b.shortLiquidation).padStart(8)} (+${f2(b.shortDistancePct)}%)  ` +
        `${(b.mmr * 100).toFixed(2)}%   ${n0(b.naiveLongUnderstatement)}`,
    );
  }

  if (clusters?.length) {
    const { below, above } = nearestClusters(clusters, price);
    lines.push("", "  Where positions opened in the last days would be liquidated:");
    lines.push("  (assumes turnover marks positions still held — a model, not a feed)");
    for (const c of above) lines.push(`   above  ${n0(c.level).padStart(8)}  ${f2(c.distancePct)}%  weight ${f2(c.sharePct)}%  shorts`);
    for (const c of below) lines.push(`   below  ${n0(c.level).padStart(8)}  ${f2(c.distancePct)}%  weight ${f2(c.sharePct)}%  longs`);
  }
  return lines.join("\n");
}
