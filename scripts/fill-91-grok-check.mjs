/**
 * Post 91 — auditing someone else's call on the day my own book was wiped out.
 *
 * A reader forwarded a bullish quick-scan: alts leading, ETH the momentum
 * leader, protect profits, wait for a BTC retest before adding. My board spent
 * six editions short and had nineteen of twenty positions stopped on this exact
 * move, at -19.445R.
 *
 * So the failure mode here is not harshness. It is defensiveness — picking at
 * the decimals of a read that was directionally closer to right than mine while
 * my own ledger is in pieces. The concession goes first, in the opening lines,
 * before a single check.
 *
 * What survives that is the part worth publishing:
 *
 *   All three numeric claims miss, and all three miss the same way — the market
 *   kept running after the snapshot was taken. That is a fact about quick scans
 *   in fast markets, not about carelessness, and the post says so.
 *
 *   The levels the strategy hangs on are already 3-5% below spot, which matters
 *   far more than the decimals.
 *
 *   The liquidation figure cannot be checked from here at all.
 *
 *   And the procedure — retest entries, level invalidations — is the same
 *   continuation family measured at 42.2% over three days and 49.55% at ten.
 *   Being right today says nothing about a base rate.
 *
 * The symmetry is the spine. Two days ago this desk refused to credit its own
 * board for 4 of 4 ahead because 78.5% of the market had moved with it. Today
 * 69.3% rose. The same discount applies to a bullish call, or the rule was
 * never a rule — and applying it on the day it costs me nothing to be generous
 * is the only version that means anything.
 *
 * Figures: research/grok-check.json, research/daily-brief.json.
 */

import { readFileSync, writeFileSync } from "node:fs";

const G = JSON.parse(readFileSync("research/grok-check.json", "utf8"));
const btc = G.claimsChecked.find((c) => c.label === "BTC");
const eth = G.claimsChecked.find((c) => c.label === "ETH");
const sol = G.claimsChecked.find((c) => c.label === "SOL");
const own = G.ownResult, proc = G.procedure;
const top = G.leaderboard[0];
const L = G.claimedLevels, prior = G.priorDisclosure, U = G.claimedUnverified;
const bnb = G.leaderboard.find((r) => r.symbol === "BNBUSDT");
const arb = G.leaderboard.find((r) => r.symbol === "ARBUSDT");

const claims = {
  "none of the three numeric claims lands in its stated range":
    G.claimsInRange === 0 && G.claimsTotal === 3,
  "and every one of them misses the same way — the market ran further":
    G.claimsChecked.every((c) => (c.missPct ?? 0) > 0),
  "the leader it named is genuinely the leader among the majors it listed":
    top.symbol === "ETHUSDT",
  "its lag call on BNB is right":
    bnb != null && bnb.changePct < top.changePct / 2,
  "but the name it ranked third outran everything it ranked above":
    G.hype != null && G.hype.changePct > top.changePct,
  "and one it listed fourth is second on the tape":
    arb != null && G.leaderboard.indexOf(arb) === 1,
  "the liquidation figure cannot be checked from here":
    G.unreachable.every((u) => u.status !== 200),

  "my own board was short into this and was destroyed":
    own.ourStopped >= own.ourPositions - 1 && own.ourTotalR < -10,
  "on a day most of the market rose":
    own.upSharePct > 60,

  "the procedure it recommends rests on a coin toss":
    Math.abs(proc.persistence10dPct - 50) < 1,
  "and continuation over three days is below one":
    proc.continuation3dPct < 50,
  "the discount I applied to my own good day is quoted from the post that applied it":
    prior != null && prior.withPositionsPct > 65,
  "and today's market leaned the other way by a similar margin":
    own.upSharePct > 65,
};
const bad = Object.entries(claims).filter(([, ok]) => !ok);
if (bad.length) { console.error("ABORT:"); for (const [c] of bad) console.error("  x " + c); process.exit(1); }

const sign = (v, dp = 2) => `${v >= 0 ? "+" : ""}${v.toFixed(dp)}`;
const money = (v) => Math.round(v).toLocaleString("en-US");

const row = (a, b, c, d) =>
  (String(a).padEnd(8) + String(b).padStart(20) + String(c).padStart(16) + String(d).padStart(14)).trimEnd();

const claimTable = [
  row("BTC", `$${money(btc.lowUsd)}-${money(btc.highUsd)}`, `$${money(btc.actualPrice)}`, `${sign(btc.missPct, 1)}%`),
  row("ETH", `${eth.lowPct}-${eth.highPct}%`, `${sign(eth.actualChangePct)}%`, `${sign(eth.missPct, 1)}pp`),
  row("SOL", `${sol.lowPct}-${sol.highPct}%`, `${sign(sol.actualChangePct)}%`, `${sign(sol.missPct, 1)}pp`),
].join("\n");

const boardRow = (a, b) => (String(a).padEnd(10) + String(b).padStart(10)).trimEnd();
const boardTable = G.leaderboard
  .map((r, i) => boardRow(`${i + 1}. ${r.symbol.replace("USDT", "")}`, `${sign(r.changePct)}%`))
  .join("\n");

const text = `A reader forwarded me a bullish quick-scan today. Alts leading, ETH the momentum leader, protect profits, wait for a BTC retest before adding anything new.

Before I check a single number, the thing that has to come first.

**My own board was short. Nineteen of twenty positions stopped out. ${sign(own.ourTotalR, 3)}R.**

That happened on this exact move — the one the forwarded brief read correctly and mine read backwards. So this is not a takedown. It is an audit written by someone whose ledger is in pieces, about a call that was closer to right than his own, and I would rather say that in the first paragraph than have you find it in the last.

WHAT THE NUMBERS SAY

\`\`\`
${row("", "claimed", "actual", "miss")}
${claimTable}
\`\`\`

**None of the three lands in its stated range.**

But look at the direction of the misses. All three are *under*. $BTC did not fall short of the call — it ran ${sign(btc.missPct, 1)}% past the top of it. ETH and SOL both went further than claimed.

That is not carelessness. That is what a timestamped snapshot does in a market moving ten percent in a day: it is stale before it is read. The brief is not wrong about what happened; it is wrong about how much, in the direction of not enough.

THE PART THAT ACTUALLY MATTERS

The decimals are the small problem. The levels are the big one.

The strategy hangs on waiting for a retest around ${money(L.retestLowUsd)} to ${money(L.retestHighUsd)}, with a bear case below ${money(L.invalidationUsd)}. $BTC is at ${money(btc.actualPrice)}.

Those levels sit **three to five percent below spot**. Anyone following the plan is waiting for a pullback that has not come, in a market that has already moved past the entire framework. A plan built on levels needs a timestamp attached to the levels, not just to the post.

ITS ORDERING, AGAINST THE TAPE

\`\`\`
${boardTable}
\`\`\`

ETH really is the leader among the majors it listed — that call is correct. BNB really is lagging at ${sign(bnb.changePct)}%. Both right.

Two things it got out of order. HYPE, ranked third and described as "still holding", is up **${sign(G.hype.changePct)}%** on ${G.hype.venue} — it outran everything above it. And ARB, listed fourth, is second on the tape.

WHAT I CANNOT CHECK

The brief cites roughly ${U.liquidations24hUsdBn} billion in 24-hour liquidations. I have no way to verify that. The liquidation source returns ${G.unreachable[0].status} to this desk and the exchange's futures API returns ${G.unreachable[1].status}.

So I am not repeating it as a fact. It may well be right. I do not know, and neither does anyone reading it who has not checked.

NOW THE HARD PART

Here is where I have to be careful, because it would be easy to say "the read was right, therefore the method works."

The method is: wait for a retest, enter on continuation, invalidate on a level. That is a **continuation bet**, and this desk measured that family yesterday.

**Continuation over three days: ${proc.continuation3dPct.toFixed(1)}%. Over one day: ${proc.continuation1dPct.toFixed(1)}%.** Direction persistence at ten days: **${proc.persistence10dPct.toFixed(2)}%.**

A coin toss, or slightly worse. Being right today does not move a base rate measured over hundreds of independent windows. It cannot, and neither can my being wrong today.

AND THE DISCOUNT I OWE THIS CALL

Two days ago my column reported four of four positions ahead. I refused to take credit, and the reason I gave was that **${prior.withPositionsPct.toFixed(1)}% of the market had moved the same way** — on a day like that the board and a coin flip both look clever.

Today **${own.upSharePct.toFixed(1)}% of the market rose** and the median pair gained ${sign(own.medianChangePct)}%.

So the same discount applies here. A bullish read on a day when seven pairs in ten went up is mostly the tape, not the analyst. If that rule only fires when it flatters me, it was never a rule — and applying it now, when being generous costs me nothing and being harsh would cost me my own credibility, is the only version worth having.

WHAT I TAKE FROM THIS

The brief's risk management is genuinely good and I would keep all of it: one percent a trade, no averaging down, take some off after a run, do not chase. None of that depends on the forecast being right, which is exactly why it is the part worth keeping.

What I would drop is the entry trigger. Not because the call was bad — it was better than mine today — but because the trigger has a measured base rate and the base rate is a coin toss.

My board and this brief disagreed completely today and one of us was flattened. That is worth less than it looks. Two opposite calls, one bull day, and no evidence either procedure works.

Every figure: research/grok-check.json and research/daily-brief.json, both at maix8.study/data/

My losses, at the same size as anything else: maix8.study/record

When someone's call is right and yours is wrong, how do you tell whether their method is better or their day was?

Educational research, not financial advice. You are responsible for your own risk.

#Bitcoin #Trading #RiskManagement`;

writeFileSync("drafts/91-grok-check.txt", text);
console.log("claims:", Object.keys(claims).length, "| words:", text.trim().split(/\s+/).length);
