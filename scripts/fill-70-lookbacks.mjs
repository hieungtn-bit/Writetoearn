/**
 * Post 70 — the deciding window was doing more work than the data.
 *
 * The board scores every pair over 180 days and reports one answer. This post
 * re-scores the same geometries over five nested lookbacks and reports how
 * many of them agree, which turns out to separate the board's calls into two
 * populations that the old output rendered identically.
 *
 * The finding is against the channel: every fragile call on today's board is a
 * long, including two of the five names this post was asked to cover. That is
 * the part that has to lead.
 *
 * Cashtags are capped at three by the API, so only ICP, ENA and GIGGLE carry
 * the $; BNB and INJ appear as plain names.
 *
 * Every figure traces to research/five-deep.json and site/signals.json.
 */

import { readFileSync, writeFileSync } from "node:fs";
import { pct, price as fmtPrice, usd } from "../src/format.mjs";

const D = JSON.parse(readFileSync("research/five-deep.json", "utf8"));
const S = JSON.parse(readFileSync("site/signals.json", "utf8"));

const deep = Object.fromEntries(D.rows.map((r) => [r.asset, r]));
const board = Object.fromEntries(S.signals.map((s) => [s.asset, s]));
const five = ["BNB", "INJ", "ENA", "ICP", "GIGGLE"];

const withAgreement = S.signals.filter((s) => s.agreement);
const longs = withAgreement.filter((s) => s.bias === "LONG");
const shorts = withAgreement.filter((s) => s.bias === "SHORT");
const share = (g) => g.reduce((t, s) => t + s.agreement.sharePct, 0) / g.length;
const allAgree = (g) => g.filter((s) => s.agreement.agreeing === s.agreement.windows).length;
const contradicted = withAgreement.filter((s) => s.agreement.agreeing * 2 <= s.agreement.windows);

/**
 * Fields that exist in both files come from the board.
 *
 * The research run and the scan happen minutes apart, and overhead moves
 * inside that gap — the first draft printed 91.1% while the board served
 * 88.3%. A reader checking the post against the board would have found the
 * post wrong. Anything the board publishes is sourced from the board.
 */
const ctx = (asset, field) => board[asset].context[field];

const gig = deep.GIGGLE;
const icp = deep.ICP;
const inj = deep.INJ;

const claims = {
  "shorts survive their lookbacks and longs do not": share(shorts) > share(longs) + 30,
  "nearly every short agrees across every window": allAgree(shorts) >= shorts.length - 2,
  "every contradicted call is a long": contradicted.length > 0 && contradicted.every((s) => s.bias === "LONG"),
  "two of the five are contradicted": ["ENA", "ICP"].every((a) => board[a].agreement.agreeing * 2 <= board[a].agreement.windows),
  "and two of them hold up": ["BNB", "INJ"].every((a) => board[a].agreement.agreeing * 2 > board[a].agreement.windows),
  "GIGGLE cannot be tested at all": gig.candles < 365 && board.GIGGLE.agreement.windows === 1,
  "GIGGLE is the most volatile of the five": five.every((a) => a === "GIGGLE" || gig.atrPct > deep[a].atrPct),
  "GIGGLE is the least tied to BTC": five.every((a) => a === "GIGGLE" || gig.rSquaredPct < deep[a].rSquaredPct),
  "BNB still has nobody trapped above it": ctx("BNB", "underwaterPct") < 1,
  "INJ has almost everybody trapped above it": ctx("INJ", "underwaterPct") > 85,
  "ICP volume is genuinely expanding": ctx("ICP", "volumeTrendPct") > 100,
  "every stop is under a median week": five.every((a) => deep[a].stopVsMedianWeek < 1),
  "the sample behind each call is still five": board.ICP.plan.effectiveN < 6,
};
const bad = Object.entries(claims).filter(([, ok]) => !ok);
if (bad.length) { console.error("ABORT:"); for (const [c] of bad) console.error("  x " + c); process.exit(1); }

const row = (a, b, c, d) =>
  (String(a).padEnd(9) + String(b).padStart(9) + String(c).padStart(11) + String(d).padStart(12)).trimEnd();

const agreeLines = five.map((a) => {
  const g = board[a].agreement;
  return row(a, `${g.agreeing}/${g.windows}`, `${pct(board[a].plan.expectancyR)}R`, `${pct(ctx(a, "underwaterPct"))}%`);
}).join("\n");

const text = `Five names, measured properly. The headline is not about any of them — it is about the window I was measuring in.

My board scores every pair over the last ${S.method.recentWindowDays} days and prints one answer. This week I re-scored the same geometries over five nested lookbacks — ${D.windows.slice(0, 5).join(", ")} days — and counted how many agree with the call.

That count splits the board into two populations my old output drew identically.

\`\`\`
${row("", "agree", "expectancy", "overhead")}
${agreeLines}
\`\`\`

BNB and INJ hold up under four of five lookbacks. $ICP and $ENA are called long while **four of five say the opposite**.

Same board. Same day. Same "LONG" label on all four.

THE PATTERN IS WORSE THAN FIVE NAMES

Across the ${withAgreement.length} pairs that got a direction today (${S.tally.total} scanned, ${S.tally.WAIT} stood aside):

\`\`\`
${row("", "n", "all agree", "mean")}
${row("long", longs.length, allAgree(longs), `${pct(share(longs))}%`)}
${row("short", shorts.length, allAgree(shorts), `${pct(share(shorts))}%`)}
\`\`\`

${allAgree(shorts)} of ${shorts.length} shorts agree across **every** window. ${allAgree(longs)} of ${longs.length} longs do.

And every single call that a majority of lookbacks contradicts — ${contradicted.length} of them — is a **long**. Not one short.

The reading is uncomfortable and simple: the deciding window contains a bounce. The longer windows contain the trend the bounce is inside. My longs were largely artefacts of where I chose to start counting.

WHAT EACH ONE ACTUALLY IS

**BNB** — the cleanest of the five and the least exciting. Still **${pct(ctx("BNB", "underwaterPct"))}% supply trapped overhead**: nobody who bought in the last month is underwater. Turnover ${usd(deep.BNB.turnoverUsd)} a day, by far the deepest here. But it sits at ${pct(ctx("BNB", "rangePosition30d"))}% of its monthly range, so this is buying the top of the range, and BTC explains ${pct(deep.BNB.rSquaredPct)}% of its daily variance — the highest dependence of the five.

**INJ** — survives four of five lookbacks, which surprised me, because everything else about it reads badly: **${pct(ctx("INJ", "underwaterPct"))}% of the month's volume is trapped above the price**, volume trend ${pct(ctx("INJ", "volumeTrendPct"))}%, and it is ${pct(inj.drawdownFromAthPct)}% below its all-time high. A reader argued this one with me and was right about the geometry being more durable than my headline. He was also wrong that overhead could not be measured — it can, and it is the worst number on this table.

**$ICP** — the one I keep wanting to like. Volume genuinely expanding, **${pct(ctx("ICP", "volumeTrendPct"))}%**, with only ${pct(ctx("ICP", "underwaterPct"))}% trapped overhead and the lowest BTC dependence of the four here with full history, at ${pct(icp.rSquaredPct)}%. And still: one lookback in five supports the long. Good fundamentals with a fragile signal is not a trade, it is a reason to keep watching.

**$ENA** — the weakest case. ${pct(ctx("ENA", "underwaterPct"))}% overhead, volume ${pct(ctx("ENA", "volumeTrendPct"))}%, beta ${pct(deep.ENA.beta)} into a market where BTC explains ${pct(deep.ENA.rSquaredPct)}% of its moves, and one lookback in five behind the call.

**$GIGGLE** — a different kind of object, and the most honest thing I can print about it is what I could not do.

It has **${gig.candles} daily candles**. At a 30-day horizon that is under ten independent episodes for its entire existence. My agreement test needs a lookback to test against, and only one of the five exists. So it scores **1 of 1** — which is not a strong result. It is the absence of a test wearing the costume of a perfect one.

The rest of it is genuinely unusual: ATR **${pct(gig.atrPct)}% per day**, more than double anything else here, and BTC explains just **${pct(gig.rSquaredPct)}%** of its daily variance — the only name on my board that is not mostly a BTC trade. I would not read the negative beta as a hedge; over thirty daily returns that sign is not distinguishable from zero.

THE NUMBER UNDER ALL FIVE

Every stop on this board is derived from daily volatility. Compare each to the range that name actually travels in a week:

\`\`\`
${five.map((a) => row(a, `${pct(deep[a].stopPct)}%`, `${pct(deep[a].weeklyRangeMedianPct)}%`, `${pct(deep[a].stopVsMedianWeek)}x`)).join("\n")}
\`\`\`

Not one reaches a median week. Four are under half of one. Hold any of these positions across a weekend and an entirely ordinary week takes the stop out, with no news required.

WHAT I CHANGED

The board now prints **how many lookbacks agree** on every row, beside the sample size and above the entry price. A call backed by five of five and a call contradicted by four of five no longer look the same.

To be clear about what that number is not: the windows are nested, so they share data and are not independent samples. It is not a significance test. It is a stability check — and a direction that only pays inside one lookback is a property of that lookback, not of the market.

The sample behind each call has not improved. It is still about **five independent episodes** at the 30-day horizon. Agreement across windows and sample size are different weaknesses, and the board now shows both instead of one.

Bias: **selective short**, and the reason is the table above rather than an opinion about the market. The shorts are what survives being measured from more than one starting point.

Funding, open interest and liquidation data are blocked from this host, so nothing here uses them. The board and every number in it: maix8.study/signals

Which of your entries would survive being measured from a different starting date?

Educational research, not financial advice. You are responsible for your own risk.

#TradingSignals #RiskManagement #Altcoins`;

writeFileSync("drafts/70-lookbacks.txt", text);
console.log("claims:", Object.keys(claims).length, "| words:", text.trim().split(/\s+/).length);
