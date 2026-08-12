import test from "node:test";
import assert from "node:assert/strict";
import { BASELINE_BARS, COOLDOWN_BARS, backtest, baseline, detect } from "../src/momentum.mjs";

/** A quiet series: constant price, constant turnover. Nothing should fire. */
function quiet(bars = 200, price = 100, volume = 1000) {
  return Array.from({ length: bars }, (_, i) => ({
    openTime: i * 3_600_000, high: price, low: price, close: price, quoteVolume: volume,
  }));
}

test("a quiet market produces no signals", () => {
  assert.deepEqual(detect(quiet()), []);
});

test("turnover arriving before price moves is the signal", () => {
  const bars = quiet();
  // Give the baseline some variation so the standard deviation is not zero.
  for (let i = 0; i < bars.length; i++) bars[i].quoteVolume = 1000 + (i % 5) * 10;
  const at = 120;
  bars[at].quoteVolume = 100_000;                 // turnover spike
  for (let i = at - 6; i <= at; i++) {            // a 2% drift into it
    bars[i].close = 100 * (1 + 0.02 * ((i - (at - 6)) / 6));
    bars[i].high = bars[i].close; bars[i].low = bars[i].close;
  }
  const events = detect(bars);
  assert.equal(events.length, 1);
  assert.equal(events[0].index, at);
  assert.ok(events[0].volumeZ > 3);
});

test("a move that has already run is refused, which is the point", () => {
  const bars = quiet();
  for (let i = 0; i < bars.length; i++) bars[i].quoteVolume = 1000 + (i % 5) * 10;
  const at = 120;
  bars[at].quoteVolume = 100_000;
  for (let i = at - 6; i <= at; i++) {            // a 30% move, far past the ceiling
    bars[i].close = 100 * (1 + 0.30 * ((i - (at - 6)) / 6));
    bars[i].high = bars[i].close; bars[i].low = bars[i].close;
  }
  assert.deepEqual(detect(bars), [], "chasing a finished move is not detection");
});

test("one event is not counted many times", () => {
  const bars = quiet();
  for (let i = 0; i < bars.length; i++) bars[i].quoteVolume = 1000 + (i % 5) * 10;
  // Three consecutive busy bars, all with a modest move — one episode.
  for (let k = 0; k < 3; k++) {
    const at = 120 + k;
    bars[at].quoteVolume = 100_000;
    for (let i = at - 6; i <= at; i++) {
      bars[i].close = 100 * 1.02; bars[i].high = bars[i].close; bars[i].low = bars[i].close;
    }
  }
  assert.ok(detect(bars).length <= 1, `cooldown of ${COOLDOWN_BARS} bars must collapse them`);
});

test("a bar reaching both levels is charged to the stop", () => {
  const bars = quiet(BASELINE_BARS + 30);
  const at = BASELINE_BARS + 1;
  // The very next bar spans both the target and the stop.
  bars[at + 1] = { ...bars[at + 1], high: 110, low: 90 };
  const r = backtest(bars, [{ index: at }], { stopPct: 5, targetPct: 5, horizonBars: 10 });
  assert.equal(r.stoppedPct, 100);
  assert.equal(r.hitPct, 0);
});

test("a position still open at the horizon is marked to market, not called flat", () => {
  const bars = quiet(BASELINE_BARS + 30);
  const at = BASELINE_BARS + 1;
  // Drifts up 2% and never reaches either level.
  for (let i = at + 1; i < bars.length; i++) {
    const p = 102;
    bars[i] = { ...bars[i], close: p, high: p, low: p };
  }
  const r = backtest(bars, [{ index: at }], { stopPct: 10, targetPct: 20, horizonBars: 10 });
  assert.equal(r.unresolvedPct, 100);
  assert.ok(r.expectancyR > 0, "an open position that drifted up is worth something");
  assert.ok(r.expectancyR < 1, "but far less than a target hit");
});

test("expectancy is reward times hits minus stops, not the reward ratio", () => {
  const bars = quiet(BASELINE_BARS + 30);
  const at = BASELINE_BARS + 1;
  bars[at + 1] = { ...bars[at + 1], high: 90, low: 90, close: 90 }; // straight to the stop
  const r = backtest(bars, [{ index: at }], { stopPct: 5, targetPct: 15, horizonBars: 10 });
  assert.equal(r.rr, 3);
  assert.equal(r.expectancyR, -1, "one stop, one trade");
  assert.equal(r.breakEvenHitPct, 25);
});

test("the baseline uses the same geometry on unsignalled bars", () => {
  const bars = quiet(BASELINE_BARS + 100);
  const b = baseline(bars, { stopPct: 5, targetPct: 5, horizonBars: 10 });
  assert.ok(b.n > 1, "a baseline needs many entries to mean anything");
  assert.equal(b.hitPct, 0, "a flat market reaches neither level");
});

test("signals with no outcome yet are excluded rather than counted as wins", () => {
  const bars = quiet(BASELINE_BARS + 5);
  const r = backtest(bars, [{ index: BASELINE_BARS + 3 }], { stopPct: 5, targetPct: 5, horizonBars: 10 });
  assert.equal(r, null);
});
