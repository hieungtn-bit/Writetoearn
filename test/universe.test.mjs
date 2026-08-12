import test from "node:test";
import assert from "node:assert/strict";
import { ALWAYS, liveUniverse } from "../src/universe.mjs";

/** A stand-in exchange, so the test measures the selection rule not the market. */
function fakeExchange({ pairs }) {
  return async (url) => ({
    json: async () => (url.includes("exchangeInfo")
      ? { symbols: pairs.map((p) => ({ symbol: p.symbol, baseAsset: p.symbol.replace(/USDT$/, ""), quoteAsset: "USDT", status: p.status ?? "TRADING" })) }
      : pairs.map((p) => ({ symbol: p.symbol, quoteVolume: String(p.turnover) }))),
  });
}

const pair = (symbol, turnover, status) => ({ symbol, turnover, status });

test("the busiest pairs are chosen, in order", async () => {
  const fetchImpl = fakeExchange({
    pairs: [pair("AAAUSDT", 5e6), pair("BBBUSDT", 90e6), pair("CCCUSDT", 20e6)],
  });
  const { symbols } = await liveUniverse({ fetchImpl, limit: 10 });
  assert.deepEqual(symbols, ["BBBUSDT", "CCCUSDT", "AAAUSDT"]);
});

test("the majors are always included even when quiet", async () => {
  const fetchImpl = fakeExchange({
    pairs: [pair("BTCUSDT", 1), pair("ETHUSDT", 1), pair("SOLUSDT", 1), pair("BNBUSDT", 1), pair("ZZZUSDT", 999e6)],
  });
  const { symbols } = await liveUniverse({ fetchImpl, limit: 10, minTurnoverUsd: 1e6 });
  for (const m of ALWAYS) assert.ok(symbols.includes(m), `${m} must be covered whatever its turnover`);
});

test("illiquid pairs are dropped, because a fill would move them", async () => {
  const fetchImpl = fakeExchange({ pairs: [pair("BIGUSDT", 50e6), pair("TINYUSDT", 1000)] });
  const { symbols, rejected } = await liveUniverse({ fetchImpl, limit: 10, minTurnoverUsd: 2e6 });
  assert.ok(!symbols.includes("TINYUSDT"));
  assert.equal(rejected.belowTurnoverFloor, 1);
});

test("stablecoin pairs are excluded — a direction call there is a peg call", async () => {
  const fetchImpl = fakeExchange({
    pairs: [pair("FDUSDUSDT", 900e6), pair("USDCUSDT", 800e6), pair("REALUSDT", 10e6)],
  });
  const { symbols } = await liveUniverse({ fetchImpl, limit: 10 });
  assert.deepEqual(symbols, ["REALUSDT"]);
});

test("pairs that are not trading never reach the list", async () => {
  const fetchImpl = fakeExchange({
    pairs: [pair("HALTUSDT", 500e6, "BREAK"), pair("LIVEUSDT", 9e6)],
  });
  const { symbols } = await liveUniverse({ fetchImpl, limit: 10 });
  assert.deepEqual(symbols, ["LIVEUSDT"]);
});

test("the limit is honoured and counts the majors", async () => {
  const pairs = [...ALWAYS.map((s) => pair(s, 100e6))];
  for (let i = 0; i < 50; i++) pairs.push(pair(`A${i}USDT`, 50e6 - i));
  const fetchImpl = fakeExchange({ pairs });
  const { symbols } = await liveUniverse({ fetchImpl, limit: 12 });
  assert.equal(symbols.length, 12);
  for (const m of ALWAYS) assert.ok(symbols.includes(m));
});

test("a market with nothing liquid returns only the majors, not an error", async () => {
  const fetchImpl = fakeExchange({ pairs: ALWAYS.map((s) => pair(s, 5)) });
  const { symbols } = await liveUniverse({ fetchImpl, limit: 10, minTurnoverUsd: 2e6 });
  assert.deepEqual(symbols, ALWAYS);
});
