/**
 * Does the hour of the day tell you anything about Bitcoin?
 *
 * "Tonight's session" is a question this desk gets asked and has never been able
 * to answer with anything but a chart opinion. It is testable: group two years
 * of hourly returns by their UTC hour and look.
 *
 * The trap is built into the question. Twenty-four hours tested against one
 * baseline will hand you a "significant" hour roughly one time in twenty by
 * chance alone, and the hour that wins is then written up as a discovery. So the
 * evening block is named before the run — 12:00 to 17:00 UTC, which is evening
 * in Vietnam and covers the 13:30 US equity open — and the other twenty-three
 * hours are reported beside it so anyone can see whether the winner is the block
 * that was asked about or just the luckiest cell in the table.
 *
 * Both questions are asked, because they are different:
 *   direction  — does price drift up or down in these hours
 *   size       — is more of the day's movement spent in these hours
 *
 * The second is far more likely to be real. Volatility clusters around known
 * events; drift does not survive people noticing it.
 *
 * Reproducible:
 *   node research/hour-of-day.mjs > research/hour-of-day.json
 */

const SPOT = "https://data-api.binance.vision/api/v3/klines";
const SYMBOL = "BTCUSDT";
const DAYS = 730;
/** Evening in Vietnam (UTC+7), and the US cash open sits inside it. */
const EVENING_UTC = [12, 13, 14, 15, 16];

const retry = async (fn, n = 6) => {
  let last;
  for (let i = 0; i < n; i++) {
    try { return await fn(); } catch (e) { last = e; await new Promise((r) => setTimeout(r, 1000 * (i + 1))); }
  }
  throw last;
};

/** Binance caps a request at 1000 candles, so two years has to be paged. */
async function fetchHourly(symbol, days) {
  const end = Date.now();
  const start = end - days * 86_400_000;
  const out = [];
  let cursor = start;
  while (cursor < end) {
    const rows = await retry(async () => {
      const res = await fetch(`${SPOT}?symbol=${symbol}&interval=1h&startTime=${cursor}&limit=1000`,
        { signal: AbortSignal.timeout(20_000) });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return res.json();
    });
    if (!rows.length) break;
    for (const r of rows) {
      out.push({
        openTime: Number(r[0]),
        open: Number(r[1]), high: Number(r[2]), low: Number(r[3]), close: Number(r[4]),
        quoteVolume: Number(r[7]),
      });
    }
    const next = Number(rows.at(-1)[0]) + 3_600_000;
    if (next <= cursor) break;
    cursor = next;
  }
  // The final candle is still forming and its close is not a close.
  return out.slice(0, -1);
}

const candles = await fetchHourly(SYMBOL, DAYS);

/**
 * The evening block measured as one window, not as five hours added together.
 *
 * Five hourly ranges of 0.71% do not make a 3.55% block: the highs and lows land
 * at different times and partly cancel. A reader sizing a stop for the session
 * needs the block, so it is measured directly rather than inferred.
 */
const blocks = [];
{
  const byDay = new Map();
  for (const c of candles) {
    const d = new Date(c.openTime);
    if (!EVENING_UTC.includes(d.getUTCHours())) continue;
    const key = d.toISOString().slice(0, 10);
    if (!byDay.has(key)) byDay.set(key, []);
    byDay.get(key).push(c);
  }
  for (const [date, cs] of byDay) {
    if (cs.length < EVENING_UTC.length) continue; // partial block, not comparable
    cs.sort((a, b) => a.openTime - b.openTime);
    const high = Math.max(...cs.map((c) => c.high));
    const low = Math.min(...cs.map((c) => c.low));
    blocks.push({
      date,
      rangePct: ((high - low) / low) * 100,
      returnPct: (cs.at(-1).close / cs[0].open - 1) * 100,
    });
  }
}

const rows = [];
for (let i = 1; i < candles.length; i++) {
  const prev = candles[i - 1], c = candles[i];
  if (!prev.close || !c.low) continue;
  rows.push({
    hour: new Date(c.openTime).getUTCHours(),
    returnPct: (c.close / prev.close - 1) * 100,
    rangePct: ((c.high - c.low) / c.low) * 100,
    quoteVolume: c.quoteVolume,
  });
}

const mean = (xs) => xs.reduce((a, b) => a + b, 0) / xs.length;
const stdev = (xs) => {
  const m = mean(xs);
  return Math.sqrt(xs.reduce((s, x) => s + (x - m) ** 2, 0) / (xs.length - 1));
};
const median = (xs) => {
  const s = [...xs].sort((a, b) => a - b);
  const m = s.length >> 1;
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};

const summarise = (xs) => ({
  n: xs.length,
  meanReturnPct: mean(xs.map((r) => r.returnPct)),
  medianReturnPct: median(xs.map((r) => r.returnPct)),
  positiveSharePct: (xs.filter((r) => r.returnPct > 0).length / xs.length) * 100,
  medianRangePct: median(xs.map((r) => r.rangePct)),
  medianTurnoverUsd: median(xs.map((r) => r.quoteVolume)),
});

/** Welch, on non-overlapping hourly returns — no de-overlapping needed here. */
function welch(a, b, field) {
  const xa = a.map((r) => r[field]), xb = b.map((r) => r[field]);
  const se = Math.sqrt(stdev(xa) ** 2 / xa.length + stdev(xb) ** 2 / xb.length);
  return { differencePp: mean(xa) - mean(xb), standardError: se, sigmas: se ? (mean(xa) - mean(xb)) / se : NaN };
}

const byHour = {};
for (let h = 0; h < 24; h++) {
  const g = rows.filter((r) => r.hour === h);
  if (g.length) byHour[h] = { ...summarise(g), vsRest: welch(g, rows.filter((r) => r.hour !== h), "returnPct") };
}

const evening = rows.filter((r) => EVENING_UTC.includes(r.hour));
const rest = rows.filter((r) => !EVENING_UTC.includes(r.hour));

/**
 * The largest single-hour reading anywhere in the table.
 *
 * Reported so the pre-named block can be judged against the best that chance
 * produced across twenty-four tries, rather than against zero.
 */
const bestSingleHour = Math.max(...Object.values(byHour).map((h) => Math.abs(h.vsRest.sigmas)));

console.log(JSON.stringify({
  measuredAt: new Date().toISOString(),
  symbol: SYMBOL,
  method: {
    days: DAYS,
    eveningHoursUtc: EVENING_UTC,
    note: "Evening block named before the run. Twenty-four hours tested against one baseline will produce a significant-looking cell by chance, so the largest single-hour reading is reported alongside.",
    timezone: "Vietnam is UTC+7, so 12:00-17:00 UTC is 19:00-24:00 local. The US cash open at 13:30 UTC sits inside the block.",
  },
  hours: rows.length,
  firstCandle: new Date(candles[0].openTime).toISOString(),
  lastCandle: new Date(candles.at(-1).openTime).toISOString(),
  overall: summarise(rows),
  evening: {
    ...summarise(evening),
    directionVsRest: welch(evening, rest, "returnPct"),
    sizeVsRest: welch(evening, rest, "rangePct"),
    turnoverVsRest: welch(evening, rest, "quoteVolume"),
  },
  rest: summarise(rest),
  bestSingleHourSigma: bestSingleHour,
  eveningBlock: {
    sessions: blocks.length,
    medianRangePct: median(blocks.map((b) => b.rangePct)),
    p25RangePct: [...blocks.map((b) => b.rangePct)].sort((a, b) => a - b)[Math.floor(blocks.length * 0.25)],
    p75RangePct: [...blocks.map((b) => b.rangePct)].sort((a, b) => a - b)[Math.floor(blocks.length * 0.75)],
    p90RangePct: [...blocks.map((b) => b.rangePct)].sort((a, b) => a - b)[Math.floor(blocks.length * 0.90)],
    medianReturnPct: median(blocks.map((b) => b.returnPct)),
    positiveSharePct: (blocks.filter((b) => b.returnPct > 0).length / blocks.length) * 100,
    note: "Range across the whole block, high to low, not the sum of hourly ranges.",
  },
  byHour,
}, null, 2));
