/**
 * Post 76 — the desk's most-repeated rule, tested at last, and half of it fails.
 *
 * I have written some version of "a stop under one daily ATR is inside the
 * noise" about six times, always measured on the single asset in front of me.
 * research/stop-law.mjs finally runs it across the board. The tight-stop half
 * survives. The "so go wider" half does not: expectancy peaks near 1.5 ATR and
 * decays, and in one panel a three-ATR stop scores worse than the half-ATR stop
 * I was warning people about.
 *
 * The post leads with the correction rather than the confirmation, because a
 * channel that publishes its tests and then buries the failures is running a
 * marketing department with a backtest attached.
 *
 * Two things are deliberately not claimed. Stop widths stay in ATR rather than
 * percent, since the study never stored a per-pair stop size and converting one
 * from the fee columns would be arithmetic dressed as a measurement. And no
 * direction is attached to the piece — it is about mechanics, so it ships with
 * --no-call.
 *
 * Every figure traces to research/stop-law.json.
 */

import { readFileSync, writeFileSync } from "node:fs";

const S = JSON.parse(readFileSync("research/stop-law.json", "utf8"));
const at = (h, d, a) => S.rows.find((r) => r.horizon === h && r.direction === d && r.stopAtr === a);
const STOPS = [0.5, 0.75, 1, 1.5, 2, 3, 4];
const panels = [10, 30].flatMap((h) => ["long", "short"].map((d) => [h, d]));
const bestBy = (h, d, key) => S.rows.filter((r) => r.horizon === h && r.direction === d)
  .reduce((a, b) => (a[key] > b[key] ? a : b)).stopAtr;
const worstE = (h, d) => S.rows.filter((r) => r.horizon === h && r.direction === d)
  .reduce((a, b) => (a.medianExpectancyR < b.medianExpectancyR ? a : b)).stopAtr;

const feeGapTight = at(30, "long", 0.5).medianExpectancyR - at(30, "long", 0.5).medianNetR;
const feeGapWide = at(30, "long", 3).medianExpectancyR - at(30, "long", 3).medianNetR;
const cut10 = at(10, "long", 0.5).medianStoppedPct - at(10, "long", 2).medianStoppedPct;
const cut30 = at(30, "long", 0.5).medianStoppedPct - at(30, "long", 2).medianStoppedPct;

const claims = {
  "the tightest stop is stopped out more often than not, everywhere":
    panels.every(([h, d]) => at(h, d, 0.5).medianStoppedPct > 50),
  "it is the worst expectancy in three panels of four":
    panels.filter(([h, d]) => worstE(h, d) === 0.5).length === 3,
  "the exception is longs held a month, where three ATR is worse":
    worstE(30, "long") === 3
    && at(30, "long", 3).medianExpectancyR < at(30, "long", 0.5).medianExpectancyR,
  "expectancy peaks at 1.5 ATR in three panels of four":
    panels.filter(([h, d]) => bestBy(h, d, "medianExpectancyR") === 1.5).length === 3,
  "shorts held a month are the exception and keep improving to four":
    bestBy(30, "short", "medianExpectancyR") === 4,
  "widening helps far more over ten days than over thirty": cut10 > 15 && cut30 < 15,
  "longs are negative at every width in both horizons":
    [10, 30].every((h) => STOPS.every((a) => at(h, "long", a).medianExpectancyR < 0)),
  "shorts are positive from three quarters of an ATR up":
    [10, 30].every((h) => STOPS.filter((a) => a >= 0.75).every((a) => at(h, "short", a).medianExpectancyR > 0)),
  "but the 0.75 row is a losing trade once fees are paid":
    [10, 30].every((h) => at(h, "short", 0.75).medianNetR < 0 && at(h, "short", 1).medianNetR > 0),
  "the fee gap is several times larger at the tightest stop": feeGapTight > feeGapWide * 4,
  "fees push the best ten-day long stop wider":
    bestBy(10, "long", "medianNetR") > bestBy(10, "long", "medianExpectancyR"),
  "the study is wide enough to be worth quoting": S.pairs >= 50 && S.historyDays >= 500,
  "every claim in the study file passes": Object.values(S.claims).every(Boolean),
};
const bad = Object.entries(claims).filter(([, ok]) => !ok);
if (bad.length) { console.error("ABORT:"); for (const [c] of bad) console.error("  x " + c); process.exit(1); }

const r3 = (v) => (v >= 0 ? "+" : "") + v.toFixed(3);
const row = (a, b, c, d) =>
  (String(a).padEnd(10) + String(b).padStart(9) + String(c).padStart(10) + String(d).padStart(10)).trimEnd();

const table10 = STOPS.map((a) => row(
  `${a} ATR`,
  `${at(10, "long", a).medianStoppedPct.toFixed(1)}%`,
  r3(at(10, "long", a).medianExpectancyR),
  r3(at(10, "short", a).medianExpectancyR),
)).join("\n");

const table30 = STOPS.map((a) => row(
  `${a} ATR`,
  `${at(30, "long", a).medianStoppedPct.toFixed(1)}%`,
  r3(at(30, "long", a).medianExpectancyR),
  r3(at(30, "long", a).medianNetR),
)).join("\n");

/** The half-ATR stop-out rate across all four panels, not just the longs. */
const tightRates = panels.map(([h, d]) => at(h, d, 0.5).medianStoppedPct);
const tightLow = Math.min(...tightRates), tightHigh = Math.max(...tightRates);

const text = `I have written this sentence about six times:

*"A stop under one daily ATR is inside the noise — you are paying to be stopped out by an ordinary Tuesday."*

About an $ICP plan. About $XLM. About three $BNB setups. About every ladder a reader has sent me. Each time I checked it on that one asset and moved on.

A claim made six times about six single names is not a law. It is a habit.

So I ran it across the whole board. **${S.pairs} pairs, ${S.historyDays} days, both directions.** Half of it held. The half I said loudest did not.

HOW IT WAS TESTED

Widen the stop from half a daily range to four, and keep everything else fixed — the target is always twice the stop, so the stop is the only thing changing.

Each attempt is walked bar by bar. A bar that touches both the stop and the target is charged to the **stop**, never the target. Attempts that reach neither by the deadline are marked at whatever they are worth on the last day — not quietly dropped, which is the single easiest way to make any rule look profitable.

Expectancy is in R: what one unit of risk returned on average.

\`\`\`
${row("10 days", "stopped", "E long", "E short")}
${table10}
\`\`\`

WHAT SURVIVED

At half an ATR you are stopped out on **${tightLow.toFixed(0)}–${tightHigh.toFixed(0)}%** of attempts — more often than not, in every panel I measured. It is also the worst expectancy cell in three panels out of four.

That part of the rule stands. A stop inside one day's range is a coin the market flips against you about two times in three.

WHAT DID NOT SURVIVE

Every time I said that, I implied the fix: **go wider.**

That is wrong.

Expectancy peaks at **1.5 ATR** in three panels of four and gets worse after. And in the fourth panel — longs held a month — a three-ATR stop scores **${r3(at(30, "long", 3).medianExpectancyR)}**, which is worse than the half-ATR stop I have been warning people about (${r3(at(30, "long", 0.5).medianExpectancyR)}).

\`\`\`
${row("30 days", "stopped", "E long", "net")}
${table30}
\`\`\`

Both ends of that column lose. The rule is not "wider". It is **"about one and a half"**.

THE THING I NEVER MENTIONED: HOW LONG

Over ten days, widening from half an ATR to two cuts the stop-out rate from ${at(10, "long", 0.5).medianStoppedPct.toFixed(1)}% to ${at(10, "long", 2).medianStoppedPct.toFixed(1)}% — **${cut10.toFixed(0)} points**.

Over thirty days the identical widening buys you ${at(30, "long", 0.5).medianStoppedPct.toFixed(1)}% to ${at(30, "long", 2).medianStoppedPct.toFixed(1)}%. **${cut30.toFixed(0)} points.**

Hold long enough and a wide stop stops protecting you, because given a month price will eventually visit almost any level you name. Time widens your stop for you, whether or not you wanted it widened.

I have been handing out stop advice without asking how long the trade was meant to live. That question changes the answer.

THE COLUMN I DID NOT ENJOY PRINTING

Look at the two expectancy columns again. **Longs are negative at every single stop width, in both horizons.** Fourteen cells, fourteen losses. Shorts are positive from three quarters of an ATR upward, all of them.

That is not a fact about stop placement. It is the same thing the baseline column showed in the gainers study two days ago: the median liquid altcoin has drifted **down** over these windows. No stop width repairs being on the wrong side of that.

WHERE THE FEES LAND

Compare the last two columns of the 30-day table. The gap between raw expectancy and expectancy after costs is **${feeGapTight.toFixed(3)}R** at half an ATR and **${feeGapWide.toFixed(3)}R** at three. The fee is fixed; the risk you divide it by is not.

Two consequences most people miss:

**Paying fees moves the best stop wider.** Before costs, the ten-day long peaks at ${bestBy(10, "long", "medianExpectancyR")} ATR. After costs, at ${bestBy(10, "long", "medianNetR")} ATR. The width that looks best on the chart is not the width that is best in an account.

**And it deletes a row.** Shorts at 0.75 ATR are positive before fees and negative after, in both horizons. That is a strategy that exists on paper and loses money when traded.

WHAT I AM CHANGING

Refusing stops under one ATR: **kept**, now measured across the board rather than asserted.

"Wider is safer": **deleted.** It is false past roughly 1.5 ATR and can be worse than the mistake it was correcting.

New default on this desk: **1.5 ATR with a 2:1 target** — and every stop I publish from now on gets stated next to the holding period it assumes, because the two are one decision, not two.

THE LIMITS

${S.pairs} pairs, one exchange, one reward ratio, ${S.historyDays} days. These are medians across pairs, so an individual pair can and does behave differently from the row. A different reward ratio would move the peak; I have not measured where.

And this is a statement about where the board sits, not a promise about the specific coin you are holding.

Everything above traces to a committed file, so anyone can check the arithmetic rather than take my word for it — which is rather the point of publishing the failures alongside the results.

Board and every figure: maix8.study/signals

How long is your current trade meant to live, and does your stop know that?

Educational research, not financial advice. You are responsible for your own risk.

#RiskManagement #TradingSignals #Trading`;

writeFileSync("drafts/76-stop-law.txt", text);
console.log("claims:", Object.keys(claims).length, "| words:", text.trim().split(/\s+/).length);
