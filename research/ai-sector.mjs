/**
 * Is "the AI group" a sector, or a label? And what is RENDER, measured.
 *
 * A reader sent an AI-sector scan: RENDER top, TAO the leader, FET momentum,
 * ICP structurally nicer but a weaker narrative. Every line of it is a claim
 * about a *group* — that these names belong together, and that belonging tells
 * you something a price chart does not.
 *
 * That claim is testable and almost never tested, so it is the centre of this
 * file.
 *
 *   If "AI" is a sector, its members should move together for reasons beyond
 *   the market. Strip each one's exposure to BTC by regression, and what
 *   remains is the part BTC does not explain. Members of a real sector should
 *   still be correlated in that residual; a bag of alts with a theme in the
 *   name should not.
 *
 *   The comparison is the whole test. A within-basket correlation of 0.3 means
 *   nothing on its own — alts are correlated. So the same statistic is computed
 *   for hundreds of random baskets of the same size, drawn from liquid pairs
 *   outside the group, over the same window. The AI basket's percentile in that
 *   distribution is the answer.
 *
 * Then RENDER specifically, since the brief singles it out. Beta to BTC, the
 * part of its move BTC does not explain, and whether the "base" the scan
 * declines to credit it with actually exists by a measurable definition —
 * a consolidation is a range that is tight relative to the pair's own
 * volatility, not a shape someone recognises.
 *
 * Two decisions worth stating. Returns are daily and logged, so a regression
 * is not distorted by compounding. And PHB is dropped: it moved -69% today on
 * what is plainly a token event rather than a narrative, and leaving it in
 * would let one corporate action decide a sector statistic.
 *
 * Writes research/ai-sector.json.
 */

import { writeFileSync } from "node:fs";
import { atr, fetchKlines } from "../src/analysis.mjs";

const WINDOW_DAYS = 180;
const MIN_TURNOVER_USD = 1e6;

/**
 * The basket, named before anything is measured.
 *
 * The reader's six, minus AKT which this exchange does not list, plus the
 * other clearly-AI pairs Binance carries above the liquidity floor. Choosing
 * members after seeing which ones cohere would manufacture the result.
 */
const AI = ["RENDERUSDT", "TAOUSDT", "FETUSDT", "ICPUSDT", "VIRTUALUSDT",
  "ARKMUSDT", "WLDUSDT", "AIUSDT", "AIXBTUSDT", "IOUSDT", "GRTUSDT"];
const NAMED_BY_BRIEF = ["RENDERUSDT", "TAOUSDT", "FETUSDT", "ICPUSDT", "VIRTUALUSDT", "AKTUSDT"];
/** Quoted by the brief but not listed here, so it cannot be checked. */
const UNLISTED = "AKTUSDT";
/** Excluded with a reason rather than quietly: a token event, not a narrative. */
const EXCLUDED = { symbol: "PHBUSDT", reason: "moved -69% on a token event; one corporate action would decide the statistic" };

const retry = async (fn, n = 5) => {
  let last;
  for (let i = 0; i < n; i++) {
    try { return await fn(); } catch (e) { last = e; await new Promise((r) => setTimeout(r, 700 * (i + 1))); }
  }
  throw last;
};

const mean = (xs) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null);
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
 * Universe and prices
 * ------------------------------------------------------------------ */

const tickers = await retry(async () => {
  const r = await fetch("https://data-api.binance.vision/api/v3/ticker/24hr");
  if (!r.ok) throw new Error(`ticker/24hr -> ${r.status}`);
  return r.json();
});
const liquid = tickers
  .filter((t) => t.symbol.endsWith("USDT") && Number(t.quoteVolume) >= MIN_TURNOVER_USD)
  .map((t) => ({ symbol: t.symbol, price: Number(t.lastPrice), changePct: Number(t.priceChangePercent), turnoverUsd: Number(t.quoteVolume) }));
const bySymbol = new Map(liquid.map((t) => [t.symbol, t]));

const closes = new Map();
const fetchCloses = async (symbol) => {
  if (closes.has(symbol)) return closes.get(symbol);
  const rows = await retry(() => fetchKlines(symbol, { interval: "1d", limit: WINDOW_DAYS + 2 }));
  closes.set(symbol, rows);
  return rows;
};

const btcRows = await fetchCloses("BTCUSDT");
const logRet = (rows) => rows.slice(1).map((r, i) => Math.log(r.close / rows[i].close));
const btcRet = logRet(btcRows);

/**
 * Everything is aligned to BTC's last N days by index, and any pair whose
 * history is shorter is dropped rather than padded — a shorter series silently
 * compared against a longer one is a different window, not a smaller sample.
 */
const alignedResiduals = async (symbol) => {
  const rows = await fetchCloses(symbol);
  if (rows.length < WINDOW_DAYS) return null;
  const r = logRet(rows).slice(-btcRet.length);
  if (r.length !== btcRet.length) return null;

  const mb = mean(btcRet), mr = mean(r);
  let cov = 0, varb = 0;
  for (let i = 0; i < r.length; i++) {
    cov += (btcRet[i] - mb) * (r[i] - mr);
    varb += (btcRet[i] - mb) ** 2;
  }
  const beta = varb ? cov / varb : 0;
  const alpha = mr - beta * mb;
  const resid = r.map((x, i) => x - (alpha + beta * btcRet[i]));
  const rsq = 1 - (stdev(resid) ** 2) / (stdev(r) ** 2);
  return { symbol, beta, alphaDailyPct: alpha * 100, rsq, resid, returns: r };
};

/**
 * The same liquidity floor applies to basket members as to the control pool.
 *
 * AIUSDT trades under a million a day, and including it while the control can
 * only draw from pairs above the floor would compare a basket that may hold
 * illiquid names against one that never can. A study whose two arms are drawn
 * from different universes is measuring the universes.
 */
const aiRows = [];
const belowFloor = [];
for (const s of AI) {
  const t = bySymbol.get(s);
  if (!t) { belowFloor.push(s); continue; }
  const a = await alignedResiduals(s);
  if (a) aiRows.push(a);
}

/** Mean pairwise correlation of residuals inside a set. */
const withinCorr = (rows) => {
  const vals = [];
  for (let i = 0; i < rows.length; i++) {
    for (let j = i + 1; j < rows.length; j++) vals.push(corr(rows[i].resid, rows[j].resid));
  }
  return { mean: mean(vals), pairs: vals.length };
};

const aiWithin = withinCorr(aiRows);

/* ------------------------------------------------------------------ *
 * The control: random baskets of the same size
 * ------------------------------------------------------------------ */

const pool = liquid
  .filter((t) => !AI.includes(t.symbol) && t.symbol !== "BTCUSDT" && t.symbol !== EXCLUDED.symbol)
  .filter((t) => !/^(USDC|FDUSD|TUSD|BUSD|EUR|WBTC|WBETH|PAXG|XAUT)/.test(t.symbol))
  .map((t) => t.symbol);

/** Deterministic, so the control is reproducible. */
let seed = 20260822;
const rand = () => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed / 0x7fffffff; };

const BASKETS = 200;
const poolResiduals = new Map();
const controlMeans = [];
let drawn = 0, skipped = 0;

for (let b = 0; b < BASKETS; b++) {
  const picks = [];
  let guard = 0;
  while (picks.length < aiRows.length && guard++ < 200) {
    const s = pool[Math.floor(rand() * pool.length)];
    if (picks.some((p) => p.symbol === s)) continue;
    if (!poolResiduals.has(s)) {
      try { poolResiduals.set(s, await alignedResiduals(s)); }
      catch { poolResiduals.set(s, null); }
    }
    const row = poolResiduals.get(s);
    if (!row) { skipped++; continue; }
    picks.push(row);
  }
  if (picks.length === aiRows.length) { controlMeans.push(withinCorr(picks).mean); drawn++; }
}

controlMeans.sort((a, b) => a - b);
const percentile = (controlMeans.filter((v) => v < aiWithin.mean).length / controlMeans.length) * 100;
const controlMean = mean(controlMeans), controlSd = stdev(controlMeans);
const zVsControl = controlSd ? (aiWithin.mean - controlMean) / controlSd : null;

/**
 * Does the cohesion survive dropping any one member?
 *
 * A single pair can carry a within-basket correlation — GRT's residual variance
 * is the largest here — and "the sector is real" resting on one name is a fact
 * about that name. Each member is removed in turn and the statistic recomputed
 * against control baskets of the matching smaller size.
 */
const leaveOneOut = [];
for (const dropped of aiRows) {
  const kept = aiRows.filter((r) => r.symbol !== dropped.symbol);
  const w = withinCorr(kept).mean;
  const ctl = [];
  for (let b = 0; b < 60; b++) {
    const picks = [];
    let guard = 0;
    while (picks.length < kept.length && guard++ < 200) {
      const sym = pool[Math.floor(rand() * pool.length)];
      if (picks.some((p) => p.symbol === sym)) continue;
      const row = poolResiduals.get(sym);
      if (!row) continue;
      picks.push(row);
    }
    if (picks.length === kept.length) ctl.push(withinCorr(picks).mean);
  }
  const cm = mean(ctl), cs = stdev(ctl);
  leaveOneOut.push({ dropped: dropped.symbol, withinCorr: w, controlMean: cm, z: cs ? (w - cm) / cs : null });
}
leaveOneOut.sort((a, b) => (a.z ?? 0) - (b.z ?? 0));

/* ------------------------------------------------------------------ *
 * RENDER, specifically
 * ------------------------------------------------------------------ */

const renderRows = await fetchCloses("RENDERUSDT");
const render = aiRows.find((r) => r.symbol === "RENDERUSDT");
const renderAtrPct = (atr(renderRows.slice(-15)) / renderRows.at(-1).close) * 100;

/**
 * Is there a base?
 *
 * "Base" gets used as a shape someone recognises. The measurable version: over
 * the last N days, how wide is the range relative to what this pair normally
 * covers in a day. A twenty-day range only two or three daily ranges wide is a
 * consolidation; one that is ten wide is a trend with a pause in it.
 */
const baseTest = (rows, days) => {
  const w = rows.slice(-days - 1, -1);
  const hi = Math.max(...w.map((c) => c.high));
  const lo = Math.min(...w.map((c) => c.low));
  const widthPct = ((hi / lo) - 1) * 100;
  const dailyAtr = (atr(rows.slice(-15)) / rows.at(-1).close) * 100;
  return {
    days,
    highUsd: hi,
    lowUsd: lo,
    widthPct,
    dailyRangesWide: widthPct / dailyAtr,
    lastCloseUsd: rows.at(-1).close,
    positionInRangePct: ((rows.at(-1).close - lo) / (hi - lo)) * 100,
  };
};

const renderBases = [20, 40, 60].map((d) => baseTest(renderRows, d));

/** Every basket member's tape today, so the brief's ordering can be checked. */
const today = AI.map((s) => bySymbol.get(s)).filter(Boolean)
  .map((t) => ({ symbol: t.symbol, price: t.price, changePct: t.changePct, turnoverUsd: t.turnoverUsd }))
  .sort((a, b) => b.changePct - a.changePct);

/** What the brief quoted, checked against the tape. */
const QUOTED = [
  { symbol: "RENDERUSDT", lowUsd: 1.48, highUsd: 1.53 },
  { symbol: "TAOUSDT", lowUsd: 225, highUsd: 235 },
  { symbol: "FETUSDT", lowUsd: 0.165, highUsd: 0.175 },
  { symbol: "ICPUSDT", lowUsd: 2.45, highUsd: 2.55 },
];
const quoted = QUOTED.map((q) => {
  const t = bySymbol.get(q.symbol);
  if (!t) return { ...q, verdict: "not listed" };
  return { ...q, actualUsd: t.price, inRange: t.price >= q.lowUsd && t.price <= q.highUsd };
});

const out = {
  measuredAt: new Date().toISOString(),
  source: "Binance spot daily klines",
  windowDays: WINDOW_DAYS,
  basket: aiRows.map((r) => r.symbol),
  namedByBrief: NAMED_BY_BRIEF,
  unlistedHere: UNLISTED,
  excluded: EXCLUDED,
  belowLiquidityFloor: belowFloor,
  minTurnoverUsd: MIN_TURNOVER_USD,
  betas: aiRows.map((r) => ({
    symbol: r.symbol, beta: r.beta, alphaDailyPct: r.alphaDailyPct, rsq: r.rsq,
    /**
     * The daily alpha compounded over the window.
     *
     * Stored rather than left for the write-up to derive: a figure computed
     * inside a sentence is one the verifier cannot trace and a reader cannot
     * check against anything.
     */
    alphaWindowPct: (Math.exp((r.alphaDailyPct / 100) * WINDOW_DAYS) - 1) * 100,
    price: bySymbol.get(r.symbol)?.price ?? null,
    changePct: bySymbol.get(r.symbol)?.changePct ?? null,
    turnoverUsd: bySymbol.get(r.symbol)?.turnoverUsd ?? null,
  })).sort((a, b) => b.beta - a.beta),
  cohesion: {
    aiWithinCorr: aiWithin.mean,
    pairs: aiWithin.pairs,
    controlBaskets: drawn,
    controlMeanCorr: controlMean,
    controlSd,
    percentileVsControl: percentile,
    zVsControl,
    poolSize: pool.length,
    skippedShortHistory: skipped,
    leaveOneOut,
    weakestAfterDropping: leaveOneOut[0] ?? null,
  },
  render: render ? {
    beta: render.beta,
    alphaDailyPct: render.alphaDailyPct,
    rsq: render.rsq,
    atrPct: renderAtrPct,
    priceUsd: bySymbol.get("RENDERUSDT")?.price ?? null,
    changePct: bySymbol.get("RENDERUSDT")?.changePct ?? null,
    turnoverUsd: bySymbol.get("RENDERUSDT")?.turnoverUsd ?? null,
    bases: renderBases,
  } : null,
  today,
  quoted,
};
writeFileSync("research/ai-sector.json", `${JSON.stringify(out, null, 2)}\n`);

const f = (v, dp = 2) => (v == null ? "—" : (v >= 0 ? "+" : "") + v.toFixed(dp));

console.log(`the AI basket, ${WINDOW_DAYS} days\n`);
console.log(`  ${"pair".padEnd(11)}${"beta".padStart(7)}${"alpha/day".padStart(11)}${"R2".padStart(7)}${"today".padStart(9)}${"turnover".padStart(11)}`);
for (const b of out.betas) {
  console.log(`  ${b.symbol.replace("USDT", "").padEnd(11)}${b.beta.toFixed(2).padStart(7)}`
    + `${f(b.alphaDailyPct, 3).padStart(11)}%`.padStart(11)
    + `${b.rsq.toFixed(2)}`.padStart(7)
    + `${f(b.changePct, 1)}%`.padStart(9)
    + `$${(b.turnoverUsd / 1e6).toFixed(1)}M`.padStart(11));
}

const c = out.cohesion;
console.log(`\nis it a sector?`);
console.log(`  AI residual correlation:      ${c.aiWithinCorr.toFixed(3)} across ${c.pairs} pairs`);
console.log(`  ${c.controlBaskets} random baskets of ${aiRows.length}: ${c.controlMeanCorr.toFixed(3)} ± ${c.controlSd.toFixed(3)}`);
console.log(`  the AI basket sits at the ${c.percentileVsControl.toFixed(0)}th percentile, z ${f(c.zVsControl)}`);
if (c.weakestAfterDropping) {
  const w = c.weakestAfterDropping;
  console.log(`  weakest after dropping one member: z ${f(w.z)} (without ${w.dropped.replace("USDT", "")})`);
}
if (out.belowLiquidityFloor.length) {
  console.log(`  excluded below the $${(MIN_TURNOVER_USD / 1e6).toFixed(0)}M floor: ${out.belowLiquidityFloor.map((s_) => s_.replace("USDT", "")).join(", ")}`);
}

if (out.render) {
  const r = out.render;
  console.log(`\nRENDER`);
  console.log(`  $${r.priceUsd.toFixed(4)}   ${f(r.changePct, 1)}% today   $${(r.turnoverUsd / 1e6).toFixed(1)}M   ATR ${r.atrPct.toFixed(2)}%`);
  console.log(`  beta to BTC ${r.beta.toFixed(2)}, R2 ${r.rsq.toFixed(2)}, alpha ${f(r.alphaDailyPct, 3)}%/day`);
  console.log(`  is there a base?`);
  for (const b of r.bases) {
    console.log(`    ${String(b.days).padStart(3)}d range $${b.lowUsd.toFixed(3)}-${b.highUsd.toFixed(3)}`
      + `   ${b.widthPct.toFixed(1)}% wide = ${b.dailyRangesWide.toFixed(1)} daily ranges`
      + `   price sits ${b.positionInRangePct.toFixed(0)}% up it`);
  }
}

console.log(`\nthe prices the brief quoted`);
for (const q of quoted) {
  console.log(`  ${q.symbol.replace("USDT", "").padEnd(9)} claimed $${q.lowUsd}-${q.highUsd}`.padEnd(34)
    + (q.actualUsd == null ? "not listed here" : `actual $${q.actualUsd}   ${q.inRange ? "in range" : "OUTSIDE"}`));
}
console.log(`  ${UNLISTED.replace("USDT", "").padEnd(9)} quoted by the brief, not listed on this exchange`);
