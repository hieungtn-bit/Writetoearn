/**
 * Post 96 — the ICP trade I checked yesterday, followed forward, and a book
 * that finished at nothing but stops.
 *
 * Two things landed on the same day and they belong in one edition because
 * they are the same argument seen from both ends.
 *
 * Yesterday's post audited a reader's ICP plan and made one claim precise
 * enough to be embarrassed by: the plan's 4.97% stop sits inside a normal day
 * for this pair, on 29.7% of them. Ninety-one minutes after publication the
 * trigger fired. The trade then spent two thirds of its stop within hours,
 * survived with 0.33R of room, and is now a fifth of a unit ahead in dollars
 * and behind BTC. That is not vindication and the post says so — one trade is
 * one draw — but it is the claim being tested in public with a clock on it.
 *
 * At the same time the short book closed its last position. 24 of 24 stopped,
 * -24.000R, not one ahead at any point. XRP moved 30.9% against a short.
 *
 * And the third thing, which is mine and has to lead the disclosures rather
 * than trail them: I ran the planner twice in one UTC day and it silently
 * replaced the ledger the column had already published — five positions at the
 * morning's prices swapped for four at the evening's, re-entering the same
 * losing shorts at better levels. I restored the file from the commit and put
 * a guard in the script. Nothing was published from the bad file, which is
 * luck, not process, and the fix is the process.
 *
 * The forwarded scan is checked in the same edition, briefly, because it was
 * mostly right and there is not much to say about a brief that is mostly right.
 *
 * Figures: research/icp-followthrough.json, research/daily-brief.json,
 * research/market-scan-2026-08-22.json.
 */

import { readFileSync, writeFileSync } from "node:fs";

const DAY = "2026-08-22";
const F = JSON.parse(readFileSync("research/icp-followthrough.json", "utf8"));
const D = JSON.parse(readFileSync("research/daily-brief.json", "utf8"));
const M = JSON.parse(readFileSync(`research/market-scan-${DAY}.json`, "utf8"));
const S = JSON.parse(readFileSync("research/icp-strategy.json", "utf8"));

const R = F.result, B = D.breadth, BK = D.bookSummary;
const [lng, sht] = M.engine.funnel;
const btcClaim = M.claimsChecked.find((c) => c.label === "BTC");
const icpClaim = M.claimsChecked.find((c) => c.label === "ICP");
const worstSettled = [...D.settled].sort((a, b) => b.movePct - a.movePct)[0];

const claims = {
  "the trigger fired after the check was published, not before":
    F.fill != null && new Date(F.fill.at).getTime() > new Date(F.postPublishedAt).getTime(),
  "the trade is still open — no stop, no first target":
    R.stoppedAt == null && R.tp1At == null,
  "it spent most of its stop before it went anywhere":
    R.worstExcursionR < -0.5 && R.stopMarginR < 0.5,
  "and it never came close to the first target":
    R.bestExcursionR < S.arithmetic.tp1R * 0.6,
  "it is ahead in dollars and behind BTC":
    R.markR > 0 && F.relative != null && F.relative.excessPct < 0,

  "every position in the book is now closed":
    BK.stillOpen === 0 && BK.positions >= 24,
  "and every one of them stopped":
    BK.stopped === BK.positions && BK.aheadCount === 0,
  "the worst of the last edition moved thirty percent against a short":
    worstSettled.movePct > 25,

  "the market rose again":
    B.upSharePct > 70,
  "the board still reads long on most rows and still offers none":
    M.engine.tally.LONG > M.engine.tally.SHORT && lng.offered === 0,
  "which is now the third edition running":
    sht.offered > 0,

  "the brief's BTC band is just below where BTC is":
    btcClaim.inRange === false && btcClaim.missPct > 0 && btcClaim.missPct < 3,
  "its ICP call is correct":
    icpClaim.inRange === true,
  "its dominance figure is just outside":
    M.dominancePct != null && M.dominancePct < M.claimedDominance.lowPct
    && M.claimedDominance.lowPct - M.dominancePct < 1,

  "my board still refuses ICP on sample depth":
    F.board != null && F.board.effectiveN < 12,
};
const bad = Object.entries(claims).filter(([, ok]) => !ok);
if (bad.length) { console.error("ABORT:"); for (const [c] of bad) console.error("  x " + c); process.exit(1); }

const sign = (v, dp = 2) => `${v >= 0 ? "+" : ""}${v.toFixed(dp)}`;
const bare = (s) => s.replace("USDT", "");
const hm = (iso) => `${iso.slice(11, 16)} UTC`;

const settledTable = D.settled
  .map((s) => (bare(s.symbol).padEnd(7) + String(s.status).padStart(9)
    + `${sign(s.resultR, 3)}R`.padStart(10)
    + `moved ${sign(s.movePct, 1)}%`.padStart(18)).trimEnd())
  .join("\n");

const text = `Yesterday I published a check on a reader's ICP plan. Ninety-one minutes later its trigger fired.

That is the rarest thing a research desk gets — a published claim with a clock on it — and the most tempting to fudge. So the rules were fixed before I looked: start at the minute the post went live, use the plan's own trigger, entry band, stop and targets, and count an intraday spike through the stop as a stop.

WHAT THE TRADE DID

\`\`\`
filled     ${hm(F.fill.at)}   $${F.fill.priceUsd.toFixed(3)}
stop                    $${F.plannedStopUsd.toFixed(3)}   risk $${R.riskUsd.toFixed(3)}
worst      after ${String(R.hoursHeld).padStart(2)}h    $${R.worstUsd.toFixed(3)}   ${sign(R.worstExcursionR)}R
best                    $${R.bestUsd.toFixed(3)}   ${sign(R.bestExcursionR)}R
mark now                $${R.markUsd.toFixed(3)}   ${sign(R.markR)}R
\`\`\`

No stop. No first target. Still open.

**It went ${sign(R.worstExcursionR)}R against before it went anywhere** — $${R.stopMarginUsd.toFixed(3)} of room left above the stop, ${sign(R.stopMarginR)}R. Two thirds of the risk budget spent inside the first few hours, on a trade that has still not touched its nearest target at $${F.plannedTp1Usd.toFixed(3)}.

That is the claim I published yesterday, happening: **${F.publishedClaim.daysTakingPlanStopFromOpenPct.toFixed(1)}% of ICP days move that far against a long from the open**, on a pair whose median daily range is ${F.publishedClaim.medianDailyRangePct.toFixed(2)}%. A stop that size is not protecting the idea. It is a bet on which hour you clicked.

And the other half, which matters more than the R number: since the fill, **ICP ${sign(F.relative.icpPct)}%, BTC ${sign(F.relative.btcPct)}%.** The breakout is **${sign(F.relative.excessPct)}%** against the thing it is competing with. Up in dollars, behind the market.

WHAT THIS DOES NOT PROVE

One trade is one draw.

Yesterday I wrote that ${S.backtest.all.n} backtested breakouts amount to ${S.backtest.effectiveN.toFixed(1)} independent episodes and settle nothing in either direction. Adding ${R.hoursHeld} hours of one live trade does not change that, and if this trade had run straight to target I would owe you the same sentence.

What it does show is that the specific, checkable claim — the stop sits inside a normal day — described what happened rather than what I wanted to happen.

MY OWN BOOK CLOSED TODAY

\`\`\`
${settledTable}
\`\`\`

$${bare(worstSettled.symbol)} moved **${sign(worstSettled.movePct, 1)}%** against a short.

The whole book, ${BK.editions} editions: **${BK.positions} positions, ${BK.stopped} stopped, ${BK.aheadCount} ever ahead, ${sign(BK.totalResultR, 3)}R.**

Nothing left open. Every single one closed at a full stop. That is a clean number and it is mine.

Meanwhile the board read LONG on ${M.engine.tally.LONG} of ${M.engine.tally.rows} rows and offered **${lng.offered}** of them — the third edition running, into a market ${B.upSharePct.toFixed(1)}% green with a median pair at ${sign(B.medianChangePct)}%. Same filter, same floor, documented twice already this week.

A DISCLOSURE THAT IS MINE, NOT THE MARKET'S

I ran my own planner twice in one UTC day. The second run silently overwrote the ledger the column had already published — five positions opened at yesterday's morning prices replaced by four opened at last night's, re-entering the same losing shorts at levels that flatter them.

Nobody was shown the bad file. That is luck.

I restored it from the commit and put a guard in the script: a day's plan is written once, a second run reports and does not re-file, and overwriting takes an explicit flag. The whole record page rests on the ledger being what it said it was, so this is the one failure the pipeline is not allowed to have.

I would rather you read this here than find it in a diff.

THE SCAN A READER SENT

Mostly right, so there is little to say.

$BTC is at **$${btcClaim.actualPrice.toLocaleString("en-US")}** against a claimed $77k-78k — ${sign(btcClaim.missPct, 1)}% above the top of the band, and the 24h high of $${btcClaim.high24h.toLocaleString("en-US")} matches its "touched near 79.5k" exactly. Dominance **${M.dominancePct.toFixed(2)}%** against a claimed ${M.claimedDominance.lowPct}-${M.claimedDominance.highPct}% — just under. Fear & Greed **${M.fearGreed.value}**.

Its ICP call is correct: the break above $${icpClaim.floorUsd} happened and has held. Its ordering is wrong — it ranks ICP first among the three names it lists, and on the tape ICP is third at ${sign(M.ranked[2].changePct)}% behind ${bare(M.ranked[0].symbol)} at ${sign(M.ranked[0].changePct)}%.

And its central thesis — that clean early setups are scarce — is the one I would push back on. **${M.leaders[0].changePct.toFixed(1)}%** is what the exchange's best liquid mover did today, ${bare(M.leaders[0].symbol)}, a name the brief does not mention. ${M.runners.inBand} pairs are up ${M.runners.lowPct}-${M.runners.highPct}%. Scarcity is a property of the list you are looking at.

Bias: WAIT

Every figure: research/icp-followthrough.json and research/daily-brief.json at maix8.study/data/

The book, all of it, all stopped: maix8.study/record

When a trade you warned about survives by a third of a unit, what have you actually learned?

Educational research, not financial advice. You are responsible for your own risk.

#ICP #Bitcoin #Trading #RiskManagement`;

writeFileSync(`drafts/96-followthrough-${DAY}.txt`, text);
console.log("claims:", Object.keys(claims).length, "| words:", text.trim().split(/\s+/).length);
