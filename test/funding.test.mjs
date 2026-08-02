import { strict as assert } from "node:assert";
import { test } from "node:test";

import { FUNDING_PERIODS_PER_DAY, fetchFundingHistory } from "../src/market.mjs";

/** OKX returns newest-first; the fixture is deliberately shuffled to prove sorting. */
function stubOkx(rates) {
  const day = 8 * 3_600_000;
  const data = rates.map((rate, i) => ({
    fundingTime: String(1_700_000_000_000 + i * day),
    realizedRate: String(rate),
  }));
  return async () => ({ ok: true, json: async () => ({ data: [...data].reverse() }) });
}

test("a flat positive strip annualises to rate x periods x 365", async () => {
  // 0.01% per period, three periods a day => 10.95% a year.
  const fetchImpl = stubOkx(Array(63).fill(0.0001));
  const h = await fetchFundingHistory("ENA-USDT-SWAP", { fetchImpl });

  assert.equal(FUNDING_PERIODS_PER_DAY, 3);
  assert.ok(Math.abs(h.annualisedPct - 10.95) < 0.01, `got ${h.annualisedPct}`);
  assert.equal(h.negativePeriods, 0);
  assert.equal(h.negativeSharePct, 0);
  assert.equal(h.windowDays, 21);
});

test("the latest period is the newest one, whatever order the API sent", async () => {
  const rates = Array(63).fill(0.0001);
  rates[62] = 0.005; // newest by timestamp
  const h = await fetchFundingHistory("ENA-USDT-SWAP", { fetchImpl: stubOkx(rates) });
  assert.ok(Math.abs(h.latestPct - 0.5) < 1e-9, `got ${h.latestPct}`);
});

test("recent and prior windows are measured separately", async () => {
  // Newest 21 periods (7 days) negative, the 42 before them positive.
  const rates = Array(63).fill(0.0002);
  for (let i = 42; i < 63; i++) rates[i] = -0.0002;
  const h = await fetchFundingHistory("ENA-USDT-SWAP", { fetchImpl: stubOkx(rates) });

  assert.ok(h.annualised7dPct < 0, "the recent week turned negative");
  assert.ok(h.annualisedPrior14dPct > 0, "the prior fortnight was positive");
  assert.equal(h.negativePeriods, 21);
});

test("a strip that averages positive can still be negative a third of the time", async () => {
  const rates = Array.from({ length: 63 }, (_, i) => (i % 3 === 0 ? -0.0002 : 0.0004));
  const h = await fetchFundingHistory("ENA-USDT-SWAP", { fetchImpl: stubOkx(rates) });
  assert.ok(h.annualisedPct > 0);
  assert.ok(Math.abs(h.negativeSharePct - 33.33) < 0.1, `got ${h.negativeSharePct}`);
});

test("an empty history is an error, not a zero", async () => {
  const fetchImpl = async () => ({ ok: true, json: async () => ({ data: [] }) });
  await assert.rejects(() => fetchFundingHistory("NOPE-USDT-SWAP", { fetchImpl }), /no funding history/);
});
