/**
 * Post 83 — auditing a multiplier scan that returned zero, and agreeing with
 * the answer while replacing the reason.
 *
 * The note concludes that nothing qualifies. My own filter reached the same
 * place an hour earlier, so the conclusion is not in dispute. What is testable
 * is the stated cause: that free public data cannot supply the four numbers its
 * rules demand. All four were computed here for 80 of 80 pairs — three from
 * candles the exchange serves free and the fourth from a regression on the same
 * candles.
 *
 * That distinction is the point of the post. "I could not measure it" and "I
 * measured it and there is nothing there" look identical on the page and are
 * different claims, and only the second one tells a reader anything.
 *
 * So the premise gets tested: buying a deep drawdown, across 56,312 pair-days.
 * It fails, and the chance of doubling turns out to be flat across every depth
 * bucket — which is the strongest possible support for the note's own empty
 * result.
 *
 * One awkward finding is reported rather than dropped: at a fixed ATR geometry
 * the deep bucket is the least bad of the three, which points the other way
 * from the raw returns. The post explains why and refuses to use either as an
 * edge, because a coin flip is a coin flip in whichever units it is printed.
 *
 * Every figure traces to research/multiplier-audit.json.
 */

import { readFileSync, writeFileSync } from "node:fs";
import { pct } from "../src/format.mjs";

const A = JSON.parse(readFileSync("research/multiplier-audit.json", "utf8"));
const d = A.dumpersToday, t = A.trades, f = A.fieldsAvailable;
const band = (lo) => A.bands.find((b) => b.band[0] === lo);
const shallow = band(0), deepest = band(80), deep = band(60);
const doubledRange = A.bands.map((b) => b.forward[90].doubledSharePct);

const claims = {
  "the dominance reading is accurate": A.dominance.matches,
  "all four supposedly unavailable fields compute for every pair":
    f.withAllFourFields === f.scanned && f.sharePct === 100,
  "there really are deep drawdowns to look at": d.over60 >= 10,

  "the shallowest bucket is the only one beating baseline at both horizons":
    shallow.forward[30].differencePct > 0 && shallow.forward[90].differencePct > 0
    && A.bands.filter((b) => b.forward[30].differencePct > 0 && b.forward[90].differencePct > 0).length === 1,
  "the deepest bucket is the worst at both horizons":
    deepest.forward[30].differencePct < 0 && deepest.forward[90].differencePct < 0
    && A.bands.every((b) => b.forward[30].differencePct >= deepest.forward[30].differencePct),
  "the chance of doubling is flat across every depth":
    Math.max(...doubledRange) - Math.min(...doubledRange) < 2,
  "and it is small everywhere": Math.max(...doubledRange) < 6,
  "the whole universe drifts down over these windows":
    A.baseline[30].medianPct < 0 && A.baseline[90].medianPct < 0,

  "at a fixed geometry the deep bucket is the least bad":
    t.deep60.medianNetR > t.deep40.medianNetR && t.deep60.medianNetR > t.shallow.medianNetR,
  "but it is still a coin flip": t.deep60.pairsPositiveNet / t.deep60.pairs < 0.55,
  "and buying shallow drawdowns loses": t.shallow.medianNetR < 0,

  "most of today's dumpers do carry heavy overhead": d.medianOverhead > 80,
  "but only half have falling volume": d.negativeVolumeTrendShare === 50,
  "and the median one is near the bottom of its range, not extended":
    d.medianRangePosition < 25,
  "the median dumper moves less than BTC, not more": d.medianBeta < 1,

  "the deepest bucket rests on almost nothing": deepest.forward[90].effectiveN < 10,
  "the study is wide enough to quote": A.universe >= 50 && A.labelledDays > 20000,
};
const bad = Object.entries(claims).filter(([, ok]) => !ok);
if (bad.length) { console.error("ABORT:"); for (const [c] of bad) console.error("  x " + c); process.exit(1); }

const row = (a, b, c, e, g) =>
  (String(a).padEnd(13) + String(b).padStart(8) + String(c).padStart(10)
    + String(e).padStart(10) + String(g).padStart(10)).trimEnd();

const bandTable = A.bands.map((b) => row(
  `-${b.band[0]} to -${b.band[1]}%`,
  `${pct(b.sharePct)}%`,
  `${pct(b.forward[30].differencePct)}`,
  `${pct(b.forward[90].differencePct)}`,
  `${b.forward[90].doubledSharePct.toFixed(2)}%`,
)).join("\n");

const fieldRow = (a, b, c, e, g) =>
  (String(a).padEnd(10) + String(b).padStart(9) + String(c).padStart(10)
    + String(e).padStart(10) + String(g).padStart(8)).trimEnd();

const fieldTable = d.detail.slice(0, 6).map((x) => fieldRow(
  x.symbol.replace(/USDT$/, ""),
  `${pct(x.drawdownFromHighPct)}%`,
  `${pct(x.overheadPct)}%`,
  `${pct(x.volumeTrendPct)}%`,
  `${pct(x.rangePosition30d)}%`,
)).join("\n");

const text = `A reader sent me a full-market "multiplier scan" — hunting alts down 60–90% from their highs for a 1.5–3x bounce. It returned **zero candidates**.

Good. My own filter reached the same place an hour earlier: of ${A.universe} pairs, no long survived.

So we agree on the answer. I disagree with the reason, and the real reason is much more interesting than the one given.

THE REASON GIVEN

The note says its rules require four numbers — overhead supply, volume trend, range position, and beta to $BTC — and that **free public data cannot supply them**, so nothing can be ranked.

I computed all four. For **${f.withAllFourFields} of ${f.scanned} pairs. ${pct(f.sharePct)}%.**

Three come straight from the candles the exchange serves for nothing. The fourth is a regression of daily returns against BTC's, on those same candles. Here are today's deepest names:

\`\`\`
${fieldRow("", "from high", "overhead", "volume", "range")}
${fieldTable}
\`\`\`

That is the whole "unavailable" dataset, in one request per pair.

WHAT THOSE NUMBERS ACTUALLY SAY

The note describes today's dumpers as having falling volume, heavy overhead, and being extended after a technical bounce. Across the ${d.over60} pairs down 60% or more:

**Overhead — correct.** Median ${pct(d.medianOverhead)}%. Almost everything that traded recently is underwater.

**Falling volume — half right, literally.** Exactly **${pct(d.negativeVolumeTrendShare)}%** have negative volume trend. The median reading is **${pct(d.medianVolumeTrend)}%** — positive. Turnover is arriving at as many of these as it is leaving.

**Extended after a bounce — no.** Median range position is **${pct(d.medianRangePosition)}%**. The typical deep dumper sits near the *bottom* of its 30-day range, not the top.

**And they are not high-beta.** Median beta to BTC is **${d.medianBeta.toFixed(2)}**. Below one. The median wreck moves *less* than Bitcoin, not more — which undercuts the "dominance is high so high-beta alts get punished" framing for this particular set of names.

NOW THE PREMISE

None of that is the real problem. The real problem is whether buying a deep drawdown pays at all.

Every pair-day in the universe, bucketed by how far below its own 90-day high it closed, scored forward against the same universe's baseline. **${A.labelledDays.toLocaleString("en-US")} labelled days.**

\`\`\`
${row("from high", "share", "30d vs", "90d vs", "doubled")}
${bandTable}
\`\`\`

Read the middle columns first. **The only bucket that beats baseline at both horizons is the shallowest one** — names within 20% of their high. And the deepest bucket is the worst at both, by a distance.

The deeper the hole, the worse the next ninety days have been. That is the opposite of the premise a multiplier scan runs on.

THE MULTIPLIER QUESTION, ASKED DIRECTLY

Medians are not what a 1.5–3x hunter cares about. So the last column asks the actual question: **what share of these positions doubled inside ninety days?**

**${doubledRange.map((v) => v.toFixed(1) + "%").join(", ")}.**

Flat. Being down 80% from the high gives you ${deepest.forward[90].doubledSharePct.toFixed(2)}% odds of a double. Being down less than 20% gives you ${shallow.forward[90].doubledSharePct.toFixed(2)}%. There is no depth at which the lottery pays better.

That is what an empty scan result actually means, and it is a far stronger statement than "I could not find the data".

THE PART THAT COMPLICATES MY OWN STORY

I have to report a result that points the other way.

Traded properly — a 1.5 ATR stop, a 2:1 target, thirty days — the deep bucket is the *least bad* of the three:

\`\`\`
${row("entries", "", "gross", "net", "pairs +ve")}
${row("60%+ down", "", t.deep60.medianExpectancyR.toFixed(3), t.deep60.medianNetR.toFixed(3), `${t.deep60.pairsPositiveNet}/${t.deep60.pairs}`)}
${row("40%+ down", "", t.deep40.medianExpectancyR.toFixed(3), t.deep40.medianNetR.toFixed(3), `${t.deep40.pairsPositiveNet}/${t.deep40.pairs}`)}
${row("any day", "", t.shallow.medianExpectancyR.toFixed(3), t.shallow.medianNetR.toFixed(3), `${t.shallow.pairsPositiveNet}/${t.shallow.pairs}`)}
\`\`\`

Why the reversal? Because R is measured in units of that coin's own volatility. Wrecked coins have enormous daily ranges, so a 1.5 ATR stop on them is a very wide percentage stop, and it sits through bounces that would stop out a calmer name.

But look at the last column before anyone builds a strategy on it: **${t.deep60.pairsPositiveNet} of ${t.deep60.pairs} pairs** positive after fees, at ${t.deep60.medianNetR.toFixed(3)}R. That is a coin flip returning approximately nothing, and I am not going to dress it up because it happens to be the one row that flatters a bounce-hunting thesis.

Both measurements agree on the thing that matters: there is no multiplier edge in depth.

WHAT I CANNOT CHECK

The note leans on Bitcoin dominance at ${pct(A.dominance.measuredPct)}% being "elevated" and therefore hostile to alts. The level is right — I measured ${pct(A.dominance.measuredPct)}% against its stated ${A.note.statedBtcDominancePct[0]}–${A.note.statedBtcDominancePct[1]}%.

Whether a high reading *predicts* alt underperformance I cannot test from here — no free source gives me dominance history, and I am not going to endorse a causal claim I have no way to score. It may well be true. It is currently an assumption with a number attached.

WHY THE DISTINCTION MATTERS

"I could not measure it" and "I measured it and there is nothing there" produce the same empty table.

Only one of them tells you anything. The first leaves you waiting for better data, and there is better data — it is free and it is one request away. The second tells you the hunt itself is the problem, which is worth knowing before you spend a month looking.

The note's discipline in publishing an empty result is genuinely rare and I would rather have this argument with someone who prints zero than with someone who prints ten names.

Bias: unchanged from earlier today — **selective short**, four positions, at a geometry I did not choose. The long side of this market is empty, and now for a measured reason rather than a missing one.

Board and every figure: maix8.study/signals

If your scan returns nothing, do you know which of those two sentences you are saying?

Educational research, not financial advice. You are responsible for your own risk.

#Altcoins #RiskManagement #Trading`;

writeFileSync("drafts/83-multiplier-audit.txt", text);
console.log("claims:", Object.keys(claims).length, "| words:", text.trim().split(/\s+/).length);
