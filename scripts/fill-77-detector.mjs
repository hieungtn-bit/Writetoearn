/**
 * Post 77 — the detector I built, measured, and will not put on the board.
 *
 * A reader asked why the board misses the names running on the gainers tab and
 * then, more pointedly, said the algorithm ought to catch them early *and*
 * make money rather than lose it. Post 74 answered the first half by measuring
 * what buying that list actually returns. This answers the second half: I built
 * the early detector, and it does find things — and it still does not pay once
 * the toll is charged.
 *
 * The structure follows the arithmetic rather than the narrative. The signal is
 * real, the edge over baseline is real, and the fee is larger than both. Two of
 * one hundred and forty-four configurations clear costs, by about a thousandth
 * of an R, which is what searching a hundred and forty-four configurations
 * produces whether or not anything is there.
 *
 * The point of publishing a negative result is that the alternative — shipping
 * it because it was expensive to build — is how a board fills up with features
 * that lose money quietly.
 *
 * Every figure traces to research/momentum-backtest.json and, for the cost
 * arithmetic, research/detector-costs.json — the derived numbers get their own
 * committed file rather than being computed inside the writer, so a reader can
 * check the subtraction without rerunning the post.
 */

import { readFileSync, writeFileSync } from "node:fs";

const M = JSON.parse(readFileSync("research/momentum-backtest.json", "utf8"));
const C = JSON.parse(readFileSync("research/detector-costs.json", "utf8"));
const FEE_PCT = C.feePct;

const base = M.results["z3 · move 0.5-6%"];
const strict = M.results["z4 · move 0.5-6%"];
const narrow = M.results["z3 · move 0.5-3%"];
const noCeiling = M.results["z3 · no ceiling"];

const survivors = C.survivors;
const bestFee = C.bestGross.feeR;
const bestNet = C.bestGross.netR;
const expectedByChance = C.expectedByChance;

const claims = {
  "the detector fires often enough to matter": base.signals > 500 && base.signalsPerPairPerWeek > 1,
  "most settings are positive before costs": base.positiveCells > base.cells / 2,
  "and most beat their own baseline": base.cellsBeatingBaseline > base.cells / 2,
  "the best setting nearly doubles the baseline hit rate":
    base.best.hitPct > base.best.baselineHitPct * 1.7,
  "removing the early ceiling destroys it":
    noCeiling.medianEdgeR < 0 && noCeiling.cellsBeatingBaseline < base.cellsBeatingBaseline / 2,
  "demanding a bigger volume spike does not help": strict.medianEdgeR < base.medianEdgeR,
  "and neither does demanding a smaller move": narrow.medianEdgeR < 0,
  "the fee at the best setting is larger than the edge": bestFee > base.best.expectancyR,
  "so the best setting loses money net": bestNet < 0,
  "almost nothing survives costs": C.survivingCells <= 3,
  "and what survives, survives by a rounding error": survivors.every((c) => c.netR < 0.002),
  "both survivors need the widest stop tested": C.survivorsUseWidestStop,
  "chance alone would produce more winners than this search found":
    expectedByChance > C.survivingCells,
  "the cost snapshot is derived from the study it cites": C.source.includes("momentum-backtest"),
  "the study is wide enough to quote": M.pairs >= 100 && M.hourlyBars >= 1000,
};
const bad = Object.entries(claims).filter(([, ok]) => !ok);
if (bad.length) { console.error("ABORT:"); for (const [c] of bad) console.error("  x " + c); process.exit(1); }

const r3 = (v) => (v >= 0 ? "+" : "") + v.toFixed(3);
const row = (a, b, c, d) =>
  (String(a).padEnd(20) + String(b).padStart(9) + String(c).padStart(11) + String(d).padStart(10)).trimEnd();

const configTable = [
  ["already moving 0.5-6%", base],
  ["bigger volume spike", strict],
  ["only tiny moves", narrow],
  ["no ceiling at all", noCeiling],
].map(([label, r]) => row(
  label,
  r.signals,
  `${r.cellsBeatingBaseline}/${r.cells}`,
  r3(r.medianEdgeR),
)).join("\n");

const b = base.best;
const feeRow = (a, c, d) => (String(a).padEnd(24) + String(c).padStart(12) + String(d).padStart(10)).trimEnd();

const text = `Two days ago a reader sent me the gainers tab — $HOLO and $PROM at the top of it — and asked why my board never has those names on it. I published what buying that list actually returns.

Then came the sharper version of the question: **the algorithm should catch them early and make money, not lose it.**

Fair. So I built the early detector. This is what it does, and why it is not going on the board.

WHAT IT LOOKS FOR

Not a price move. **Turnover arriving before the price has paid for it.**

On hourly candles, for each pair: is this hour's volume unusual against the last three days, has price moved at least a little in the last six hours — and, the important part, has it moved **less than 6%** so far.

That ceiling is the entire product. Without it you are buying things that already ran, which is the gainers tab with extra steps.

One signal per pair then goes quiet for twelve hours, so a single event does not get counted twelve times and flatter the results.

IT WORKS. THAT IS NOT THE PROBLEM.

Across ${M.pairs} pairs and ${Math.round(M.hourlyBars / 24)} days of hourly data it fired **${base.signals} times** — about ${base.signalsPerPairPerWeek.toFixed(1)} signals per pair per week. Enough to trade, not so many that it is firing at noise.

Of ${base.cells} stop/target/holding combinations tested, **${base.positiveCells} were profitable** and **${base.cellsBeatingBaseline} beat their own baseline** — the same trade taken at a random hour on the same pair.

The best of them: a ${b.stopPct}% stop, a ${b.rr}:1 target, ${b.horizonBars} hours. It hit **${b.hitPct.toFixed(1)}%** of the time against a baseline of ${b.baselineHitPct.toFixed(1)}%. Nearly double.

The signal is real. Hold that thought.

AND BEING EARLY IS WHAT MAKES IT REAL

I varied the recipe to find out which ingredient was doing the work:

\`\`\`
${row("what I asked for", "signals", "beat base", "edge")}
${configTable}
\`\`\`

Take the ceiling off — let it fire on moves of any size — and it goes from ${base.cellsBeatingBaseline} settings out of ${base.cells} beating baseline to ${noCeiling.cellsBeatingBaseline}, with a **negative** median edge.

Demand a *bigger* volume spike and it gets worse, not better: ${strict.signals} signals instead of ${base.signals}, and the median edge falls from ${r3(base.medianEdgeR)} to ${r3(strict.medianEdgeR)}. Being fussier costs you sample and buys you nothing.

So: the volume spike is not the edge. **Catching it before it has run is the edge.** That is a genuinely useful thing to know, and it is the last piece of good news in this post.

THEN I CHARGED THE FEES

Round trip on Binance, in and out, is about ${FEE_PCT}%. Stated as a fraction of the risk you took — which is the only way to compare it to anything — that is:

\`\`\`
${feeRow("fee ÷ your stop", "= cost in R", "")}
${feeRow(`0.2% ÷ ${b.stopPct}% stop`, `${bestFee.toFixed(3)}R`, "")}
\`\`\`

Now put the best setting next to its own bill:

\`\`\`
${feeRow("best setting, gross", r3(b.expectancyR), "")}
${feeRow("cost of trading it", `-${bestFee.toFixed(3)}`, "")}
${feeRow("what you keep", r3(bestNet), "")}
\`\`\`

The fee is **${C.bestGross.feeToEdgeRatio.toFixed(1)} times the edge**. Not close. Not marginal. The single best configuration out of everything I tried loses ${Math.abs(bestNet).toFixed(3)}R per trade after costs.

I THEN CHECKED ALL ${C.cellsTested} OF THEM

Every configuration, every stop, every target, every holding period, across all four recipes. **${C.cellsTested} combinations. ${C.survivingCells} finish above zero after fees.**

By how much? ${survivors.map((c) => `${c.netR.toFixed(4)}R`).join(" and ")}.

That is a rounding error wearing a strategy's clothes. And there is a second tell: **both survivors need the widest stop I tested (${survivors[0].stopPct}%)** — not because a wide stop is smart here, but because the fee gets divided by it. They are not surviving on merit; they are surviving on a smaller denominator.

One more number, which is the one that settles it. Search ${C.cellsTested} combinations at a normal false-positive rate and you would expect around **${Math.round(expectedByChance)} to clear any bar by luck alone.** I found ${C.survivingCells}. The search produced *fewer* winners than pure chance would hand me.

SO IT IS NOT SHIPPING

The code is written, tested and committed. It runs. It will not appear on the board, and I am telling you it exists rather than quietly deleting it, because "we built a detector and it did not pay" is more useful to you than another feature announcement.

What would change my mind, stated in advance so it is not a moving target:

**A gross edge above ${bestFee.toFixed(2)}R at a ${b.stopPct}% stop.** That is the bar. It is currently at ${b.expectancyR.toFixed(3)}R.

**Or a smaller toll.** Entering with resting orders instead of crossing the spread changes this arithmetic materially. I have not measured whether the signal survives waiting for a fill, and until I have, I am not going to imply it would.

WHY THIS MATTERS IF YOU TRADE THESE BY HAND

You are paying the same toll on the same trades.

If you are trading hourly breakouts on a 3% stop, every round trip costs you ${bestFee.toFixed(3)}R before you are right about anything. Ten trades a week is ${C.frictionPerTenTradesR.toFixed(3)}R of pure friction — and the honest version of most "profitable" strategies is that they were profitable until this subtraction, which is the step almost no published backtest performs.

The uncomfortable finding is not that the detector failed. It is that it **worked, and still lost money.** Being right about direction is not the same as being paid for it.

LIMITS

${M.pairs} pairs, ${Math.round(M.hourlyBars / 24)} days of hourly history, one exchange, spot fees, market entries. A different fee tier, a different venue or a maker-only entry would each move the answer, and none of those are measured here.

Board and every figure: maix8.study/signals

Bias: **stand aside** on this idea, which is a call about my own tool rather than about the market.

What is the last strategy you checked after fees rather than before?

Educational research, not financial advice. You are responsible for your own risk.

#Trading #RiskManagement #Crypto`;

writeFileSync("drafts/77-detector.txt", text);
console.log("claims:", Object.keys(claims).length, "| words:", text.trim().split(/\s+/).length);
