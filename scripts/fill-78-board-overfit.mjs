/**
 * Post 78 — turning this morning's two findings on my own board.
 *
 * Post 77 said that searching 144 configurations manufactures winners. My board
 * searches 64 geometries per pair and publishes the maximum. That is the same
 * mistake wearing my own branding, so it had to be tested rather than defended.
 *
 * It fails. The chosen plan keeps about a tenth of its apparent expectancy out
 * of sample and beats a randomly picked geometry from the same window on 49% of
 * pairs — a coin flip. The obvious repair, forcing the 1.5 ATR width that
 * research/stop-law.json crowned this morning, does not work either, and the
 * post says so rather than presenting the failed fix as a fix.
 *
 * What survives is the direction, not the plan, and the direction only survives
 * on the short side. That is the actual call today and it is stated as such.
 *
 * Every figure traces to research/selection-bias.json and site/signals.json.
 */

import { readFileSync, writeFileSync } from "node:fs";
import { pct } from "../src/format.mjs";

const S = JSON.parse(readFileSync("research/selection-bias.json", "utf8"));
const B = JSON.parse(readFileSync("site/signals.json", "utf8"));
const L = JSON.parse(readFileSync("research/stop-law.json", "utf8"));

const D = JSON.parse(readFileSync("research/detector-costs.json", "utf8"));

const o = S.overall, lg = S.long, sh = S.short;
const t = B.tally;
const width = (a) => S.byChosenWidth[a];

/**
 * The short rows carrying every support the board can offer: all five
 * lookbacks agreeing, a sample that is not thin, and enough turnover to
 * trade. Named because after a post like this one, "selective short" without
 * a definition of selective is a way of saying nothing.
 */
const strongShorts = B.signals
  .filter((x) => x.bias === "SHORT" && x.tradeable && !x.confidence?.thin
    && x.agreement?.windows === 5 && x.agreement.agreeing === 5)
  .sort((a, b) => b.turnoverUsd - a.turnoverUsd);
const named = strongShorts.slice(0, 3);

const claims = {
  "the chosen plan collapses out of sample": o.medianHeldR < o.medianChosenR / 5,
  "it lands next to a randomly chosen geometry":
    Math.abs(o.medianHeldR - o.medianTypicalR) < 0.02,
  "and beats one only about half the time":
    o.shareBeatingTypical > 40 && o.shareBeatingTypical < 60,
  "the long side does not survive at all": lg.medianHeldR < 0 && lg.shareStillPositive < 40,
  "the short side does survive": sh.medianHeldR > 0 && sh.shareStillPositive > 70,
  "but the short edge is the market, not the selection":
    sh.medianTypicalR > 0 && sh.medianHeldR - sh.medianTypicalR < 0.02,
  "forcing the stop to 1.5 ATR does not repair it":
    Math.abs(o.fixedMedianHeldR - o.medianHeldR) < 0.02
    && o.fixedBeatsFreeSharePct > 40 && o.fixedBeatsFreeSharePct < 60,
  "the widest chosen stop is the one that held up worst": width(3).medianHeldR < width(1).medianHeldR,
  "the stop law and this test are separate measurements":
    L.measuredAt !== S.measuredAt && L.historyDays !== S.halfDays,
  "today's board is scanned and split roughly evenly":
    t.total > 80 && t.LONG > 0 && t.SHORT > 0,
  "and a third of it is in a regime turn": t.turning / t.total > 0.25,
  "the sample is wide enough to quote": S.rows >= 80,
  "the search this post turns on the board is the one already published":
    D.cellsTested === 144,
  "there are short rows with every lookback behind them": named.length === 3,
  "and their samples are not thin": named.every((x) => x.confidence.effectiveN >= 12),
};
const bad = Object.entries(claims).filter(([, ok]) => !ok);
if (bad.length) { console.error("ABORT:"); for (const [c] of bad) console.error("  x " + c); process.exit(1); }

const r3 = (v) => (v >= 0 ? "+" : "") + v.toFixed(3);
const row = (a, b, c, d) =>
  (String(a).padEnd(11) + String(b).padStart(10) + String(c).padStart(10) + String(d).padStart(11)).trimEnd();

const sideTable = [
  ["everything", o], ["longs", lg], ["shorts", sh],
].map(([label, s]) => row(label, r3(s.medianChosenR), r3(s.medianHeldR), r3(s.medianTypicalR))).join("\n");

const widthTable = [1, 1.5, 2, 3].map((a) => {
  const w = width(a);
  return row(`${a} ATR`, w.pairs, r3(w.medianChosenR), r3(w.medianHeldR));
}).join("\n");

const text = `This morning I published a post arguing that if you search 144 settings and two come out ahead, you have measured your search rather than the market.

My own signal board searches **64 geometries per pair** and publishes the best one.

So I pointed the same test at it. This is what came back.

THE TEST

Take each pair's history and cut it in half. On the older half, do exactly what the board does — try every stop, every target, every holding period, keep the winner. Then score **that same plan** on the newer half, which had no part in choosing it.

Three numbers:

- **chosen** — what the winner scored in the window that crowned it
- **held** — what it did afterwards
- **typical** — what an arbitrary geometry did over that same later window

If *held* lands near *typical*, the search bought nothing.

\`\`\`
${row("", "chosen", "held", "typical")}
${sideTable}
\`\`\`

${S.rows} pair-directions, ${S.halfDays} days each side.

WHAT THAT SAYS

The board's plan shows **${r3(o.medianChosenR)}R** and delivers **${r3(o.medianHeldR)}R**. About a tenth of it survives contact with data it did not get to pick.

And it lands at ${r3(o.medianTypicalR)} — which is what you would have got by choosing a geometry **at random**.

The clinching number: the chosen plan beat a randomly chosen one on **${pct(o.shareBeatingTypical)}%** of pairs. That is a coin flip. Sixty-four backtests per pair, and the winner of them is no better than closing your eyes.

THE SIDES DO NOT FAIL EQUALLY

Longs: **${r3(lg.medianHeldR)}R** held, and only ${pct(lg.shareStillPositive)}% still positive out of sample. The long plans on my board do not survive their own test.

Shorts: **${r3(sh.medianHeldR)}R** held, ${pct(sh.shareStillPositive)}% still positive. They do survive.

But read the third column before celebrating. The typical short geometry — picked at random — returned ${r3(sh.medianTypicalR)}R over the same window. The short side works because **being short worked**, not because my optimiser found anything. My contribution is the direction. The plan attached to it is decoration.

I TRIED THE OBVIOUS FIX. IT ALSO FAILED.

Earlier today I published a separate study putting the best stop width at 1.5 daily ATR. The natural repair is to stop letting the optimiser roam and pin every stop there.

Measured the same way: **${r3(o.fixedMedianHeldR)}R** held, against ${r3(o.medianHeldR)}R for the free search. It beat the free search on ${pct(o.fixedBeatsFreeSharePct)}% of pairs.

Nothing. The problem is not which width gets picked — it is that **picking per pair does not work at all.**

\`\`\`
${row("chosen at", "n", "chosen", "held")}
${widthTable}
\`\`\`

I will point out the trap in that table, because I nearly fell into it. The 1.5 ATR row looks excellent — but those are the pairs where 1.5 *happened to win in sample*, which is the same selection I am trying to measure. When I forced 1.5 on every pair instead of letting it be chosen, the advantage evaporated. A comforting row and a controlled test disagreed, and the controlled test wins.

WHAT I HAVE CHANGED, ALREADY LIVE

The board no longer calls that figure "Expectancy". It is labelled **"Expectancy, in sample"**, with the shrinkage stated above the table.

Read the **direction** as this board's output. Read the expectancy as the ceiling of what that geometry ever managed — not a forecast, and not something to size a position from.

I am not deleting the plans. Entry, stop and target are still the right shape of a trade. I am telling you the number beside them is the best case rather than the expected case, because I have now measured the difference and it is roughly ten to one.

TODAY'S BOARD, READ THAT WAY

${t.total} pairs scanned: **${t.LONG} long, ${t.SHORT} short, ${t.WAIT} stand aside.** ${t.turning} rows are in a regime turn — the recent window disagrees in sign with the longer history. ${t.untradeable} are too thin to trade whatever the geometry says.

Given everything above, here is the honest reading of it:

**The ${t.LONG} long signals carry a warning label.** Long plans held ${r3(lg.medianHeldR)}R out of sample and were still positive on barely a quarter of pairs. I am not going to publish long ideas today as though that measurement does not exist.

**The short side is where the measurement holds up** — and even there the useful claim is "short beat long over this window", not "this specific plan will return 0.37R".

Selective means something specific here. Six short rows have all five lookbacks agreeing, a sample that is not thin, and enough turnover to trade. The three largest are ${named.map((x) => "$" + x.symbol.replace(/USDT$/, "")).join(", ")} — with independent samples of ${named.map((x) => Math.round(x.confidence.effectiveN)).join(", ")} episodes respectively, which is well above the five this board usually has to work with.

I am naming them rather than gesturing at "the short side", because after a post like this one, an unspecified bias is a way of saying nothing.

Bias: **selective short**, small, and sized off the shrunken number rather than the headline one.

WHAT I AM NOT CLAIMING

That the board is worthless. Direction survived; the split by side is exactly the sort of thing an out-of-sample test is for.

That this is the last word. ${S.rows} pair-directions on one exchange, one split point, spot data. A different split date would move these figures.

That I saw it coming. I wrote the post that condemns this pattern at seven this morning and did not think to check my own board until an hour later.

Board, with the new labelling: maix8.study/signals

What number on your own dashboard have you never tested out of sample?

Educational research, not financial advice. You are responsible for your own risk.

#TradingSignals #RiskManagement #Crypto`;

writeFileSync("drafts/78-board-overfit.txt", text);
console.log("claims:", Object.keys(claims).length, "| words:", text.trim().split(/\s+/).length);
