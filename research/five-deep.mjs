/**
 * Deep dive on five names: BNB, INJ, ENA, ICP, GIGGLE.
 *
 * The organising question is the one the INJ check exposed: a geometry that
 * pays over the deciding window may reverse sign over a longer one, and a
 * board that reports only the deciding window cannot tell you which case it is
 * in. So every asset here is scored across six windows rather than one, and
 * the spread across those windows is reported as its own finding.
 *
 * GIGGLE is included on request and is a different kind of object from the
 * other four: 291 daily candles, which at a 30-day horizon is under ten
 * independent episodes for its entire life. Its numbers are computed the same
 * way and reported with that limit attached rather than quietly averaged in.
 */

import { writeFileSync } from "node:fs";
import { analyzeAsset, atr, fetchKlines } from "../src/analysis.mjs";
import { grid, summarise, walk, RECENT_DAYS } from "../src/signals.mjs";
import { stageOf } from "../src/stage.mjs";

const NAMES = ["BNB", "INJ", "ENA", "ICP", "GIGGLE"];
const WINDOWS = [180, 270, 365, 540, 730, 1000];
const HORIZON = 30;

const mean = (xs) => xs.reduce((s, x) => s + x, 0) / xs.length;
const median = (xs) => {
  const s = [...xs].sort((a, b) => a - b);
  return s.length % 2 ? s[s.length >> 1] : (s[s.length / 2 - 1] + s[s.length / 2]) / 2;
};

const btc = await fetchKlines("BTCUSDT", { interval: "1d", limit: 400 });
const rets = (cs) => cs.slice(1).map((c, i) => Math.log(c.close / cs[i].close));

const rows = [];

for (const name of NAMES) {
  const symbol = `${name}USDT`;
  const candles = await fetchKlines(symbol, { interval: "1d", limit: 1000 });
  const analysis = await analyzeAsset(symbol, { candles });
  const stage = await stageOf(name).catch(() => null);
  const price = analysis.price;
  const atrPct = (atr(candles, 14) / price) * 100;

  /** Drawdown from the highest high in the available series. */
  const highs = candles.map((c) => c.high);
  const ath = Math.max(...highs);
  const athDate = new Date(candles[highs.indexOf(ath)].openTime).toISOString().slice(0, 10);

  /** Weekly high-to-low range, which is what a stop actually has to survive. */
  const weeks = [];
  for (let i = 0; i + 7 <= candles.length; i += 7) {
    const w = candles.slice(i, i + 7);
    weeks.push(((Math.max(...w.map((c) => c.high)) - Math.min(...w.map((c) => c.low)))
      / Math.min(...w.map((c) => c.low))) * 100);
  }

  /** BTC beta and shared variance over the last 30 daily returns. */
  const a = rets(candles).slice(-30);
  const b = rets(btc).slice(-30);
  const ma = mean(a), mb = mean(b);
  const cov = a.reduce((s, x, i) => s + (x - ma) * (b[i] - mb), 0) / (a.length - 1);
  const varB = b.reduce((s, x) => s + (x - mb) ** 2, 0) / (b.length - 1);
  const sdA = Math.sqrt(a.reduce((s, x) => s + (x - ma) ** 2, 0) / (a.length - 1));
  const beta = cov / varB;
  const r = cov / (sdA * Math.sqrt(varB));

  /**
   * The whole grid in both directions, per window. `positiveSharePct` is the
   * honest headline: one good cell out of 64 is a search result, not an edge.
   */
  const byWindow = {};
  for (const w of WINDOWS) {
    if (candles.length < w + HORIZON) continue;
    const series = candles.slice(-w);
    const long = summarise(grid(series, atrPct, { direction: "long" }));
    const short = summarise(grid(series, atrPct, { direction: "short" }));
    byWindow[w] = {
      longPositive: long ? `${long.positive}/${long.cells}` : null,
      longMedianR: long ? Number(long.medianExpectancyR.toFixed(3)) : null,
      shortPositive: short ? `${short.positive}/${short.cells}` : null,
      shortMedianR: short ? Number(short.medianExpectancyR.toFixed(3)) : null,
    };
  }

  /** Does the sign of the median long cell survive every window? */
  const longMedians = Object.values(byWindow).map((v) => v.longMedianR).filter((v) => v != null);
  const shortMedians = Object.values(byWindow).map((v) => v.shortMedianR).filter((v) => v != null);
  const stable = (xs) => xs.length > 1 && (xs.every((x) => x > 0) || xs.every((x) => x < 0));

  /** The board's own deciding window, scored at the standard 2 ATR / RR 3. */
  const decidingLong = walk(candles.slice(-RECENT_DAYS), {
    direction: "long", stopPct: 2 * atrPct, targetPct: 6 * atrPct, horizon: HORIZON,
  });
  const decidingShort = walk(candles.slice(-RECENT_DAYS), {
    direction: "short", stopPct: 2 * atrPct, targetPct: 6 * atrPct, horizon: HORIZON,
  });

  rows.push({
    asset: name,
    candles: candles.length,
    price,
    atrPct,
    stage: stage?.stage ?? null,
    underwaterPct: stage?.underwaterPct ?? null,
    volumeTrendPct: stage?.volumeTrendPct ?? null,
    rangePosition30d: analysis.rangePosition30d,
    rsi14: analysis.rsi14,
    change7dPct: analysis.change7dPct,
    change30dPct: analysis.change30dPct,
    turnoverUsd: analysis.avgQuoteVolume30d,
    ath, athDate, drawdownFromAthPct: (1 - price / ath) * 100,
    weeklyRangeMedianPct: median(weeks),
    stopPct: 2 * atrPct,
    stopVsMedianWeek: (2 * atrPct) / median(weeks),
    beta, r, rSquaredPct: r * r * 100,
    byWindow,
    windowsTested: Object.keys(byWindow).length,
    longSignStable: stable(longMedians),
    shortSignStable: stable(shortMedians),
    longMedianSpread: longMedians.length
      ? { min: Math.min(...longMedians), max: Math.max(...longMedians) } : null,
    deciding: {
      windowDays: RECENT_DAYS,
      longHitPct: decidingLong?.hitPct ?? null,
      longExpectancyR: decidingLong?.expectancyR ?? null,
      shortExpectancyR: decidingShort?.expectancyR ?? null,
      effectiveN: decidingLong?.effectiveN ?? null,
    },
  });
}

const out = { measuredAt: new Date().toISOString(), horizonDays: HORIZON, windows: WINDOWS, rows };
writeFileSync("research/five-deep.json", `${JSON.stringify(out, null, 2)}\n`);

for (const r of rows) {
  console.log(`\n=== ${r.asset}  ${r.candles} candles  $${r.price}`);
  console.log(`  stage ${r.stage} · overhead ${r.underwaterPct?.toFixed(1)}% · volTrend ${r.volumeTrendPct?.toFixed(1)}%`
    + ` · range ${r.rangePosition30d.toFixed(1)}% · RSI ${r.rsi14.toFixed(1)}`);
  console.log(`  ATR ${r.atrPct.toFixed(2)}% · stop(2ATR) ${r.stopPct.toFixed(2)}% = ${r.stopVsMedianWeek.toFixed(2)}x median week (${r.weeklyRangeMedianPct.toFixed(1)}%)`);
  console.log(`  turnover $${(r.turnoverUsd / 1e6).toFixed(2)}M · beta ${r.beta.toFixed(2)} · r ${r.r.toFixed(2)} · BTC explains ${r.rSquaredPct.toFixed(1)}%`);
  console.log(`  ATH ${r.ath} (${r.athDate}) → ${r.drawdownFromAthPct.toFixed(1)}% down`);
  console.log(`  deciding ${r.deciding.windowDays}d: long E ${r.deciding.longExpectancyR?.toFixed(3)}R · short E ${r.deciding.shortExpectancyR?.toFixed(3)}R · n≈${r.deciding.effectiveN?.toFixed(1)}`);
  console.log(`  long sign stable across ${r.windowsTested} windows: ${r.longSignStable} · short: ${r.shortSignStable}`);
  for (const [w, v] of Object.entries(r.byWindow)) {
    console.log(`    ${String(w).padStart(4)}d  long ${String(v.longPositive).padStart(6)} med ${String(v.longMedianR).padStart(7)}R`
      + `   short ${String(v.shortPositive).padStart(6)} med ${String(v.shortMedianR).padStart(7)}R`);
  }
}
