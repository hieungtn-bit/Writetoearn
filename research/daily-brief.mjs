/**
 * The daily column: how is the market, and what do we do about it.
 *
 * Everything this desk publishes has so far been a one-off — a study, an audit,
 * a reaction to something a reader sent. That is fine for research and useless
 * as a habit, because a reader cannot follow a channel that answers a different
 * question every day.
 *
 * So this is the recurring one. Two questions, the same two, every time:
 *
 *   1. How is the market — breadth across the whole exchange, then the board.
 *   2. What do we do — which rows survive the filters, at a fixed geometry.
 *
 * Three things make it a column rather than a daily opinion.
 *
 * The filters do not move. Liquidity, at least twelve independent episodes, and
 * all five lookback windows agreeing — each one traced to a measurement rather
 * than to a mood, and changing them requires a published reason.
 *
 * The geometry is fixed at 1.5 ATR with a 2:1 target. research/selection-bias.json
 * showed that optimising it per pair keeps about a tenth of itself out of
 * sample, so the trade shape is a rule here, not a choice.
 *
 * And yesterday's positions are marked before today's are offered. A column
 * that proposes trades without settling the last set is a newsletter. The prior
 * plan file is loaded, every position walked forward bar by bar against what
 * actually happened, and the result printed whether or not it flatters anyone.
 *
 * Three names are followed regardless of whether they qualify — BTC, BNB and
 * ICP — because readers hold them and "it did not make the cut" is an answer
 * they deserve to see rather than an absence they have to infer. ICP in
 * particular sits outside the scanned universe on turnover, and saying so is
 * more useful than quietly omitting it.
 *
 * Writes research/daily-brief.json for the post, and data/plans/<date>.json as
 * the ledger tomorrow's edition will settle.
 */

import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { analyzeAsset, atr, fetchKlines } from "../src/analysis.mjs";
import { volumeProfile } from "../src/profile.mjs";
import { AGREEMENT_WINDOWS, grid, summarise, walk } from "../src/signals.mjs";

const BOARD = JSON.parse(readFileSync("site/signals.json", "utf8"));
const PLAN_DIR = "data/plans";

/**
 * The pipeline's own walk-forward result, carried into every edition.
 *
 * research/self-backtest.json walked this exact pipeline across non-overlapping
 * rebalances and found it behind a rule with no signal in it. A column that
 * publishes positions from a pipeline while keeping that number in a separate
 * post is choosing which of its own findings the reader has to go looking for.
 * So it travels with the picks, whichever way it moves.
 */
const SELF_TEST = existsSync("research/self-backtest.json")
  ? JSON.parse(readFileSync("research/self-backtest.json", "utf8"))
  : null;

/** The trade shape. Fixed by rule, not chosen per pair. */
const STOP_ATR = 1.5;
const RR = 2;
const HORIZON = 30;
const FEE_PCT = 0.2;
/** Independent episodes below which the engine already calls a row thin. */
const MIN_EFFECTIVE_N = 12;
const ACCOUNT_BASE = 1000;
const RISK_PCT = 1;

/** Followed whether or not they qualify, because readers hold them. */
const FOLLOWED = ["BTCUSDT", "BNBUSDT", "ICPUSDT"];

const retry = async (fn, n = 6) => {
  let last;
  for (let i = 0; i < n; i++) {
    try { return await fn(); } catch (e) { last = e; await new Promise((r) => setTimeout(r, 1200 * (i + 1))); }
  }
  throw last;
};

const median = (xs) => {
  if (!xs.length) return null;
  const s = [...xs].sort((a, b) => a - b);
  const m = s.length >> 1;
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};

/* ------------------------------------------------------------------ *
 * 1. How is the market
 * ------------------------------------------------------------------ */

const tickers = await retry(async () => {
  const r = await fetch("https://data-api.binance.vision/api/v3/ticker/24hr");
  if (!r.ok) throw new Error(`ticker/24hr -> ${r.status}`);
  return r.json();
});
const usdt = tickers.filter((t) => t.symbol.endsWith("USDT") && Number(t.quoteVolume) > 0);
const changes = usdt.map((t) => Number(t.priceChangePercent));
const breadth = {
  pairs: usdt.length,
  up: changes.filter((c) => c > 0).length,
  down: changes.filter((c) => c < 0).length,
  upSharePct: (changes.filter((c) => c > 0).length / changes.length) * 100,
  medianChangePct: median(changes),
  upOver5: changes.filter((c) => c > 5).length,
  downOver5: changes.filter((c) => c < -5).length,
  downOver10: changes.filter((c) => c < -10).length,
};

let dominancePct = null, fearGreed = null;
try {
  dominancePct = (await retry(async () => {
    const r = await fetch("https://api.coingecko.com/api/v3/global");
    if (!r.ok) throw new Error(String(r.status));
    return r.json();
  })).data.market_cap_percentage.btc;
} catch { /* recorded as null, not guessed */ }
try {
  fearGreed = Number((await retry(async () => {
    const r = await fetch("https://api.alternative.me/fng/?limit=1");
    if (!r.ok) throw new Error(String(r.status));
    return r.json();
  })).data[0].value);
} catch { /* recorded as null */ }

/* ------------------------------------------------------------------ *
 * 2. What survives the filters
 * ------------------------------------------------------------------ */

const funnel = (bias) => {
  const set = BOARD.signals.filter((s) => s.bias === bias);
  const tradeable = set.filter((s) => s.tradeable);
  const notThin = tradeable.filter((s) => s.confidence && s.confidence.effectiveN >= MIN_EFFECTIVE_N);
  const unanimous = notThin.filter((s) => s.agreement?.windows === 5 && s.agreement.agreeing === 5);
  return { total: set.length, tradeable: tradeable.length, notThin: notThin.length, unanimous: unanimous.length };
};

const qualifying = BOARD.signals.filter((s) =>
  s.tradeable && s.bias !== "WAIT" && s.confidence
  && s.confidence.effectiveN >= MIN_EFFECTIVE_N
  && s.agreement?.windows === 5 && s.agreement.agreeing === 5);

/** Score a symbol at the fixed geometry, over the full history and recently. */
const scoreFixed = async (symbol, direction) => {
  const daily = await retry(() => fetchKlines(symbol, { interval: "1d", limit: 1000 }));
  if (daily.length < 400) return null;
  const analysis = await retry(() => analyzeAsset(symbol, { candles: daily }));
  const atrPct = (atr(daily, 14) / analysis.price) * 100;
  const stopPct = STOP_ATR * atrPct;
  if (!(stopPct > 0) || stopPct >= 60) return null;

  const full = walk(daily, { direction, stopPct, targetPct: stopPct * RR, horizon: HORIZON });
  const recent = walk(daily.slice(-270), { direction, stopPct, targetPct: stopPct * RR, horizon: HORIZON });
  if (!full || !recent) return null;

  const entry = analysis.price;
  const feeR = FEE_PCT / stopPct;
  return {
    symbol, direction, entry, atrPct, stopPct,
    stop: direction === "long" ? entry * (1 - stopPct / 100) : entry * (1 + stopPct / 100),
    target: direction === "long" ? entry * (1 + stopPct * RR / 100) : entry * (1 - stopPct * RR / 100),
    positionUsd: ((ACCOUNT_BASE * RISK_PCT) / 100) / (stopPct / 100),
    fullNetR: full.expectancyR - feeR,
    recentNetR: recent.expectancyR - feeR,
    fullEffectiveN: full.effectiveN,
    agreesAcrossWindows: Math.sign(full.expectancyR) === Math.sign(recent.expectancyR),
    feeR,
  };
};

const scored = [];
for (const s of qualifying) {
  try {
    const r = await scoreFixed(s.symbol, s.bias === "LONG" ? "long" : "short");
    if (r) scored.push({ ...r, bias: s.bias, turnoverUsd: s.turnoverUsd, boardEffectiveN: s.confidence.effectiveN });
  } catch { /* absent rather than guessed */ }
}
scored.sort((a, b) => b.fullNetR - a.fullNetR);

const taken = scored.filter((s) => s.fullNetR > 0 && s.agreesAcrossWindows);
const declined = scored.filter((s) => !(s.fullNetR > 0 && s.agreesAcrossWindows))
  .map((s) => ({
    symbol: s.symbol, bias: s.bias, fullNetR: s.fullNetR,
    reason: s.fullNetR <= 0 ? "loses at the fixed geometry" : "full and recent windows disagree",
  }));

/* ------------------------------------------------------------------ *
 * 3. The three we follow, qualified or not
 * ------------------------------------------------------------------ */

const followed = {};
for (const symbol of FOLLOWED) {
  const daily = await retry(() => fetchKlines(symbol, { interval: "1d", limit: 1000 }));
  const hourly = await retry(() => fetchKlines(symbol, { interval: "1h", limit: 720 }));
  const analysis = await retry(() => analyzeAsset(symbol, { candles: daily }));
  const price = analysis.price;
  const atrPct = (atr(daily, 14) / price) * 100;
  const profile = hourly.length >= 700 ? volumeProfile(hourly, price) : null;

  const lookbacks = {};
  for (const days of AGREEMENT_WINDOWS) {
    if (daily.length < days + 30) continue;
    const s = daily.slice(-days);
    const lo = summarise(grid(s, atrPct, { direction: "long" }));
    const sh = summarise(grid(s, atrPct, { direction: "short" }));
    lookbacks[days] = {
      days,
      long: lo && `${lo.positive}/${lo.cells}`,
      short: sh && `${sh.positive}/${sh.cells}`,
      leans: (sh?.positive ?? 0) > (lo?.positive ?? 0) ? "short" : "long",
    };
  }
  const leaningShort = Object.values(lookbacks).filter((v) => v.leans === "short").length;

  const row = BOARD.signals.find((s) => s.symbol === symbol) ?? null;
  /** Why this name is or is not in today's taken list, stated rather than implied. */
  const verdict = (() => {
    if (!row) return { onBoard: false, reason: "outside the scanned universe on turnover" };
    if (row.bias === "WAIT") return { onBoard: true, reason: "the board stands aside: both directions lose recently" };
    if (!row.tradeable) return { onBoard: true, reason: "turnover too thin to fill a position" };
    if (!row.confidence || row.confidence.effectiveN < MIN_EFFECTIVE_N) {
      return { onBoard: true, reason: `sample too thin — ${Math.round(row.confidence?.effectiveN ?? 0)} independent episodes` };
    }
    if (!(row.agreement?.windows === 5 && row.agreement.agreeing === 5)) {
      return { onBoard: true, reason: `only ${row.agreement?.agreeing ?? 0} of ${row.agreement?.windows ?? 0} lookbacks agree` };
    }
    return { onBoard: true, reason: "qualifies" };
  })();

  const last30 = daily.slice(-30);
  const weeks = [];
  for (let i = 0; i + 7 <= daily.length; i += 7) {
    const w = daily.slice(i, i + 7);
    const lo = Math.min(...w.map((c) => c.low));
    weeks.push(((Math.max(...w.map((c) => c.high)) - lo) / lo) * 100);
  }

  followed[symbol] = {
    price, atrPct,
    rsi14: analysis.rsi14,
    change7dPct: analysis.change7dPct,
    change30dPct: analysis.change30dPct,
    rangePosition30d: analysis.rangePosition30d,
    range30: { low: Math.min(...last30.map((c) => c.low)), high: Math.max(...last30.map((c) => c.high)) },
    turnoverUsd: analysis.avgQuoteVolume30d,
    medianWeekPct: median(weeks),
    poc: profile?.pocPrice ?? null,
    valueArea: profile ? [profile.valueAreaLow, profile.valueAreaHigh] : null,
    priceVsValueArea: profile
      ? (price > profile.valueAreaHigh ? "above" : price < profile.valueAreaLow ? "below" : "inside") : null,
    lookbacks, leaningShort, lookbackCount: Object.keys(lookbacks).length,
    board: row ? {
      bias: row.bias,
      effectiveN: row.confidence?.effectiveN ?? null,
      thin: row.confidence?.thin ?? null,
      agreeing: row.agreement?.agreeing ?? null,
      windows: row.agreement?.windows ?? null,
      turning: row.regime?.turning ?? null,
    } : null,
    verdict,
    /** The stop this desk would use if it did take the trade. */
    stopIfTaken: { atr: STOP_ATR, pct: STOP_ATR * atrPct, shareOfMedianWeek: (STOP_ATR * atrPct) / median(weeks) },
  };
}

/* ------------------------------------------------------------------ *
 * 4. Settle what the last edition proposed
 * ------------------------------------------------------------------ */

mkdirSync(PLAN_DIR, { recursive: true });
const priorFiles = readdirSync(PLAN_DIR).filter((f) => f.endsWith(".json")).sort();
const priorPath = priorFiles.length ? `${PLAN_DIR}/${priorFiles.at(-1)}` : null;
const prior = priorPath && existsSync(priorPath) ? JSON.parse(readFileSync(priorPath, "utf8")) : null;

/**
 * Walk a proposed position forward from the moment it was published.
 *
 * Hourly candles, stop checked before target on any bar that reaches both —
 * the same rule the backtests use, so a live position is not scored more
 * kindly than a historical one.
 */
const settle = async (p, since) => {
  const bars = await retry(() => fetchKlines(p.symbol, { interval: "1h", limit: 1000 }));
  const window = bars.filter((c) => c.openTime > since);
  if (!window.length) return null;
  const long = p.direction === "long";
  let status = "open", closedAt = null;
  for (const c of window) {
    if (long ? c.low <= p.stop : c.high >= p.stop) { status = "stopped"; closedAt = c.openTime; break; }
    if (long ? c.high >= p.target : c.low <= p.target) { status = "target"; closedAt = c.openTime; break; }
  }
  const last = window.at(-1).close;
  const movePct = ((last / p.entry) - 1) * 100;
  const openR = (long ? movePct : -movePct) / p.stopPct;
  return {
    symbol: p.symbol, direction: p.direction, entry: p.entry, stop: p.stop, target: p.target,
    status,
    closedAt: closedAt ? new Date(closedAt).toISOString() : null,
    lastPrice: last,
    movePct,
    /** Realised R when closed; marked to market while open. */
    resultR: status === "target" ? RR : status === "stopped" ? -1 : openR,
    hoursHeld: (Date.now() - since) / 3_600_000,
  };
};

const settled = [];
if (prior?.taken?.length) {
  const since = new Date(prior.measuredAt).getTime();
  for (const p of prior.taken) {
    try {
      const r = await settle(p, since);
      if (r) settled.push(r);
    } catch { /* absent rather than guessed */ }
  }
}
const settledSummary = settled.length ? {
  positions: settled.length,
  stopped: settled.filter((s) => s.status === "stopped").length,
  target: settled.filter((s) => s.status === "target").length,
  open: settled.filter((s) => s.status === "open").length,
  medianResultR: median(settled.map((s) => s.resultR)),
  totalResultR: settled.reduce((s, x) => s + x.resultR, 0),
  aheadCount: settled.filter((s) => s.resultR > 0).length,
} : null;

/* ------------------------------------------------------------------ */

const day = new Date().toISOString().slice(0, 10);
const out = {
  measuredAt: new Date().toISOString(),
  day,
  boardScannedAt: BOARD.scannedAt,
  rules: {
    stopAtr: STOP_ATR, rewardRatio: RR, horizonDays: HORIZON, feePct: FEE_PCT,
    minEffectiveN: MIN_EFFECTIVE_N, accountBase: ACCOUNT_BASE, riskPct: RISK_PCT,
    riskPerTradeUsd: (ACCOUNT_BASE * RISK_PCT) / 100,
  },
  breadth,
  context: { btcDominancePct: dominancePct, fearGreed },
  tally: BOARD.tally,
  funnel: { long: funnel("LONG"), short: funnel("SHORT") },
  qualifying: qualifying.length,
  taken,
  declined,
  followed,
  selfTest: SELF_TEST ? {
    measuredAt: SELF_TEST.measuredAt,
    trades: SELF_TEST.results.algorithm?.trades ?? 0,
    rebalances: SELF_TEST.rebalances,
    algorithmNetR: SELF_TEST.results.algorithm?.meanNetR ?? null,
    alwaysShortNetR: SELF_TEST.results.alwaysShort?.meanNetR ?? null,
    alwaysLongNetR: SELF_TEST.results.alwaysLong?.meanNetR ?? null,
    tStat: SELF_TEST.results.algorithm?.tStat ?? null,
    /**
     * Significance per rebalance, not per ticket.
     *
     * Sixty pairs shorted on one morning is one bet on one month, sixty times
     * over. Pooling them reported always-short at t = 5.69 when the honest
     * figure is 1.46 — so the benchmark this column has been measuring itself
     * against is itself indistinguishable from noise, and the column has to
     * say so rather than keep quoting the flattering comparison.
     */
    algorithmTByDate: SELF_TEST.results.algorithm?.tStatByDate ?? null,
    alwaysShortTByDate: SELF_TEST.results.alwaysShort?.tStatByDate ?? null,
    beatsNoThinking: SELF_TEST.versusAlwaysShort?.algorithmBeatsIt ?? null,
  } : null,
  priorEdition: prior ? { day: prior.day, measuredAt: prior.measuredAt, positions: prior.taken.length } : null,
  settled,
  settledSummary,
};
writeFileSync("research/daily-brief.json", `${JSON.stringify(out, null, 2)}\n`);
writeFileSync(`${PLAN_DIR}/${day}.json`, `${JSON.stringify({ day, measuredAt: out.measuredAt, rules: out.rules, taken }, null, 2)}\n`);

console.log(`=== ${day} ===\n`);
console.log(`market: ${breadth.pairs} pairs · ${breadth.up} up / ${breadth.down} down (${breadth.upSharePct.toFixed(1)}% green)`
  + ` · median ${breadth.medianChangePct.toFixed(2)}%`);
console.log(`  ${breadth.downOver5} down >5% · ${breadth.downOver10} down >10% · ${breadth.upOver5} up >5%`);
console.log(`  BTC.D ${dominancePct?.toFixed(2)}% · Fear & Greed ${fearGreed}`);
console.log(`board ${BOARD.scannedAt}: ${JSON.stringify(BOARD.tally)}\n`);

console.log("funnel                    long   short");
const fl = out.funnel.long, fs = out.funnel.short;
for (const [label, a, b] of [["on the board", fl.total, fs.total], ["liquid enough", fl.tradeable, fs.tradeable],
  ["sample not thin", fl.notThin, fs.notThin], ["all 5 windows agree", fl.unanimous, fs.unanimous]]) {
  console.log(`  ${label.padEnd(22)}${String(a).padStart(6)}${String(b).padStart(8)}`);
}

console.log(`\ntaken today: ${taken.length}`);
for (const p of taken) {
  console.log(`  ${p.symbol.padEnd(12)} ${p.bias.padEnd(6)} entry ${p.entry.toPrecision(6)}`
    + `  stop ${p.stop.toPrecision(6)} (${p.stopPct.toFixed(2)}%)  target ${p.target.toPrecision(6)}`
    + `  net ${p.fullNetR.toFixed(3)}R  size $${Math.round(p.positionUsd)}`);
}
for (const d of declined) console.log(`  declined ${d.symbol.padEnd(11)} ${d.reason} (${d.fullNetR.toFixed(3)}R)`);

console.log("\nthe three we follow:");
for (const [s, a] of Object.entries(followed)) {
  console.log(`  ${s.padEnd(9)} ${String(a.price).padStart(10)}  range ${a.rangePosition30d.toFixed(0)}%`
    + `  ${String(a.priceVsValueArea ?? "n/a").padEnd(6)} value area`
    + `  ${a.leaningShort}/${a.lookbackCount} lookbacks short`
    + `  · ${a.verdict.reason}`);
}

if (out.selfTest) {
  const st = out.selfTest;
  console.log(`\npipeline walked forward (${st.rebalances} rebalances, ${st.trades} trades):`);
  console.log(`  algorithm ${st.algorithmNetR.toFixed(4)}R · always short ${st.alwaysShortNetR.toFixed(4)}R`
    + ` · always long ${st.alwaysLongNetR.toFixed(4)}R · t ${st.tStat.toFixed(2)}`
    + ` · beats doing nothing clever: ${st.beatsNoThinking}`);
}

if (settledSummary) {
  console.log(`\nlast edition (${prior.day}), ${settledSummary.positions} positions:`);
  for (const s of settled) {
    console.log(`  ${s.symbol.padEnd(12)} ${s.status.padEnd(8)} ${s.resultR >= 0 ? "+" : ""}${s.resultR.toFixed(3)}R`
      + `  move ${s.movePct.toFixed(2)}%  after ${s.hoursHeld.toFixed(0)}h`);
  }
  console.log(`  ${settledSummary.aheadCount}/${settledSummary.positions} ahead · median ${settledSummary.medianResultR.toFixed(3)}R`
    + ` · total ${settledSummary.totalResultR.toFixed(3)}R`);
} else {
  console.log("\nno prior edition to settle — this is the first.");
}
