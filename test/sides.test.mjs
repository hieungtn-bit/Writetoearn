import test from "node:test";
import assert from "node:assert/strict";
import {
  MAX_RUN_PCT,
  SHORT_MIN_RANGE_POSITION,
  evaluateSide,
  formatSides,
} from "../src/sides.mjs";

/** 40 daily candles spanning low..high, with the last two controllable. */
const daily = ({ low = 90, high = 110, lastQuoteVolume = 1e6 } = {}) => {
  const rows = [];
  for (let i = 0; i < 40; i++) {
    const mid = (low + high) / 2;
    rows.push({ open: mid, high, low, close: mid, volume: 1, quoteVolume: lastQuoteVolume });
  }
  return rows;
};

const ticker = (o = {}) => ({
  symbol: "TESTUSDT", price: 100, change24hPct: 10, quoteVolume24h: 2e6, ...o,
});

test("both sides evaluate the same five named conditions", () => {
  const l = evaluateSide({ side: "long", ticker: ticker(), daily: daily(), hourly: null, oi: null });
  const s = evaluateSide({ side: "short", ticker: ticker({ change24hPct: -10 }), daily: daily(), hourly: null, oi: null });
  assert.deepEqual(Object.keys(l.conditions), Object.keys(s.conditions));
  assert.equal(l.side, "long");
  assert.equal(s.side, "short");
});

test("distance from the recent extreme is measured toward the trade, not upward", () => {
  const candles = daily({ low: 80, high: 120 });
  // Price 100 sits 25% above the floor and 16.67% below the ceiling. Avoid 96,
  // where 80 x 1.2 and 120 x 0.8 coincide and the two distances are equal for
  // reasons that have nothing to do with the code being right.
  const l = evaluateSide({ side: "long", ticker: ticker({ price: 100 }), daily: candles, hourly: null, oi: null });
  const s = evaluateSide({ side: "short", ticker: ticker({ price: 100, change24hPct: -10 }), daily: candles, hourly: null, oi: null });
  assert.ok(Math.abs(l.offExtremePct - 25) < 1e-9, "long measures up from the low");
  assert.ok(Math.abs(s.offExtremePct - 100 / 6) < 1e-9, "short measures down from the high");
});

test("open interest has to move the way the trade does", () => {
  const up = { changePct: 12 };
  const down = { changePct: -12 };
  const args = { daily: daily(), hourly: null };
  assert.equal(
    evaluateSide({ ...args, side: "long", ticker: ticker(), oi: up }).conditions.openInterestAligned, true);
  assert.equal(
    evaluateSide({ ...args, side: "long", ticker: ticker(), oi: down }).conditions.openInterestAligned, false);
  assert.equal(
    evaluateSide({ ...args, side: "short", ticker: ticker({ change24hPct: -10 }), oi: down }).conditions.openInterestAligned, true);
  assert.equal(
    evaluateSide({ ...args, side: "short", ticker: ticker({ change24hPct: -10 }), oi: up }).conditions.openInterestAligned, false);
});

test("the overextension guard uses the size of the move, not its sign", () => {
  // A -55% day is as extended as a +55% one. Using the raw signed change would
  // let every collapse through the short filter untouched.
  const crashed = evaluateSide({
    side: "short",
    ticker: ticker({ change24hPct: -(MAX_RUN_PCT + 15), price: 100 }),
    daily: daily(), hourly: null, oi: null,
  });
  assert.equal(crashed.conditions.notOverextended, false);
});

test("a short at the very bottom of its range is treated as overextended", () => {
  const candles = daily({ low: 100, high: 200 });
  const atFloor = evaluateSide({
    side: "short",
    ticker: ticker({ price: 103, change24hPct: -12 }),
    daily: candles, hourly: null, oi: null,
  });
  assert.ok(atFloor.rangePosition < SHORT_MIN_RANGE_POSITION);
  assert.equal(atFloor.conditions.notOverextended, false);
});

test("the report refuses to present the two sides as equal evidence", () => {
  const text = formatSides({
    scanned: 10, suppressed: [], minScore: 3, long: [], short: [],
    qualified: { long: [], short: [] },
  });
  assert.match(text, /do not carry equal evidence/);
  assert.match(text, /3\.96x, 2\.42 sigma/);
  assert.match(text, /3\.21x, 1\.53 sigma/);
  assert.match(text, /arbitrage that does not exist/);
  assert.match(text, /watchlist rather than a signal/);
});

test("a delisting notice is reported as poisoning both sides", () => {
  const text = formatSides({
    scanned: 10, minScore: 3, long: [], short: [],
    suppressed: [{ symbol: "HFTUSDT", change24hPct: 6, delisting: { title: "n" } }],
    qualified: { long: [], short: [] },
  });
  assert.match(text, /Skipped, delisting announced: HFT/);
  assert.match(text, /poisons both sides/);
});
