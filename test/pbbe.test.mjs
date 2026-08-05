import test from "node:test";
import assert from "node:assert/strict";
import {
  BASE_MAX_DAYS,
  MAX_FROM_BASE,
  WEIGHTS,
  findBase,
  markdownReport,
  maxAchievableZ,
  scorePair,
  structureConfirm,
  tierFor,
  volumeZ,
} from "../src/pbbe.mjs";

const DAY = 86_400_000;

/** A flat range with a stated half-width, plus one unfinished candle at the end. */
const range = (n, { price = 100, halfWidthPct = 5, quoteVolume = 1e6 } = {}) => {
  const rows = [];
  for (let i = 0; i < n; i++) {
    const wobble = (i % 2 ? 1 : -1) * (price * halfWidthPct) / 100;
    rows.push({
      openTime: i * DAY,
      open: price,
      high: price + Math.abs(wobble),
      low: price - Math.abs(wobble),
      close: price + wobble / 2,
      volume: quoteVolume / price,
      quoteVolume,
    });
  }
  return rows;
};

test("the 7-day z-score is capped when the reading sits in its own baseline", () => {
  // (n-1)/sqrt(n). This is the reason the spec's gate of 2.0 selects the top
  // sliver of what the formula can print rather than unusual volume.
  assert.ok(Math.abs(maxAchievableZ(7) - 2.2678) < 0.001);
  assert.ok(maxAchievableZ(30) > 5.2);

  // Empirically, with six equal days and one enormous one.
  const xs = [1, 1, 1, 1, 1, 1, 1e9];
  const m = xs.reduce((s, x) => s + x, 0) / xs.length;
  const sd = Math.sqrt(xs.reduce((s, x) => s + (x - m) ** 2, 0) / (xs.length - 1));
  assert.ok((1e9 - m) / sd <= maxAchievableZ(7) + 1e-6);
});

test("volumeZ excludes the observation, so it is not capped", () => {
  const prior = Array(30).fill(1e6);
  // A flat baseline has zero deviation and no z is definable.
  assert.ok(Number.isNaN(volumeZ(1e9, prior, 30)));

  const noisy = Array.from({ length: 30 }, (_, i) => 1e6 + (i % 3) * 1e4);
  const z = volumeZ(1e9, noisy, 30);
  assert.ok(z > maxAchievableZ(30), "an outside reading can exceed the in-sample ceiling");
});

test("volumeZ refuses a baseline shorter than asked for", () => {
  assert.ok(Number.isNaN(volumeZ(1e6, [1, 2, 3], 30)));
});

test("findBase takes the longest qualifying window, not the tightest", () => {
  const base = findBase(range(BASE_MAX_DAYS + 2, { halfWidthPct: 4 }));
  assert.equal(base.days, BASE_MAX_DAYS);
  assert.ok(base.lengthScore === 1);
});

test("findBase rejects a window wider than the ceiling", () => {
  assert.equal(findBase(range(30, { halfWidthPct: 40 })), null);
});

test("findBase ignores the final, partial candle", () => {
  const daily = range(30, { halfWidthPct: 4 });
  daily.at(-1).high = 1000; // today spikes; the base must not widen
  const base = findBase(daily);
  assert.ok(base.high < 200);
});

test("a tighter base scores higher than a loose one of the same length", () => {
  const tight = findBase(range(30, { halfWidthPct: 3 }));
  const loose = findBase(range(30, { halfWidthPct: 15 }));
  assert.equal(tight.days, loose.days);
  assert.ok(tight.quality > loose.quality);
});

test("structureConfirm reports which checks fired, not just how many", () => {
  const rising = Array.from({ length: 40 }, (_, i) => ({
    high: 100 + i, low: 99 + i, close: 100 + i, quoteVolume: 1e6 + i * 1e4,
  }));
  const s = structureConfirm(rising, 100);
  assert.equal(s.of, 4);
  assert.equal(s.checks.closedAboveBase, true);
  assert.equal(s.checks.fastAboveSlow, true);
  assert.equal(s.checks.higherLows, true);
  assert.equal(s.score, s.hit / 4);
});

test("structureConfirm returns null rather than guessing on a short series", () => {
  assert.equal(structureConfirm(range(10), 100), null);
});

test("the score is the weighted sum of the components it prints", () => {
  const daily = range(30, { halfWidthPct: 4, quoteVolume: 1e6 });
  const ticker = { symbol: "TESTUSDT", price: 102, change24hPct: 3, quoteVolume24h: 2e7 };
  const row = scorePair({ ticker, daily, fourHour: null });

  const expected = Object.entries(WEIGHTS)
    .reduce((s, [k, w]) => s + w * row.components[k], 0) * 100;
  assert.ok(Math.abs(row.score - expected) < 1e-9);
  assert.ok(row.score >= 0 && row.score <= 100);
});

test("a pair far above its base fails the distance gate and scores no proximity", () => {
  const daily = range(30, { halfWidthPct: 4 });
  const baseTop = findBase(daily).high;
  const ticker = {
    symbol: "TESTUSDT",
    price: baseTop * (1 + MAX_FROM_BASE + 0.2),
    change24hPct: 60,
    quoteVolume24h: 2e7,
  };
  const row = scorePair({ ticker, daily, fourHour: null });
  assert.equal(row.gates.nearBase, false);
  assert.equal(row.components.proximity, 0);
  assert.equal(row.passedGates, false);
});

test("a pair still inside its base is treated as early, not rejected", () => {
  const daily = range(30, { halfWidthPct: 4 });
  const ticker = { symbol: "TESTUSDT", price: 98, change24hPct: -1, quoteVolume24h: 2e7 };
  const row = scorePair({ ticker, daily, fourHour: null });
  assert.ok(row.fromBasePct < 0);
  assert.equal(row.gates.nearBase, true);
  assert.equal(row.components.proximity, 1);
});

test("missing 4h data zeroes the structure term instead of dropping the row", () => {
  const row = scorePair({
    ticker: { symbol: "TESTUSDT", price: 102, change24hPct: 1, quoteVolume24h: 2e7 },
    daily: range(30, { halfWidthPct: 4 }),
    fourHour: null,
  });
  assert.equal(row.components.structure, 0);
  assert.equal(row.gates.hasStructure, false);
});

test("tier boundaries are inclusive at the stated thresholds", () => {
  assert.equal(tierFor(78), "High Priority");
  assert.equal(tierFor(77.9), "Watchlist");
  assert.equal(tierFor(65), "Watchlist");
  assert.equal(tierFor(64.9), "Observe");
  assert.equal(tierFor(49.9), null);
});

test("the markdown report says the score is unvalidated even when empty", () => {
  const md = markdownReport({
    rows: [], qualified: [], scannedAt: "2026-08-05T00:00:00Z",
    eligible: 0, examined: 0, zWindow: 30,
  });
  assert.match(md, /Nothing cleared every gate/);
  assert.match(md, /1\.01x lift at 0\.09 sigma/);
});

test("the scan report names any term whose weight buys no ordering", async () => {
  const { formatScan } = await import("../src/pbbe.mjs");
  const daily = range(30, { halfWidthPct: 4 });
  // Three pairs, all sitting below their base top, so proximity is pinned at 1
  // for every one of them — the pathology the live scan showed.
  const rows = ["AUSDT", "BUSDT", "CUSDT"].map((symbol, i) =>
    scorePair({
      ticker: { symbol, price: 96 + i, change24hPct: 1, quoteVolume24h: 2e7 },
      daily,
      fourHour: null,
    }));
  assert.ok(rows.every((r) => r.components.proximity === 1));

  const text = formatScan({
    rows, qualified: [], eligible: 3, examined: 3, suppressed: [], zWindow: 30, minVolumeZ: 2,
  });
  assert.match(text, /proximity\s+25 pts allotted\s+sd\s+0\.00\s+— near-constant/);
});
