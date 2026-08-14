/**
 * A market-wide recommendation assembled only from what survived testing.
 *
 * This week four of this desk's own claims were measured. Three came back
 * negative and one came back half right, so a recommendation written today has
 * a short list of things it is allowed to lean on:
 *
 *   kept    direction, which survived out-of-sample testing — but only on the
 *           short side, where plans held +0.085R against a random pick's
 *           +0.073R, while longs held -0.048R and stayed positive on 27% of
 *           pairs (research/selection-bias.json)
 *   kept    lookback agreement, as a stability check across five windows
 *   kept    a fixed 1.5 ATR stop, the width that peaked in three panels of
 *           four (research/stop-law.json)
 *   kept    sample size, now that the board ranks with it
 *   dropped per-pair geometry optimisation: keeps a tenth of itself
 *   dropped trapped overhead supply: predicts nothing (research/overhead-test.json)
 *
 * So the geometry here is *fixed by rule* rather than chosen per pair — 1.5 ATR
 * stop, 2:1 target, thirty days — and then scored. That is the whole point: a
 * geometry nobody selected cannot be inflated by the selection, so its
 * expectancy is an estimate rather than a maximum.
 *
 * Breadth is measured across every USDT pair on the exchange, not just the
 * scanned hundred, because a recommendation about "the market" should not be
 * derived from the subset that happens to be liquid enough to trade.
 */

import { readFileSync, writeFileSync } from "node:fs";
import { analyzeAsset, atr, fetchKlines } from "../src/analysis.mjs";
import { walk } from "../src/signals.mjs";

const BOARD = JSON.parse(readFileSync("site/signals.json", "utf8"));
const STOP_ATR = 1.5;
const RR = 2;
const HORIZON = 30;
const FEE_PCT = 0.2;
/** Independent episodes below which the board already calls a row thin. */
const MIN_EFFECTIVE_N = 12;
/** Sizing is quoted against this account, risking this share of it per trade. */
const ACCOUNT_BASE = 1000;
const RISK_PCT = 1;

const retry = async (fn, n = 6) => {
  let last;
  for (let i = 0; i < n; i++) {
    try { return await fn(); } catch (e) { last = e; await new Promise((r) => setTimeout(r, 1200 * (i + 1))); }
  }
  throw last;
};

const median = (xs) => {
  if (!xs.length) return null;
  const s = [...xs].sort((a, b) => a - b);
  const m = s.length >> 1;
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};

/** Breadth across the whole exchange, not the scanned subset. */
const tickers = await retry(async () => {
  const r = await fetch("https://data-api.binance.vision/api/v3/ticker/24hr");
  if (!r.ok) throw new Error(`ticker/24hr -> ${r.status}`);
  return r.json();
});
const usdt = tickers.filter((t) => t.symbol.endsWith("USDT") && Number(t.quoteVolume) > 0);
const changes = usdt.map((t) => Number(t.priceChangePercent));
const breadth = {
  pairs: usdt.length,
  up: changes.filter((c) => c > 0).length,
  down: changes.filter((c) => c < 0).length,
  upSharePct: (changes.filter((c) => c > 0).length / changes.length) * 100,
  medianChangePct: median(changes),
  upOver5: changes.filter((c) => c > 5).length,
  downOver5: changes.filter((c) => c < -5).length,
  downOver10: changes.filter((c) => c < -10).length,
};

/**
 * Rows the surviving filters admit.
 *
 * Every condition here traces to a measurement rather than to taste: liquidity
 * because a plan that cannot be filled is not a plan, sample because the board
 * itself calls anything under twelve episodes thin, and unanimity across the
 * five lookbacks because a direction that only pays inside one window is a
 * property of that window.
 */
const qualifying = BOARD.signals.filter((s) =>
  s.tradeable
  && s.bias !== "WAIT"
  && s.confidence
  && s.confidence.effectiveN >= MIN_EFFECTIVE_N
  && s.agreement?.windows === 5
  && s.agreement.agreeing === 5);

const scored = [];
for (const s of qualifying) {
  try {
    const daily = await retry(() => fetchKlines(s.symbol, { interval: "1d", limit: 1000 }));
    if (daily.length < 400) continue;
    const analysis = await retry(() => analyzeAsset(s.symbol, { candles: daily }));
    const atrPct = (atr(daily, 14) / analysis.price) * 100;
    const stopPct = STOP_ATR * atrPct;
    if (!(stopPct > 0) || stopPct >= 60) continue;
    const direction = s.bias === "LONG" ? "long" : "short";

    /**
     * The fixed geometry, scored over the whole history and over the recent
     * window separately. Nothing here is chosen, so nothing here is a maximum.
     */
    const full = walk(daily, { direction, stopPct, targetPct: stopPct * RR, horizon: HORIZON });
    const recent = walk(daily.slice(-270), { direction, stopPct, targetPct: stopPct * RR, horizon: HORIZON });
    if (!full || !recent) continue;

    const feeR = FEE_PCT / stopPct;
    const entry = analysis.price;
    scored.push({
      symbol: s.symbol,
      bias: s.bias,
      direction,
      entry,
      atrPct,
      stopPct,
      stop: direction === "long" ? entry * (1 - stopPct / 100) : entry * (1 + stopPct / 100),
      target: direction === "long" ? entry * (1 + stopPct * RR / 100) : entry * (1 - stopPct * RR / 100),
      turnoverUsd: s.turnoverUsd,
      effectiveNBoard: s.confidence.effectiveN,
      /** At 1% of the account risked, what the position is worth. */
      positionUsdPer1000: ((ACCOUNT_BASE * RISK_PCT) / 100) / (stopPct / 100),
      fixed: {
        fullExpectancyR: full.expectancyR,
        fullNetR: full.expectancyR - feeR,
        fullHitPct: full.hitPct,
        fullEffectiveN: full.effectiveN,
        recentExpectancyR: recent.expectancyR,
        recentNetR: recent.expectancyR - feeR,
        recentEffectiveN: recent.effectiveN,
        agreesAcrossWindows: Math.sign(full.expectancyR) === Math.sign(recent.expectancyR),
      },
      feeR,
    });
  } catch { /* absent rather than guessed */ }
}

scored.sort((a, b) => b.fixed.fullNetR - a.fixed.fullNetR);

const shorts = scored.filter((s) => s.direction === "short");
const longs = scored.filter((s) => s.direction === "long");
const summarise = (set) => set.length ? {
  count: set.length,
  medianFullNetR: median(set.map((s) => s.fixed.fullNetR)),
  medianRecentNetR: median(set.map((s) => s.fixed.recentNetR)),
  positiveFull: set.filter((s) => s.fixed.fullNetR > 0).length,
  bothWindowsAgree: set.filter((s) => s.fixed.agreesAcrossWindows).length,
} : null;

const out = {
  measuredAt: new Date().toISOString(),
  boardScannedAt: BOARD.scannedAt,
  rules: {
    stopAtr: STOP_ATR, rewardRatio: RR, horizonDays: HORIZON, feePct: FEE_PCT,
    minEffectiveN: MIN_EFFECTIVE_N, accountBase: ACCOUNT_BASE, riskPct: RISK_PCT,
    riskPerTradeUsd: (ACCOUNT_BASE * RISK_PCT) / 100,
  },
  breadth,
  tally: BOARD.tally,
  qualifying: qualifying.length,
  scored: scored.length,
  shorts: summarise(shorts),
  longs: summarise(longs),
  /** Rows that pass every filter AND pay at the fixed geometry after fees. */
  recommended: scored.filter((s) => s.fixed.fullNetR > 0 && s.fixed.agreesAcrossWindows),
  rejected: scored.filter((s) => !(s.fixed.fullNetR > 0 && s.fixed.agreesAcrossWindows))
    .map((s) => ({ symbol: s.symbol, bias: s.bias, fullNetR: s.fixed.fullNetR, agrees: s.fixed.agreesAcrossWindows })),
  all: scored,
};
writeFileSync("research/market-call.json", `${JSON.stringify(out, null, 2)}\n`);

console.log(`breadth: ${breadth.pairs} USDT pairs · ${breadth.up} up / ${breadth.down} down`
  + ` (${breadth.upSharePct.toFixed(1)}% green) · median ${breadth.medianChangePct.toFixed(2)}%`);
console.log(`  ${breadth.upOver5} up over 5% · ${breadth.downOver5} down over 5% · ${breadth.downOver10} down over 10%`);
console.log(`board ${BOARD.scannedAt}: ${JSON.stringify(BOARD.tally)}`);
console.log(`\n${qualifying.length} rows pass liquidity + sample + unanimous lookbacks; ${scored.length} scored\n`);

console.log("symbol        side    entry       stop%   fixed E   net R   n(eff)  recent net");
for (const s of scored) {
  console.log(
    s.symbol.padEnd(13)
    + s.bias.padEnd(7)
    + String(s.entry.toPrecision(6)).padStart(10)
    + s.stopPct.toFixed(2).padStart(9)
    + s.fixed.fullExpectancyR.toFixed(3).padStart(10)
    + s.fixed.fullNetR.toFixed(3).padStart(8)
    + String(Math.round(s.fixed.fullEffectiveN)).padStart(8)
    + s.fixed.recentNetR.toFixed(3).padStart(12)
    + (s.fixed.agreesAcrossWindows ? "" : "   ⚠ windows disagree"),
  );
}
console.log(`\nshorts: ${JSON.stringify(out.shorts)}`);
console.log(`longs:  ${JSON.stringify(out.longs)}`);
console.log(`\nrecommended after the fixed-geometry test: ${out.recommended.length}`);
for (const s of out.recommended) {
  console.log(`  ${s.symbol.padEnd(12)} ${s.bias.padEnd(6)} entry ${s.entry.toPrecision(6)}`
    + `  stop ${s.stop.toPrecision(6)} (${s.stopPct.toFixed(2)}%)  target ${s.target.toPrecision(6)}`
    + `  $${s.positionUsdPer1000.toFixed(0)} per $1k at 1% risk`);
}
