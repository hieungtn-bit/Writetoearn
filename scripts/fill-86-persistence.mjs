/**
 * Post 86 — the failure the walk-forward exposed, measured directly.
 *
 * Last week's walk-forward said the pipeline had no demonstrated edge and left
 * the diagnosis as a sentence at the end: the filters select for consistency in
 * the past and nothing in them selects for direction that persists. That was a
 * hypothesis dressed as a conclusion, and it is the single most important
 * unwritten piece on this desk.
 *
 * So it is separated into three questions that can each fail on their own, and
 * the cheapest one turns out to decide the argument. Whether direction persists
 * needs no engine, no filters and no geometry — just the sign of one return
 * against the sign of the next, across 45,445 pair-days. It is 50.70%. At ten
 * days it is fractionally under half.
 *
 * That is the finding, and it is worse than "my filters underperform", because
 * it is a statement about what the filters could do at their best. If direction
 * does not continue, no rule that reads past direction can work, and the
 * architecture is resting on a base rate that is not there.
 *
 * The post has to resist two temptations. The first is overclaiming in the
 * other direction: the unanimous cut does point the right way, +0.18R against
 * what it rejects, and the honest report is that it cannot be told from luck
 * rather than that it is dead. The second is treating +0.0045R as a real
 * margin — hence the calibration, where the same quantity measured a week ago
 * on a slightly different universe disagrees by twelve times that.
 *
 * The tautology found inside this file is kept in the text, as with post 85.
 * A post about filters that do not test what they claim should say when its own
 * fourth selector turned out to test nothing.
 *
 * Every figure traces to research/persistence.json, and the comparison figures
 * to research/self-backtest.json.
 */

import { readFileSync, writeFileSync } from "node:fs";

const S = JSON.parse(readFileSync("research/persistence.json", "utf8"));
const P = S.persistence, A = S.byAgreement, F = S.fiveVsRest, C = S.selectors, D = S.derived;
const [H1, H2, H3] = S.rules.persistenceHorizons;

const claims = {
  "direction does not persist at any horizon tested":
    S.rules.persistenceHorizons.every((h) => Math.abs(P[h].zVsCoinToss) < 2),
  "at the shortest horizon it is fractionally below a coin toss":
    P[H1].matchPct < 50,
  "the longest horizon looks positive pooled but not per pair":
    P[H3].matchPct > 50 && P[H3].medianPairPct < 50,
  "and only about half the pairs beat a coin toss at any horizon":
    S.rules.persistenceHorizons.every((h) => {
      const share = P[h].pairsAbove50 / P[h].pairs;
      return share > 0.4 && share < 0.65;
    }),
  "the sample behind that is large even after de-overlapping":
    Math.min(...S.rules.persistenceHorizons.map((h) => P[h].effectiveN)) > 400,

  "more agreement does not mean a better forward result":
    !S.agreementMonotone,
  "the middle buckets are too thin to carry any conclusion":
    A.filter((r) => r.trades < 25).length >= 3,
  "the filter's own cut does point the right way":
    F.differenceR > 0,
  "but it cannot be told from luck":
    Math.abs(F.welchT) < 2,

  "the whole engine beats the sign of the last month by almost nothing":
    D.engineOverMomentumR > 0 && D.engineOverMomentumR < 0.02,
  "the same measurement a week ago disagreed with itself by much more":
    Math.abs(D.runToRunGapR) > Math.abs(D.engineOverMomentumR) * 5,
  "betting against the last month loses":
    C.reversal.meanNetR < 0,
  "and it is not the exact mirror of betting with it":
    D.momentumPlusReversalR < 0,
  "the unanimous cut is the best of the four":
    C.unanimous.meanNetR > Math.max(C.momentum.meanNetR, C.boardDirection.meanNetR),
  "and not one of the four is distinguishable from zero":
    Object.values(C).every((v) => Math.abs(v.tStat) < 2),
  "on a sample small enough to say so out loud":
    C.unanimous.trades < 200,
  "most of the board never gets five windows at all":
    D.withFiveWindows < D.rowsConsidered * 0.7,
};
const bad = Object.entries(claims).filter(([, ok]) => !ok);
if (bad.length) { console.error("ABORT:"); for (const [c] of bad) console.error("  x " + c); process.exit(1); }

const sign = (v, dp = 4) => `${v >= 0 ? "+" : ""}${v.toFixed(dp)}`;

const persistRow = (a, b, c, d, e) =>
  (String(a).padEnd(10) + String(b).padStart(9) + String(c).padStart(14)
    + String(d).padStart(13) + String(e).padStart(8)).trimEnd();

const persistTable = S.rules.persistenceHorizons.map((h) => persistRow(
  `${h} days`,
  `${P[h].matchPct.toFixed(2)}%`,
  `${P[h].medianPairPct.toFixed(1)}%`,
  `${P[h].pairsAbove50}/${P[h].pairs}`,
  sign(P[h].zVsCoinToss, 2),
)).join("\n");

const agreeRow = (a, b, c, d, e) =>
  (String(a).padEnd(12) + String(b).padStart(8) + String(c).padStart(13)
    + String(d).padStart(8) + String(e).padStart(8)).trimEnd();

const agreeTable = A.map((r) => agreeRow(
  `${r.agreeing} of 5`, r.trades, sign(r.meanNetR), `${r.winPct.toFixed(0)}%`, r.tStat.toFixed(2),
)).join("\n");

const selRow = (a, b, c, d, e) =>
  (String(a).padEnd(30) + String(b).padStart(8) + String(c).padStart(13)
    + String(d).padStart(8) + String(e).padStart(8)).trimEnd();

const selTable = [
  ["sign of the last month", C.momentum],
  ["the opposite of that", C.reversal],
  ["my engine's direction", C.boardDirection],
  ["+ all five lookbacks agreeing", C.unanimous],
].map(([n, v]) => selRow(n, v.trades, sign(v.meanNetR), `${v.winPct.toFixed(0)}%`, v.tStat.toFixed(2))).join("\n");

const text = `Every filter on this desk is a statement about the past being tidy.

A direction that paid over the last ${S.rules.horizonDays} days. Five nested lookback windows that agree on it. A sample of twelve or more episodes behind it. A recent history whose sign matches the full one.

Not one of them asks the question a position actually depends on: does a direction that held **keep** holding.

Last week I walked this whole pipeline forward and it lost to shorting everything with no thought in it. I ended that post by naming what I thought the problem was — the filters select for consistency, not persistence — and then I left it as a sentence. A sentence is a hypothesis. This is the measurement.

THREE QUESTIONS, NOT ONE

Consistency and persistence are different properties, and lumping them together is how you end up unable to say which one failed. So:

**A.** Does agreement predict? Score every call by how many of its five windows agreed, then look at what the trade did next.

**B.** Does direction persist at all? For every pair and every day, does the sign of the trailing return match the sign of the next one.

**C.** Would anything cheaper have worked? Four selectors at identical geometry on identical days.

**B** is the one that decides the argument, and it is deliberately the cheapest thing here. No engine, no filters, no stop, no target. Just the sign of one return against the sign of the next.

B. DOES DIRECTION PERSIST

\`\`\`
${persistRow("horizon", "match", "median pair", "pairs >50%", "z")}
${persistTable}
\`\`\`

**It is a coin toss.**

${P[H2].matchPct.toFixed(2)}% at ${H2} days, on ${P[H2].observations.toLocaleString("en-US")} pair-days. At ${H1} days it is ${P[H1].matchPct.toFixed(2)}% — fractionally on the *wrong* side of half.

The z column is the honest part. Overlapping windows inflate a sample badly: ${P[H2].observations.toLocaleString("en-US")} day-pairs at a ${H2}-day horizon is really about ${Math.round(P[H2].effectiveN).toLocaleString("en-US")} independent ones, because you are reading the same month thirty times. De-overlapped, every horizon sits inside **${Math.max(...S.rules.persistenceHorizons.map((h) => Math.abs(P[h].zVsCoinToss))).toFixed(2)} standard errors of a coin toss**. There is nothing there.

Look at ${H3} days, too. Pooled it reads ${P[H3].matchPct.toFixed(2)}%, above half. The **median pair** reads ${P[H3].medianPairPct.toFixed(1)}%, below half, and only ${P[H3].pairsAbove50} of ${P[H3].pairs} pairs beat a toss. The pooled number is being carried by a handful of coins with long histories, not by a property of the market. If I had printed only the first figure I would have had a finding.

This is worse than "my filters underperform". It is a statement about what any filter of this shape could do at its best. **If direction does not continue, nothing that reads past direction can work** — not my five windows, not anyone's moving average cross, not the trend line on the chart someone will post under this.

A. DOES AGREEMENT PREDICT

\`\`\`
${agreeRow("agreeing", "trades", "mean net R", "win%", "t")}
${agreeTable}
\`\`\`

It is not a ladder. It goes down, up, down, up, up. If lookback agreement measured conviction, that column would rise.

But I have to be careful here, because four of those five buckets hold fewer than 25 trades and a zigzag across thin buckets is what noise looks like. So the test that actually decides is the cut the filter really performs — everything it keeps, against everything it throws away:

**Unanimous: ${sign(F.unanimousMeanR)}R on ${F.unanimousTrades} trades. Rejected: ${sign(F.rejectedMeanR)}R on ${F.rejectedTrades}.**

A difference of **${sign(F.differenceR)}R** in the filter's favour, and a t of **${F.welchT.toFixed(2)}**.

That points the right way. It also cannot be told from luck. Both halves of that sentence are the finding, and I am not going to publish only the half I prefer — which, given I built the thing, is a live risk.

C. WOULD ANYTHING CHEAPER HAVE WORKED

Same ${S.rebalances} dates, same ${S.rules.stopAtr} ATR stop, same ${S.rules.rewardRatio}:1 target, same ${S.rules.feePct}% charged every time.

\`\`\`
${selRow("selector", "trades", "mean net R", "win%", "t")}
${selTable}
\`\`\`

My engine returned ${sign(C.boardDirection.meanNetR)}R. **The sign of the last month returned ${sign(C.momentum.meanNetR)}R.**

Four months of work buys **${sign(D.engineOverMomentumR)}R** over a rule you can evaluate in your head.

And here is how much that ${sign(D.engineOverMomentumR)} is worth. Last week's walk-forward measured the same quantity — my engine's raw direction, over these same ${S.rebalances} dates, at this same geometry — on a live universe that happened to contain ${D.priorWalk.pairs} pairs instead of ${S.pairs}. It got **${sign(D.priorWalk.boardOnlyR)}R** across ${D.priorWalk.boardOnlyTrades} trades.

Same measurement, a week apart, off by **${sign(D.runToRunGapR)}R** — about **${D.gapOverClaimedEdge.toFixed(1)} times** the edge the engine claims over the crude rule. When two honest runs of one number disagree by more than the effect you are testing, you do not have an effect. You have a sample size.

One detail worth keeping: betting *against* the last month lost ${C.reversal.meanNetR.toFixed(4)}R, and the two do not sum to zero. They cannot. With a stop checked before a target, a long and a short opened on the same bar can **both** get stopped inside the month. That gap is the whipsaw, and it is charged to whoever is holding.

A TAUTOLOGY I SHIPPED, THEN DELETED

The first version of this file had a fifth selector: the recent window on its own, without demanding the others agree. It returned numbers identical to my engine's to sixteen decimal places.

Not similar. Identical. Because the engine picks its side **as** the side with positive recent expectancy, so a filter asking "is recent expectancy positive?" can never exclude a call the engine did not already make. I had written a test that could only ever agree with the thing it was testing.

I caught it because two rows in a table matched exactly, which is not something real data does. It is exactly the failure this post is about, committed inside the post that is about it.

WHAT I AM CHANGING

**The claim underneath the daily column changes.** It has been saying the positions survive because five lookbacks agree, as though agreement were evidence. The measured version is narrower and I would rather say it: **the unanimous cut is the only one of my filters that has not been ruled out**, on ${C.unanimous.trades} trades and a t of ${C.unanimous.tStat.toFixed(2)}. That is a reason to keep collecting, not a reason to size up.

**${D.withFiveWindows} of the ${D.rowsConsidered} rows even had five windows to agree.** The rest are too young for the longest lookback to exist. So the filter I lean on hardest is silently unavailable on most of the market — which is its own piece, and it is next.

WHAT I AM NOT CHANGING

Not deleting the filters. "Cannot be told from luck" is not "refuted", and tearing out a rule on ${C.unanimous.trades} trades would be the same over-reaction as keeping it on ${C.unanimous.trades} trades.

Not switching to a reversal rule. It lost, and it lost in a window where nearly everything did.

Not re-running this until it says something nicer. The configuration was fixed before it ran: ${S.pairs} pairs, ${S.rebalances} non-overlapping rebalances, costs charged every time. This one gets re-measured monthly rather than weekly, because a base rate over ${P[H2].observations.toLocaleString("en-US")} pair-days does not move in seven days — and re-running a stable number weekly until it wobbles somewhere flattering is its own kind of cheating.

WHAT THIS MEANS IF YOU TRADE

Almost every retail method is a persistence bet wearing different clothes. Trend continuation. Higher highs. The break of a level "confirming" direction. Multi-timeframe alignment — which is agreement across windows, exactly what section A tests.

I am not telling you those never work. I am telling you that on ${S.pairs} liquid pairs, the raw base rate they all draw on measured **${P[H2].matchPct.toFixed(2)}%** at a one-month horizon, and that anything built on top of it has to pay for its stop, its target and its fees out of that.

Ask the question of your own method: not "did it work in the past", but "does the property it detects continue". Those are different questions, and I spent four months answering the first one.

Every figure: research/persistence.json, alongside last week's research/self-backtest.json. Both are on the site and you can recompute either.

$BTC and the board: maix8.study/record

Educational research, not financial advice. You are responsible for your own risk.

#Trading #RiskManagement #Crypto`;

writeFileSync("drafts/86-persistence.txt", text);
console.log("claims:", Object.keys(claims).length, "| words:", text.trim().split(/\s+/).length);
