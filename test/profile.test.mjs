import test from "node:test";
import assert from "node:assert/strict";
import { volumeProfile } from "../src/profile.mjs";

/** A bar that trades a flat range, so its volume is easy to reason about. */
const bar = (low, high, quoteVolume, close = (low + high) / 2) => ({ low, high, close, quoteVolume });

test("a single flat bar puts all its volume at one price", () => {
  const p = volumeProfile([bar(9, 11, 100), bar(10, 10, 500, 10)], 10);
  assert.ok(Math.abs(p.pocPrice - 10) < 0.05, "the busiest price is where the flat bar traded");
});

test("volume is split across a bar's range, not charged to one side", () => {
  // One bar straddling the price: half its volume is above, half below.
  const p = volumeProfile([bar(90, 110, 1000)], 100);
  assert.ok(Math.abs(p.overheadPct - 50) < 2, `expected about half overhead, got ${p.overheadPct}`);
});

test("price above everything traded leaves no overhead", () => {
  const p = volumeProfile([bar(10, 20, 100), bar(12, 18, 100)], 25);
  assert.equal(p.overheadPct, 0);
});

test("price below everything traded leaves all of it overhead", () => {
  const p = volumeProfile([bar(10, 20, 100), bar(12, 18, 100)], 5);
  assert.ok(p.overheadPct > 99);
});

test("the value area encloses most of the volume around the busiest price", () => {
  const bars = [
    bar(100, 101, 10), bar(101, 102, 20), bar(102, 103, 900), bar(103, 104, 20), bar(104, 105, 10),
  ];
  const p = volumeProfile(bars, 102.5);
  // 900 of 960 units are spread evenly over 102–103, so 70% of the total is
  // reached partway across that band — the value area is not obliged to
  // swallow the whole busiest bar, only to enclose 70% of volume.
  assert.ok(p.pocPrice >= 102 && p.pocPrice <= 103, "the busiest price sits in the dense band");
  assert.ok(p.valueAreaLow >= 102, "the value area starts inside the dense band");
  assert.ok(p.valueAreaHigh <= 103, "and does not reach into the thin tail above");
  assert.ok(p.valueAreaHigh - p.valueAreaLow > 0.5, "and is wide enough to hold 70%");
});

test("degenerate input returns null rather than dividing by zero", () => {
  assert.equal(volumeProfile([], 10), null);
  assert.equal(volumeProfile(null, 10), null);
  // Every bar at exactly one price: no range to bin across.
  assert.equal(volumeProfile([bar(10, 10, 5, 10)], 10), null);
  // Bars with no turnover at all.
  assert.equal(volumeProfile([bar(9, 11, 0)], 10), null);
});

test("the profile is finer than charging whole bars to one side", () => {
  // Three bars all straddling the price. A whole-bar method charges each to
  // whichever side its midpoint falls, which here is all of them; the profile
  // sees that most of the volume actually traded below.
  const bars = [bar(95, 106, 100), bar(96, 106, 100), bar(97, 106, 100)];
  const p = volumeProfile(bars, 105);
  assert.ok(p.overheadPct < 20, `most volume traded below 105, got ${p.overheadPct}% above`);
});
