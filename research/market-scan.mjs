/**
 * The market scan: every USDT pair, checked against whatever brief arrived.
 *
 * Readers forward quick-scans most mornings — rankings, targets, a stance.
 * This is the file that answers them with the tape rather than with an
 * opinion, and it is arranged around keeping two jobs apart.
 *
 *   The tape. Breadth, the majors, the leaders and the laggards across every
 *   pair rather than a hand-picked list — because the last time this desk
 *   scanned a fixed roster it missed most of the day's movers, and the fix was
 *   to derive the universe from the market on every run.
 *
 *   The claims. Each number the brief asserts, written down at the top of this
 *   file before anything is fetched, then checked. A 24-hour change is a
 *   rolling window, so a claim about one is only meaningful with a timestamp;
 *   both are stored.
 *
 * What this file deliberately does NOT do is write a plan.
 *
 * data/plans/<date>.json is the ledger the next edition settles against, and
 * it is written by research/daily-brief.mjs at the top of the day. Re-running
 * the planner from here would replace those entries with later ones — the same
 * positions, reopened after the move they were wrong about, at prices that
 * flatter them. That is a rewrite of the scorecard, not a re-scan.
 *
 * Claims about mechanism get a mechanism check. A squeeze that has run its
 * course leaves funding positive and expensive for longs, so funding is
 * fetched live rather than from the monthly dumps — those stop at the last
 * complete month, and were once labelled "current" here while three weeks
 * stale.
 *
 * Writes research/market-scan-<date>.json.
 *
 * Dated, not overwritten. research/market-scan.json is the evidence behind a
 * published post; rewriting it each morning would silently change the figures
 * a reader is invited to check. A snapshot a post cites has to stay the
 * snapshot that post cited.
 */

import { existsSync, readFileSync, readdirSync, writeFileSync } from "node:fs";

const retry = async (fn, n = 5) => {
  let last;
  for (let i = 0; i < n; i++) {
    try { return await fn(); } catch (e) { last = e; await new Promise((r) => setTimeout(r, 900 * (i + 1))); }
  }
  throw last;
};

const j = async (url) => retry(async () => {
  const r = await fetch(url, { signal: AbortSignal.timeout(30_000) });
  if (!r.ok) throw new Error(`${url} -> ${r.status}`);
  return r.json();
});

const median = (xs) => {
  if (!xs.length) return null;
  const s = [...xs].sort((a, b) => a - b);
  const m = s.length >> 1;
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};

/* ------------------------------------------------------------------ *
 * What the forwarded brief asserted, written down before any fetch
 * ------------------------------------------------------------------ */

const CLAIMS = [
  { symbol: "BTCUSDT", label: "BTC", kind: "band", lowUsd: 77_000, highUsd: 78_000, text: "holding $77k-78k" },
  { symbol: "ICPUSDT", label: "ICP", kind: "floor", floorUsd: 2.50, text: "broke $2.50, pulling back healthily" },
];

/** Its read on where the market's leadership sits. */
const CLAIMED_DOMINANCE = { lowPct: 59, highPct: 60 };

/** The ordering the brief asserts among the names it ranks. */
const RANKED = ["ICPUSDT", "ENAUSDT", "XRPUSDT"];

/** Its claim that clean early setups are scarce, as a countable statement. */
const CLAIMED_RUNNERS = { lowPct: 20, highPct: 40, text: "few clean early-stage setups left" };

/* ------------------------------------------------------------------ *
 * 1. The tape, across every pair
 * ------------------------------------------------------------------ */

const tickers = await j("https://data-api.binance.vision/api/v3/ticker/24hr");
const measuredAt = new Date().toISOString();

const usdt = tickers
  .filter((t) => t.symbol.endsWith("USDT") && Number(t.quoteVolume) > 0)
  .map((t) => ({
    symbol: t.symbol,
    price: Number(t.lastPrice),
    changePct: Number(t.priceChangePercent),
    high: Number(t.highPrice),
    low: Number(t.lowPrice),
    turnoverUsd: Number(t.quoteVolume),
  }));

const changes = usdt.map((t) => t.changePct);
const breadth = {
  pairs: usdt.length,
  up: changes.filter((c) => c > 0).length,
  down: changes.filter((c) => c <= 0).length,
  upSharePct: (changes.filter((c) => c > 0).length / changes.length) * 100,
  downSharePct: (changes.filter((c) => c <= 0).length / changes.length) * 100,
  medianChangePct: median(changes),
  upOver5: changes.filter((c) => c > 5).length,
  upOver10: changes.filter((c) => c > 10).length,
  upOver20: changes.filter((c) => c > 20).length,
  upOver30: changes.filter((c) => c > 30).length,
  downOver5: changes.filter((c) => c < -5).length,
  downOver10: changes.filter((c) => c < -10).length,
};

/**
 * How far the market has come off its own highs.
 *
 * "Holding the highs" is the brief's central claim about state, and it is
 * checkable without an opinion: the distance from each pair's 24-hour high,
 * taken across the whole exchange. A market still pinned at its top and a
 * market that has already given back a third of the move look identical in a
 * breadth number and completely different here.
 */
const offHigh = usdt.map((t) => (t.high > 0 ? ((t.price / t.high) - 1) * 100 : 0));
const retrace = {
  medianOffHighPct: median(offHigh),
  withinOnePctOfHigh: offHigh.filter((d) => d > -1).length,
  moreThanFivePctOffHigh: offHigh.filter((d) => d < -5).length,
};

/**
 * The morning edition's reading of the same market, for the delta.
 *
 * A second scan on the same day is only worth publishing if it says something
 * the first did not, and the honest way to show that is to put the two breadth
 * numbers side by side rather than to describe the change in adjectives.
 */
const morning = existsSync("research/daily-brief.json")
  ? JSON.parse(readFileSync("research/daily-brief.json", "utf8"))
  : null;

/* ------------------------------------------------------------------ *
 * 2. The claims
 * ------------------------------------------------------------------ */

const bySymbol = new Map(usdt.map((t) => [t.symbol, t]));

const checked = CLAIMS.map((c) => {
  const t = bySymbol.get(c.symbol);
  if (!t) return { ...c, verdict: "not listed" };
  const base = { ...c, actualPrice: t.price, actualChangePct: t.changePct, high24h: t.high };
  if (c.kind === "floor") {
    return { ...base, inRange: t.price >= c.floorUsd, missPct: ((t.price / c.floorUsd) - 1) * 100 };
  }
  if (c.kind === "band") {
    const inRange = t.price >= c.lowUsd && t.price <= c.highUsd;
    return { ...base, inRange, missPct: inRange ? 0 : ((t.price / (t.price > c.highUsd ? c.highUsd : c.lowUsd)) - 1) * 100 };
  }
  const inRange = t.changePct >= c.lowPct && t.changePct <= c.highPct;
  return {
    ...base, inRange,
    missPct: inRange ? 0 : t.changePct - (t.changePct > c.highPct ? c.highPct : c.lowPct),
  };
});

const ranked = RANKED.map((s) => bySymbol.get(s)).filter(Boolean)
  .map((t) => ({ symbol: t.symbol, price: t.price, changePct: t.changePct }))
  .sort((a, b) => b.changePct - a.changePct);

/**
 * The FOMO claim, as a population rather than an anecdote.
 *
 * "Alts already +20-30%" is checkable across the exchange: how many pairs are
 * actually in that band, how many are past it, and how many liquid ones. The
 * liquidity floor matters because a +40% move on 200k of turnover is not a
 * market anyone can act on, and counting it would inflate the warning.
 */
const LIQUID_FLOOR_USD = 2e6;
const runners = {
  ...CLAIMED_RUNNERS,
  inBand: usdt.filter((t) => t.changePct >= CLAIMED_RUNNERS.lowPct && t.changePct <= CLAIMED_RUNNERS.highPct).length,
  aboveBand: usdt.filter((t) => t.changePct > CLAIMED_RUNNERS.highPct).length,
  inBandLiquid: usdt.filter((t) => t.changePct >= CLAIMED_RUNNERS.lowPct && t.turnoverUsd >= LIQUID_FLOOR_USD).length,
  liquidFloorUsd: LIQUID_FLOOR_USD,
};

/** Leaders and laggards drawn from the whole exchange, above the liquidity floor. */
const liquid = usdt.filter((t) => t.turnoverUsd >= LIQUID_FLOOR_USD);
/**
 * Turnover is stored in millions as well as in full.
 *
 * Posts quote "$24M", and the verifier requires every figure above a hundred
 * to appear in a cited snapshot. A value the write-up derives by dividing is
 * one the gate cannot trace, so the snapshot carries the published form too.
 */
const top = (arr, n) => arr.slice(0, n).map((t) => ({
  symbol: t.symbol, changePct: t.changePct, price: t.price,
  turnoverUsd: t.turnoverUsd,
  // "$24M" is read by the gate as 24,000,000, so the rounded figure is stored
  // at the magnitude the post prints it — not as the bare 24.
  turnoverUsdRounded: Math.round(t.turnoverUsd / 1e6) * 1e6,
}));
const leaders = top([...liquid].sort((a, b) => b.changePct - a.changePct), 10);
const laggards = top([...liquid].sort((a, b) => a.changePct - b.changePct), 10);

/**
 * Whether the names the brief ranks are actually the market's leaders.
 *
 * This is the check that caught the last forwarded scan: its third-ranked name
 * was outrun by something it never mentioned. A ranking is only useful if the
 * universe it ranks over is the market, and that is testable.
 */
const rankedLeadRank = ranked.length
  ? [...liquid].sort((a, b) => b.changePct - a.changePct)
      .findIndex((t) => t.symbol === ranked[0].symbol) + 1
  : null;

/* ------------------------------------------------------------------ *
 * 3. The mechanism claim: was this a squeeze, and is it paid for
 * ------------------------------------------------------------------ */

const FUNDING = ["BTC-USDT-SWAP", "ETH-USDT-SWAP", "XRP-USDT-SWAP", "ICP-USDT-SWAP"];
const funding = [];
for (const inst of FUNDING) {
  try {
    const d = (await j(`https://www.okx.com/api/v5/public/funding-rate?instId=${inst}`)).data[0];
    funding.push({
      instrument: inst,
      venue: "OKX perpetual",
      ratePct: Number(d.fundingRate) * 100,
      annualisedPct: Number(d.fundingRate) * 100 * 3 * 365,
      nextFundingTime: new Date(Number(d.nextFundingTime)).toISOString(),
    });
  } catch { /* absent rather than guessed */ }
}

/**
 * The sentiment reading the brief quotes, fetched rather than taken on trust.
 *
 * It is one of the few figures in a forwarded scan that has a single canonical
 * source, so there is no excuse for repeating it unchecked.
 */
let dominancePct = null;
try {
  dominancePct = (await j("https://api.coingecko.com/api/v3/global")).data.market_cap_percentage.btc;
} catch { /* absent rather than guessed */ }

let fearGreed = null;
try {
  const d = (await j("https://api.alternative.me/fng/?limit=1")).data[0];
  fearGreed = { value: Number(d.value), label: d.value_classification, source: "alternative.me" };
} catch { /* absent rather than guessed */ }

/* ------------------------------------------------------------------ *
 * 4. What this desk's own engine says right now
 * ------------------------------------------------------------------ */

/**
 * The board, re-scanned this evening.
 *
 * This is the part the reader who asked "why did it not warn" is owed. The
 * engine's shortest input is a 180-day window and its score is a median, so
 * the interesting question is not what it recommends but whether the biggest
 * up-move of the year moved it at all. The answer is a count, not an opinion.
 */
const board = existsSync("site/signals.json")
  ? JSON.parse(readFileSync("site/signals.json", "utf8"))
  : null;

const rows = board?.signals ?? [];

/** Independent episodes below which the engine already calls a row thin. */
const MIN_EFFECTIVE_N = 12;
const effectiveNOf = (r) => r.recent?.[r.side]?.best?.effectiveN ?? null;

/**
 * The funnel, counted separately for each direction.
 *
 * This is the part that answers the question a reader asked this morning —
 * why nothing warned when the market turned — and the answer is not the one
 * given then. The raw bias was never the problem: the board read LONG on most
 * rows through the entire move. What happened is downstream of the bias.
 *
 * Each stage is counted rather than described, because the shape of the loss
 * is the finding. A filter that discards nine tenths of one direction and a
 * tenth of the other is not a quality filter, whatever it was built to be.
 *
 * The five agreement windows span 180 to 730 days. A direction that has only
 * begun to pay in the last few weeks cannot clear them by construction — it
 * has not existed for long enough to appear in four of the five. That is the
 * intended behaviour: the filter exists to reject findings that live inside a
 * single lookback. The cost, which had not been counted until now, is that the
 * same rule makes a change of trend permanently inadmissible.
 */
const funnelFor = (bias) => {
  const all = rows.filter((r) => r.bias === bias);
  const fiveWindows = all.filter((r) => r.agreement?.windows === 5);
  const unanimous = fiveWindows.filter((r) => r.agreement?.agreeing === 5);
  const deepEnough = unanimous.filter((r) => (effectiveNOf(r) ?? 0) >= MIN_EFFECTIVE_N);
  const liquid_ = deepEnough.filter((r) => r.turnoverUsd >= LIQUID_FLOOR_USD);
  return {
    bias,
    rows: all.length,
    haveFiveWindows: fiveWindows.length,
    unanimous: unanimous.length,
    unanimousSharePct: fiveWindows.length ? (unanimous.length / fiveWindows.length) * 100 : null,
    deepEnough: deepEnough.length,
    offered: liquid_.length,
    symbols: liquid_.map((r) => r.symbol),
  };
};

const engine = board ? {
  scannedAt: board.scannedAt ?? null,
  rows: rows.length,
  tally: board.tally ?? null,
  minEffectiveN: MIN_EFFECTIVE_N,
  agreementWindowDays: [180, 270, 365, 540, 730],
  funnel: [funnelFor("LONG"), funnelFor("SHORT")],
  /**
   * How many rows even have enough history to be judged.
   *
   * A pair listed eighteen months ago cannot fill a 730-day window, so its
   * agreement count is zero and it is rejected for a reason that has nothing
   * to do with its signal. Counting this separately keeps the asymmetry above
   * from being blamed on something it is not.
   */
  rowsWithFiveWindows: rows.filter((r) => r.agreement?.windows === 5).length,
} : null;

/**
 * The same two numbers, every archived scan since the board started keeping them.
 *
 * One evening's funnel could be a fluke of one evening. What makes it a
 * property of the machine rather than of today is the pair of columns below:
 * the share of rows the engine read LONG, against the direction of every
 * position the column actually offered on the same date.
 *
 * The archive is read rather than remembered. Each scan was written at the
 * time it ran and committed, so this is a record, not a reconstruction.
 */
const SCAN_DIR = "site/signals-archive/scans";
const boardHistory = existsSync(SCAN_DIR)
  ? readdirSync(SCAN_DIR).filter((f) => f.endsWith(".json")).sort().map((f) => {
      const s = JSON.parse(readFileSync(`${SCAN_DIR}/${f}`, "utf8"));
      const day = s.scannedAt.slice(0, 10);
      const planPath = `data/plans/${day}.json`;
      const plan = existsSync(planPath) ? JSON.parse(readFileSync(planPath, "utf8")) : null;
      const taken = plan?.taken ?? [];
      return {
        scannedAt: s.scannedAt,
        day,
        rows: s.tally.total,
        long: s.tally.LONG,
        short: s.tally.SHORT,
        longSharePct: (s.tally.LONG / s.tally.total) * 100,
        offered: taken.length,
        offeredDirections: [...new Set(taken.map((t) => t.direction))],
      };
    })
  : [];

/**
 * The count the argument rests on, derived rather than asserted in prose.
 *
 * A sentence that says "every position was short" is a claim about a file the
 * reader cannot see. A number computed from that file, printed beside the
 * total it was drawn from, is one they can check.
 */
/**
 * One edition per day, not one per scan.
 *
 * Two scans ran on 14 August and two on 20 August, and each reads the same
 * four positions out of that day's single plan file. Counting rows would
 * report thirty-two positions where twenty-four were taken — the same
 * double-count that once turned a t of 1.46 into 5.69 on this desk by scoring
 * one rebalance sixty times. The plan file is the unit, so the day is the key.
 */
const byDay = new Map();
for (const h of boardHistory) byDay.set(h.day, h);
const offeredEver = [...byDay.values()].filter((h) => h.offered > 0);
const boardSummary = offeredEver.length ? {
  editions: offeredEver.length,
  positions: offeredEver.reduce((a, h) => a + h.offered, 0),
  editionsOfferingAnyLong: offeredEver.filter((h) => h.offeredDirections.includes("long")).length,
  longSharePctFirst: offeredEver[0].longSharePct,
  longSharePctLast: offeredEver.at(-1).longSharePct,
  firstDay: offeredEver[0].day,
  lastDay: offeredEver.at(-1).day,
} : null;

/* ------------------------------------------------------------------ *
 * 5. The base rates that apply to the brief's advice
 * ------------------------------------------------------------------ */

/**
 * "Do not chase, wait for a pullback, watch the reaction at the highs" is a
 * short-horizon continuation judgement, and this desk has measured that family
 * rather than argued about it. The measurement travels with the scan so the
 * advice cannot be quoted without it.
 */
const ev = existsSync("research/event-window.json")
  ? JSON.parse(readFileSync("research/event-window.json", "utf8")) : null;
const pers = existsSync("research/persistence.json")
  ? JSON.parse(readFileSync("research/persistence.json", "utf8")) : null;

const baseRates = {
  continuation1dPct: ev?.baseRate?.find((r) => r.horizonDays === 1)?.sameDirectionPct ?? null,
  continuation2dPct: ev?.baseRate?.find((r) => r.horizonDays === 2)?.sameDirectionPct ?? null,
  continuation3dPct: ev?.baseRate?.find((r) => r.horizonDays === 3)?.sameDirectionPct ?? null,
  continuation3dWindows: ev?.baseRate?.find((r) => r.horizonDays === 3)?.windows ?? null,
  persistence10dPct: pers?.persistence?.["10"]?.matchPct ?? null,
  persistence30dPct: pers?.persistence?.["30"]?.matchPct ?? null,
};

/**
 * The previous run of the same day, if there was one.
 *
 * A 24-hour change is a rolling window: ENA read +25.19% on one pass and
 * +26.06% eight minutes later, crossing out of a claimed band in between. The
 * brief did not change; the window moved. Carrying the earlier reading forward
 * means a post can say that and have the figure traceable, instead of the
 * drift being invisible or quietly rounded away.
 */
const OUT_PATH_EARLY = `research/market-scan-${new Date().toISOString().slice(0, 10)}.json`;
const previousRun = existsSync(OUT_PATH_EARLY)
  ? (() => {
      const prev = JSON.parse(readFileSync(OUT_PATH_EARLY, "utf8"));
      return {
        measuredAt: prev.measuredAt,
        claimsInRange: prev.claimsInRange,
        claimsChecked: prev.claimsChecked.map((c) => ({
          label: c.label, inRange: c.inRange,
          actualChangePct: c.actualChangePct ?? null,
          actualPrice: c.actualPrice ?? null,
        })),
      };
    })()
  : null;

const out = {
  measuredAt,
  previousRun,
  source: "Binance spot 24hr tickers (rolling window); OKX perpetual funding",
  note: "Intraday scan. Writes no plan file — the morning ledger stands.",
  breadth,
  retrace,
  morningComparison: morning ? {
    day: morning.day,
    measuredAt: morning.measuredAt ?? null,
    upSharePct: morning.breadth.upSharePct,
    medianChangePct: morning.breadth.medianChangePct,
    upSharePctDelta: breadth.upSharePct - morning.breadth.upSharePct,
    medianChangePctDelta: breadth.medianChangePct - morning.breadth.medianChangePct,
    bookStopped: morning.bookSummary?.stopped ?? null,
    bookPositions: morning.bookSummary?.positions ?? null,
    bookTotalR: morning.bookSummary?.totalResultR ?? null,
  } : null,
  claimsChecked: checked,
  claimsInRange: checked.filter((c) => c.inRange).length,
  claimsTotal: checked.length,
  ranked,
  rankedLeadRank,
  runners,
  leaders,
  laggards,
  funding,
  fearGreed,
  dominancePct,
  claimedDominance: CLAIMED_DOMINANCE,
  engine,
  boardHistory,
  boardSummary,
  baseRates,
};

const OUT_PATH = `research/market-scan-${measuredAt.slice(0, 10)}.json`;
writeFileSync(OUT_PATH, `${JSON.stringify(out, null, 2)}\n`);

/* ------------------------------------------------------------------ *
 * Printed the way it would be read aloud
 * ------------------------------------------------------------------ */

const f = (v, dp = 2) => (v == null ? "—" : (v >= 0 ? "+" : "") + v.toFixed(dp));
/**
 * Prices span eight orders of magnitude here, so one rounding rule cannot
 * serve them. Whole dollars above a dollar; significant digits below, because
 * rounding 0.0038 to the nearest dollar prints "$0" and erases the claim.
 */
const money = (v) => {
  const a = Math.abs(v);
  if (a >= 1000) return Math.round(v).toLocaleString("en-US");
  if (a >= 1) return Number(v.toFixed(2)).toString();
  return Number(v.toPrecision(3)).toString();
};

console.log(`market scan ${measuredAt}\n`);

console.log("breadth, every USDT pair");
console.log(`  ${breadth.pairs} pairs   ${breadth.upSharePct.toFixed(1)}% up   median ${f(breadth.medianChangePct)}%`);
console.log(`  up >5%: ${breadth.upOver5}   >10%: ${breadth.upOver10}   >20%: ${breadth.upOver20}   >30%: ${breadth.upOver30}`);
console.log(`  down >5%: ${breadth.downOver5}   >10%: ${breadth.downOver10}`);
console.log(`  median distance from the 24h high: ${f(retrace.medianOffHighPct)}%`
  + `   (${retrace.withinOnePctOfHigh} pairs within 1% of it, ${retrace.moreThanFivePctOffHigh} more than 5% below)`);

if (out.morningComparison) {
  const m = out.morningComparison;
  console.log(`\nagainst this morning's edition (${m.day})`);
  console.log(`  up share ${m.upSharePct.toFixed(1)}% -> ${breadth.upSharePct.toFixed(1)}%   (${f(m.upSharePctDelta, 1)}pp)`);
  console.log(`  median   ${f(m.medianChangePct)}% -> ${f(breadth.medianChangePct)}%   (${f(m.medianChangePctDelta)}pp)`);
}

console.log("\nclaims that carry a number");
for (const c of checked) {
  const claimed = c.kind === "floor" ? `above $${money(c.floorUsd)}`
    : c.kind === "band" ? `$${money(c.lowUsd)}-${money(c.highUsd)}`
    : `${c.lowPct}-${c.highPct}%`;
  const actual = c.kind === "change" ? `${f(c.actualChangePct)}%` : `$${money(c.actualPrice)}`;
  console.log(`  ${c.label.padEnd(5)} claimed ${claimed.padEnd(16)} actual ${actual.padEnd(12)}`
    + (c.inRange ? "in range" : `OUTSIDE by ${f(c.missPct, 1)}${c.kind === "change" ? "pp" : "%"}`));
}
console.log(`\n  ${out.claimsInRange} of ${out.claimsTotal} land in their stated range`);

console.log("\nthe ordering it asserted, against the tape");
for (const [i, r] of ranked.entries()) {
  console.log(`  ${i + 1}. ${r.symbol.replace("USDT", "").padEnd(6)}${f(r.changePct).padStart(8)}%`);
}
if (rankedLeadRank) console.log(`  its leader ranks ${rankedLeadRank} of ${liquid.length} liquid pairs exchange-wide`);

console.log(`\nits FOMO warning, counted: ${runners.inBand} pairs are ${runners.lowPct}-${runners.highPct}%,`
  + ` ${runners.aboveBand} are past ${runners.highPct}%`
  + ` (${runners.inBandLiquid} above $${(LIQUID_FLOOR_USD / 1e6).toFixed(0)}M turnover)`);

console.log("\nleaders, whole exchange, above the liquidity floor");
for (const [i, t] of leaders.entries()) {
  console.log(`  ${String(i + 1).padStart(2)}. ${t.symbol.replace("USDT", "").padEnd(8)}${f(t.changePct).padStart(8)}%`
    + `   $${(t.turnoverUsd / 1e6).toFixed(0)}M`);
}
console.log("\nlaggards, same floor");
for (const [i, t] of laggards.entries()) {
  console.log(`  ${String(i + 1).padStart(2)}. ${t.symbol.replace("USDT", "").padEnd(8)}${f(t.changePct).padStart(8)}%`
    + `   $${(t.turnoverUsd / 1e6).toFixed(0)}M`);
}

if (funding.length) {
  console.log("\nwho is paying whom, right now");
  for (const r of funding) {
    console.log(`  ${r.instrument.replace("-USDT-SWAP", "").padEnd(5)}${f(r.ratePct, 4)}% per interval`
      + `   ${f(r.annualisedPct, 1)}% annualised`);
  }
}

if (dominancePct != null) {
  const inBand = dominancePct >= CLAIMED_DOMINANCE.lowPct && dominancePct <= CLAIMED_DOMINANCE.highPct;
  console.log(`\nBTC dominance: ${dominancePct.toFixed(2)}%  (claimed ${CLAIMED_DOMINANCE.lowPct}-${CLAIMED_DOMINANCE.highPct}% — ${inBand ? "in range" : "outside"})`);
}
if (fearGreed) console.log(`fear & greed: ${fearGreed.value} (${fearGreed.label})`);

if (engine) {
  const t = engine.tally ?? {};
  console.log(`\nmy own board, rescanned ${engine.scannedAt} (${engine.rows} rows)`);
  console.log(`  raw bias:  LONG ${t.LONG}   SHORT ${t.SHORT}   WAIT ${t.WAIT}`);
  console.log(`  ${engine.rowsWithFiveWindows} of ${engine.rows} rows have enough history for all five lookback windows\n`);
  console.log("  where each direction dies");
  console.log(`  ${"".padEnd(7)}${"rows".padStart(6)}${"5 windows".padStart(11)}${"unanimous".padStart(11)}${"n>=12".padStart(8)}${"offered".padStart(9)}`);
  for (const f of engine.funnel) {
    console.log(`  ${f.bias.padEnd(7)}${String(f.rows).padStart(6)}${String(f.haveFiveWindows).padStart(11)}`
      + `${String(f.unanimous).padStart(11)}${String(f.deepEnough).padStart(8)}${String(f.offered).padStart(9)}`
      + (f.symbols.length ? `   ${f.symbols.map((s) => s.replace("USDT", "")).join(" ")}` : ""));
  }
  const [lng, sht] = engine.funnel;
  console.log(`\n  agreement passes ${lng.unanimousSharePct?.toFixed(0)}% of long rows and ${sht.unanimousSharePct?.toFixed(0)}% of short rows`);
}

const b = baseRates;
console.log("\nthe base rates that apply to its advice");
console.log(`  continuation: ${b.continuation1dPct?.toFixed(1)}% at 1 day, ${b.continuation2dPct?.toFixed(1)}% at 2, ${b.continuation3dPct?.toFixed(1)}% at 3`);
console.log(`  direction persistence: ${b.persistence10dPct?.toFixed(2)}% at 10 days, ${b.persistence30dPct?.toFixed(2)}% at 30`);
