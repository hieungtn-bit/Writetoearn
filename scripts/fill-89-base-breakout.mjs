/**
 * Post 89 — a reader's strategy, run rather than discussed.
 *
 * The spec that arrived is the most complete thing anyone has forwarded to this
 * desk: base length, volume multiple, breakout confirmation, a hard gate on how
 * far price has already travelled, a liquidity floor, stop placement, a scaled
 * exit ladder, a time-stop. Almost every strategy that gets sent here is a
 * paragraph of vibes. This one is executable, so the respectful thing to do
 * with it is execute it.
 *
 * The finding is not "it fails". It is more interesting and more useful than
 * that: the entry rule adds nothing to the mean, and the exit ladder is doing
 * the work — but the entry does buy a materially better *typical* trade, a
 * median of -0.284R against -0.705R and a hit rate eight points higher. That
 * distinction is the whole post, and flattening it into a verdict in either
 * direction would waste the measurement.
 *
 * Two things must not be softened.
 *
 * The stop. The spec says stops are "typically 4-8%", and its own placement
 * rule produces a median of 12.2%, because a four-times-volume breakout bar is
 * wide. Anyone sizing from the stated range while placing the stop where the
 * spec says carries up to three times the intended risk. That is the one
 * finding here that costs money today.
 *
 * The gate. It is the strategy's signature idea and it binds on three setups
 * out of 198. A rule that almost never fires cannot be the reason anything
 * works, however sensible it sounds.
 *
 * And the post must own its own two bugs, which is now the house convention:
 * the first control was broken by a near-zero risk denominator, and the second
 * was drawn from the wrong window while a comment claimed otherwise.
 *
 * Figures: research/base-breakout.json.
 */

import { readFileSync, writeFileSync } from "node:fs";

const B = JSON.parse(readFileSync("research/base-breakout.json", "utf8"));
const A = B.asSpecified, R = B.randomEntrySameManagement, D = B.derived;
const gateOff = B.gateSweep.find((g) => g.gatePct == null);
const gate40 = B.gateSweep.find((g) => g.gatePct === 40);
const rejected = B.rejectedByGate;
const sens = B.sensitivity.filter((s) => s.setups >= 50);
const bestCell = sens.reduce((a, b) => (b.meanR > a.meanR ? b : a));
const worstCell = sens.reduce((a, b) => (b.meanR < a.meanR ? b : a));
const tightVolume = B.sensitivity.filter((s) => s.volumeMultiple === 6);

const claims = {
  "the strategy makes money on the mean":
    A.meanR > 0,
  "but the control makes more":
    R.meanR > A.meanR,
  "so the entry rule adds nothing to the mean":
    D.entryRuleValueR < 0,
  "while the entry does buy a better typical trade":
    A.medianR > R.medianR && A.winPct > R.winPct + 5,
  "neither arm is statistically strong":
    A.tStatByMonth < 2 && R.tStatByMonth < 2,

  "the hard gate almost never binds":
    rejected.setups <= 5 && B.totalSetupsFound > 150,
  "and moving it barely moves the result":
    Math.abs(gate40.meanR - gateOff.meanR) < 0.05,

  "the spec's own stop rule is far wider than the spec says":
    A.medianStopPct > 10,
  "which is more than the top of its stated range":
    A.medianStopPct > 8,

  "most trades are stopped out":
    A.stoppedPct > 70,
  "and the hold is short":
    A.medianHoldDays <= 14,

  "the result swings wildly on thresholds the spec leaves open":
    bestCell.meanR - worstCell.meanR > 0.15,
  "and tightening the volume filter makes it worse everywhere":
    tightVolume.every((s) => s.meanR < A.meanR),
};
const bad = Object.entries(claims).filter(([, ok]) => !ok);
if (bad.length) { console.error("ABORT:"); for (const [c] of bad) console.error("  x " + c); process.exit(1); }

const sign = (v, dp = 3) => `${v >= 0 ? "+" : ""}${v.toFixed(dp)}`;

const row = (a, b, c, d, e, f) =>
  (String(a).padEnd(26) + String(b).padStart(8) + String(c).padStart(11)
    + String(d).padStart(11) + String(e).padStart(8) + String(f).padStart(8)).trimEnd();

const compare = [
  ["as specified", A],
  ["random, same month", R],
].map(([n, v]) => row(n, v.setups, sign(v.meanR), sign(v.medianR), `${v.winPct.toFixed(0)}%`, v.tStatByMonth.toFixed(2))).join("\n");

const gateRow = (a, b, c, d) =>
  (String(a).padEnd(14) + String(b).padStart(8) + String(c).padStart(11) + String(d).padStart(9)).trimEnd();

const gateTable = B.gateSweep
  .filter((g) => g.setups)
  .map((g) => gateRow(g.gatePct == null ? "no gate" : `${g.gatePct}%`, g.setups, sign(g.meanR), g.tStatByMonth.toFixed(2)))
  .join("\n");

const sensRow = (a, b, c, d) =>
  (String(a).padEnd(9) + String(b).padStart(8) + String(c).padStart(9) + String(d).padStart(11)).trimEnd();

const sensTable = B.sensitivity
  .filter((s) => [3, 4, 6].includes(s.volumeMultiple) && [15, 20, 25].includes(s.baseDays))
  .map((s) => sensRow(`${s.baseDays} days`, `${s.volumeMultiple}x`, s.setups, sign(s.meanR)))
  .join("\n");

const text = `Someone sent me a base-breakout strategy. Not a paragraph of vibes — an actual specification: base length, volume multiple, breakout confirmation, a hard gate, stop placement, a scaled exit ladder, a time-stop.

Almost nothing that arrives here can be run by a machine. This could. So I ran it instead of having an opinion about it.

${B.pairs} pairs, daily candles back to ${B.historyFromYear}, every threshold the spec left open written down before the run.

WHAT IT RETURNS

\`\`\`
${row("", "setups", "mean R", "median R", "win%", "t")}
${compare}
\`\`\`

The strategy makes money: **${sign(A.meanR)}R** per setup across ${A.setups} of them over ${A.months} months.

The second line is the finding. That is the **same symbol, the same calendar month, the same liquidity floor, the same stop rule, the same exit ladder** — and an entry picked at random. It returns ${sign(R.meanR)}R.

**The entry rule is worth ${sign(D.entryRuleValueR)}R.** The money is in the exit ladder, not in the base breakout.

BUT NOT NOTHING

I could stop there and it would be misleading, because the entry does do something real.

**Median ${sign(A.medianR)}R against ${sign(R.medianR)}R.** Win rate ${A.winPct.toFixed(0)}% against ${R.winPct.toFixed(0)}%.

The typical base-breakout trade is materially better than the typical random one. What it does not do is raise the average, because the random entries occasionally catch a monster that pays for all the rubbish. So the honest summary is: **the entry buys you a smoother path, not a higher expectancy.**

Whether that is worth having depends on whether you can actually sit through the alternative. Most people cannot, which is not nothing.

Also worth stating plainly: neither arm is statistically strong. t ${A.tStatByMonth.toFixed(2)} and t ${R.tStatByMonth.toFixed(2)}, computed per month rather than per ticket.

THE STOP IS THE PART THAT COSTS MONEY TODAY

The spec says the stop goes below the breakout candle's low, and describes that as **"typically 4-8%"**.

Run the rule and the median stop distance is **${A.medianStopPct.toFixed(1)}%**.

Of course it is. A bar that trades four times its average volume and closes above a month's high is a *wide* bar. The stop placement rule and the stated stop distance describe different trades.

This is not academic. Position size is computed from the stop distance. Size for a 6% stop, place it where the rule says, and you are carrying roughly twice the risk you budgeted — on a strategy that is **stopped out ${A.stoppedPct.toFixed(0)}% of the time** with a median hold of ${A.medianHoldDays} days.

THE HARD GATE DOES NOT BIND

The signature idea is the early-stage gate: do not touch it if it is already up more than 55-60% from the base low.

\`\`\`
${gateRow("gate", "setups", "mean R", "t")}
${gateTable}
\`\`\`

Turning the gate **off entirely** changes the result from ${sign(gate40.meanR)}R to ${sign(gateOff.meanR)}R. It rejects **${rejected.setups} setups out of ${B.totalSetupsFound}**.

The gate is not wrong. Those few rejected setups did lose. It simply is not the reason anything here works, because it almost never fires — the volume and base conditions have already excluded nearly everything it would have caught.

THE THRESHOLDS DECIDE THE ANSWER

The spec gives ranges. Here is what the ranges do.

\`\`\`
${sensRow("base", "vol", "setups", "mean R")}
${sensTable}
\`\`\`

From ${sign(worstCell.meanR)}R to ${sign(bestCell.meanR)}R depending on two numbers nobody specified.

And look at the ${tightVolume[0].volumeMultiple}x column. Tightening the volume filter — asking for a *stronger*, more selective signal — makes it worse at **every** base length. A real effect gets cleaner when you demand more of it. This one falls apart.

TWO BUGS OF MINE, BEFORE YOU TRUST ANY OF IT

1R here is the distance from entry to stop. My first control landed on days that closed near their low, making 1R almost zero and every subsequent move an enormous multiple of it. It reported random entry at -0.189R, which was pure artefact. Bounds now apply to both arms.

And the control was originally drawn from the whole history while my own comment claimed it was month-matched. Real setups cluster into volatile stretches, so that was comparing a breakout month against a quiet one and calling the difference a strategy. Now matched on symbol and month; ${B.randomBaseline.unmatchedSetups} setups found no control and are reported rather than dropped.

The run is on daily candles. The spec asks for 4H, and its time-stop of 8-12 4H candles is implemented as two days. Within any bar the stop is checked before the targets.

WHAT I WOULD TELL THE AUTHOR

Keep the exit ladder. It is the part that works and it is better than most of what gets published.

Fix the stop arithmetic before anything else — the gap between "4-8%" and ${A.medianStopPct.toFixed(1)}% is a live sizing error, not a rounding difference.

Stop crediting the gate. And before defending any threshold, check whether the strategy survives tightening it, because this one does not.

Every figure: research/base-breakout.json, served at maix8.study/data/ — including the setups that failed.

$BTC and the record: maix8.study/record

If you run a strategy, do you know what a random entry with your exits would have returned?

Educational research, not financial advice. You are responsible for your own risk.

#Trading #RiskManagement #Crypto`;

writeFileSync("drafts/89-base-breakout.txt", text);
console.log("claims:", Object.keys(claims).length, "| words:", text.trim().split(/\s+/).length);
