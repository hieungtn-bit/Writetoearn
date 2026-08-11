import test from "node:test";
import assert from "node:assert/strict";
import { BIAS, extractClaim, formatScoreboard, scoreClaim, tally } from "../src/scoreboard.mjs";

const brief = {
  spot: [
    { symbol: "BTCUSDT", price: 63250 },
    { symbol: "SOLUSDT", price: 73.5 },
  ],
  levels: [
    { symbol: "BTCUSDT", spot: 63250, support: 63100, resistance: 64693 },
    { symbol: "SOLUSDT", spot: 73.5, support: 72.32, resistance: 77.5 },
  ],
};

test("the most-mentioned cashtag becomes the subject", () => {
  const text = "$BTC is holding. $ETH lagging. $BTC support at 63,100. Bias: WAIT";
  const claim = extractClaim(text, brief);
  assert.equal(claim.asset, "BTCUSDT");
  assert.equal(claim.support, 63100);
  assert.equal(claim.resistance, 64693);
});

test("a tie on mentions falls back to whichever came first", () => {
  const claim = extractClaim("$SOL then $BTC. Bias: WAIT", brief);
  assert.equal(claim.asset, "SOLUSDT");
});

test("each bias phrasing is recognised", () => {
  assert.equal(extractClaim("$BTC Bias: Selective Long here", brief).bias, BIAS.LONG);
  assert.equal(extractClaim("$BTC Bias: Selective Short here", brief).bias, BIAS.SHORT);
  assert.equal(extractClaim("$BTC Bias: WAIT here", brief).bias, BIAS.WAIT);
  assert.equal(extractClaim("$BTC no stance given", brief).bias, null);
});

/** Hourly candles covering the judging window. */
function candles({ start, low, high, close, count = 24 }) {
  return Array.from({ length: count }, (_, i) => ({
    openTime: start + (i + 1) * 3_600_000,
    open: close,
    high: i === 0 ? high : close,
    low: i === 0 ? low : close,
    close,
    volume: 1,
    quoteVolume: 1,
  }));
}

function stubFetch(rows) {
  return async () => ({
    ok: true,
    json: async () =>
      rows.map((c) => [c.openTime, c.open, c.high, c.low, c.close, c.volume, 0, c.quoteVolume]),
  });
}

const publishedAt = new Date(Date.now() - 48 * 3_600_000).toISOString();
const base = {
  asset: "BTCUSDT",
  priceAtPost: 63250,
  support: 63100,
  resistance: 64693,
  publishedAt,
};

test("a long call that went up is scored correct", async () => {
  const start = new Date(publishedAt).getTime();
  const fetchImpl = stubFetch(candles({ start, low: 63200, high: 64000, close: 64000 }));
  const score = await scoreClaim({ ...base, bias: BIAS.LONG }, { fetchImpl });

  assert.equal(score.biasCorrect, true);
  assert.ok(score.movePct > 0);
  assert.equal(score.supportHeld, true);
  assert.equal(score.resistanceBroken, false);
});

test("a long call that went down is scored wrong", async () => {
  const start = new Date(publishedAt).getTime();
  const fetchImpl = stubFetch(candles({ start, low: 62000, high: 63300, close: 62500 }));
  const score = await scoreClaim({ ...base, bias: BIAS.LONG }, { fetchImpl });

  assert.equal(score.biasCorrect, false);
  assert.equal(score.supportHeld, false, "price traded below the stated support");
});

test("a short call that went down is scored correct", async () => {
  const start = new Date(publishedAt).getTime();
  const fetchImpl = stubFetch(candles({ start, low: 62000, high: 63300, close: 62500 }));
  const score = await scoreClaim({ ...base, bias: BIAS.SHORT }, { fetchImpl });
  assert.equal(score.biasCorrect, true);
});

test("WAIT is right when the range holds and wrong when it breaks", async () => {
  const start = new Date(publishedAt).getTime();

  const held = stubFetch(candles({ start, low: 63150, high: 64500, close: 63800 }));
  assert.equal((await scoreClaim({ ...base, bias: BIAS.WAIT }, { fetchImpl: held })).biasCorrect, true);

  const broke = stubFetch(candles({ start, low: 61000, high: 63300, close: 61500 }));
  assert.equal((await scoreClaim({ ...base, bias: BIAS.WAIT }, { fetchImpl: broke })).biasCorrect, false);
});

test("a call younger than the judging window is left open, not guessed", async () => {
  const fresh = { ...base, bias: BIAS.LONG, publishedAt: new Date().toISOString() };
  const score = await scoreClaim(fresh, { fetchImpl: stubFetch([]) });
  assert.equal(score, null);
});

test("a claim with no asset cannot be scored", async () => {
  const score = await scoreClaim({ ...base, asset: null }, { fetchImpl: stubFetch([]) });
  assert.equal(score, null);
});

test("tally counts hits over applicable calls only", () => {
  const claims = [
    { score: { biasCorrect: true, supportHeld: true } },
    { score: { biasCorrect: false, supportHeld: true } },
    { score: { biasCorrect: true, supportHeld: null } },
    { score: null },
  ];
  const t = tally(claims);
  assert.equal(t.total, 3);
  assert.deepEqual({ hits: t.bias.hits, total: t.bias.total }, { hits: 2, total: 3 });
  assert.deepEqual({ hits: t.support.hits, total: t.support.total }, { hits: 2, total: 2 });
});

test("the scoreboard shows losses alongside wins", () => {
  const claims = [
    {
      asset: "BTCUSDT",
      bias: BIAS.LONG,
      support: 63100,
      publishedAt: new Date().toISOString(),
      score: { biasCorrect: true, movePct: 1.5, hours: 24, supportHeld: true },
    },
    {
      asset: "SOLUSDT",
      bias: BIAS.SHORT,
      support: 72.32,
      publishedAt: new Date().toISOString(),
      score: { biasCorrect: false, movePct: 3.1, hours: 24, supportHeld: false },
    },
  ];

  const board = formatScoreboard(claims);
  assert.match(board, /1\/2 \(50%\)/, "hit rate is stated plainly");
  assert.match(board, /✅ BTC/);
  assert.match(board, /❌ SOL/, "the loss is shown, not hidden");
  assert.match(board, /support 72\.32 broke/);
});

test("an empty scoreboard says so instead of inventing a record", () => {
  assert.match(formatScoreboard([]), /needs 7 days of published calls/);
});

test("a WAIT with no levels is judged, not waved through", async () => {
  // The old rule read "right when neither level gave way". With no levels,
  // supportHeld and resistanceBroken are both null, and
  // `null !== false && null !== true` is true — so every levelless WAIT scored
  // correct automatically and the scoreboard could only ever report 100%.
  const publishedAt = new Date("2026-01-02T00:00:00Z").getTime();
  const hour = 3_600_000;

  // 60 quiet hours before publication, then a violent 24 hours after it.
  const candles = [];
  for (let i = -60; i < 24; i++) {
    const flat = i < 0;
    const close = flat ? 100 : 100 + (i + 1) * 0.8;
    candles.push({
      openTime: publishedAt + i * hour,
      open: close, high: close * 1.001, low: close * 0.999, close,
    });
  }
  const fetchImpl = async () => ({
    ok: true,
    json: async () => candles.map((c) => [c.openTime, c.open, c.high, c.low, c.close, 0, 0, 0, 0, 0, 0]),
  });

  const claim = {
    asset: "TESTUSDT", bias: "WAIT", priceAtPost: 100,
    publishedAt: new Date(publishedAt).toISOString(), support: null, resistance: null,
  };
  const score = await scoreClaim(claim, { hours: 24, fetchImpl });

  assert.ok(score, "the call should be scoreable");
  assert.ok(score.movePct > 15, `expected a large move, got ${score.movePct}`);
  assert.equal(score.biasCorrect, false, "standing aside through a large move is a miss");
});

test("a WAIT through an ordinary move is still correct", async () => {
  const publishedAt = new Date("2026-01-02T00:00:00Z").getTime();
  const hour = 3_600_000;
  const candles = [];
  for (let i = -60; i < 24; i++) {
    // Steady 1% oscillation both before and after: nothing unusual happened.
    const close = 100 + Math.sin(i / 3) * 1;
    candles.push({
      openTime: publishedAt + i * hour,
      open: close, high: close * 1.001, low: close * 0.999, close,
    });
  }
  const fetchImpl = async () => ({
    ok: true,
    json: async () => candles.map((c) => [c.openTime, c.open, c.high, c.low, c.close, 0, 0, 0, 0, 0, 0]),
  });

  const score = await scoreClaim(
    { asset: "TESTUSDT", bias: "WAIT", priceAtPost: 100,
      publishedAt: new Date(publishedAt).toISOString(), support: null, resistance: null },
    { hours: 24, fetchImpl },
  );
  assert.ok(score);
  assert.equal(score.biasCorrect, true, "an unremarkable move vindicates standing aside");
});
