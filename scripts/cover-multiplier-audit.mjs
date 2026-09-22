/**
 * Column card for post 83 — the odds of doubling, by how far price has fallen.
 *
 * A multiplier scan rests on one belief: that a deeper hole means a bigger
 * bounce. The cleanest refutation is not a median return, it is the question
 * the hunter actually asks — what share of these positions doubled — drawn
 * across every depth so the flatness is the picture.
 *
 * The axis runs from zero to ten percent rather than to the tallest bar,
 * because the finding is that all five are small and identical. Scaling to the
 * data would turn a 1.7-point spread into a staircase and argue the opposite.
 *
 *   node scripts/cover-multiplier-audit.mjs > media/multiplier-audit.html
 *   node scripts/render-card.mjs media/multiplier-audit.html media/multiplier-audit.png
 */

import { readFileSync } from "node:fs";
import { BRAND, CARD, INK, PALETTE, SURFACE } from "../src/palette.mjs";

const A = JSON.parse(readFileSync("research/multiplier-audit.json", "utf8"));

/** Zero to ten percent, fixed, so five small bars stay five small bars. */
const SCALE = 10;
const BASE = 470, MAX_H = 190, X0 = 148, STEP = 200, BAR = 128;

const bars = A.bands.map((b, i) => {
  const x = X0 + i * STEP;
  const v = b.forward[90].doubledSharePct;
  const h = Math.max(3, (v / SCALE) * MAX_H);
  const y = BASE - h;
  const fill = PALETTE.primary;
  return `
  <text x="${x + BAR / 2}" y="255" text-anchor="middle" class="lab">-${b.band[0]} to -${b.band[1]}%</text>
  <text x="${x + BAR / 2}" y="276" text-anchor="middle" class="note">${b.sharePct.toFixed(0)}% of days</text>
  <rect x="${x}" y="${y}" width="${BAR}" height="${h}" rx="3" fill="${fill}"/>
  <text x="${x + BAR / 2}" y="${y - 14}" text-anchor="middle" class="val">${v.toFixed(2)}%</text>`;
}).join("");

process.stdout.write(`<!doctype html><meta charset="utf-8">
<style>
  html,body{margin:0;width:${CARD.width}px;height:${CARD.height}px;overflow:hidden;background:${SURFACE}}
  svg{display:block}
  text{font-family:"DejaVu Sans",system-ui,sans-serif;fill:${INK.primary}}
  .kicker{font-size:19px;letter-spacing:3.5px;fill:${BRAND};font-weight:700}
  .title{font-size:40px;font-weight:800;letter-spacing:-0.5px}
  .sub{font-size:17px;fill:${INK.secondary}}
  .lab{font-size:19px;font-weight:800}
  .note{font-size:13px;fill:${INK.muted}}
  .val{font-size:19px;font-weight:700}
  .axis{font-size:14px;fill:${INK.muted}}
  .stat{font-size:22px;font-weight:700}
  .statlab{font-size:15px;fill:${INK.muted}}
  .mark{font-size:17px;font-weight:700;fill:${BRAND};letter-spacing:1px}
</style>
<svg width="${CARD.width}" height="${CARD.height}" viewBox="0 0 ${CARD.width} ${CARD.height}" xmlns="http://www.w3.org/2000/svg">
  <rect width="${CARD.width}" height="${CARD.height}" fill="${SURFACE}"/>
  <rect x="0" y="0" width="${CARD.width}" height="4" fill="${PALETTE.primary}"/>

  <text x="${CARD.margin}" y="${CARD.kickerY}" class="kicker">A SCAN RETURNED ZERO. I CHECKED WHY.</text>
  <text x="${CARD.right}" y="${CARD.kickerY}" text-anchor="end" class="mark">MAIX8</text>

  <text x="${CARD.margin}" y="${CARD.titleY[0]}" class="title">A deeper hole is not a bigger bounce.</text>
  <text x="${CARD.margin}" y="${CARD.titleY[1]}" class="title">The odds of doubling are flat.</text>
  <text x="${CARD.margin}" y="${CARD.subY}" class="sub">Share of positions that doubled within 90 days, by drawdown from the 90-day high · ${A.labelledDays.toLocaleString("en-US")} pair-days</text>

  <line x1="${CARD.margin}" x2="${CARD.right}" y1="${BASE}" y2="${BASE}" stroke="${INK.rule}" stroke-width="1"/>
  <text x="${CARD.margin}" y="302" class="axis">axis fixed 0–10% · every bar is the same bar</text>

  ${bars}

  <line x1="${CARD.margin}" x2="${CARD.right}" y1="${CARD.footRuleY}" y2="${CARD.footRuleY}" stroke="${INK.rule}" stroke-width="1"/>
  <text x="${CARD.margin}" y="${CARD.statY}" class="stat">${A.fieldsAvailable.withAllFourFields} / ${A.fieldsAvailable.scanned}</text>
  <text x="${CARD.margin}" y="${CARD.statLabelY}" class="statlab">Pairs with all four "unavailable" fields</text>

  <text x="560" y="${CARD.statY}" class="stat">${A.bands[0].forward[90].differencePct >= 0 ? "+" : ""}${A.bands[0].forward[90].differencePct.toFixed(2)}</text>
  <text x="560" y="${CARD.statLabelY}" class="statlab">Shallowest bucket vs baseline</text>

  <text x="${CARD.right}" y="${CARD.statY}" text-anchor="end" class="stat">${A.bands[4].forward[90].differencePct.toFixed(2)}</text>
  <text x="${CARD.right}" y="${CARD.statLabelY}" text-anchor="end" class="statlab">Deepest bucket vs baseline</text>
</svg>`);
