/**
 * Where an edge could still be, given everything already ruled out.
 *
 * The persistence study closed the door on the whole family of rules this desk
 * was built from. If the sign of a trailing return predicts the next one 50.70%
 * of the time, then no filter reading past direction can work, however it is
 * dressed — five agreeing windows, a moving-average cross, a trend line.
 *
 * But one number from the walk-forward never fitted that verdict. Shorting
 * every liquid pair, with no signal at all, returned +0.3217R per trade at
 * t = 4.94 over 403 trades. Being long returned almost the exact mirror. A t of
 * nearly five is not a rounding error, and it is the only large, significant
 * thing eleven days of measurement has produced.
 *
 * It has exactly two explanations and they lead to opposite places.
 *
 *   Regime. The window happened to be a falling market. Then the number is one
 *   observation of one drawdown, "short everything" is a bet on the next year
 *   resembling the last, and this desk has no algorithm — which is a finding,
 *   just not a welcome one.
 *
 *   Structure. Alts bleed against the majors persistently, through emissions,
 *   unlocks and rotation, in bull markets as well as bear. Then the edge is not
 *   a forecast at all: it is a drift you can stand in front of, and the work is
 *   sizing and cost rather than prediction.
 *
 * Regimes do not repeat on demand, so the test is calendar time — split every
 * year available, and ask whether the drift shows up in the bull years too. The
 * decisive version is the BTC-relative one: shorting alts *against BTC* removes
 * the market's own direction from the answer. If the bleed survives that, it is
 * structural. If it only exists outright, it was beta all along.
 *
 * Two layers, cheapest first, same as the persistence study:
 *
 *   1. Drift, with no geometry at all. Median 30-day return, raw and
 *      BTC-relative, per calendar year. No stop, no target, no fee, nothing to
 *      argue about except the sign.
 *   2. Tradeable, at the desk's fixed geometry with costs charged, to see how
 *      much of any drift survives being collected.
 *
 * SURVIVORSHIP, stated up front because it cuts one way and it matters: the
 * universe is what trades liquidly *today*. Coins that died are absent, and
 * they died going down. That biases every short result here toward being too
 * small, so a positive finding is conservative and a negative one is not
 * rescuable. `pairsAlive` per year shows how thin the early years are.
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { atr, fetchKlines } from "../src/analysis.mjs";
import { liveUniverse } from "../src/universe.mjs";

const PAIRS = Number(process.env.PAIRS ?? 80);
const START = Date.parse(process.env.START ?? "2019-01-01T00:00:00Z");
const HORIZON = 30;
const STOP_ATR = 1.5;
const RR = 2;
const FEE_PCT = 0.2;
/** Two legs, so the relative trade pays the round trip twice. */
const FEE_PCT_RELATIVE = 0.4;
const RELATIVE_STOP_VOL_MULT = 2.5;
const MIN_TURNOVER_USD = 2e6;
const MIN_HISTORY = 60;
const NUMERAIRE = "BTCUSDT";

const retry = async (fn, n = 6) => {
  let last;
  for (let i = 0; i < n; i++) {
    try { return await fn(); } catch (e) { last = e; await new Promise((r) => setTimeout(r, 1200 * (i + 1))); }
  }
  throw last;
};

const mean = (xs) => (xs.length ? xs.reduce((a, x) => a + x, 0) / xs.length : null);
const median = (xs) => {
  if (!xs.length) return null;
  const v = [...xs].sort((a, b) => a - b);
  return v.length % 2 ? v[v.length >> 1] : (v[v.length / 2 - 1] + v[v.length / 2]) / 2;
};
const tStat = (xs) => {
  if (xs.length < 2) return null;
  const m = mean(xs);
  const s = Math.sqrt(xs.reduce((a, x) => a + (x - m) ** 2, 0) / (xs.length - 1));
  return s > 0 ? m / (s / Math.sqrt(xs.length)) : null;
};

/**
 * Pages back to START, because one call returns at most 1000 candles.
 *
 * Cached to disk, and not out of politeness to the exchange: the robustness
 * checks below re-score the same history under different parameters, and a
 * study whose data silently changes between runs cannot answer whether a
 * result is robust to anything at all.
 */
const CACHE = ".cache/klines";
async function fullHistory(symbol) {
  const file = `${CACHE}/${symbol}-${new Date(START).toISOString().slice(0, 10)}.json`;
  if (existsSync(file)) return JSON.parse(readFileSync(file, "utf8"));

  const out = [];
  let cursor = START;
  for (let page = 0; page < 6; page++) {
    const rows = await retry(() => fetchKlines(symbol, { interval: "1d", limit: 1000, startTime: cursor }));
    if (!rows.length) break;
    const fresh = rows.filter((r) => !out.length || r.openTime > out.at(-1).openTime);
    out.push(...fresh);
    if (rows.length < 1000) break;
    cursor = out.at(-1).openTime + 86_400_000;
  }
  mkdirSync(CACHE, { recursive: true });
  writeFileSync(file, JSON.stringify(out));
  return out;
}

const dayOf = (c) => new Date(c.openTime).toISOString().slice(0, 10);
const yearOf = (d) => d.slice(0, 4);

const { symbols } = await retry(() => liveUniverse({ limit: PAIRS }));
const ordered = [NUMERAIRE, ...symbols.filter((s) => s !== NUMERAIRE)];

const series = [];
for (const [i, symbol] of ordered.entries()) {
  process.stderr.write(`\rloading ${i + 1}/${ordered.length} ${symbol.padEnd(14)}`);
  try {
    const daily = await fullHistory(symbol);
    if (daily.length < MIN_HISTORY + HORIZON) continue;
    series.push({ symbol, daily, index: new Map(daily.map((c, j) => [dayOf(c), j])) });
  } catch { /* absent rather than guessed */ }
}
process.stderr.write("\r");

const btc = series.find((s) => s.symbol === NUMERAIRE);
if (!btc) throw new Error(`${NUMERAIRE} is required as the numeraire and did not load.`);
const btcClose = new Map(btc.daily.map((c) => [dayOf(c), c.close]));

/**
 * Path-aware scoring: a bar that reaches both levels is charged to the stop.
 *
 * The pessimistic tie-break is the same one the rest of the desk uses. Without
 * it a wide-range day counts as a win whenever the target happens to be listed
 * second in the data, which is how a backtest quietly invents its edge.
 */
const scorePath = (daily, t, direction, stopPct) => {
  if (t + HORIZON >= daily.length) return null;
  const entry = daily[t].close;
  const long = direction === "long";
  const stop = long ? entry * (1 - stopPct / 100) : entry * (1 + stopPct / 100);
  const target = long ? entry * (1 + stopPct * RR / 100) : entry * (1 - stopPct * RR / 100);
  for (let j = t + 1; j <= t + HORIZON; j++) {
    const c = daily[j];
    if (long ? c.low <= stop : c.high >= stop) return -1;
    if (long ? c.high >= target : c.low <= target) return RR;
  }
  const move = (daily[t + HORIZON].close / entry - 1) * 100;
  return (long ? move : -move) / stopPct;
};

/** The same, on a close-only series — all the ratio series can support. */
const scoreCloses = (closes, t, direction, stopPct) => {
  if (t + HORIZON >= closes.length) return null;
  const entry = closes[t];
  const long = direction === "long";
  const stop = long ? entry * (1 - stopPct / 100) : entry * (1 + stopPct / 100);
  const target = long ? entry * (1 + stopPct * RR / 100) : entry * (1 - stopPct * RR / 100);
  for (let j = t + 1; j <= t + HORIZON; j++) {
    const c = closes[j];
    if (long ? c <= stop : c >= stop) return -1;
    if (long ? c >= target : c <= target) return RR;
  }
  const move = (closes[t + HORIZON] / entry - 1) * 100;
  return (long ? move : -move) / stopPct;
};

/** Close-to-close volatility, the only kind a ratio series can offer. */
const ccVolPct = (closes, t, n = 14) => {
  if (t < n) return null;
  let sum = 0;
  for (let i = t - n + 1; i <= t; i++) sum += Math.abs(closes[i] / closes[i - 1] - 1);
  return (sum / n) * 100;
};

/**
 * The rebalance calendar: BTC's own days, every 30th, non-overlapping.
 *
 * Non-overlapping matters more here than anywhere else in this repo. At a
 * 30-day horizon, stepping daily would reuse each month thirty times and turn
 * a few hundred independent bets into thousands of correlated ones — which is
 * precisely how a regime gets mistaken for a t of five.
 *
 * Non-overlap in *time* is only half of it, and the first run of this file got
 * the other half wrong. Eighty alts shorted against BTC on the same morning is
 * not eighty independent bets; they are eighty readings of one month's alt
 * season. Pooling them produced t = 11.37, which is the same inflation this
 * desk criticised in the persistence study wearing a cross-sectional hat. Every
 * significance figure below is computed on the mean R *per rebalance date*, so
 * the sample size is the number of months, not the number of tickets.
 */
const calendar = btc.daily.map(dayOf);
const buckets = {};
const bucket = (year) => (buckets[year] ??= {
  year,
  driftRaw: [], driftRel: [],
  shortRaw: [], longRaw: [],
  shortRel: [], longRel: [],
  alive: new Set(),
});

const majors = new Set(["BTCUSDT", "ETHUSDT"]);
const altOnly = { shortRaw: [], shortRel: [] };
const majorOnly = { shortRaw: [] };
/** Mean R per rebalance date, which is the sample that actually has an n. */
const byDate = { shortRawAlts: {}, shortRelAlts: {} };
/** Inputs kept so the parameter sweeps re-score identical episodes. */
const episodes = [];

// The ratio series is the same for every date, so it is built once per pair.
for (const s of series) {
  s.closes = s.daily.map((c) => c.close);
  if (s.symbol === NUMERAIRE) continue;
  s.ratio = s.daily.map((c) => {
    const p = btcClose.get(dayOf(c));
    return p ? c.close / p : null;
  });
  s.ratioComplete = s.ratio.every((v) => v != null);
}

for (let k = MIN_HISTORY; k + HORIZON < calendar.length; k += HORIZON) {
  const date = calendar[k];
  const b = bucket(yearOf(date));

  for (const s of series) {
    const t = s.index.get(date);
    if (t == null || t < MIN_HISTORY || t + HORIZON >= s.daily.length) continue;

    const turnoverUsd = s.daily.slice(t - 29, t + 1).reduce((a, c) => a + c.quoteVolume, 0) / 30;
    if (!(turnoverUsd >= MIN_TURNOVER_USD)) continue;
    b.alive.add(s.symbol);

    /* ---- layer 1: drift, no geometry, nothing to argue with ---- */
    const fwd = s.daily[t + HORIZON].close / s.daily[t].close - 1;
    b.driftRaw.push(fwd * 100);

    const nowBtc = btcClose.get(date);
    const thenBtc = btcClose.get(calendar[k + HORIZON]);
    const btcFwd = nowBtc && thenBtc ? thenBtc / nowBtc - 1 : null;
    const relative = btcFwd == null ? null : (1 + fwd) / (1 + btcFwd) - 1;
    if (relative != null && s.symbol !== NUMERAIRE) b.driftRel.push(relative * 100);

    /* ---- layer 2: tradeable, fixed geometry, costs charged ---- */
    const asOf = s.daily.slice(0, t + 1);
    const atrPct = (atr(asOf, 14) / s.daily[t].close) * 100;
    const isMajor = majors.has(s.symbol);

    if (Number.isFinite(atrPct) && atrPct > 0) {
      const stopPct = STOP_ATR * atrPct;
      if (stopPct > 0 && stopPct < 60) {
        const feeR = FEE_PCT / stopPct;
        const sh = scorePath(s.daily, t, "short", stopPct);
        const lo = scorePath(s.daily, t, "long", stopPct);
        if (sh != null) {
          b.shortRaw.push(sh - feeR);
          (isMajor ? majorOnly.shortRaw : altOnly.shortRaw).push(sh - feeR);
          if (!isMajor) (byDate.shortRawAlts[date] ??= []).push(sh - feeR);
        }
        if (lo != null) b.longRaw.push(lo - feeR);
      }
    }

    // The BTC-relative trade, on the ratio series, priced as two legs.
    if (s.symbol !== NUMERAIRE && s.ratioComplete) {
      const vol = ccVolPct(s.ratio, t);
      // Matched to the raw leg's shape: 1.5 ATR is about 2.5x mean absolute
      // close-to-close change. Fixed before the run — and swept below, because
      // "I picked it before looking" is a weaker defence than showing the
      // answer does not depend on the pick.
      const stopPct = vol == null ? null : RELATIVE_STOP_VOL_MULT * vol;
      if (stopPct && stopPct > 0 && stopPct < 60) {
        const feeR = FEE_PCT_RELATIVE / stopPct;
        const sh = scoreCloses(s.ratio, t, "short", stopPct);
        const lo = scoreCloses(s.ratio, t, "long", stopPct);
        if (sh != null) {
          b.shortRel.push(sh - feeR);
          altOnly.shortRel.push(sh - feeR);
          (byDate.shortRelAlts[date] ??= []).push(sh - feeR);
        }
        if (lo != null) b.longRel.push(lo - feeR);
      }
      if (vol != null) episodes.push({ s, t, date, vol, rawVol: ccVolPct(s.closes, t) });
    }
  }
}

/**
 * The controlled comparison: change the numeraire and nothing else.
 *
 * The two variants above are not a fair fight. The raw leg is scored on the
 * intraday path, where a spike through the stop ends the trade; the relative
 * leg is scored on closes, because a ratio has no honest high and low. Close-
 * only scoring cannot be stopped intraday, so it flatters whichever side gets
 * it — and that was the side carrying the result.
 *
 * So both are re-scored here with the same close-only walk, the same
 * close-to-close volatility, the same stop multiple and the same two-leg fee.
 * The only surviving difference is whether the price is divided by BTC. If the
 * gap holds under that, it is the numeraire doing the work.
 */
const matchedPerDate = { vsUsdt: {}, vsBtc: {} };
for (const e of episodes) {
  for (const [key, closes, vol] of [
    ["vsUsdt", e.s.closes, e.rawVol],
    ["vsBtc", e.s.ratio, e.vol],
  ]) {
    if (vol == null) continue;
    const stopPct = RELATIVE_STOP_VOL_MULT * vol;
    if (!(stopPct > 0 && stopPct < 60)) continue;
    const r = scoreCloses(closes, e.t, "short", stopPct);
    if (r != null) (matchedPerDate[key][e.date] ??= []).push(r - FEE_PCT_RELATIVE / stopPct);
  }
}
const matched = Object.fromEntries(Object.entries(matchedPerDate).map(([k, perDate]) => {
  const dateMeans = Object.values(perDate).map(mean);
  return [k, {
    trades: Object.values(perDate).reduce((a, v) => a + v.length, 0),
    months: dateMeans.length,
    meanNetR: mean(dateMeans),
    tStatByMonth: tStat(dateMeans),
    monthsPositivePct: dateMeans.length
      ? (dateMeans.filter((v) => v > 0).length / dateMeans.length) * 100 : null,
    worstMonthR: dateMeans.length ? Math.min(...dateMeans) : null,
  }];
}));

/**
 * Does the answer depend on the two numbers I chose?
 *
 * The stop multiple sets how much room the trade gives the drift, and the fee
 * decides how much of it survives. Both were fixed before the first run, which
 * is the right order but not evidence — a result that only exists at 2.5x and
 * 0.4% is a result about 2.5x and 0.4%. Costs are swept well past anything
 * spot charges, because the relative trade in practice is two perp legs and
 * funding is not visible from here.
 */
const sweep = [];
for (const mult of [1.5, 2, 2.5, 3, 4]) {
  for (const fee of [0.4, 0.8, 1.6]) {
    const perDate = {};
    for (const e of episodes) {
      const stopPct = mult * e.vol;
      if (!(stopPct > 0 && stopPct < 60)) continue;
      const r = scoreCloses(e.s.ratio, e.t, "short", stopPct);
      if (r == null) continue;
      (perDate[e.date] ??= []).push(r - fee / stopPct);
    }
    const dateMeans = Object.values(perDate).map(mean);
    sweep.push({
      stopVolMultiple: mult, feePct: fee,
      trades: Object.values(perDate).reduce((a, v) => a + v.length, 0),
      months: dateMeans.length,
      meanNetR: mean(dateMeans),
      tStatByMonth: tStat(dateMeans),
      monthsPositivePct: dateMeans.length
        ? (dateMeans.filter((v) => v > 0).length / dateMeans.length) * 100 : null,
    });
  }
}

/**
 * Both statistics, side by side, because the gap between them is the lesson.
 *
 * `tStatPooled` treats every ticket as independent and is the number the first
 * run of this file reported. `tStatByMonth` collapses each rebalance date to
 * one observation first. They differ by roughly the square root of the number
 * of pairs traded together, and only the second one is a claim about the world.
 */
const describe = (xs, dateMap) => {
  if (!xs.length) return null;
  const dateMeans = dateMap ? Object.values(dateMap).map(mean) : null;
  return {
    trades: xs.length, meanNetR: mean(xs), medianNetR: median(xs),
    winPct: (xs.filter((v) => v > 0).length / xs.length) * 100,
    tStatPooled: tStat(xs),
    months: dateMeans?.length ?? null,
    tStatByMonth: dateMeans ? tStat(dateMeans) : null,
    monthsPositivePct: dateMeans?.length
      ? (dateMeans.filter((v) => v > 0).length / dateMeans.length) * 100 : null,
    worstMonthR: dateMeans?.length ? Math.min(...dateMeans) : null,
  };
};

const years = Object.keys(buckets).sort();
const perYear = years.map((y) => {
  const b = buckets[y];
  return {
    year: y,
    pairsAlive: b.alive.size,
    rebalances: Math.round(b.driftRaw.length / Math.max(1, b.alive.size)),
    medianDriftRawPct: median(b.driftRaw),
    medianDriftRelPct: median(b.driftRel),
    shareNegativeRawPct: b.driftRaw.length
      ? (b.driftRaw.filter((v) => v < 0).length / b.driftRaw.length) * 100 : null,
    shareNegativeRelPct: b.driftRel.length
      ? (b.driftRel.filter((v) => v < 0).length / b.driftRel.length) * 100 : null,
    shortRawR: mean(b.shortRaw),
    longRawR: mean(b.longRaw),
    shortRelR: mean(b.shortRel),
    trades: b.shortRaw.length,
  };
});

const withDrift = perYear.filter((r) => r.medianDriftRelPct != null && r.pairsAlive >= 10);
const relNegativeYears = withDrift.filter((r) => r.medianDriftRelPct < 0).length;
const rawNegativeYears = withDrift.filter((r) => r.medianDriftRawPct < 0).length;
const relShortPositiveYears = withDrift.filter((r) => r.shortRelR > 0).length;
const rawShortPositiveYears = withDrift.filter((r) => r.shortRawR > 0).length;

const out = {
  measuredAt: new Date().toISOString(),
  pairs: series.length,
  numeraire: NUMERAIRE,
  firstDate: calendar[MIN_HISTORY] ?? null,
  lastDate: calendar.at(-1) ?? null,
  rules: {
    horizonDays: HORIZON, stopAtr: STOP_ATR, rewardRatio: RR,
    feePct: FEE_PCT, feePctRelative: FEE_PCT_RELATIVE,
    minTurnoverUsd: MIN_TURNOVER_USD, relativeStopVolMultiple: RELATIVE_STOP_VOL_MULT,
  },
  caveats: {
    survivorship: "Universe is what trades liquidly today; delisted coins are absent and they died going down, so every short figure here is biased small.",
    relativeScoring: "The BTC-relative leg is scored on closes, not intraday path, because a ratio series has no honest high and low.",
    crossSectional: "Alts shorted against BTC on the same date move together. Significance is computed on the mean R per rebalance date; the pooled per-ticket t is reported only to show how far it inflates.",
    funding: "The relative trade is two perp legs in practice and funding is not observable from here (fapi is blocked). The fee sweep stands in for it.",
  },
  perYear,
  yearsMeasured: withDrift.length,
  rawNegativeYears,
  relNegativeYears,
  rawShortPositiveYears,
  relShortPositiveYears,
  pooled: {
    shortRawAlts: describe(altOnly.shortRaw, byDate.shortRawAlts),
    shortRawMajors: describe(majorOnly.shortRaw),
    shortRelAlts: describe(altOnly.shortRel, byDate.shortRelAlts),
  },
  matched,
  sweep,
};
writeFileSync("research/structural-edge.json", `${JSON.stringify(out, null, 2)}\n`);

console.log(`${series.length} pairs · ${out.firstDate} → ${out.lastDate} · non-overlapping ${HORIZON}-day windows\n`);
console.log("drift per calendar year (no stop, no target, no fee)");
console.log("  year   pairs   median 30d      vs BTC    neg%   negBTC%    shortR   shortR(vs BTC)");
for (const r of perYear) {
  const f = (v, dp = 2, suf = "") => (v == null ? "—" : (v >= 0 ? "+" : "") + v.toFixed(dp) + suf);
  console.log(`  ${r.year}${String(r.pairsAlive).padStart(8)}`
    + `${f(r.medianDriftRawPct, 2, "%").padStart(13)}`
    + `${f(r.medianDriftRelPct, 2, "%").padStart(12)}`
    + `${(r.shareNegativeRawPct == null ? "—" : r.shareNegativeRawPct.toFixed(0) + "%").padStart(8)}`
    + `${(r.shareNegativeRelPct == null ? "—" : r.shareNegativeRelPct.toFixed(0) + "%").padStart(10)}`
    + `${f(r.shortRawR, 4).padStart(10)}`
    + `${f(r.shortRelR, 4).padStart(16)}`);
}

console.log(`\nyears with enough pairs to count: ${withDrift.length}`);
console.log(`  median 30-day drift negative outright: ${rawNegativeYears}/${withDrift.length}`);
console.log(`  median 30-day drift negative vs BTC:   ${relNegativeYears}/${withDrift.length}`);
console.log(`  short paid outright:                   ${rawShortPositiveYears}/${withDrift.length}`);
console.log(`  short paid vs BTC:                     ${relShortPositiveYears}/${withDrift.length}`);

console.log("\npooled, costs charged");
console.log("  variant                  trades   mean net R   t(ticket)   months   t(month)   +months");
for (const [k, v] of Object.entries(out.pooled)) {
  if (!v) { console.log(`  ${k.padEnd(23)} no trades`); continue; }
  console.log(`  ${k.padEnd(23)}${String(v.trades).padStart(7)}`
    + `${(v.meanNetR >= 0 ? "+" : "") + v.meanNetR.toFixed(4)}`.padStart(13)
    + `${v.tStatPooled == null ? "—" : v.tStatPooled.toFixed(2)}`.padStart(12)
    + `${v.months ?? "—"}`.padStart(9)
    + `${v.tStatByMonth == null ? "—" : v.tStatByMonth.toFixed(2)}`.padStart(11)
    + `${v.monthsPositivePct == null ? "—" : v.monthsPositivePct.toFixed(0) + "%"}`.padStart(10));
}

console.log("\nsame scorer, same vol, same stop, same fee — only the numeraire differs");
console.log("  shorting alts vs   trades   months   mean net R   t(month)   +months   worst month");
for (const [k, v] of Object.entries(matched)) {
  console.log(`  ${(k === "vsUsdt" ? "USDT" : "BTC").padEnd(19)}${String(v.trades).padStart(6)}`
    + `${String(v.months).padStart(9)}`
    + `${(v.meanNetR >= 0 ? "+" : "") + v.meanNetR.toFixed(4)}`.padStart(13)
    + `${v.tStatByMonth == null ? "—" : v.tStatByMonth.toFixed(2)}`.padStart(11)
    + `${v.monthsPositivePct.toFixed(0)}%`.padStart(10)
    + `${v.worstMonthR.toFixed(2)}`.padStart(14));
}

console.log("\nshort alts vs BTC — does it depend on the two numbers I chose?");
console.log("  stop        fee    months   mean net R   t(month)   +months");
for (const r of sweep) {
  console.log(`  ${(r.stopVolMultiple + "x vol").padEnd(10)}${(r.feePct + "%").padStart(6)}`
    + `${String(r.months).padStart(10)}`
    + `${(r.meanNetR >= 0 ? "+" : "") + r.meanNetR.toFixed(4)}`.padStart(13)
    + `${r.tStatByMonth == null ? "—" : r.tStatByMonth.toFixed(2)}`.padStart(11)
    + `${r.monthsPositivePct.toFixed(0)}%`.padStart(10));
}
