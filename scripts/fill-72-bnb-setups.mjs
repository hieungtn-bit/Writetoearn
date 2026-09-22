/**
 * Post 72 — three BNB ladders, scored.
 *
 * A ladder is the most checkable thing anyone publishes: entry, stop and
 * target imply a required win rate, and history says what the actual one was.
 * Three were proposed, ranked by the author's confidence, and measurement
 * reverses that ranking — the one labelled safest is the only one that is
 * negative at its own first target.
 *
 * The point-of-control disagreement is handled carefully on purpose. Their POC
 * is right for a one-week profile and wrong for a one-month one, which makes
 * it a disagreement about which window answers the question rather than an
 * error. Saying otherwise would be the cheap version of this post.
 *
 * Cashtags capped at three by the API; only BNB carries one here.
 *
 * Every figure traces to research/bnb-setups.json.
 */

import { readFileSync, writeFileSync } from "node:fs";
import { pct, price as fmtPrice } from "../src/format.mjs";

const B = JSON.parse(readFileSync("research/bnb-setups.json", "utf8"));
const s1 = B.setups["1 · pullback long"];
const s2 = B.setups["2 · breakout long"];
const s3 = B.setups["3 · reject short"];

/** Best cell each ladder reaches at the 30-day horizon. */
const best = (s) => Object.entries(s.cells)
  .filter(([k]) => k.endsWith("30d"))
  .sort((a, b) => b[1].expectancyR - a[1].expectancyR)[0];

const [b1Name, b1] = best(s1);
const [b2Name, b2] = best(s2);
const [b3Name, b3] = best(s3);

const claims = {
  "their POC is right for a week and wrong for a month": B.claims["their POC is right on a one-week profile"]
    && B.claims["and wrong on a one-month profile"],
  "the safest-labelled setup is negative at its own first target": s1.cells["TP1 · 30d"].expectancyR < 0,
  "its first target pays about one to one": s1.firstTargetRr < 1.2,
  "the breakout setup pays less than its risk at TP1": s2.firstTargetRr < 1,
  "but is the only ladder with a clearly positive cell": b2.expectancyR > 0.1,
  "the short is negative everywhere": Object.values(s3.cells).every((c) => c.expectancyR < 0),
  "the measured order reverses the proposed order": b2.expectancyR > b1.expectancyR,
  "setup 1's stop sits inside one day of noise": s1.stopInAtr < 1.1,
  "no stop reaches half a median week": Object.values(B.setups).every((s) => s.stopInMedianWeek < 0.5),
  "the 4H structure read is correct": B.structure4h.price > B.structure4h.sma50,
};
const bad = Object.entries(claims).filter(([, ok]) => !ok);
if (bad.length) { console.error("ABORT:"); for (const [c] of bad) console.error("  x " + c); process.exit(1); }

const row = (a, b, c, d) =>
  (String(a).padEnd(11) + String(b).padStart(8) + String(c).padStart(10) + String(d).padStart(11)).trimEnd();

const pocLines = Object.entries(B.profiles)
  .map(([w, p]) => row(w, fmtPrice(p.poc), fmtPrice(p.valueAreaLow), fmtPrice(p.valueAreaHigh)))
  .join("\n");

const ladder = (s) => Object.entries(s.cells)
  .filter(([k]) => k.endsWith("30d"))
  .map(([k, c]) => row(k.split(" ")[0], c.rr, `${pct(c.breakEvenHitPct)}%`, `${pct(c.hitPct)}%`))
  .join("\n");

const text = `Someone sent me three $BNB setups this morning, ranked by confidence: a pullback long first, a breakout long second, a short third.

I scored all three bar by bar. **The order reverses.** The one labelled safest is the only one that loses money at its own first target.

FIRST, THE THING THEY GOT RIGHT THAT I ALMOST CALLED WRONG

Their point of control is $598–605. Mine is $${fmtPrice(B.profiles["30d"].poc)}. My first instinct was that one of us had miscounted.

Neither had. A point of control belongs to the window it was measured over:

\`\`\`
${row("lookback", "POC", "VA low", "VA high")}
${pocLines}
\`\`\`

On a **one-week** profile the POC is $${fmtPrice(B.profiles["7d"].poc)} — squarely inside their range. On a month or more it is $${fmtPrice(B.profiles["30d"].poc)} and stops moving.

Both are real. They describe different questions: where has price been accepted *this week*, versus where has the month's money actually changed hands. Neither is the answer on its own, and a profile quoted without its lookback cannot be checked by anyone.

Their 4H structure read is also right — price ${fmtPrice(B.structure4h.price)} is above the 4H SMA20, SMA50 and SMA200 (${fmtPrice(B.structure4h.sma20)} / ${fmtPrice(B.structure4h.sma50)} / ${fmtPrice(B.structure4h.sma200)}).

NOW THE LADDERS

Every entry–stop–target implies a win rate you must beat. History says what it actually was. Same grid, walked bar by bar, a bar touching both levels charged to the stop.

**Setup 1 — pullback long, their top pick.** Entry ${s1.entry}, stop ${s1.stop}, targets ${Object.values(s1.targets).join(" then ")}.

\`\`\`
${row("target", "R:R", "needs", "got")}
${ladder(s1)}
\`\`\`

TP1 pays **${pct(s1.firstTargetRr)} to 1**. Not the 1:2.5–3.2 the setup advertises — that number describes TP2 and beyond. TP1 needs ${pct(s1.cells["TP1 · 30d"].breakEvenHitPct)}% and delivers ${pct(s1.cells["TP1 · 30d"].hitPct)}%, so its expectancy is **${pct(s1.cells["TP1 · 30d"].expectancyR)}R**. Negative.

And the instruction is to take 40–50% off there. Half the position exits at the worst reward in the ladder.

By TP2 it reaches ${pct(s1.cells["TP2 · 30d"].expectancyR)}R — break-even, not an edge.

**Setup 2 — breakout long, ranked second.** Entry ${s2.entry}, stop ${s2.stop}.

\`\`\`
${row("target", "R:R", "needs", "got")}
${ladder(s2)}
\`\`\`

TP1 here is worse still: **${pct(s2.firstTargetRr)} to 1**, paying less than the risk. But hold to ${b2Name.split(" ")[0]} and it reaches **${pct(b2.expectancyR)}R** — the only clearly positive cell across all three ladders.

So the second-ranked setup carries the edge, and it is entirely in the far targets.

**Setup 3 — reject short.** Entry ${s3.entry}, stop ${s3.stop}. Every cell negative, best ${pct(b3.expectancyR)}R. Nothing to salvage.

THE PATTERN UNDER ALL THREE

\`\`\`
${row("setup", "stop", "in ATR", "of a week")}
${row("pullback", `${pct(s1.stopPct)}%`, `${pct(s1.stopInAtr)}`, `${pct(s1.stopInMedianWeek)}x`)}
${row("breakout", `${pct(s2.stopPct)}%`, `${pct(s2.stopInAtr)}`, `${pct(s2.stopInMedianWeek)}x`)}
${row("short", `${pct(s3.stopPct)}%`, `${pct(s3.stopInAtr)}`, `${pct(s3.stopInMedianWeek)}x`)}
\`\`\`

BNB's ATR is ${pct(B.atrPct)}% a day and its median week travels ${pct(B.medianWeekPct)}%.

Setup 1's stop is **${pct(s1.stopInAtr)} of a single day**. Setup 3's is ${pct(s3.stopInAtr)}. Those are not tight stops, they are stops inside the noise — you are paying to be stopped out by an ordinary Tuesday.

And note what waiting for confirmation does: the breakout entry is ${pct(s2.entry - s1.entry)} higher while the stop moves only ${pct(s2.stop - s1.stop)}, so the risk leg widens from ${pct(s1.stopPct)}% to ${pct(s2.stopPct)}%. Waiting is not free. It is rarely priced.

WHAT I WOULD ACTUALLY DO

Not setup 1. Its first target is where the plan asks you to sell half, and that target does not pay.

If you take any of this it is setup 2, held to the far targets, sized for a ${pct(s2.stopPct)}% stop — and knowing that TP1 is a giveaway rather than a win.

Bias: **stand aside on BNB**. Zero trapped supply is the best structural number on my board, but price is near the top of its 30-day range at ${pct(B.rangePosition30d)}%, and the only positive ladder here rests on ${pct(b2.effectiveN)} independent episodes. That is a story, not a finding.

The honest summary of all three: the arithmetic in them was never checked against history. It takes one calculation per target — **the distance to your stop against the distance to that target** — and it would have caught two of these three before anyone risked money on them.

Funding, open interest and liquidation data are blocked from this host, so none of it is used here.

Board and every figure: maix8.study/signals

What does your first take-profit actually pay, measured against your stop?

Educational research, not financial advice. You are responsible for your own risk.

#BNB #RiskManagement #TechnicalAnalysis`;

writeFileSync("drafts/72-bnb-setups.txt", text);
console.log("claims:", Object.keys(claims).length, "| words:", text.trim().split(/\s+/).length);
