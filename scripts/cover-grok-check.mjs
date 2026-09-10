/**
 * Column card for post 91 — the audit written from underneath.
 *
 * The obvious card is a scorecard of someone else's misses, and it would be the
 * wrong one. The post's argument is that being right today proves nothing about
 * a method, and that my own board being flattened proves nothing either. A card
 * that only tallies their errors would sell the opposite.
 *
 * So it draws the two things side by side: what the brief claimed against what
 * happened, and what my own book did on the same move. Their misses are small
 * and in one direction; mine is total. Putting both on one card is the only
 * honest version, and it is also the only interesting one.
 *
 *   node scripts/cover-grok-check.mjs > media/grok-check.html
 *   node scripts/render-card.mjs media/grok-check.html media/grok-check.png
 */

import { readFileSync } from "node:fs";
import { BRAND, CARD, INK, PALETTE, SURFACE } from "../src/palette.mjs";

const G = JSON.parse(readFileSync("research/grok-check.json", "utf8"));
const own = G.ownResult, proc = G.procedure;

const rows = G.claimsChecked.map((c) => ({
  label: c.label,
  // One decimal, because rounding 69,500 and 69,800 to whole thousands
  // collapsed a range into "$70k-70k" and made a band look like a point.
  claimed: c.kind === "price"
    ? `$${(c.lowUsd / 1000).toFixed(1)}k-${(c.highUsd / 1000).toFixed(1)}k`
    : `${c.lowPct}-${c.highPct}%`,
  actual: c.kind === "price"
    ? `$${Math.round(c.actualPrice).toLocaleString("en-US")}`
    : `${c.actualChangePct >= 0 ? "+" : ""}${c.actualChangePct.toFixed(2)}%`,
  miss: c.kind === "price"
    ? `${c.missPct >= 0 ? "+" : ""}${c.missPct.toFixed(1)}%`
    : `${c.missPct >= 0 ? "+" : ""}${c.missPct.toFixed(1)}pp`,
}));

const TOP = 268, STEP = 62;
const COL = { label: 96, claimed: 380, actual: 660, miss: 940 };

const table = rows.map((r, i) => {
  const y = TOP + i * STEP;
  return `
  <text x="${COL.label}" y="${y}" class="sym">${r.label}</text>
  <text x="${COL.claimed}" y="${y}" text-anchor="end" class="cell">${r.claimed}</text>
  <text x="${COL.actual}" y="${y}" text-anchor="end" class="cell">${r.actual}</text>
  <text x="${COL.miss}" y="${y}" text-anchor="end" class="miss">${r.miss}</text>`;
}).join("");

process.stdout.write(`<!doctype html><meta charset="utf-8">
<style>
  html,body{margin:0;width:${CARD.width}px;height:${CARD.height}px;overflow:hidden;background:${SURFACE}}
  svg{display:block}
  text{font-family:"DejaVu Sans",system-ui,sans-serif;fill:${INK.primary}}
  .kicker{font-size:19px;letter-spacing:3.5px;fill:${BRAND};font-weight:700}
  .title{font-size:40px;font-weight:800;letter-spacing:-0.5px}
  .sub{font-size:17px;fill:${INK.secondary}}
  .head{font-size:14px;fill:${INK.muted};letter-spacing:1px}
  .sym{font-size:22px;font-weight:800}
  .cell{font-size:21px;font-weight:700}
  .miss{font-size:21px;font-weight:800;fill:${PALETTE.primary}}
  .ours{font-size:19px;font-weight:800;fill:${INK.secondary}}
  .stat{font-size:22px;font-weight:700}
  .statlab{font-size:15px;fill:${INK.muted}}
  .mark{font-size:17px;font-weight:700;fill:${BRAND};letter-spacing:1px}
</style>
<svg width="${CARD.width}" height="${CARD.height}" viewBox="0 0 ${CARD.width} ${CARD.height}" xmlns="http://www.w3.org/2000/svg">
  <rect width="${CARD.width}" height="${CARD.height}" fill="${SURFACE}"/>
  <rect x="0" y="0" width="${CARD.width}" height="4" fill="${PALETTE.primary}"/>

  <text x="${CARD.margin}" y="${CARD.kickerY}" class="kicker">AUDITING A CALL THAT BEAT MINE</text>
  <text x="${CARD.right}" y="${CARD.kickerY}" text-anchor="end" class="mark">MAIX8</text>

  <text x="${CARD.margin}" y="${CARD.titleY[0]}" class="title">Their numbers were all short.</text>
  <text x="${CARD.margin}" y="${CARD.titleY[1]}" class="title">My whole book was stopped out.</text>
  <text x="${CARD.margin}" y="${CARD.subY}" class="sub">A forwarded bullish scan, checked against the tape · and what my own short board did on the same move</text>

  <text x="${COL.label}" y="${TOP - 30}" class="head">CLAIM</text>
  <text x="${COL.claimed}" y="${TOP - 30}" text-anchor="end" class="head">CLAIMED</text>
  <text x="${COL.actual}" y="${TOP - 30}" text-anchor="end" class="head">ACTUAL</text>
  <text x="${COL.miss}" y="${TOP - 30}" text-anchor="end" class="head">MISS</text>
  <line x1="${CARD.margin}" x2="${COL.miss}" y1="${TOP - 18}" y2="${TOP - 18}" stroke="${INK.rule}" stroke-width="1"/>

  ${table}

  <line x1="${CARD.margin}" x2="${COL.miss}" y1="${TOP + rows.length * STEP - 26}" y2="${TOP + rows.length * STEP - 26}" stroke="${INK.rule}" stroke-width="1"/>
  <text x="${COL.label}" y="${TOP + rows.length * STEP + 16}" class="ours">Every miss is in the same direction — the market ran further than the call.</text>
  <text x="${COL.label}" y="${TOP + rows.length * STEP + 44}" class="ours">My board, on that same move: ${own.ourStopped} of ${own.ourPositions} stopped, ${own.ourTotalR.toFixed(1)}R.</text>

  <line x1="${CARD.margin}" x2="${CARD.right}" y1="${CARD.footRuleY}" y2="${CARD.footRuleY}" stroke="${INK.rule}" stroke-width="1"/>
  <text x="${CARD.margin}" y="${CARD.statY}" class="stat">${proc.continuation3dPct.toFixed(1)}%</text>
  <text x="${CARD.margin}" y="${CARD.statLabelY}" class="statlab">Its entry trigger continues, over 3 days</text>

  <text x="560" y="${CARD.statY}" class="stat">${own.upSharePct.toFixed(1)}%</text>
  <text x="560" y="${CARD.statLabelY}" class="statlab">Of the market rose — most of a bull read</text>

  <text x="${CARD.right}" y="${CARD.statY}" text-anchor="end" class="stat">${G.claimsInRange} of ${G.claimsTotal}</text>
  <text x="${CARD.right}" y="${CARD.statLabelY}" text-anchor="end" class="statlab">Numeric claims inside their range</text>
</svg>`);
