/**
 * The ICP plan, followed forward from the minute the check was published.
 *
 * Yesterday this desk audited a reader's ICP plan and published three findings:
 * the near target pays 1.28R against a claimed 2.5-3, the fallback stop is one
 * that 71.9% of ICP days would take from the open alone, and 74 backtested
 * breakouts amount to 2.5 independent episodes and settle nothing.
 *
 * Then the trigger fired. That makes this the rarest thing a research desk gets
 * and the one it is most tempted to fudge: a published call with a clock on it.
 *
 * So the rules are fixed before the tape is read, and they are the plan's own.
 *
 *   The start is the minute the post went live, not the start of the day. A
 *   follow-up that begins at a more convenient hour is choosing its entry after
 *   seeing the chart.
 *
 *   The trigger is the plan's: a break above its stated zone. Entry at the
 *   plan's stated entry band, filled at the first hour that trades into it.
 *
 *   The stop, the targets and the partial are the plan's, unchanged. Worst
 *   excursion is measured on the low of every hour held, so an intraday spike
 *   through the stop counts as a stop even if the hour closed above it.
 *
 * What this can and cannot show is the whole discipline. One trade is one
 * draw. It cannot confirm the backtest and it cannot refute it — the post said
 * 2.5 independent episodes settles nothing, and adding a twenty-sixth hour of
 * one trade does not change that. What it can do is show whether the specific,
 * checkable claim about stop placement described what actually happened.
 *
 * Writes research/icp-followthrough.json.
 */

import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { fetchKlines } from "../src/analysis.mjs";

const SYMBOL = "ICPUSDT";
const S = JSON.parse(readFileSync("research/icp-strategy.json", "utf8"));
const PLAN = S.plan, A = S.arithmetic;

/** The post's own publication timestamp, read from the manifest it was filed in. */
const manifest = JSON.parse(readFileSync("site/manifest.json", "utf8"));
const article = manifest.articles.find((a) => a.slug === "icp-plan-checked");
const publishedAt = new Date(article.published).getTime();

const retry = async (fn, n = 5) => {
  let last;
  for (let i = 0; i < n; i++) {
    try { return await fn(); } catch (e) { last = e; await new Promise((r) => setTimeout(r, 800 * (i + 1))); }
  }
  throw last;
};

const bars = await retry(() => fetchKlines(SYMBOL, { interval: "1h", limit: 200 }));
const after = bars.filter((b) => b.openTime >= publishedAt);
if (!after.length) throw new Error("no hourly bars since publication");

const triggerUsd = PLAN.breakoutTrigger.highUsd;
const entryLow = PLAN.entry.lowUsd, entryHigh = PLAN.entry.highUsd;
const stopUsd = A.stopUsd, tp1Usd = A.tp1Usd, tp2Usd = A.tp2Usd;

/**
 * The fill.
 *
 * The plan says enter between 2.50 and 2.53 on a break of 2.50, so the fill is
 * the first hour that trades into that band, at the band's low — the best price
 * inside it that the hour demonstrably offered. Filling at the mid would be
 * assuming a price the tape does not evidence; filling at the high would be
 * pessimism dressed as rigour.
 */
let fill = null;
for (const b of after) {
  if (b.high >= entryLow) {
    fill = { at: new Date(b.openTime).toISOString(), priceUsd: Math.max(entryLow, Math.min(b.low, entryHigh)) };
    break;
  }
}

let result = null;
if (fill) {
  const e = fill.priceUsd;
  const riskUsd = e - stopUsd;
  const held = after.filter((b) => b.openTime >= new Date(fill.at).getTime());
  let worstUsd = e, bestUsd = e, stoppedAt = null, tp1At = null, tp2At = null;

  for (const b of held) {
    worstUsd = Math.min(worstUsd, b.low);
    bestUsd = Math.max(bestUsd, b.high);
    // Stop checked before target on any hour reaching both, same rule the
    // backtests use, so a live trade is not scored more kindly than a historical one.
    if (!stoppedAt && b.low <= stopUsd) { stoppedAt = new Date(b.openTime).toISOString(); break; }
    if (!tp1At && b.high >= tp1Usd) tp1At = new Date(b.openTime).toISOString();
    if (tp1At && !tp2At && b.high >= tp2Usd) { tp2At = new Date(b.openTime).toISOString(); break; }
  }

  const markUsd = held.at(-1).close;
  result = {
    entryUsd: e,
    riskUsd,
    hoursHeld: held.length,
    worstUsd,
    bestUsd,
    markUsd,
    worstExcursionR: (worstUsd - e) / riskUsd,
    bestExcursionR: (bestUsd - e) / riskUsd,
    markR: (markUsd - e) / riskUsd,
    stoppedAt,
    tp1At,
    tp2At,
    /** How close the worst point came to the stop, in the stop's own units. */
    stopMarginUsd: worstUsd - stopUsd,
    stopMarginR: (worstUsd - stopUsd) / riskUsd,
  };
}

/**
 * The same window, measured against BTC.
 *
 * ICP rising in a week BTC rose 22% is not a breakout paying off, and this desk
 * has published the cost of skipping that distinction. Both readings are kept.
 */
const btcBars = await retry(() => fetchKlines("BTCUSDT", { interval: "1h", limit: 200 }));
const btcAfter = btcBars.filter((b) => b.openTime >= publishedAt);
const relative = fill && btcAfter.length ? (() => {
  const start = btcAfter.find((b) => b.openTime >= new Date(fill.at).getTime());
  if (!start) return null;
  const icpPct = ((result.markUsd / result.entryUsd) - 1) * 100;
  const btcPct = ((btcAfter.at(-1).close / start.open) - 1) * 100;
  return { icpPct, btcPct, excessPct: icpPct - btcPct };
})() : null;

/** Today's board row for ICP, so the follow-up carries the refusal too. */
const board = existsSync("site/signals.json")
  ? (() => {
      const b = JSON.parse(readFileSync("site/signals.json", "utf8"));
      const r = b.signals.find((s) => s.symbol === SYMBOL);
      return r ? {
        scannedAt: b.scannedAt,
        bias: r.bias,
        agreeing: r.agreement.agreeing,
        windows: r.agreement.windows,
        effectiveN: r.recent?.[r.side]?.best?.effectiveN ?? null,
        priceUsd: r.price,
      } : null;
    })()
  : null;

const out = {
  measuredAt: new Date().toISOString(),
  symbol: SYMBOL,
  source: "Binance spot hourly klines",
  postPublishedAt: article.published,
  postSlug: article.slug,
  plannedTriggerUsd: triggerUsd,
  plannedEntry: PLAN.entry,
  plannedStopUsd: stopUsd,
  plannedTp1Usd: tp1Usd,
  plannedTp2Usd: tp2Usd,
  claimedStopRiskPct: A.stopPct,
  /** The claim this follow-up is actually testing, quoted from the post. */
  publishedClaim: {
    daysTakingPlanStopFromOpenPct: S.instrument.daysTakingPlanStopFromOpenPct,
    medianDailyRangePct: S.instrument.medianDailyRangePct,
    tp1R: A.tp1R,
  },
  fill,
  result,
  relative,
  board,
  hoursOfTape: after.length,
};
writeFileSync("research/icp-followthrough.json", `${JSON.stringify(out, null, 2)}\n`);

const f = (v, dp = 2) => (v == null ? "—" : (v >= 0 ? "+" : "") + v.toFixed(dp));

console.log(`${SYMBOL} — the plan, followed from publication\n`);
console.log(`  post published ${article.published}`);
console.log(`  ${after.length} hourly bars since\n`);

if (!fill) {
  console.log("  the trigger never fired — no entry to report");
} else {
  const r = result;
  console.log(`  filled ${fill.at} at $${fill.priceUsd.toFixed(4)}   risk $${r.riskUsd.toFixed(4)} to the $${stopUsd.toFixed(3)} stop`);
  console.log(`  held ${r.hoursHeld}h`);
  console.log(`  worst  $${r.worstUsd.toFixed(4)}   ${f(r.worstExcursionR)}R`);
  console.log(`  best   $${r.bestUsd.toFixed(4)}   ${f(r.bestExcursionR)}R`);
  console.log(`  mark   $${r.markUsd.toFixed(4)}   ${f(r.markR)}R`);
  console.log(`  stopped: ${r.stoppedAt ?? "no"}   TP1: ${r.tp1At ?? "no"}   TP2: ${r.tp2At ?? "no"}`);
  console.log(`  closest approach to the stop: $${r.stopMarginUsd.toFixed(4)} (${f(r.stopMarginR)}R of room left)`);
}

if (relative) {
  console.log(`\n  since the fill: ICP ${f(relative.icpPct)}%, BTC ${f(relative.btcPct)}%, excess ${f(relative.excessPct)}%`);
}

if (board) {
  console.log(`\n  my board, ${board.scannedAt}: ${board.bias}, ${board.agreeing}/${board.windows} windows agree,`
    + ` ${board.effectiveN} independent episodes — still below the floor of 12`);
}
