import test from "node:test";
import assert from "node:assert/strict";
import { BIAS, grid, rankSignals, signalFor, summarise, tallySignals, walk } from "../src/signals.mjs";

/** A synthetic series with a controllable daily drift and range. */
const series = (n, { driftPct = 0, rangePct = 1, start = 100 } = {}) => {
  const out = [];
  let close = start;
  for (let i = 0; i < n; i++) {
    const open = close;
    close = open * (1 + driftPct / 100);
    out.push({
      openTime: i * 86_400_000,
      open,
      high: Math.max(open, close) * (1 + rangePct / 200),
      low: Math.min(open, close) * (1 - rangePct / 200),
      close,
    });
  }
  return out;
};

test("a short's stop sits above entry, not below", () => {
  // Getting this inverted is the standard way a short backtest reports a
  // fortune that was never available: on a rising series a short must lose.
  const rising = series(300, { driftPct: 1, rangePct: 1 });
  const short = walk(rising, { direction: "short", stopPct: 5, targetPct: 10, horizon: 10 });
  assert.ok(short.stoppedPct > 90, `a short into a rally should stop out, got ${short.stoppedPct}%`);
  assert.ok(short.expectancyR < 0);
});

test("a long into a steady fall loses and the mirror short pays", () => {
  const falling = series(300, { driftPct: -1, rangePct: 1 });
  const long = walk(falling, { direction: "long", stopPct: 5, targetPct: 10, horizon: 10 });
  const short = walk(falling, { direction: "short", stopPct: 5, targetPct: 10, horizon: 10 });
  assert.ok(long.expectancyR < 0, "long into a downtrend must lose");
  assert.ok(short.expectancyR > 0, "the mirror short must pay");
});

test("unresolved positions close at the market rather than counting as flat", () => {
  // A stop and target far enough away that nothing resolves inside the horizon.
  const falling = series(200, { driftPct: -0.5, rangePct: 0.2 });
  const r = walk(falling, { direction: "long", stopPct: 40, targetPct: 40, horizon: 3 });
  assert.ok(r.unresolvedPct > 90, `expected mostly unresolved, got ${r.unresolvedPct}%`);
  assert.ok(
    r.expectancyR < 0,
    "three days of decline is a loss on the books, not a zero",
  );
});

test("stops price cannot reach are never scored", () => {
  // A 25% daily range makes a four-range stop sit past -100%: an impossible
  // price that can never be hit, so every such cell used to look positive.
  const wild = series(300, { driftPct: 0, rangePct: 50 });
  const cells = grid(wild, 25, { direction: "long" });
  assert.ok(cells.every((c) => c.stopPct < 60), "no cell may carry an unreachable stop");
});

test("WAIT is only reachable when both directions lose", () => {
  const falling = series(400, { driftPct: -0.6, rangePct: 2 });
  const signal = signalFor({
    symbol: "FALLUSDT", candles: falling, atrPct: 2, price: falling.at(-1).close, turnoverUsd: 5e6,
  });
  assert.equal(signal.bias, BIAS.SHORT, "a persistent downtrend is a short, never a WAIT");
  assert.equal(signal.plan.direction, "short");
  assert.ok(signal.plan.stop > signal.plan.entry, "a short's stop is above the entry");
  assert.ok(signal.plan.target < signal.plan.entry, "a short's target is below the entry");
});

test("a rising market produces a long, not a wait", () => {
  const rising = series(400, { driftPct: 0.6, rangePct: 2 });
  const signal = signalFor({
    symbol: "RISEUSDT", candles: rising, atrPct: 2, price: rising.at(-1).close, turnoverUsd: 5e6,
  });
  assert.equal(signal.bias, BIAS.LONG);
  assert.ok(signal.plan.stop < signal.plan.entry);
});

test("a turn inside the sample is reported, not averaged away", () => {
  // Falling for a long stretch, then rising for the recent window. The old
  // engine took the thousand-day average and stayed blind to the turn.
  const down = series(600, { driftPct: -0.5, rangePct: 2 });
  const up = series(200, { driftPct: 0.8, rangePct: 2, start: down.at(-1).close });
  const candles = [...down, ...up].map((c, i) => ({ ...c, openTime: i * 86_400_000 }));

  const signal = signalFor({
    symbol: "TURNUSDT", candles, atrPct: 2, price: candles.at(-1).close, turnoverUsd: 5e6, recentDays: 180,
  });
  assert.equal(signal.bias, BIAS.LONG, "the recent window decides");
  assert.equal(signal.regime.turning, true, "the disagreement with history must be surfaced");
});

test("an illiquid pair is flagged rather than silently recommended", () => {
  const falling = series(400, { driftPct: -0.6, rangePct: 2 });
  const signal = signalFor({
    symbol: "THINUSDT", candles: falling, atrPct: 2, price: 1, turnoverUsd: 50_000,
  });
  assert.equal(signal.tradeable, false, "turnover below the floor cannot absorb a position");
});

test("a thin sample is marked thin", () => {
  const falling = series(400, { driftPct: -0.6, rangePct: 2 });
  const signal = signalFor({
    symbol: "FALLUSDT", candles: falling, atrPct: 2, price: 1, turnoverUsd: 5e6, recentDays: 60,
  });
  assert.ok(signal.confidence, "a plan must carry a confidence reading");
  assert.equal(typeof signal.confidence.thin, "boolean");
});

test("ranking puts tradeable calls above untradeable ones", () => {
  const signals = [
    { symbol: "A", bias: BIAS.LONG, tradeable: false, plan: { expectancyR: 9 } },
    { symbol: "B", bias: BIAS.SHORT, tradeable: true, plan: { expectancyR: 0.1 } },
    { symbol: "C", bias: BIAS.WAIT, tradeable: true, plan: null },
  ];
  assert.deepEqual(rankSignals(signals).map((s) => s.symbol), ["B", "C", "A"]);
});

test("the tally counts every bias and the turns", () => {
  const t = tallySignals([
    { bias: BIAS.LONG, tradeable: true, regime: { turning: true } },
    { bias: BIAS.SHORT, tradeable: true, regime: { turning: false } },
    { bias: BIAS.WAIT, tradeable: false, regime: { turning: false } },
  ]);
  assert.equal(t.total, 3);
  assert.equal(t.LONG, 1);
  assert.equal(t.SHORT, 1);
  assert.equal(t.WAIT, 1);
  assert.equal(t.turning, 1);
  assert.equal(t.untradeable, 1);
});

test("summarise reports the spread, not just the winner", () => {
  const falling = series(300, { driftPct: -0.5, rangePct: 2 });
  const s = summarise(grid(falling, 2, { direction: "short" }));
  assert.ok(s.cells > 0);
  assert.ok(s.positiveSharePct >= 0 && s.positiveSharePct <= 100);
  assert.ok(Number.isFinite(s.medianExpectancyR), "the median cell is the honest summary");
});
