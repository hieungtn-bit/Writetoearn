/**
 * Post 80 — the metric this desk quotes most often predicts nothing.
 *
 * Overhead supply has led the argument in most posts here for weeks. I called
 * BNB's 3.17% reading "the best number on the board" and "genuinely excellent",
 * and used it as the reason BNB was not a short. I have never once checked
 * whether a low reading is followed by better returns than a high one.
 *
 * It is not. Across 75 pairs and 60,386 labelled days the five overhead bands
 * are indistinguishable, they disagree in sign between the ten- and thirty-day
 * horizons, and the only cell that survives fees is shorting the low-overhead
 * names — the exact opposite of how I have used it.
 *
 * The post has to be unusually direct about which of my own posts this
 * damages, because the alternative is a general lesson about metrics that
 * quietly lets my specific claims stand.
 *
 * Two things are stated carefully rather than glossed. The history uses a
 * daily-bar proxy, and the disagreement between that proxy and the hourly
 * profile the board publishes is measured rather than waved at. And the
 * finding is that overhead does not predict *returns* — it remains a true
 * description of where supply sits, which is a different and smaller claim
 * than the one I was making.
 *
 * Every figure traces to research/overhead-test.json.
 */

import { readFileSync, writeFileSync } from "node:fs";
import { pct } from "../src/format.mjs";

const O = JSON.parse(readFileSync("research/overhead-test.json", "utf8"));
const band = (lo) => O.bands.find((b) => b.band[0] === lo);
const low = band(0), high = band(80);
const t = O.trades, p = O.proxyCheck;

/** The widest gap any band shows against baseline, at either horizon. */
const widestGap = Math.max(...O.bands.flatMap((b) => O.horizons.map((h) => Math.abs(b.forward[h].differencePct))));
const bestCell = Object.entries(t).reduce((a, b) => (a[1].medianNetR > b[1].medianNetR ? a : b));

const claims = {
  "the bands are indistinguishable at both horizons": widestGap < 1,
  "the spread between the extremes is inside noise":
    Math.abs(O.spread10) < 1 && Math.abs(O.spread30) < 1,
  "and it changes sign between the two horizons": Math.sign(O.spread10) !== Math.sign(O.spread30),
  "at ten days the high-overhead band actually did better":
    high.forward[10].differencePct > low.forward[10].differencePct,
  "buying the low-overhead state loses money after costs": t.lowOverheadLong.medianNetR < 0,
  "and it is the worst of the four cells tested":
    Object.values(t).every((c) => c.medianNetR >= t.lowOverheadLong.medianNetR),
  "the only cell that survives fees is shorting it": bestCell[0] === "lowOverheadShort",
  "and even that is barely better than a coin flip":
    t.lowOverheadShort.pairsPositiveNet / t.lowOverheadShort.pairs < 0.6,
  "high overhead is the normal state of this universe": high.sharePct > 35,
  "the whole universe drifts down over these windows":
    O.baseline[10].medianPct < 0 && O.baseline[30].medianPct < 0,
  "the daily proxy usually agrees with the hourly profile": p.medianAbsDifferencePct < 5,
  "but it can be badly wrong on an individual name": p.worstAbsDifferencePct > 20,
  "the study is wide enough to quote": O.pairs >= 50 && O.labelledDays > 20000,
};
const bad = Object.entries(claims).filter(([, ok]) => !ok);
if (bad.length) { console.error("ABORT:"); for (const [c] of bad) console.error("  x " + c); process.exit(1); }

const r3 = (v) => (v >= 0 ? "+" : "") + v.toFixed(3);
const row = (a, b, c, d) =>
  (String(a).padEnd(12) + String(b).padStart(8) + String(c).padStart(11) + String(d).padStart(11)).trimEnd();

const bandTable = O.bands.map((b) => row(
  `${b.band[0]}-${b.band[1]}%`,
  `${pct(b.sharePct)}%`,
  `${pct(b.forward[10].differencePct)}`,
  `${pct(b.forward[30].differencePct)}`,
)).join("\n");

const tradeRow = (a, b, c, d) =>
  (String(a).padEnd(22) + String(b).padStart(9) + String(c).padStart(10) + String(d).padStart(10)).trimEnd();

const tradeTable = [
  ["buy low overhead", t.lowOverheadLong],
  ["buy high overhead", t.highOverheadLong],
  ["short low overhead", t.lowOverheadShort],
  ["short high overhead", t.highOverheadShort],
].map(([n, c]) => tradeRow(n, r3(c.medianExpectancyR), r3(c.medianNetR), `${c.pairsPositiveNet}/${c.pairs}`)).join("\n");

const text = `Every post on this channel quotes **overhead supply** — the share of the last month's turnover that changed hands above the current price. The money currently underwater. The people waiting to get out at breakeven.

I have used it as the headline argument more than any other number I publish. Two days ago I wrote that $BNB's reading of 3.17% was *"the best number on the board"* and *"genuinely excellent"*, and that it was the reason BNB was not a short.

I had never checked whether a low reading is followed by better returns than a high one.

It is not.

THE TEST

Label every day of every pair by its overhead reading. Bucket the days. Compare what followed against the same universe's own baseline — because "low overhead names went up" and "everything went up that month" look identical without one.

${O.pairs} pairs. **${O.labelledDays.toLocaleString("en-US")} labelled days.**

\`\`\`
${row("overhead", "share", "10d vs", "30d vs")}
${bandTable}
\`\`\`

Those last two columns are the entire finding. Every band lands within **${pct(widestGap)} of a percentage point** of the baseline, at both horizons.

Not a weak signal. Not a signal that needs better conditioning. Nothing.

IT IS WORSE THAN NOTHING

Read the top and bottom rows against each other.

At **ten days**, the band I call dangerous — ${high.band[0]}–${high.band[1]}% underwater, a wall of trapped sellers — did **better** than the band I call clean, by ${pct(Math.abs(high.forward[10].differencePct - low.forward[10].differencePct))} of a point. At thirty days it flips the other way by about the same margin.

A metric that changes sign depending on how long you hold, by a margin smaller than a rounding error, is not measuring the thing I said it measures.

CAN YOU TRADE IT? NO.

A gap between medians is not an edge until it survives a stop, a target and a fee. So each extreme band was walked with a **1.5 ATR stop** — the width I published this morning — and a 2:1 target, bar by bar, stop charged first when a bar reaches both.

\`\`\`
${tradeRow("", "gross", "net", "pairs +ve")}
${tradeTable}
\`\`\`

**Buying the low-overhead state — the thing I have been calling bullish — is the worst of the four.** ${r3(t.lowOverheadLong.medianNetR)}R after costs, profitable on ${t.lowOverheadLong.pairsPositiveNet} of ${t.lowOverheadLong.pairs} pairs.

The only cell that clears fees is **shorting** low-overhead names, at ${r3(t.lowOverheadShort.medianNetR)}R. That is the opposite of how I have used the metric — and before anyone acts on it, it is positive on ${t.lowOverheadShort.pairsPositiveNet} of ${t.lowOverheadShort.pairs} pairs, which is a coin flip wearing a decimal point.

There is no trade here in either direction. That is the honest summary.

THE NUMBER THAT REFRAMES EVERY POST I HAVE WRITTEN

Look at the share column again. **${pct(high.sharePct)}% of all days sit in the 80–100% band.**

High overhead is not a warning sign. It is the **normal condition** of this universe. Most of the time, on most coins, most of the recent money is underwater — because the median liquid altcoin drifts down, which is the same baseline column that keeps turning up in these studies: ${pct(O.baseline[10].medianPct)}% over ten days, ${pct(O.baseline[30].medianPct)}% over thirty.

Yesterday I cited $BTC's overhead of about 90% as part of the case for standing aside. That number is barely above the median of everything I scan. It was true and it was not evidence.

WHICH OF MY OWN POSTS THIS DAMAGES

I would rather name them than leave a general lesson floating.

**The BNB posts.** "Almost nobody who bought BNB this month is holding a loss, so there is no wall of sellers on the way up." The mechanism sounds right. It does not pay. Measured, that state is the single worst of the four cells above.

**Every stage read.** Overhead is the first line of the classifier I publish. It still describes where supply sits — that part is real and checkable. It just does not forecast the next move, and I presented it as though it did.

**Yesterday's BTC note.** See above.

WHAT OVERHEAD ACTUALLY IS

It is a true description of the present. Where the money changed hands, and how much of it is above you. That is worth knowing when you are asking *"if this rallies, who is waiting to sell into it"* — a question about mechanics.

It is not a forecast, and I have been using it as one.

THE CAVEAT, WITH A NUMBER

The history has to use a daily-bar proxy: hourly candles reach back only six weeks, so a whole day's turnover gets charged to one side of the price. The board publishes the hourly volume profile instead, which is finer.

So I measured both on the same day across ${p.pairs} pairs. Median disagreement: **${pct(p.medianAbsDifferencePct)} points**. Median proxy ${pct(p.medianProxyPct)}% against median profile ${pct(p.medianProfilePct)}%. Close enough that the buckets above are not an artefact.

On individual names it is not always close — the worst pair disagreed by **${pct(p.worstAbsDifferencePct)} points**. That is a limit on reading any single row of this study, and it is why the conclusion is stated across the universe rather than per coin.

WHAT I AM CHANGING

Overhead stays on the board. It is a real measurement and readers use it.

What stops is **leading an argument with it.** If a post's case rests on a low overhead reading, that post has no case, and I will not be writing "the best number on the board" about a figure that does not predict returns.

Three of the four things I have tested on myself this week came back negative: the stop rule was half wrong, the early detector did not survive fees, my own board's plan keeps a tenth of what it shows. This is the fourth.

That ratio is not a crisis. It is what testing looks like when you were not testing before.

Board and every figure: maix8.study/signals

Which number in your own process have you never checked against what followed it?

Educational research, not financial advice. You are responsible for your own risk.

#RiskManagement #Trading #Crypto`;

writeFileSync("drafts/80-overhead.txt", text);
console.log("claims:", Object.keys(claims).length, "| words:", text.trim().split(/\s+/).length);
