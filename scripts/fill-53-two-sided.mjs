// Every figure comes from a committed snapshot. Claims are asserted before the
// draft is written, so a number that moved kills the article instead of shipping.
import { readFileSync, writeFileSync } from "node:fs";

const T = JSON.parse(readFileSync("/home/user/Writetoearn/research/two-sided.json", "utf8"));
const D = JSON.parse(readFileSync("/home/user/Writetoearn/research/intraday-direction.json", "utf8"));
const B = JSON.parse(readFileSync("/home/user/Writetoearn/research/breakout-signal.json", "utf8"));
const I = JSON.parse(readFileSync("/home/user/Writetoearn/research/intraday-signal.json", "utf8"));
const S = JSON.parse(readFileSync("/home/user/Writetoearn/research/short-signal.json", "utf8"));

const a = T.allAlerts, b = T.baseline, k = T.buckets;

const claims = {
  "the naive method overstates the long side": a.touchedUpPct > a.longFirstPct,
  "the overstatement is material": a.naiveOverstatementPp > 3,
  "the long edge still clears two sigma after the correction": a.longVsRandomHour.sigmas > 2,
  "the short side is real but under two sigma":
    a.shortLiftVsRandomHour > 2 && a.shortVsRandomHour.sigmas < 2,
  "a meaningful share of alerts touch both targets": a.touchedBothPct > 5,
  "most alerts reach neither target": a.neitherPct > 50,
  "upHard is close to a coin flip":
    k.upHard.longFirstPct / k.upHard.shortFirstPct < 1.5,
  "upMild is the most one-sided bucket":
    k.upMild.longFirstPct / k.upMild.shortFirstPct > 4,
  "a violent down hour resolves long more often than short":
    k.downHard.longFirstPct > k.downHard.shortFirstPct * 2,
  "no bucket clears the pooled group": Math.max(
    ...Object.values(k).filter((v) => !v.note).map((v) => Math.abs(v.longVsAllAlerts.sigmas)),
  ) < 1.5,
  "the trigger hour's return carries almost no information":
    Math.abs(D.triggerReturnVsOutcome.withGain) < 0.1,
  "the best bucket still bleeds before it pays": D.buckets.upHard.medianEndPct < 2
    && D.buckets.upHard.medianDrawdownPct < -3,
  "the largest bucket reading is still under two sigma": T.maxBucketSigmaVsAllAlerts < 2,
  "the majors are inside the measured universe":
    T.universe.includes("BTCUSDT") && T.universe.includes("ETHUSDT"),
  "compression remains indistinguishable from random":
    Math.abs(B.conditions.compressed.normalised.sigmas) < 0.5,
  // The prose claims below are the ones the gate cannot check, so they are
  // checked here. Every one of them was wrong in the first draft.
  "the method change costs more than the run-to-run drift":
    Math.abs(I.thresholds.z5.liftVsBaseline - a.naiveLiftVsRandomHour)
      < Math.abs(a.naiveLiftVsRandomHour - a.longLiftVsRandomHour),
  "the reported figure came from the naive method": I.thresholds.z5.liftVsBaseline > 4,
  "twelve conditions were tested across the two hypothesis studies":
    Object.keys(B.conditions).length + Object.keys(S.conditions).length === 12,
  // Signed, not absolute. `fading` reads -2.02, which clears two sigma in the
  // direction opposite to the one it predicted — a significant anti-signal is
  // not a bearish condition that worked.
  "no bearish condition cleared two sigma in the direction it predicted":
    Math.max(...Object.values(S.conditions).map((c) => c.sigmas)) < 2,
};
const bad = Object.entries(claims).filter(([, ok]) => !ok);
if (bad.length) { console.error("ABORT:"); for (const [c] of bad) console.error("  x " + c); process.exit(1); }

const f2 = (v) => Number(v).toFixed(2);
const n0 = (v) => Math.round(v).toLocaleString("en-US");

const text = `Two days ago I measured the only edge this desk has: an hourly turnover alert at z >= ${T.method.alertThresholdZ}, followed by a ${T.method.targetPct}% gain within twelve hours ${f2(I.thresholds.z5.liftVsBaseline)}x more often than a random hour. Twelve other conditions had been tested across two studies to find it, and it was the only one that survived.

Today I re-measured it with one change to the method. It is ${f2(a.longLiftVsRandomHour)}x.

I am writing this before that number ever reached a post, which is the only reason this is a correction and not a retraction. Here is exactly what was wrong, because the mistake is one almost every backtest you will read still makes.

WHAT I WAS COUNTING

The old method asked: over the next twelve hours, did the highest high reach ${T.method.targetPct}% above the alert price? That is one line of code and it feels like the right question.

It is not, and the reason is the low.

Over twelve volatile hours a pair can reach both targets. Price runs ${T.method.targetPct}% against you, then ${T.method.targetPct}% in your favour. The highest high says yes. Your stop said no, four hours earlier.

Measured across ${n0(b.n)} hours on the ${T.pairsSampled} most-traded USDT pairs — $BTC and $ETH sit in that universe alongside the small caps — taking highs and lows separately reports ${f2(a.touchedUpPct)}% of alerts reaching the long target and ${f2(a.touchedDownPct)}% reaching the short one. Those two numbers describe an arbitrage that does not exist.

WHAT I COUNT NOW

The window is walked one hour at a time and the target reached **first** is recorded. If a single hourly candle spans both, it is unattributable at that resolution, so it is counted separately and awarded to neither. ${f2(a.sameHourPct)}% of alerts land there.

                       long first   short first   both touched
  ${"random hour".padEnd(19)}${(f2(b.longFirstPct) + "%").padStart(8)}     ${(f2(b.shortFirstPct) + "%").padStart(8)}      ${(f2(b.touchedBothPct) + "%").padStart(8)}
  ${`alert z>=${T.method.alertThresholdZ}, n=${a.n}`.padEnd(19)}${(f2(a.longFirstPct) + "%").padStart(8)}     ${(f2(a.shortFirstPct) + "%").padStart(8)}      ${(f2(a.touchedBothPct) + "%").padStart(8)}

The long edge is ${f2(a.longLiftVsRandomHour)}x at ${f2(a.longVsRandomHour.sigmas)} sigma. Still real. Still the best thing here. But ${f2(a.naiveOverstatementPp)} percentage points of what I had been calling follow-through were alerts that hit the stop before they hit the target.

It matters that this is the method and not the sample. Run the old naive count on today's data and it prints ${f2(a.naiveLiftVsRandomHour)}x against the ${f2(I.thresholds.z5.liftVsBaseline)}x I reported two days ago — the two runs disagree by a rounding error. Walking the same data bar by bar moves it to ${f2(a.longLiftVsRandomHour)}x. The drift between runs is noise. The gap between methods is the mistake.

The single most important line in the table is the one nobody quotes: **${f2(a.neitherPct)}% of alerts reach neither target.** The base case after a violent volume hour is that nothing happens for twelve hours.

THE SIDE I HAD NEVER MEASURED

Our scanner filtered for gainers before running any other test. Half of every day's movement was discarded before the first condition ran.

Asked properly, the short side exists: ${f2(a.shortFirstPct)}% against a ${f2(b.shortFirstPct)}% base rate, ${f2(a.shortLiftVsRandomHour)}x lift. Our earlier bearish study found nothing above two sigma in the direction it predicted, and it was looking at the wrong clock — daily candles over five and ten days. At hourly resolution the asymmetry is there.

It reads ${f2(a.shortVsRandomHour.sigmas)} sigma. That is enough to scan for and not enough to trade, and I am not going to round it up.

THE PART THAT SURPRISED ME

I split the alerts by what the trigger hour itself did, buckets fixed before the run.

                       long first   short first        n
  ${`up hard   >+${T.method.bucketBoundsPct.upHard}%`.padEnd(19)}${(f2(k.upHard.longFirstPct) + "%").padStart(8)}     ${(f2(k.upHard.shortFirstPct) + "%").padStart(8)}    ${String(k.upHard.n).padStart(5)}
  ${`up mild   ${T.method.bucketBoundsPct.quiet}..+${T.method.bucketBoundsPct.upHard}%`.padEnd(19)}${(f2(k.upMild.longFirstPct) + "%").padStart(8)}     ${(f2(k.upMild.shortFirstPct) + "%").padStart(8)}    ${String(k.upMild.n).padStart(5)}
  ${`down mild ${T.method.bucketBoundsPct.downHard}..${T.method.bucketBoundsPct.quiet}%`.padEnd(19)}${(f2(k.downMild.longFirstPct) + "%").padStart(8)}     ${(f2(k.downMild.shortFirstPct) + "%").padStart(8)}    ${String(k.downMild.n).padStart(5)}
  ${`down hard <${T.method.bucketBoundsPct.downHard}%`.padEnd(19)}${(f2(k.downHard.longFirstPct) + "%").padStart(8)}     ${(f2(k.downHard.shortFirstPct) + "%").padStart(8)}    ${String(k.downHard.n).padStart(5)}

Read the top row twice. The bucket with the highest long rate also has the highest short rate. After a violent up hour it is close to a coin flip which side pays first. That is a volatility reading wearing a direction's clothes, and it is the exact setup I would have recommended on instinct.

The quiet up hour is the one-sided one: ${f2(k.upMild.longFirstPct)}% long against ${f2(k.upMild.shortFirstPct)}% short.

And the bottom row says do not short a crash. A violent down hour resolves long ${f2(k.downHard.longFirstPct)}% of the time against ${f2(k.downHard.shortFirstPct)}% short. It bounces more often than it continues.

Direction, on its own, carries nothing. The correlation between the trigger hour's return and the best gain over the next twelve is ${f2(D.triggerReturnVsOutcome.withGain)}. With where price actually closes, ${f2(D.triggerReturnVsOutcome.withEnd)}.

WHY I AM NOT TRADING ANY OF THAT

No bucket difference reaches even ${f2(T.maxBucketSigmaVsAllAlerts)} sigma against the pooled alert group. Twelve-hour windows overlap by eleven hours, so after de-overlapping each bucket holds roughly a dozen effective observations. Four buckets, one of them was always going to look best.

I am publishing the split because it points somewhere, not because it decides anything.

There is one more number worth sitting with. In the strongest bucket, the median alert **closes** the twelve hours at ${f2(D.buckets.upHard.medianEndPct)}% and dips ${f2(D.buckets.upHard.medianDrawdownPct)}% along the way — in the same group that touches the target ${f2(D.buckets.upHard.followThroughPct)}% of the time by the old count.

The target is a wick. Hold to the end of the window and you give back nearly all of it. A hit rate cannot tell you that, and mine could not, until it measured drawdown too.

WHAT THIS COSTS ME TO SAY

This is the second time measurement has taken something off me. The first was a compression pattern I had written about repeatedly: tested across ${n0(B.baseline.n)} pair-days, it came out at ${f2(B.conditions.compressed.normalised.liftVsBaseline)}x lift and ${f2(B.conditions.compressed.normalised.sigmas)} sigma. Indistinguishable from random.

I would rather publish ${f2(a.longLiftVsRandomHour)}x that survives a path-dependent test than ${f2(a.naiveLiftVsRandomHour)}x that only survives not being looked at closely.

If you take one thing: when someone shows you a win rate, ask whether it was computed from highs and lows separately, or by walking the path. The gap between those two answers was ${f2(a.naiveOverstatementPp)} points here, and it always points the same direction — flattering.

The study is committed and reproducible. Run it against your own universe and tell me where it breaks.

Educational research, not financial advice. DYOR.

$BTC #WriteToEarn #BinanceSquare`;

writeFileSync("/home/user/Writetoearn/drafts/53-two-sided.txt", text);
console.log("claims:", Object.keys(claims).length, "| words:", text.trim().split(/\s+/).length);
