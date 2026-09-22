/**
 * Column card for post 74 — how a gainer performs by its rank.
 *
 * The post's real finding is not "gainers fall" but that the effect scales
 * with rank: the group of ten is ordinary, the single top name is not. So the
 * card draws exactly that contrast — two bars against the same baseline —
 * because a reader who takes only the picture should take the nuance, not the
 * slogan.
 *
 *   node scripts/cover-gainers.mjs > media/gainers.html
 *   node scripts/render-card.mjs media/gainers.html media/gainers.png
 */

import { readFileSync } from "node:fs";
import { BRAND, CARD, INK, PALETTE, SURFACE } from "../src/palette.mjs";
import { pct } from "../src/format.mjs";

const G = JSON.parse(readFileSync("research/gainers-study.json", "utf8"));
const M = JSON.parse(readFileSync("research/today-market.json", "utf8"));
const at = (h) => G.table.find((r) => r.holdDays === h);
const solo = (h) => G.biggestGainer.find((r) => r.holdDays === h);

const BAD = PALETTE.primary, MILD = PALETTE.secondary;
const HOLDS = [1, 3, 7, 14];

const X0 = 300, W = 620, TOP = 232, STEP = 76, BAR = 24, GAP = 5;
const worst = Math.abs(Math.min(...HOLDS.map((h) => solo(h).medianPct)));
const len = (v) => (Math.abs(v) / worst) * W;

const rows = HOLDS.map((h, i) => {
  const y = TOP + i * STEP;
  const g = at(h).gainersMedianPct, s = solo(h).medianPct;
  return `
  <text x="${X0 - 24}" y="${y + 20}" text-anchor="end" class="hold">${h} day${h > 1 ? "s" : ""}</text>

  <rect x="${X0}" y="${y}" width="${Math.max(3, len(g))}" height="${BAR}" rx="4" fill="${MILD}"/>
  <text x="${X0 + Math.max(3, len(g)) + 12}" y="${y + 19}" class="val" fill="${MILD}">${pct(g)}%  top ten</text>

  <rect x="${X0}" y="${y + BAR + GAP}" width="${Math.max(3, len(s))}" height="${BAR}" rx="4" fill="${BAD}"/>
  <text x="${X0 + Math.max(3, len(s)) + 12}" y="${y + BAR + GAP + 19}" class="val" fill="${BAD}">${pct(s)}%  the single biggest</text>`;
}).join("");

process.stdout.write(`<!doctype html><meta charset="utf-8">
<style>
  html,body{margin:0;width:${CARD.width}px;height:${CARD.height}px;overflow:hidden;background:${SURFACE}}
  svg{display:block}
  text{font-family:"DejaVu Sans",system-ui,sans-serif;fill:${INK.primary}}
  .kicker{font-size:19px;letter-spacing:3.5px;fill:${BRAND};font-weight:700}
  .title{font-size:40px;font-weight:800;letter-spacing:-0.5px}
  .sub{font-size:17px;fill:${INK.secondary}}
  .hold{font-size:20px;font-weight:800}
  .val{font-size:15px;font-weight:700}
  .stat{font-size:22px;font-weight:700}
  .statlab{font-size:15px;fill:${INK.muted}}
  .mark{font-size:17px;font-weight:700;fill:${BRAND};letter-spacing:1px}
</style>
<svg width="${CARD.width}" height="${CARD.height}" viewBox="0 0 ${CARD.width} ${CARD.height}" xmlns="http://www.w3.org/2000/svg">
  <rect width="${CARD.width}" height="${CARD.height}" fill="${SURFACE}"/>
  <rect x="0" y="0" width="${CARD.width}" height="4" fill="${PALETTE.primary}"/>

  <text x="${CARD.margin}" y="${CARD.kickerY}" class="kicker">IT DEPENDS HOW HIGH UP THE LIST</text>
  <text x="${CARD.right}" y="${CARD.kickerY}" text-anchor="end" class="mark">MAIX8</text>

  <text x="${CARD.margin}" y="${CARD.titleY[0]}" class="title">Buying the top ten gainers is ordinary.</text>
  <text x="${CARD.margin}" y="${CARD.titleY[1]}" class="title">Buying number one is not.</text>
  <text x="${CARD.margin}" y="${CARD.subY}" class="sub">Median return after buying at the close · ${G.pairsLoaded} pairs · ${G.daysUsed} days</text>

  ${rows}

  <line x1="${CARD.margin}" x2="${CARD.right}" y1="${CARD.footRuleY}" y2="${CARD.footRuleY}" stroke="${INK.rule}" stroke-width="1"/>
  <text x="${CARD.margin}" y="${CARD.statY}" class="stat">${pct(solo(14).upPct)}%</text>
  <text x="${CARD.margin}" y="${CARD.statLabelY}" class="statlab">Of the time the top gainer is higher two weeks on</text>

  <text x="640" y="${CARD.statY}" class="stat">${pct(at(7).differencePct)}</text>
  <text x="640" y="${CARD.statLabelY}" class="statlab">Top ten vs baseline at a week</text>

  <text x="${CARD.right}" y="${CARD.statY}" text-anchor="end" class="stat">${pct(M.upSharePct)}%</text>
  <text x="${CARD.right}" y="${CARD.statLabelY}" text-anchor="end" class="statlab">Of the market green</text>
</svg>`);
