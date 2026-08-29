/**
 * Post 84 — a joke, landed on a measurement.
 *
 * A reader sent the old stock-market gag: a man is scammed, the police recover
 * his money, and the officer tells him he is lucky, because if he had actually
 * bought the shares nobody could have got it back. It adapts to crypto without
 * changing a word.
 *
 * A meme post on a desk like this one has to earn its place, and the way it
 * earns it is by being *checkable*. The punchline is a claim about base rates,
 * and this desk has the base rate: the median liquid pair returns -16.72% over
 * ninety days. So the joke gets told, and then the number is put underneath it,
 * and the number is what makes it land.
 *
 * Two things it deliberately does not do. It does not imply the asset class is
 * a fraud — the officer's line is about a median, not a conspiracy, and saying
 * otherwise would be the same overclaiming this channel spent the week deleting.
 * And it keeps the scam-avoidance section to things that are actually true
 * rather than a lecture, because the reader came for a joke.
 *
 * Short on purpose. Figures trace to research/multiplier-audit.json and
 * research/market-call.json.
 */

import { readFileSync, writeFileSync } from "node:fs";
import { pct } from "../src/format.mjs";

const A = JSON.parse(readFileSync("research/multiplier-audit.json", "utf8"));
const M = JSON.parse(readFileSync("research/market-call.json", "utf8"));
const b = M.breadth;
const doubled = A.bands.map((x) => x.forward[90].doubledSharePct);

const claims = {
  "the median pair loses over ninety days": A.baseline[90].medianPct < -10,
  "and over thirty": A.baseline[30].medianPct < 0,
  "the odds of doubling are small": Math.max(...doubled) < 6,
  "and flat regardless of how far it already fell":
    Math.max(...doubled) - Math.min(...doubled) < 2,
  "the tape today is mostly red": b.upSharePct < 45,
  "the study behind the punchline is wide": A.labelledDays > 20000 && A.universe >= 50,
};
const bad = Object.entries(claims).filter(([, ok]) => !ok);
if (bad.length) { console.error("ABORT:"); for (const [c] of bad) console.error("  x " + c); process.exit(1); }

const row = (a, c) => (String(a).padEnd(30) + String(c).padStart(10)).trimEnd();

const text = `A friend of mine wanted to get into crypto.

He did his research the modern way: joined a Telegram group with forty thousand members and a pinned post about a guaranteed 10x.

The admin took his deposit and vanished.

He filed a police report. Months later — genuinely months — they tracked the man down and recovered the funds. The officer handed the money back and said:

**"Lucky you got scammed. If you had actually bought the coin, we could not have got this back for you."**

I laughed. Then I did the thing I always do, which is ruin a joke by measuring it.

\`\`\`
${row("scammed, then refunded", "0.00%")}
${row("actually bought the coin", `${pct(A.baseline[90].medianPct)}%`)}
\`\`\`

Across ${A.universe} pairs and **${A.labelledDays.toLocaleString("en-US")} pair-days**, the median liquid altcoin returns **${pct(A.baseline[90].medianPct)}% over ninety days**. Not during a crash. That is the ordinary case, measured over years.

The officer was right, and he was right by ${Math.abs(A.baseline[90].medianPct).toFixed(1)} percentage points.

WHILE WE ARE HERE, THE 10x QUESTION

Share of positions that **doubled** inside ninety days: between ${Math.min(...doubled).toFixed(2)}% and ${Math.max(...doubled).toFixed(2)}%.

And measured yesterday: that number does not improve no matter how far the coin has already fallen. "It is down 90%, it has to bounce" has the same odds as everything else on the board.

The pinned post promised a 10x. The measurement offers about one chance in twenty of a 2x.

TODAY, FOR CONTEXT

${b.pairs} USDT pairs trading. **${pct(b.upSharePct)}% green.** The median pair is ${pct(b.medianChangePct)}% on the day. $BTC is not what is hurting anyone here — the median altcoin is doing that on its own.

THE PART THAT IS NOT A JOKE

The scam was avoidable. The loss would not have been. Two different problems, and only one of them has a fix:

**Nobody who can actually trade needs your deposit to do it.**

**A guaranteed return is the guarantee that it is a lie.** Anything with a real edge has a bad week.

**If withdrawing is harder than depositing, you already have your answer.**

None of this means the asset class is a fraud. It means the *median* outcome is negative and the tail is what people screenshot. Those are two different sentences and only one of them ends up in a pinned message.

Trade the base rate you can measure. Not the one somebody sent you.

Board and every figure: maix8.study/signals

What is the most confident promise anyone has ever made you about a coin?

Educational research, not financial advice. You are responsible for your own risk.

#Crypto #RiskManagement #Bitcoin`;

writeFileSync("drafts/84-meme.txt", text);
console.log("claims:", Object.keys(claims).length, "| words:", text.trim().split(/\s+/).length);
