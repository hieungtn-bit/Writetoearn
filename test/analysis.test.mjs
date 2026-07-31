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
