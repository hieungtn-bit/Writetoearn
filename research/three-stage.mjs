/**
 * BTC, BNB and ICP: which stage of a move is each one in, and what has that
 * stage historically been worth on that specific asset?
 *
 * A stage label on its own is a description, not an analysis. Three things are
 * added here so it becomes one.
 *
 * First, the label is read over several window lengths. The classifier compares
 * the last three days of turnover against the rest of a 30-day window, so a
 * single quiet weekend can move it. A stage that reads the same at 30, 60 and
 * 90 days is a state; one that only appears at 30 is a headline.
 *
 * Second, the label is dated. Walking the classifier back day by day gives how
 * long the current stage has held and what it replaced — a stage entered
 * yesterday and a stage held for six weeks are different claims about the same
 * word.
 *
 * Third, and most importantly, every stage is scored on that asset's own
 * history: every past day in the same stage, and what the following weeks did,
 * against the asset's own baseline. A stage that has paid nothing on BTC is
 * worth knowing about before acting on the word "expansion".
 *
 * The base rate is reported alongside, because a stage occupied on 4% of days
 * cannot support a forward estimate however good the number looks, and
 * effectiveN divides the day count by the horizon so overlapping windows are
 * not counted as independent evidence.
 *
 * Deliberately absent: the board's plan expectancy. research/selection-bias.json
 * showed it keeps about a tenth of itself out of sample, so quoting it beside
 * a stage read would lend it a precision this desk has already disproved.
 */

import { writeFileSync } from "node:fs";
import { analyzeAsset, atr, fetchKlines } from "../src/analysis.mjs";
import { classifyStage, computeStageMetrics } from "../src/stage.mjs";
import { volumeProfile } from "../src/profile.mjs";
import { AGREEMENT_WINDOWS, grid, signalFor, summarise } from "../src/signals.mjs";

const SYMBOLS = ["BTCUSDT", "BNBUSDT", "ICPUSDT"];
const STAGE_WINDOWS = [30, 60, 90];
const HORIZONS = [5, 10, 30];
/** Days of stage history walked back to date the current stage. */
const HISTORY_DAYS = 400;

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
const quantile = (xs, p) => (xs.length ? [...xs].sort((a, b) => a - b)[Math.floor(xs.length * p)] : null);
const day = (c) => new Date(c.openTime).toISOString().slice(0, 10);

/** The stage on the day ending at index i, read over `days` of history. */
const stageAt = (candles, i, days = 30) => {
  if (i < days) return null;
  try {
    const w = candles.slice(i - days + 1, i + 1);
    return classifyStage(computeStageMetrics(w)).stage;
  } catch { return null; }
};

const out = { measuredAt: new Date().toISOString(), horizons: HORIZONS, assets: {} };

for (const symbol of SYMBOLS) {
  const daily = await retry(() => fetchKlines(symbol, { interval: "1d", limit: 1000 }));
  const hourly = await retry(() => fetchKlines(symbol, { interval: "1h", limit: 720 }));
  if (hourly.length < 700) throw new Error(`${symbol}: only ${hourly.length} hourly bars; the profile would be wrong`);
  const analysis = await retry(() => analyzeAsset(symbol, { candles: daily }));
  const price = analysis.price;
  const atrPct = (atr(daily, 14) / price) * 100;

  const last = daily.length - 1;

  /** The label at three window lengths — agreement is the point. */
  const byWindow = {};
  for (const days of STAGE_WINDOWS) {
    const w = daily.slice(-days);
    const m = computeStageMetrics(w, price);
    const { stage, note } = classifyStage(m);
    byWindow[days] = {
      stage, note,
      underwaterPct: m.underwaterPct,
      vsVwapPct: m.vsVwapPct,
      volumeTrendPct: m.volumeTrendPct,
      recentPricePct: m.recentPricePct,
      concentrationPct: m.concentrationPct,
      drawdownPct: m.drawdownPct,
      vwap: m.vwap,
    };
  }
  const stagesSeen = new Set(Object.values(byWindow).map((v) => v.stage));
  const current = byWindow[30].stage;

  /** How long the 30-day label has held, and what preceded it. */
  const walk = [];
  for (let i = Math.max(30, last - HISTORY_DAYS); i <= last; i++) {
    walk.push({ i, date: day(daily[i]), stage: stageAt(daily, i) });
  }
  let heldDays = 0;
  for (let k = walk.length - 1; k >= 0 && walk[k].stage === current; k--) heldDays += 1;
  const transitions = [];
  for (let k = 1; k < walk.length; k++) {
    if (walk[k].stage && walk[k].stage !== walk[k - 1].stage) {
      transitions.push({ date: walk[k].date, from: walk[k - 1].stage, to: walk[k].stage });
    }
  }

  /**
   * Every past day, labelled, then scored forward against the asset's own
   * baseline. The label uses only data available on that day, so this is not
   * hindsight — the classifier looks backwards by construction.
   */
  const labelled = [];
  for (let i = 30; i <= last; i++) labelled.push(stageAt(daily, i));

  const stageStats = {};
  const counts = {};
  for (let k = 0; k < labelled.length; k++) if (labelled[k]) counts[labelled[k]] = (counts[labelled[k]] ?? 0) + 1;

  for (const stage of Object.keys(counts)) {
    const rows = {};
    for (const h of HORIZONS) {
      const inStage = [], baseline = [];
      for (let k = 0; k < labelled.length; k++) {
        const i = k + 30;
        if (i + h > last) break;
        const r = ((daily[i + h].close / daily[i].close) - 1) * 100;
        if (labelled[k] === stage) inStage.push(r); else baseline.push(r);
      }
      if (!inStage.length) continue;
      rows[h] = {
        medianPct: median(inStage),
        baselineMedianPct: median(baseline),
        differencePct: median(inStage) - median(baseline),
        upSharePct: (inStage.filter((v) => v > 0).length / inStage.length) * 100,
        worstQuarterPct: quantile(inStage, 0.25),
        days: inStage.length,
        effectiveN: inStage.length / h,
      };
    }
    stageStats[stage] = {
      days: counts[stage],
      baseRatePct: (counts[stage] / labelled.filter(Boolean).length) * 100,
      forward: rows,
    };
  }

  /** Where the last month's turnover actually sits, relative to price. */
  const profile = volumeProfile(hourly, price);

  /** Both directions across every lookback — the stability check, not a plan. */
  const lookbacks = {};
  for (const days of AGREEMENT_WINDOWS) {
    if (daily.length < days + 30) continue;
    const s = daily.slice(-days);
    const lo = summarise(grid(s, atrPct, { direction: "long" }));
    const sh = summarise(grid(s, atrPct, { direction: "short" }));
    lookbacks[days] = {
      longPositive: lo && `${lo.positive}/${lo.cells}`,
      longMedianR: lo?.medianExpectancyR ?? null,
      shortPositive: sh && `${sh.positive}/${sh.cells}`,
      shortMedianR: sh?.medianExpectancyR ?? null,
    };
  }

  const signal = signalFor({
    symbol, candles: daily, atrPct, price, turnoverUsd: analysis.avgQuoteVolume30d,
  });

  const last30 = daily.slice(-30);
  const weeks = [];
  for (let i = 0; i + 7 <= daily.length; i += 7) {
    const w = daily.slice(i, i + 7);
    const lo = Math.min(...w.map((c) => c.low));
    weeks.push(((Math.max(...w.map((c) => c.high)) - lo) / lo) * 100);
  }

  out.assets[symbol] = {
    price, atrPct,
    rsi14: analysis.rsi14,
    change7dPct: analysis.change7dPct,
    change30dPct: analysis.change30dPct,
    rangePosition30d: analysis.rangePosition30d,
    range30: { low: Math.min(...last30.map((c) => c.low)), high: Math.max(...last30.map((c) => c.high)) },
    turnoverUsd: analysis.avgQuoteVolume30d,
    medianWeekPct: median(weeks),
    stage: current,
    stageAgrees: stagesSeen.size === 1,
    stagesByWindow: byWindow,
    heldDays,
    transitions: transitions.slice(-6),
    stageStats,
    currentStageStats: stageStats[current] ?? null,
    profile,
    overheadPct: profile?.overheadPct ?? null,
    lookbacks,
    call: {
      bias: signal.bias,
      reason: signal.reason,
      agreeing: signal.agreement?.agreeing ?? null,
      windows: signal.agreement?.windows ?? null,
      effectiveN: signal.confidence?.effectiveN ?? null,
      thin: signal.confidence?.thin ?? null,
      turning: signal.regime?.turning ?? null,
    },
  };
}

writeFileSync("research/three-stage.json", `${JSON.stringify(out, null, 2)}\n`);

for (const [symbol, a] of Object.entries(out.assets)) {
  console.log(`\n${"=".repeat(64)}\n${symbol}  $${a.price}  ·  ATR ${a.atrPct.toFixed(2)}%  ·  RSI ${a.rsi14.toFixed(0)}`);
  console.log(`stage: ${a.stage}  (${a.stagesByWindow[30].note})`);
  console.log(`  held ${a.heldDays} days · windows agree: ${a.stageAgrees ? "yes" : "NO"}`);
  for (const w of STAGE_WINDOWS) {
    const v = a.stagesByWindow[w];
    console.log(`  ${String(w).padStart(3)}d  ${v.stage.padEnd(13)} underwater ${v.underwaterPct.toFixed(1)}%`
      + `  vs vwap ${v.vsVwapPct.toFixed(1)}%  volume trend ${v.volumeTrendPct.toFixed(1)}%`);
  }
  console.log(`  range position ${a.rangePosition30d.toFixed(1)}%  ·  overhead ${a.overheadPct.toFixed(2)}%`
    + `  ·  7d ${a.change7dPct.toFixed(2)}%  30d ${a.change30dPct.toFixed(2)}%`);
  console.log(`  POC $${a.profile.pocPrice.toFixed(2)}  value area $${a.profile.valueAreaLow.toFixed(2)}–${a.profile.valueAreaHigh.toFixed(2)}`);

  const s = a.currentStageStats;
  if (s) {
    console.log(`\n  this stage on ${symbol}: ${s.days} days (${s.baseRatePct.toFixed(1)}% of history)`);
    console.log("  hold     median    baseline      diff    up%    n(eff)");
    for (const h of HORIZONS) {
      const f = s.forward[h];
      if (!f) continue;
      console.log(`  ${String(h + "d").padEnd(9)}${f.medianPct.toFixed(2).padStart(7)}%`
        + `${f.baselineMedianPct.toFixed(2).padStart(11)}%`
        + `${f.differencePct.toFixed(2).padStart(10)}`
        + `${f.upSharePct.toFixed(0).padStart(7)}%`
        + String(Math.round(f.effectiveN)).padStart(9));
    }
  }
  console.log(`\n  call: ${a.call.bias} — ${a.call.reason}`);
  console.log(`  lookbacks agreeing ${a.call.agreeing}/${a.call.windows} · independent n ${Math.round(a.call.effectiveN ?? 0)}`
    + `${a.call.thin ? " (thin)" : ""}${a.call.turning ? " · regime turn" : ""}`);
  for (const [w, v] of Object.entries(a.lookbacks)) {
    console.log(`    ${String(w).padStart(4)}d  long ${String(v.longPositive).padStart(6)}  short ${String(v.shortPositive).padStart(6)}`);
  }
  if (a.transitions.length) {
    console.log("  recent stage changes:");
    for (const t of a.transitions) console.log(`    ${t.date}  ${t.from} → ${t.to}`);
  }
}
