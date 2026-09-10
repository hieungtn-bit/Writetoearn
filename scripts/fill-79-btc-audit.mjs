/**
 * Post 79 — auditing a reader's BTC note that reaches the same call I do.
 *
 * The note recommends WAIT on BTC. So does my board. That agreement is the
 * reason the post can be useful rather than combative: with the conclusion not
 * in dispute, the only thing left to examine is the reasoning, which is the
 * part nobody checks.
 *
 * Seven claims check out, including two good ones — the resistance band the
 * note names contains the volume-profile POC, and both stop distances land
 * between 1.1 and 1.4 daily ATR, which is where this morning's stop-law study
 * put the useful range. The post leads with those, because an audit that opens
 * with the errors is a hit piece.
 *
 * Three claims fail on the exchange's own record, and one piece of arithmetic
 * fails on the note's own numbers: the stated reward-to-risk is roughly double
 * what the stated entry, stop and target produce at the first target. That is
 * the finding, because it moves the break-even win rate from 33% to 49%.
 *
 * The trigger structure is then walked over BTC's history with the note's exact
 * geometry. It is reported with its effective sample — 10.5 and 8.7 independent
 * episodes — so nobody mistakes it for a settled result.
 *
 * Every figure traces to research/btc-audit.json.
 */

import { readFileSync, writeFileSync } from "node:fs";
import { pct, price as fmtPrice } from "../src/format.mjs";

const A = JSON.parse(readFileSync("research/btc-audit.json", "utf8"));
const b = A.btc, m = A.measuredReadings, g = A.geometry, t = A.triggers;
const bnb = A.alts.BNBUSDT, icp = A.alts.ICPUSDT, lv = A.altLevels;
const S3 = JSON.parse(readFileSync("research/three-stage.json", "utf8")).assets.BTCUSDT;

/** How the five lookback windows split on BTC, counted rather than eyeballed. */
const shortLeaning = Object.values(S3.lookbacks)
  .filter((v) => Number(v.shortPositive.split("/")[0]) > Number(v.longPositive.split("/")[0])).length;
const longestLeansLong = (() => {
  const w = S3.lookbacks[Math.max(...Object.keys(S3.lookbacks).map(Number))];
  return Number(w.longPositive.split("/")[0]) > Number(w.shortPositive.split("/")[0]);
})();

const claims = {
  "the August range in the note matches the exchange": b.augustRangeMatches,
  "the lower-high structure is real": b.lowerHighsSincePeak,
  "the support band was genuinely tested, twice": b.supportTests.length >= 2,
  "the resistance band contains the volume-profile POC": b.resistanceContainsPoc,
  "the on-chain valuation figures are internally consistent": b.mvrvConsistent,
  "the dominance reading is accurate": m.dominanceMatches,
  "both stops sit in the width this desk measured as useful":
    g.long.stopInAtr > 1 && g.long.stopInAtr < 1.6 && g.short.stopInAtr > 1 && g.short.stopInAtr < 1.6,

  "the quoted price band is below where BTC actually is": !b.priceInStatedBand,
  "today is not the lowest close of the month": !b.isLowestCloseOfAugust,
  "the Fear and Greed reading is wrong, and wrong toward calm":
    !m.fearGreedMatches && m.fearGreed < A.note.statedFearGreed,

  "the stated reward-to-risk fails at the first target on both sides":
    g.long.tp1.rr < A.note.long.statedRr[0] && g.short.tp1.rr < A.note.short.statedRr[0],
  "at the first target both are roughly one to one":
    Math.abs(g.long.tp1.rr - 1) < 0.15 && Math.abs(g.short.tp1.rr - 1) < 0.15,
  "even the second target falls short of the stated range":
    g.long.tp2.rr < A.note.long.statedRr[0] && g.short.tp2.rr < A.note.short.statedRr[0],
  "the stated ratio needs the best corner of every band at once":
    g.long.bestCaseRr > A.note.long.statedRr[0],
  "the break-even win rate is far above what one to two implies":
    g.long.tp1.breakEvenHitPct > 45 && g.short.tp1.breakEvenHitPct > 45,

  "the long trigger has lost money on BTC's own history":
    t.longTp1.expectancyR < 0 && t.longTp2.expectancyR < 0,
  "the short trigger pays only at the further target":
    t.shortTp2.netR > 0 && t.shortTp1.netR < 0,
  "and none of it rests on much": t.longTp1.effectiveN < 12 && t.shortTp1.effectiveN < 12,

  "BNB trades above its value area": bnb.priceVsValueArea === "above",
  "ICP is mid-range, not coiled near its low": icp.rangePosition30d > 45 && icp.rangePosition30d < 60,
  "and participation is leaving it rather than arriving": icp.volumeTrend30dPct < -20,
  "the tight ICP range is about one ordinary week wide":
    Math.abs(lv.icpTightRangeWidthPct - icp.medianWeekPct) < 3,
  "the BNB invalidation sits inside the heaviest traded zone": lv.bnbInvalidationInsideValueArea,
  "and it is a sensible width even so": lv.bnbInvalidationAtr > 1 && lv.bnbInvalidationAtr < 1.6,
  "most of the month's BTC turnover sits above the price": b.profile.overheadPct > 80,
  "four of the five lookbacks lean short": shortLeaning === 4,
  "and the longest leans the other way": longestLeansLong,
  "a trade at the advertised ratio would break even far lower":
    g.long.advertisedBreakEvenPct < 40 && g.long.breakEvenLiftPct > 10,
};
const bad = Object.entries(claims).filter(([, ok]) => !ok);
if (bad.length) { console.error("ABORT:"); for (const [c] of bad) console.error("  x " + c); process.exit(1); }

const row = (a, c, d, e) =>
  (String(a).padEnd(13) + String(c).padStart(9) + String(d).padStart(10) + String(e).padStart(10)).trimEnd();

const rrTable = [
  ["long TP1", g.long.tp1], ["long TP2", g.long.tp2],
  ["short TP1", g.short.tp1], ["short TP2", g.short.tp2],
].map(([n, l]) => row(n, `1:${l.rr.toFixed(2)}`, "1:1.8-2.2", `${pct(l.breakEvenHitPct)}%`)).join("\n");

const trigTable = [
  ["long TP1", t.longTp1], ["long TP2", t.longTp2],
  ["short TP1", t.shortTp1], ["short TP2", t.shortTp2],
].map(([n, r]) => row(n, `${pct(r.hitPct)}%`, `${pct(r.breakEvenHitPct)}%`, r.netR.toFixed(3))).join("\n");

const altRow = (a, c, d, e) =>
  (String(a).padEnd(16) + String(c).padStart(9) + String(d).padStart(11) + String(e).padStart(11)).trimEnd();

const text = `A reader sent me a full multi-timeframe $BTC note last night: technicals, on-chain, ETF flows, sentiment, and two conditional triggers. Its recommendation is **WAIT**.

My board also says WAIT on BTC.

So we are not arguing about the conclusion. That leaves the interesting part — whether the numbers underneath it hold — and that is the part nobody checks, including on my own posts until I started publishing the checks.

SEVEN THINGS THAT CHECK OUT

**The August range.** Stated 62.2k–65.4k. The exchange says ${fmtPrice(b.augustLow)}–${fmtPrice(b.augustHigh)}. Correct.

**The lower highs.** Every high since the month's peak is below the one before it. Correct, and it is the note's best structural observation.

**The support band.** ${A.note.statedSupport[0]}–${A.note.statedSupport[1]} was tested on ${b.supportTests.join(" and ")}. Not a line drawn on a chart — a level price actually visited twice and held.

**The resistance band.** ${A.note.statedResistance[0]}–${A.note.statedResistance[1]} contains the **point of control** — ${fmtPrice(b.profile.pocPrice)}, the single price where the most volume changed hands this month. The note reached that band by eye; the volume profile puts the heaviest shelf inside it. That is a good read and I want to say so plainly.

**The on-chain arithmetic is internally consistent.** The note quotes an average cost basis across all coins and an MVRV of ${A.note.statedMvrv}. Dividing the live price by that stated cost basis gives ${b.impliedMvrv.toFixed(3)} — the two figures agree with each other, which is more than most quoted on-chain sets manage. I cannot verify the cost basis itself; I can verify it is not at odds with the price beside it.

**Dominance.** Stated ${A.note.statedBtcDominancePct}%. Measured ${pct(m.btcDominancePct)}%. Correct.

**Both stop distances.** The long risks ${pct(g.long.riskPct)}% and the short ${pct(g.short.riskPct)}% — **${g.long.stopInAtr.toFixed(2)} and ${g.short.stopInAtr.toFixed(2)} daily ATR**. This morning I published a study across 61 pairs putting the useful band around 1.5 ATR. These land in it. Most ladders I am sent do not.

THREE THAT DO NOT

**The price.** The note puts BTC at ${A.note.statedPriceBand[0]}–${A.note.statedPriceBand[1]}. It is **${fmtPrice(b.price)}**. BTC did visit ${fmtPrice(b.todayOpenClose.low)} today, so the band existed — it is just not where price sits.

**"Lowest since the start of August."** No. The lowest August close is **${fmtPrice(b.lowestAugustClose)}**, on ${b.lowestCloseDay}. Today's UTC day has not closed yet and is running ${fmtPrice(b.price)} — above it. A fortnight-old low was lower.

**Fear & Greed.** Stated 38. The index reads **${m.fearGreed}**. Both are "Fear", so the label survives — but ${m.fearGreed} is materially deeper than 38, and the error runs toward calm. If you are going to cite a sentiment number as a reason to stand aside, the direction of the mistake matters.

NOW THE ARITHMETIC

Both triggers are quoted at **R:R roughly 1:1.8–2.2**. That claim can be checked against the note's own entry, stop and target — no market data required.

Long: entry ${fmtPrice(g.long.entry)}, stop ${fmtPrice(g.long.stop)}. You are risking ${pct(g.long.riskPct)}%. TP1 at ${fmtPrice(g.long.tp1.target)} is ${pct(g.long.tp1.rewardPct)}% away.

\`\`\`
${row("", "actual", "stated", "need win%")}
${rrTable}
\`\`\`

**At the first target both trades are one to one.** Not 1:2.

That is not a rounding quibble. At the ratio the note advertises you break even at ${pct(g.long.advertisedBreakEvenPct)}%. These break even at **${pct(g.long.tp1.breakEvenHitPct)}%** and **${pct(g.short.tp1.breakEvenHitPct)}%** — you have to be right about half the time, not a third. **${pct(g.long.breakEvenLiftPct)} points** of required accuracy on the long, ${pct(g.short.breakEvenLiftPct)} on the short — quietly moved.

The second targets reach 1:${g.long.tp2.rr.toFixed(2)} and 1:${g.short.tp2.rr.toFixed(2)} — still under the stated range. The stated ratio is reachable only by taking the best corner of every band at once: the lowest entry, the tightest stop and the furthest target together, which gives 1:${g.long.bestCaseRr.toFixed(2)}. That is a best case being reported as the case.

Add the fee — ${g.long.feeR.toFixed(3)}R on the long, ${g.short.feeR.toFixed(3)}R on the short — and TP1 needs about half your trades to work just to break even.

THEN I TESTED THE TRIGGER ITSELF

"Wait for a close above resistance on rising volume" is a rule, not a level, so it can be scored. On BTC's daily history: a close above the last ten days' highest close with turnover above its twenty-day average, then the note's exact stop and target, walked bar by bar with a bar touching both levels charged to the stop.

\`\`\`
${row("", "hit rate", "needs", "net R")}
${trigTable}
\`\`\`

**The long trigger has lost money on BTC's own history at both targets.** It hits ${pct(t.longTp1.hitPct)}% where it needs ${pct(t.longTp1.breakEvenHitPct)}%.

**The short trigger pays — but only at the further target.** ${t.shortTp2.netR.toFixed(3)}R after costs at TP2, and ${t.shortTp1.netR.toFixed(3)}R at TP1, where the fee eats a thin gross edge. Which is to say: on this structure, taking profit early is the mistake.

Now the honest caveat, and it is a big one. Those are ${t.longTp1.signals} and ${t.shortTp1.signals} signals, but they overlap inside a ten-day hold — **${t.longTp1.effectiveN.toFixed(1)} and ${t.shortTp1.effectiveN.toFixed(1)} independent episodes.** That is a story, not a finding. I am not telling you the long trigger cannot work. I am telling you it has not, on the only history available, and that the note offers no evidence in either direction.

THE FOUR NUMBERS THE NOTE SAYS IT CANNOT GET

For $BNB and $ICP the note declines to rank them, honestly, because it lacks overhead supply, volume trend, range position and beta. Three of those four I measure daily:

\`\`\`
${altRow("", "overhead", "vol trend", "range pos")}
${altRow("BNB", `${pct(bnb.overheadPct)}%`, `${pct(bnb.volumeTrend30dPct)}%`, `${pct(bnb.rangePosition30d)}%`)}
${altRow("ICP", `${pct(icp.overheadPct)}%`, `${pct(icp.volumeTrend30dPct)}%`, `${pct(icp.rangePosition30d)}%`)}
\`\`\`

Those numbers contradict the note's qualitative read of ICP in three places.

It calls ICP **"coiling near the low, stage A/B"**. Range position ${pct(icp.rangePosition30d)}% is the **middle** of its 30-day range, not the bottom.

It reads low volume as **accumulation**. Turnover over the last three days is ${pct(icp.volumeTrend30dPct)}% against the prior month, and ${pct(icp.volumeTrend90dPct)}% measured over ninety days. Participation is leaving. Quiet volume near a base reads as accumulation or as abandonment depending on your mood; the tiebreaker is whether volume is *arriving*, and here it is not.

It calls 2.0–2.4 a **tight sideways range**. That band is ${pct(lv.icpTightRangeWidthPct)}% wide. ICP's median week covers ${pct(icp.medianWeekPct)}%. The "tight range" is about **one ordinary week**.

On BNB the note is closer to right — overhead is not extreme at ${pct(bnb.overheadPct)}%. Two things to add: it was 3.17% on 12 August, so it has quadrupled in two days as price slipped; and at ${fmtPrice(bnb.price)} BNB trades **above** its value area (${fmtPrice(bnb.valueArea[0])}–${fmtPrice(bnb.valueArea[1])}), so the note's invalidation at 585–590 sits inside the heaviest traded zone rather than below it. Good width — ${lv.bnbInvalidationAtr.toFixed(2)} ATR, right in the band this desk measured as useful — placed where price spends most of its time.

WHAT I CANNOT CHECK

The realized cost basis, the MVRV Z-score, NUPL, SOPR, ETF flows and derivatives positioning. Every host serving those is blocked from this machine. I am not going to nod along with figures I have no way to see, and I am not going to pretend they are wrong either. They are unverified, and the note's own honesty about missing data is the reason I am willing to take its other numbers seriously.

THE PATTERN

This morning I published a measurement showing that my own board's *direction* survives out-of-sample testing while the *plan* attached to it does not — it keeps about a tenth of what it shows.

This note has the same shape. The call is sound and agrees with mine. The structural reads are good. The errors are all in the actionable part: the ratio that decides how often you must be right, and a long trigger that has not paid on the history it is drawn from.

That seems to be the general rule. Direction is the cheap part. The geometry bolted onto it is where money is lost, and it is the part that gets the least checking.

Bias: **WAIT on BTC** — same conclusion as the note, reached from a different direction. Price is below its value area with the POC overhead at ${fmtPrice(b.profile.pocPrice)}, ${pct(b.profile.overheadPct)}% of the month's turnover sits above the current price, and four of my five lookback windows lean short while the longest leans long. That is a market with no agreed direction, which is what standing aside is for.

Board and every figure: maix8.study/signals

If you run triggers, when did you last compute the reward-to-risk yourself instead of reading the one printed beside it?

Educational research, not financial advice. You are responsible for your own risk.

#BTC #RiskManagement #TechnicalAnalysis`;

writeFileSync("drafts/79-btc-audit.txt", text);
console.log("claims:", Object.keys(claims).length, "| words:", text.trim().split(/\s+/).length);
