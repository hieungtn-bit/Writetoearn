/**
 * The daily column's card. Reusable — every value comes from the brief.
 *
 * A recurring column needs a recurring picture, so this is a fixed layout the
 * reader learns to read once: the funnel on the left, what it left us on the
 * right. The numbers change daily; the shape does not, which is the point of
 * running a column instead of posting whatever looked interesting.
 *
 * The long and short funnels are drawn on one scale so a day when one side
 * empties out is visible as an empty column rather than as a rescaled one.
 *
 *   node scripts/cover-daily-brief.mjs > media/brief.html
 *   node scripts/render-card.mjs media/brief.html media/brief.png
 */

import { readFileSync } from "node:fs";
import { BRAND, CARD, INK, PALETTE, SURFACE } from "../src/palette.mjs";

const D = JSON.parse(readFileSync("research/daily-brief.json", "utf8"));
const f = D.funnel, b = D.breadth, r = D.rules;

const STEPS = [
  ["on the board", f.long.total, f.short.total],
  ["liquid enough", f.long.tradeable, f.short.tradeable],
  [`${r.minEffectiveN}+ episodes`, f.long.notThin, f.short.notThin],
  ["5 of 5 windows", f.long.unanimous, f.short.unanimous],
];

const MAX_W = 250, X_LONG = 452, X_SHORT = 660, TOP = 268, STEP = 60, BAR = 36;
const scale = Math.max(...STEPS.flatMap(([, a, c]) => [a, c]), 1);

const rows = STEPS.map(([label, a, c], i) => {
  const y = TOP + i * STEP;
  const wL = (a / scale) * MAX_W, wS = (c / scale) * MAX_W;
  return `
  <text x="${(X_LONG + X_SHORT) / 2}" y="${y + 24}" text-anchor="middle" class="step">${label}</text>
  <rect x="${X_LONG - wL}" y="${y}" width="${Math.max(2, wL)}" height="${BAR}" rx="3" fill="${PALETTE.secondary}"/>
  <rect x="${X_SHORT}" y="${y}" width="${Math.max(2, wS)}" height="${BAR}" rx="3" fill="${PALETTE.primary}"/>
  <text x="${X_LONG - wL - 14}" y="${y + 25}" text-anchor="end" class="num" fill="${PALETTE.secondary}">${a}</text>
  <text x="${X_SHORT + wS + 14}" y="${y + 25}" class="num" fill="${PALETTE.primary}">${c}</text>`;
}).join("");

const takenList = D.taken.map((p) => p.symbol.replace(/USDT$/, "")).join(" · ") || "nothing";

process.stdout.write(`<!doctype html><meta charset="utf-8">
<style>
  html,body{margin:0;width:${CARD.width}px;height:${CARD.height}px;overflow:hidden;background:${SURFACE}}
  svg{display:block}
  text{font-family:"DejaVu Sans",system-ui,sans-serif;fill:${INK.primary}}
  .kicker{font-size:19px;letter-spacing:3.5px;fill:${BRAND};font-weight:700}
  .title{font-size:40px;font-weight:800;letter-spacing:-0.5px}
  .sub{font-size:17px;fill:${INK.secondary}}
  .step{font-size:14px;fill:${INK.muted}}
  .num{font-size:20px;font-weight:800}
  .side{font-size:19px;font-weight:800}
  .stat{font-size:22px;font-weight:700}
  .statlab{font-size:15px;fill:${INK.muted}}
  .mark{font-size:17px;font-weight:700;fill:${BRAND};letter-spacing:1px}
</style>
<svg width="${CARD.width}" height="${CARD.height}" viewBox="0 0 ${CARD.width} ${CARD.height}" xmlns="http://www.w3.org/2000/svg">
  <rect width="${CARD.width}" height="${CARD.height}" fill="${SURFACE}"/>
  <rect x="0" y="0" width="${CARD.width}" height="4" fill="${PALETTE.primary}"/>

  <text x="${CARD.margin}" y="${CARD.kickerY}" class="kicker">HOW IS THE MARKET · WHAT DO WE DO · ${D.day}</text>
  <text x="${CARD.right}" y="${CARD.kickerY}" text-anchor="end" class="mark">MAIX8</text>

  <text x="${CARD.margin}" y="${CARD.titleY[0]}" class="title">${b.upSharePct.toFixed(0)}% of the market is green.</text>
  <text x="${CARD.margin}" y="${CARD.titleY[1]}" class="title">${D.taken.length} position${D.taken.length === 1 ? "" : "s"} clear${D.taken.length === 1 ? "s" : ""} the filters.</text>
  <text x="${CARD.margin}" y="${CARD.subY}" class="sub">${b.pairs} pairs · board of ${D.tally.total} · geometry fixed at ${r.stopAtr} ATR and ${r.rewardRatio}:1, not optimised</text>

  <text x="${X_LONG - 14}" y="${TOP - 14}" text-anchor="end" class="side" fill="${PALETTE.secondary}">LONG</text>
  <text x="${X_SHORT + 14}" y="${TOP - 14}" class="side" fill="${PALETTE.primary}">SHORT</text>

  ${rows}

  <line x1="${CARD.margin}" x2="${CARD.right}" y1="${CARD.footRuleY}" y2="${CARD.footRuleY}" stroke="${INK.rule}" stroke-width="1"/>
  <text x="${CARD.margin}" y="${CARD.statY}" class="stat">${takenList}</text>
  <text x="${CARD.margin}" y="${CARD.statLabelY}" class="statlab">Taken today, at a geometry nobody chose</text>

  <text x="720" y="${CARD.statY}" class="stat">${D.settledSummary ? `${D.settledSummary.aheadCount}/${D.settledSummary.positions}` : "—"}</text>
  <text x="720" y="${CARD.statLabelY}" class="statlab">Yesterday's, ahead so far</text>

  <text x="${CARD.right}" y="${CARD.statY}" text-anchor="end" class="stat">${b.downOver10}</text>
  <text x="${CARD.right}" y="${CARD.statLabelY}" text-anchor="end" class="statlab">Pairs down over 10%</text>
</svg>`);
