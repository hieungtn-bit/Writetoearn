/**
 * Turns a scan into something a notification can carry.
 *
 * This lives in the repository rather than inline in the workflow because the
 * first version was an inline `node -e` block, and it failed on the runner for
 * a reason no test could have caught: nothing about it was runnable locally.
 * A committed script can be run by hand before it is trusted at 03:00.
 *
 * Writes a markdown body to the path given, and the counts to GITHUB_OUTPUT
 * when running under Actions.
 *
 *   node scripts/scan-report.mjs [out.md]
 */

import fs from "node:fs";
import { alertsFrom, scanIntraday, DEFAULT_MIN_Z } from "../src/intraday.mjs";
import { AlertLog } from "../src/alerts.mjs";
import { scoreAlerts, HORIZON_HOURS, TARGET_PCT } from "../src/alert-score.mjs";
import { fetchDelistings, partitionByDelisting } from "../src/listings.mjs";
import { marketContext, regimeNote } from "../src/context.mjs";

const out = process.argv[2] ?? "/tmp/scan-body.md";
const minZ = Number(process.env.SCAN_MIN_Z ?? DEFAULT_MIN_Z);

const result = await scanIntraday();
const log = new AlertLog();
const raw = log.record(alertsFrom(result.rows, { minZ }));

// A delisting pump is real turnover with a countdown attached. It is separated
// out rather than dropped, because it is sometimes the story worth writing --
// it just must never arrive looking like an opportunity.
const delistings = await fetchDelistings();
const { clean: fresh, flagged } = partitionByDelisting(raw, delistings);

const lines = [];
if (flagged.length) {
  lines.push(`> **${flagged.length} alert(s) suppressed: the exchange has announced a delisting.**`, ">");
  for (const a of flagged) {
    lines.push(`> - **${a.symbol.replace(/USDT$/, "")}** — ${a.delisting.title}`);
  }
  lines.push("");
}
if (fresh.length) {
  lines.push(`**${fresh.length} new alert(s)** out of ${result.scanned} pairs scanned.`, "");
  for (const a of fresh) {
    lines.push(
      `- **${a.symbol.replace(/USDT$/, "")}** — turnover ${a.volumeZScore.toFixed(1)}σ above its weekly ` +
        `average (${(a.quoteVolume / a.averageQuoteVolume).toFixed(1)}x), ` +
        `1h ${a.change1hPct >= 0 ? "+" : ""}${a.change1hPct.toFixed(2)}%, at \`${a.price}\``,
    );
  }
} else {
  lines.push(`No actionable alert: ${result.scanned} pairs scanned, nothing above ${minZ}σ of its own weekly turnover${flagged.length ? " that is not being delisted" : ""}.`);
}

// The scoreboard is the part worth reading over time. A feed of alerts with no
// record of how the last hundred went is a horoscope.
const score = await scoreAlerts({ log });
if (score.rows.length) {
  lines.push("", "---", "");
  lines.push(
    score.settled
      ? `**Scoreboard:** ${score.hitRatePct.toFixed(1)}% of ${score.settled} settled alerts reached ` +
        `+${TARGET_PCT}% within ${HORIZON_HOURS}h, against a ${score.baselinePct}% baseline ` +
        `(${score.liftVsBaseline.toFixed(2)}x). ${score.pending} still open.`
      : `**Scoreboard:** ${score.pending} alert(s) still inside the ${HORIZON_HOURS}-hour window, none settled yet.`,
  );
  if (score.settled && score.settled < 30) {
    lines.push("", `_${score.settled} settled observations. The backtest used 31,515 — this is not a rate yet._`);
  }
}

// The board an alert lands on. On 2026-08-03 the three loudest events on the
// venue were all tokens being delisted -- not because the scanner was wrong,
// but because the market had nothing better going on. An alert with no view of
// the whole board cannot tell those two situations apart, and neither can a
// reader who only sees the alert.
const ctx = await marketContext();
if (ctx.breadth) {
  const b = ctx.breadth;
  lines.push("", "---", "", `**Board:** ${regimeNote(ctx)}`, "");
  lines.push(
    `- ${b.pairs} pairs, ${b.advancingPct.toFixed(0)}% advancing, ` +
      `${b.beatingBtcPct.toFixed(0)}% of alts beating BTC`,
    `- top 10 pairs hold ${b.top10TurnoverSharePct.toFixed(0)}% of all turnover`,
  );
  if (ctx.positioning) {
    lines.push(
      `- $${(ctx.positioning.totalOpenInterestUsd / 1e9).toFixed(2)}B open interest, ` +
        `${ctx.positioning.majorSharePct.toFixed(0)}% of it in BTC and ETH`,
    );
  }
  if (ctx.funding) {
    lines.push(
      `- ${ctx.funding.positiveSharePct.toFixed(0)}% of majors paying to be long, ` +
        `${ctx.funding.oiWeightedAnnualisedPct >= 0 ? "+" : ""}${ctx.funding.oiWeightedAnnualisedPct.toFixed(2)}% annualised weighted`,
    );
  }
}

lines.push("", "_Detection, not prediction: the move has already started and we saw it early._");

fs.writeFileSync(out, lines.join("\n"));
if (process.env.GITHUB_OUTPUT) {
  fs.appendFileSync(
    process.env.GITHUB_OUTPUT,
    `count=${fresh.length}\nsuppressed=${flagged.length}\nscanned=${result.scanned}\n`,
  );
}
console.log(`${result.scanned} pairs scanned, ${fresh.length} new alert(s), ${flagged.length} suppressed as delisting, ${score.settled} settled`);
