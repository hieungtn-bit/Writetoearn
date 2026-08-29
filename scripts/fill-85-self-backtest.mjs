/**
 * Post 85 — walking this desk's whole pipeline forward, and losing to a rule
 * with no thinking in it.
 *
 * Every test published this week took one component apart. None tested what
 * they add up to, which is the thing that now decides what appears in the daily
 * column I launched yesterday. So the pipeline was walked forward across 11
 * non-overlapping rebalances with strict as-of slicing.
 *
 * It lost. Shorting every liquid pair at the same geometry, with no signal, no
 * filters and no board, returned +0.3217R per trade against the algorithm's
 * -0.0428R — on twenty-seven times as many trades and a t-statistic of 4.94
 * against -0.13.
 *
 * The post has to do two hard things at once and they pull against each other.
 * It has to report that plainly, the day after launching a column built on the
 * pipeline. And it has to refuse the conclusion that "always short" is the
 * answer, because always-long lost almost exactly the mirror image — the whole
 * effect is one falling window, not a discovery, and swapping to it would be
 * the same overfitting in a more embarrassing direction.
 *
 * The bug found in the test itself is included rather than quietly fixed. A
 * post claiming a clean walk-forward has to show what nearly went wrong in it.
 *
 * Every figure traces to research/self-backtest.json.
 */

import { readFileSync, writeFileSync } from "node:fs";
import { pct } from "../src/format.mjs";

const S = JSON.parse(readFileSync("research/self-backtest.json", "utf8"));
const r = S.results, f = S.funnel, v = S.versusAlwaysShort;
const alg = r.algorithm, shortAll = r.alwaysShort, longAll = r.alwaysLong;

const emptyRebalances = S.dates.filter((d) => d.taken === 0).length;
const dirs = { long: 0, short: 0 };
for (const d of S.dates) for (const s of d.takenSymbols) dirs[s.split(":")[1]] += 1;
const mirror = shortAll.meanNetR + longAll.meanNetR;
const selectionRatePct = (f.passedGeometry / f.considered) * 100;

const claims = {
  "the filters throw away almost everything": selectionRatePct < 5,
  "and several rebalances take nothing at all": emptyRebalances >= 3,
  "the algorithm lost money after costs": alg.meanNetR < 0,
  "shorting everything, with no thinking, made money": shortAll.meanNetR > 0,
  "and beat the algorithm outright": !v.algorithmBeatsIt,
  "by a wide margin per trade": v.differenceR < -0.2,
  "on far more trades": v.tradesRatio < 0.1,
  "the algorithm's result is statistically nothing": Math.abs(alg.tStat) < 1,
  "while the always-short result is not": Math.abs(shortAll.tStat) > 3,
  "but always-long lost the mirror image": longAll.meanNetR < 0 && Math.abs(mirror) < 0.1,
  "so the effect is the window's drift, not a discovery":
    Math.abs(shortAll.meanNetR + longAll.meanNetR) < Math.abs(shortAll.meanNetR) / 2,
  "the board's direction alone adds nothing": Math.abs(r.boardOnly.meanNetR) < 0.05,
  "the algorithm took longs in a market that fell": dirs.long > 0,
  "the walk is honest about its size": alg.trades < 30,
  "the rebalances do not overlap": S.stepDays >= S.rules.horizonDays,
};
const bad = Object.entries(claims).filter(([, ok]) => !ok);
if (bad.length) { console.error("ABORT:"); for (const [c] of bad) console.error("  x " + c); process.exit(1); }

const row = (a, b, c, d, e) =>
  (String(a).padEnd(14) + String(b).padStart(8) + String(c).padStart(12)
    + String(d).padStart(9) + String(e).padStart(8)).trimEnd();

const table = [
  ["the algorithm", alg], ["board only", r.boardOnly], ["always short", shortAll],
  ["always long", longAll], ["coin flip", r.coinFlip],
].map(([n, x]) => row(
  n, x.trades, `${x.meanNetR >= 0 ? "+" : ""}${x.meanNetR.toFixed(4)}`,
  `${pct(x.winSharePct)}%`, x.tStat.toFixed(2),
)).join("\n");

const funnelRow = (a, b) => (String(a).padEnd(30) + String(b).padStart(8)).trimEnd();
const funnelTable = [
  ["pair-dates considered", f.considered],
  [`sample of ${S.rules.minEffectiveN}+ episodes`, f.passedSample],
  ["all 5 lookbacks agree", f.passedAgreement],
  ["pays at the fixed geometry", f.passedGeometry],
].map(([l, n]) => funnelRow(l, n)).join("\n");

const text = `All week I have been testing the pieces of my own system. The stop width was half wrong. The early detector did not survive fees. The per-pair optimiser keeps a tenth of itself. Trapped supply predicts nothing.

I never tested what those pieces add up to.

Yesterday I launched a daily column built on exactly that pipeline. So today I walked the whole thing forward through history, and it lost to a rule with no thinking in it at all.

HOW IT WAS TESTED

Pick a date in the past. Score every pair using **only candles that existed on that date**. Apply the filters. Apply the fixed geometry. Open whatever survives, and score what actually happened over the next ${S.rules.horizonDays} days.

Repeat every ${S.stepDays} days — the same length as the holding period, so no two rebalances overlap — across ${S.rebalances} of them and ${S.pairs} pairs.

Then compare against rules that require no intelligence whatsoever.

A BUG IN THE TEST, BEFORE THE RESULTS

The first version walked a single array index across every pair. Pairs have different amounts of history, so the same position in one coin's series is a different calendar day in another's. It was averaging decisions taken years apart and calling them one rebalance.

It printed dates from two years before the walk was supposed to start. That is how I caught it. Fixed by indexing every series by date and looking that date up per pair.

I am telling you because a post claiming a clean walk-forward should show what nearly went wrong inside it.

WHAT THE FILTERS THREW AWAY

\`\`\`
${funnelTable}
\`\`\`

**${pct(selectionRatePct)}%.** Out of ${f.considered} chances to act, the pipeline took ${f.passedGeometry}. ${emptyRebalances} of the ${S.rebalances} rebalances produced **no position at all**.

That is not automatically bad. Selectivity is only worth it if what you keep beats what you discard.

THE RESULT

\`\`\`
${row("", "trades", "mean net R", "win%", "t")}
${table}
\`\`\`

**Shorting every liquid pair — no signal, no filters, no board, no thought — returned ${shortAll.meanNetR >= 0 ? "+" : ""}${shortAll.meanNetR.toFixed(4)}R per trade.**

**My algorithm returned ${alg.meanNetR.toFixed(4)}R.**

It lost by **${Math.abs(v.differenceR).toFixed(3)}R a trade** to the crudest rule available, while taking ${pct(v.tradesRatio * 100)}% as many trades.

And look at the board-only row: the engine's direction with the filters stripped off returns ${r.boardOnly.meanNetR >= 0 ? "+" : ""}${r.boardOnly.meanNetR.toFixed(4)}R across ${r.boardOnly.trades} trades. That is zero. The direction-picking, which is the part I said survived out-of-sample testing two days ago, adds essentially nothing here.

NOW THE PART THAT STOPS ME REWRITING EVERYTHING AS A SHORT BOT

Read the always-long row. It lost **${longAll.meanNetR.toFixed(4)}R** per trade.

Add the two together: **${mirror >= 0 ? "+" : ""}${mirror.toFixed(4)}R.** Almost exactly zero.

That is not two findings. It is one: **the market fell over these ${S.lookbackDays} days**, and any constant direction was going to pay or lose by roughly the size of that drift. Always-short is a leveraged bet on one window, not a strategy, and switching to it would be the same overfitting I have spent the week criticising — just in a more embarrassing direction.

The t-statistic on always-short is ${shortAll.tStat.toFixed(2)}, which looks impressive until you notice it is measuring a trend, not an edge.

WHAT THE 15 TRADES ACTUALLY SAY

Very little, and I want to be exact about that.

t = **${alg.tStat.toFixed(2)}** on ${alg.trades} trades. That is indistinguishable from zero in either direction. I cannot tell you the algorithm is bad. I can tell you there is **no evidence it is good**, which after four months of building it is the finding.

One detail does sting. Of the ${alg.trades} positions it took, **${dirs.long} were longs** — including $ZEC three separate times — in a window where being long cost ${Math.abs(longAll.meanNetR).toFixed(3)}R a trade. The filters had five lookback windows, a sample floor and a geometry test, and they still pointed uphill in a falling market five times.

WHAT THIS DOES TO YESTERDAY'S COLUMN

It does not cancel it, and I am not going to pretend the timing is comfortable.

Everything the column has proposed so far has been short, which happens to align with the only thing that paid in this window. But the *reason* I gave — the filters — is not what was doing the work, and readers were entitled to that before they were entitled to my picks.

So the column changes in one specific way starting with the next edition: **it prints this result beside the positions.** Every edition, the same line: what the pipeline returned when walked forward, and how that compares to doing nothing clever. If that number stays negative, the column will say so while it keeps publishing.

WHAT I AM NOT DOING

Not deleting the filters. ${alg.trades} trades cannot justify tearing down a system any more than they can justify keeping it, and a pipeline that trades 4% of the time needs years, not months, to be judged.

Not switching to always-short. See above.

Not quietly widening the test until it passes. The configuration was fixed before I ran it: ${S.pairs} pairs, ${S.rebalances} non-overlapping rebalances, costs charged at ${pct(S.rules.feePct)}% every time.

WHAT I AM DOING

Running the walk again every week, with the same settings, and publishing the number whichever way it moves. And working on the actual problem this exposed, which is not the stop or the metric or the ranking — it is that the filters select for **consistency in the past** and nothing in them selects for **direction that persists**.

That is a real engineering problem with a real test attached, and I would rather have it than the four months I spent not knowing.

$BTC and the board and every figure: maix8.study/signals

Have you walked your own rules forward, or only backward?

Educational research, not financial advice. You are responsible for your own risk.

#Trading #RiskManagement #Crypto`;

writeFileSync("drafts/85-self-backtest.txt", text);
console.log("claims:", Object.keys(claims).length, "| words:", text.trim().split(/\s+/).length);
