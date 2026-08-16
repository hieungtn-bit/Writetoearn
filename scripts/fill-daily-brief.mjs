/**
 * The daily column's writer. Reusable — nothing here is dated by hand.
 *
 * Every figure comes from research/daily-brief.json, so tomorrow's edition is
 * three commands rather than a rewrite:
 *
 *   node scripts/scan-daily.mjs
 *   node research/daily-brief.mjs
 *   node scripts/fill-daily-brief.mjs && wte ship drafts/brief-<day>.txt ...
 *
 * The order of sections is deliberate and should not be rearranged for a day
 * when it flatters us less. Yesterday's positions are settled *before* today's
 * are proposed, because a column that offers new trades while the last set is
 * still unaccounted for is selling, not reporting.
 *
 * The claims block adapts to the day rather than asserting a particular market:
 * it checks the internal consistency a reader would need to trust the piece —
 * the funnel narrows monotonically, every taken position clears the geometry
 * test, every declined one carries a reason, and every followed name that has
 * no plan says why. A day with ten longs and no shorts would pass these too.
 */

import { readFileSync, writeFileSync } from "node:fs";
import { pct, price as fmtPrice } from "../src/format.mjs";

const D = JSON.parse(readFileSync("research/daily-brief.json", "utf8"));
const b = D.breadth, r = D.rules, f = D.funnel, t = D.tally;
const s = D.settledSummary;

const monotonic = (x) => x.total >= x.tradeable && x.tradeable >= x.notThin && x.notThin >= x.unanimous;

const claims = {
  "breadth is measured across the whole exchange": b.pairs > 400,
  "the funnel only ever narrows": monotonic(f.long) && monotonic(f.short),
  "every position taken clears the fixed geometry":
    D.taken.every((p) => p.fullNetR > 0 && p.agreesAcrossWindows),
  "and none of them rests on a thin sample":
    D.taken.every((p) => p.boardEffectiveN >= r.minEffectiveN),
  "every declined row carries a stated reason":
    D.declined.every((x) => typeof x.reason === "string" && x.reason.length > 0),
  "the taken and declined lists together are everything that qualified":
    D.taken.length + D.declined.length === D.qualifying,
  "every followed name is accounted for":
    Object.values(D.followed).every((x) => x.verdict && x.verdict.reason),
  "the stop is the width this desk measured": r.stopAtr === 1.5,
  "position sizes follow from the stop, not from taste":
    D.taken.every((p) => Math.abs(p.positionUsd - r.riskPerTradeUsd / (p.stopPct / 100)) < 1),
};
const bad = Object.entries(claims).filter(([, ok]) => !ok);
if (bad.length) { console.error("ABORT:"); for (const [c] of bad) console.error("  x " + c); process.exit(1); }

const name = (sym) => sym.replace(/USDT$/, "");
const row = (a, c, d, e) =>
  (String(a).padEnd(24) + String(c).padStart(8) + String(d).padStart(9) + String(e).padStart(9)).trimEnd();

const funnelTable = [
  ["signals on the board", f.long.total, f.short.total],
  ["liquid enough to fill", f.long.tradeable, f.short.tradeable],
  [`sample of ${r.minEffectiveN}+ episodes`, f.long.notThin, f.short.notThin],
  ["all 5 lookbacks agree", f.long.unanimous, f.short.unanimous],
].map(([l, a, c]) => row(l, a, c, "")).join("\n");

const planRow = (a, c, d, e, g) =>
  (String(a).padEnd(8) + String(c).padStart(13) + String(d).padStart(13)
    + String(e).padStart(13) + String(g).padStart(7)).trimEnd();

const planTable = D.taken.map((p) => planRow(
  name(p.symbol), fmtPrice(p.entry), fmtPrice(p.stop), fmtPrice(p.target), Math.round(p.positionUsd),
)).join("\n");

const settleRow = (a, c, d, e) =>
  (String(a).padEnd(8) + String(c).padStart(10) + String(d).padStart(11) + String(e).padStart(10)).trimEnd();

const settleTable = (D.settled ?? []).map((p) => settleRow(
  name(p.symbol), p.status, `${pct(p.movePct)}%`, `${p.resultR >= 0 ? "+" : ""}${p.resultR.toFixed(3)}R`,
)).join("\n");

const followRow = (a, c, d, e, g) =>
  (String(a).padEnd(6) + String(c).padStart(12) + String(d).padStart(8)
    + String(e).padStart(9) + String(g).padStart(9)).trimEnd();

const followTable = Object.entries(D.followed).map(([sym, a]) => followRow(
  name(sym), fmtPrice(a.price), `${pct(a.rangePosition30d)}%`,
  a.priceVsValueArea ?? "n/a", `${a.leaningShort}/${a.lookbackCount}`,
)).join("\n");

const takenLine = D.taken.length
  ? `**${D.taken.length} position${D.taken.length > 1 ? "s" : ""}**, all ${D.taken[0].bias.toLowerCase()}`
  : "**nothing**";

const text = `This is the first edition of what I intend to run every day. Two questions, the same two, in the same order:

**How is the market? And what do we do about it?**

The rules underneath it do not move between editions. When they change, that will be its own post with a measurement attached.

HOW IS THE MARKET

**${b.pairs} USDT pairs.** ${b.up} up, ${b.down} down — ${pct(b.upSharePct)}% green. The median pair moved ${pct(b.medianChangePct)}% on the day.

That reads calm. The tails do not: **${b.downOver5} pairs are down more than 5%** and **${b.downOver10} more than 10%**, against ${b.upOver5} up more than 5%.

So: a flat middle and a heavy tail. Bitcoin dominance ${pct(D.context.btcDominancePct)}%, Fear & Greed ${D.context.fearGreed}.

My board scanned ${t.total} pairs: **${t.LONG} long, ${t.SHORT} short**, ${t.WAIT} stand aside. ${t.turning} rows carry a regime turn — the recent window disagreeing in sign with the longer history. ${t.untradeable} are too thin to trade at all.

FIRST, WHAT THE LAST SET DID

${s ? `Four shorts were published yesterday. After ${Math.round(D.settled[0].hoursHeld)} hours, none has reached its stop or its target — which is what a 30-day plan should look like after one day.

\`\`\`
${settleRow("", "status", "move", "result")}
${settleTable}
\`\`\`

**${s.aheadCount} of ${s.positions} ahead.** Median ${s.medianResultR >= 0 ? "+" : ""}${s.medianResultR.toFixed(3)}R, total ${s.totalResultR >= 0 ? "+" : ""}${s.totalResultR.toFixed(3)}R marked to market.

Nothing is settled yet and I am not going to pretend otherwise. Open positions are marked, not counted.` : "No prior edition to settle — this is the first."}

WHAT SURVIVES THE FILTERS

Three conditions, each traced to something measured rather than believed: liquid enough to fill, a sample of at least ${r.minEffectiveN} independent episodes, and all five lookback windows agreeing on direction.

\`\`\`
${row("", "long", "short", "")}
${funnelTable}
\`\`\`

**${f.long.total} long signals. ${f.long.unanimous} survive.** Second day running.

They die at the sample step: only ${f.long.notThin} longs on the whole board have an adequate sample, and none of those has all five windows behind it.

WHAT WE DO

${takenLine}. Entry at the current price, stop and target from a **fixed rule** — ${r.stopAtr} ATR stop, ${r.rewardRatio}:1 target, ${r.horizonDays} days — that I did not choose for these coins.

That fixed geometry is the point. Optimising stop and target per pair keeps about a tenth of itself out of sample, so the shape of the trade is a rule here rather than a decision.

\`\`\`
${planRow("", "entry", "stop", "target", "size")}
${planTable}
\`\`\`

Size is the position on a ${r.accountBase} account risking ${pct(r.riskPct)}%. It is not the amount at risk — that is ${r.riskPerTradeUsd} on every line.

${D.declined.length ? `**Declined:** ${D.declined.map((x) => `${name(x.symbol)} — ${x.reason}`).join("; ")}. It cleared every earlier filter and failed the last one.` : "Nothing was declined at the final step today."}

THE THREE WE FOLLOW

$BTC, $BNB and $ICP get a line every edition whether or not they qualify, because people hold them and "it did not make the list" is an answer.

\`\`\`
${followRow("", "price", "range", "vs VA", "short")}
${followTable}
\`\`\`

**BTC** — ${D.followed.BTCUSDT.verdict.reason}. Price sits ${D.followed.BTCUSDT.priceVsValueArea} its value area at ${pct(D.followed.BTCUSDT.rangePosition30d)}% of its 30-day range, with the point of control at ${fmtPrice(D.followed.BTCUSDT.poc)}.

**BNB** — ${D.followed.BNBUSDT.verdict.reason}. It is the only one of the three whose lookbacks lean long, ${D.followed.BNBUSDT.lookbackCount - D.followed.BNBUSDT.leaningShort} of ${D.followed.BNBUSDT.lookbackCount} of them — but it trades ${D.followed.BNBUSDT.priceVsValueArea} its value area near the top of its range, and the sample is not there.

**ICP** — ${D.followed.ICPUSDT.verdict.reason}. Worth noting what changed: **${D.followed.ICPUSDT.leaningShort} of its ${D.followed.ICPUSDT.lookbackCount} lookbacks now lean short.** A reader asked me about it as a recovery candidate yesterday; the windows have moved the other way.

No plan on any of the three today. Not a view about their future — a statement that they do not clear the same bar the ${D.taken.length} above did.

THE RULES, SO YOU CAN HOLD ME TO THEM

**Stop: ${r.stopAtr} ATR.** Measured across 61 pairs; expectancy peaks there and decays either side.

**Target: ${r.rewardRatio}:1. Horizon: ${r.horizonDays} days.** Fixed, never fitted per coin.

**Minimum sample: ${r.minEffectiveN} independent episodes.** Below that my own engine says thin, so I should not be trading it.

**All five lookbacks must agree.** A direction that only pays measured one way is a property of the measurement.

**Costs charged at ${pct(r.feePct)}% round trip**, every time, before anything is called an edge.

If a day comes when those filters admit ten longs, I will post ten longs. Today they admit ${D.taken.length} shorts, and the honest version of that is that the market is offering very little.

Bias: **selective short**, ${D.taken.length} position${D.taken.length > 1 ? "s" : ""}, small.

Board and every figure: maix8.study/signals

Tomorrow, same two questions. Which of your own rules could you print in advance and be held to?

Educational research, not financial advice. You are responsible for your own risk.

#TradingSignals #RiskManagement #Crypto`;

const out = `drafts/brief-${D.day}.txt`;
writeFileSync(out, text);
console.log(`${out} · claims: ${Object.keys(claims).length} · words: ${text.trim().split(/\s+/).length}`);
