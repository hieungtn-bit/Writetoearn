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
    "Bias: WAIT. Does support hold? Not financial advice. $BTC #WriteToEarn #BinanceSquare";
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
  const body = "word ".repeat(50) + "Bias: WAIT. Does it hold? Not financial advice. #WriteToEarn ";

  assert.equal(verifyStructure(`${body} $BTC $ETH $SOL`).ok, true, "three is allowed");

  const four = verifyStructure(`${body} $BTC $ETH $SOL $BNB`);
  assert.equal(four.ok, false);
  assert.ok(
    four.problems.some((p) => p.includes("4 distinct cashtags") && p.includes("limit of 3")),
    `expected a cashtag-count problem, got ${JSON.stringify(four.problems)}`,
  );
});

test("repeating the same cashtag does not count against the limit", () => {
  const body = "word ".repeat(50) + "Bias: WAIT. Does it hold? Not financial advice. #WriteToEarn ";
  assert.equal(verifyStructure(`${body} $BTC $BTC $BTC $ETH $SOL`).ok, true);
});

test("admitting a field is unavailable is allowed; claiming it is not", () => {
  const honest =
    "Open interest is not available to me, and that is exactly what would show forced selling.";
  assert.equal(verifyNoForbiddenClaims(honest, brief).ok, true, "disclosure must pass");

  assert.equal(
    verifyNoForbiddenClaims("I cannot see the long/short ratio here.", brief).ok,
    true,
  );

  assert.equal(verifyNoForbiddenClaims("Open interest is climbing fast.", brief).ok, false);
});

test("a disclosure in one sentence does not licence a claim in the next", () => {
  const mixed =
    "Open interest is not available to me. But open interest is clearly rising.";
  const result = verifyNoForbiddenClaims(mixed, brief);
  assert.equal(result.ok, false, "the second sentence is still a fabricated claim");
  assert.deepEqual(result.violations, ["openInterest"]);
});

test("a post with no stated bias is rejected, since the scoreboard parses it", () => {
  const body = "word ".repeat(50) + "Does it hold? Not financial advice. $BTC #WriteToEarn ";

  const noBias = verifyStructure(body);
  assert.equal(noBias.ok, false);
  assert.ok(noBias.problems.some((p) => p.includes("no bias stated")));

  for (const bias of ["Bias: WAIT.", "Bias: Selective Long here.", "Bias: Selective Short."]) {
    assert.equal(verifyStructure(`${body} ${bias}`).ok, true, `${bias} should satisfy the check`);
  }
});

const altScreen = {
  screenedAt: "2026-08-01T07:33:15.224Z",
  rows: [
    {
      symbol: "ATOMUSDT",
      price: 3.412,
      change7dPct: -10.99,
      change30dPct: -21.09,
      rsi14: 19.2,
      rangePosition30d: 3.43,
      volumeZScore: -2.74,
      realizedVol30d: 38.4,
    },
    {
      symbol: "PUMPUSDT",
      price: 0.00842,
      change7dPct: 24.09,
      change30dPct: 45.04,
      rsi14: 65.7,
      rangePosition30d: 95.8,
      volumeZScore: -1.18,
      realizedVol30d: 114.2,
    },
  ],
};

test("altcoin figures fail against a majors-only brief", () => {
  const post = "ATOM RSI 19.2, volume z -2.74, down -21.09% over 30 days.";
  const result = verifyNumbers(post, brief);
  assert.equal(result.ok, false, "the brief has no ATOM data to trace against");
});

test("the same altcoin figures pass once the screen is supplied", () => {
  const post = "ATOM RSI 19.2, volume z -2.74, down -21.09% over 30 days.";
  const result = verifyNumbers(post, brief, { screen: altScreen });
  assert.equal(result.ok, true, JSON.stringify(result.unmatched));
});

test("the screen widens the allowed set without loosening it", () => {
  const result = verifyNumbers("PUMP ripped 31.5% this week.", brief, { screen: altScreen });
  assert.equal(result.ok, false, "an invented alt figure is still caught");
  assert.equal(result.unmatched[0].value, 31.5);
});

test("majors still verify when a screen is passed too", () => {
  const result = verifyNumbers("BTC at 63,250, support 63,100.", brief, { screen: altScreen });
  assert.equal(result.ok, true, JSON.stringify(result.unmatched));
});

test("verifyPost names the screen in its failure message when one was searched", () => {
  const post =
    "🚨 ATOM is washed out.\n\nATOM RSI 19.2, but PUMP ripped 31.5% this week.\n\n" +
    "Bias: WAIT. No participation behind either extreme.\n\nWhich resolves first? 👇\n\n" +
    "Not financial advice. DYOR.\n\n$ATOM #WriteToEarn #BinanceSquare";
  const result = verifyPost(post, brief, { screen: altScreen, minWords: 10 });
  assert.equal(result.ok, false);
  assert.ok(
    result.problems.some((p) => p.includes("the brief or the screen")),
    `expected the screen to be named, got: ${result.problems.join("; ")}`,
  );
});

test("a market post without a bias is unscoreable and fails", async () => {
  const { verifyStructure } = await import("../src/verify.mjs");
  const text = "$BTC looks interesting here. What do you think? Not financial advice. #tag";
  const r = verifyStructure(text, { minWords: 5 });
  assert.ok(r.problems.some((p) => p.includes("no bias")));
});

test("a profile post may skip the bias, but only when asked explicitly", async () => {
  const { verifyStructure } = await import("../src/verify.mjs");
  const text = "Here is what this account does and why. Want the receipts? Not financial advice. #tag";
  assert.ok(verifyStructure(text, { minWords: 5 }).problems.some((p) => p.includes("no bias")));
  assert.equal(
    verifyStructure(text, { minWords: 5, requireBias: false }).problems.some((p) => p.includes("no bias")),
    false,
  );
});

test("a study snapshot vouches for research figures at any nesting depth", async () => {
  const { collectStudyNumbers } = await import("../src/verify.mjs");
  const v = collectStudyNumbers({ a: 5.5, b: { c: 17.2, d: [12.3, { e: 23.2 }] }, s: "skip" });
  for (const n of [5.5, 17.2, 12.3, 23.2]) assert.ok(v.includes(n), `missing ${n}`);
  assert.equal(v.length, 4, "strings and structure contribute nothing");
});

test("without the snapshot a research figure is not citable", async () => {
  const { verifyNumbers } = await import("../src/verify.mjs");
  const brief = { spot: [], levels: [], funding: [], analysis: null };
  assert.equal(verifyNumbers("The hit rate was 17.2%.", brief).ok, false);
  assert.equal(
    verifyNumbers("The hit rate was 17.2%.", brief, { study: { signal: { hitPct: 17.2 } } }).ok,
    true,
  );
});
