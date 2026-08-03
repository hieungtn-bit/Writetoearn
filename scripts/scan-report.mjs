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

const out = process.argv[2] ?? "/tmp/scan-body.md";
const minZ = Number(process.env.SCAN_MIN_Z ?? DEFAULT_MIN_Z);

const result = await scanIntraday();
const log = new AlertLog();
const fresh = log.record(alertsFrom(result.rows, { minZ }));

const lines = [];
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
  lines.push(`No alert: ${result.scanned} pairs scanned, nothing above ${minZ}σ of its own weekly turnover.`);
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

lines.push("", "_Detection, not prediction: the move has already started and we saw it early._");

fs.writeFileSync(out, lines.join("\n"));
if (process.env.GITHUB_OUTPUT) {
  fs.appendFileSync(
    process.env.GITHUB_OUTPUT,
    `count=${fresh.length}\nscanned=${result.scanned}\n`,
  );
}
console.log(`${result.scanned} pairs scanned, ${fresh.length} new alert(s), ${score.settled} settled`);
