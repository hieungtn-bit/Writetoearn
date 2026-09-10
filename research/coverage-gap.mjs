/**
 * Why the board misses the movers.
 *
 * A reader sent a screenshot of the day's gainers — twelve names up between
 * 5% and 30% — and asked why none of them appear on our board. Two candidate
 * explanations, and they need separating because they call for different
 * fixes:
 *
 *   1. Coverage. We do not scan those pairs at all.
 *   2. Design. We scan them and the engine declines to call them.
 *
 * The first is a list that is too short. The second would be a scoring
 * question. Guessing which one it is would be exactly the error this desk
 * keeps writing about, so both are measured.
 */

import { writeFileSync } from "node:fs";
import { ALT_UNIVERSE } from "../src/screen.mjs";

const MAJORS = ["BTCUSDT", "ETHUSDT", "SOLUSDT", "BNBUSDT"];
const OURS = new Set([...MAJORS, ...ALT_UNIVERSE, "GIGGLEUSDT"]);

const retry = async (fn, n = 6) => {
  let last;
  for (let i = 0; i < n; i++) {
    try { return await fn(); } catch (e) { last = e; await new Promise((r) => setTimeout(r, 1200 * (i + 1))); }
  }
  throw last;
};

const info = await retry(() => fetch("https://data-api.binance.vision/api/v3/exchangeInfo").then((r) => r.json()));
const tradingUsdt = info.symbols
  .filter((s) => s.quoteAsset === "USDT" && s.status === "TRADING")
  .map((s) => s.symbol);

/** One request for every pair's 24h statistics. */
const tickers = await retry(() => fetch("https://data-api.binance.vision/api/v3/ticker/24hr").then((r) => r.json()));
const byPair = new Map(tickers.map((t) => [t.symbol, t]));

const rows = tradingUsdt
  .map((symbol) => {
    const t = byPair.get(symbol);
    if (!t) return null;
    return {
      symbol,
      asset: symbol.replace(/USDT$/, ""),
      changePct: Number(t.priceChangePercent),
      quoteVolumeUsd: Number(t.quoteVolume),
      inOurUniverse: OURS.has(symbol),
    };
  })
  .filter((r) => r && Number.isFinite(r.changePct));

const gainers = [...rows].sort((a, b) => b.changePct - a.changePct);

/** How much of the moving market can we even see? */
const coverageAt = (n) => {
  const top = gainers.slice(0, n);
  return {
    n,
    covered: top.filter((r) => r.inOurUniverse).length,
    coveredPct: (top.filter((r) => r.inOurUniverse).length / n) * 100,
    names: top.map((r) => `${r.asset} ${r.changePct.toFixed(1)}%${r.inOurUniverse ? " (ours)" : ""}`),
  };
};

/** The liquidity gate the board applies, tested against the movers. */
const MIN_TURNOVER = 2e6;
const top30 = gainers.slice(0, 30);
const moversAboveGate = top30.filter((r) => r.quoteVolumeUsd >= MIN_TURNOVER);

const SHOT = ["HOLO", "PROM", "LSK", "CRWVB", "HOME", "NBISB", "SMCIB", "FLOW", "SCRT", "DGB", "NEAR", "ESP"];
const fromScreenshot = SHOT.map((a) => {
  const r = rows.find((x) => x.asset === a);
  return r ? { ...r, rank: gainers.findIndex((g) => g.symbol === r.symbol) + 1 } : { asset: a, missing: true };
});

const out = {
  measuredAt: new Date().toISOString(),
  tradingUsdtPairs: tradingUsdt.length,
  weScan: OURS.size,
  weScanPct: (OURS.size / tradingUsdt.length) * 100,
  coverage: [10, 20, 30, 50].map(coverageAt),
  screenshot: fromScreenshot,
  gate: {
    minTurnoverUsd: MIN_TURNOVER,
    top30Movers: top30.length,
    aboveGate: moversAboveGate.length,
    aboveGateNames: moversAboveGate.map((r) => `${r.asset} ${r.changePct.toFixed(1)}% $${(r.quoteVolumeUsd / 1e6).toFixed(1)}M`),
  },
  marketBreadth: {
    up: rows.filter((r) => r.changePct > 0).length,
    down: rows.filter((r) => r.changePct < 0).length,
    upOver5Pct: rows.filter((r) => r.changePct > 5).length,
    upOver10Pct: rows.filter((r) => r.changePct > 10).length,
  },
};
writeFileSync("research/coverage-gap.json", `${JSON.stringify(out, null, 2)}\n`);

console.log(`Binance spot USDT pairs trading: ${out.tradingUsdtPairs}`);
console.log(`We scan: ${out.weScan}  (${out.weScanPct.toFixed(1)}% of the market)\n`);

console.log("Coverage of today's biggest gainers:");
for (const c of out.coverage) console.log(`  top ${String(c.n).padStart(2)}: ${c.covered} of ${c.n} are in our universe  (${c.coveredPct.toFixed(0)}%)`);

console.log("\nToday's top 12 movers:");
for (const r of gainers.slice(0, 12)) {
  console.log(`  ${r.asset.padEnd(8)} ${r.changePct.toFixed(2).padStart(7)}%  $${(r.quoteVolumeUsd / 1e6).toFixed(1).padStart(7)}M  ${r.inOurUniverse ? "IN our universe" : "not scanned"}`);
}

console.log("\nThe screenshot names, ranked by today's move across the whole market:");
for (const r of fromScreenshot) {
  if (r.missing) { console.log(`  ${r.asset.padEnd(8)} not a spot USDT pair`); continue; }
  console.log(`  ${r.asset.padEnd(8)} ${r.changePct.toFixed(2).padStart(7)}%  rank ${String(r.rank).padStart(3)}/${out.tradingUsdtPairs}  $${(r.quoteVolumeUsd / 1e6).toFixed(1).padStart(7)}M  ${r.inOurUniverse ? "IN" : "not scanned"}`);
}

console.log(`\nOf the top 30 movers, ${out.gate.aboveGate} clear the $2M turnover gate the board applies:`);
for (const n of out.gate.aboveGateNames.slice(0, 12)) console.log(`   ${n}`);

console.log(`\nMarket breadth: ${out.marketBreadth.up} up / ${out.marketBreadth.down} down`
  + ` · ${out.marketBreadth.upOver5Pct} up more than 5% · ${out.marketBreadth.upOver10Pct} up more than 10%`);
