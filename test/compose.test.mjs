import test from "node:test";
import assert from "node:assert/strict";
import { composePost } from "../src/compose.mjs";

const brief = {
  generatedAt: "2026-07-31T14:00:00.000Z",
  spot: [
    {
      symbol: "BTCUSDT",
      price: 63250,
      change24hPct: -2.75,
      high24h: 65409,
      low24h: 63250,
      quoteVolume24h: 1_079_000_000,
      venue: "Binance spot",
      asOf: "2026-07-31T14:00:00.000Z",
    },
  ],
  levels: [
    {
      symbol: "BTCUSDT",
      spot: 63250,
      support: 63100,
      resistance: 64693,
      periodHigh: 66956,
      periodLow: 59588,
      windowDays: 30,
    },
  ],
  funding: [{ instId: "BTC-USDT-SWAP", fundingRatePct: 0.0064, venue: "OKX perpetual swaps" }],
  trending: [],
  news: [],
  unavailable: [{ field: "openInterest", reason: "geo-blocked" }],
  notes: [],
};

const GOOD_POST = `🚨 BTC is printing its 24h low — 63,250.

$BTC $63,250 (-2.75% 24h)

• Support sits at 63,100, the last swing pivot before the 30d floor at 59,588
• Funding on OKX perps is still positive (+0.0064%), so longs are paying to stay long
• Resistance overhead at 64,693

Bias: WAIT — grinding into support with funding positive usually means there is long liquidity left to flush.

Does 63.1K hold? Drop your level 👇

Not financial advice. DYOR.

$BTC #Volatility #WriteToEarn`;

const BAD_POST = GOOD_POST.replace("63,250.", "88,000.");

/** Stub whose successive replies the test dictates. */
function stubClient(replies) {
  const calls = [];
  const queue = [...replies];
  return {
    calls,
    beta: {
      messages: {
        create: async (params) => {
          calls.push(params);
          const next = queue.shift();
          if (!next) throw new Error("unexpected extra API call");
          if (next.refusal) {
            return { stop_reason: "refusal", stop_details: { category: "cyber" }, content: [] };
          }
          return { stop_reason: "end_turn", content: [{ type: "text", text: next }] };
        },
      },
    },
  };
}

test("a passing draft is returned on the first attempt", async () => {
  const client = stubClient([GOOD_POST]);
  const { text, attempts, verification } = await composePost(brief, { client });

  assert.equal(attempts, 1);
  assert.equal(verification.ok, true);
  assert.match(text, /63,250/);
});

test("the request targets Opus 5 and sends no sampling parameters", async () => {
  const client = stubClient([GOOD_POST]);
  await composePost(brief, { client });

  const [params] = client.calls;
  assert.equal(params.model, "claude-opus-5");
  assert.equal(params.output_config.effort, "high");
  assert.equal(params.temperature, undefined, "temperature is rejected on Opus 5");
  assert.equal(params.top_p, undefined, "top_p is rejected on Opus 5");
  assert.equal(params.top_k, undefined, "top_k is rejected on Opus 5");
  assert.equal(params.fallbacks, "default", "refusal fallbacks should be opted into");
});

test("the brief is handed to the model verbatim, gaps included", async () => {
  const client = stubClient([GOOD_POST]);
  await composePost(brief, { client });

  const prompt = client.calls[0].messages[0].content;
  assert.match(prompt, /63250|63,250/);
  assert.match(prompt, /openInterest/, "the model must see what is unavailable");
  assert.match(client.calls[0].system, /every number you write must appear/i);
});

test("a draft with an invented figure is sent back for revision, not published", async () => {
  const client = stubClient([BAD_POST, GOOD_POST]);
  const { text, attempts } = await composePost(brief, { client });

  assert.equal(attempts, 2);
  assert.match(text, /63,250/);
  assert.ok(!text.includes("88,000"));

  const revision = client.calls[1].messages.at(-1).content;
  assert.match(revision, /88,000/, "the revision request must name the offending figure");
});

test("a model that keeps inventing figures fails the run instead of publishing", async () => {
  const client = stubClient([BAD_POST, BAD_POST, BAD_POST]);

  await assert.rejects(
    () => composePost(brief, { client, maxRevisions: 2 }),
    (err) => {
      assert.match(err.message, /still failing after 3 attempts/);
      assert.ok(err.verification.problems.some((p) => p.includes("88,000")));
      return true;
    },
  );
});

test("a refusal stops the run and is not retried", async () => {
  const client = stubClient([{ refusal: true }]);
  await assert.rejects(() => composePost(brief, { client }), /declined to write this post \(cyber\)/);
  assert.equal(client.calls.length, 1);
});

test("an empty brief is refused before any API call is made", async () => {
  const client = stubClient([GOOD_POST]);
  await assert.rejects(
    () => composePost({ spot: [] }, { client }),
    /Refusing to compose: the brief has no spot prices/,
  );
  assert.equal(client.calls.length, 0);
});
