/**
 * Post 97 — the AI group is a real sector, and RENDER is not its best name.
 *
 * A reader sent an AI scan ranking RENDER first, TAO second, and asked for the
 * technicals. Every line of it rests on an unexamined premise: that these coins
 * belong together, and that belonging is information.
 *
 * This desk usually finds that a premise like that dissolves under measurement.
 * Not this time, and the post has to be straight about that before anything
 * else, because a desk that only publishes debunkings is running a genre, not
 * a method.
 *
 *   Strip each pair's BTC exposure by regression. What is left is the part BTC
 *   does not explain. The AI basket's members still correlate at 0.404 in that
 *   residual, against 0.116 for two hundred random baskets of the same size
 *   drawn from the same liquid universe over the same window. z +6.07, the
 *   100th percentile, and it survives dropping any single member.
 *
 * So the group is real. That makes the rest of the brief's claims worth
 * checking rather than dismissing, and one of them does not survive.
 *
 *   RENDER is ranked first. Over 180 days its alpha to BTC is -0.044% a day —
 *   about -7.6% compounded — which puts it sixth of ten. TAO, ranked second, is
 *   the only large one with meaningfully positive alpha at +0.066% a day. If
 *   the reason to own an AI name is that AI pays beyond beta, the ranking is
 *   upside down at the top.
 *
 *   The brief's own reason for keeping RENDER out of the base-breakout screen
 *   is correct, and the post says so with a number the brief did not have: its
 *   20-day range is 7.3 daily ranges wide with price 96% up it. That is not a
 *   base. It is a trend near its high.
 *
 * The tone that would ruin this: treating the correct calls as grudging
 * concessions on the way to a gotcha. Three of four quoted prices land, the
 * sector premise holds, the screen reasoning is right. One ranking is wrong.
 * That is the post, in that order.
 *
 * Figures: research/ai-sector.json, research/daily-brief.json.
 */

import { readFileSync, writeFileSync } from "node:fs";

const A = JSON.parse(readFileSync("research/ai-sector.json", "utf8"));
const D = JSON.parse(readFileSync("research/daily-brief.json", "utf8"));

const C = A.cohesion, R = A.render;
const byAlpha = [...A.betas].sort((a, b) => b.alphaDailyPct - a.alphaDailyPct);
const tao = byAlpha.find((b) => b.symbol === "TAOUSDT");
const render = byAlpha.find((b) => b.symbol === "RENDERUSDT");
const renderAlphaRank = byAlpha.indexOf(render) + 1;
const base20 = R.bases.find((b) => b.days === 20);
/** Read from the snapshot rather than recomputed, so every figure traces. */
const cum = (b) => b.alphaWindowPct;

const claims = {
  "the sector premise holds against random baskets":
    C.zVsControl > 3 && C.aiWithinCorr > C.controlMeanCorr * 2,
  "at the top of the control distribution":
    C.percentileVsControl >= 99 && C.controlBaskets >= 100,
  "and it survives dropping any single member":
    C.weakestAfterDropping != null && C.weakestAfterDropping.z > 3,
  "the control was drawn from a large pool, not a handful":
    C.poolSize > 100,

  "RENDER's alpha to BTC is negative over the window":
    render.alphaDailyPct < 0,
  "and it is not near the top of the basket on that measure":
    renderAlphaRank > 3,
  "while TAO's is positive":
    tao.alphaDailyPct > 0,
  "the two are close in beta, so this is not a leverage difference":
    Math.abs(render.beta - tao.beta) < 0.2,

  "RENDER has no base by a measurable definition":
    base20.dailyRangesWide > 4 && base20.positionInRangePct > 80,
  "on every window checked, not just the one that suits":
    R.bases.every((b) => b.dailyRangesWide > 4),

  /**
   * The count is not fixed, only the size of the misses.
   *
   * RENDER sat inside its quoted 1.48-1.53 band on one run and above it on the
   * next, minutes later. A gate on "three of four land" would have been true
   * at one timestamp and false at the next, which is a fact about a live price
   * and not about the brief. What survives both readings is that every miss is
   * small.
   */
  "the prices the brief quoted are all close, whether or not each lands":
    A.quoted.every((q) => q.actualUsd != null
      && Math.abs(q.actualUsd - (q.lowUsd + q.highUsd) / 2) / ((q.lowUsd + q.highUsd) / 2) < 0.05),
  "one name it quotes is not listed on this exchange at all":
    A.unlistedHere === "AKTUSDT",

  "the excluded pair was excluded with a stated reason":
    A.excluded != null && A.excluded.reason.length > 20,
  "and the liquidity floor applies to both arms of the test":
    A.minTurnoverUsd >= 1e6,
};
const bad = Object.entries(claims).filter(([, ok]) => !ok);
if (bad.length) { console.error("ABORT:"); for (const [c] of bad) console.error("  x " + c); process.exit(1); }

const sign = (v, dp = 2) => `${v >= 0 ? "+" : ""}${v.toFixed(dp)}`;
const bare = (s) => s.replace("USDT", "");

const alphaTable = [
  ("pair".padEnd(10) + "beta".padStart(7) + "alpha/day".padStart(12) + "180d".padStart(9) + "today".padStart(9)),
  ...byAlpha.map((b) => (bare(b.symbol).padEnd(10)
    + b.beta.toFixed(2).padStart(7)
    + `${sign(b.alphaDailyPct, 3)}%`.padStart(12)
    + `${sign(cum(b), 1)}%`.padStart(9)
    + `${sign(b.changePct, 1)}%`.padStart(9)).trimEnd()),
].join("\n");

/**
 * A price above the lookback high sits past 100% of it, and "104% up it" reads
 * as an error rather than as a breakout. The range deliberately excludes the
 * current bar — otherwise a break of the base is invisible by construction —
 * so the label has to name that case instead of printing a nonsense percentage.
 */
const position = (b) => (b.positionInRangePct > 100
  ? "above the range"
  : `${b.positionInRangePct.toFixed(0)}% up it`);

const baseTable = R.bases.map((b) => (`${b.days}d`.padEnd(6)
  + `$${b.lowUsd.toFixed(3)}-${b.highUsd.toFixed(3)}`.padStart(16)
  + `${b.widthPct.toFixed(1)}% wide`.padStart(12)
  + `${b.dailyRangesWide.toFixed(1)} daily ranges`.padStart(19)
  + position(b).padStart(17)).trimEnd()).join("\n");

const text = `A reader sent me an AI-sector scan and asked for the technicals. $RENDER first, $TAO second, FET momentum, ICP structurally nicer but a weaker story.

Every line of it rests on a premise nobody checks: that these coins belong together, and that belonging tells you something.

I usually find a premise like that dissolves. This one did not, so that goes first.

IS "AI" A SECTOR, OR A LABEL

If it is a sector, its members should move together for reasons beyond the market. So: regress each pair's daily returns on BTC's over ${A.windowDays} days, and keep the residual — the part BTC does not explain. Then measure how correlated those residuals are inside the group.

**${C.aiWithinCorr.toFixed(3)}** across ${C.pairs} pairs.

That number means nothing on its own; alts are correlated. So the same statistic ran on **${C.controlBaskets} random baskets** of the same size, drawn from the ${C.poolSize} liquid pairs outside the group, over the same window.

**${C.controlMeanCorr.toFixed(3)}, give or take ${C.controlSd.toFixed(3)}.**

The AI basket sits at the **${C.percentileVsControl.toFixed(0)}th percentile — z ${sign(C.zVsControl)}.** Drop any single member and the weakest it gets is z ${sign(C.weakestAfterDropping.z)}, without ${bare(C.weakestAfterDropping.dropped)}.

So the group is real. These names move with each other in a way a random basket of liquid alts does not, after BTC is taken out. The reader's premise holds and I did not expect it to.

WHICH MAKES THE RANKING WORTH CHECKING

\`\`\`
${alphaTable}
\`\`\`

Alpha here is the daily return left after removing each pair's BTC exposure. It is what "owning the AI theme" paid you beyond simply owning beta.

**${bare(render.symbol)}, ranked first, is ${sign(render.alphaDailyPct, 3)}% a day — about ${sign(cum(render), 1)}% compounded over the window, ${renderAlphaRank}th of ${byAlpha.length}.**

**${bare(tao.symbol)}, ranked second, is ${sign(tao.alphaDailyPct, 3)}% a day — ${sign(cum(tao), 1)}%.**

Their betas are ${render.beta.toFixed(2)} and ${tao.beta.toFixed(2)}. Nearly identical exposure to the market, opposite results on top of it. This is not one being a leveraged version of the other.

If the reason to hold an AI name is that the theme pays beyond beta, then the theme has been paying through TAO and not through RENDER, and the ranking is upside down at the top.

I would not trade that on its own — ${A.windowDays} days of daily alpha is a single window and the ordering can flip. But it is the number the ranking should have been made from, and it points the other way.

DOES RENDER HAVE A BASE

The brief keeps RENDER out of its base-breakout screen for not having enough base. That is correct, and here is the number it did not carry.

A base is a range that is tight relative to what the pair normally covers in a day. So: how many daily ranges wide is it, and where in it does price sit.

\`\`\`
${baseTable}
\`\`\`

**${base20.dailyRangesWide.toFixed(1)} daily ranges wide, and price is ${position(base20)}.** That is not a base. It is a trend sitting near its high.

Compare it with what a consolidation looks like: two or three daily ranges, price somewhere in the middle. RENDER is nowhere near that on any window I checked.

So the screen was right to reject it, for exactly the reason given. Worth saying plainly, because "the filter said no" is usually where people stop reading.

WHAT ELSE CHECKS OUT

${A.quoted.filter((q) => q.inRange).length} of the ${A.quoted.length} quoted prices sit inside their bands right now, and **every one of the four is within ${Math.ceil(Math.max(...A.quoted.map((q) => Math.abs(q.actualUsd - (q.lowUsd + q.highUsd) / 2) / ((q.lowUsd + q.highUsd) / 2) * 100)))}% of the middle of its band**: $RENDER $${A.quoted[0].actualUsd}, TAO $${A.quoted[1].actualUsd}, FET $${A.quoted[2].actualUsd}, $ICP $${A.quoted[3].actualUsd}.

I ran this check twice while writing. RENDER was inside its $${A.quoted[0].lowUsd}-${A.quoted[0].highUsd} band on the first pass and above it on the second, minutes apart. Which is the honest caveat on every price a scan quotes, mine included: the band was right when it was written.

One thing to flag: the brief quotes AKT at about $0.58. **This exchange does not list it.** Not a mistake about the price — a price I cannot check from here, so I am not repeating it.

WHAT I WOULD ACTUALLY DO WITH THIS

The sector result is the useful part, and not for picking a name. It says these pairs share a risk. Holding RENDER and TAO and FET is closer to holding one position three times than to holding three, and position sizing that treats them as independent is understating exposure by a lot.

That is a portfolio conclusion, not a trade idea, which is why nobody writes it.

My own board: ${bare("RENDERUSDT")} is not in it — it sits outside the scanned universe on turnover at $${(R.turnoverUsd / 1e6).toFixed(1)}M. ICP is followed and still refused on sample depth. Neither is in today's book, which took ${D.taken.length} shorts.

Bias: WAIT

Every figure: research/ai-sector.json at maix8.study/data/ — the full basket, all ${C.controlBaskets} control baskets, and the leave-one-out.

The book, all of it stopped: maix8.study/record

If three of your positions share one risk, how many positions do you have?

Educational research, not financial advice. You are responsible for your own risk.

#RENDER #Bitcoin #Trading #Quant`;

writeFileSync("drafts/97-ai-sector.txt", text);
console.log("claims:", Object.keys(claims).length, "| words:", text.trim().split(/\s+/).length);
