/**
 * Column card for post 76 — the shape of the stop-width curve.
 *
 * The post's finding is not "use a wide stop", it is that both ends of the
 * range lose and the middle is shallowest. A bar chart of one panel says that
 * in a glance where a sentence cannot: the columns are deep at half an ATR,
 * shallow at 1.5, and deep again at three.
 *
 * The 30-day long panel is drawn because it is the one that carries the
 * correction — it is the panel where a three-ATR stop scores worse than the
 * tight stop I spent months warning people about. Picking the panel that
 * flatters the old rule would defeat the purpose of the post.
 *
 *   node scripts/cover-stop-law.mjs > media/stop-law.html
 *   node scripts/render-card.mjs media/stop-law.html media/stop-law.png
 */

import { readFileSync } from "node:fs";
import { BRAND, CARD, INK, PALETTE, SURFACE } from "../src/palette.mjs";

const S = JSON.parse(readFileSync("research/stop-law.json", "utf8"));
const STOPS = [0.5, 0.75, 1, 1.5, 2, 3, 4];
const at = (h, d, a) => S.rows.find((r) => r.horizon === h && r.direction === d && r.stopAtr === a);

const panel = STOPS.map((a) => ({ stopAtr: a, e: at(30, "long", a).medianExpectancyR }));
const best = panel.reduce((a, b) => (a.e > b.e ? a : b));
const deepest = Math.abs(Math.min(...panel.map((p) => p.e)));

const ZERO = 262, MAX_H = 214, X0 = 276, STEP = 124, BAR = 86;
const height = (e) => Math.max(4, (Math.abs(e) / deepest) * MAX_H);

const bars = panel.map((p, i) => {
  const x = X0 + i * STEP;
  const h = height(p.e);
  const isBest = p.stopAtr === best.stopAtr;
  const fill = isBest ? PALETTE.secondary : PALETTE.primary;
  return `
  <text x="${x + BAR / 2}" y="${ZERO - 14}" text-anchor="middle" class="stop">${p.stopAtr}</text>
  <rect x="${x}" y="${ZERO}" width="${BAR}" height="${h}" rx="4" fill="${fill}"/>
  <text x="${x + BAR / 2}" y="${ZERO + h + 26}" text-anchor="middle" class="val" fill="${fill}">${p.e.toFixed(3)}</text>
  ${isBest ? `<text x="${x + BAR / 2}" y="${ZERO + h + 48}" text-anchor="middle" class="note">shallowest</text>` : ""}`;
}).join("");

process.stdout.write(`<!doctype html><meta charset="utf-8">
<style>
  html,body{margin:0;width:${CARD.width}px;height:${CARD.height}px;overflow:hidden;background:${SURFACE}}
  svg{display:block}
  text{font-family:"DejaVu Sans",system-ui,sans-serif;fill:${INK.primary}}
  .kicker{font-size:19px;letter-spacing:3.5px;fill:${BRAND};font-weight:700}
  .title{font-size:40px;font-weight:800;letter-spacing:-0.5px}
  .sub{font-size:17px;fill:${INK.secondary}}
  .stop{font-size:19px;font-weight:800}
  .val{font-size:16px;font-weight:700}
  .note{font-size:14px;fill:${INK.muted}}
  .axis{font-size:15px;fill:${INK.muted}}
  .stat{font-size:22px;font-weight:700}
  .statlab{font-size:15px;fill:${INK.muted}}
  .mark{font-size:17px;font-weight:700;fill:${BRAND};letter-spacing:1px}
</style>
<svg width="${CARD.width}" height="${CARD.height}" viewBox="0 0 ${CARD.width} ${CARD.height}" xmlns="http://www.w3.org/2000/svg">
  <rect width="${CARD.width}" height="${CARD.height}" fill="${SURFACE}"/>
  <rect x="0" y="0" width="${CARD.width}" height="4" fill="${PALETTE.primary}"/>

  <text x="${CARD.margin}" y="${CARD.kickerY}" class="kicker">I SAID IT SIX TIMES. I MEASURED IT ONCE.</text>
  <text x="${CARD.right}" y="${CARD.kickerY}" text-anchor="end" class="mark">MAIX8</text>

  <text x="${CARD.margin}" y="${CARD.titleY[0]}" class="title">A tighter stop is worse.</text>
  <text x="${CARD.margin}" y="${CARD.titleY[1]}" class="title">A wider stop is not better.</text>
  <text x="${CARD.margin}" y="${CARD.subY}" class="sub">Expectancy in R by stop width · longs held 30 days · ${S.pairs} pairs · ${S.historyDays} days</text>

  <line x1="${CARD.margin}" x2="${CARD.right}" y1="${ZERO}" y2="${ZERO}" stroke="${INK.rule}" stroke-width="1"/>
  <text x="${CARD.margin}" y="${ZERO - 14}" class="axis">stop, in daily ATR</text>
  <text x="${CARD.margin}" y="${ZERO + 22}" class="axis">every bar</text>
  <text x="${CARD.margin}" y="${ZERO + 44}" class="axis">a loss</text>

  ${bars}

  <line x1="${CARD.margin}" x2="${CARD.right}" y1="${CARD.footRuleY}" y2="${CARD.footRuleY}" stroke="${INK.rule}" stroke-width="1"/>
  <text x="${CARD.margin}" y="${CARD.statY}" class="stat">${at(30, "long", 0.5).medianStoppedPct.toFixed(0)}%</text>
  <text x="${CARD.margin}" y="${CARD.statLabelY}" class="statlab">Stopped out at half an ATR</text>

  <text x="560" y="${CARD.statY}" class="stat">${best.stopAtr} ATR</text>
  <text x="560" y="${CARD.statLabelY}" class="statlab">Best width in 3 of 4 panels tested</text>

  <text x="${CARD.right}" y="${CARD.statY}" text-anchor="end" class="stat">14 / 14</text>
  <text x="${CARD.right}" y="${CARD.statLabelY}" text-anchor="end" class="statlab">Long cells losing, at every width</text>
</svg>`);
