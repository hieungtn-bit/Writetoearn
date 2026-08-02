import { strict as assert } from "node:assert";
import { test } from "node:test";

import { fetchAllTickers, isEvent, rankTickers } from "../src/pulse.mjs";

const t = (symbol, change24hPct, quoteVolume24h, extra = {}) => ({
  symbol, change24hPct, quoteVolume24h, high24h: 110, low24h: 100, price: 105, trades24h: 1000, ...extra,
});

test("illiquid pairs are excluded however violently they moved", () => {
  const rows = rankTickers([t("REALUSDT", 5, 50e6), t("DEADUSDT", 90, 12_000)]);
  assert.deepEqual(rows.map((r) => r.symbol), ["REALUSDT"]);
});

test("leveraged tokens and stables cannot win the ranking", () => {
  const rows = rankTickers([
    t("BTCUPUSDT", 60, 50e6),
    t("ETHDOWNUSDT", 55, 50e6),
    t("USDCUSDT", 0.1, 900e6),
    t("BANKUSDT", 40, 50e6),
  ]);
  assert.deepEqual(rows.map((r) => r.symbol), ["BANKUSDT"]);
});

test("ranking is by size of move regardless of direction", () => {
  const rows = rankTickers([t("AUSDT", 5, 50e6), t("BUSDT", -30, 50e6), t("CUSDT", 12, 50e6)]);
  assert.deepEqual(rows.map((r) => r.symbol), ["BUSDT", "CUSDT", "AUSDT"]);
});

test("only USDT spot pairs are considered", () => {
  const rows = rankTickers([t("BTCBUSD", 40, 90e6), t("ETHBTC", 40, 90e6), t("SOLUSDT", 3, 90e6)]);
  assert.deepEqual(rows.map((r) => r.symbol), ["SOLUSDT"]);
});

test("an event needs both an outsized move and unusual turnover", () => {
  assert.equal(isEvent({ sigmaMove: 4, volumeZScore: 3 }), true);
  assert.equal(isEvent({ sigmaMove: 4, volumeZScore: 0.5 }), false, "a big move on normal volume is not an event");
  assert.equal(isEvent({ sigmaMove: 1, volumeZScore: 5 }), false, "volume alone is not a story");
  assert.equal(isEvent({ sigmaMove: NaN, volumeZScore: 5 }), false);
});

test("a violent drop is an event just as much as a violent rally", () => {
  assert.equal(isEvent({ sigmaMove: -5, volumeZScore: 4 }), true);
});

test("the range column is computed from the session's own extremes", () => {
  const [row] = rankTickers([t("XUSDT", 10, 50e6, { high24h: 120, low24h: 100 })]);
  assert.equal(row.range24hPct, 20);
});

test("a failed ticker request is an error, not an empty scan", async () => {
  const fetchImpl = async () => ({ ok: false, status: 418 });
  await assert.rejects(() => fetchAllTickers(fetchImpl), /HTTP 418/);
});

test("a pair that spiked and round-tripped is still an event", () => {
  // UTK: +16% on the close, but a 260% intraday range on 19-sigma volume. The
  // close-to-close test alone discarded exactly the shape worth writing about.
  const utk = { sigmaMove: 2.41, rangeSigma: 38.7, volumeZScore: 19.1 };
  assert.equal(isEvent(utk), true);
});

test("turnover is still required — a wild range on normal volume is noise", () => {
  assert.equal(isEvent({ sigmaMove: 3, rangeSigma: 40, volumeZScore: 0.4 }), false);
});

test("an ordinary session on heavy volume is not an event either", () => {
  assert.equal(isEvent({ sigmaMove: 0.5, rangeSigma: 1.2, volumeZScore: 6 }), false);
});
