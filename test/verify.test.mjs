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
    "Bias: WAIT. Does support hold? Not financial advice. $BTC #Volatility #WriteToEarn";
  assert.equal(verifyStructure(good).ok, true);

  const noTags = "word ".repeat(60) + "Does it hold? Not financial advice.";
  assert.ok(verifyStructure(noTags).problems.some((p) => p.includes("hashtag")));

  const noDisclaimer = "word ".repeat(60) + "Does it hold? $BTC #Volatility #WriteToEarn";
  assert.ok(verifyStructure(noDisclaimer).problems.some((p) => p.includes("disclaimer")));

  const noQuestion = "word ".repeat(60) + "Not financial advice. $BTC #Volatility #WriteToEarn";
  assert.ok(verifyStructure(noQuestion).problems.some((p) => p.includes("call-to-action")));
});

test("over-long posts are rejected", () => {
  const tooLong = "word ".repeat(250) + "? Not financial advice. $BTC #Volatility #WriteToEarn";
  assert.ok(verifyStructure(tooLong).problems.some((p) => p.includes("exceeds")));
});

test("verifyPost combines every gate and names each failure", () => {
  const bad =
    "🚨 BTC ripped to 88,000 today. Open interest is exploding. " +
    "word ".repeat(50) +
    "Are you long? $BTC #Volatility #WriteToEarn";

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

$BTC #Volatility #WriteToEarn`;

  const result = verifyPost(published, brief);
  assert.equal(result.ok, true, JSON.stringify(result.problems));
});

test("a fourth cashtag is blocked at draft time, as the API rejects it", () => {
  const body = "word ".repeat(50) + "Bias: WAIT. Does it hold? Not financial advice. #Volatility #WriteToEarn ";

  assert.equal(verifyStructure(`${body} $BTC $ETH $SOL`).ok, true, "three is allowed");

  const four = verifyStructure(`${body} $BTC $ETH $SOL $BNB`);
  assert.equal(four.ok, false);
  assert.ok(
    four.problems.some((p) => p.includes("4 distinct cashtags") && p.includes("limit of 3")),
    `expected a cashtag-count problem, got ${JSON.stringify(four.problems)}`,
  );
});

test("repeating the same cashtag does not count against the limit", () => {
  const body = "word ".repeat(50) + "Bias: WAIT. Does it hold? Not financial advice. #Volatility #WriteToEarn ";
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
  const body = "word ".repeat(50) + "Does it hold? Not financial advice. $BTC #Volatility #WriteToEarn ";

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
    "Not financial advice. DYOR.\n\n$ATOM #Volatility #WriteToEarn";
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

test("an ISO date is a calendar label, not a market figure", async () => {
  const { extractNumbers } = await import("../src/verify.mjs");
  const got = extractNumbers("On 2026-07-23 turnover was 0.222M.").map((n) => n.value);
  assert.deepEqual(got, [222000], "the date contributes nothing, the turnover does");
});

test("a bare year-like number outside a date is still checked", async () => {
  const { extractNumbers } = await import("../src/verify.mjs");
  assert.ok(extractNumbers("Volume hit 2026 units.").some((n) => n.value === 2026));
});

test("an indicator period is a parameter, not a price", async () => {
  const { extractNumbers } = await import("../src/verify.mjs");
  const got = extractNumbers("SMA200 sits at 71,168 and RSI14 reads 43.2.").map((n) => n.value);
  assert.deepEqual(got, [71168, 43.2], "the labels contribute nothing, the readings do");
});

test("a candle series vouches for its own window, but not for spans inside it", async () => {
  const { collectCandleNumbers } = await import("../src/verify.mjs");
  // A hundred sessions from 100 down to 50, having touched 120 on the way.
  const series = Array.from({ length: 100 }, (_, i) => ({
    open: 100 - i * 0.5,
    high: i === 10 ? 120 : 100 - i * 0.5,
    low: 100 - i * 0.5 - 1,
    close: 100 - i * 0.5,
    quoteVolume: 1_000,
  }));
  const got = collectCandleNumbers([series]);

  assert.ok(got.includes(100), "the window length is citable");
  assert.ok(got.includes(120), "so is the window high");
  assert.ok(got.some((v) => Math.abs(v - 49.5) < 1e-9), "and the total move across it");
  assert.ok(got.some((v) => Math.abs(v - 57.9) < 0.1), "and the fall from the window high");
  assert.ok(
    !got.some((v) => Math.abs(v - 25) < 1e-9),
    "a span between two arbitrary candles is still not citable",
  );
});

test("candle windows stay attached to the series that produced them", async () => {
  const { collectCandleNumbers } = await import("../src/verify.mjs");
  const flat = (a, b) => [
    { open: a, high: a, low: a, close: a, quoteVolume: 1 },
    { open: b, high: b, low: b, close: b, quoteVolume: 1 },
  ];
  // Two series, one doubling and one halving. Concatenated they would read as
  // flat; kept apart, each reports its own move.
  const got = collectCandleNumbers([flat(100, 200), flat(200, 100)]);
  assert.ok(got.includes(100), "the doubling shows");
  assert.ok(got.includes(50), "and so does the halving");
});

test("a month label is a calendar reference, not a market figure", async () => {
  const { extractNumbers } = await import("../src/verify.mjs");
  const got = extractNumbers("From 2021-10 to 2022-11 it fell 74.8%.").map((n) => n.value);
  assert.deepEqual(got, [74.8], "the months contribute nothing, the drawdown does");
  // The full-date form must keep working.
  assert.deepEqual(extractNumbers("On 2026-08-03 turnover was 0.62x.").map((n) => n.value), [0.62]);
});

test("an index name is a proper noun, not a market figure", async () => {
  const { extractNumbers } = await import("../src/verify.mjs");
  const got = extractNumbers("The S&P 500 rose 21.24% while Nasdaq 100 lagged.").map((n) => n.value);
  assert.deepEqual(got, [21.24], "the index names contribute nothing, the return does");
  // A bare number next to an index name must still be checked.
  assert.ok(extractNumbers("S&P 500 closed at 7,674.").some((n) => n.value === 7674));
});

test("the bias vocabulary is shared, so the gate and the scoreboard cannot drift", async () => {
  const { BIAS_PATTERNS } = await import("../src/verify.mjs");
  const { extractClaim, BIAS } = await import("../src/scoreboard.mjs");
  const brief = { levels: [], spot: [] };
  // Every wording the gate admits must also be readable by the scoreboard,
  // or a post clears publication and drops silently out of the track record.
  const cases = [
    ["Bias: WAIT.", BIAS.WAIT],
    ["bias: wait for a close above.", BIAS.WAIT],
    ["Quan điểm: CHỜ.", BIAS.WAIT],
    ["Quan điểm: đứng ngoài.", BIAS.WAIT],
    ["Bias: Selective Long.", BIAS.LONG],
    ["Quan điểm: Long chọn lọc.", BIAS.LONG],
    ["Quan điểm: mua chọn lọc.", BIAS.LONG],
    ["Bias: Selective Short.", BIAS.SHORT],
    ["Quan điểm: Short chọn lọc.", BIAS.SHORT],
    ["Quan điểm: bán chọn lọc.", BIAS.SHORT],
  ];
  for (const [text, expected] of cases) {
    assert.ok(
      Object.values(BIAS_PATTERNS).some((re) => re.test(`$BTC ${text}`)),
      `gate should admit: ${text}`,
    );
    assert.equal(extractClaim(`$BTC ${text}`, brief).bias, expected, `scoreboard should read: ${text}`);
  }
});

test("a bias word inside a longer word is not a bias", async () => {
  // "waiting" is prose, not a call. The old \b-based pattern was also wrong in
  // the other direction on Vietnamese, where \b is defined on ASCII only.
  const brief = { levels: [], spot: [] };
  assert.equal((await import("../src/scoreboard.mjs")).extractClaim(`$BTC I am waiting for a retest.`, brief).bias, null);
  assert.equal((await import("../src/scoreboard.mjs")).extractClaim(`$BTC Chờ đợi là một chiến lược.`, brief).bias, null);
});

test("the disclaimer is accepted in either language", () => {
  const base = "$BTC ".repeat(12) + "Bias: WAIT. What do you think? #tag ";
  assert.ok(verifyStructure(`${base} Not financial advice.`).problems.every((p) => p !== "no disclaimer"));
  assert.ok(
    verifyStructure(`${base} Nghiên cứu giáo dục, không phải lời khuyên đầu tư.`)
      .problems.every((p) => p !== "no disclaimer"),
  );
  assert.ok(verifyStructure(`${base} No warning here.`).problems.includes("no disclaimer"));
});

test("magnitude words are read in either language", () => {
  const v = (s) => extractNumbers(s).map((x) => x.value);
  assert.deepEqual(v("$2.2M"), v("$2.2 triệu"));
  assert.deepEqual(v("111K"), v("111 nghìn"));
  assert.deepEqual(v("111K"), v("111 ngàn"));
  assert.deepEqual(v("1.5B"), v("1.5 tỷ"));
  assert.deepEqual(v("1.5B"), v("1.5 tỉ"));
});

test("a magnitude word does not swallow an ordinary noun", () => {
  // "12 tiếng" is twelve hours, not twelve of anything scaled.
  assert.deepEqual(extractNumbers("12 tiếng").map((x) => x.value), [12]);
  assert.deepEqual(extractNumbers("30 phút").map((x) => x.value), [30]);
});

test("a post tagged only with creator-programme surfaces is rejected", () => {
  // Fifty-one posts went out carrying exactly these two and nothing else, so
  // every one landed on the platform's most crowded pages and on no topic page.
  const base = "word ".repeat(60) + "Bias: WAIT. Does it hold? Not financial advice. $BTC ";
  const metaOnly = verifyStructure(`${base} #WriteToEarn #BinanceSquare`);
  assert.ok(metaOnly.problems.some((p) => p.includes("every hashtag is a meta tag")));

  // One tag naming the subject is enough; the programme tag may ride along.
  const withTopic = verifyStructure(`${base} #FundingRate #WriteToEarn`);
  assert.ok(withTopic.problems.every((p) => !p.includes("meta tag")));
});

test("having no hashtags at all is still its own failure", () => {
  const none = verifyStructure("word ".repeat(60) + "Bias: WAIT. Does it? Not financial advice. $BTC");
  assert.ok(none.problems.includes("no hashtags"));
  assert.ok(none.problems.every((p) => !p.includes("meta tag")));
});
