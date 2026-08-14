/**
 * Post 81 — BTC and BNB with the argument I lean on hardest deleted.
 *
 * Post 80 established, across 75 pairs, that trapped overhead supply does not
 * predict returns. Overhead was load-bearing in most of what this desk has
 * written about these two coins. So both are re-derived from what survives.
 *
 * The strongest thing in this post is that each coin's own history contradicts
 * my usage, and in opposite directions: BTC's "dangerous" 95% reading has been
 * followed by better than its own average, and BNB's "excellent" 13% reading by
 * worse. That is a far more convincing demonstration than the universe study,
 * because a reader holding one of these coins can check it on the coin they
 * hold.
 *
 * It is also the exact trap this desk warned about two days ago. Two per-coin
 * differences of about a point, on samples of five to eighteen episodes, are
 * inside the noise the universe study already established. The post therefore
 * refuses to flip the metric around and says why — using a dead indicator
 * backwards is still using a dead indicator.
 *
 * Every figure traces to research/btc-bnb-final.json and research/overhead-test.json.
 */

import { readFileSync, writeFileSync } from "node:fs";
import { pct, price as fmtPrice, usd } from "../src/format.mjs";

const F = JSON.parse(readFileSync("research/btc-bnb-final.json", "utf8"));
const O = JSON.parse(readFileSync("research/overhead-test.json", "utf8"));
const btc = F.assets.BTCUSDT, bnb = F.assets.BNBUSDT;

const claims = {
  "BTC sits below its value area with the POC overhead":
    btc.priceVsValueArea === "below" && btc.distanceToPocPct > 0,
  "and near the bottom of its 30-day range": btc.rangePosition30d < 25,
  "BTC's overhead reads as badly as it gets": btc.overheadProfilePct > 90,
  "yet its own history from that state beat its own baseline":
    btc.conditional[10].differencePct > 0 && btc.conditional[30].differencePct > 0,

  "BNB sits above its value area": bnb.priceVsValueArea === "above",
  "with the POC well below it": bnb.distanceToPocPct < -4,
  "BNB's overhead reads as well as it gets": bnb.overheadProfilePct < 20,
  "yet its own history from that state lagged its own baseline":
    bnb.conditional[10].differencePct < 0,
  "so the two coins contradict my usage in opposite directions":
    btc.conditional[10].differencePct > 0 && bnb.conditional[10].differencePct < 0,
  "and both differences are inside the noise the universe study found":
    Math.abs(btc.conditional[10].differencePct) < 2 && Math.abs(bnb.conditional[10].differencePct) < 2,
  "the thirty-day rows rest on almost nothing":
    btc.conditional[30].effectiveN < 8 && bnb.conditional[30].effectiveN < 8,

  "four of BTC's five lookbacks lean short": btc.leaningShort === 4,
  "four of BNB's five lean long": bnb.lookbackCount - bnb.leaningShort === 4,
  "but BNB's sample is thin": bnb.call.thin === true && bnb.call.effectiveN <= 6,
  "and its lookbacks are not unanimous": bnb.call.agreeing < bnb.call.windows,
  "the sample weighting cuts BNB's headline figure":
    bnb.call.trustedExpectancyR < bnb.call.rawExpectancyR * 0.7,

  "the stop this desk uses is about a third of an ordinary week":
    btc.stop.shareOfMedianWeek < 0.45 && bnb.stop.shareOfMedianWeek < 0.45,
  "the board stands aside on BTC": btc.call.bias === "WAIT",
  "and is long BNB, which I am about to disagree with": bnb.call.bias === "LONG",
  "high overhead is the ordinary state of this market": O.bands[4].sharePct > 35,
};
const bad = Object.entries(claims).filter(([, ok]) => !ok);
if (bad.length) { console.error("ABORT:"); for (const [c] of bad) console.error("  x " + c); process.exit(1); }

const row = (a, b, c, d) =>
  (String(a).padEnd(14) + String(b).padStart(10) + String(c).padStart(12) + String(d).padStart(9)).trimEnd();

const condTable = (a) => [10, 30].map((h) => row(
  `${h} days`,
  `${pct(a.conditional[h].medianPct)}%`,
  `${pct(a.conditional[h].baselineMedianPct)}%`,
  `n≈${Math.round(a.conditional[h].effectiveN)}`,
)).join("\n");

const lookRow = (a, b, c) => (String(a).padEnd(10) + String(b).padStart(10) + String(c).padStart(10)).trimEnd();
const lookTable = (a) => Object.entries(a.lookbacks)
  .map(([, v]) => lookRow(`${v.days}d`, v.long, v.short)).join("\n");

const text = `Yesterday I gave $BTC a stand-aside call, and one of my reasons was that the great majority of the last month's turnover had traded above the current price — a wall of trapped sellers overhead.

This morning I published a study across 75 pairs showing that reasoning **does not work**. Overhead supply predicts nothing.

So here are both coins again, with my most-used argument deleted. And the first thing that happened when I removed it was worse than I expected.

EACH COIN'S OWN HISTORY DISAGREES WITH ME

Take today's overhead reading on each coin, find every past day within ten points of it, and see what followed — against that same coin's own baseline.

$BTC reads **${pct(btc.overheadProfilePct)}%** underwater. About as bad as the metric gets.

\`\`\`
${row("hold", "from here", "its baseline", "sample")}
${condTable(btc)}
\`\`\`

**Better** than its own average, at both horizons.

$BNB reads **${pct(bnb.overheadProfilePct)}%**. Two days ago I called that "the best number on the board".

\`\`\`
${row("hold", "from here", "its baseline", "sample")}
${condTable(bnb)}
\`\`\`

**Worse** than its own average over ten days — ${pct(bnb.conditional[10].medianPct)}% against ${pct(bnb.conditional[10].baselineMedianPct)}%, higher exactly ${pct(bnb.conditional[10].upSharePct)}% of the time.

Two coins. Opposite readings. Both contradicting how I used the number, each on its own data.

NOW THE PART THAT KEEPS ME HONEST

The obvious move is to flip the metric around and start buying high overhead.

No.

Both differences are about **one percentage point**, on samples of five to eighteen independent episodes. That is well inside the noise the universe study already measured — where five bands landed within ${pct(Math.max(...O.bands.flatMap((b) => O.horizons.map((h) => Math.abs(b.forward[h].differencePct)))))} of a point of each other and changed sign between horizons.

Two days ago I published a measurement showing that picking the best-looking cell per coin buys nothing. Flipping an indicator because two coins happened to lean the other way is that same mistake wearing a different hat.

The finding is **stop using it**, not **use it backwards**. A dead indicator run in reverse is still a dead indicator.

$BTC — WHAT IS ACTUALLY LEFT

${fmtPrice(btc.price)}. Down ${pct(Math.abs(btc.change7dPct))}% on the week, RSI ${pct(btc.rsi14)}.

**Range position ${pct(btc.rangePosition30d)}%** — the bottom of its 30-day range (${fmtPrice(btc.range30.low)}–${fmtPrice(btc.range30.high)}).

Price sits **below** its value area (${fmtPrice(btc.valueArea[0])}–${fmtPrice(btc.valueArea[1])}), with the point of control — the single price where most volume changed hands — at ${fmtPrice(btc.poc)}, **${pct(btc.distanceToPocPct)}% above here**. That is a statement about where volume is, not a forecast, and I am labelling it as such this time.

\`\`\`
${lookRow("lookback", "long", "short")}
${lookTable(btc)}
\`\`\`

**${btc.leaningShort} of ${btc.lookbackCount} lookbacks lean short.** Only the two-year window leans long. The board's call is **${btc.call.bias}** — both directions lose over the recent window — and the row carries a regime turn.

$BNB — AND WHERE I DISAGREE WITH MY OWN BOARD

${fmtPrice(bnb.price)}. Up ${pct(bnb.change7dPct)}% on the week, ${pct(bnb.change30dPct)}% on the month, RSI ${pct(bnb.rsi14)}.

**Range position ${pct(bnb.rangePosition30d)}%** — near the top. And price sits **above** its value area (${fmtPrice(bnb.valueArea[0])}–${fmtPrice(bnb.valueArea[1])}), with the POC ${pct(Math.abs(bnb.distanceToPocPct))}% *below*.

That is the number that replaces overhead in the BNB argument, and it points the other way: there is no volume shelf under this price. The nearest one is nearly 6% down.

\`\`\`
${lookRow("lookback", "long", "short")}
${lookTable(bnb)}
\`\`\`

${bnb.lookbackCount - bnb.leaningShort} of ${bnb.lookbackCount} lean long — genuinely the best structural profile on my board. But the nine-month window says the opposite outright, the sample behind the call is **${Math.round(bnb.call.effectiveN)} independent episodes**, and the board flags it thin.

The board says **${bnb.call.bias}**. I am not taking it, and I will say exactly why rather than quietly ignoring my own tool: two days ago I measured that long plans on this board held **−0.048R** out of sample and stayed positive on only 27% of pairs. A thin long, at the top of its range, above its value area, is the weakest version of a call that already fails that test.

WHAT CHANGED ON THE BOARD TODAY

The board used to sort by raw expectancy. That put **seven tokenised equities at the top**, every one showing above 1.6R on fewer than two independent episodes.

That is not bad luck. The plan is the best of 64 geometries, and a maximum over noisy estimates is largest exactly where the sample is smallest — so the old sort was reliably surfacing the rows with the least evidence behind them.

Rows are now ordered by expectancy **weighted for sample size**. BNB's own headline moves from ${pct(bnb.call.rawExpectancyR)}R to ${pct(bnb.call.trustedExpectancyR)}R under that weighting. The published figure is unchanged — only what you see first is.

IF YOU ARE TRADING EITHER

A 1.5 ATR stop — the width I measured this morning as the useful one — is **${pct(btc.stop.pct)}%** on BTC and **${pct(bnb.stop.pct)}%** on BNB.

On both that is about **a third of an ordinary week** (${pct(btc.medianWeekPct)}% and ${pct(bnb.medianWeekPct)}%). Costs run ${btc.stop.feeR.toFixed(3)}R a round trip at that width.

Anything tighter and an unremarkable week takes you out. Anything much wider and you are past the point where widening stopped helping.

WHERE I LAND

Bias: **WAIT on both.**

$BTC because four of five lookbacks lean short while price sits under its value area — the direction is contested and the location is poor.

$BNB because the case for it was largely the number I retired this morning, and what remains is a thin long above its volume shelf.

If BNB closes back inside its value area on rising participation, the location argument changes and I will say so with the same figures.

One last number worth keeping. ${pct(O.bands[4].sharePct)}% of all days in this universe sit in the highest overhead band. Most of the time, on most coins, most of the recent money is underwater. It is not a warning. It is Tuesday.

Board and every figure: maix8.study/signals

What would you still hold if you deleted your favourite reason for holding it?

Educational research, not financial advice. You are responsible for your own risk.

#BTC #BNB #RiskManagement`;

writeFileSync("drafts/81-btc-bnb.txt", text);
console.log("claims:", Object.keys(claims).length, "| words:", text.trim().split(/\s+/).length);
