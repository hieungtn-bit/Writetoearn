/**
 * Post 74 — buying the gainers list, measured over a thousand days.
 *
 * Yesterday a reader sent the gainers tab and I answered with two anecdotes
 * and a confident line about lists of moves that have already happened. The
 * anecdotes held up spectacularly today. The general claim did not hold up as
 * well, and this post has to say so, because a channel that only publishes the
 * measurements that flatter its rhetoric is doing the thing it criticises.
 *
 * The finding is real but narrower than I implied: buying the top ten as a
 * group is only slightly worse than buying anything, while buying the single
 * biggest gainer is clearly worse. The size of the effect scales with how
 * extreme the move was.
 *
 * Every figure traces to research/gainers-study.json and research/today-market.json.
 */

import { readFileSync, writeFileSync } from "node:fs";
import { pct } from "../src/format.mjs";

const G = JSON.parse(readFileSync("research/gainers-study.json", "utf8"));
const M = JSON.parse(readFileSync("research/today-market.json", "utf8"));

const at = (h) => G.table.find((r) => r.holdDays === h);
const solo = (h) => G.biggestGainer.find((r) => r.holdDays === h);
const a = M.assets;

const claims = {
  "yesterday's top two collapsed today": a.HOLO.chg < -15 && a.PROM.chg < -10,
  "the market is mostly red": M.upSharePct < 40,
  "the biggest gainer of a day does badly": solo(7).medianPct < -2,
  "and it is worse the longer you hold": solo(14).medianPct < solo(1).medianPct,
  "the top ten as a group is only slightly worse": Math.abs(at(7).differencePct) < 1,
  "which is weaker than I claimed yesterday": Math.abs(at(1).differencePct) < 0.5,
  "the whole universe drifts down over these windows": at(7).baselineMedianPct < 0,
  "the study covers a real span": G.daysUsed > 500 && G.pairsLoaded > 50,
  "the majors barely moved while the movers collapsed": Math.abs(a.BTC.chg) < 2 && a.KAITO.chg < -20,
};
const bad = Object.entries(claims).filter(([, ok]) => !ok);
if (bad.length) { console.error("ABORT:"); for (const [c] of bad) console.error("  x " + c); process.exit(1); }

const row = (x, b, c, d) =>
  (String(x).padEnd(9) + String(b).padStart(11) + String(c).padStart(12) + String(d).padStart(11)).trimEnd();

const groupTable = [1, 3, 7, 14].map((h) =>
  row(`${h} day${h > 1 ? "s" : ""}`, `${pct(at(h).gainersMedianPct)}%`, `${pct(at(h).baselineMedianPct)}%`, `${pct(at(h).differencePct)}`)).join("\n");

const soloTable = [1, 3, 7, 14].map((h) =>
  row(`${h} day${h > 1 ? "s" : ""}`, `${pct(solo(h).medianPct)}%`, `${pct(solo(h).upPct)}%`, "")).join("\n");

const text = `Yesterday someone sent me the "Top Gainers" tab and asked why my scanner misses those names. I gave two reasons and one confident line: a gainers list is a list of moves that have already happened.

Today, one day later:

\`\`\`
             yesterday        today
$HOLO           +38.30%     ${pct(a.HOLO.chg)}%
$PROM           +22.67%     ${pct(a.PROM.chg)}%
\`\`\`

They were the two names at the top of that screenshot.

That is a satisfying result and I do not entirely trust satisfying results, so I measured the general claim properly. It turns out I was **partly wrong**, and the part I was wrong about matters.

THE TEST

At the close of every day, rank every liquid pair by that day's move. Buy the top ten. Hold. Compare against buying an arbitrary liquid pair the same day — because "gainers fall" and "everything fell that week" look identical without a baseline.

${G.pairsLoaded} pairs, ${G.daysUsed} days.

\`\`\`
${row("hold", "gainers", "baseline", "diff")}
${groupTable}
\`\`\`

The top ten do underperform. But look at the size of it: **${pct(at(1).differencePct)}** at one day, **${pct(at(7).differencePct)}** at a week, and **${pct(at(14).differencePct)}** at two weeks.

That is not the destruction my line yesterday implied. Buying the day's top ten is a slightly below-average way to buy — not a trap.

I said something stronger than the data supports, so I am correcting it here rather than quietly moving on.

WHERE THE REAL EFFECT IS

Now the same question about the **single biggest gainer** of each day:

\`\`\`
${row("hold", "median", "up", "")}
${soloTable}
\`\`\`

That is a different picture entirely. The number one name loses **${pct(Math.abs(solo(7).medianPct))}%** over a week and **${pct(Math.abs(solo(14).medianPct))}%** over two, and it finishes higher only ${pct(solo(14).upPct)}% of the time. Across ${solo(14).n} days.

So the effect is real and it **scales with how extreme the move was**. Tenth place is roughly ordinary. First place is a bad trade.

Which is exactly the row people screenshot.

THE NUMBER UNDER BOTH TABLES

Notice the baseline column. It is negative at every horizon — ${pct(at(7).baselineMedianPct)}% over a week, ${pct(at(14).baselineMedianPct)}% over two.

That is not a statement about gainers. It is a statement about this universe: the median liquid altcoin drifts **down** over these windows. Most of what looks like a bad entry is a bad asset class to be long of by default.

TODAY

${M.pairs} pairs trading. **${M.up} up, ${M.down} down** — ${pct(M.upSharePct)}% green. ${M.downOver5} pairs are down more than 5%; ${M.upOver5} are up more than 5%.

The majors barely moved: BTC ${pct(a.BTC.chg)}%, ETH ${pct(a.ETH.chg)}%, SOL ${pct(a.SOL.chg)}%, BNB ${pct(a.BNB.chg)}%.

The damage is entirely in the names that ran yesterday: KAITO ${pct(a.KAITO.chg)}%, BABY ${pct(a.BABY.chg)}%, BICO ${pct(a.BICO.chg)}%, alongside HOLO and PROM.

That is what a quiet tape with an unwinding speculative edge looks like. Nothing happened to Bitcoin today. Plenty happened to whatever was on a leaderboard yesterday.

WHAT TO DO WITH THIS

Do not read a gainers list as a shopping list — but do not read it as a blacklist either. Tenth place performs about like anything else. The specific thing worth avoiding is the top of it, and the reason is not mystical: by the time a move is extreme enough to rank first, the part you can still capture is small and the part that can be given back is large.

The honest version of yesterday's line: **the further up that list a name sits, the more of its move is already behind it.**

Bias: **stand aside**. ${pct(M.upSharePct)}% of the market is green, participation is falling across the names I track, and the strongest readings on my board point down on the majors.

A limit worth stating: this study ranks within the hundred most-traded pairs, not all 490, so it measures the gainers list of a liquid universe rather than the full exchange. Extending it to the small end would probably make the top-place effect worse, not better — but I have not measured that, so I am not claiming it.

Board and every figure: maix8.study/signals

What is the largest one-day gain you have ever bought into, and how did it end?

Educational research, not financial advice. You are responsible for your own risk.

#Crypto #RiskManagement #Trading`;

writeFileSync("drafts/74-gainers.txt", text);
console.log("claims:", Object.keys(claims).length, "| words:", text.trim().split(/\s+/).length);
