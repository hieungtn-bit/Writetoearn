/**
 * ENA, measured through the one thing that actually pays it: funding.
 *
 * Almost every "fundamental analysis" of a token is a narrative with a chart
 * stapled to it, because the fundamentals are unobservable from here. Ethena
 * is the exception, and that is the whole reason this file is worth writing.
 *
 * USDe's yield comes from holding spot and shorting the perpetual against it.
 * The revenue of that trade is the funding rate, paid three times a day by the
 * longs. So the protocol's engine is not a story — it is a number this desk
 * already downloads, per symbol, per month, from the exchange's own archive.
 *
 * Which makes one question answerable that normally is not: does ENA's price
 * actually track the thing that pays it?
 *
 *   Funding is averaged across the majors the strategy shorts, over
 *   non-overlapping 30-day windows. Overlapping windows would score the same
 *   month several times, which is the error that once turned a t of 1.46 into
 *   5.69 on this desk.
 *
 *   ENA's return over each window is measured twice, in dollars and against
 *   BTC. The BTC-relative one is the one that answers the question, because a
 *   token rising in a week the whole market rose has not told you anything
 *   about its own economics.
 *
 *   And the count is stated. ENA has traded for about two years, which is
 *   roughly two dozen independent windows. That is not enough to settle
 *   anything and the write-up has to say so rather than let a correlation
 *   coefficient imply otherwise.
 *
 * The rest is the ordinary work: where funding sits in its own history, beta
 * and alpha to BTC, whether there is a base by a measurable definition, and
 * what this desk's own board says — which is usually "no", and saying so is
 * the point of following a name at all.
 *
 * Writes research/ena.json.
 */

import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { atr, fetchKlines } from "../src/analysis.mjs";

const SYMBOL = "ENAUSDT";
const DAY_MS = 86_400_000;
/** The perps the delta-neutral position is short, and therefore earns on. */
const ENGINE = ["BTCUSDT", "ETHUSDT", "SOLUSDT"];
const WINDOW_DAYS = 30;
const BETA_DAYS = 180;

const retry = async (fn, n = 5) => {
  let last;
  for (let i = 0; i < n; i++) {
    try { return await fn(); } catch (e) { last = e; await new Promise((r) => setTimeout(r, 700 * (i + 1))); }
  }
  throw last;
};

const mean = (xs) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null);
const median = (xs) => {
  if (!xs.length) return null;
  const s = [...xs].sort((a, b) => a - b);
  const m = s.length >> 1;
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};
const stdev = (xs) => {
  if (xs.length < 2) return null;
  const m = mean(xs);
  return Math.sqrt(xs.reduce((a, x) => a + (x - m) ** 2, 0) / (xs.length - 1));
};
const corr = (a, b) => {
  const ma = mean(a), mb = mean(b);
  let num = 0, da = 0, db = 0;
  for (let i = 0; i < a.length; i++) {
    num += (a[i] - ma) * (b[i] - mb);
    da += (a[i] - ma) ** 2;
    db += (b[i] - mb) ** 2;
  }
  return da && db ? num / Math.sqrt(da * db) : 0;
};

/* ------------------------------------------------------------------ *
 * 1. Price
 * ------------------------------------------------------------------ */

const series = async (symbol) => {
  const out = [];
  let cursor = Date.UTC(2024, 0, 1);
  while (cursor < Date.now()) {
    const rows = await retry(() => fetchKlines(symbol, { interval: "1d", limit: 1000, startTime: cursor }));
    if (!rows.length) break;
    out.push(...rows);
    const next = rows.at(-1).openTime + DAY_MS;
    if (next <= cursor) break;
    cursor = next;
  }
  const seen = new Map();
  for (const r of out) seen.set(r.openTime, r);
  return [...seen.values()].sort((a, b) => a.openTime - b.openTime);
};

const ena = await series(SYMBOL);
const btc = await series("BTCUSDT");
const spot = ena.at(-1).close;

const tickers = await retry(async () => {
  const r = await fetch(`https://data-api.binance.vision/api/v3/ticker/24hr?symbol=${SYMBOL}`);
  if (!r.ok) throw new Error(`ticker -> ${r.status}`);
  return r.json();
});

const allTimeHigh = Math.max(...ena.map((c) => c.high));
const atrPct = (atr(ena.slice(-15)) / spot) * 100;

const tape = {
  priceUsd: spot,
  changePct24h: Number(tickers.priceChangePercent),
  turnoverUsd: Number(tickers.quoteVolume),
  atrPct,
  dailyBars: ena.length,
  firstBar: new Date(ena[0].openTime).toISOString().slice(0, 10),
  allTimeHighUsd: allTimeHigh,
  drawdownFromHighPct: ((spot / allTimeHigh) - 1) * 100,
  medianDailyRangePct: median(ena.map((c) => ((c.high - c.low) / c.open) * 100)),
};

/* ------------------------------------------------------------------ *
 * 2. The engine: funding on the perps the strategy shorts
 * ------------------------------------------------------------------ */

/**
 * The archive stops at the last complete month.
 *
 * A monthly dump labelled "current" is how this desk once reported late-July
 * funding as "the last seven days". The cut-off is recorded so the write-up
 * cannot make that mistake again, and live funding is fetched separately.
 */
const loadFunding = (symbol) => {
  const path = `.cache/funding/${symbol}.json`;
  if (!existsSync(path)) return null;
  const j = JSON.parse(readFileSync(path, "utf8"));
  return { symbol, rates: j.rates, monthsFound: j.monthsFound, monthsMissing: j.monthsMissing };
};

const engineFunding = ENGINE.map(loadFunding).filter(Boolean);
const archiveEndsAt = new Date(Math.min(...engineFunding.map((f) => f.rates.at(-1)[0]))).toISOString();

/**
 * Average annualised funding across the engine legs, over one window.
 *
 * Three payments a day, so an interval rate annualises at x3x365. Legs are
 * averaged rather than summed: the protocol splits its short across them, and
 * summing would report the yield of holding all three at full size.
 */
const ANNUALISE = 3 * 365;
const fundingOver = (fromMs, toMs) => {
  const perLeg = engineFunding.map((f) => {
    const xs = f.rates.filter(([t]) => t >= fromMs && t < toMs).map(([, r]) => r);
    return xs.length ? mean(xs) : null;
  }).filter((x) => x != null);
  if (!perLeg.length) return null;
  return mean(perLeg) * 100 * ANNUALISE;
};

/**
 * Non-overlapping windows, walked back from the archive's end.
 *
 * Each window's funding is paired with ENA's return over that same window, so
 * the question is "did the token move with what it earned", not "does a lagged
 * indicator predict". A prediction test would need a lag and this sample is
 * nowhere near large enough to support one.
 */
const closeAt = (rows, t) => {
  let hit = null;
  for (const r of rows) { if (r.openTime + DAY_MS <= t) hit = r; else break; }
  return hit?.close ?? null;
};

const windows = [];
const enaStart = ena[0].openTime;
for (let end = new Date(archiveEndsAt).getTime(); ; end -= WINDOW_DAYS * DAY_MS) {
  const start = end - WINDOW_DAYS * DAY_MS;
  if (start < enaStart + DAY_MS) break;
  const fundingPct = fundingOver(start, end);
  const a = closeAt(ena, start), b = closeAt(ena, end);
  const ba = closeAt(btc, start), bb = closeAt(btc, end);
  if (fundingPct == null || !a || !b || !ba || !bb) continue;
  const enaPct = ((b / a) - 1) * 100;
  const btcPct = ((bb / ba) - 1) * 100;
  windows.push({
    from: new Date(start).toISOString().slice(0, 10),
    to: new Date(end).toISOString().slice(0, 10),
    fundingAnnualisedPct: fundingPct,
    enaReturnPct: enaPct,
    btcReturnPct: btcPct,
    enaVsBtcPct: enaPct - btcPct,
  });
}
windows.reverse();

const fundingVsPrice = windows.length >= 4 ? {
  windows: windows.length,
  windowDays: WINDOW_DAYS,
  corrWithUsdReturn: corr(windows.map((w) => w.fundingAnnualisedPct), windows.map((w) => w.enaReturnPct)),
  corrWithVsBtcReturn: corr(windows.map((w) => w.fundingAnnualisedPct), windows.map((w) => w.enaVsBtcPct)),
  meanFundingPct: mean(windows.map((w) => w.fundingAnnualisedPct)),
  medianFundingPct: median(windows.map((w) => w.fundingAnnualisedPct)),
  windowsWithNegativeFunding: windows.filter((w) => w.fundingAnnualisedPct < 0).length,
  meanVsBtcPct: mean(windows.map((w) => w.enaVsBtcPct)),
} : null;

/**
 * Two-sided p for a correlation, so "0.479 over 28 windows" is not left as an
 * adjective. Standard t = r*sqrt(n-2)/sqrt(1-r^2) on n-2 degrees of freedom.
 */
const logGamma = (x) => {
  const c = [76.18009172947146, -86.50532032941677, 24.01409824083091,
    -1.231739572450155, 0.1208650973866179e-2, -0.5395239384953e-5];
  let y = x, tmp = x + 5.5;
  tmp -= (x + 0.5) * Math.log(tmp);
  let ser = 1.000000000190015;
  for (let j = 0; j < 6; j++) ser += c[j] / ++y;
  return -tmp + Math.log(2.5066282746310005 * ser / x);
};
const betacf = (a, b, x) => {
  const FPMIN = 1e-300, EPS = 3e-16;
  const qab = a + b, qap = a + 1, qam = a - 1;
  let c = 1, d = 1 - qab * x / qap;
  if (Math.abs(d) < FPMIN) d = FPMIN;
  d = 1 / d;
  let h = d;
  for (let m = 1; m <= 300; m++) {
    const m2 = 2 * m;
    let aa = m * (b - m) * x / ((qam + m2) * (a + m2));
    d = 1 + aa * d; if (Math.abs(d) < FPMIN) d = FPMIN;
    c = 1 + aa / c; if (Math.abs(c) < FPMIN) c = FPMIN;
    d = 1 / d; h *= d * c;
    aa = -(a + m) * (qab + m) * x / ((a + m2) * (qap + m2));
    d = 1 + aa * d; if (Math.abs(d) < FPMIN) d = FPMIN;
    c = 1 + aa / c; if (Math.abs(c) < FPMIN) c = FPMIN;
    d = 1 / d;
    const del = d * c;
    h *= del;
    if (Math.abs(del - 1) < EPS) break;
  }
  return h;
};
const betai = (a, b, x) => {
  if (x <= 0) return 0;
  if (x >= 1) return 1;
  const bt = Math.exp(logGamma(a + b) - logGamma(a) - logGamma(b) + a * Math.log(x) + b * Math.log(1 - x));
  return x < (a + 1) / (a + b + 2) ? bt * betacf(a, b, x) / a : 1 - bt * betacf(b, a, 1 - x) / b;
};
const corrP = (r, nObs) => {
  if (nObs < 4 || Math.abs(r) >= 1) return null;
  const df = nObs - 2;
  const t = r * Math.sqrt(df) / Math.sqrt(1 - r * r);
  return { t, p: betai(df / 2, 0.5, df / (df + t * t)) };
};

/**
 * The control that decides whether this is about Ethena at all.
 *
 * Funding rises when leverage is long and risk appetite is high, and so does
 * every alt. A correlation between funding and ENA proves nothing until the
 * same correlation is measured for tokens with no mechanical link to funding
 * whatsoever. If ENA sits in the middle of that distribution, the number is
 * describing the weather, not the protocol.
 */
const controlSymbols = (await retry(async () => {
  const r = await fetch("https://data-api.binance.vision/api/v3/ticker/24hr");
  if (!r.ok) throw new Error(`ticker/24hr -> ${r.status}`);
  return r.json();
}))
  .filter((t) => t.symbol.endsWith("USDT") && Number(t.quoteVolume) >= 5e6)
  .filter((t) => !["ENAUSDT", "BTCUSDT", ...ENGINE].includes(t.symbol))
  .filter((t) => !/^(USDC|FDUSD|TUSD|BUSD|EUR|WBTC|WBETH|PAXG|XAUT)/.test(t.symbol))
  .map((t) => t.symbol)
  .slice(0, 60);

const controlCorrs = [];
for (const sym of controlSymbols) {
  let rows;
  try { rows = await series(sym); } catch { continue; }
  if (!rows.length) continue;
  const xs = [], ys = [];
  for (const w of windows) {
    const start = Date.parse(`${w.from}T00:00:00Z`), end = Date.parse(`${w.to}T00:00:00Z`);
    const a = closeAt(rows, start), b = closeAt(rows, end);
    if (!a || !b) continue;
    xs.push(w.fundingAnnualisedPct);
    ys.push(((b / a) - 1) * 100 - w.btcReturnPct);
  }
  if (xs.length >= Math.max(8, windows.length * 0.6)) {
    controlCorrs.push({ symbol: sym, corr: corr(xs, ys), windows: xs.length });
  }
}
controlCorrs.sort((a, b) => a.corr - b.corr);

/**
 * Where funding sits in its own history.
 *
 * "Funding is high" is the single most repeated unmeasured claim about this
 * token. The percentile is computed over every archived interval on the engine
 * legs, so the answer is a rank rather than an adjective.
 */
const allIntervals = engineFunding.flatMap((f) => f.rates.map(([, r]) => r * 100 * ANNUALISE));
allIntervals.sort((a, b) => a - b);
const recentWindowFunding = windows.at(-1)?.fundingAnnualisedPct ?? null;
const fundingPercentile = recentWindowFunding == null ? null
  : (allIntervals.filter((v) => v < recentWindowFunding).length / allIntervals.length) * 100;

/** Live funding, because the archive is weeks stale by construction. */
const liveFunding = [];
for (const inst of ["BTC-USDT-SWAP", "ETH-USDT-SWAP", "SOL-USDT-SWAP", "ENA-USDT-SWAP"]) {
  try {
    const r = await fetch(`https://www.okx.com/api/v5/public/funding-rate?instId=${inst}`, { signal: AbortSignal.timeout(20_000) });
    const d = (await r.json()).data[0];
    liveFunding.push({
      instrument: inst, venue: "OKX perpetual",
      ratePct: Number(d.fundingRate) * 100,
      annualisedPct: Number(d.fundingRate) * 100 * ANNUALISE,
    });
  } catch { /* absent rather than guessed */ }
}
const liveEngine = liveFunding.filter((f) => !f.instrument.startsWith("ENA"));

/* ------------------------------------------------------------------ *
 * 3. Beta, alpha, structure, and the board
 * ------------------------------------------------------------------ */

const logRet = (rows) => rows.slice(1).map((r, i) => Math.log(r.close / rows[i].close));
const enaRet = logRet(ena).slice(-BETA_DAYS);
const btcRet = logRet(btc).slice(-BETA_DAYS);
const n = Math.min(enaRet.length, btcRet.length);
const er = enaRet.slice(-n), br = btcRet.slice(-n);
const mb = mean(br), mr = mean(er);
let cov = 0, varb = 0;
for (let i = 0; i < n; i++) { cov += (br[i] - mb) * (er[i] - mr); varb += (br[i] - mb) ** 2; }
const beta = varb ? cov / varb : 0;
const alphaDaily = (mr - beta * mb) * 100;

const marketModel = {
  days: n,
  beta,
  alphaDailyPct: alphaDaily,
  alphaWindowPct: (Math.exp((alphaDaily / 100) * n) - 1) * 100,
};

const baseTest = (rows, days) => {
  const w = rows.slice(-days - 1, -1);
  const hi = Math.max(...w.map((c) => c.high));
  const lo = Math.min(...w.map((c) => c.low));
  const widthPct = ((hi / lo) - 1) * 100;
  return {
    days, highUsd: hi, lowUsd: lo, widthPct,
    dailyRangesWide: widthPct / atrPct,
    positionInRangePct: ((rows.at(-1).close - lo) / (hi - lo)) * 100,
  };
};
const bases = [20, 40, 60].map((d) => baseTest(ena, d));

const board = existsSync("site/signals.json") ? (() => {
  const b = JSON.parse(readFileSync("site/signals.json", "utf8"));
  const r = b.signals.find((s) => s.symbol === SYMBOL);
  return r ? {
    scannedAt: b.scannedAt, bias: r.bias, side: r.side,
    agreeing: r.agreement.agreeing, windows: r.agreement.windows,
    effectiveN: r.recent?.[r.side]?.best?.effectiveN ?? null,
    reason: r.reason,
  } : { scannedAt: b.scannedAt, absent: true };
})() : null;

const out = {
  measuredAt: new Date().toISOString(),
  symbol: SYMBOL,
  sources: {
    price: "Binance spot daily klines",
    fundingHistory: "data.binance.vision monthly fundingRate dumps, cached",
    fundingLive: "OKX perpetual funding-rate",
  },
  tape,
  engineLegs: ENGINE,
  archiveEndsAt,
  fundingMonthsMissing: Object.fromEntries(engineFunding.map((f) => [f.symbol, f.monthsMissing])),
  fundingVsPrice: fundingVsPrice ? {
    ...fundingVsPrice,
    usdTest: corrP(fundingVsPrice.corrWithUsdReturn, fundingVsPrice.windows),
    vsBtcTest: corrP(fundingVsPrice.corrWithVsBtcReturn, fundingVsPrice.windows),
  } : null,
  control: controlCorrs.length ? {
    tokens: controlCorrs.length,
    minTurnoverUsd: 5e6,
    meanCorr: mean(controlCorrs.map((c) => c.corr)),
    medianCorr: median(controlCorrs.map((c) => c.corr)),
    sdCorr: stdev(controlCorrs.map((c) => c.corr)),
    enaPercentile: fundingVsPrice
      ? (controlCorrs.filter((c) => c.corr < fundingVsPrice.corrWithVsBtcReturn).length / controlCorrs.length) * 100
      : null,
    highest: controlCorrs.slice(-5).reverse(),
    lowest: controlCorrs.slice(0, 5),
  } : null,
  windows,
  fundingPercentileNow: fundingPercentile,
  recentWindowFundingPct: recentWindowFunding,
  liveFunding,
  liveEngineMeanAnnualisedPct: liveEngine.length ? mean(liveEngine.map((f) => f.annualisedPct)) : null,
  marketModel,
  bases,
  board,
};
writeFileSync("research/ena.json", `${JSON.stringify(out, null, 2)}\n`);

const f = (v, dp = 2) => (v == null ? "—" : (v >= 0 ? "+" : "") + v.toFixed(dp));

console.log(`ENA — the token whose fundamentals are a number I can fetch\n`);
console.log(`  $${spot.toFixed(4)}  ${f(tape.changePct24h, 1)}% today  $${(tape.turnoverUsd / 1e6).toFixed(1)}M  ATR ${atrPct.toFixed(2)}%`);
console.log(`  ${tape.dailyBars} daily bars since ${tape.firstBar}`);
console.log(`  all-time high $${allTimeHigh.toFixed(4)} — now ${f(tape.drawdownFromHighPct, 1)}% from it\n`);

console.log(`the engine: funding on ${ENGINE.map((s) => s.replace("USDT", "")).join(", ")}`);
console.log(`  archive ends ${archiveEndsAt.slice(0, 10)} (monthly dumps stop at the last complete month)`);
if (fundingVsPrice) {
  const v = fundingVsPrice;
  console.log(`  ${v.windows} non-overlapping ${v.windowDays}-day windows`);
  console.log(`  mean funding ${f(v.meanFundingPct, 1)}% annualised, median ${f(v.medianFundingPct, 1)}%`);
  console.log(`  windows where funding was negative: ${v.windowsWithNegativeFunding}`);
  console.log(`  correlation with ENA's return:        ${f(v.corrWithUsdReturn, 3)}`);
  console.log(`  correlation with ENA's return vs BTC: ${f(v.corrWithVsBtcReturn, 3)}`);
  const t = out.fundingVsPrice.vsBtcTest;
  if (t) console.log(`    t ${f(t.t)}, p ${t.p.toFixed(4)} on ${v.windows - 2} degrees of freedom`);
}
if (out.control) {
  const c = out.control;
  console.log(`\n  the same correlation for ${c.tokens} tokens with no mechanical link to funding`);
  console.log(`    mean ${f(c.meanCorr, 3)}, median ${f(c.medianCorr, 3)}, sd ${c.sdCorr.toFixed(3)}`);
  console.log(`    ENA sits at the ${c.enaPercentile.toFixed(0)}th percentile of them`);
  console.log(`    highest: ${c.highest.map((x) => `${x.symbol.replace("USDT", "")} ${f(x.corr, 2)}`).join(", ")}`);
}
if (fundingPercentile != null) {
  console.log(`  the last archived window sat at ${f(recentWindowFunding, 1)}% — the ${fundingPercentile.toFixed(0)}th percentile of every archived interval`);
}
if (liveFunding.length) {
  console.log(`\n  live, right now:`);
  for (const r of liveFunding) console.log(`    ${r.instrument.replace("-USDT-SWAP", "").padEnd(5)}${f(r.annualisedPct, 1)}% annualised`);
  console.log(`    engine average ${f(out.liveEngineMeanAnnualisedPct, 1)}%`);
}

console.log(`\nagainst the market, ${marketModel.days} days`);
console.log(`  beta ${beta.toFixed(2)}   alpha ${f(alphaDaily, 3)}%/day = ${f(marketModel.alphaWindowPct, 1)}% over the window`);

console.log(`\nis there a base?`);
for (const b of bases) {
  console.log(`  ${String(b.days).padStart(3)}d $${b.lowUsd.toFixed(4)}-${b.highUsd.toFixed(4)}`
    + `  ${b.widthPct.toFixed(1)}% wide = ${b.dailyRangesWide.toFixed(1)} daily ranges`
    + `  price ${b.positionInRangePct > 100 ? "above the range" : `${b.positionInRangePct.toFixed(0)}% up it`}`);
}

if (board) {
  console.log(`\nmy board, ${board.scannedAt}`);
  console.log(board.absent ? "  ENA is not on the board" : `  ${board.bias}, ${board.agreeing}/${board.windows} windows agree, ${board.effectiveN} independent episodes`);
}
