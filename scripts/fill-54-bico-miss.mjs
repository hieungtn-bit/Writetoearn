// Plain-language short post. Every figure comes from the committed live log.
import { readFileSync, writeFileSync } from "node:fs";

const L = JSON.parse(readFileSync("/home/user/Writetoearn/research/live-catches.json", "utf8"));
const b = L.rows.find((r) => r.asset === "BICO");
const hft = L.rows.filter((r) => r.delisting).sort((x, y) => y.changeSinceAlertPct - x.changeSinceAlertPct)[0];

const claims = {
  "BICO is up since the alert": b.changeSinceAlertPct > 20,
  "and is still scored a miss": b.hit === false && b.settled === true,
  "because the gain inside the window was small": b.bestGainPct < 5,
  "while the drawdown inside the window was not": b.worstDrawdownPct < -10,
  "the alert hour really was extreme": b.turnoverVsNormal > 15,
  "the best-looking result on the board is a delisting": hft.delisting === true
    && hft.changeSinceAlertPct > b.changeSinceAlertPct,
  "the live hit rate is well below the backtest": L.excludingDelistings.hitRatePct < 20,
  "removing delistings lowers it": L.excludingDelistings.hitRatePct < L.overall.hitRatePct,
  "enough alerts have settled to say anything at all": L.settled >= 25,
};
const bad = Object.entries(claims).filter(([, ok]) => !ok);
if (bad.length) { console.error("ABORT:"); for (const [c] of bad) console.error("  x " + c); process.exit(1); }

const f1 = (v) => Number(v).toFixed(1);
const f2 = (v) => Number(v).toFixed(2);

const text = `Our scanner flagged $BICO two days ago at $${b.alertPrice}. It is $${b.priceNow} now, up ${f1(b.changeSinceAlertPct)}%.

We score it a miss.

That is the most useful thing I can tell you this week, so here is why.

Every alert comes with a twelve-hour clock. Inside those twelve hours BICO rose ${f2(b.bestGainPct)}% and fell ${f2(Math.abs(b.worstDrawdownPct))}%. The move everyone can see now happened after the window shut. Anyone who bought the alert with a sane stop was out long before it started.

Being right about the coin and wrong about the timing is just being wrong with a better story.

The part that did work: in one hour BICO traded $${(b.hourTurnoverUsd / 1e6).toFixed(1)}M when its normal hour is $${Math.round(b.averageHourTurnoverUsd / 1000)}K. That is ${f1(b.turnoverVsNormal)} times its own average. Money turns up before the crowd does — BICO only reached the trending lists this week.

Our live record: ${L.settled} alerts have finished their window. ${f1(L.overall.hitRatePct)}% hit. Take out the coins that pumped because the exchange announced it was delisting them, and it is ${f1(L.excludingDelistings.hitRatePct)}% of ${L.excludingDelistings.n}.

Our biggest winner on paper, up ${f1(hft.changeSinceAlertPct)}%, is one of those delistings. It is not a win. It is an exit queue.

Bias: WAIT. A scanner that finds movement is not a scanner that finds profit, and I would rather show you the gap than sell you the headline.

Which would you rather have — the coin, or the timing?

Educational research, not financial advice. DYOR.

#WriteToEarn #BinanceSquare`;

writeFileSync("/home/user/Writetoearn/drafts/54-bico-miss.txt", text);
console.log("claims:", Object.keys(claims).length, "| words:", text.trim().split(/\s+/).length);
