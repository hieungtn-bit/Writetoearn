/**
 * Column card for post 82 — the funnel, drawn as two collapsing columns.
 *
 * The recommendation is four shorts, but the finding is the shape of the
 * filter: a board split evenly between long and short admits six shorts and no
 * longs once evidence is required. Two funnels side by side say that in a
 * glance, and the long column ending at zero is the whole argument.
 *
 * Bars are drawn from a common scale rather than each normalised to its own
 * top, so the two sides can be compared at every step — normalising each
 * column separately would hide that the long side starts level and ends empty.
 *
 *   node scripts/cover-market-call.mjs > media/market-call.html
 *   node scripts/render-card.mjs media/market-call.html media/market-call.png
 */

import { readFileSync } from "node:fs";
import { BRAND, CARD, INK, PALETTE, SURFACE } from "../src/palette.mjs";

const M = JSON.parse(readFileSync("research/market-call.json", "utf8"));
const B = JSON.parse(readFileSync("site/signals.json", "utf8"));

const funnel = (bias) => {
  const set = B.signals.filter((s) => s.bias === bias);
  const tradeable = set.filter((s) => s.tradeable);
  const notThin = tradeable.filter((s) => s.confidence && s.confidence.effectiveN >= M.rules.minEffectiveN);
  const unanimous = notThin.filter((s) => s.agreement?.windows === 5 && s.agreement.agreeing === 5);
  return [set.length, tradeable.length, notThin.length, unanimous.length];
};
const long = funnel("LONG"), short = funnel("SHORT");
const STEPS = ["on the board", "liquid enough", "sample not thin", "all 5 windows agree"];

const MAX_W = 300, X_LONG = 470, X_SHORT = 700, TOP = 262, STEP = 58, BAR = 34;
const scale = Math.max(...long, ...short);

const rows = STEPS.map((label, i) => {
  const y = TOP + i * STEP;
  const wL = (long[i] / scale) * MAX_W, wS = (short[i] / scale) * MAX_W;
  return `
  <text x="${(X_LONG + X_SHORT) / 2}" y="${y + 23}" text-anchor="middle" class="step">${label}</text>
  <rect x="${X_LONG - wL}" y="${y}" width="${Math.max(2, wL)}" height="${BAR}" rx="3" fill="${PALETTE.secondary}"/>
  <rect x="${X_SHORT}" y="${y}" width="${Math.max(2, wS)}" height="${BAR}" rx="3" fill="${PALETTE.primary}"/>
  <text x="${X_LONG - wL - 14}" y="${y + 24}" text-anchor="end" class="num" fill="${PALETTE.secondary}">${long[i]}</text>
  <text x="${X_SHORT + wS + 14}" y="${y + 24}" class="num" fill="${PALETTE.primary}">${short[i]}</text>`;
}).join("");

process.stdout.write(`<!doctype html><meta charset="utf-8">
<style>
  html,body{margin:0;width:${CARD.width}px;height:${CARD.height}px;overflow:hidden;background:${SURFACE}}
  svg{display:block}
  text{font-family:"DejaVu Sans",system-ui,sans-serif;fill:${INK.primary}}
  .kicker{font-size:19px;letter-spacing:3.5px;fill:${BRAND};font-weight:700}
  .title{font-size:40px;font-weight:800;letter-spacing:-0.5px}
  .sub{font-size:17px;fill:${INK.secondary}}
  .step{font-size:14px;fill:${INK.muted}}
  .num{font-size:21px;font-weight:800}
  .side{font-size:20px;font-weight:800}
  .stat{font-size:22px;font-weight:700}
  .statlab{font-size:15px;fill:${INK.muted}}
  .mark{font-size:17px;font-weight:700;fill:${BRAND};letter-spacing:1px}
</style>
<svg width="${CARD.width}" height="${CARD.height}" viewBox="0 0 ${CARD.width} ${CARD.height}" xmlns="http://www.w3.org/2000/svg">
  <rect width="${CARD.width}" height="${CARD.height}" fill="${SURFACE}"/>
  <rect x="0" y="0" width="${CARD.width}" height="4" fill="${PALETTE.primary}"/>

  <text x="${CARD.margin}" y="${CARD.kickerY}" class="kicker">SCANNED, THEN FILTERED BY WHAT SURVIVED TESTING</text>
  <text x="${CARD.right}" y="${CARD.kickerY}" text-anchor="end" class="mark">MAIX8</text>

  <text x="${CARD.margin}" y="${CARD.titleY[0]}" class="title">The board is split 46 to 46.</text>
  <text x="${CARD.margin}" y="${CARD.titleY[1]}" class="title">Four shorts survive. No longs.</text>
  <text x="${CARD.margin}" y="${CARD.subY}" class="sub">${M.breadth.pairs} pairs on the exchange · ${M.breadth.upSharePct.toFixed(0)}% green · geometry fixed at ${M.rules.stopAtr} ATR, not optimised</text>

  <text x="${X_LONG - 14}" y="${TOP - 16}" text-anchor="end" class="side" fill="${PALETTE.secondary}">LONG</text>
  <text x="${X_SHORT + 14}" y="${TOP - 16}" class="side" fill="${PALETTE.primary}">SHORT</text>

  ${rows}

  <line x1="${CARD.margin}" x2="${CARD.right}" y1="${CARD.footRuleY}" y2="${CARD.footRuleY}" stroke="${INK.rule}" stroke-width="1"/>
  <text x="${CARD.margin}" y="${CARD.statY}" class="stat">${M.recommended.length}</text>
  <text x="${CARD.margin}" y="${CARD.statLabelY}" class="statlab">Positions I would take, all short</text>

  <text x="560" y="${CARD.statY}" class="stat">+${M.shorts.medianFullNetR.toFixed(3)}R</text>
  <text x="560" y="${CARD.statLabelY}" class="statlab">Median edge after fees — yes, that small</text>

  <text x="${CARD.right}" y="${CARD.statY}" text-anchor="end" class="stat">${M.rejected.length}</text>
  <text x="${CARD.right}" y="${CARD.statLabelY}" text-anchor="end" class="statlab">Cut at the final test</text>
</svg>`);
