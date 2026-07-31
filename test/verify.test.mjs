import test from "node:test";
import assert from "node:assert/strict";
import {
  extractNumbers,
  verifyNumbers,
  verifyNoForbiddenClaims,
  verifyStructure,
  verifyPost,
} from "../src/verify.mjs";

const brief = {
  spot: [
    {
      symbol: "BTCUSDT",
      price: 63250.01,
      change24hPct: -2.746,
      high24h: 65409.56,
      low24h: 63250,
      quoteVolume24h: 1_079_077_892,
    },
  ],
  levels: [
    {
      symbol: "BTCUSDT",
      spot: 63250.01,
      support: 63100,
      resistance: 64692.83,
      periodHigh: 66956.15,
      periodLow: 59588,
      windowDays: 30,
    },
  ],
  funding: [{ instId: "BTC-USDT-SWAP", fundingRatePct: 0.0064 }],
  unavailable: [{ field: "openInterest" }, { field: "longShortRatio" }],
};

test("comma-separated, suffixed and percent numbers all parse", () => {
  const found = extractNumbers("BTC $63,250 (-2.75%) vol $1.08B, support 63.1K");
  const values = found.map((f) => f.value);

  assert.ok(values.includes(63250));
  assert.ok(values.includes(2.75));
  assert.ok(values.includes(1.08e9));
  assert.ok(values.includes(63100));
  assert.equal(found.find((f) => f.value === 2.75).isPercent, true);
});

test("figures drawn from the brief pass", () => {
  const post = "BTC at 63,250, down -2.75% on the day. Support 63,100, resistance 64,693.";
  const result = verifyNumbers(post, brief);
  assert.equal(result.ok, true, JSON.stringify(result.unmatched));
  assert.ok(result.checked > 0);
});

test("an invented price is caught", () => {
  const result = verifyNumbers("BTC just tapped 71,400 on the day.", brief);
  assert.equal(result.ok, false);
  assert.equal(result.unmatched[0].value, 71400);
});

test("an invented percentage is caught even when it looks plausible", () => {
  const result = verifyNumbers("BTC down -2.9% today.", brief);
  assert.equal(result.ok, false);
  assert.equal(result.unmatched[0].value, 2.9);
});

test("rounded and abbreviated forms of real figures are accepted", () => {
  for (const variant of ["63.2K", "63,250", "$1.08B", "64,693", "59,588"]) {
    const result = verifyNumbers(`Level at ${variant}.`, brief);
    assert.equal(result.ok, true, `${variant} should trace to the brief`);
  }
});

test("bare small integers are structural and not challenged", () => {
  const result = verifyNumbers("Watching 3 charts over the last 24h and 30d.", brief);
  assert.equal(result.ok, true);
});

test("a small integer with a percent sign is still checked", () => {
  const result = verifyNumbers("BTC down 9% today.", brief);
  assert.equal(result.ok, false, "an integer percentage is a market claim");
});

test("writing about unavailable fields is blocked", () => {
  assert.equal(verifyNoForbiddenClaims("Open interest is flat.", brief).ok, false);
  assert.equal(verifyNoForbiddenClaims("The long/short ratio is stretched.", brief).ok, false);
  assert.equal(verifyNoForbiddenClaims("Funding on OKX is positive.", brief).ok, true);
});

test("unavailable-field checks only apply to fields actually missing", () => {
  const withOi = { ...brief, unavailable: [] };
  assert.equal(verifyNoForbiddenClaims("Open interest is climbing.", withOi).ok, true);
});

test("structure requires tags, a disclaimer and a question", () => {
  const good =
    "🚨 BTC at 63,250. ".repeat(8) +
    "Does support hold? Not financial advice. $BTC #WriteToEarn #BinanceSquare";
  assert.equal(verifyStructure(good).ok, true);

  const noTags = "word ".repeat(60) + "Does it hold? Not financial advice.";
  assert.ok(verifyStructure(noTags).problems.some((p) => p.includes("hashtag")));

  const noDisclaimer = "word ".repeat(60) + "Does it hold? $BTC #WriteToEarn";
  assert.ok(verifyStructure(noDisclaimer).problems.some((p) => p.includes("disclaimer")));

  const noQuestion = "word ".repeat(60) + "Not financial advice. $BTC #WriteToEarn";
  assert.ok(verifyStructure(noQuestion).problems.some((p) => p.includes("call-to-action")));
});

test("over-long posts are rejected", () => {
  const tooLong = "word ".repeat(250) + "? Not financial advice. $BTC #WriteToEarn";
  assert.ok(verifyStructure(tooLong).problems.some((p) => p.includes("exceeds")));
});

test("verifyPost combines every gate and names each failure", () => {
  const bad =
    "🚨 BTC ripped to 88,000 today. Open interest is exploding. " +
    "word ".repeat(50) +
    "Are you long? $BTC #WriteToEarn #BinanceSquare";

  const result = verifyPost(bad, brief);
  assert.equal(result.ok, false);
  assert.ok(result.problems.some((p) => p.includes("88,000")), "invented price flagged");
  assert.ok(result.problems.some((p) => p.includes("openInterest")), "forbidden claim flagged");
  assert.ok(result.problems.some((p) => p.includes("disclaimer")), "missing disclaimer flagged");
});

test("the real published post passes every gate", () => {
  const published = `🚨 BTC is printing its 24h low RIGHT NOW — 63,250.

$BTC $63,250 (-2.75% 24h)

• Support sits at 63,100, the last daily swing pivot before the 30d floor at 59,588
• Funding on OKX perps is still positive (+0.0064%). Longs are paying to stay long
• Resistance overhead at 64,693, with the 30d high up at 66,956

Bias: WAIT — price grinding into support while funding stays positive usually means there's long liquidity left to flush.

Does 63.1K hold, or do we tag a 5-handle? Drop your level 👇

Not financial advice. DYOR.

$BTC #WriteToEarn #BinanceSquare`;

  const result = verifyPost(published, brief);
  assert.equal(result.ok, true, JSON.stringify(result.problems));
});

test("a fourth cashtag is blocked at draft time, as the API rejects it", () => {
  const body = "word ".repeat(50) + "Does it hold? Not financial advice. #WriteToEarn ";

  assert.equal(verifyStructure(`${body} $BTC $ETH $SOL`).ok, true, "three is allowed");

  const four = verifyStructure(`${body} $BTC $ETH $SOL $BNB`);
  assert.equal(four.ok, false);
  assert.ok(
    four.problems.some((p) => p.includes("4 distinct cashtags") && p.includes("limit of 3")),
    `expected a cashtag-count problem, got ${JSON.stringify(four.problems)}`,
  );
});

test("repeating the same cashtag does not count against the limit", () => {
  const body = "word ".repeat(50) + "Does it hold? Not financial advice. #WriteToEarn ";
  assert.equal(verifyStructure(`${body} $BTC $BTC $BTC $ETH $SOL`).ok, true);
});
