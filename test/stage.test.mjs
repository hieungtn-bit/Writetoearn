import test from "node:test";
import assert from "node:assert/strict";
import {
  STAGE,
  classifyStage,
  computeStageMetrics,
  formatStage,
  normalizeSymbol,
  stageOf,
} from "../src/stage.mjs";

/** Builds a flat baseline series, oldest first. */
function series(n, { close = 100, quoteVolume = 1_000_000 } = {}) {
  return Array.from({ length: n }, () => ({
    high: close * 1.01,
    low: close * 0.99,
    close,
    quoteVolume,
  }));
}

function candle(close, quoteVolume) {
  return { high: close * 1.01, low: close * 0.99, close, quoteVolume };
}

test("underwater share counts turnover done above the current price", () => {
  const candles = [...series(10, { close: 200 }), ...series(10, { close: 50 })];
  const m = computeStageMetrics(candles, 50);

  // The ten days at 200 all traded above 50; the ten at 50 did not.
  assert.ok(m.underwaterPct > 49 && m.underwaterPct < 51, `got ${m.underwaterPct}`);
  assert.ok(m.vsVwapPct < 0, "price sits below the window VWAP");
});

test("volume trend compares the last three days against the prior ones", () => {
  const candles = [...series(27, { quoteVolume: 100 }), ...series(3, { quoteVolume: 300 })];
  const m = computeStageMetrics(candles);
  assert.ok(Math.abs(m.volumeTrendPct - 200) < 1, `expected ~+200%, got ${m.volumeTrendPct}`);
});

test("an empty or too-short series is refused rather than guessed at", () => {
  assert.throws(() => computeStageMetrics([]), /empty candle series/);
  assert.throws(() => computeStageMetrics(series(3)), /more than 3 candles/);
});

test("a series with no turnover is refused", () => {
  assert.throws(() => computeStageMetrics(series(10, { quoteVolume: 0 })), /no turnover/);
});

test("price rising on expanding volume is expansion", () => {
  const candles = [
    ...series(27, { close: 100, quoteVolume: 100 }),
    candle(120, 400),
    candle(140, 500),
    candle(160, 600),
  ];
  const { stage } = classifyStage(computeStageMetrics(candles));
  assert.equal(stage, STAGE.EXPANSION);
});

test("price rising on draining volume is exhaustion, not expansion", () => {
  const candles = [
    ...series(27, { close: 100, quoteVolume: 1000 }),
    candle(120, 400),
    candle(140, 300),
    candle(160, 200),
  ];
  const { stage } = classifyStage(computeStageMetrics(candles));
  assert.equal(stage, STAGE.EXHAUSTION);
});

test("the underwater metric alone cannot separate expansion from exhaustion", () => {
  const rising = [
    ...series(27, { close: 100, quoteVolume: 100 }),
    candle(120, 400), candle(140, 500), candle(160, 600),
  ];
  const fading = [
    ...series(27, { close: 100, quoteVolume: 1000 }),
    candle(120, 400), candle(140, 300), candle(160, 200),
  ];

  const a = computeStageMetrics(rising);
  const b = computeStageMetrics(fading);

  // Both sit at their highs, so nobody is underwater in either case.
  assert.equal(a.underwaterPct, 0);
  assert.equal(b.underwaterPct, 0);
  // Only the participation trend tells them apart.
  assert.ok(a.volumeTrendPct > 0 && b.volumeTrendPct < 0);
  assert.notEqual(classifyStage(a).stage, classifyStage(b).stage);
});

test("a collapsed price on fading volume is a hangover", () => {
  const candles = [
    ...series(20, { close: 100, quoteVolume: 5000 }),
    ...series(10, { close: 20, quoteVolume: 100 }),
  ];
  const { stage } = classifyStage(computeStageMetrics(candles));
  assert.equal(stage, STAGE.HANGOVER);
});

test("below VWAP with most money underwater is a breakdown", () => {
  const candles = [
    ...series(24, { close: 100, quoteVolume: 5000 }),
    ...series(6, { close: 55, quoteVolume: 4000 }),
  ];
  const m = computeStageMetrics(candles);
  const { stage } = classifyStage(m);
  assert.ok(m.underwaterPct > 70);
  assert.equal(stage, STAGE.BREAKDOWN);
});

test("an even, uneventful series is quiet", () => {
  const { stage } = classifyStage(computeStageMetrics(series(30)));
  assert.equal(stage, STAGE.QUIET);
});

test("every stage carries an explanatory note", () => {
  const { stage, note } = classifyStage(computeStageMetrics(series(30)));
  assert.ok(note.length > 0, `stage ${stage} should explain itself`);
});

test("symbols are normalized to a spot pair", () => {
  assert.equal(normalizeSymbol("btc"), "BTCUSDT");
  assert.equal(normalizeSymbol("GIGGLE"), "GIGGLEUSDT");
  assert.equal(normalizeSymbol("ETHUSDT"), "ETHUSDT");
  assert.throws(() => normalizeSymbol("  "), /Empty symbol/);
});

test("stageOf works from injected candles without any network call", async () => {
  const candles = [
    ...series(27, { close: 100, quoteVolume: 100 }),
    candle(120, 400), candle(140, 500), candle(160, 600),
  ];
  const row = await stageOf("giggle", { candles, days: 30 });

  assert.equal(row.symbol, "GIGGLEUSDT");
  assert.equal(row.stage, STAGE.EXPANSION);
  assert.ok(Number.isFinite(row.rsi14));
});

test("the formatted report names the stage and warns against timing it", () => {
  const candles = [
    ...series(27, { close: 100, quoteVolume: 1000 }),
    candle(120, 400), candle(140, 300), candle(160, 200),
  ];
  const rows = [{ symbol: "PUMPUSDT", rsi14: 65, ...computeStageMetrics(candles), ...classifyStage(computeStageMetrics(candles)) }];
  const out = formatStage(rows);

  assert.match(out, /PUMP/);
  assert.match(out, /exhaustion/);
  assert.match(out, /not an entry signal/);
});

test("a short display window still reports RSI, measured on the full series", async () => {
  const long = [
    ...series(60, { close: 100, quoteVolume: 100 }),
    candle(120, 400), candle(140, 500), candle(160, 600),
  ];
  const row = await stageOf("eth", { candles: long, days: 14 });

  assert.ok(Number.isFinite(row.rsi14), "RSI-14 should survive a 14-day window");
  assert.equal(row.days, 14, "the metrics window is still the requested length");
});

test("an undefined RSI renders as a dash rather than NaN", () => {
  const candles = [
    ...series(27, { close: 100, quoteVolume: 100 }),
    candle(120, 400), candle(140, 500), candle(160, 600),
  ];
  const m = computeStageMetrics(candles);
  const out = formatStage([{ symbol: "XUSDT", rsi14: null, ...m, ...classifyStage(m) }]);

  assert.doesNotMatch(out, /NaN/);
  assert.match(out, /—/);
});
