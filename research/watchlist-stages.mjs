/**
 * Which stage of a move is each watchlist token in?
 *
 * The stage classifier answers a different question from the signal board. The
 * board asks whether a geometry pays; this asks how far through a move the
 * asset already is — whether participation is still arriving or has left.
 *
 * Every input to the decision is printed alongside the verdict, because
 * "3 exhaustion" is a label and the four numbers under it are the argument. A
 * classifier that shows only its output cannot be disagreed with.
 *
 * The overhead figure comes from an hourly volume profile rather than the
 * older whole-daily-bar proxy, which on BTC differed by thirteen points. Since
 * overhead is one of the two gates that decides "live", that difference can
 * change the stage itself — so the old number is computed too and any pair
 * where the two methods disagree about the classification is flagged.
 */

import { writeFileSync } from "node:fs";
import { analyzeAsset, atr, fetchKlines } from "../src/analysis.mjs";
import { volumeProfile } from "../src/profile.mjs";
import { classifyStage, computeStageMetrics, THRESHOLDS } from "../src/stage.mjs";
import { AGREEMENT_WINDOWS, signalFor } from "../src/signals.mjs";

const WATCHLIST = ["SOL", "BNB", "GIGGLE", "ENA", "ETH", "BTC", "ICP"];
const DAYS = 30;

const retry = async (fn, n = 6) => {
  let last;
  for (let i = 0; i < n; i++) {
    try { return await fn(); } catch (e) { last = e; await new Promise((r) => setTimeout(r, 1200 * (i + 1))); }
  }
  throw last;
};

const rows = [];
for (const name of WATCHLIST) {
  const symbol = `${name}USDT`;
  const daily = await retry(() => fetchKlines(symbol, { interval: "1d", limit: 1000 }));
  const hourly = await retry(() => fetchKlines(symbol, { interval: "1h", limit: DAYS * 24 }));
  const analysis = await retry(() => analyzeAsset(symbol, { candles: daily }));
  const price = analysis.price;

  const window = daily.slice(-DAYS);
  const byBars = computeStageMetrics(window, price);
  const profile = volumeProfile(hourly, price);

  // Same metrics, but with overhead measured properly. Overhead feeds the
  // "live" gate, so swapping it can move the verdict.
  const byProfile = { ...byBars, underwaterPct: profile?.overheadPct ?? byBars.underwaterPct };

  const stageBars = classifyStage(byBars);
  const stageProfile = classifyStage(byProfile);

  const atrPct = (atr(daily, 14) / price) * 100;
  const signal = signalFor({
    symbol, candles: daily, atrPct, price,
    turnoverUsd: Number.isFinite(analysis.avgQuoteVolume30d) ? analysis.avgQuoteVolume30d : null,
  });

  rows.push({
    asset: name,
    price,
    stage: stageProfile.stage,
    note: stageProfile.note,
    stageByDailyBars: stageBars.stage,
    methodsDisagree: stageBars.stage !== stageProfile.stage,
    metrics: {
      underwaterPct: byProfile.underwaterPct,
      underwaterByDailyBarsPct: byBars.underwaterPct,
      vsVwapPct: byBars.vsVwapPct,
      volumeTrendPct: byBars.volumeTrendPct,
      recentPricePct: byBars.recentPricePct,
      concentrationPct: byBars.concentrationPct,
      drawdownPct: byBars.drawdownPct,
      vwap: byBars.vwap,
    },
    gates: {
      live: byProfile.underwaterPct < THRESHOLDS.liveUnderwaterPct,
      moving: byBars.recentPricePct > THRESHOLDS.movePricePct,
      volumeExpanding: byBars.volumeTrendPct > THRESHOLDS.expandingVolumePct,
      volumeDraining: byBars.volumeTrendPct < THRESHOLDS.drainingVolumePct,
    },
    profile: profile && {
      poc: profile.pocPrice, valueAreaLow: profile.valueAreaLow, valueAreaHigh: profile.valueAreaHigh,
      priceVsArea: price > profile.valueAreaHigh ? "above" : price < profile.valueAreaLow ? "below" : "inside",
    },
    rangePosition30d: analysis.rangePosition30d,
    rsi14: analysis.rsi14,
    turnoverUsd: analysis.avgQuoteVolume30d,
    call: {
      bias: signal.bias,
      agreeing: signal.agreement?.agreeing ?? null,
      windows: signal.agreement?.windows ?? null,
      expectancyR: signal.plan?.expectancyR ?? null,
      effectiveN: signal.plan?.effectiveN ?? null,
    },
  });
}

const out = {
  measuredAt: new Date().toISOString(),
  windowDays: DAYS,
  thresholds: THRESHOLDS,
  agreementWindows: AGREEMENT_WINDOWS,
  rows,
};
writeFileSync("research/watchlist-stages.json", `${JSON.stringify(out, null, 2)}\n`);

const f = (v, d = 1) => (typeof v === "number" && Number.isFinite(v) ? v.toFixed(d) : "—");
console.log(`Stage of the move · ${DAYS}-day window · ${out.measuredAt.slice(0, 16)}Z\n`);
console.log("asset    price        stage           overhead  vsVWAP  volTrend   move   conc   range");
for (const r of rows) {
  console.log(
    r.asset.padEnd(8)
    + String(f(r.price, r.price > 1000 ? 0 : r.price > 1 ? 2 : 5)).padStart(9) + "  "
    + r.stage.padEnd(14)
    + (f(r.metrics.underwaterPct) + "%").padStart(9)
    + (f(r.metrics.vsVwapPct) + "%").padStart(8)
    + (f(r.metrics.volumeTrendPct) + "%").padStart(10)
    + (f(r.metrics.recentPricePct) + "%").padStart(8)
    + (f(r.metrics.concentrationPct) + "%").padStart(7)
    + (f(r.rangePosition30d) + "%").padStart(8),
  );
}
console.log("\nwhy each verdict — gates that decided it:");
for (const r of rows) {
  const g = r.gates;
  console.log(`  ${r.asset.padEnd(7)} ${r.stage.padEnd(14)} live=${String(g.live).padEnd(5)} moving=${String(g.moving).padEnd(5)}`
    + ` volExpanding=${String(g.volumeExpanding).padEnd(5)} volDraining=${String(g.volumeDraining).padEnd(5)} — ${r.note}`);
}
console.log("\nprice against the 30-day volume profile:");
for (const r of rows) {
  if (!r.profile) continue;
  console.log(`  ${r.asset.padEnd(7)} ${r.profile.priceVsArea.padEnd(7)} value area ${f(r.profile.valueAreaLow, 4)} – ${f(r.profile.valueAreaHigh, 4)}   POC ${f(r.profile.poc, 4)}`);
}
console.log("\nboard call for context:");
for (const r of rows) {
  console.log(`  ${r.asset.padEnd(7)} ${r.call.bias.padEnd(6)}`
    + (r.call.windows ? `${r.call.agreeing}/${r.call.windows} lookbacks  E ${f(r.call.expectancyR, 2)}R  n≈${Math.round(r.call.effectiveN)}` : "no direction"));
}
const flipped = rows.filter((r) => r.methodsDisagree);
console.log(`\noverhead method changes the stage on: ${flipped.length ? flipped.map((r) => `${r.asset} (${r.stageByDailyBars} → ${r.stage})`).join(", ") : "none"}`);
