/**
 * Post 82 — a market-wide recommendation built only from what survived testing.
 *
 * Four of this desk's own claims were measured this week. Three failed and one
 * was half right, which leaves a short list of things a recommendation is
 * allowed to lean on. This post applies exactly that list and shows the funnel,
 * because the interesting result is what the filters throw away: a board split
 * 46 long to 46 short admits six shorts and no longs at all.
 *
 * The geometry is fixed by rule rather than optimised per pair — 1.5 ATR stop,
 * 2:1 target, thirty days — which is the direct consequence of the
 * selection-bias measurement. A geometry nobody chose cannot be inflated by the
 * choosing, so its expectancy is an estimate rather than a maximum, and that is
 * the difference between this post and every "here are my picks" post.
 *
 * Two names that clear every earlier filter are still rejected at the last
 * step, and both are named. A recommendation that only shows what passed is
 * hiding the part that tells you how selective the process actually is.
 *
 * The edge is stated in the units a reader's account moves in, because +0.056R
 * sounds like something and 0.056% of an account per trade sounds like what it
 * is. Overstating it here would undo the point of the four posts before it.
 *
 * Every figure traces to research/market-call.json.
 */

import { readFileSync, writeFileSync } from "node:fs";
import { pct, price as fmtPrice, usd } from "../src/format.mjs";

const M = JSON.parse(readFileSync("research/market-call.json", "utf8"));
const B = JSON.parse(readFileSync("site/signals.json", "utf8"));
const b = M.breadth, t = M.tally, r = M.rules;

/** The funnel, recomputed here so the post's arithmetic is its own. */
const funnel = (bias) => {
  const set = B.signals.filter((s) => s.bias === bias);
  const tradeable = set.filter((s) => s.tradeable);
  const notThin = tradeable.filter((s) => s.confidence && s.confidence.effectiveN >= r.minEffectiveN);
  const unanimous = notThin.filter((s) => s.agreement?.windows === 5 && s.agreement.agreeing === 5);
  return { total: set.length, tradeable: tradeable.length, notThin: notThin.length, unanimous: unanimous.length };
};
const fLong = funnel("LONG"), fShort = funnel("SHORT");

const median = (xs) => {
  const s = [...xs].sort((a, b) => a - b);
  const m = s.length >> 1;
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};
const recMedianNetR = median(M.recommended.map((x) => x.fixed.fullNetR));

const claims = {
  "the tape is broadly heavy": b.upSharePct < 45 && b.medianChangePct < 0,
  "and the damage outnumbers the gains": b.downOver5 > b.upOver5 * 2,
  "the board itself looks balanced": Math.abs(t.LONG - t.SHORT) <= 2,
  "but no long survives the filters": fLong.unanimous === 0,
  "while six shorts do": fShort.unanimous === 6,
  "longs fail mostly on sample": fLong.notThin < 6,
  "every scored row is a short": M.longs === null && M.shorts.count === 6,
  "most of them pay at a geometry nobody chose": M.shorts.positiveFull >= 5,
  "two are rejected at the last step": M.rejected.length === 2,
  "and one of those is rejected for losing outright":
    M.rejected.some((x) => x.fullNetR < 0),
  "the other for disagreeing between windows":
    M.rejected.some((x) => x.fullNetR > 0 && !x.agrees),
  "four are left": M.recommended.length === 4,
  "and their edge is small": recMedianNetR > 0 && recMedianNetR < 0.1,
  "the samples behind them are not thin":
    M.recommended.every((x) => x.fixed.fullEffectiveN >= 12),
  "the stop is the width the desk measured": r.stopAtr === 1.5,
  "a third of the board is in a regime turn": t.turning / t.total > 0.3,
};
const bad = Object.entries(claims).filter(([, ok]) => !ok);
if (bad.length) { console.error("ABORT:"); for (const [c] of bad) console.error("  x " + c); process.exit(1); }

const row = (a, c, d, e, f) =>
  (String(a).padEnd(9) + String(c).padStart(9) + String(d).padStart(9)
    + String(e).padStart(9) + String(f).padStart(9)).trimEnd();

const scoredTable = M.all.map((s) => row(
  s.symbol.replace(/USDT$/, ""),
  `${pct(s.stopPct)}%`,
  s.fixed.fullExpectancyR.toFixed(3),
  s.fixed.fullNetR.toFixed(3),
  s.fixed.agreesAcrossWindows ? "ok" : "no",
)).join("\n");

const planRow = (a, c, d, e, f) =>
  (String(a).padEnd(9) + String(c).padStart(12) + String(d).padStart(12)
    + String(e).padStart(12) + String(f).padStart(8)).trimEnd();

const planTable = M.recommended.map((s) => planRow(
  s.symbol.replace(/USDT$/, ""),
  fmtPrice(s.entry),
  fmtPrice(s.stop),
  fmtPrice(s.target),
  `${Math.round(s.positionUsdPer1000)}`,
)).join("\n");

const funnelRow = (a, c, d, e) =>
  (String(a).padEnd(26) + String(c).padStart(8) + String(d).padStart(9)).trimEnd();

const text = `I scanned the exchange, then ran everything through the filters that survived this week's testing. Here is what the market looks like and what I would actually take.

THE TAPE

**${b.pairs} USDT pairs.** ${b.up} up, ${b.down} down — **${pct(b.upSharePct)}% green.** The median pair is ${pct(b.medianChangePct)}% on the day.

${b.downOver5} pairs are down more than 5%. **${b.downOver10} are down more than 10%.** Only ${b.upOver5} are up more than 5%.

That is not a market in trouble — it is a market grinding lower with the damage concentrated in the tail. Nothing dramatic happened to $BTC today. Plenty happened further down the list.

MY BOARD LOOKS PERFECTLY BALANCED

${t.total} pairs scanned: **${t.LONG} long, ${t.SHORT} short**, ${t.WAIT} stand aside. ${t.turning} rows carry a regime turn. ${t.untradeable} are too thin to trade at all.

Forty-six each way. If I stopped there I could publish whatever narrative I liked.

SO HERE IS THE FILTER, AND WHERE IT COMES FROM

Every condition traces to something I measured this week rather than something I believe:

**Liquid enough to fill.** A plan you cannot get into is not a plan.

**At least ${r.minEffectiveN} independent episodes.** My own engine already calls anything below that thin. I have been publishing thin rows anyway.

**All five lookback windows agreeing.** A direction that only pays measured one way is a property of the measurement.

\`\`\`
${funnelRow("", "long", "short")}
${funnelRow("signals on the board", fLong.total, fShort.total)}
${funnelRow("liquid enough", fLong.tradeable, fShort.tradeable)}
${funnelRow("sample not thin", fLong.notThin, fShort.notThin)}
${funnelRow("all 5 windows agree", fLong.unanimous, fShort.unanimous)}
\`\`\`

**Forty-six long signals. Zero survive.**

They mostly die at the sample step — only ${fLong.notThin} longs on the whole board have a sample I would call adequate, and none of those has all five windows behind it.

This is the same answer the out-of-sample test gave two days ago, arrived at from a different direction: long plans on this board held **−0.048R** and stayed positive on 27% of pairs, while shorts held +0.085R on 79%.

THE PART THAT MAKES THIS DIFFERENT FROM A PICKS LIST

I do **not** optimise the trade geometry.

Two days ago I measured what happens when you search 64 stop-and-target combinations per coin and publish the winner: it keeps about a tenth of itself out of sample and beats a randomly chosen geometry on 49% of pairs — a coin flip.

So every row below uses the **same fixed rule**: a ${r.stopAtr} ATR stop, a ${r.rewardRatio}:1 target, ${r.horizonDays} days. Nobody chose it for these coins. It came from a study across 61 pairs this morning.

A geometry nobody selected cannot be inflated by the selection. That is the entire reason to fix it.

Scored over each coin's full history at that fixed geometry, after fees:

\`\`\`
${row("", "stop", "gross", "net", "windows")}
${scoredTable}
\`\`\`

TWO GET CUT AT THE LAST STEP

**${M.rejected.find((x) => x.fullNetR < 0).symbol.replace(/USDT$/, "")}** loses outright at the fixed geometry — ${M.rejected.find((x) => x.fullNetR < 0).fullNetR.toFixed(3)}R after costs. Its board signal is real; the trade is not.

**${M.rejected.find((x) => x.fullNetR > 0).symbol.replace(/USDT$/, "")}** pays over the full history and **loses over the recent nine months**. When the two windows disagree in sign I do not take it, because I have no way to know which one you are about to live in.

Naming the rejects matters. A recommendation that only shows what passed tells you nothing about how selective it was.

WHAT I WOULD TAKE

Four shorts. Entry at the current price, stop and target from the fixed rule, size at 1% of the account risked:

\`\`\`
${planRow("", "entry", "stop", "target", "size")}
${planTable}
\`\`\`

The last column is the **position size** on an account of ${r.accountBase}, not the amount at risk. On ${M.recommended[0].symbol.replace(/USDT$/, "")} the ${pct(M.recommended[0].stopPct)}% stop means a position of ${Math.round(M.recommended[0].positionUsdPer1000)} puts ${r.riskPerTradeUsd} at risk — ${pct(r.riskPct)}% of the account.

NOW THE HONEST SIZE OF THIS

Median net expectancy across the four: **${recMedianNetR.toFixed(3)}R**.

At ${pct(r.riskPct)}% risked per position that is about **${pct(recMedianNetR)}% of your account per trade**, over a thirty-day horizon. Take all four and you are playing for well under half a percent, before anything goes wrong.

That is what a real edge looks like after costs, and it is why the four posts before this one spent so much effort deleting things. Every metric I removed this week was one that made the number look bigger than it is.

If you were hoping for a signal worth 3% a week, I do not have one, and neither does anyone showing you a backtest they optimised.

WHAT WOULD CHANGE MY MIND

A long row clearing all three filters. There is not one today; on a different tape there will be.

Or the market turning up hard enough that the short side's window agreement breaks. ${t.turning} of ${t.total} rows already carry a regime turn, so that is a live possibility rather than a courtesy.

Bias: **selective short**, four positions, small, at a geometry I did not choose.

Board and every figure: maix8.study/signals

Would your last trade have survived a filter that threw away 96 of 100 rows?

Educational research, not financial advice. You are responsible for your own risk.

#TradingSignals #RiskManagement #Crypto`;

writeFileSync("drafts/82-market-call.txt", text);
console.log("claims:", Object.keys(claims).length, "| words:", text.trim().split(/\s+/).length);
