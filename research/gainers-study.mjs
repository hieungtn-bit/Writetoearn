/**
 * What happens if you buy the top of the gainers list?
 *
 * Yesterday a reader sent a screenshot of Binance's "Tăng giá" tab and asked
 * why our board misses those names. Today the two at the top of it are down
 * 28.9% and 21.5%. Two anecdotes are not a finding, so this measures the
 * question properly across every day the universe has history for.
 *
 * The construction mirrors what a person actually does: at the close of each
 * day, rank every liquid pair by that day's move, take the top ten, buy them,
 * and hold. The baseline is buying an arbitrary liquid pair on the same day,
 * which is the comparison that separates "gainers do badly" from "everything
 * did badly that week".
 *
 * Liquidity is judged on the day itself rather than today, because a pair that
 * is liquid now may have been untradeable then, and using today's turnover to
 * filter a trade from last March is hindsight.
 */

import { writeFileSync } from "node:fs";
import { fetchKlines } from "../src/analysis.mjs";
import { liveUniverse } from "../src/universe.mjs";

const PAIRS = Number(process.env.PAIRS ?? 100);
const TOP_N = 10;
const MIN_TURNOVER = 2e6;
const HOLD_DAYS = [1, 3, 7, 14];

const retry = async (fn, n = 6) => {
  let last;
  for (let i = 0; i < n; i++) {
    try { return await fn(); } catch (e) { last = e; await new Promise((r) => setTimeout(r, 1200 * (i + 1))); }
  }
  throw last;
};

const { symbols } = await retry(() => liveUniverse({ limit: PAIRS }));

/** Daily candles keyed by date, per pair, so days can be compared across pairs. */
const byDate = new Map();
let loaded = 0;
for (const [i, symbol] of symbols.entries()) {
  process.stderr.write(`\rloading ${i + 1}/${symbols.length} ${symbol.padEnd(14)}`);
  try {
    const bars = await retry(() => fetchKlines(symbol, { interval: "1d", limit: 1000 }));
    loaded += 1;
    for (const [k, bar] of bars.entries()) {
      if (k === 0) continue;
      const date = new Date(bar.openTime).toISOString().slice(0, 10);
      const changePct = ((bar.close / bars[k - 1].close) - 1) * 100;
      if (!byDate.has(date)) byDate.set(date, []);
      byDate.get(date).push({
        symbol,
        close: bar.close,
        changePct,
        turnover: bar.quoteVolume,
        // Forward closes, taken from this pair's own series.
        forward: Object.fromEntries(
          HOLD_DAYS.map((h) => [h, bars[k + h] ? ((bars[k + h].close / bar.close) - 1) * 100 : null]),
        ),
      });
    }
  } catch { /* a pair that will not load is simply absent from those days */ }
}
process.stderr.write("\r");

const median = (xs) => {
  if (!xs.length) return null;
  const s = [...xs].sort((a, b) => a - b);
  return s.length % 2 ? s[s.length >> 1] : (s[s.length / 2 - 1] + s[s.length / 2]) / 2;
};

const gainers = Object.fromEntries(HOLD_DAYS.map((h) => [h, []]));
const everyone = Object.fromEntries(HOLD_DAYS.map((h) => [h, []]));
let daysUsed = 0;

for (const [date, rows] of [...byDate.entries()].sort()) {
  const liquid = rows.filter((r) => r.turnover >= MIN_TURNOVER);
  if (liquid.length < 20) continue; // too few pairs listed then to rank meaningfully
  daysUsed += 1;

  const top = [...liquid].sort((a, b) => b.changePct - a.changePct).slice(0, TOP_N);
  for (const h of HOLD_DAYS) {
    for (const r of top) if (r.forward[h] != null) gainers[h].push(r.forward[h]);
    for (const r of liquid) if (r.forward[h] != null) everyone[h].push(r.forward[h]);
  }
}

const table = HOLD_DAYS.map((h) => {
  const g = gainers[h], e = everyone[h];
  const gUp = (g.filter((v) => v > 0).length / g.length) * 100;
  const eUp = (e.filter((v) => v > 0).length / e.length) * 100;
  return {
    holdDays: h,
    gainersMedianPct: median(g),
    baselineMedianPct: median(e),
    differencePct: median(g) - median(e),
    gainersUpPct: gUp,
    baselineUpPct: eUp,
    gainerTrades: g.length,
    /** Ten names a day overlap heavily inside a holding period. */
    effectiveN: g.length / (TOP_N * h),
  };
});

/** The same question asked of the single biggest gainer each day. */
const single = Object.fromEntries(HOLD_DAYS.map((h) => [h, []]));
for (const [, rows] of byDate.entries()) {
  const liquid = rows.filter((r) => r.turnover >= MIN_TURNOVER);
  if (liquid.length < 20) continue;
  const best = [...liquid].sort((a, b) => b.changePct - a.changePct)[0];
  for (const h of HOLD_DAYS) if (best.forward[h] != null) single[h].push(best.forward[h]);
}

const out = {
  measuredAt: new Date().toISOString(),
  pairsLoaded: loaded,
  daysUsed,
  topN: TOP_N,
  minTurnoverUsd: MIN_TURNOVER,
  table,
  biggestGainer: HOLD_DAYS.map((h) => ({
    holdDays: h,
    medianPct: median(single[h]),
    upPct: (single[h].filter((v) => v > 0).length / single[h].length) * 100,
    n: single[h].length,
  })),
};
writeFileSync("research/gainers-study.json", `${JSON.stringify(out, null, 2)}\n`);

console.log(`${loaded} pairs · ${daysUsed} days with enough listings to rank\n`);
console.log("Buying the day's top 10 gainers, then holding:");
console.log("hold     gainers median   baseline median    diff    gainers up%   baseline up%   n(eff)");
for (const r of table) {
  console.log(
    String(r.holdDays + "d").padEnd(9)
    + (r.gainersMedianPct.toFixed(2) + "%").padStart(14)
    + (r.baselineMedianPct.toFixed(2) + "%").padStart(18)
    + (r.differencePct.toFixed(2)).padStart(9)
    + (r.gainersUpPct.toFixed(0) + "%").padStart(14)
    + (r.baselineUpPct.toFixed(0) + "%").padStart(15)
    + String(Math.round(r.effectiveN)).padStart(9),
  );
}
console.log("\nBuying only the single biggest gainer of the day:");
for (const r of out.biggestGainer) {
  console.log(`  ${String(r.holdDays + "d").padEnd(5)} median ${r.medianPct.toFixed(2)}%   up ${r.upPct.toFixed(0)}% of the time   n=${r.n}`);
}
