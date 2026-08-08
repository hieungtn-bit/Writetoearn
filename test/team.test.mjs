import test from "node:test";
import assert from "node:assert/strict";
import { runTeam } from "../src/team.mjs";

const brief = {
  generatedAt: "2026-07-31T16:00:00.000Z",
  spot: [{ symbol: "BTCUSDT", price: 62700, change24hPct: -3.1, high24h: 65409, low24h: 62466, quoteVolume24h: 1.2e9, venue: "Binance spot", asOf: "2026-07-31T16:00:00.000Z" }],
  levels: [{ symbol: "BTCUSDT", spot: 62700, support: 62538, resistance: 64693, periodHigh: 66956, periodLow: 59588, windowDays: 30 }],
  funding: [{ instId: "BTC-USDT-SWAP", fundingRatePct: 0.0085, venue: "OKX perpetual swaps" }],
  trending: [], news: [],
  analysis: { assets: [{ symbol: "BTCUSDT", price: 62700, change7dPct: -2.2, change30dPct: 4.3, rsi14: 43, atr14: 1700, atrPct: 2.8, realizedVol30d: 31.1, realizedVol7d: 30, rangePosition30d: 41, high30d: 66956, low30d: 59588, sma20: 64000, sma50: 63000, volumeZScore: 0.1, rangeCompressionPct: 60, todayChangePct: -3.1, dailySigmaPct: 1.63, sigmaMove: -1.9 }], relativeStrength: [], correlations: [] },
  unavailable: [{ field: "openInterest", reason: "geo-blocked" }],
  notes: [],
};

const GOOD = `🔍 $BTC 62,700, down 3.1% today.

That is a 1.9 sigma day against a daily standard deviation of 1.63%. Volume z-score is +0.1, meaning turnover is average.

• Support sits at 62,538, resistance at 64,693
• Funding on OKX perps is +0.0085%, still positive
• RSI 43, at 41% of the 30-day range

Bias: WAIT. Average volume and positive funding suggest the move is not finished.

Where do you see it settling? 👇

Not financial advice. DYOR.

$BTC $ETH $SOL #Volatility #WriteToEarn`;

const BAD_NUMBER = GOOD.replace("62,700, down 3.1%", "88,000, down 3.1%");

/**
 * Stub whose replies the test dictates, in call order.
 * Structured calls (analyst, critic) are detected by the schema parameter.
 */
function stubClient(script) {
  const calls = [];
  const queue = [...script];
  return {
    calls,
    beta: {
      messages: {
        create: async (params) => {
          const structured = Boolean(params.output_config?.format);
          calls.push({ structured, system: params.system, user: params.messages[0].content });
          const next = queue.shift();
          if (next === undefined) throw new Error("unexpected extra model call");
          if (next?.refusal) return { stop_reason: "refusal", stop_details: { category: "cyber" }, content: [] };
          const text = typeof next === "string" ? next : JSON.stringify(next);
          return { stop_reason: "end_turn", content: [{ type: "text", text }] };
        },
      },
    },
  };
}

const angle = (over = {}) => ({
  subject: "BTCUSDT", supporting: ["ETHUSDT", "SOLUSDT"],
  thesis: "Ordinary volume on a 1.9 sigma drop", evidence: ["volZ 0.1", "sigma -1.9"],
  freshness: "no recent overlap", skip: false, skipReason: "", ...over,
});
const verdict = (over = {}) => ({ publish: true, problems: [], repetitive: false, ...over });

test("a clean run is analyst, writer, critic — three calls", async () => {
  const client = stubClient([angle(), GOOD, verdict()]);
  const result = await runTeam({ brief, client, format: "positioning" });

  assert.equal(result.skipped, false);
  assert.equal(result.rounds, 1);
  assert.equal(client.calls.length, 3);
  assert.equal(client.calls[0].structured, true, "analyst returns structured output");
  assert.equal(client.calls[1].structured, false, "writer returns prose");
  assert.equal(client.calls[2].structured, true, "critic returns structured output");
});

test("the analyst can decline to post, and nothing else runs", async () => {
  const client = stubClient([angle({ skip: true, skipReason: "nothing moved today" })]);
  const result = await runTeam({ brief, client });

  assert.equal(result.skipped, true);
  assert.match(result.reason, /nothing moved/);
  assert.equal(client.calls.length, 1, "no writer or critic call after a skip");
});

test("a fabricated figure is caught by the checker before the critic sees it", async () => {
  const client = stubClient([angle(), BAD_NUMBER, GOOD, verdict()]);
  const result = await runTeam({ brief, client });

  assert.equal(result.rounds, 2);
  // analyst, writer(bad), writer(good), critic — the critic is never asked
  // to review the rejected draft.
  assert.equal(client.calls.length, 4);
  assert.equal(client.calls[2].structured, false, "third call is the rewrite, not a critique");
  assert.match(client.calls[2].user, /REVISION REQUIRED/);
  assert.match(client.calls[2].user, /88,000/, "the offending figure is named in the revision");
});

test("the critic can reject a mechanically valid draft", async () => {
  const client = stubClient([
    angle(),
    GOOD,
    verdict({ publish: false, problems: ["thesis is a truism"], repetitive: false }),
    GOOD,
    verdict(),
  ]);
  const result = await runTeam({ brief, client });

  assert.equal(result.rounds, 2);
  assert.match(client.calls[3].user, /truism/, "the critique is passed back to the writer");
});

test("a draft that never passes fails the run rather than publishing", async () => {
  const client = stubClient([angle(), BAD_NUMBER, BAD_NUMBER, BAD_NUMBER]);
  await assert.rejects(
    () => runTeam({ brief, client, maxRounds: 3 }),
    /No draft survived 3 rounds/,
  );
});

test("recent posts reach both the analyst and the writer", async () => {
  const recentPosts = [
    { publishedAt: "2026-07-30T13:00:00Z", format: "positioning", asset: "BNBUSDT", bias: "WAIT", angle: "BNB leads the majors", hook: "BNB at range high" },
  ];
  const client = stubClient([angle(), GOOD, verdict()]);
  await runTeam({ brief, client, recentPosts });

  assert.match(client.calls[0].user, /BNB leads the majors/, "analyst sees recent output");
  assert.match(client.calls[1].user, /BNB leads the majors/, "writer sees it too");
  assert.match(client.calls[0].system, /Do not repeat/i);
});

test("the critic is told not to duplicate the deterministic checks", async () => {
  const client = stubClient([angle(), GOOD, verdict()]);
  await runTeam({ brief, client });
  assert.match(client.calls[2].system, /Do NOT check arithmetic/);
});

test("a refusal aborts the run without publishing", async () => {
  const client = stubClient([{ refusal: true }]);
  await assert.rejects(() => runTeam({ brief, client }), /Model declined \(cyber\)/);
});

test("an empty brief is refused before any model call", async () => {
  const client = stubClient([angle()]);
  await assert.rejects(() => runTeam({ brief: { spot: [] }, client }), /no spot prices/);
  assert.equal(client.calls.length, 0);
});

test("every model call opts into refusal fallbacks and sends no sampling params", async () => {
  const seen = [];
  const client = {
    beta: { messages: { create: async (p) => {
      seen.push(p);
      const structured = Boolean(p.output_config?.format);
      const body = seen.length === 1 ? angle() : seen.length === 3 ? verdict() : null;
      return { stop_reason: "end_turn", content: [{ type: "text", text: structured ? JSON.stringify(body) : GOOD }] };
    } } },
  };
  await runTeam({ brief, client });

  for (const p of seen) {
    assert.equal(p.model, "claude-opus-5");
    assert.equal(p.fallbacks, "default");
    assert.equal(p.temperature, undefined);
    assert.equal(p.top_p, undefined);
  }
});
