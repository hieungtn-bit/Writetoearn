/**
 * Is +0.0036% per eight hours "mild"? Measure it instead of asserting it.
 *
 * A model landed on this desk with thresholds stated as fact: healthy funding is
 * -0.005% to +0.01% per eight hours, extreme is above +0.04%, long overcrowding
 * risk starts around +0.015%. Those numbers may well be right. Nothing in the
 * model says where they came from, and a threshold with no source is the same
 * device as a 52-out-of-100 score — it reads as measured and cannot be wrong.
 *
 * Two things are measured here, and they are different questions:
 *
 *   1. Where does a given reading sit in its own history? That turns "mild"
 *      into a percentile, which is checkable.
 *   2. Does a high reading actually precede a fall? That is the claim the
 *      thresholds exist to support, and it is the one that matters.
 *
 * The second is tested forward from each funding stamp so nothing is fitted
 * after the fact. Funding settles every eight hours, so the horizons are whole
 * settlement periods and the windows do not overlap.
 *
 * OKX is the venue because Binance's futures endpoint is geo-blocked from here.
 * That is a real limitation, not a preference: the model being audited quotes
 * Binance funding, and the two venues do not print the same number.
 *
 * Reproducible:
 *   node research/funding-distribution.mjs > research/funding-distribution.json
 */

const OKX = "https://www.okx.com/api/v5";
const INST = "BTC-USDT-SWAP";
const PAGES = 40;             // 100 settlements a page, three a day
const HORIZONS = [3, 9, 21];  // one day, three days, seven days, in settlements

const retry = async (fn, n = 6) => {
  let last;
  for (let i = 0; i < n; i++) {
    try { return await fn(); } catch (e) { last = e; await new Promise((r) => setTimeout(r, 900 * (i + 1))); }
  }
  throw last;
};

const getJson = (url) => retry(async () => {
  const res = await fetch(url, { signal: AbortSignal.timeout(20_000) });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const j = await res.json();
  if (j.code !== "0") throw new Error(`OKX ${j.code}: ${j.msg}`);
  return j.data;
});

/** Paged backwards from now; OKX returns newest first. */
const funding = [];
let before;
for (let p = 0; p < PAGES; p++) {
  const url = `${OKX}/public/funding-rate-history?instId=${INST}&limit=100`
    + (before ? `&after=${before}` : "");
  const rows = await getJson(url);
  if (!rows.length) break;
  for (const r of rows) {
    funding.push({ time: Number(r.fundingTime), rate: Number(r.fundingRate) * 100 });
  }
  before = rows.at(-1).fundingTime;
}
funding.sort((a, b) => a.time - b.time);

/** Hourly closes covering the same span, so outcomes can be read off. */
async function fetchHourly(from, to) {
  const out = [];
  let cursor = from;
  while (cursor < to) {
    const rows = await retry(async () => {
      const res = await fetch(
        `https://data-api.binance.vision/api/v3/klines?symbol=BTCUSDT&interval=1h&startTime=${cursor}&limit=1000`,
        { signal: AbortSignal.timeout(20_000) });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return res.json();
    });
    if (!rows.length) break;
    for (const r of rows) out.push({ time: Number(r[0]), close: Number(r[4]), high: Number(r[2]), low: Number(r[3]) });
    const next = Number(rows.at(-1)[0]) + 3_600_000;
    if (next <= cursor) break;
    cursor = next;
  }
  return out;
}

const candles = await fetchHourly(funding[0].time, Date.now());
const closeAt = (t) => {
  // The first completed hour at or after the settlement stamp.
  const c = candles.find((x) => x.time >= t);
  return c ? c.close : null;
};

const rows = [];
for (let i = 0; i < funding.length; i++) {
  const entry = closeAt(funding[i].time);
  if (!entry) continue;
  const r = { time: funding[i].time, rate: funding[i].rate, entry };
  for (const h of HORIZONS) {
    const later = funding[i + h];
    r[`fwd${h}`] = later ? (() => {
      const px = closeAt(later.time);
      return px ? (px / entry - 1) * 100 : null;
    })() : null;
  }
  rows.push(r);
}

const rates = funding.map((f) => f.rate).sort((a, b) => a - b);
const quantile = (q) => rates[Math.min(rates.length - 1, Math.floor(rates.length * q))];
const percentileOf = (v) => (rates.filter((x) => x < v).length / rates.length) * 100;

const mean = (xs) => xs.reduce((a, b) => a + b, 0) / xs.length;
const stdev = (xs) => {
  const m = mean(xs);
  return Math.sqrt(xs.reduce((s, x) => s + (x - m) ** 2, 0) / (xs.length - 1));
};

/** Welch on non-overlapping windows. */
function welch(a, b) {
  if (a.length < 3 || b.length < 3) return { sigmas: NaN, n: [a.length, b.length] };
  const se = Math.sqrt(stdev(a) ** 2 / a.length + stdev(b) ** 2 / b.length);
  return { differencePp: mean(a) - mean(b), meanA: mean(a), meanB: mean(b), sigmas: se ? (mean(a) - mean(b)) / se : NaN, n: [a.length, b.length] };
}

/**
 * The thresholds the audited model states as fact, each turned into a
 * percentile and a forward test. Named here so they cannot be adjusted after
 * seeing which one survives.
 */
const CLAIMED = {
  healthyLow: -0.005,
  healthyHigh: 0.01,
  crowdingWatch: 0.015,
  extreme: 0.04,
};

const thresholdTests = {};
for (const [name, level] of Object.entries(CLAIMED)) {
  const above = rows.filter((r) => r.rate >= level);
  const below = rows.filter((r) => r.rate < level);
  thresholdTests[name] = {
    level,
    percentileOfLevel: percentileOf(level),
    settlementsAbove: above.length,
    shareAbovePct: (above.length / rows.length) * 100,
    forward: Object.fromEntries(HORIZONS.map((h) => {
      const a = above.map((r) => r[`fwd${h}`]).filter((v) => v != null);
      const b = below.map((r) => r[`fwd${h}`]).filter((v) => v != null);
      return [`h${h}`, welch(a, b)];
    })),
  };
}

// The reading being audited, in its own terms.
const CURRENT = 0.003581;

console.log(JSON.stringify({
  measuredAt: new Date().toISOString(),
  venue: "OKX BTC-USDT-SWAP",
  method: {
    settlements: funding.length,
    horizonsInSettlements: HORIZONS,
    note: "Funding settles every 8 hours. Horizons are whole settlement counts (3 = one day, 9 = three days, 21 = seven days) and forward windows are read from the first completed hourly close at or after each stamp.",
    caveat: "OKX, because Binance's futures endpoint is geo-blocked from this machine. The audited model quotes Binance funding and the two venues do not print the same rate — OKX read 0.005102% at the same moment Binance read 0.003581%.",
  },
  span: {
    from: new Date(funding[0].time).toISOString(),
    to: new Date(funding.at(-1).time).toISOString(),
    days: Math.round((funding.at(-1).time - funding[0].time) / 86_400_000),
  },
  distribution: {
    n: rates.length,
    min: rates[0],
    p05: quantile(0.05), p25: quantile(0.25), median: quantile(0.5),
    p75: quantile(0.75), p95: quantile(0.95), p99: quantile(0.99),
    max: rates.at(-1),
    negativeSharePct: (rates.filter((r) => r < 0).length / rates.length) * 100,
  },
  auditedReading: {
    ratePct: CURRENT,
    percentile: percentileOf(CURRENT),
    annualisedPct: CURRENT * 3 * 365,
  },
  claimedThresholds: thresholdTests,
}, null, 2));
