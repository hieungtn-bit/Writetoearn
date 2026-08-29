/**
 * Column card for post 78 — what the board's own number is worth out of sample.
 *
 * The whole post is one comparison: the figure the board publishes, what that
 * same plan went on to do, and what a geometry picked at random did over the
 * same window. Drawing all three against one axis makes the point that no
 * sentence quite lands — the second and third bars are the same height.
 *
 * The random-choice bar is drawn in the same colour as the held bar rather than
 * greyed out, because they are the finding: two bars that should differ and do
 * not.
 *
 *   node scripts/cover-board-overfit.mjs > media/board-overfit.html
 *   node scripts/render-card.mjs media/board-overfit.html media/board-overfit.png
 */

import { readFileSync } from "node:fs";
import { BRAND, CARD, INK, PALETTE, SURFACE } from "../src/palette.mjs";

const S = JSON.parse(readFileSync("research/selection-bias.json", "utf8"));
const o = S.overall;

const steps = [
  { label: "what the board shows", sub: "best of 64, on its own window", v: o.medianChosenR, hero: true },
  { label: "what it then did", sub: "same plan, data it never saw", v: o.medianHeldR, hero: false },
  { label: "picking at random", sub: "any geometry, same window", v: o.medianTypicalR, hero: false },
];

const ZERO = 500, MAX_H = 230, X0 = 168, STEP = 336, BAR = 176;
const LABEL_TOP = 236;
/** Below this height a value printed inside the bar would not fit. */
const INSIDE_MIN_H = 70;
const scale = Math.max(...steps.map((s) => Math.abs(s.v)));
const height = (v) => Math.max(5, (Math.abs(v) / scale) * MAX_H);

const bars = steps.map((s, i) => {
  const x = X0 + i * STEP;
  const h = height(s.v);
  const y = ZERO - h;
  const fill = s.hero ? PALETTE.muted : PALETTE.primary;
  // A tall bar reaches its own caption, so its value goes inside it instead.
  const inside = h >= INSIDE_MIN_H;
  const valY = inside ? y + 38 : y - 14;
  const valFill = inside ? INK.primary : fill;
  return `
  <text x="${x + BAR / 2}" y="${LABEL_TOP}" text-anchor="middle" class="lab">${s.label}</text>
  <text x="${x + BAR / 2}" y="${LABEL_TOP + 21}" text-anchor="middle" class="note">${s.sub}</text>
  <rect x="${x}" y="${y}" width="${BAR}" height="${h}" rx="4" fill="${fill}"/>
  <text x="${x + BAR / 2}" y="${valY}" text-anchor="middle" class="val" fill="${valFill}">${s.v >= 0 ? "+" : ""}${s.v.toFixed(3)}R</text>`;
}).join("");

process.stdout.write(`<!doctype html><meta charset="utf-8">
<style>
  html,body{margin:0;width:${CARD.width}px;height:${CARD.height}px;overflow:hidden;background:${SURFACE}}
  svg{display:block}
  text{font-family:"DejaVu Sans",system-ui,sans-serif;fill:${INK.primary}}
  .kicker{font-size:19px;letter-spacing:3.5px;fill:${BRAND};font-weight:700}
  .title{font-size:40px;font-weight:800;letter-spacing:-0.5px}
  .sub{font-size:17px;fill:${INK.secondary}}
  .val{font-size:26px;font-weight:800}
  .lab{font-size:19px;font-weight:800}
  .note{font-size:14px;fill:${INK.muted}}
  .stat{font-size:22px;font-weight:700}
  .statlab{font-size:15px;fill:${INK.muted}}
  .mark{font-size:17px;font-weight:700;fill:${BRAND};letter-spacing:1px}
</style>
<svg width="${CARD.width}" height="${CARD.height}" viewBox="0 0 ${CARD.width} ${CARD.height}" xmlns="http://www.w3.org/2000/svg">
  <rect width="${CARD.width}" height="${CARD.height}" fill="${SURFACE}"/>
  <rect x="0" y="0" width="${CARD.width}" height="4" fill="${PALETTE.primary}"/>

  <text x="${CARD.margin}" y="${CARD.kickerY}" class="kicker">I POINTED TODAY'S TEST AT MY OWN BOARD</text>
  <text x="${CARD.right}" y="${CARD.kickerY}" text-anchor="end" class="mark">MAIX8</text>

  <text x="${CARD.margin}" y="${CARD.titleY[0]}" class="title">My board's best plan, out of sample,</text>
  <text x="${CARD.margin}" y="${CARD.titleY[1]}" class="title">is worth about a coin flip.</text>
  <text x="${CARD.margin}" y="${CARD.subY}" class="sub">Median expectancy in R · chosen on ${S.halfDays} days, scored on the next ${S.halfDays} · ${S.rows} pair-directions</text>

  <line x1="${CARD.margin}" x2="${CARD.right}" y1="${ZERO}" y2="${ZERO}" stroke="${INK.rule}" stroke-width="1"/>

  ${bars}

  <line x1="${CARD.margin}" x2="${CARD.right}" y1="${CARD.footRuleY}" y2="${CARD.footRuleY}" stroke="${INK.rule}" stroke-width="1"/>
  <text x="${CARD.margin}" y="${CARD.statY}" class="stat">${o.shareBeatingTypical.toFixed(0)}%</text>
  <text x="${CARD.margin}" y="${CARD.statLabelY}" class="statlab">Of pairs where choosing beat not choosing</text>

  <text x="620" y="${CARD.statY}" class="stat">${S.long.shareStillPositive.toFixed(0)}%</text>
  <text x="620" y="${CARD.statLabelY}" class="statlab">Long plans still positive out of sample</text>

  <text x="${CARD.right}" y="${CARD.statY}" text-anchor="end" class="stat">${S.short.shareStillPositive.toFixed(0)}%</text>
  <text x="${CARD.right}" y="${CARD.statLabelY}" text-anchor="end" class="statlab">Short plans still positive</text>
</svg>`);
