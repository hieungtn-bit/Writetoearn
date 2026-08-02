import test from "node:test";
import assert from "node:assert/strict";
import {
  atr,
  correlation,
  logReturns,
  mean,
  pctChange,
  rangeCompression,
  rangePosition,
  realizedVolatility,
  rsi,
  sma,
  stdev,
  riskAdjusted,
  volumeZScore,
} from "../src/analysis.mjs";

const close = (n) => ({ open: n, high: n, low: n, close: n, volume: 1, quoteVolume: 1 });

test("stdev uses the sample formula, not the population one", () => {
  // Sample stdev of 2,4,4,4,5,5,7,9 is 2.138; population would be 2.0.
  assert.ok(Math.abs(stdev([2, 4, 4, 4, 5, 5, 7, 9]) - 2.138) < 0.001);
  assert.ok(Number.isNaN(stdev([1])));
});

test("mean and pctChange behave", () => {
  assert.equal(mean([1, 2, 3]), 2);
  assert.equal(pctChange(100, 110), 10);
  assert.equal(pctChange(100, 90), -10);
});

test("log returns compound back to the total move", () => {
  const closes = [100, 110, 121];
  const total = logReturns(closes).reduce((a, b) => a + b, 0);
  assert.ok(Math.abs(Math.exp(total) - 1.21) < 1e-9);
});

test("a flat series has zero volatility", () => {
  assert.equal(realizedVolatility(Array(40).fill(100)), 0);
});

test("a choppier series scores higher volatility than a calm one", () => {
  const calm = Array.from({ length: 40 }, (_, i) => 100 + (i % 2));
  const wild = Array.from({ length: 40 }, (_, i) => 100 + (i % 2) * 20);
  assert.ok(realizedVolatility(wild) > realizedVolatility(calm));
});

test("RSI pins to 100 on an unbroken advance and 0 on an unbroken decline", () => {
  const up = Array.from({ length: 40 }, (_, i) => 100 + i);
  const down = Array.from({ length: 40 }, (_, i) => 200 - i);
  assert.equal(rsi(up, 14), 100);
  assert.equal(rsi(down, 14), 0);
});

test("RSI sits near the midpoint on an oscillating series", () => {
  const flat = Array.from({ length: 60 }, (_, i) => 100 + (i % 2 ? 1 : -1));
  const value = rsi(flat, 14);
  assert.ok(value > 35 && value < 65, `expected mid-range, got ${value}`);
});

test("RSI needs enough history and says so", () => {
  assert.ok(Number.isNaN(rsi([1, 2, 3], 14)));
});

test("ATR of a constant series is zero and rises with true range", () => {
  assert.equal(atr(Array(30).fill(close(100)), 14), 0);

  const volatile = Array.from({ length: 30 }, (_, i) => ({
    open: 100,
    high: 100 + (i % 2 ? 10 : 0),
    low: 100 - (i % 2 ? 10 : 0),
    close: 100,
  }));
  assert.ok(atr(volatile, 14) > 0);
});

test("range position places price within its range", () => {
  assert.equal(rangePosition(50, 0, 100), 50);
  assert.equal(rangePosition(0, 0, 100), 0);
  assert.equal(rangePosition(100, 0, 100), 100);
  assert.ok(Number.isNaN(rangePosition(50, 100, 100)), "a zero-width range has no position");
});

test("correlation is +1 for identical series and -1 for mirrored ones", () => {
  const a = [1, 2, 3, 4, 5];
  const b = [2, 4, 6, 8, 10];
  const c = [5, 4, 3, 2, 1];
  assert.ok(Math.abs(correlation(a, b) - 1) < 1e-9);
  assert.ok(Math.abs(correlation(a, c) + 1) < 1e-9);
  assert.ok(Number.isNaN(correlation([1, 1, 1], [1, 2, 3])), "no variance means no correlation");
});

test("volume z-score flags an outlier and ignores steady volume", () => {
  const steady = Array(31).fill(100);
  assert.equal(volumeZScore(steady), 0);

  const spike = [...Array(30).fill(100), 500];
  assert.ok(volumeZScore(spike) > 2, "a 5x volume day should read as an anomaly");
});

test("range compression reports a tight recent range as a low percentage", () => {
  const wideThenTight = [
    ...Array.from({ length: 23 }, (_, i) => ({ high: 100 + i, low: 100 - i, close: 100 })),
    ...Array(7).fill({ high: 101, low: 99, close: 100 }),
  ];
  const pct = rangeCompression(wideThenTight, { recent: 7, base: 30 });
  assert.ok(pct < 50, `recent range should be much tighter, got ${pct}`);
});

test("sma averages the trailing window only", () => {
  assert.equal(sma([1, 2, 3, 4, 5], 3), 4);
  assert.ok(Number.isNaN(sma([1, 2], 5)));
});

test("month-end classification finds the last UTC day of each month", async () => {
  const { monthEndEffect } = await import("../src/seasonality.mjs");
  const day = 86_400_000;
  // Jan 29 -> Feb 2 2024, so Jan 31 is the only month-end in the window.
  const start = Date.UTC(2024, 0, 29);
  const candles = [0, 1, 2, 3, 4].map((i) => ({
    openTime: start + i * day,
    open: 100,
    close: 100 + i, // every step is a gain
  }));

  const r = monthEndEffect(candles);
  assert.equal(r.monthEnd.n, 1, "exactly one month-end in the window");
  assert.equal(r.otherDays.n, 3);
  assert.ok(r.sampleWarning, "a one-observation sample must warn");
});

test("month-end effect separates a planted seasonal pattern from noise", async () => {
  const { monthEndEffect } = await import("../src/seasonality.mjs");
  const day = 86_400_000;
  const candles = [];
  let close = 100;

  // Two years of flat days, with a hard drop planted on every month-end.
  for (let i = 0; i < 730; i++) {
    const openTime = Date.UTC(2024, 0, 1) + i * day;
    const next = new Date(openTime + day);
    const isEnd = new Date(openTime).getUTCMonth() !== next.getUTCMonth();
    const prev = close;
    close = isEnd ? close * 0.95 : close * 1.001;
    candles.push({ openTime, open: prev, close });
  }

  const r = monthEndEffect(candles);
  assert.ok(r.monthEnd.meanPct < -4, `planted drop should show, got ${r.monthEnd.meanPct}`);
  assert.ok(r.otherDays.meanPct > 0);
  assert.equal(r.monthEnd.negativeShare, 100);
  assert.ok(r.effectSize < -1, "a planted effect should read as large");
});

test("risk-adjusted return is undefined rather than infinite at zero volatility", () => {
  assert.ok(Number.isNaN(riskAdjusted(5, 0)), "a zero-vol asset has no meaningful ratio");
  assert.ok(Number.isNaN(riskAdjusted(NaN, 30)));
  assert.ok(Number.isNaN(riskAdjusted(5, NaN)));
});

test("risk-adjusted return ranks the cost of a gain, not just its size", () => {
  const calm = riskAdjusted(10, 30);
  const wild = riskAdjusted(12, 90);
  assert.ok(calm > wild, "a smaller gain at a third of the volatility is the better one");
  assert.equal(riskAdjusted(-6.96, 59.4).toFixed(3), "-0.117");
});

test("the daily-move percentile puts a percentage move in its own context", async () => {
  const { analyzeAsset } = await import("../src/analysis.mjs");
  const day = 86_400_000;
  // 60 quiet days of +-0.5%, then a final close 5% above the previous one.
  const closes = [100];
  for (let i = 1; i < 60; i++) closes.push(closes[i - 1] * (i % 2 ? 1.005 : 0.995));
  closes.push(closes.at(-1) * 1.05);

  const candles = closes.map((c, i) => ({
    openTime: i * day, open: c, high: c, low: c, close: c, volume: 1, quoteVolume: 1,
  }));
  const a = await analyzeAsset("TESTUSDT", { candles });

  assert.equal(a.sampleDays, closes.length - 2, "the live day is excluded from its own baseline");
  assert.equal(a.biggerDayCount, 0, "nothing in a quiet series beats a 5% day");
  assert.equal(a.dailyMovePercentile, 100);
});
