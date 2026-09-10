/**
 * Post 87 — BTC is not a call. It is the denominator.
 *
 * A reader asked for BTC market data. The honest version of that request runs
 * straight into what this desk measured yesterday: direction persistence at a
 * month is 50.70%, so a BTC readout can describe the present and nothing more.
 * Publishing "here is where BTC is, therefore here is where it goes" would
 * contradict the post directly below it on the same site.
 *
 * But there is a real answer, and it is the one the structural study found. The
 * thing that has held for ninety months is not a direction — it is that alts
 * bleed against BTC. That makes BTC the numeraire, and turns "where is BTC
 * going" into "how is everything else priced against it", which is a question
 * the data can actually answer.
 *
 * The post carries three obligations beyond the finding.
 *
 * It must correct a number already published. Always-short was reported at
 * t = 4.94 and later 5.69, computed as though sixty pairs shorted on one
 * morning were sixty independent bets. Per rebalance it is 1.46. That
 * comparison has appeared in every daily column, and a correction that only
 * lives in a commit message is not a correction.
 *
 * It must state that the trade is in its bad phase right now. The median alt is
 * beating BTC over thirty days, which is the condition under which this edge
 * does nothing, and saying so while the number is unflattering is the only
 * version of this that is worth anything.
 *
 * And it must not round 2021 away. Seven of eight years are positive; the
 * eighth is zero, and an earlier run of the same file put it fractionally on
 * the other side. At that size the sign is not information, and reporting the
 * friendlier run would be the exact failure this desk keeps auditing.
 *
 * Figures: research/btc-now.json, research/structural-edge.json,
 * research/self-backtest.json, research/persistence.json.
 */

import { readFileSync, writeFileSync } from "node:fs";

const B = JSON.parse(readFileSync("research/btc-now.json", "utf8"));
const S = JSON.parse(readFileSync("research/structural-edge.json", "utf8"));
const W = JSON.parse(readFileSync("research/self-backtest.json", "utf8"));

const M = S.matched, F = S.funding, N = B.asNumeraire, P = B.profile;
const span = (d) => B.spans.find((s) => s.days === d);
const yr = (y) => S.perYear.find((r) => r.year === y);
const carry = (y) => F.byYear.find((r) => r.year === y);
const shortAll = W.results.alwaysShort;
const cheapFee = S.sweep.find((r) => r.stopVolMultiple === S.rules.relativeStopVolMultiple && r.feePct === 0.8);

const positiveYears = S.perYear.filter((r) => r.shortRelR > 0).length;

const claims = {
  "BTC sits in the lower half of its own year":
    span(365).positionPct < 50,
  "and below the price where the recent volume actually traded":
    P.priceVsValueArea === "below" && P.overheadPct > 60,
  "with volatility contracting rather than expanding":
    B.volatility.realizedVol30Pct < B.volatility.realizedVol90Pct,
  "the engine stands aside":
    B.engine.bias === "WAIT" && B.engine.effectiveN == null,
  "longs are paying to be long":
    B.funding.live.annualised7dPct > 0,

  "shorting alts outright is nothing":
    Math.abs(M.vsUsdt.tStatByMonth) < 2,
  "shorting them against BTC is not":
    M.vsBtc.tStatByMonth > 3,
  "it survives funding":
    M.vsBtcAfterFunding.tStatByMonth > 2,
  "and it survives double the realistic fee":
    cheapFee.tStatByMonth > 2,
  "positive in every year measured":
    positiveYears === S.perYear.length && S.perYear.length === 8,
  "but one of them is sitting on zero, not above it":
    Math.abs(yr("2021").shortRelR) < 0.05,

  "funding costs almost nothing over the whole sample":
    Math.abs(F.meanCarryR) < 0.02,
  "and the position is paid to hold about half the time":
    F.incomePct > 45 && F.incomePct < 60,
  "carry was at its most positive in the year the trade did least":
    carry("2021").meanCarryR === Math.max(...F.byYear.map((r) => r.meanCarryR)),

  "the benchmark I published was inflated by counting tickets as bets":
    shortAll.tStat > shortAll.tStatByDate * 2,
  "and per rebalance it cannot be told from noise":
    Math.abs(shortAll.tStatByDate) < 2,

  "right now the median alt is beating BTC, which is this trade's bad phase":
    N.medianAltVsBtc30dPct > 0,
  "and the current year is the weakest since that flat one":
    yr("2026").shortRelR < yr("2025").shortRelR,
};
const bad = Object.entries(claims).filter(([, ok]) => !ok);
if (bad.length) { console.error("ABORT:"); for (const [c] of bad) console.error("  x " + c); process.exit(1); }

const sign = (v, dp = 4) => `${v >= 0 ? "+" : ""}${v.toFixed(dp)}`;
const money = (v) => Math.round(v).toLocaleString("en-US");

const spanRow = (a, b, c, d, e) =>
  (String(a).padEnd(9) + String(b).padStart(10) + String(c).padStart(11)
    + String(d).padStart(12) + String(e).padStart(11)).trimEnd();

const spanTable = [7, 30, 90, 365].map((d) => {
  const s = span(d);
  return spanRow(`${d}d`, money(s.low), money(s.high), `${s.positionPct.toFixed(1)}%`,
    `${sign(s.fromHighPct, 1)}%`);
}).join("\n");

const yearRow = (a, b, c) =>
  (String(a).padEnd(8) + String(b).padStart(16) + String(c).padStart(14)).trimEnd();

const yearTable = S.perYear.map((r) => yearRow(
  r.year, `${sign(r.medianDriftRelPct, 2)}%`, sign(r.shortRelR),
)).join("\n");

const variantRow = (a, b, c, d) =>
  (String(a).padEnd(34) + String(b).padStart(9) + String(c).padStart(13) + String(d).padStart(11)).trimEnd();

const variantTable = [
  ["short alts vs USDT", M.vsUsdt],
  ["short alts vs BTC", M.vsBtc],
  ["  same trades, funding priced", M.vsBtcFundedOnly],
  ["  same trades, funding charged", M.vsBtcAfterFunding],
].map(([n, v]) => variantRow(n, v.months, sign(v.meanNetR), v.tStatByMonth.toFixed(2))).join("\n");

const text = `Someone asked me for BTC market data. Here it is, and then the part that actually matters.

WHERE BTC IS

$BTC at ${money(B.price)}.

\`\`\`
${spanRow("window", "low", "high", "position", "from high")}
${spanTable}
\`\`\`

**It sits at ${span(365).positionPct.toFixed(1)}% of its own year**, ${Math.abs(span(365).fromHighPct).toFixed(1)}% under the high, and the 90-day low and the 365-day low are the same number — ${money(span(90).low)}.

ATR is ${B.volatility.atrPct.toFixed(2)}%, so a 1.5 ATR stop is ${B.volatility.stopAt15AtrPct.toFixed(2)}%. Realised volatility is **${B.volatility.realizedVol30Pct.toFixed(1)}% over 30 days against ${B.volatility.realizedVol90Pct.toFixed(1)}% over 90** — contracting, not expanding. RSI ${B.momentum.rsi14.toFixed(0)}.

Volume profile over the last ${P.hoursCovered} hours: the point of control is ${money(P.pointOfControl)}, the value area runs ${money(P.valueAreaLow)} to ${money(P.valueAreaHigh)}, and price is below it. **${P.overheadPct.toFixed(1)}% of that month's volume changed hands above where BTC trades now.**

Funding on the perpetual is ${sign(B.funding.live.annualised7dPct, 1)}% annualised over the week, negative in ${B.funding.live.negativeSharePct.toFixed(0)}% of periods. Longs are paying, steadily and unremarkably. Nobody is crowded.

My own engine says **${B.engine.bias}** — both directions lose over its recent window. No plan, so no sample and no lookback count to quote.

NOW THE PART THAT MATTERS

Every number above describes the present. Not one of them forecasts anything, and I am not going to pretend otherwise, because yesterday I published the measurement that forbids it: the sign of a trailing return matches the sign of the next one **${B.standing.directionPersistence30dPct.toFixed(2)}%** of the time at a one-month horizon. A coin toss.

So "is BTC going up" is a question I have measured myself unable to answer. Which leaves a better one.

BTC IS NOT A CALL. IT IS THE DENOMINATOR.

I went looking for anything that survived that persistence result, over ${M.vsBtc.months} non-overlapping months back to 2019 and ${S.pairs} pairs. One thing did, and it is not a forecast.

\`\`\`
${variantRow("", "months", "mean net R", "t")}
${variantTable}
\`\`\`

Shorting alts **against USDT** returns ${sign(M.vsUsdt.meanNetR)}R at t ${M.vsUsdt.tStatByMonth.toFixed(2)}. Nothing. Shorting the same alts **against BTC** returns ${sign(M.vsBtc.meanNetR)}R at t ${M.vsBtc.tStatByMonth.toFixed(2)}.

Same trades, same stop, same fee, same scoring. The only difference is what you divide by.

\`\`\`
${yearRow("year", "median alt vs BTC", "short vs BTC")}
${yearTable}
\`\`\`

**Positive in all ${S.perYear.length} years**, including the bull runs — but read 2021 properly. It is ${sign(yr("2021").shortRelR)}R, which is zero, and it is the year alts outran BTC.

I have now run this file three times while building it, and that one year has come out on both sides of zero. Nothing changed but which pairs the exchange happened to list as most-traded that hour. So the file now pins its universe to the cached run: re-scoring cannot silently redraw the sample. Seven years carry this result. The eighth is noise, and quoting whichever run flattered me would be the exact failure I keep auditing other people for.

WHAT IT COSTS TO HOLD

The trade is two perpetual legs for a month, which is about ninety funding payments. The first version of this study charged fees and ignored every one of them.

Binance's futures endpoint is geo-blocked from here, so I rebuilt the series from the exchange's own public monthly dumps. My first look said the trade was dead: averaged across each symbol's whole history, the median alt funds about twelve percent a year **below** BTC — shorts pay to hold exactly the coins that bleed, which is the market pricing the drift.

That average was wrong in a specific way. It was dominated by a handful of recent listings with extreme rates and almost no trades behind them. Weighted by the episodes actually taken, carry is **${sign(F.meanCarryR)}R** mean, ${sign(F.medianCarryR)}R median, and **the position is paid to hold in ${F.incomePct.toFixed(0)}% of them.**

Funding costs this trade ${Math.abs(M.vsBtcAfterFunding.meanNetR - M.vsBtcFundedOnly.meanNetR).toFixed(4)}R a month. And it leans the right way: **the year carry paid most, ${sign(carry("2021").meanCarryR)}R, was 2021** — the year the trade itself did nothing. When alts outrun BTC, longs are paying, and the short collects while it waits.

Costs are still the binding constraint, not funding. It survives ${cheapFee.feePct}% round trip at t ${cheapFee.tStatByMonth.toFixed(2)}, and four perpetual fills at taker rates is around 0.2% — so the ${S.rules.feePctRelative}% I charged is already double the real thing.

A NUMBER I PUBLISHED WAS WRONG

This one matters more than the finding.

Every daily column has carried the line that shorting every liquid pair, with no signal at all, beat my pipeline — most recently at t = ${shortAll.tStat.toFixed(2)}. I used it as the benchmark that proved my own work was worthless.

The t was inflated. Shorting sixty pairs on one morning is **one bet on one month, sixty times over**, and counting each ticket as an independent observation multiplies the ratio by roughly the square root of the number of pairs. Computed per rebalance, always-short is **t = ${shortAll.tStatByDate.toFixed(2)}**. Over ninety months instead of ${W.rebalances}, shorting alts outright pays ${sign(M.vsUsdt.meanNetR)}R at t ${M.vsUsdt.tStatByMonth.toFixed(2)}.

It is the same error I spent a post criticising — inflating a sample by counting correlated things as independent — committed in the tool I used to judge everything else. The daily column now prints the per-rebalance figure and says the benchmark cannot be told from noise either.

WHERE THIS STANDS TODAY, INCLUDING THE INCONVENIENT PART

Of ${N.altsMeasured} liquid alts priced against BTC right now, **${N.beatingBtc30d} are beating it over 30 days** and the median alt is ${sign(N.medianAltVsBtc30dPct, 1)}% against it.

That is the opposite of the seven-year pattern, and it is exactly the condition in which this trade does nothing. The current year sits at ${sign(yr("2026").shortRelR)}R against ${sign(yr("2025").shortRelR)}R last year — the weakest since the flat one.

So: the one thing I have measured that works is not working this month. I cannot yet separate "alts are having a strong run" from "the edge is being priced away", and the difference needs more months rather than more analysis. Carry turning more negative recently is the sort of thing a crowded trade does.

I am not taking it here, and I am not telling you to. What I am doing is publishing the number while it is ugly, so that when it recovers you can check I did not start measuring only after it did.

WHAT TO TAKE FROM THIS

If you hold BTC, the useful question is not the one everyone asks. It is not whether BTC goes up — I have measured that I cannot answer it, and so has everyone selling you the answer, whether or not they know.

It is what BTC is the denominator of. For seven of the last eight years, holding BTC beat holding the median alt, and the gap paid more reliably than any direction call this desk has ever produced.

Every figure: research/btc-now.json, research/structural-edge.json, research/self-backtest.json. All three are on the site and you can recompute any of them.

If you hold something, what is it the denominator of — and have you ever measured that, or only its price?

maix8.study/record

Educational research, not financial advice. You are responsible for your own risk.

#Bitcoin #Trading #RiskManagement`;

writeFileSync("drafts/87-numeraire.txt", text);
console.log("claims:", Object.keys(claims).length, "| words:", text.trim().split(/\s+/).length);
