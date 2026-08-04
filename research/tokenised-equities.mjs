/**
 * Do tokenised equities actually outperform crypto on this venue?
 *
 * A full-system sweep on 2026-08-04 turned up the same names in three
 * independent scanners, and a snapshot showed a median 24-hour move of +5.29%
 * for tokenised equities against -0.02% for crypto. That is the shape of a
 * finding, and this exists to check whether it is one.
 *
 * The first thing the check found is the reason it might not be. Every one of
 * these pairs is new — the oldest has 55 days of history and several have
 * fewer than fifteen. Binance is still adding them, and a category that is
 * being expanded because it is popular will show fresh listings pumping
 * regardless of whether the category itself outperforms. Any comparison that
 * ignores that measures the listing schedule, not the assets.
 *
 * So the study does three things rather than one:
 *
 *   1. compares the two groups day by day, paired, so market-wide days cancel
 *   2. reports how thin the sample is instead of burying it
 *   3. splits by how long each pair has been listed, because if the edge lives
 *      entirely in the first days of trading it is a listing effect wearing a
 *      category's clothes
 *
 * Reproducible:
 *   node research/tokenised-equities.mjs > research/tokenised-equities.json
 */

import { fetchAllTickers } from "../src/pulse.mjs";
import { fetchKlines } from "../src/analysis.mjs";

const MIN_TURNOVER = 3e5;
const MIN_GROUP = 5;          // a median of fewer than five pairs is one pair's opinion
const YOUNG_DAYS = 10;        // "recently listed" for the age split

const retry = async (fn, n = 5) => {
  let last;
  for (let i = 0; i < n; i++) {
    try { return await fn(); } catch (e) { last = e; await new Promise((r) => setTimeout(r, 900 * (i + 1))); }
  }
  throw last;
};

const EXCLUDED = /(UP|DOWN|BULL|BEAR)USDT$|^(USDC|FDUSD|TUSD|BUSD|DAI|EUR|AEUR|USDP|XUSD)USDT$/;

/**
 * Binance's tokenised equities and metals.
 *
 * Named explicitly rather than pattern-matched on the B suffix, because BANK,
 * BICO and a dozen ordinary tokens end in B-adjacent strings and a regex that
 * swept them in would put crypto in the equity bucket and quietly destroy the
 * comparison.
 */
const TOKENISED = new Set([
  "SPYBUSDT", "QQQBUSDT", "TSLABUSDT", "PLTRBUSDT", "SNDKBUSDT", "MUBUSDT",
  "SKHYBUSDT", "SOXSBUSDT", "SOXLBUSDT", "MUUBUSDT", "SNXXBUSDT", "CRCLBUSDT",
  "KORUBUSDT", "GOOGLBUSDT", "AXTIBUSDT", "SPCXBUSDT", "NVDABUSDT", "AAPLBUSDT",
  "METABUSDT", "MSFTBUSDT", "MSTRBUSDT", "HOODBUSDT", "CRWVBUSDT", "ORCLBUSDT",
  "XAUUSDT", "XAGUSDT",
]);

const tickers = await retry(() => fetchAllTickers());
const liquid = tickers
  .filter((t) => t.symbol.endsWith("USDT") && !EXCLUDED.test(t.symbol))
  .filter((t) => t.quoteVolume24h >= MIN_TURNOVER);

const tokenSymbols = liquid.filter((t) => TOKENISED.has(t.symbol)).map((t) => t.symbol);
const cryptoSymbols = liquid
  .filter((t) => !TOKENISED.has(t.symbol))
  .sort((a, b) => b.quoteVolume24h - a.quoteVolume24h)
  .slice(0, 120)
  .map((t) => t.symbol);

/** Daily close-to-close returns keyed by date, plus how long the pair has traded. */
async function loadReturns(symbols) {
  const out = new Map();
  for (let i = 0; i < symbols.length; i += 4) {
    const sets = await Promise.all(
      symbols.slice(i, i + 4).map(async (s) => [s, await retry(() => fetchKlines(s, { interval: "1d", limit: 120 })).catch(() => null)]),
    );
    for (const [symbol, candles] of sets) {
      if (!candles || candles.length < 3) continue;
      const done = candles.slice(0, -1);
      const rows = [];
      for (let d = 1; d < done.length; d++) {
        if (!done[d - 1].close) continue;
        rows.push({
          date: new Date(done[d].openTime).toISOString().slice(0, 10),
          returnPct: (done[d].close / done[d - 1].close - 1) * 100,
          ageDays: d,
        });
      }
      out.set(symbol, { listedDays: done.length, rows });
    }
  }
  return out;
}

const tokenData = await loadReturns(tokenSymbols);
const cryptoData = await loadReturns(cryptoSymbols);

const median = (xs) => {
  const s = [...xs].sort((a, b) => a - b);
  if (!s.length) return NaN;
  const m = s.length >> 1;
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};

/** Every date either group traded, so the pairing is explicit. */
const byDate = (data) => {
  const m = new Map();
  for (const [symbol, { rows }] of data) {
    for (const r of rows) {
      if (!m.has(r.date)) m.set(r.date, []);
      m.get(r.date).push({ symbol, ...r });
    }
  }
  return m;
};

const tokenByDate = byDate(tokenData);
const cryptoByDate = byDate(cryptoData);

const paired = [];
for (const [date, tokenRows] of [...tokenByDate].sort((a, b) => a[0].localeCompare(b[0]))) {
  const cryptoRows = cryptoByDate.get(date);
  if (!cryptoRows || tokenRows.length < MIN_GROUP) continue;
  paired.push({
    date,
    tokenCount: tokenRows.length,
    cryptoCount: cryptoRows.length,
    tokenMedianPct: median(tokenRows.map((r) => r.returnPct)),
    cryptoMedianPct: median(cryptoRows.map((r) => r.returnPct)),
    // Split the tokenised side by how long each pair has been listed, so a
    // listing effect cannot masquerade as a category effect.
    youngMedianPct: median(tokenRows.filter((r) => r.ageDays <= YOUNG_DAYS).map((r) => r.returnPct)),
    matureMedianPct: median(tokenRows.filter((r) => r.ageDays > YOUNG_DAYS).map((r) => r.returnPct)),
  });
}

const diffs = paired.map((p) => p.tokenMedianPct - p.cryptoMedianPct);
const mean = (xs) => xs.reduce((s, x) => s + x, 0) / xs.length;
const stdev = (xs) => {
  const m = mean(xs);
  return Math.sqrt(xs.reduce((s, x) => s + (x - m) ** 2, 0) / (xs.length - 1));
};

const meanDiff = diffs.length ? mean(diffs) : NaN;
const sd = diffs.length > 1 ? stdev(diffs) : NaN;
/** Paired daily differences are non-overlapping, so no de-overlapping correction is needed. */
const tStat = diffs.length > 1 ? meanDiff / (sd / Math.sqrt(diffs.length)) : NaN;

const matureDiffs = paired
  .filter((p) => Number.isFinite(p.matureMedianPct))
  .map((p) => p.matureMedianPct - p.cryptoMedianPct);

console.log(JSON.stringify({
  measuredAt: new Date().toISOString(),
  method: {
    minTurnoverUsd: MIN_TURNOVER,
    minGroupSize: MIN_GROUP,
    youngThresholdDays: YOUNG_DAYS,
    pairing: "median daily return of each group, paired by date",
    caveat: "Every tokenised pair on this venue is new. The oldest has under two months of history and Binance is still adding them, so a category being expanded because it is popular will show fresh listings rising whatever the category does.",
  },
  universe: {
    tokenised: tokenSymbols.length,
    crypto: cryptoSymbols.length,
    oldestTokenisedDays: Math.max(...[...tokenData.values()].map((d) => d.listedDays)),
    medianTokenisedDays: median([...tokenData.values()].map((d) => d.listedDays)),
  },
  pairedDays: paired.length,
  result: {
    meanDailyDifferencePp: meanDiff,
    standardDeviationPp: sd,
    tStatistic: tStat,
    daysTokenisedWon: diffs.filter((d) => d > 0).length,
    winSharePct: diffs.length ? (diffs.filter((d) => d > 0).length / diffs.length) * 100 : NaN,
  },
  excludingNewListings: {
    days: matureDiffs.length,
    meanDailyDifferencePp: matureDiffs.length ? mean(matureDiffs) : NaN,
    tStatistic: matureDiffs.length > 1
      ? mean(matureDiffs) / (stdev(matureDiffs) / Math.sqrt(matureDiffs.length)) : NaN,
  },
  daily: paired,
}, null, 2));
