/**
 * A forwarded quick-scan, checked — on the day my own board lost everything.
 *
 * The brief is bullish-leaning: alts leading, ETH the momentum leader, protect
 * profits, wait for a BTC retest before adding. My board spent six editions
 * short and had nineteen of twenty positions stopped on this exact move.
 *
 * So this audit has an obvious failure mode and it is not the usual one. The
 * temptation is not to be too harsh; it is to be defensive — to pick at the
 * figures of a read that was directionally closer to right than mine while my
 * own ledger sits at -19.479R. Conceding that plainly is the first thing this
 * file records, before any check runs.
 *
 * What can then be tested is narrower and more useful than "who was right".
 *
 *   The figures. Prices and 24-hour moves are checkable to the decimal, so
 *   they are checked and the misses named.
 *
 *   The sources. A liquidation total cannot be verified from here at all, and
 *   saying so is more honest than repeating it.
 *
 *   The procedure. "Wait for the retest, then enter" and "bull case above
 *   68.5k, bear case below 68k" are level-based continuation rules. That family
 *   was measured yesterday at 42-51% over one to three days, and direction
 *   persistence at ten days is 49.55%. A read being right today says nothing
 *   about a procedure whose base rate is a coin toss.
 *
 *   And the symmetry. Two days ago this desk refused to credit its own board
 *   for being 4 of 4 ahead, because 78.5% of the market had moved the same way.
 *   Today 69.4% of the market rose. The same discount has to apply to a bullish
 *   call, or the rule was never a rule.
 */

import { existsSync, readFileSync, writeFileSync } from "node:fs";

const j = async (u) => {
  const r = await fetch(u, { signal: AbortSignal.timeout(30_000) });
  if (!r.ok) throw new Error(`${u} -> ${r.status}`);
  return r.json();
};

/** Exactly what the brief asserted, written down before anything was fetched. */
const CLAIMS = [
  { symbol: "BTCUSDT", label: "BTC", kind: "price", lowUsd: 69_500, highUsd: 69_800 },
  { symbol: "ETHUSDT", label: "ETH", kind: "change", lowPct: 17, highPct: 18 },
  { symbol: "SOLUSDT", label: "SOL", kind: "change", lowPct: 11, highPct: 12 },
];
/**
 * The levels the strategy hangs on, quoted so the post can cite them.
 *
 * A plan built on price levels is only as current as those levels, and stating
 * them here lets the write-up show how far spot has already travelled past the
 * framework rather than asserting it.
 */
const CLAIMED_LEVELS = { retestLowUsd: 68_200, retestHighUsd: 68_700, invalidationUsd: 68_000 };

/**
 * A figure the brief asserts that no source here can confirm.
 *
 * Recorded as a quotation rather than a measurement, so the write-up can name
 * what was claimed while making clear it is unverified. The alternative — not
 * recording it — would leave the post unable to say what it is declining to
 * repeat, which is worse than saying so.
 */
const CLAIMED_UNVERIFIED = { liquidations24hUsdBn: 2.6, verified: false };

/** Qualitative calls, checked as an ordering rather than as a number. */
const LEADERS = ["ETHUSDT", "SOLUSDT", "ARBUSDT", "ENAUSDT", "BNBUSDT"];

const tickers = await j("https://data-api.binance.vision/api/v3/ticker/24hr");
const bySymbol = new Map(tickers.map((t) => [t.symbol, t]));

const read = (symbol) => {
  const t = bySymbol.get(symbol);
  if (!t) return null;
  return {
    symbol,
    price: Number(t.lastPrice),
    changePct: Number(t.priceChangePercent),
    low: Number(t.lowPrice),
    high: Number(t.highPrice),
  };
};

const checked = CLAIMS.map((c) => {
  const actual = read(c.symbol);
  if (!actual) return { ...c, verdict: "not listed" };
  if (c.kind === "price") {
    const inRange = actual.price >= c.lowUsd && actual.price <= c.highUsd;
    return {
      ...c, actualPrice: actual.price, actualChangePct: actual.changePct,
      inRange, missUsd: inRange ? 0 : actual.price - c.highUsd,
      missPct: inRange ? 0 : ((actual.price / c.highUsd) - 1) * 100,
    };
  }
  const inRange = actual.changePct >= c.lowPct && actual.changePct <= c.highPct;
  return {
    ...c, actualChangePct: actual.changePct, actualPrice: actual.price,
    inRange, missPct: inRange ? 0 : actual.changePct - c.highPct,
  };
});

const leaderboard = LEADERS.map(read).filter(Boolean)
  .sort((a, b) => b.changePct - a.changePct);

/** HYPE is not a Binance spot pair; the brief named it, so it is fetched where it trades. */
let hype = null;
try {
  const t = (await j("https://www.okx.com/api/v5/market/ticker?instId=HYPE-USDT-SWAP")).data[0];
  hype = {
    venue: "OKX perpetual",
    price: Number(t.last),
    changePct: (Number(t.last) / Number(t.open24h) - 1) * 100,
  };
} catch { /* absent rather than guessed */ }

/**
 * Sources the brief leaned on that cannot be reached from here.
 *
 * Recorded with the status each returned, so the write-up can say why a figure
 * is unverified without that becoming an assertion of its own.
 */
const unreachable = [];
for (const [name, url] of [
  ["CoinGlass, liquidation totals", "https://api.coinglass.com/api/pro/v1/futures/liquidation_chart"],
  ["Binance futures API, open interest", "https://fapi.binance.com/futures/data/openInterestHist?symbol=BTCUSDT"],
]) {
  try {
    const r = await fetch(url, { signal: AbortSignal.timeout(15_000) });
    unreachable.push({ name, status: r.status });
  } catch {
    unreachable.push({ name, status: 0, note: "no response" });
  }
}

/* ---- what this desk did on the same move, and what it has measured ---- */
const brief = existsSync("research/daily-brief.json")
  ? JSON.parse(readFileSync("research/daily-brief.json", "utf8")) : null;
const persistence = existsSync("research/persistence.json")
  ? JSON.parse(readFileSync("research/persistence.json", "utf8")) : null;
const eventWindow = existsSync("research/event-window.json")
  ? JSON.parse(readFileSync("research/event-window.json", "utf8")) : null;

const out = {
  measuredAt: new Date().toISOString(),
  source: "Binance spot 24hr tickers; OKX for pairs Binance spot does not list",
  claimsChecked: checked,
  claimsInRange: checked.filter((c) => c.inRange).length,
  claimsTotal: checked.length,
  leaderboard,
  hype,
  unreachable,
  /** The concession, stored so the post cannot quietly drop it. */
  ownResult: brief ? {
    day: brief.day,
    upSharePct: brief.breadth.upSharePct,
    medianChangePct: brief.breadth.medianChangePct,
    ourPositions: brief.bookSummary?.positions ?? null,
    ourStopped: brief.bookSummary?.stopped ?? null,
    ourAhead: brief.bookSummary?.aheadCount ?? null,
    ourTotalR: brief.bookSummary?.totalResultR ?? null,
    ourBiasToday: brief.taken?.length ? brief.taken[0].direction : null,
  } : null,
  claimedLevels: CLAIMED_LEVELS,
  claimedUnverified: CLAIMED_UNVERIFIED,
  /**
   * The discount this desk applied to its own good day, read back out of the
   * post that applied it rather than retyped — so the symmetry the write-up
   * claims can be checked against what was actually published.
   */
  priorDisclosure: (() => {
    const path = "drafts/brief-2026-08-18.txt";
    if (!existsSync(path)) return null;
    const m = readFileSync(path, "utf8").match(/\*\*([\d.]+)% of the market moved the same way\*\*/);
    return m ? { day: "2026-08-18", withPositionsPct: Number(m[1]), source: path } : null;
  })(),
  /** The measurements that apply to the brief's procedure, not to its call. */
  procedure: {
    persistence30dPct: persistence?.persistence?.["30"]?.matchPct ?? null,
    persistence10dPct: persistence?.persistence?.["10"]?.matchPct ?? null,
    continuation1dPct: eventWindow?.baseRate?.find((r) => r.horizonDays === 1)?.sameDirectionPct ?? null,
    continuation3dPct: eventWindow?.baseRate?.find((r) => r.horizonDays === 3)?.sameDirectionPct ?? null,
  },
};
writeFileSync("research/grok-check.json", `${JSON.stringify(out, null, 2)}\n`);

const f = (v, dp = 2) => (v == null ? "—" : (v >= 0 ? "+" : "") + v.toFixed(dp));
console.log("claims that carry a number\n");
for (const c of checked) {
  if (c.kind === "price") {
    console.log(`  ${c.label.padEnd(5)} claimed $${c.lowUsd.toLocaleString("en-US")}-${c.highUsd.toLocaleString("en-US")}`
      + `   actual $${Math.round(c.actualPrice).toLocaleString("en-US")}`
      + `   ${c.inRange ? "in range" : `OUTSIDE by ${f(c.missPct, 1)}%`}`);
  } else {
    console.log(`  ${c.label.padEnd(5)} claimed ${c.lowPct}-${c.highPct}%`
      + `             actual ${f(c.actualChangePct)}%`
      + `   ${c.inRange ? "in range" : `OUTSIDE by ${f(c.missPct, 1)}pp`}`);
  }
}

console.log(`\n${out.claimsInRange} of ${out.claimsTotal} numeric claims land in their stated range\n`);

console.log("the ordering the brief asserted, against the tape");
for (const [i, r] of leaderboard.entries()) {
  console.log(`  ${i + 1}. ${r.symbol.replace("USDT", "").padEnd(6)}${f(r.changePct).padStart(8)}%`);
}
if (hype) console.log(`  HYPE (${hype.venue}): ${f(hype.changePct)}%`);

console.log("\nsources it leaned on that cannot be checked from here");
for (const u of unreachable) console.log(`  ${String(u.status).padEnd(5)}${u.name}`);

if (out.ownResult) {
  const o = out.ownResult;
  console.log(`\nwhat my own board did on this move (${o.day})`);
  console.log(`  market ${o.upSharePct.toFixed(1)}% green, median ${f(o.medianChangePct)}%`);
  console.log(`  my book: ${o.ourStopped} of ${o.ourPositions} stopped, ${o.ourAhead} ahead, ${f(o.ourTotalR, 3)}R`);
}

const p = out.procedure;
console.log(`\nthe procedure it recommends, measured`);
console.log(`  direction persistence: ${p.persistence30dPct?.toFixed(2)}% at a month, ${p.persistence10dPct?.toFixed(2)}% at ten days`);
console.log(`  continuation: ${p.continuation1dPct?.toFixed(1)}% at one day, ${p.continuation3dPct?.toFixed(1)}% at three`);
