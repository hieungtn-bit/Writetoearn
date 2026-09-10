/**
 * Post 95 — a reader's ICP plan, checked instead of restated.
 *
 * The plan is specific, which is the thing worth praising about it and the
 * thing that makes it testable: levels, stops, two targets, a partial, an
 * invalidation. Most forwarded strategies are a mood. This one is a rule.
 *
 * So the post does not offer a rival opinion. It runs three checks that differ
 * in how much they can actually establish, and the post's structure follows
 * that difference rather than hiding it.
 *
 *   The arithmetic is certain, because it is division. The plan claims 1:2.5
 *   to 1:3 and instructs a partial at the near target. Take the partial and
 *   the best case the plan can pay is 2.16R, with the near target worth 1.28R.
 *   The claimed ratio belongs to the far target alone, which the plan's own
 *   management means you never collect in full.
 *
 *   The geometry against the instrument is close to certain, because it is a
 *   count over 1,929 days. The fallback stop risks 1.75% on a pair whose
 *   median daily range is 6.99%. Nearly three days in four move that far
 *   against a long from the open alone.
 *
 *   The backtest establishes almost nothing, and saying so is the point. 74
 *   breakouts inside 30-day horizons is 2.5 independent episodes. It came in
 *   behind a matched control, but at that sample I cannot call the rule bad —
 *   only unproven, which is also what I would have to say if it had won.
 *
 * The temptation is to end on "use my geometry instead". The measurement
 * refuses: at 1.5 ATR the same breakouts return -0.01R against the plan's
 * +0.09R. The wider stop fixes one real thing — it stops the entry candle
 * deciding the trade — and does not turn a coin toss into an edge. Publishing
 * that is the difference between a check and an advertisement.
 *
 * Figures: research/icp-strategy.json, research/daily-brief.json.
 */

import { readFileSync, writeFileSync } from "node:fs";

const S = JSON.parse(readFileSync("research/icp-strategy.json", "utf8"));
const D = JSON.parse(readFileSync("research/daily-brief.json", "utf8"));

const A = S.arithmetic, I = S.instrument, B = S.backtest, HA = S.houseAlternative, P = S.plan;
const icp = D.followed?.ICPUSDT ?? null;

const claims = {
  "the near target is worth barely more than one unit of risk":
    A.tp1R < 1.5,
  "and taking the partial the plan asks for caps the best case below its claim":
    A.blendedClearsClaim === false && A.blendedBestCaseR < P.claimedRR.low,
  "the far target on its own does roughly match the claim":
    A.tp2R >= P.claimedRR.low - 0.2,

  "the fallback stop is inside a normal day for this pair":
    I.daysTakingFallbackStopFromOpenPct > 60,
  "and the main stop is taken on a large minority of days":
    I.daysTakingPlanStopFromOpenPct > 20 && I.daysTakingPlanStopFromOpenPct < 50,
  "the median day covers more ground than entry to first target":
    I.medianDailyRangePct > B.geometry.tp1Pct,

  "the rule was walked forward against a matched control":
    B.all.n > 50 && B.control.n > B.all.n,
  "it did not beat the control":
    B.all.meanR < B.control.meanR,
  "the median breakout is a full stop":
    B.all.medianR < -0.9,
  "but the sample is far too thin to convict it":
    B.effectiveN < 5,

  "the volume condition excludes almost nothing":
    B.withoutVolumeConfirmation != null && B.withoutVolumeConfirmation.n < 5
    && B.withVolumeConfirmation.n > 60,

  "a stop that clears a normal day does not rescue the expectancy":
    HA.meanR < B.all.meanR + 0.2 && HA.daysTakingThisStopFromOpenPct < I.daysTakingPlanStopFromOpenPct,

  "ICP is close enough to the trigger for this to matter now":
    Math.abs(I.spotUsd - P.breakoutTrigger.highUsd) / P.breakoutTrigger.highUsd < 0.05,
  "and my own board still refuses it on sample depth":
    icp != null && icp.board != null && icp.board.thin === true,
};
const bad = Object.entries(claims).filter(([, ok]) => !ok);
if (bad.length) { console.error("ABORT:"); for (const [c] of bad) console.error("  x " + c); process.exit(1); }

const sign = (v, dp = 2) => `${v >= 0 ? "+" : ""}${v.toFixed(dp)}`;

const btRow = (label, s) => (label.padEnd(18) + String(s.n).padStart(6)
  + sign(s.meanR).padStart(9) + sign(s.medianR).padStart(9)
  + `${s.winSharePct.toFixed(0)}%`.padStart(7)).trimEnd();

const backtestTable = [
  ("".padEnd(18) + "n".padStart(6) + "mean".padStart(9) + "median".padStart(9) + "win".padStart(7)),
  btRow("breakouts", B.all),
  btRow("  volume up", B.withVolumeConfirmation),
  btRow("  volume flat", B.withoutVolumeConfirmation),
  btRow("random control", B.control),
].join("\n");

const text = `A reader sent me a full ICP plan. Break and hold above $${P.breakoutTrigger.lowUsd}-${P.breakoutTrigger.highUsd}, enter $${P.entry.lowUsd}-${P.entry.highUsd}, stop under $${P.stop.lowUsd}-${P.stop.highUsd}, take 40-50% off at $${P.tp1.lowUsd}-${P.tp1.highUsd}, run the rest to $${P.tp2.lowUsd}-${P.tp2.highUsd}. Claimed reward-to-risk: 1:${P.claimedRR.low} to 1:${P.claimedRR.high}.

Credit where it is due — this is a *rule*. Levels, a stop, two targets, an invalidation, a position size. Most of what gets forwarded to me is a mood with a chart attached. You can test this one, which is exactly what I did.

$ICP is at **$${I.spotUsd.toFixed(3)}** as I write. The trigger is live, not hypothetical.

CHECK ONE: THE ARITHMETIC

This one is not a matter of judgement. It is division.

Entry $${A.entryUsd.toFixed(3)}, stop $${A.stopUsd.toFixed(3)}. Risk: **${A.stopPct.toFixed(2)}%.**

- First target $${A.tp1Usd.toFixed(3)} = **${A.tp1R.toFixed(2)}R**
- Second target $${A.tp2Usd.toFixed(3)} = **${A.tp2R.toFixed(2)}R**

The far target does roughly match the claim. But the plan says take 40-50% off at the *first* one — and the first one pays ${A.tp1R.toFixed(2)}R.

Take the partial, run the rest to the second target, never get stopped, nothing left open. That perfect run pays **${A.blendedBestCaseR.toFixed(2)}R**, against a claimed ${P.claimedRR.low}-${P.claimedRR.high}R.

So the headline number is the far target's ratio, quoted for a plan whose own management means you never collect it in full. Not dishonest — easy to do, and worth catching, because position sizing is done off that number.

CHECK TWO: THE STOP AGAINST THE INSTRUMENT

ICP's median daily range is **${I.medianDailyRangePct.toFixed(2)}%**. Entry to first target is ${B.geometry.tp1Pct.toFixed(2)}%. **A median day covers more ground than the whole first leg of this trade.**

Now the stops, measured across ${I.dailyBars.toLocaleString("en-US")} days since ${I.firstBar}. For each one: from that day's open, did price trade that far down before the day ended?

- Main stop, ${A.stopPct.toFixed(2)}%: **${I.daysTakingPlanStopFromOpenPct.toFixed(1)}% of days.**
- Fallback stop, ${A.fallbackStopPct.toFixed(2)}%: **${I.daysTakingFallbackStopFromOpenPct.toFixed(1)}% of days.**

The fallback scenario — long $${P.fallbackEntry.lowUsd}-${P.fallbackEntry.highUsd}, stop under $${P.fallbackStopUsd} — risks ${A.fallbackStopPct.toFixed(2)}% on a pair where **${I.daysTakingFallbackStopFromOpenPct.toFixed(0)}% of all days** would take it from the open alone. That is not a stop protecting a thesis. It is a bet on the entry candle.

The main stop is defensible. The fallback one is not, and it is the scenario a reader is most likely to reach for, because it is the one that fires when the breakout does not.

CHECK THREE: THE RULE, WALKED FORWARD

The levels only exist today, so to test the *method* I turned it into a rule: close above the highest high of the prior ${B.baseDays} days, entered at the **next open** (a rule that enters on the triggering close is reading a price you could not have traded), same stop, same targets, same partial, stop to breakeven after the first target, ${B.horizonDays}-day horizon, ${B.feePct}% round turn, stop charged first on any bar hitting both.

Control: random entries in the **same calendar months**, identical geometry and management.

\`\`\`
${backtestTable}
\`\`\`

The breakouts came in behind random entries. Median result: **${sign(B.all.medianR)}R** — the typical outcome is a full stop.

**Now the part that matters more than that table.** ${B.all.n} signals inside ${B.horizonDays}-day horizons is **${B.effectiveN.toFixed(1)} independent episodes**. That is not enough to convict this rule of anything. If it had come in *ahead* of the control I would be writing the same sentence.

So: not shown to work. Also not shown to fail. Anyone telling you either way from this sample is selling.

One thing the table does show cleanly: the volume condition. "Volume clearly above average" sounds like a filter. It excluded **${B.withoutVolumeConfirmation.n} of ${B.all.n}** signals. A 20-day high on a day volume is below its 20-day average is nearly a contradiction, so the condition mostly agrees with the trigger it is supposed to confirm. It feels like a second opinion. It is an echo.

WHAT I WOULD CHANGE, AND WHAT THAT BUYS

The obvious move here is to say "use a stop at 1.5 ATR like I do" and stop typing. So I ran it.

Same breakouts, stop ${HA.stopPct.toFixed(2)}% (1.5 ATR), target ${HA.targetPct.toFixed(2)}%, no partial: **${sign(HA.meanR)}R** against the plan's ${sign(B.all.meanR)}R.

It is not better. What it does buy is real but narrow: only **${HA.daysTakingThisStopFromOpenPct.toFixed(1)}%** of days take that stop from the open, against ${I.daysTakingPlanStopFromOpenPct.toFixed(1)}% for the plan's. The trade gets decided by whether the thesis was right instead of by which candle you entered on. That is worth having. It is not an edge, and I am not going to dress it up as one.

WHAT MY OWN BOARD SAYS

ICP is one of three names I follow whether or not they qualify, because readers hold them.

It does not qualify. Sample too thin — the same refusal it has drawn for weeks. It is not in my book today and I am not putting it there because a level is close.

WHAT I WOULD ACTUALLY DO WITH THIS PLAN

Keep: the structure. Levels defined in advance, an invalidation at $${P.invalidationUsd}, a base invalidation at $${P.baseInvalidationUsd}, 1-1.5% risk per trade, no averaging down. None of that depends on the forecast being right, which is why it is the part worth keeping.

Fix: the sizing number. Size off ${A.tp1R.toFixed(2)}R, not ${P.claimedRR.low}R, because ${A.tp1R.toFixed(2)}R is what the first exit actually pays.

Drop: the fallback long at $${P.fallbackEntry.lowUsd}-${P.fallbackEntry.highUsd} with a stop at $${P.fallbackStopUsd}. Widen that stop or skip the scenario.

Treat as unknown: whether the breakout trigger works at all. ${B.effectiveN.toFixed(1)} independent episodes is not evidence, in either direction.

Bias: WAIT

Every figure: research/icp-strategy.json at maix8.study/data/ — all ${B.all.n} breakouts and the control, so you can disagree with the numbers rather than with me.

My own losing book, same page: maix8.study/record

If a plan's headline reward-to-risk comes from a target its own rules tell you to exit before, what were you sizing off?

Educational research, not financial advice. You are responsible for your own risk.

#ICP #Bitcoin #Trading #RiskManagement`;

writeFileSync("drafts/95-icp-strategy.txt", text);
console.log("claims:", Object.keys(claims).length, "| words:", text.trim().split(/\s+/).length);
