/**
 * Post 73 — the watchlist note, corrected, in plain language.
 *
 * Written deliberately simply. Every term that could send a reader to a
 * glossary is explained in the sentence that uses it, numbers are given with
 * what they mean rather than alone, and no sentence assumes the reader already
 * trades. The subject is not hard; the usual vocabulary is what makes it look
 * hard.
 *
 * The structure is a correction of a note that got four things right and three
 * wrong, so it leads with the right ones. A correction that opens by scoring
 * points teaches nobody anything.
 *
 * Sources are the two research runs from the same minute, not the signal
 * board — the board has been cited by two posts published today and re-running
 * it to refresh prices would desync them.
 */

import { readFileSync, writeFileSync } from "node:fs";
import { pct } from "../src/format.mjs";

const C = JSON.parse(readFileSync("research/watchlist-post-check.json", "utf8"));
const S = JSON.parse(readFileSync("research/watchlist-stages.json", "utf8"));

const stage = Object.fromEntries(S.rows.map((r) => [r.asset, r]));
const perf = C.perf;
const ORDER = ["GIGGLE", "BNB", "ENA", "SOL", "ETH", "BTC", "ICP"];

const byMove = [...ORDER].sort((a, b) => perf[b].change24hPct - perf[a].change24hPct);
const strongest = byMove[0];
const rejections = C.bnb.touches4h.rejected;
const closesAbove = C.bnb.recentCloses.filter((c) => c.aboveZone).length;

const claims = {
  "the resistance really did reject before": rejections >= 3,
  "BNB has not closed above the zone once in ten days": closesAbove === 0,
  "BNB is still under its own 30-day high": C.bnb.clearsPriorHighBy < 0,
  "GIGGLE is the strongest name, not BNB": strongest === "GIGGLE",
  "and it leads on every horizon": ["change24hPct", "change7dPct", "change30dPct"]
    .every((k) => ORDER.every((a) => a === "GIGGLE" || perf.GIGGLE[k] >= perf[a][k])),
  "ENA is not the cleanest structure": perf.ENA.overheadPct > perf.ICP.overheadPct
    && perf.ENA.overheadPct > perf.BNB.overheadPct,
  "ENA is the only altcoin down over a week": perf.ENA.change7dPct < 0,
  "ICP fell the most today": ORDER.every((a) => a === "ICP" || perf.ICP.change24hPct <= perf[a].change24hPct),
  "the two most durable calls are shorts": stage.SOL.call.bias === "SHORT" && stage.ETH.call.bias === "SHORT"
    && stage.SOL.call.agreeing === stage.SOL.call.windows && stage.ETH.call.agreeing === stage.ETH.call.windows,
  "almost nothing has rising participation": ORDER.filter((a) => stage[a].metrics.volumeTrendPct > 0).length <= 1,
};
const bad = Object.entries(claims).filter(([, ok]) => !ok);
if (bad.length) { console.error("ABORT:"); for (const [c] of bad) console.error("  x " + c); process.exit(1); }

const row = (a, b, c, d) =>
  (String(a).padEnd(9) + String(b).padStart(9) + String(c).padStart(9) + String(d).padStart(11)).trimEnd();

const moveTable = byMove
  .map((a) => row(a, `${pct(perf[a].change24hPct)}%`, `${pct(perf[a].change7dPct)}%`, `${pct(perf[a].change30dPct)}%`))
  .join("\n");

const stuckTable = ["BNB", "ICP", "ENA", "SOL", "ETH", "BTC"]
  .sort((a, b) => perf[a].overheadPct - perf[b].overheadPct)
  .map((a) => row(a, `${pct(perf[a].overheadPct)}%`, "", ""))
  .join("\n");

const text = `A watchlist note went round this morning covering seven coins. I checked every number in it. Four things were right and three were wrong, and one of the wrong ones was the headline.

Here is the plain version.

WHAT THE NOTE GOT RIGHT

It said $BNB has been blocked at around $615 many times before. **True.** I counted every time the price reached that area over the last three months: **${C.bnb.touches4h.total} times**, and on **${rejections}** of them the price fell back afterwards. That is a real ceiling, not a story.

It also said Solana is doing better than Bitcoin and Ethereum today. True — SOL is up ${pct(perf.SOL.change24hPct)}% while BTC is ${pct(perf.BTC.change24hPct)}%.

And it said ICP is pulling back. True, and more than the note suggested: ICP is **${pct(perf.ICP.change24hPct)}%** today, the weakest of the seven.

WHAT IT GOT WRONG, AND WHY IT MATTERS

**1. BNB has not broken through yet.**

The note says the ceiling is broken. The price is $${C.bnb.price.toFixed(2)}. The ceiling area runs from $612 to $618. So the price is *inside* the ceiling, not above it.

Here is the simplest test I know. A price can poke above a level for an hour and fall straight back. What counts is where it finishes the day. Over the last ten days, the number of days BNB **finished** above $618 is **${closesAbove}**.

It is also still ${pct(Math.abs(C.bnb.clearsPriorHighBy))}% below its own highest price of the last month.

Touching the ceiling is not the same as going through it. It might go through tomorrow. It has not yet.

**2. BNB is not the strongest coin on the list.**

\`\`\`
${row("", "1 day", "1 week", "1 month")}
${moveTable}
\`\`\`

$GIGGLE is ahead on all three — nearly four times BNB's gain today and five times over the month. The note ranks it fourth and calls it "watch only".

The caution is fair, because GIGGLE is a small coin that moves violently. But "BNB is the standout" is not what the numbers say.

**3. $ENA is the weakest altcoin here, not the cleanest.**

The note calls ENA the best "early" setup with clean structure. Two numbers disagree.

First, ENA is **${pct(perf.ENA.change7dPct)}%** over the past week — the only altcoin on the list that is down.

Second, this measure, which is the one I trust most:

\`\`\`
${row("", "stuck above", "", "")}
${stuckTable}
\`\`\`

That column is the share of the last month's trading that happened at a **higher** price than today. Those are people sitting on a loss. Many of them sell the moment they get back to break even, so every rally runs into them.

BNB has almost none. ICP has little. ENA has more than both. Calling ENA the cleanest gets the order backwards.

THE THING NOBODY IN THE NOTE MENTIONED

I check every call by running it over five different lengths of history — the last six months, nine months, one year, eighteen months, two years. If an idea only works when you measure it one particular way, it is a property of that measurement, not of the market.

The two ideas that survive all five are **selling** Solana and **selling** Ethereum. The note puts both at the bottom of its list as "just follow the market".

Every other name on the list is backed by one or two of the five at best.

And one more thing worth knowing: on six of these seven coins, **trading activity is falling**, not rising. ICP is the single exception. Prices are moving, but fewer people are taking part. That is usually a market waiting rather than a market starting.

HOW TO CHECK ANY OF THIS YOURSELF

You do not need my tools for the most useful one. When someone says a level has been broken, ask: **how many daily candles have closed above it?** If the answer is none, it has been touched, not broken.

When someone says a coin is "clean" or "early", ask what number they mean, and over what period. "Clean" is an adjective. The share of buyers sitting on a loss is a number, and it comes from public data in one step.

Bias: **stand aside**. Nothing here is a strong enough case to size up. The most durable readings point down on the majors, participation is falling nearly everywhere, and the calls that look best are the ones with the least history behind them.

To be clear about my own limits: these readings rest on roughly five independent periods each, which is a small sample. Funding and open interest data are blocked from this machine, so nothing here uses them. And prices here are spot prices — a futures screen will show slightly different numbers.

Every figure and the daily board: maix8.study/signals

Which one of these coins do you think I have read wrong?

Educational research, not financial advice. You are responsible for your own risk.

#Crypto #Trading #RiskManagement`;

writeFileSync("drafts/73-watchlist.txt", text);
console.log("claims:", Object.keys(claims).length, "| words:", text.trim().split(/\s+/).length);
