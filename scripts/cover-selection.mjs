/**
 * Column card for post 88 — the ladder that is not a ladder.
 *
 * The whole finding is a shape. If ranking worked, five bars ordered by past
 * relative weakness would step down from left to right, and a reader would see
 * it without being told. They do not: the fourth bar rises above the third, and
 * that single kink is the argument.
 *
 * So the card draws the five groups in rank order and adds one horizontal line
 * for the take-everything result. Bars above the line are groups a watchlist
 * would keep; bars below it are groups it would keep too, on some days, because
 * the ordering is not stable. Nothing is coloured by whether it beat the line,
 * because colouring by outcome is how a noisy table starts looking decisive.
 *
 *   node scripts/cover-selection.mjs > media/selection.html
 *   node scripts/render-card.mjs media/selection.html media/selection.png
 */

import { readFileSync } from "node:fs";
import { BRAND, CARD, INK, PALETTE, SURFACE } from "../src/palette.mjs";

const C = JSON.parse(readFileSync("research/cross-section.json", "utf8"));
const G = C.byGroup, A = C.allAlts;

const SHORT_LABELS = ["weakest", "weak", "middle", "strong", "strongest"];

const BASE_Y = 470, MAX_H = 160, X0 = 96, STEP = 208, BAR = 152;
const scale = Math.max(...G.map((g) => g.meanNetR), A.meanNetR);
const h = (v) => Math.max(6, (v / scale) * MAX_H);
const allY = BASE_Y - h(A.meanNetR);

const bars = G.map((g, i) => {
  const x = X0 + i * STEP;
  const bh = h(g.meanNetR);
  const y = BASE_Y - bh;
  return `
  <rect x="${x}" y="${y}" width="${BAR}" height="${bh}" rx="4" fill="${PALETTE.primary}"/>
  <text x="${x + BAR / 2}" y="${y + 34}" text-anchor="middle" class="val" fill="${SURFACE}">${g.meanNetR.toFixed(3)}</text>
  <text x="${x + BAR / 2}" y="${y + 56}" text-anchor="middle" class="tstat" fill="${SURFACE}">t ${g.tStatByMonth.toFixed(2)}</text>
  <text x="${x + BAR / 2}" y="${BASE_Y + 32}" text-anchor="middle" class="lab">${SHORT_LABELS[i]}</text>`;
}).join("");

process.stdout.write(`<!doctype html><meta charset="utf-8">
<style>
  html,body{margin:0;width:${CARD.width}px;height:${CARD.height}px;overflow:hidden;background:${SURFACE}}
  svg{display:block}
  text{font-family:"DejaVu Sans",system-ui,sans-serif;fill:${INK.primary}}
  .kicker{font-size:19px;letter-spacing:3.5px;fill:${BRAND};font-weight:700}
  .title{font-size:40px;font-weight:800;letter-spacing:-0.5px}
  .sub{font-size:17px;fill:${INK.secondary}}
  .lab{font-size:18px;font-weight:800}
  .axis{font-size:14px;fill:${INK.muted}}
  .val{font-size:22px;font-weight:800}
  .tstat{font-size:14px;fill:${INK.secondary};font-weight:700}
  .rule{font-size:15px;font-weight:700;fill:${INK.secondary}}
  .stat{font-size:22px;font-weight:700}
  .statlab{font-size:15px;fill:${INK.muted}}
  .mark{font-size:17px;font-weight:700;fill:${BRAND};letter-spacing:1px}
</style>
<svg width="${CARD.width}" height="${CARD.height}" viewBox="0 0 ${CARD.width} ${CARD.height}" xmlns="http://www.w3.org/2000/svg">
  <rect width="${CARD.width}" height="${CARD.height}" fill="${SURFACE}"/>
  <rect x="0" y="0" width="${CARD.width}" height="4" fill="${PALETTE.primary}"/>

  <text x="${CARD.margin}" y="${CARD.kickerY}" class="kicker">THE WATCHLIST QUESTION, MEASURED</text>
  <text x="${CARD.right}" y="${CARD.kickerY}" text-anchor="end" class="mark">MAIX8</text>

  <text x="${CARD.margin}" y="${CARD.titleY[0]}" class="title">Shorting alts against BTC works.</text>
  <text x="${CARD.margin}" y="${CARD.titleY[1]}" class="title">Picking which ones does not.</text>
  <text x="${CARD.margin}" y="${CARD.subY}" class="sub">${C.pairs} alts ranked on trailing strength vs BTC · ${C.rebalances} non-overlapping rebalances · identical geometry · t per month</text>
  <text x="${CARD.margin}" y="${CARD.subY + 26}" class="sub">If ranking worked, these five bars would step down. The fourth one does not.</text>

  <line x1="${CARD.margin}" x2="${CARD.right}" y1="${BASE_Y}" y2="${BASE_Y}" stroke="${INK.rule}" stroke-width="1"/>
  <line x1="${CARD.margin}" x2="${CARD.right}" y1="${allY}" y2="${allY}"
        stroke="${INK.secondary}" stroke-width="1.5" stroke-dasharray="7 5"/>
  <text x="${CARD.right}" y="${allY - 12}" text-anchor="end" class="rule">take everything · ${A.meanNetR.toFixed(3)}R</text>

  ${bars}

  <text x="${CARD.margin}" y="${BASE_Y + 56}" class="axis">ranked by how each alt has already done against BTC — weakest on the left</text>

  <line x1="${CARD.margin}" x2="${CARD.right}" y1="${CARD.footRuleY}" y2="${CARD.footRuleY}" stroke="${INK.rule}" stroke-width="1"/>
  <text x="${CARD.margin}" y="${CARD.statY}" class="stat">t = ${C.spread.welchTByMonth.toFixed(2)}</text>
  <text x="${CARD.margin}" y="${CARD.statLabelY}" class="statlab">Weakest vs strongest — cannot be told from luck</text>

  <text x="556" y="${CARD.statY}" class="stat">${C.byGroup.filter((g) => g.meanNetR > 0).length} of ${C.byGroup.length}</text>
  <text x="556" y="${CARD.statLabelY}" class="statlab">Groups positive, discard included</text>

  <text x="${CARD.right}" y="${CARD.statY}" text-anchor="end" class="stat">+${C.bestGroupOverAllR.toFixed(3)}R</text>
  <text x="${CARD.right}" y="${CARD.statLabelY}" text-anchor="end" class="statlab">Best group — chosen after looking</text>
</svg>`);
