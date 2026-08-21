/**
 * Post 94 — what twenty BSC hardforks did to BNB, and what Pasteur will not do.
 *
 * A reader sent the Pasteur specification and asked what it means for price.
 * The specification is genuinely interesting: duplicate validators rejected in
 * bridge verification, rotated keys losing admin immediately, and blind
 * signing that cut a validator's critical path from about 125ms to 15ms and
 * nearly doubled testnet throughput.
 *
 * None of that is an answer to the question asked, and the temptation is to
 * pretend it is — to walk through the BEPs, note that throughput is up 88%,
 * and let the reader draw the conclusion the article was shaped to produce.
 * That is how most upgrade coverage works and it is why it is worthless.
 *
 * The answer available here is better than an opinion, because this exact
 * event has happened twenty times on a chain that publishes the activation
 * instant in its client source. So the study reads the dates out of
 * params/config.go, resolves the older block-height forks through a public
 * node, and measures what BNB did around each one against BTC rather than
 * against the dollar.
 *
 * The result is a clean nothing, and the post has to be careful about what
 * kind of nothing.
 *
 *   No post-event window is distinguishable from the surrounding regime.
 *   One day after: -0.30% against BTC, p 0.35. Three days: p 0.33. Seven: 0.45.
 *
 *   The study can say how big an effect it would have caught. At twenty events
 *   the one-day test detects 1.26%, so "hardforks do not move BNB" is only
 *   licensed down to about a percent. Below that this study is blind, and
 *   saying so is the difference between a finding and an overreach.
 *
 *   The strongest window is the three days *before*, at t -2.67. It survives
 *   dropping any single event. It does not survive having been one of six
 *   windows: p 0.014 against a corrected threshold of 0.0083. So it is
 *   reported, and not acted on, and the arithmetic is shown so a reader can
 *   disagree with the decision rather than the number.
 *
 * The board is included because BNB is one of three names this desk follows
 * whether or not they qualify, and today it reads long, agrees on four of five
 * windows, and is still refused on sample depth. A reader who holds BNB
 * deserves the refusal stated, not the absence.
 *
 * Figures: research/bnb-hardfork.json, research/daily-brief.json.
 */

import { readFileSync, writeFileSync } from "node:fs";

const H = JSON.parse(readFileSync("research/bnb-hardfork.json", "utf8"));
const D = JSON.parse(readFileSync("research/daily-brief.json", "utf8"));
const BOARD = JSON.parse(readFileSync("site/signals.json", "utf8"));

const row = BOARD.signals.find((s) => s.symbol === "BNBUSDT");
const followed = D.followed?.BNBUSDT ?? null;
const pasteur = H.upcoming.find((u) => u.names.includes("Pasteur"));
const w = (k) => H.summary.find((s) => s.key === k);
const post1 = w("post1"), post3 = w("post3"), post7 = w("post7"), pre3 = w("pre3"), pre7 = w("pre7");
const L = H.leaveOneOut, C = H.comparisons;
const CB = H.chainBaseline, SP = H.specification;

/** The single event whose 7d-before move dominates that window's mean. */
const biggestPre = [...H.events].sort((a, b) => b.pre7VsBtcPct - a.pre7VsBtcPct)[0];
const MONTHS = ["January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December"];
/** "2021-02" reads as a version string; the month reads as a date. */
const monthYear = (iso) => `${MONTHS[Number(iso.slice(5, 7)) - 1]} ${iso.slice(0, 4)}`;

const claims = {
  "the chain's own block time and gas limit were measured, not quoted":
    CB != null && CB.blocksSampled >= 100 && CB.gasLimit > 0,
  "the brief's block time is right":
    Math.round(CB.meanBlockTimeMs) === 450,
  "its gas limit is not what mainnet is running":
    CB.gasLimit !== 100_000_000,
  "blocks are running under half full":
    CB.meanGasUsedPct < 50,
  "the throughput figures could not be verified from here":
    SP.quotedButUnverifiedHere.testnetTpsAfter > SP.quotedButUnverifiedHere.testnetTpsBefore,
  "but the activation time and client version were":
    SP.confirmed.clientVersion === "1.7.7" && SP.confirmed.activationUtc.startsWith("2026-08-25"),

  "the activation instant is read from the client, not from a headline":
    pasteur != null && pasteur.unixSeconds === 1787625000
    && H.sources.activations.includes("bnb-chain/bsc"),
  "twenty past activations were measured":
    H.eventCount === 20,
  "against a control drawn from the same neighbourhoods":
    H.controlDays > 1000,

  "no window after activation separates from the control":
    [post1, post3, post7].every((s) => s.pValue > 0.1),
  "and the average one-day move against BTC is slightly negative, not positive":
    post1.meanVsBtcPct < 0,
  "fewer than half the events rose against BTC the day after":
    post1.upSharePct < 50,

  "the study states what size of effect it could have found":
    post1.detectableEffectPct > 0.5 && post1.detectableEffectPct < 3,
  "which is larger than anything it measured after the event":
    [post1, post3, post7].every((s) => Math.abs(s.meanVsBtcPct) < s.detectableEffectPct),

  "the strongest window is before the event, not after":
    L.window.includes("before"),
  "it survives dropping any single event":
    L.stillPastTwo === true,
  "but it does not survive being one of six windows":
    C.clearsCorrectedThreshold === false && C.strongestP > C.bonferroniAlpha,

  "the seven-day-before mean is inflated by one old event":
    biggestPre.pre7VsBtcPct > 20 && pre7.medianVsBtcPct < pre7.meanVsBtcPct,

  "the board reads long on BNB today":
    row != null && row.bias === "LONG",
  "on four of five agreement windows":
    row.agreement.windows === 5 && row.agreement.agreeing === 4,
  "and is refused anyway, on sample depth":
    (row.recent?.[row.side]?.best?.effectiveN ?? 99) < 12,
  "so BNB is not in today's book":
    !D.taken.some((t) => t.symbol === "BNBUSDT"),
};
const bad = Object.entries(claims).filter(([, ok]) => !ok);
if (bad.length) { console.error("ABORT:"); for (const [c] of bad) console.error("  x " + c); process.exit(1); }

const sign = (v, dp = 2) => `${v >= 0 ? "+" : ""}${v.toFixed(dp)}`;

const summaryTable = [
  ("window".padEnd(12) + "mean".padStart(9) + "median".padStart(9) + "up".padStart(7)
    + "control".padStart(10) + "t".padStart(8) + "p".padStart(8) + "detects".padStart(10)),
  ...H.summary.map((s) => (s.window.padEnd(12)
    + `${sign(s.meanVsBtcPct, 1)}%`.padStart(9)
    + `${sign(s.medianVsBtcPct, 1)}%`.padStart(9)
    + `${s.upSharePct.toFixed(0)}%`.padStart(7)
    + `${sign(s.controlMeanVsBtcPct, 1)}%`.padStart(10)
    + sign(s.welchT).padStart(8)
    + s.pValue.toFixed(3).padStart(8)
    + `${s.detectableEffectPct.toFixed(1)}%`.padStart(10)).trimEnd()),
].join("\n");

const eventTable = H.events.map((e) => (
  e.names.join("/").slice(0, 20).padEnd(21)
  + e.at.slice(0, 10).padEnd(12)
  + `${sign(e.post1VsBtcPct, 1)}%`.padStart(9)
  + `${sign(e.post3VsBtcPct, 1)}%`.padStart(9)
  + `${sign(e.post7VsBtcPct, 1)}%`.padStart(9)
).trimEnd()).join("\n");

const text = `A reader sent me the Pasteur hardfork specification and asked what it does to the price of $BNB.

The specification is real work. BEP-682 rejects duplicate validators in bridge light-block verification, closing a path where one validator counted several times could push a signature set over threshold. BEP-695 strips admin rights from a rotated-out consensus key immediately instead of leaving them behind. Activation is ${SP.confirmed.activationUtc.slice(0, 10)} at ${SP.confirmed.activationUtc.slice(11, 16)} UTC, nodes need v${SP.confirmed.clientVersion}, testnet since ${SP.confirmed.testnetSince}. All of that I could confirm.

What I could not: the brief also cites BEP-675 blind signing cutting a validator's critical path from ${SP.quotedButUnverifiedHere.validatorCriticalPathMsBefore}ms to ${SP.quotedButUnverifiedHere.validatorCriticalPathMsAfter}ms and testnet throughput going from ${SP.quotedButUnverifiedHere.testnetTpsBefore.toLocaleString("en-US")} to ${SP.quotedButUnverifiedHere.testnetTpsAfter.toLocaleString("en-US")} TPS. The BNB Chain blog returns 503 to this desk. Those may well be right; I am quoting them, not asserting them.

FIRST, THE CHAIN ITSELF

Before any of it, the baseline — read from a BSC node, ${CB.blocksSampled} blocks back from ${CB.headBlock.toLocaleString("en-US")}:

Mean block time: **${Math.round(CB.meanBlockTimeMs)}ms.** The brief says 450ms. Correct.

Gas limit: **${(CB.gasLimit / 1e6).toFixed(0)}M.** The brief says 100M. Mainnet is not running 100M today.

Average gas used: **${(CB.meanGasUsed / 1e6).toFixed(1)}M — ${CB.meanGasUsedPct.toFixed(1)}% of the limit.** Blocks are running under half full, which is the thing BEP-675 is meant to change. That number is the one worth writing down, because it is the one you can re-measure next week.

None of it answers the price question. So I measured that separately.

TWENTY TIMES BEFORE

BSC publishes every mainnet activation instant in its own client source. I pulled params/config.go from the ${H.sources.activations.split("/")[3]}/${H.sources.activations.split("/")[4]} client, took the timestamps, resolved the older block-height forks through a public node, and got **${H.eventCount} past activations** — Bruno, Euler, Moran, Gibbs, Planck, Luban, Plato, Hertz, Kepler, Feynman, Haber, Bohr, Pascal, Lorentz, Maxwell, Fermi, Mendel and the rest.

Then: what did BNB do around each one, **measured against BTC**, not against the dollar. BNB rising on a day the whole market rose is not a hardfork. This desk has already published what happens when you skip that distinction — an apparent edge of +0.08R against USDT became +0.34R against BTC, because the numeraire was doing the work.

Control: every day within 60 days of an event that is not itself near one. ${H.controlDays.toLocaleString("en-US")} of them. Same regime, no event.

\`\`\`
${summaryTable}
\`\`\`

**Nothing after the event.** One day: ${sign(post1.meanVsBtcPct)}% against BTC, p ${post1.pValue.toFixed(2)}. Three days: p ${post3.pValue.toFixed(2)}. Seven days: p ${post7.pValue.toFixed(2)}. Fewer than half of the twenty rose against BTC on any of those horizons.

EVERY ONE OF THEM

\`\`\`
${("upgrade".padEnd(21) + "activated".padEnd(12) + "1d".padStart(9) + "3d".padStart(9) + "7d".padStart(9))}
${eventTable}
\`\`\`

WHAT THIS DOES NOT SAY

It does not say hardforks are irrelevant. It says this test could not see an effect, and the honest follow-up is: how big would one have to be before it could?

**${post1.detectableEffectPct.toFixed(2)}%** at one day. **${post3.detectableEffectPct.toFixed(2)}%** at three. **${post7.detectableEffectPct.toFixed(2)}%** at seven.

So: a BSC hardfork does not reliably move BNB against BTC by more than about a percent on the day it lands. Anything smaller than that is below what twenty events can resolve, and I cannot rule it out. That sentence is the whole result, and the second half of it matters as much as the first.

THE ONE THING THAT NEARLY CLEARED

The strongest window is not after the event. It is the **three days before**: ${sign(pre3.meanVsBtcPct)}% against BTC, control ${sign(pre3.controlMeanVsBtcPct)}%, t ${sign(pre3.welchT)}, p ${pre3.pValue.toFixed(3)}.

It survives a leave-one-out check — drop any single upgrade and the weakest it gets is t ${sign(L.weakestT)}, without ${L.weakestWhenDropping}.

It does not survive having been one of ${C.windowsTested} windows I looked at. Correcting for that, the threshold is p < ${C.bonferroniAlpha.toFixed(4)}. It came in at ${C.strongestP.toFixed(3)}.

So I am reporting it and not trading it. If I had run one window instead of six I would be telling you BNB drifts down into a hardfork. Running six is what makes that claim cheap, and the honest response to "my best result is what six tries produces by chance" is to say so, not to drop the other five.

One more thing that table hides: the 7-day-before mean is ${sign(pre7.meanVsBtcPct)}% while the median is ${sign(pre7.medianVsBtcPct)}%. That gap is almost entirely ${biggestPre.names.join("/")} in ${monthYear(biggestPre.at)}, at ${sign(biggestPre.pre7VsBtcPct, 1)}% — a week that had nothing to do with a fork. One event, one mean, no finding.

WHAT MY BOARD SAYS ABOUT BNB TODAY

$BNB is at ${row.price.toLocaleString("en-US")}. The board reads it **LONG**, and ${row.agreement.agreeing} of ${row.agreement.windows} lookback windows agree — better agreement than almost anything else on the board.

It is still refused. Independent episodes: **${row.recent[row.side].best.effectiveN}**, against a floor of 12. The sample is too thin to trade on, so BNB is not in today's book.

I follow it anyway and publish the refusal, because "it did not make the cut" is an answer and silence is not.

WHAT I WOULD ACTUALLY WATCH

Not the activation. It is scheduled, it has been on testnet since 21 July, and a date everyone has known for a month is not information on the day it arrives.

What would be information: whether blocks stop running ${CB.meanGasUsedPct.toFixed(1)}% full. That is three RPC calls, it is checkable by anyone, and unlike a price move it has a mechanism behind it.

${sign(post1.meanVsBtcPct)}% is what twenty upgrades did to price. What they did to the chain is a different measurement, and it is the one with something in it.

Bias: WAIT

Every figure: research/bnb-hardfork.json at maix8.study/data/ — including all twenty events, so you can check the ones I did not print.

Sources: BSC client params/config.go for activation times, a public BSC node for block timestamps, Binance spot daily klines for price.

If your reason to buy is an event on a published calendar, who exactly is selling it to you?

Educational research, not financial advice. You are responsible for your own risk.

#BNB #Bitcoin #Trading #Quant`;

writeFileSync("drafts/94-bnb-hardfork.txt", text);
console.log("claims:", Object.keys(claims).length, "| words:", text.trim().split(/\s+/).length);
