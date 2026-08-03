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

test("the band below the liquidity floor is scanned, not discarded", async () => {
  const { rankTickers } = await import("../src/pulse.mjs");
  const t = (symbol, quoteVolume24h, change24hPct) => ({
    symbol, quoteVolume24h, change24hPct, high24h: 11, low24h: 10,
  });
  const rows = rankTickers([t("BIGUSDT", 9e6, 5), t("THINUSDT", 3.3e6, 36.9), t("DUSTUSDT", 5e4, 80)]);

  assert.deepEqual(rows.map((r) => r.symbol), ["BIGUSDT", "THINUSDT"]);
  assert.equal(rows[0].tier, "main");
  assert.equal(rows[1].tier, "early", "a pair under the floor is ranked, and marked");
  assert.ok(!rows.some((r) => r.symbol === "DUSTUSDT"), "genuinely dead pairs stay out");
});

test("a thin pair must show far more unusual turnover to count as an event", async () => {
  const { isEvent } = await import("../src/pulse.mjs");
  const row = { volumeZScore: 2.5, sigmaMove: 6, rangeSigma: 1 };

  assert.ok(isEvent({ ...row, tier: "main" }), "above the floor, 2.5 sigma of volume is enough");
  assert.ok(!isEvent({ ...row, tier: "early" }), "below it, the same reading is not");
  assert.ok(isEvent({ ...row, tier: "early", volumeZScore: 6.2 }), "a real awakening still counts");
});

test("a dead pair's large move is rejected by the volume test, not by the floor", async () => {
  const { isEvent } = await import("../src/pulse.mjs");
  // The shape actually observed on the venue: -69% on negative volume z.
  const fill = { tier: "early", volumeZScore: -0.9, sigmaMove: -3.58, rangeSigma: 4 };
  assert.ok(!isEvent(fill), "a huge move with no turnover anomaly is a fill, not an event");
});
