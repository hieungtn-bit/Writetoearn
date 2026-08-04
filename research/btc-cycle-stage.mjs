/**
 * Where Bitcoin sits in its own cycle, measured on monthly candles.
 *
 * Every other study here works on daily or hourly data because that is where
 * the sample sizes are. This one cannot: Bitcoin has had two completed bear
 * markets on Binance's record, so the honest output is a comparison with n=2,
 * clearly labelled, not a probability.
 *
 * It exists because "what stage are we in" is the question readers actually
 * ask, and answering it from a daily chart is answering a different question.
 * The figures a post would otherwise assert — drawdowns of prior cycles, how
 * long they took, whether volume at the low looked like capitulation — are all
 * spans between distant candles, which the verifier deliberately refuses. A
 * committed snapshot is the alternative to publishing them through no gate.
 *
 * Reproducible:
 *   node research/btc-cycle-stage.mjs > research/btc-cycle-stage.json
 */

import { fetchKlines } from "../src/analysis.mjs";

const FNG_URL = "https://api.alternative.me/fng/?limit=30";

const retry = async (fn, n = 5) => {
  let last;
  for (let i = 0; i < n; i++) {
    try { return await fn(); } catch (e) { last = e; await new Promise((r) => setTimeout(r, 900 * (i + 1))); }
  }
  throw last;
};

const monthly = await retry(() => fetchKlines("BTCUSDT", { interval: "1M", limit: 120 }));
const done = monthly.slice(0, -1);
const live = monthly.at(-1);
const price = live.close;
const month = (c) => new Date(c.openTime).toISOString().slice(0, 7);

/**
 * A cycle peak is a monthly close that was the highest ever at the time and
 * stayed unbeaten for a year. That last clause is what separates a top from a
 * pause: without it, every step up inside an advance reads as a peak.
 */
const closes = done.map((c) => c.close);
const peaks = [];
// Binance's record starts 2017-08, so the 2017-12 peak sits four months into
// the series. Requiring a full year of prior data would exclude it and leave
// n=1; requiring three months keeps it, with the thin history noted in the
// output rather than hidden by a threshold.
for (let i = 3; i < closes.length - 12; i++) {
  const highestSoFar = closes[i] >= Math.max(...closes.slice(0, i + 1));
  const unbeatenForAYear = closes.slice(i + 1, i + 13).every((c) => c < closes[i]);
  if (highestSoFar && unbeatenForAYear) peaks.push(i);
}

/** Only peaks whose decline has actually finished — price recovered past them. */
const completed = [];
for (const p of peaks) {
  const after = closes.slice(p + 1);
  const recoveredAt = after.findIndex((c) => c >= closes[p]);
  if (recoveredAt < 0) continue;

  // The trough is the lowest *low*, not the lowest close. In 2022 those fall in
  // different months -- price bottomed at 15,476 in November on 1.83x turnover,
  // while December closed lower on 1.02x. Capitulation is an event at the price
  // extreme, so reading the close picks the quiet month after it and reports
  // the opposite of what happened.
  const window = done.slice(p + 1, p + 1 + recoveredAt);
  const troughCandle = window.reduce((a, b) => (a.low < b.low ? a : b));
  const troughIdx = done.indexOf(troughCandle);
  const trough = troughCandle.low;
  completed.push({
    peakMonth: month(done[p]),
    peakClose: closes[p],
    troughMonth: month(done[troughIdx]),
    troughClose: troughCandle.close,
    drawdownPct: (trough / closes[p] - 1) * 100,
    troughLow: trough,
    monthsToTrough: troughIdx - p,
    monthsToRecover: recoveredAt + 1,
    /** Turnover in the trough month against the year before it. */
    troughVolumeRatio:
      done.slice(Math.max(0, troughIdx - 12), troughIdx).reduce((s, c) => s + c.quoteVolume, 0) > 0
        ? done[troughIdx].quoteVolume
          / (done.slice(Math.max(0, troughIdx - 12), troughIdx).reduce((s, c) => s + c.quoteVolume, 0)
            / Math.min(12, troughIdx))
        : NaN,
  });
}

const allTimeHigh = Math.max(...monthly.map((c) => c.high));
const athIdx = monthly.findIndex((c) => c.high === allTimeHigh);

/** Recent completed months against the two years before them. */
const recentVolume = done.slice(-4).map((c, i, arr) => {
  const idx = done.length - arr.length + i;
  const prior = done.slice(Math.max(0, idx - 12), idx);
  const avg = prior.reduce((s, x) => s + x.quoteVolume, 0) / (prior.length || 1);
  return { month: month(c), quoteVolume: c.quoteVolume, ratioToPriorYear: avg ? c.quoteVolume / avg : NaN };
});

let sentiment = null;
try {
  const res = await fetch(FNG_URL);
  const rows = (await res.json())?.data ?? [];
  const values = rows.map((r) => Number(r.value)).filter(Number.isFinite);
  if (values.length) {
    sentiment = {
      value: values[0],
      label: rows[0].value_classification,
      min30d: Math.min(...values),
      max30d: Math.max(...values),
    };
  }
} catch { /* sentiment is an extra, not a requirement */ }

console.log(JSON.stringify({
  measuredAt: new Date().toISOString(),
  method: {
    interval: "1M",
    monthsAvailable: monthly.length,
    peakRule: "highest monthly close to date, unbeaten for the following 12 months",
    caveat: "A handful of completed cycles on this venue's record, and the first sits at the very start of it. A comparison, never a probability.",
  },
  now: {
    price,
    allTimeHigh,
    allTimeHighMonth: month(monthly[athIdx]),
    drawdownFromHighPct: (price / allTimeHigh - 1) * 100,
    monthsSinceHigh: monthly.length - 1 - athIdx,
  },
  completedCycles: completed,
  completedSummary: {
    n: completed.length,
    medianDrawdownPct: completed.length
      ? completed.map((c) => c.drawdownPct).sort((a, b) => a - b)[completed.length >> 1] : NaN,
    medianMonthsToTrough: completed.length
      ? completed.map((c) => c.monthsToTrough).sort((a, b) => a - b)[completed.length >> 1] : NaN,
  },
  recentVolume,
  sentiment,
}, null, 2));
