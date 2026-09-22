/**
 * Column card for post 77 — the subtraction that kills the detector.
 *
 * The post has one arithmetic step at its centre: a real gross edge, a larger
 * fee, and what is left. A waterfall says that faster than any table — the
 * middle column is visibly taller than the first, so the third has nowhere to
 * go but below the line.
 *
 * The gross bar is drawn in the gain colour rather than greyed out, because
 * the finding is not that the detector failed. It found something. It found
 * something worth less than the toll.
 *
 *   node scripts/cover-detector.mjs > media/detector.html
 *   node scripts/render-card.mjs media/detector.html media/detector.png
 */

import { readFileSync } from "node:fs";
import { BRAND, CARD, INK, PALETTE, SURFACE } from "../src/palette.mjs";

const C = JSON.parse(readFileSync("research/detector-costs.json", "utf8"));
const M = JSON.parse(readFileSync("research/momentum-backtest.json", "utf8"));
const base = M.results["z3 · move 0.5-6%"];
const g = C.bestGross;

const steps = [
  { label: "what it earns", sub: "gross edge per trade", v: g.expectancyR, up: true },
  { label: "what it costs", sub: `0.2% round trip ÷ ${g.stopPct}% stop`, v: -g.feeR, up: false },
  { label: "what you keep", sub: "after fees", v: g.netR, up: false },
];

/**
 * One label band for all three columns, below the deepest bar.
 *
 * Anchoring each label to its own bar end put the first column's caption into
 * the card subtitle and the second column's into the footer rule. A shared
 * band cannot collide with either, and it reads as a row rather than three
 * captions at three heights.
 */
const ZERO = 300, MAX_H = 120, X0 = 168, STEP = 336, BAR = 176;
const LABEL_Y = 496;
const scale = Math.max(...steps.map((s) => Math.abs(s.v)));
const height = (v) => Math.max(6, (Math.abs(v) / scale) * MAX_H);

const bars = steps.map((s, i) => {
  const x = X0 + i * STEP;
  const h = height(s.v);
  const up = s.v > 0;
  const y = up ? ZERO - h : ZERO;
  const fill = up ? PALETTE.secondary : PALETTE.primary;
  const valY = up ? y - 16 : ZERO + h + 30;
  return `
  <rect x="${x}" y="${y}" width="${BAR}" height="${h}" rx="4" fill="${fill}"/>
  <text x="${x + BAR / 2}" y="${valY}" text-anchor="middle" class="val" fill="${fill}">${s.v >= 0 ? "+" : ""}${s.v.toFixed(3)}R</text>
  <text x="${x + BAR / 2}" y="${LABEL_Y}" text-anchor="middle" class="lab">${s.label}</text>
  <text x="${x + BAR / 2}" y="${LABEL_Y + 21}" text-anchor="middle" class="note">${s.sub}</text>`;
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

  <text x="${CARD.margin}" y="${CARD.kickerY}" class="kicker">BUILT IT. MEASURED IT. NOT SHIPPING IT.</text>
  <text x="${CARD.right}" y="${CARD.kickerY}" text-anchor="end" class="mark">MAIX8</text>

  <text x="${CARD.margin}" y="${CARD.titleY[0]}" class="title">The early detector works.</text>
  <text x="${CARD.margin}" y="${CARD.titleY[1]}" class="title">The fee is ${g.feeToEdgeRatio.toFixed(1)} times the edge.</text>
  <text x="${CARD.margin}" y="${CARD.subY}" class="sub">Best of ${C.cellsTested} configurations · ${M.pairs} pairs · hourly bars · Binance spot fees</text>

  <line x1="${CARD.margin}" x2="${CARD.right}" y1="${ZERO}" y2="${ZERO}" stroke="${INK.rule}" stroke-width="1"/>

  ${bars}

  <line x1="${CARD.margin}" x2="${CARD.right}" y1="${CARD.footRuleY}" y2="${CARD.footRuleY}" stroke="${INK.rule}" stroke-width="1"/>
  <text x="${CARD.margin}" y="${CARD.statY}" class="stat">${base.cellsBeatingBaseline} / ${base.cells}</text>
  <text x="${CARD.margin}" y="${CARD.statLabelY}" class="statlab">Settings that beat baseline, before fees</text>

  <text x="560" y="${CARD.statY}" class="stat">${C.survivingCells} / ${C.cellsTested}</text>
  <text x="560" y="${CARD.statLabelY}" class="statlab">Settings still positive, after fees</text>

  <text x="${CARD.right}" y="${CARD.statY}" text-anchor="end" class="stat">${Math.round(C.expectedByChance)}</text>
  <text x="${CARD.right}" y="${CARD.statLabelY}" text-anchor="end" class="statlab">Winners chance alone would give</text>
</svg>`);
