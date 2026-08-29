/**
 * Post 92 — the filter, and the answer I got wrong this morning.
 *
 * A reader asked why nothing warned when the market turned. I answered that
 * the engine kept reading short, and that the fault was a 180-day window and
 * a median too slow to move. That answer was wrong, and it was wrong in the
 * most embarrassing direction available: I described the machine from memory
 * instead of opening it.
 *
 * The board read LONG on 56 of 100 rows this morning and 59 of 100 tonight.
 * Its long share has risen on every edition since 14 August. The bias layer
 * saw the turn. Every one of those calls then died in the filter — 29 of the
 * 59 have enough history for five agreement windows, 5 clear the windows, and
 * none clear twelve independent episodes.
 *
 * So the post has to do two things and cannot skip either.
 *
 *   Correct the record, in the opening, without softening it. A desk whose
 *   only asset is that its numbers are checkable does not get to be casually
 *   wrong about its own numbers.
 *
 *   Then report what the count actually shows, which is worse than the wrong
 *   answer was. Agreement admits 87% of short rows and 17% of long ones. The
 *   windows span 180 to 730 days, so a direction that started paying three
 *   weeks ago cannot appear in four of five. The filter cannot admit a change
 *   of trend. Not "is slow to" — cannot, by construction.
 *
 * The temptation is to end on a fix, and the post refuses. The reason the
 * filter exists is itself measured: findings that live in one lookback do not
 * survive out of sample. Ripping it out to catch this rally would be picking
 * the cell that would have won, after looking. What gets published instead is
 * the named, unrun measurement — does the asymmetry predict anything — and an
 * admission that the board being long today is not evidence long was right,
 * because 42.2% over three days applies to me too.
 *
 * Figures: research/market-scan.json, research/event-window.json,
 * research/persistence.json.
 */

import { readFileSync, writeFileSync } from "node:fs";

const M = JSON.parse(readFileSync("research/market-scan.json", "utf8"));
const B = M.breadth, E = M.engine, H = M.boardSummary, R = M.baseRates;
const morning = M.morningComparison;
const [lng, sht] = E.funnel;
/**
 * This morning's scan, read out of the archive rather than retyped.
 *
 * The line it feeds is the whole correction — the board was long while the
 * book was short — so a hardcoded "56 of 100" would be the one figure in the
 * post that no reader could check and no gate could catch.
 */
const morningScan = M.boardHistory.filter((h) => h.day === M.boardSummary.lastDay)[0];

const claims = {
  "the board read long on most rows tonight":
    E.tally.LONG > E.tally.SHORT,
  "and it read long on most rows this morning too, while the book was short":
    morningScan != null && morningScan.long > morningScan.short
    && morningScan.offered > 0 && morningScan.offeredDirections.join() === "short",
  "its long share rose from the first edition to the last":
    H.longSharePctLast > H.longSharePctFirst,
  "no edition ever offered a single long":
    H.editionsOfferingAnyLong === 0 && H.positions > 20,

  "not one long row survived the filter":
    lng.offered === 0,
  "and the shorts that did survive are all the column offered":
    sht.offered > 0 && sht.symbols.length === sht.offered,
  "agreement admits most short rows and few long ones":
    sht.unanimousSharePct > 80 && lng.unanimousSharePct < 25,
  "the longs that cleared agreement all failed on episode count":
    lng.unanimous > 0 && lng.deepEnough === 0,
  "half the board cannot fill five windows at all":
    E.rowsWithFiveWindows < E.rows,

  "the market rose again into the evening rather than fading":
    B.upSharePct > 65 && morning != null && B.medianChangePct > morning.medianChangePct,
  "my book on this move was destroyed":
    morning.bookStopped >= morning.bookPositions - 1 && morning.bookTotalR < -10,

  "the trigger family that would have caught it is measured below a coin toss":
    R.continuation3dPct < 50,
  "and direction persistence is a coin toss at a month":
    Math.abs(R.persistence30dPct - 50) < 1,
  "the five names it can still propose are named, not just counted":
    sht.symbols.length === sht.offered && sht.symbols.every((s_) => s_.endsWith("USDT")),
};
const bad = Object.entries(claims).filter(([, ok]) => !ok);
if (bad.length) { console.error("ABORT:"); for (const [c] of bad) console.error("  x " + c); process.exit(1); }

const sign = (v, dp = 2) => `${v >= 0 ? "+" : ""}${v.toFixed(dp)}`;

/**
 * The five names, written out rather than counted.
 *
 * "Five shorts survived" is a number a reader has to take on trust. Naming
 * them is the same disclosure the record page makes, and it means the one
 * thing this system is still capable of proposing is stated openly on the day
 * its last twenty proposals lost.
 */
const shortNames = sht.symbols.map((s_) => s_.replace("USDT", "")).join(", ");

const row = (a, b, c, d, e, f) =>
  (String(a).padEnd(9) + String(b).padStart(6) + String(c).padStart(12)
    + String(d).padStart(12) + String(e).padStart(9) + String(f).padStart(10)).trimEnd();

const funnelTable = [
  row("", "rows", "5 windows", "unanimous", "n>=12", "offered"),
  row("LONG", lng.rows, lng.haveFiveWindows, lng.unanimous, lng.deepEnough, lng.offered),
  row("SHORT", sht.rows, sht.haveFiveWindows, sht.unanimous, sht.deepEnough, sht.offered),
].join("\n");

/** One line per day, latest scan of that day, so a re-scan is not a second edition. */
const byDay = new Map();
for (const h of M.boardHistory) byDay.set(h.day, h);
const historyTable = [...byDay.values()]
  .filter((h) => h.offered > 0)
  .map((h) => (String(h.day).padEnd(12)
    + `${h.long}/${h.rows}`.padStart(8)
    + `${h.longSharePct.toFixed(0)}%`.padStart(7)
    + String(h.offered).padStart(10)
    + `  ${h.offeredDirections.join(", ")}`).trimEnd())
  .join("\n");

const text = `A reader asked me this morning why my system did not warn when the market turned.

I gave an answer. It was wrong.

I said the engine kept reading short, and blamed a 180-day window and a median too slow to move. That was me describing my own machine from memory instead of opening it. Then I opened it.

**The board read LONG on ${E.tally.LONG} of ${E.tally.total} rows tonight. It read LONG on ${morningScan.long} of ${morningScan.rows} this morning — while my book was short and losing.**

The bias layer saw the turn. It has been seeing it for a week.

WHERE EVERY LONG DIED

\`\`\`
${funnelTable}
\`\`\`

${lng.rows} rows say long. ${lng.haveFiveWindows} of them have enough price history to fill all five agreement windows. ${lng.unanimous} clear the windows. **${lng.deepEnough} clear the requirement of twelve independent episodes.**

Zero. Not a small number — zero. **No long position can be offered by this system at all**, and I did not know that until tonight.

The shorts: ${sht.rows} rows, ${sht.unanimous} unanimous, ${sht.offered} offered — ${shortNames}. Those five are the entire book this machine is able to propose tonight.

**Agreement admits ${sht.unanimousSharePct.toFixed(0)}% of short rows and ${lng.unanimousSharePct.toFixed(0)}% of long ones.**

WHY, AND WHY IT IS NOT A BUG

The five agreement windows span 180 to 730 days. A row passes only if the direction pays across nearly all of them.

A direction that started paying three weeks ago cannot do that. It has not existed long enough to appear in four of five windows. So the filter cannot admit a change of trend — not "is slow to", cannot, by construction.

And that is what I built it to do. It exists because this desk measured that a signal living inside one lookback does not survive out of sample. The rule is right. What was never counted is the price of it, and the price is on the table above.

SEVEN EDITIONS

\`\`\`
${(String("day").padEnd(12) + "long/rows".padStart(8) + "share".padStart(7) + "offered".padStart(10) + "  side")}
${historyTable}
\`\`\`

The board's long share went from ${H.longSharePctFirst.toFixed(0)}% to ${H.longSharePctLast.toFixed(0)}%. Across ${H.editions} editions and ${H.positions} positions, the number of longs offered was **${H.editionsOfferingAnyLong}**.

That is not a market call going wrong. That is a machine that had one answer available.

THE TAPE, TONIGHT

${B.pairs} pairs, ${B.upSharePct.toFixed(1)}% green, median ${sign(B.medianChangePct)}%. This morning it was ${morning.upSharePct.toFixed(1)}% green at ${sign(morning.medianChangePct)}%. It did not fade into the evening; it went further.

My book on this move: ${morning.bookStopped} of ${morning.bookPositions} stopped, ${sign(morning.bookTotalR, 2)}R.

WHAT I AM NOT GOING TO DO

I am not going to remove the filter because it cost me this week.

That is choosing the setting that would have won, after looking at what won — the exact error this desk has published about twice. The filter's reason is measured. My annoyance is not a measurement.

I am also not going to claim the board was right. It reads long now, and continuation over three days is **${R.continuation3dPct.toFixed(1)}%** across ${R.continuation3dWindows} independent windows. Direction persistence at a month is **${R.persistence30dPct.toFixed(2)}%**. Those numbers do not become friendlier because they now point my way.

WHAT I WILL MEASURE

One question, named before it is run so I cannot pick the answer afterwards:

**Does the agreement filter's asymmetry predict anything?** A rule that passes ${sht.unanimousSharePct.toFixed(0)}% of one direction and ${lng.unanimousSharePct.toFixed(0)}% of the other is either a quality control or a permanent short bet wearing one. Matched controls: same symbols, same months, same stops, same exits, the filter on and off. If the filtered set does not beat the unfiltered set, the filter is a directional position and I have been running it without knowing.

I will publish that whichever way it comes out. The result of this week suggests I should not assume I will like it.

Bias: WAIT

Not as a hedge — as the only position the evidence supports. The one direction my system can offer is the one that just lost ${morning.bookStopped} of ${morning.bookPositions} positions. The direction it reads on most rows, it cannot act on. And the short-horizon triggers that would resolve the disagreement measure ${R.continuation3dPct.toFixed(1)}% over three days.

A desk that cannot tell you which way to go should say so, not pick one to look decisive. $BTC is where it is; I have no measured claim about where it goes next.

Every figure: research/market-scan.json, research/event-window.json, research/persistence.json — all at maix8.study/data/

The losing book, at full size: maix8.study/record

If your system has only ever given you one kind of answer, how would you find out?

Educational research, not financial advice. You are responsible for your own risk.

#Bitcoin #Trading #Quant #RiskManagement`;

writeFileSync("drafts/92-the-filter.txt", text);
console.log("claims:", Object.keys(claims).length, "| words:", text.trim().split(/\s+/).length);
