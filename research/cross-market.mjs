/**
 * Bitcoin against the market it is supposed to have decoupled from.
 *
 * The crypto side of this repo cannot answer its own most obvious question:
 * whether a 50% drawdown is a crypto story or a risk-asset story. It looks like
 * neither on inspection — US equities are at the top of their year while
 * Bitcoin sits halfway down from its own peak — and the number that decides
 * which of those two facts matters is the correlation between them.
 *
 * Both readings are recorded because they say opposite-sounding things and are
 * both true: daily returns move together, and the year's outcomes did not.
 * A correlation is a statement about co-movement, never about levels, and
 * conflating the two is how "crypto is a Nasdaq proxy" and "crypto has
 * decoupled" both get argued from the same data.
 *
 * Reproducible:
 *   node research/cross-market.mjs > research/cross-market.json
 */

import { fetchKlines } from "../src/analysis.mjs";
import { correlationOnDates, fetchMacro } from "../src/equities.mjs";
import { fetchOnchain } from "../src/onchain.mjs";

const retry = async (fn, n = 5) => {
  let last;
  for (let i = 0; i < n; i++) {
    try { return await fn(); } catch (e) { last = e; await new Promise((r) => setTimeout(r, 900 * (i + 1))); }
  }
  throw last;
};

const macro = await retry(() => fetchMacro({ range: "1y" }));
if (!macro) throw new Error("macro series unavailable");

const daily = await retry(() => fetchKlines("BTCUSDT", { interval: "1d", limit: 400 }));
const btcRows = daily.map((c) => ({
  date: new Date(c.openTime).toISOString().slice(0, 10),
  close: c.close,
}));

const btcYearAgo = btcRows.at(-366) ?? btcRows[0];
const btcNow = btcRows.at(-1);

const series = {};
for (const [key, m] of Object.entries(macro)) {
  const { rows, ...rest } = m;
  series[key] = {
    ...rest,
    ...correlationOnDates(btcRows, rows),
    /**
     * The gap between what the index did over the year and what Bitcoin did.
     * This is the number the correlation cannot express: two series can move
     * together daily and still finish the year on opposite sides of flat.
     */
    btcGapPct: rest.change1yPct - ((btcNow.close / btcYearAgo.close - 1) * 100),
  };
}

// Valuation belongs in this snapshot rather than being fetched separately by a
// draft: the article's argument is "cheap on chain while the macro is fine",
// and both halves must come from the same committed measurement.
const onchain = await fetchOnchain();

// The premium over cost basis, computed here rather than in a draft. It is the
// single number that separates "cheap" from "as cheap as a bottom", and a
// figure that decisive must come from the committed measurement.
if (onchain?.realizedPrice) {
  onchain.premiumOverCostBasisPct = (btcNow.close / onchain.realizedPrice.value - 1) * 100;
}

console.log(JSON.stringify({
  measuredAt: new Date().toISOString(),
  method: {
    range: "1y",
    correlation: "log daily returns, joined on dates both markets traded",
    note: "Equities close at weekends and crypto does not. Joining by index position rather than date would pair Saturday with Friday and report a calendar artefact as a relationship.",
  },
  btc: {
    price: btcNow.close,
    asOf: btcNow.date,
    change1yPct: (btcNow.close / btcYearAgo.close - 1) * 100,
  },
  series,
  onchain,
}, null, 2));
