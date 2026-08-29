/**
 * Checking a watchlist commentary against measurement.
 *
 * The post makes four claims that are counts or comparisons rather than
 * opinions, and every one is checkable:
 *
 *   1. $615 is resistance "that has rejected many times" on BNB
 *   2. BNB has "broken clean through" it
 *   3. ENA is the "earliest" name — long base, not extended, clean structure
 *   4. SOL is relatively stronger than BTC and ETH today
 *
 * The first is the one worth the most care. "Repeatedly rejected" is a count,
 * and this desk has already published a case where a zone described that way
 * had been touched zero times. So the touches are counted the same way here:
 * a touch is a bar whose high reaches the zone, and the outcome is where price
 * closed a fixed number of bars later.
 */

import { writeFileSync } from "node:fs";
import { analyzeAsset, fetchKlines } from "../src/analysis.mjs";
import { volumeProfile } from "../src/profile.mjs";

const retry = async (fn, n = 6) => {
  let last;
  for (let i = 0; i < n; i++) {
    try { return await fn(); } catch (e) { last = e; await new Promise((r) => setTimeout(r, 1200 * (i + 1))); }
  }
  throw last;
};

/**
 * How often did price reach a zone, and what happened next?
 *
 * A "touch" needs a gap since the previous one, or a single approach spread
 * over six bars counts as six rejections. `settleBars` is dropped from the end
 * because those touches have no outcome yet — the same correction that made a
 * previous zone count honest.
 */
function zoneTouches(candles, low, high, { settleBars = 12, cooldown = 6 } = {}) {
  const touches = [];
  let lastIdx = -Infinity;
  for (let i = 0; i < candles.length - settleBars; i++) {
    const c = candles[i];
    if (c.high < low) continue;              // never reached the zone
    if (i - lastIdx < cooldown) continue;    // same approach, already counted
    lastIdx = i;
    const later = candles[i + settleBars];
    touches.push({
      at: new Date(c.openTime).toISOString().slice(0, 16),
      high: c.high,
      closedAbove: c.close > high,
      laterClose: later.close,
      rejected: later.close < low,
      brokeThrough: later.close > high,
    });
  }
  return touches;
}

const BNB_ZONE = [612, 618];
const bnb4h = await retry(() => fetchKlines("BNBUSDT", { interval: "4h", limit: 500 }));
const bnb1d = await retry(() => fetchKlines("BNBUSDT", { interval: "1d", limit: 400 }));
const bnbAnalysis = await retry(() => analyzeAsset("BNBUSDT", { candles: bnb1d }));

const touches4h = zoneTouches(bnb4h, ...BNB_ZONE);
const touches1d = zoneTouches(bnb1d, ...BNB_ZONE, { settleBars: 5, cooldown: 3 });

/** Has BNB actually cleared the zone, or is it sitting in it? */
const bnbPrice = bnbAnalysis.price;
const bnbState = bnbPrice > BNB_ZONE[1] ? "above the zone"
  : bnbPrice >= BNB_ZONE[0] ? "inside the zone" : "below the zone";
const last30 = bnb1d.slice(-30);
const bnbHigh30 = Math.max(...last30.map((c) => c.high));

/** Closes above the zone in the last 10 daily bars — is the break holding? */
const recentCloses = bnb1d.slice(-10).map((c) => ({
  day: new Date(c.openTime).toISOString().slice(0, 10),
  close: c.close,
  aboveZone: c.close > BNB_ZONE[1],
}));

/** Relative strength: each name against BTC over three horizons. */
const NAMES = ["SOL", "BNB", "GIGGLE", "ENA", "ETH", "BTC", "ICP"];
const perf = {};
for (const name of NAMES) {
  const d = await retry(() => fetchKlines(`${name}USDT`, { interval: "1d", limit: 60 }));
  // 30 days of hourly bars. Fetching 200 and slicing 720 silently produced an
  // eight-day profile, which read ENA's overhead as 73.7% against 27.1%.
  const h = await retry(() => fetchKlines(`${name}USDT`, { interval: "1h", limit: 30 * 24 }));
  const a = await retry(() => analyzeAsset(`${name}USDT`, { candles: d }));
  const price = a.price;
  const ago = (bars, series) => series[series.length - 1 - bars]?.close ?? null;
  const chg = (then) => (then ? ((price / then) - 1) * 100 : null);
  const prof = volumeProfile(h, price);
  if (h.length < 30 * 24 * 0.9) throw new Error(`${name}: only ${h.length} hourly bars, profile would not be 30 days`);
  perf[name] = {
    price,
    change24hPct: chg(ago(24, h)),
    change7dPct: chg(ago(7, d)),
    change30dPct: chg(ago(30, d)),
    rangePosition30d: a.rangePosition30d,
    overheadPct: prof?.overheadPct ?? null,
  };
}

/** Relative to BTC, which is what "stronger than BTC" has to mean. */
for (const name of NAMES) {
  perf[name].vsBtc24h = perf[name].change24hPct - perf.BTC.change24hPct;
  perf[name].vsBtc7d = perf[name].change7dPct - perf.BTC.change7dPct;
}

const claims = {
  "BNB has broken above the 612-618 zone": bnbPrice > BNB_ZONE[1],
  "the zone rejected BNB many times before": touches4h.filter((t) => t.rejected).length >= 3,
  "SOL is outperforming BTC over 24h": perf.SOL.vsBtc24h > 0,
  "SOL is outperforming ETH over 24h": perf.SOL.change24hPct > perf.ETH.change24hPct,
  "ENA is not extended": perf.ENA.rangePosition30d < 50,
  "ENA has a cleaner structure than ICP": perf.ENA.overheadPct < perf.ICP.overheadPct,
  "ICP is pulling back": perf.ICP.change24hPct < 0,
};

const out = {
  measuredAt: new Date().toISOString(),
  claims,
  bnb: {
    price: bnbPrice,
    zone: BNB_ZONE,
    state: bnbState,
    high30d: bnbHigh30,
    clearsPriorHighBy: ((bnbPrice / bnbHigh30) - 1) * 100,
    touches4h: { total: touches4h.length, rejected: touches4h.filter((t) => t.rejected).length, detail: touches4h },
    touches1d: { total: touches1d.length, rejected: touches1d.filter((t) => t.rejected).length },
    recentCloses,
  },
  perf,
};
writeFileSync("research/watchlist-post-check.json", `${JSON.stringify(out, null, 2)}\n`);

console.log(`BNB $${bnbPrice} — ${bnbState} $${BNB_ZONE[0]}–${BNB_ZONE[1]}`);
console.log(`30-day high $${bnbHigh30} · price is ${out.bnb.clearsPriorHighBy.toFixed(2)}% against it\n`);
console.log(`4H touches of the zone (settled): ${touches4h.length}, of which rejected: ${touches4h.filter((t) => t.rejected).length}`);
for (const t of touches4h.slice(-8)) {
  console.log(`   ${t.at}  high ${t.high.toFixed(2)}  → 12 bars later ${t.laterClose.toFixed(2)}  ${t.rejected ? "REJECTED" : t.brokeThrough ? "broke through" : "inside"}`);
}
console.log(`\nDaily touches: ${touches1d.total ?? touches1d.length}, rejected: ${touches1d.filter((t) => t.rejected).length}`);
console.log("\nlast 10 daily closes vs the zone top:");
for (const c of recentCloses) console.log(`   ${c.day}  ${c.close.toFixed(2)}  ${c.aboveZone ? "above" : "below"}`);

console.log("\nperformance:");
console.log("asset      24h      7d     30d   vs BTC 24h   range   overhead");
for (const n of NAMES) {
  const p = perf[n];
  const f = (v, d = 2) => (v == null ? "  —" : v.toFixed(d));
  console.log(n.padEnd(8) + (f(p.change24hPct) + "%").padStart(8) + (f(p.change7dPct) + "%").padStart(8)
    + (f(p.change30dPct) + "%").padStart(8) + (f(p.vsBtc24h) + "%").padStart(13)
    + (f(p.rangePosition30d, 1) + "%").padStart(9) + (f(p.overheadPct, 1) + "%").padStart(11));
}
console.log("\nclaims:");
for (const [k, v] of Object.entries(claims)) console.log(`  ${v ? "OK  " : "NO  "} ${k}`);
