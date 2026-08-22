/**
 * Column card for post 96 — one live trade, drawn against its own stop.
 *
 * The card has to carry the finding without letting a reader take the wrong
 * one home. The wrong one is "the trade is up 0.20R" — true, and it would read
 * as the plan working. The right one is the shape of the path: entry, then
 * almost the whole risk budget spent going the wrong way, then a recovery that
 * never reached the first target.
 *
 * So it draws a single price axis with the four levels that matter — stop,
 * entry, worst, best, mark — and the first target sitting off to the side,
 * untouched. The gap between "best" and the target is the part that argues,
 * because it shows the trade never got near the number the plan was sized on.
 *
 * The band from stop to entry is shaded as the risk budget, and the worst
 * excursion is drawn inside it. A reader sees how much of the budget got spent
 * before anything happened, which is the sentence the post is making.
 *
 *   node scripts/cover-followthrough.mjs > media/followthrough.html
 *   node scripts/render-card.mjs media/followthrough.html media/followthrough.png
 */

import { readFileSync } from "node:fs";
import { BRAND, CARD, INK, PALETTE, ROLE, SURFACE } from "../src/palette.mjs";

const F = JSON.parse(readFileSync("research/icp-followthrough.json", "utf8"));
const R = F.result;

const AXIS = { x: 96, y: 372, w: 1010 };
const lo = Math.min(F.plannedStopUsd, R.worstUsd) - 0.02;
const hi = Math.max(F.plannedTp1Usd, R.bestUsd) + 0.02;
const xFor = (v) => AXIS.x + ((v - lo) / (hi - lo)) * AXIS.w;

/** The risk budget: everything between the entry and the stop. */
const riskLeft = xFor(F.plannedStopUsd), riskRight = xFor(R.entryUsd);
/** How much of it the trade actually spent. */
const spentLeft = xFor(R.worstUsd);

const MARKS = [
  { v: F.plannedStopUsd, label: "stop", note: "$2.390", cls: "fail", side: "below" },
  { v: R.worstUsd, label: "worst", note: `${R.worstExcursionR.toFixed(2)}R`, cls: "fail", side: "above" },
  { v: R.entryUsd, label: "entry", note: "$2.500", cls: "ink", side: "below" },
  { v: R.markUsd, label: "now", note: `+${R.markR.toFixed(2)}R`, cls: "ok", side: "above" },
  { v: R.bestUsd, label: "best", note: `+${R.bestExcursionR.toFixed(2)}R`, cls: "ok", side: "below" },
  { v: F.plannedTp1Usd, label: "first target", note: "never reached", cls: "muted", side: "above" },
];

const marks = MARKS.map((m) => {
  const x = xFor(m.v);
  const above = m.side === "above";
  return `
  <line x1="${x.toFixed(1)}" x2="${x.toFixed(1)}" y1="${AXIS.y - 22}" y2="${AXIS.y + 22}" stroke="${
    m.cls === "fail" ? ROLE.fail : m.cls === "ok" ? PALETTE.secondary : m.cls === "muted" ? PALETTE.muted : INK.primary
  }" stroke-width="${m.cls === "muted" ? 2 : 3}"${m.cls === "muted" ? ' stroke-dasharray="5 4"' : ""}/>
  <text x="${x.toFixed(1)}" y="${above ? AXIS.y - 40 : AXIS.y + 48}" text-anchor="middle" class="lab ${m.cls}">${m.label}</text>
  <text x="${x.toFixed(1)}" y="${above ? AXIS.y - 62 : AXIS.y + 70}" text-anchor="middle" class="note">${m.note}</text>`;
}).join("");

process.stdout.write(`<!doctype html><meta charset="utf-8">
<style>
  html,body{margin:0;width:${CARD.width}px;height:${CARD.height}px;overflow:hidden;background:${SURFACE}}
  svg{display:block}
  text{font-family:"DejaVu Sans",system-ui,sans-serif;fill:${INK.primary}}
  .kicker{font-size:19px;letter-spacing:3.5px;fill:${BRAND};font-weight:700}
  .title{font-size:40px;font-weight:800;letter-spacing:-0.5px}
  .sub{font-size:17px;fill:${INK.secondary}}
  .lab{font-size:17px;font-weight:800}
  .note{font-size:14px;fill:${INK.muted}}
  .lab.fail{fill:${ROLE.fail}}
  .lab.ok{fill:${PALETTE.secondary}}
  .lab.muted{fill:${PALETTE.muted}}
  .lab.ink{fill:${INK.primary}}
  .budget{font-size:14px;fill:${INK.faint}}
  .stat{font-size:22px;font-weight:700}
  .statlab{font-size:15px;fill:${INK.muted}}
  .mark{font-size:17px;font-weight:700;fill:${BRAND};letter-spacing:1px}
</style>
<svg width="${CARD.width}" height="${CARD.height}" viewBox="0 0 ${CARD.width} ${CARD.height}" xmlns="http://www.w3.org/2000/svg">
  <rect width="${CARD.width}" height="${CARD.height}" fill="${SURFACE}"/>
  <rect x="0" y="0" width="${CARD.width}" height="4" fill="${ROLE.fail}"/>

  <text x="${CARD.margin}" y="${CARD.kickerY}" class="kicker">A PUBLISHED CHECK, ONE DAY LATER</text>
  <text x="${CARD.right}" y="${CARD.kickerY}" text-anchor="end" class="mark">MAIX8</text>

  <text x="${CARD.margin}" y="${CARD.titleY[0]}" class="title">The trigger fired 91 minutes</text>
  <text x="${CARD.margin}" y="${CARD.titleY[1]}" class="title">after I published the warning.</text>
  <text x="${CARD.margin}" y="${CARD.subY}" class="sub">ICP, ${R.hoursHeld} hours held · the plan's own entry, stop and targets, on the tape since publication</text>

  <rect x="${riskLeft.toFixed(1)}" y="${AXIS.y - 12}" width="${(riskRight - riskLeft).toFixed(1)}" height="24"
        fill="${PALETTE.neutral}" fill-opacity="0.55"/>
  <rect x="${spentLeft.toFixed(1)}" y="${AXIS.y - 12}" width="${(riskRight - spentLeft).toFixed(1)}" height="24"
        fill="${ROLE.fail}" fill-opacity="0.45"/>
  <text x="${((riskLeft + riskRight) / 2).toFixed(1)}" y="${AXIS.y + 110}" text-anchor="middle" class="budget">
    stop to entry is the risk budget · shaded, the ${(Math.abs(R.worstExcursionR) * 100).toFixed(0)}% of it spent before the trade went anywhere
  </text>

  <line x1="${AXIS.x}" x2="${AXIS.x + AXIS.w}" y1="${AXIS.y}" y2="${AXIS.y}" stroke="${INK.axis}" stroke-width="1"/>
  ${marks}

  <line x1="${CARD.margin}" x2="${CARD.right}" y1="${CARD.footRuleY}" y2="${CARD.footRuleY}" stroke="${INK.rule}" stroke-width="1"/>
  <text x="${CARD.margin}" y="${CARD.statY}" class="stat">${R.stopMarginR.toFixed(2)}R</text>
  <text x="${CARD.margin}" y="${CARD.statLabelY}" class="statlab">Room left when it turned</text>

  <text x="440" y="${CARD.statY}" class="stat">${F.publishedClaim.daysTakingPlanStopFromOpenPct.toFixed(1)}%</text>
  <text x="440" y="${CARD.statLabelY}" class="statlab">Of ICP days take this stop from the open</text>

  <text x="${CARD.right}" y="${CARD.statY}" text-anchor="end" class="stat">${F.relative.excessPct.toFixed(2)}%</text>
  <text x="${CARD.right}" y="${CARD.statLabelY}" text-anchor="end" class="statlab">Against BTC since the fill</text>
</svg>`);
