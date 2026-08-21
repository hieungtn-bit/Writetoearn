/**
 * Post 93 — the finding published last night, reproduced this morning.
 *
 * Twelve hours ago this desk published that its agreement filter cannot admit
 * a change of trend: 59 long rows, 5 unanimous, 0 offered. The obvious risk
 * with a finding that neat is that it was a property of one evening's board.
 *
 * It was not. A fresh scan, a re-drawn universe, a different day: 55 long
 * rows, 3 unanimous, 0 offered. Agreement passed 11% of long rows against 88%
 * of short ones. The ledger then took five more shorts into a market that is
 * two thirds green, and the open book went to 0 of 24 ahead at -23.263R.
 *
 * That is the spine, and it decides what this post is not. It is not a
 * victory lap for calling the flaw first — the flaw is mine, and predicting
 * that my own broken thing stays broken is the cheapest forecast available.
 * It is also not an announcement that I have fixed it. The measurement named
 * last night has not been run, and claiming a fix before running it would be
 * the same failure in a better mood.
 *
 * What it can do is show the table twice and let the repetition carry the
 * weight, then be straight about the uncomfortable part: the ledger is still
 * taking shorts this morning. The rule does not get suspended in the week it
 * hurts, because "change the rule when it hurts" is the error this desk has
 * published about repeatedly. So the positions stand, my stated bias is WAIT,
 * and the gap between those two sentences is stated rather than smoothed.
 *
 * The forwarded brief is audited in the same edition and mostly holds up: 3 of
 * 7 numeric claims inside their range, the misses all small, and the same
 * signature as every forwarded scan so far — the market ran further than the
 * snapshot. Its one real blind spot is the name it demoted to a watchlist
 * footnote, which turned out to be the largest mover on the exchange by four
 * times.
 *
 * Figures: research/market-scan-2026-08-21.json, research/daily-brief.json,
 * research/event-window.json, research/persistence.json.
 */

import { readFileSync, writeFileSync } from "node:fs";

const DAY = "2026-08-21";
const M = JSON.parse(readFileSync(`research/market-scan-${DAY}.json`, "utf8"));
const D = JSON.parse(readFileSync("research/daily-brief.json", "utf8"));
const YESTERDAY = JSON.parse(readFileSync("research/market-scan.json", "utf8"));

const B = D.breadth, BK = D.bookSummary, R = M.baseRates;
const [lng, sht] = M.engine.funnel;
const [yLng, ySht] = YESTERDAY.engine.funnel;

const btcPct = M.claimsChecked.find((c) => c.label === "BTC");
const btcPx = M.claimsChecked.find((c) => c.label === "BTC px");
const pump = M.claimsChecked.find((c) => c.label === "PUMP");
const leader = M.leaders[0];
const rankedTop = M.ranked[0];
const claimedFirst = "PUMP";
const btcFunding = M.funding.find((f) => f.instrument.startsWith("BTC"));
const ena = M.claimsChecked.find((c) => c.label === "ENA");
const prevEna = M.previousRun?.claimsChecked.find((c) => c.label === "ENA") ?? null;
/**
 * The alts only.
 *
 * The range was taken across every funding row, so its floor was BTC's own
 * rate and the sentence "the alts it named between +1.9% and +10.9%" quoted
 * BTC as an alt. A range is only a range over the set it claims to describe.
 */
const altFunding = M.funding.filter((f) => !f.instrument.startsWith("BTC"));

const claims = {
  "the filter admitted no long again, on a freshly drawn board":
    lng.offered === 0 && yLng.offered === 0 && M.engine.scannedAt !== YESTERDAY.engine.scannedAt,
  "and the asymmetry held to within a few points":
    sht.unanimousSharePct > 80 && lng.unanimousSharePct < 25,
  "the board still reads long on most rows":
    M.engine.tally.LONG > M.engine.tally.SHORT,
  "the universe was re-drawn, so this is not the same hundred rows":
    M.engine.rowsWithFiveWindows !== YESTERDAY.engine.rowsWithFiveWindows,

  "every position in the open book is behind":
    BK.aheadCount === 0 && BK.positions >= 24,
  "and the book is worse than when I published last night":
    BK.totalResultR < YESTERDAY.morningComparison.bookTotalR,
  "the ledger took more shorts this morning anyway":
    D.taken.length > 0 && D.taken.every((t) => t.direction === "short"),
  "into a market that is mostly green":
    B.upSharePct > 60,

  /**
   * The count is not asserted, only that the misses are small.
   *
   * ENA sat at +25.19% on one run and +26.06% eight minutes later, crossing
   * the top of its claimed 20-26% band in between. A gate that fixed the
   * in-range count would have been true at one timestamp and false at the
   * next, which is the property of a rolling 24-hour window, not of the
   * brief. What survives both readings is the size of the misses.
   */
  "most of the brief's numeric claims miss, but only just":
    M.claimsInRange < M.claimsTotal
    && M.claimsChecked.filter((c) => !c.inRange).every((c) => Math.abs(c.missPct) < 5),
  "its two BTC figures both miss upward":
    btcPct.missPct > 0 && btcPx.missPct > 0,
  "the name it ranked first is not the leader among the four it ranked":
    rankedTop.symbol !== `${claimedFirst}USDT`,
  "and the biggest mover on the exchange is one it demoted to a footnote":
    leader.changePct > rankedTop.changePct * 3,

  "funding shows nothing extreme, which is what the brief said":
    btcFunding != null && Math.abs(btcFunding.annualisedPct) < 30
    && altFunding.length > 1 && altFunding.every((f) => Math.abs(f.annualisedPct) < 30),
  "the earlier reading of the same claim is stored, not just the published one":
    prevEna != null && Math.abs(prevEna.actualChangePct - ena.highPct) < 0.5,
  "sentiment is hotter than the brief quoted":
    M.fearGreed != null && M.fearGreed.value > 65,

  "the pipeline still does not beat the rule with no thought in it":
    D.selfTest.beatsNoThinking === false,
  "and the trigger family that would resolve this is below a coin toss":
    R.continuation3dPct < 50,
};
const bad = Object.entries(claims).filter(([, ok]) => !ok);
if (bad.length) { console.error("ABORT:"); for (const [c] of bad) console.error("  x " + c); process.exit(1); }

const sign = (v, dp = 2) => `${v >= 0 ? "+" : ""}${v.toFixed(dp)}`;
const money = (v) => (Math.abs(v) >= 1
  ? Math.round(v).toLocaleString("en-US")
  : Number(v.toPrecision(3)).toString());
const bare = (s) => s.replace("USDT", "");

const funnelRow = (label, f) =>
  (String(label).padEnd(12) + String(f.rows).padStart(6) + String(f.haveFiveWindows).padStart(12)
    + String(f.unanimous).padStart(12) + String(f.deepEnough).padStart(9) + String(f.offered).padStart(10)).trimEnd();

const funnelTable = [
  funnelRow("", { rows: "rows", haveFiveWindows: "5 windows", unanimous: "unanimous", deepEnough: "n>=12", offered: "offered" }),
  funnelRow("LONG  20th", yLng),
  funnelRow("LONG  21st", lng),
  funnelRow("SHORT 20th", ySht),
  funnelRow("SHORT 21st", sht),
].join("\n");

const settledTable = D.settled
  .map((s) => (bare(s.symbol).padEnd(7) + String(s.status).padStart(9)
    + `${sign(s.resultR, 3)}R`.padStart(10)
    + `moved ${sign(s.movePct)}%`.padStart(18)).trimEnd())
  .join("\n");

const claimTable = M.claimsChecked.map((c) => {
  const claimed = c.kind === "band" ? `$${money(c.lowUsd)}-${money(c.highUsd)}`
    : c.lowPct === c.highPct ? `${c.lowPct}%` : `${c.lowPct}-${c.highPct}%`;
  const actual = c.kind === "band" ? `$${money(c.actualPrice)}` : `${sign(c.actualChangePct)}%`;
  const verdict = c.inRange ? "in range" : `${sign(c.missPct, 1)}${c.kind === "band" ? "%" : "pp"}`;
  return (c.label.padEnd(9) + claimed.padStart(17) + actual.padStart(13) + verdict.padStart(12)).trimEnd();
}).join("\n");

const leaderTable = M.leaders.slice(0, 6)
  .map((t, i) => (`${i + 1}. ${bare(t.symbol)}`.padEnd(12) + `${sign(t.changePct)}%`.padStart(9)
    + `$${(t.turnoverUsd / 1e6).toFixed(0)}M`.padStart(9)).trimEnd())
  .join("\n");

const text = `Last night I published that my filter cannot admit a change of trend. Fifty-nine rows read long, five cleared the agreement windows, none cleared the sample floor, zero were offered.

The fair objection to a table that neat is that it describes one evening.

So here is this morning's, on a board rescanned from scratch with the universe re-drawn.

\`\`\`
${funnelTable}
\`\`\`

**Zero again.** Different day, different rows, same floor. Agreement passed ${sht.unanimousSharePct.toFixed(0)}% of short rows and ${lng.unanimousSharePct.toFixed(0)}% of long ones, against ${ySht.unanimousSharePct.toFixed(0)}% and ${yLng.unanimousSharePct.toFixed(0)}% yesterday.

I would rather this had been a fluke of one scan.

WHAT IT COST OVERNIGHT

\`\`\`
${settledTable}
\`\`\`

$ADA moved ${sign(D.settled.find((s) => s.symbol === "ADAUSDT").movePct, 1)}% against a short. $XRP moved ${sign(D.settled.find((s) => s.symbol === "XRPUSDT").movePct, 1)}%.

The whole open book: **${BK.aheadCount} of ${BK.positions} ahead, ${BK.stopped} stopped, ${sign(BK.totalResultR, 3)}R** across ${BK.editions} editions.

Not one position ahead. Not one.

AND IT TOOK ${D.taken.length} MORE SHORTS THIS MORNING

${D.taken.map((t) => bare(t.symbol)).join(", ")} — into a market that is ${B.upSharePct.toFixed(1)}% green with a median pair at ${sign(B.medianChangePct)}%.

I let it. That needs explaining, because it looks like stubbornness and it is a rule.

The rule is that filters do not move because a week hurt. Every time this desk has measured a setting chosen after seeing which one would have won, the edge did not survive out of sample. Suspending the filter mid-drawdown is that error with the timing that makes it hardest to resist.

So the ledger stands and the positions are published at full size. **My own stated bias today is WAIT.** The distance between "the ledger is short" and "I would not take this trade" is the most honest line on this page, and I am not going to close it by quietly editing one side.

THE BRIEF A READER SENT

\`\`\`
${claimTable}
\`\`\`

**${M.claimsInRange} of ${M.claimsTotal}** inside their stated ranges, and **every miss is under ${Math.ceil(Math.max(...M.claimsChecked.filter((c) => !c.inRange).map((c) => Math.abs(c.missPct))))} points.** This is a good brief being measured against a moving tape, not a bad one being caught out.

$BTC ran ${sign(btcPx.missPct, 1)}% past the top of the quoted price and ${sign(btcPct.missPct, 1)}pp past the quoted move — the same direction every forwarded scan has missed in so far.

How fine the margins are: ENA's claimed band tops out at ${ena.highPct}%. Two passes of this check, minutes apart, read ${sign(prevEna.actualChangePct)}% and ${sign(ena.actualChangePct)}%. The first of those misses by six hundredths of a point.

Whether that one counts as a miss depends on the minute you run the check. The brief did not change; the rolling window moved under it. That cuts both ways, mine included — which is why both readings are in the snapshot rather than only the one I published.

Two things worth naming.

Its ranking put ${claimedFirst} first. On the tape ${claimedFirst} is third of the four it listed, behind ${bare(rankedTop.symbol)} at ${sign(rankedTop.changePct)}%.

And the largest mover on the entire exchange is ${bare(leader.symbol)}, **${sign(leader.changePct)}% on $${(leader.turnoverUsd / 1e6).toFixed(0)}M** — a name the brief pushed down to a watchlist footnote with a caution about funding.

\`\`\`
${leaderTable}
\`\`\`

That is not a gotcha. It is the same lesson that made this desk stop scanning a fixed list of names: whatever roster you rank, the market is not obliged to put its biggest move inside it.

WHERE THE BRIEF IS RIGHT

Its read on leverage. Funding is unremarkable — $BTC at ${sign(btcFunding.annualisedPct, 1)}% annualised, the alts it named between ${sign(Math.min(...altFunding.map((f) => f.annualisedPct)), 1)}% and ${sign(Math.max(...altFunding.map((f) => f.annualisedPct)), 1)}%. No crowded-leverage signature, exactly as it said.

One correction: it quotes Fear & Greed near 61. It reads **${M.fearGreed.value}, ${M.fearGreed.label}** this morning. Hotter than claimed, which cuts against its own caution rather than for it.

WHAT HAS NOT CHANGED

The pipeline still walks forward at ${D.selfTest.algorithmNetR.toFixed(4)}R against ${D.selfTest.alwaysShortNetR.toFixed(4)}R for the rule with no thought in it. Continuation over three days is still ${R.continuation3dPct.toFixed(1)}%. Direction persistence at a month is still ${R.persistence30dPct.toFixed(2)}%.

The measurement I named last night — whether the filter's asymmetry predicts anything, matched controls, filter on and off — has not been run. It will be, and it will be published either way. Announcing a fix before running it would be the same failure in a better mood.

Every figure: research/market-scan-${DAY}.json and research/daily-brief.json, at maix8.study/data/

The book, at full size and all of it losing: maix8.study/record

Bias: WAIT

When your system repeats a mistake you have already diagnosed, how long do you let it run before the rule protecting you becomes the thing costing you?

Educational research, not financial advice. You are responsible for your own risk.

#Bitcoin #Trading #Quant #RiskManagement`;

writeFileSync(`drafts/93-again-${DAY}.txt`, text);
console.log("claims:", Object.keys(claims).length, "| words:", text.trim().split(/\s+/).length);
