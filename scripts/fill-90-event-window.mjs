/**
 * Post 90 — the advice in every brief, tested for the first time.
 *
 * A reader sent a BTC brief: price, an ETF flow figure, an SEC proposal, and a
 * recommended action — stay on paper, and "watch the price, volume, funding and
 * open interest reaction over 24 to 72 hours".
 *
 * That last line is the most common sentence in crypto commentary and this desk
 * has never tested it. Publishing the brief without testing it would be exactly
 * the failure the desk audits other people for: repeating a procedure because
 * it sounds like diligence.
 *
 * The measurement says the window does not carry a continuation signal. At one
 * day it is a coin toss; at two and three days the move more often reverses
 * than continues. That is a genuinely useful null, because the advice is
 * universal and unexamined.
 *
 * Three things this post must not do.
 *
 * It must not sell the 3-day reversal. z = -2.17 looks like a finding until you
 * count the tests: three horizons times three analyses is nine-plus
 * comparisons, and one of them landing past two standard errors is what chance
 * produces. Reporting it as an edge would be the "best cell chosen after
 * looking" error, committed in a post about not doing that.
 *
 * It must not restate the ETF and SEC figures as fact. Farside answers 403 from
 * here and Reuters 401. The honest move is to say what cannot be checked and
 * why that changes how much weight it can carry — not to launder someone else's
 * number through this desk's credibility.
 *
 * And it must correct the brief's own numbers plainly, including the one that
 * matters most: the +0.28% is yesterday's, and today BTC is down.
 *
 * Figures: research/event-window.json and research/btc-now.json.
 */

import { readFileSync, writeFileSync } from "node:fs";

const E = JSON.parse(readFileSync("research/event-window.json", "utf8"));
const B = JSON.parse(readFileSync("research/btc-now.json", "utf8"));

const day1 = E.baseRate.find((r) => r.horizonDays === 1);
const day2 = E.baseRate.find((r) => r.horizonDays === 2);
const day3 = E.baseRate.find((r) => r.horizonDays === 3);
const oi3 = E.conditionedOnOpenInterest.find((r) => r.horizonDays === 3);
const big3 = E.largeMovesOnly.find((r) => r.horizonDays === 3);
const span7 = B.spans.find((s) => s.days === 7);

/** Every comparison the study looked at, counted honestly. */
const comparisons = E.baseRate.length
  + E.conditionedOnOpenInterest.length * 2
  + E.largeMovesOnly.length;

const claims = {
  "one day ahead is a coin toss":
    Math.abs(day1.zVsCoinToss) < 1,
  "two and three days lean towards reversal, not continuation":
    day2.sameDirectionPct < 50 && day3.sameDirectionPct < 50,
  "no horizon shows continuation":
    E.baseRate.every((r) => r.sameDirectionPct < 52),
  "the mean forward move is not distinguishable from zero at any horizon":
    E.baseRate.every((r) => Math.abs(r.tStat) < 2),
  "open interest does not give a consistent answer":
    E.conditionedOnOpenInterest.some((c) => c.differencePct < 0)
    && E.conditionedOnOpenInterest.some((c) => c.differencePct > 0),
  "the large days do not continue either":
    big3 != null && big3.sameDirectionPct < 50,
  "enough comparisons were made that one outlier is expected":
    comparisons >= 8,
  "the study has open interest for most of the window":
    E.daysWithMetrics > 400,

  "BTC is in the lower half of its year":
    B.spans.find((s) => s.days === 365).positionPct < 50,
  "and the engine is standing aside":
    B.engine.bias === "WAIT",
};
const bad = Object.entries(claims).filter(([, ok]) => !ok);
if (bad.length) { console.error("ABORT:"); for (const [c] of bad) console.error("  x " + c); process.exit(1); }

const sign = (v, dp = 2) => `${v >= 0 ? "+" : ""}${v.toFixed(dp)}`;

const row = (a, b, c, d, e) =>
  (String(a).padEnd(11) + String(b).padStart(9) + String(c).padStart(18)
    + String(d).padStart(9) + String(e).padStart(13)).trimEnd();

const baseTable = E.baseRate.map((r) => row(
  `${r.horizonDays} day${r.horizonDays > 1 ? "s" : ""}`,
  r.windows,
  `${r.sameDirectionPct.toFixed(1)}%`,
  sign(r.zVsCoinToss),
  `${sign(r.meanForwardPct)}%`,
)).join("\n");

const oiRow = (a, b, c, d) =>
  (String(a).padEnd(11) + String(b).padStart(16) + String(c).padStart(17) + String(d).padStart(14)).trimEnd();

const oiTable = E.conditionedOnOpenInterest.map((c) => oiRow(
  `${c.horizonDays} day${c.horizonDays > 1 ? "s" : ""}`,
  `${c.oiRising.sameDirectionPct.toFixed(1)}% (${c.oiRising.windows})`,
  `${c.oiFalling.sameDirectionPct.toFixed(1)}% (${c.oiFalling.windows})`,
  `${sign(c.differencePct, 1)}pp`,
)).join("\n");

const text = `A reader sent me a BTC brief today. Price, an ETF flow figure, an SEC proposal out for comment, and a recommended action.

The action was this: stay on paper, and **watch the price, volume, funding and open interest reaction over the next 24 to 72 hours.**

That is the most common sentence in crypto commentary. It sounds like diligence. I have never tested it, and neither, as far as I can tell, has anyone who writes it.

So before publishing any of the brief, I tested it.

DOES THE REACTION WINDOW CARRY ANYTHING

$BTC, daily, ${E.firstDate} to ${E.lastDate}, with the exchange's own published open interest beside the candles on ${E.daysWithMetrics} of those days.

The question in its simplest form: does today's move predict the next one, two or three days?

\`\`\`
${row("horizon", "windows", "same direction", "z", "mean fwd")}
${baseTable}
\`\`\`

**At one day it is a coin toss** — ${day1.sameDirectionPct.toFixed(1)}%, z ${sign(day1.zVsCoinToss)}.

At two and three days it goes the **other way**: ${day2.sameDirectionPct.toFixed(1)}% and ${day3.sameDirectionPct.toFixed(1)}%. The move more often reverses than continues. Not one horizon shows continuation, and the mean forward move is indistinguishable from zero at all three.

Windows are non-overlapping. At a three-day horizon only every third day is read, because counting one move three times is how a standard error gets shrunk by work nobody did — an inflation this desk has already had to correct in public once.

BUT DOES POSITIONING RESCUE IT

The brief does not say watch price alone. It says price **and** volume **and** funding **and** open interest — the claim being that a move on rising open interest means conviction, and one on falling open interest means unwinding.

So split the days by exactly that.

\`\`\`
${oiRow("horizon", "OI rising", "OI falling", "difference")}
${oiTable}
\`\`\`

The sign of the difference **flips between horizons**. At one day the falling-OI days continue slightly more often; at three days the rising-OI days do, by a lot.

That ${sign(oi3.differencePct, 1)}pp is the number I would lead with if I were selling something. I am not going to, and the reason is the whole point of this post.

THE NUMBER I AM THROWING AWAY

I ran ${comparisons} comparisons in this study — three horizons, each split by open interest, plus the large-move rows.

Run ${comparisons} comparisons on noise and roughly one of them lands past two standard errors. That is not a discovery, it is arithmetic. The ${sign(oi3.differencePct, 1)}pp cell is exactly the shape of that: one bucket, ${oi3.oiFalling.windows} windows on one side, and no support from the horizons either side of it.

Two days ago I published a study criticising someone for reporting the best of five groups after reading all five. Reporting this cell would be the same error, committed inside the post about it.

AND THE LARGE DAYS ARE NO DIFFERENT

If a reaction window means anything, it should mean most after a big move — that is when everyone is watching.

Days moving more than ${Math.abs(big3.thresholdPct).toFixed(2)}%, followed three days out: **${big3.sameDirectionPct.toFixed(1)}% continued**, on ${big3.windows} windows. Below a coin toss, like everything else here.

NOW THE BRIEF ITSELF

The price figures were close but two need fixing, and one of them changes the story.

The brief said BTC around 64,478, up 0.28%, in a range of 64,005 to 64,926. The move and the low check out. **The high was 65,059, not 64,926.**

And the +0.28% was **yesterday's** candle. The real recent shape is a large up day, then a small one, then a lower day — cooling after a jump, not a quiet drift upward. $BTC is currently at ${Math.round(B.price).toLocaleString("en-US")}, in the lower half of its own year, and my engine reads ${B.engine.bias}: both directions lose over its recent window.

The seven-day range is ${Math.round(span7.low).toLocaleString("en-US")} to ${Math.round(span7.high).toLocaleString("en-US")}.

THE ETF AND SEC FIGURES, WHICH I CANNOT CHECK

The brief cited an ETF inflow figure and an SEC proposal.

I cannot verify either from here. The flow source answers 403 to this desk and the news source 401. So I am not going to restate those numbers as fact, because passing an unverifiable figure through a site whose entire claim is that every figure is recomputable would spend the only thing this desk has.

The brief handled this well, for what it is worth: it labelled the ETF print provisional, flagged a missing component, and separated a proposal out for comment from a rule that exists. That is better discipline than most published research.

But there is a harder question underneath, and it is the one this post answers. Even with a perfect ETF number and a confirmed regulatory change, the recommended action was to read the 24-to-72-hour reaction. **That window does not carry a directional signal.** Getting better inputs does not fix a procedure that has no measured output.

WHAT I WOULD DO INSTEAD

Keep the part of the brief that was right: paper, watch-only, labels on anything unverified. That is all sound.

Drop the reaction window as a decision input. Not because news does not matter — because the three days after it do not tell you which way it mattered, and treating them as if they do converts a coin toss into confidence.

If you want something from the next 72 hours, take the boring version: whether your own stop got hit. That is a fact about your position rather than a forecast about the market, and it is the only thing in that window I can show is informative.

Every figure: research/event-window.json and research/btc-now.json, both served at maix8.study/data/.

Track record and losses: maix8.study/record

What is the last piece of advice you followed because it sounded rigorous rather than because someone measured it?

Educational research, not financial advice. You are responsible for your own risk.

#Bitcoin #Trading #RiskManagement`;

writeFileSync("drafts/90-event-window.txt", text);
console.log("claims:", Object.keys(claims).length, "| comparisons counted:", comparisons,
  "| words:", text.trim().split(/\s+/).length);
