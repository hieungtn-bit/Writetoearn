/**
 * Post 88 — the watchlist question, answered by measuring it.
 *
 * Every request this desk gets is a watchlist request wearing different
 * clothes. "Which tokens should I watch", "deep dive on these five", "what is
 * your pick". The structural study found something that works — shorting liquid
 * alts against BTC — but it shorted every one of them indiscriminately, which
 * is not a watchlist and cannot be turned into one by asserting that it can.
 *
 * So this post is what happened when the question was put to the data: rank the
 * alts by how they have done against BTC, cut them into five groups, and short
 * each group identically. If the groups differ, a watchlist has a basis. If
 * they do not, then every list this desk could publish would be decoration on
 * top of an effect that comes from breadth.
 *
 * The answer is the second one, and the post has to resist two temptations in
 * reporting it.
 *
 * The first is the +0.0965R headline. The best of five groups beats taking
 * everything by that much — and it is the best of five groups chosen after
 * looking at all five, which is the exact selection error this desk audited
 * someone else for two days ago. It goes in as a warning, not a result.
 *
 * The second is overclaiming the null. The tilt does lean the intuitive way:
 * past losers keep losing against BTC by 0.24R. It is simply not distinguish-
 * able from luck at t = 1.63, and "we cannot tell" is a different sentence from
 * "there is nothing there".
 *
 * Figures: research/cross-section.json, research/structural-edge.json.
 */

import { readFileSync, writeFileSync } from "node:fs";

const C = JSON.parse(readFileSync("research/cross-section.json", "utf8"));
const S = JSON.parse(readFileSync("research/structural-edge.json", "utf8"));

const G = C.byGroup, A = C.allAlts, SP = C.spread;
const weakest = G[0], strongest = G[G.length - 1];
const best = G.reduce((a, b) => (b.meanNetR > a.meanNetR ? b : a));
const worst = G.reduce((a, b) => (b.meanNetR < a.meanNetR ? b : a));

const claims = {
  "shorting alts against BTC works before any selection":
    A.tStatByMonth > 3 && S.matched.vsBtcAfterFunding.tStatByMonth > 2,
  "the groups are not a ladder":
    !C.monotone,
  "a middle group is beaten by one above it":
    G[3].meanNetR > G[2].meanNetR,
  "the tilt leans towards past losers continuing to lose":
    SP.favours === "momentum" && SP.differenceR > 0,
  "but it cannot be told from luck":
    Math.abs(SP.welchTByMonth) < 2,
  "every group is positive, including the one selection would discard":
    G.every((g) => g.meanNetR > 0),
  "the strongest group is the weakest result":
    strongest.meanNetR === worst.meanNetR,
  "and it is the only group that does not clear two standard errors":
    G.filter((g) => g.tStatByMonth < 2).length === 1 && strongest.tStatByMonth < 2,
  "the best group beats taking everything by a small amount":
    C.bestGroupOverAllR > 0 && C.bestGroupOverAllR < 0.15,
  "the sample is months, not tickets":
    A.months === C.rebalances && A.trades > A.months * 10,
};
const bad = Object.entries(claims).filter(([, ok]) => !ok);
if (bad.length) { console.error("ABORT:"); for (const [c] of bad) console.error("  x " + c); process.exit(1); }

const sign = (v, dp = 4) => `${v >= 0 ? "+" : ""}${v.toFixed(dp)}`;

const row = (a, b, c, d, e) =>
  (String(a).padEnd(21) + String(b).padStart(8) + String(c).padStart(13)
    + String(d).padStart(11) + String(e).padStart(10)).trimEnd();

const table = G.map((g) => row(
  g.label, g.trades, sign(g.meanNetR), g.tStatByMonth.toFixed(2), `${g.monthsPositivePct.toFixed(0)}%`,
)).join("\n");

const text = `Almost every question this desk gets is a watchlist request wearing different clothes. Which tokens to watch. Deep dive on these five. What is your pick.

I have been answering that badly, so I measured it.

WHAT I ACTUALLY HAVE

One thing on this desk survives measurement: shorting liquid alts **against BTC**, ${sign(S.matched.vsBtcAfterFunding.meanNetR)}R a month after funding, t ${S.matched.vsBtcAfterFunding.tStatByMonth.toFixed(2)}, positive in every calendar year since 2019.

But read what that study actually did. It shorted **every** liquid alt on the board, indiscriminately, with no opinion about any of them. That is not a watchlist. You cannot turn it into one by asserting that you can.

So: does picking which ones matter?

THE TEST

${C.pairs} alts, ${C.rebalances} non-overlapping rebalances. At each one, rank every liquid alt by how it has done against BTC over the trailing ${C.rules.rankLookbackDays} days. Cut into five groups. Short each group at identical geometry — same stop, same ${C.rules.rewardRatio}:1 target, same ${C.rules.horizonDays} days, same ${C.rules.feePct}% charged.

If a watchlist is possible, the groups differ.

\`\`\`
${row("group", "trades", "mean net R", "t", "+months")}
${table}
${row("take everything", A.trades, sign(A.meanNetR), A.tStatByMonth.toFixed(2), `${A.monthsPositivePct.toFixed(0)}%`)}
\`\`\`

**It is not a ladder.** Read it top to bottom: ${sign(G[0].meanNetR, 3)}, ${sign(G[1].meanNetR, 3)}, ${sign(G[2].meanNetR, 3)}, then back **up** to ${sign(G[3].meanNetR, 3)}, then down to ${sign(G[4].meanNetR, 3)}. If past relative weakness predicted future relative weakness, that column would fall from top to bottom. It does not — the "strong" group beats the "middle" one.

WHAT THE TILT ACTUALLY SAYS

Weakest minus strongest is **${sign(SP.differenceR)}R**, and it leans the way intuition says it should: the alts that have already lost against BTC go on losing.

Then look at the test. **Welch t = ${SP.welchTByMonth.toFixed(2)}**, computed per rebalance rather than per ticket.

That is not "there is nothing there". It is "I cannot tell". Those are different sentences and I am not going to collapse them, in either direction. The direction is right. The evidence is not enough to trade on.

And note what selection would have thrown away. **Every one of the five groups is positive.** The group a watchlist would discard as "too strong to short" still returned ${sign(strongest.meanNetR)}R — smaller, and the only group that fails to clear two standard errors at t ${strongest.tStatByMonth.toFixed(2)}, but positive.

THE NUMBER I AM NOT GOING TO SELL YOU

Here is the line I could have led with. The best group beats taking everything by **${sign(C.bestGroupOverAllR)}R**.

It is worthless, and it is worthless for a reason I criticised someone else for two days ago: it is the best of five groups, chosen after looking at all five. Pick the winner from a table you have already read and you will always find one. That is not an edge, it is the shape of a table.

If I published a watchlist built on that, the honest label would be "these are the names that worked in the sample I chose them from".

WHAT THIS MEANS FOR EVERY LIST YOU READ

The finding here is not about my board. It is about the format.

A ranked list of tokens is a claim that ranking works. On ${C.pairs} liquid pairs over ${C.rebalances} rebalances, ranked on the most natural signal available — relative strength against BTC — the ranking did not survive the test. The edge lived in **breadth**, not in selection: ${sign(A.meanNetR)}R at t ${A.tStatByMonth.toFixed(2)} for simply taking all of them, positive in ${A.monthsPositivePct.toFixed(0)}% of months.

So when a list arrives, including from me, the question is not whether the names look plausible. It is whether the person ranking them has ever measured that their ranking adds anything to not ranking at all.

I measured mine. It does not. So I am not going to publish one, and that costs me the single most requested thing on this desk.

WHAT I WILL PUBLISH INSTEAD

The breadth number, whichever way it moves, and the state of the trade including the months it does nothing — right now the median alt is **beating** BTC, which is exactly the condition in which this pays nothing at all.

Every figure: research/cross-section.json, alongside research/structural-edge.json. Both are served at maix8.study/data/ and you can recompute either.

$BTC and the record: maix8.study/record

What would it take to convince you that your own watchlist is not ranking anything?

Educational research, not financial advice. You are responsible for your own risk.

#Trading #RiskManagement #Crypto`;

writeFileSync("drafts/88-selection.txt", text);
console.log("claims:", Object.keys(claims).length, "| words:", text.trim().split(/\s+/).length);
