/**
 * Post 75 — BNB tried the ceiling, and the ceiling won again.
 *
 * Two days ago a reader said BNB had broken $615 and I said it had touched it,
 * not broken it, on the grounds that no daily candle had closed above the band.
 * On 12 August it reached a new 30-day high of 620.55 and closed the same day
 * at 610.44. The count is now thirty days without a single close above 618.
 *
 * The post is written for a holder rather than a spectator, so the organising
 * question is what holding has actually paid from this state — not whether the
 * structure is attractive. Structure and expectancy are different questions and
 * BNB is the clearest case on the board of the two disagreeing.
 *
 * The strongest number in BNB's favour leads the counter-argument section
 * rather than being buried, because it is genuinely the best structural figure
 * this desk measures anywhere.
 *
 * Every figure traces to research/bnb-deep.json.
 */

import { readFileSync, writeFileSync } from "node:fs";
import { pct, price as fmtPrice, usd } from "../src/format.mjs";

const B = JSON.parse(readFileSync("research/bnb-deep.json", "utf8"));
const f = (h) => B.forward[h];
const p = B.path;

const claims = {
  "it made a new high and gave it back the same day": B.highDay.gaveBackPct < -1,
  "no daily close has cleared the ceiling in a month": B.closesAboveZoneLast30 === 0,
  "the ceiling has turned it back repeatedly": B.visits.rejected >= 5,
  "price sits near the top of its range": B.rangePosition30d > 80,
  "the short horizons are negative from here": [3, 5, 10].every((h) => f(h).conditionalMedianPct < 0),
  "and worse than the baseline": [3, 5, 10].every((h) => f(h).differencePct < 0),
  "the thirty-day figure rests on almost nothing": f(30).effectiveN < 6,
  "the path costs more than it pays": p.painToGain > 1,
  "overhead is still the best number on the board": B.overheadPct < 5,
  "the lookbacks are split rather than behind it": B.call.agreeing < B.call.windows,
};
const bad = Object.entries(claims).filter(([, ok]) => !ok);
if (bad.length) { console.error("ABORT:"); for (const [c] of bad) console.error("  x " + c); process.exit(1); }

const row = (x, b, c, d) =>
  (String(x).padEnd(10) + String(b).padStart(11) + String(c).padStart(12) + String(d).padStart(10)).trimEnd();

const fwdTable = [3, 5, 10, 30].map((h) =>
  row(`${h} days`, `${pct(f(h).conditionalMedianPct)}%`, `${pct(f(h).baselineMedianPct)}%`, `n≈${Math.round(f(h).effectiveN)}`)).join("\n");

const closes = B.last12.slice(-6).map((c) =>
  row(c.day.slice(5), fmtPrice(c.close), c.aboveZone ? "above" : "below", "")).join("\n");

const windows = Object.entries(B.byWindow).map(([w, v]) =>
  row(`${w}d`, v.longPositive, v.shortPositive, "")).join("\n");

const text = `Two days ago a reader told me $BNB had broken $615. I said it had touched it, not broken it, because no daily candle had closed above the band.

On 12 August BNB reached **${fmtPrice(B.range30.high)}** — a new 30-day high — and closed that same day at **${fmtPrice(B.highDay.close)}**. It gave back ${pct(Math.abs(B.highDay.gaveBackPct))}% before the day was out.

It is now ${fmtPrice(B.price)}, back **below** the band.

\`\`\`
${row("", "close", "vs 618", "")}
${closes}
\`\`\`

Daily closes above ${B.zone[1]} in the last thirty days: **${B.closesAboveZoneLast30}**.

That band has now been visited ${B.visits.total} times in three months and turned price back on ${B.visits.rejected} of them. This was the latest.

WHAT HOLDING FROM HERE HAS ACTUALLY PAID

BNB sits at **${pct(B.rangePosition30d)}% of its 30-day range**. That is a describable state, so it can be tested: every past day where BNB was at 85% or more of its range, and what the next few days did.

\`\`\`
${row("hold", "from here", "baseline", "sample")}
${fwdTable}
\`\`\`

Three days, five days, ten days — all negative, and all worse than an arbitrary day. Ten days out is the clearest: **${pct(f(10).conditionalMedianPct)}%** against a baseline of ${pct(f(10).baselineMedianPct)}%, higher only ${pct(f(10).upSharePct)}% of the time, on ${Math.round(f(10).effectiveN)} independent episodes.

The 30-day row looks encouraging. Ignore it. **${Math.round(f(30).effectiveN)} independent episodes** is not a measurement, it is four coin flips.

THE PART THAT MATTERS MORE THAN THE RETURN

A median return hides the ride. Over the ten days after a day like today:

\`\`\`
${row("deepest fall", `${pct(p.medianDrawdownPct)}%`, `base ${pct(p.baselineDrawdownPct)}%`, "")}
${row("highest rise", `${pct(p.medianRisePct)}%`, "", "")}
${row("pain / gain", pct(p.painToGain), "", "")}
\`\`\`

You sit through more than you collect. One time in four the fall is worse than ${pct(Math.abs(p.worstQuarterPct))}%; one time in ten, worse than ${pct(Math.abs(p.worstTenthPct))}%.

That ratio is the whole argument. Not "BNB will fall" — it might not. But from this specific position, the distribution has historically handed you a bigger drawdown than upside.

THE STRONGEST ARGUMENT AGAINST ME

BNB's supply trapped overhead is **${pct(B.overheadPct)}%**.

That is the share of the last month's turnover that traded above today's price — the people underwater, waiting to break even and sell. Across everything I scan, nothing else reads like that. Almost nobody who bought BNB this month is holding a loss, so there is no wall of sellers on the way up.

It is a genuinely excellent number and I am not going to bury it. But it argues that BNB is **not a short**. It does not argue that chasing it at the top of its range is a good entry. Those are different claims and the second one is the one on the table.

Turnover ${usd(B.turnoverUsd)} a day, RSI ${pct(B.rsi14)}, up ${pct(B.change7dPct)}% on the week.

WHAT THE LOOKBACKS SAY

I score every call over five lengths of history. If a direction only pays when measured one particular way, that is a property of the measurement.

\`\`\`
${row("", "long", "short", "")}
${windows}
\`\`\`

**${B.call.agreeing} of ${B.call.windows}** back the long. The six-month, eighteen-month and two-year windows do. The nine-month window says the opposite outright, and the one-year window is a coin flip.

A call three lookbacks out of five agree with is not a bad call. It is a call you size smaller than one that five agree with — and I have nothing on the board today with five.

WHAT I AM DOING

Bias: **stand aside on BNB**, unchanged from Tuesday and for the same reason, now with a failed attempt on the ceiling added to it.

If you are already long and in profit, the measurement above is the argument for taking some off rather than adding: negative expected return over three to ten days, and a pain-to-gain ratio of ${pct(p.painToGain)} pointing the wrong way. That is not the same as calling a top. It is saying this is a below-average place to be adding size.

If BNB closes a day above ${B.zone[1]} on rising volume, this post is wrong about the ceiling and I will say so with the same numbers.

Funding, open interest and liquidation data are blocked from this host, so none of it is used here. Prices are spot.

Board and every figure: maix8.study/signals

What would it take to change your mind about a position you are already holding?

Educational research, not financial advice. You are responsible for your own risk.

#BNB #RiskManagement #TechnicalAnalysis`;

writeFileSync("drafts/75-bnb-ceiling.txt", text);
console.log("claims:", Object.keys(claims).length, "| words:", text.trim().split(/\s+/).length);
