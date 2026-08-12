/**
 * Post 71 — BNB, BTC, and a number that changed today.
 *
 * Two readers in a row have now estimated overhead supply as "medium" on an
 * asset where measurement says it is close to zero: ICP at 43–47% against a
 * measured 13%, and now BNB at 35–45% against a measured 0.1%. That is not a
 * coincidence worth being smug about — it is a sign the number is hard to eyeball,
 * which is exactly why it should be computed.
 *
 * And checking it properly exposed that this desk's own version was coarse.
 * The board now builds a real hourly volume profile, and the post reports how
 * much that changed and where, because a metric that moves under a reader's
 * feet without announcement is worse than a coarse one.
 *
 * BTC leads the second half because it is the asset the whole board depends on
 * and the one it refuses to call. A refusal is a result, and it deserves the
 * same explanation as a call.
 *
 * Every figure traces to site/signals.json and research/bnb-btc.json.
 */

import { readFileSync, writeFileSync } from "node:fs";
import { pct, price as fmtPrice, usd } from "../src/format.mjs";

const S = JSON.parse(readFileSync("site/signals.json", "utf8"));
const D = JSON.parse(readFileSync("research/bnb-btc.json", "utf8"));

const board = Object.fromEntries(S.signals.map((s) => [s.asset, s]));
const bnb = board.BNB, btc = board.BTC;
const bnbCtx = bnb.context, btcCtx = btc.context;

/** How far the two overhead methods disagree, pair by pair. */
const gaps = S.signals
  .filter((s) => s.context.underwaterByDailyBarsPct != null)
  .map((s) => ({
    asset: s.asset,
    gap: s.context.underwaterPct - s.context.underwaterByDailyBarsPct,
  }))
  .sort((a, b) => Math.abs(b.gap) - Math.abs(a.gap));
const wide = gaps.filter((g) => Math.abs(g.gap) > 5);

const claims = {
  "BNB overhead is essentially zero": bnbCtx.underwaterPct < 1,
  "and both methods agree it is": Math.abs(bnbCtx.underwaterPct - bnbCtx.underwaterByDailyBarsPct) < 2,
  "BNB is at the very top of its range": bnbCtx.rangePosition30d > 95,
  "BNB trades above its whole value area": bnb.price > bnbCtx.valueAreaHigh,
  "BNB volume is falling, not neutral": bnbCtx.volumeTrendPct < -5,
  "BNB is not backed by every lookback": bnb.agreement.agreeing < bnb.agreement.windows,
  "but a majority still back it": bnb.agreement.agreeing * 2 > bnb.agreement.windows,
  "BTC is a refusal, not an omission": btc.bias === "WAIT" && !btc.plan,
  "and both BTC directions genuinely lose": D.BTC.call.recentLongR < 0 && D.BTC.call.recentShortR < 0,
  "BTC trades below its point of control": btc.price < btcCtx.pocPrice,
  "the two overhead methods disagree most on BTC": gaps[0].asset === "BTC",
  "and the disagreement is material on several pairs": wide.length >= 5,
  "BNB is less tied to BTC than people assume": D.BNB.rSquaredPct < 50,
  "every stop is still under a median week": D.BNB.medianWeekPct > 0 && bnb.plan.stopPct < D.BNB.medianWeekPct,
};
const bad = Object.entries(claims).filter(([, ok]) => !ok);
if (bad.length) { console.error("ABORT:"); for (const [c] of bad) console.error("  x " + c); process.exit(1); }

const row = (a, b, c) =>
  (String(a).padEnd(10) + String(b).padStart(12) + String(c).padStart(13)).trimEnd();

const win = (rows) => Object.entries(rows).map(([w, v]) =>
  (String(w) + "d").padEnd(8) + String(v.long.positive).padStart(8) + String(v.short.positive).padStart(9)).join("\n");

const text = `Someone sent me a $BNB read this morning putting overhead supply at 35–45% — "medium, not too heavy."

I measured it: **${pct(bnbCtx.underwaterPct)}%**.

That is the second time this week. An $ICP read put overhead at 43–47% against a measured 13%. Both times the estimate was "medium" and both times the real number was near the floor.

I am not going to be smug about this, because checking it properly showed my own version of the number was coarser than theirs deserved. More on that at the end — it changed today.

BNB: THE RAREST NUMBER ON MY BOARD, AND WHY IT IS NOT ENOUGH

Overhead supply is the share of the last 30 days of turnover that traded **above** the current price — the people underwater, waiting to break even and get out.

BNB's is **${pct(bnbCtx.underwaterPct)}%**. Not "low". Effectively nobody who bought BNB in the past month is holding a loss. I scan ${S.tally.total} pairs daily and this is the only one that reads like that.

Both of my methods agree on it, which is the test that matters — the profile says ${pct(bnbCtx.underwaterPct)}% and the older daily-bar method says ${pct(bnbCtx.underwaterByDailyBarsPct)}%.

So why is it not a buy?

\`\`\`
${row("price now", `${fmtPrice(bnb.price)}`, "")}
${row("value area", `${fmtPrice(bnbCtx.valueAreaLow)}`, `${fmtPrice(bnbCtx.valueAreaHigh)}`)}
${row("POC", `${fmtPrice(bnbCtx.pocPrice)}`, "")}
${row("range pos", `${pct(bnbCtx.rangePosition30d)}%`, "")}
${row("volume 30d", `${pct(bnbCtx.volumeTrendPct)}%`, "")}
\`\`\`

Price sits at **${pct(bnbCtx.rangePosition30d)}% of the 30-day range** and **above the entire value area**. The busiest price of the last month is ${fmtPrice(bnbCtx.pocPrice)} — you would be buying ${pct(((bnb.price / bnbCtx.pocPrice) - 1) * 100)}% above where the volume actually traded.

And volume is **${pct(bnbCtx.volumeTrendPct)}%**, not neutral and not rising. Price at the top of the range on falling participation is the one combination I have learned to distrust.

The read also put BNB's BTC beta at 0.70–0.90. Measured: **${pct(D.BNB.beta)}**, with BTC explaining **${pct(D.BNB.rSquaredPct)}%** of its daily variance. BNB is *less* tethered to BTC than assumed, not more.

Where I agree with the read entirely: this is not an early-compression setup, and chasing here is not the trade. We reach the same conclusion from different numbers.

My board calls BNB long at **${bnb.agreement.agreeing} of ${bnb.agreement.windows} lookbacks** — a majority, but not the four of five it showed yesterday. The 270 and 365-day windows both disagree, and on the 365 neither direction wins:

\`\`\`
${("").padEnd(8)}${("long").padStart(8)}${("short").padStart(9)}
${win(D.BNB.byWindow)}
\`\`\`

BTC: THE ONE I WILL NOT CALL

BTC is **${btc.bias}** on the board today, and that is a result rather than a gap.

Both directions were scored on the same grid over the recent window. Long came back **${pct(D.BTC.call.recentLongR)}R**. Short came back **${pct(D.BTC.call.recentShortR)}R**. Both negative. There is no side to take.

The lookbacks show why it is genuinely undecided rather than quietly bearish:

\`\`\`
${("").padEnd(8)}${("long").padStart(8)}${("short").padStart(9)}
${win(D.BTC.byWindow)}
\`\`\`

The one-year view is emphatically short — 63 of 64 geometries. The two-year view flips long. The recent window pays neither. Three honest answers that contradict each other, which is exactly what a market with no edge in it looks like.

Structurally: price ${fmtPrice(btc.price)} sits **below its point of control** at ${fmtPrice(btcCtx.pocPrice)}, inside a value area of ${fmtPrice(btcCtx.valueAreaLow)}–${fmtPrice(btcCtx.valueAreaHigh)}, at ${pct(btcCtx.rangePosition30d)}% of the 30-day range with volume **${pct(btcCtx.volumeTrendPct)}%** and RSI ${pct(D.BTC.rsi14)}. ${pct(D.BTC.drawdownFromAthPct)}% below the October high. Turnover ${usd(D.BTC.turnoverUsd)} a day.

This matters beyond BTC. It is what most alt calls are actually resting on, and when the anchor has no readable edge, a thin-sample altcoin signal built on top of it inherits that.

THE NUMBER THAT CHANGED TODAY

Checking the reader's 35–45% forced me to check my own method, and it was worse than I would have claimed.

The old one took **daily** bars and charged each entire bar to one side of the current price by its typical price. A day that traded straight through the current price contributed all of its volume or none of it.

The board now builds a real volume profile: **hourly** bars, each spread across the price bins its high-low range covers, weighted by overlap.

Across ${gaps.length} pairs the two disagree by more than five points on **${wide.length}**, and the worst cases are the two assets that matter most:

\`\`\`
${row("", "profile", "daily bars")}
${gaps.slice(0, 4).map((g) => {
  const s = board[g.asset];
  return row(g.asset, `${pct(s.context.underwaterPct)}%`, `${pct(s.context.underwaterByDailyBarsPct)}%`);
}).join("\n")}
\`\`\`

The old number was least reliable exactly where price sits in the thick of the distribution — which is where you most want to know it. Where price sits clear of the range, both methods agree closely, which is why this went unnoticed for so long.

Both figures are in the published data, so you can check the change rather than take my word for it.

WHAT I AM ACTUALLY DOING

Bias: **selective short** across the alt group, unchanged, and **stand aside on BTC** because the grid says stand aside.

BNB I am watching, not buying: the cleanest overhead reading I have ever measured, spoiled by the price being at the top of its range on falling volume. If it pulls back toward the value area with volume, that is a different post.

The usual caveats, which have not improved: the sample behind a 30-day call is about **five independent episodes**, and every stop the board derives from daily volatility still lands under a median week — BNB's is ${pct(bnb.plan.stopPct)}% against a median week of ${pct(D.BNB.medianWeekPct)}%. Hold it for a month with that stop and an ordinary week takes you out.

Funding, open interest and liquidation data are blocked from this host, so none of it is used anywhere here.

Board and every figure: maix8.study/signals

What is your overhead number on the last thing you bought — measured, or eyeballed?

Educational research, not financial advice. You are responsible for your own risk.

#Bitcoin #BNB #RiskManagement`;

writeFileSync("drafts/71-bnb-btc.txt", text);
console.log("claims:", Object.keys(claims).length, "| words:", text.trim().split(/\s+/).length);
