/**
 * Column card for post 85 — the pipeline against rules with no thinking in them.
 *
 * The finding is a ranking, and the ranking is humiliating in a specific way:
 * the bar with all the machinery behind it sits below the bar with none. Five
 * bars on one axis says that without a sentence.
 *
 * Always-long is kept in the picture even though it is the worst, because it is
 * what stops the card being read as "short everything". Its loss is almost the
 * exact mirror of always-short's gain, and a reader who sees both understands
 * that the gap is the window rather than an edge.
 *
 *   node scripts/cover-self-backtest.mjs > media/self-backtest.html
 *   node scripts/render-card.mjs media/self-backtest.html media/self-backtest.png
 */

import { readFileSync } from "node:fs";
import { BRAND, CARD, INK, PALETTE, SURFACE } from "../src/palette.mjs";

const S = JSON.parse(readFileSync("research/self-backtest.json", "utf8"));
const r = S.results;

const bars = [
  { label: "the algorithm", sub: `${r.algorithm.trades} trades · every filter`, v: r.algorithm.meanNetR, hero: true },
  { label: "board only", sub: "direction, no filters", v: r.boardOnly.meanNetR, hero: false },
  { label: "coin flip", sub: "seeded random", v: r.coinFlip.meanNetR, hero: false },
  { label: "always short", sub: "no signal at all", v: r.alwaysShort.meanNetR, hero: false },
  { label: "always long", sub: "the mirror", v: r.alwaysLong.meanNetR, hero: false },
];

const ZERO = 396, MAX_H = 104, X0 = 108, STEP = 200, BAR = 150;
const scale = Math.max(...bars.map((b) => Math.abs(b.v)));

const rows = bars.map((b, i) => {
  const x = X0 + i * STEP;
  const h = Math.max(4, (Math.abs(b.v) / scale) * MAX_H);
  const up = b.v > 0;
  const y = up ? ZERO - h : ZERO;
  const fill = b.hero ? INK.primary : up ? PALETTE.secondary : PALETTE.primary;
  // A tall upward bar reaches its own caption, so its value goes inside it.
  const inside = up && h >= 60;
  const valY = inside ? y + 34 : up ? y - 14 : ZERO + h + 26;
  const valFill = inside ? SURFACE : fill;
  return `
  <text x="${x + BAR / 2}" y="262" text-anchor="middle" class="lab">${b.label}</text>
  <text x="${x + BAR / 2}" y="283" text-anchor="middle" class="note">${b.sub}</text>
  <rect x="${x}" y="${y}" width="${BAR}" height="${h}" rx="3" fill="${fill}"/>
  <text x="${x + BAR / 2}" y="${valY}" text-anchor="middle" class="val" fill="${valFill}">${b.v >= 0 ? "+" : ""}${b.v.toFixed(3)}</text>`;
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
  .note{font-size:13px;fill:${INK.muted}}
  .val{font-size:19px;font-weight:800}
  .axis{font-size:14px;fill:${INK.muted}}
  .stat{font-size:22px;font-weight:700}
  .statlab{font-size:15px;fill:${INK.muted}}
  .mark{font-size:17px;font-weight:700;fill:${BRAND};letter-spacing:1px}
</style>
<svg width="${CARD.width}" height="${CARD.height}" viewBox="0 0 ${CARD.width} ${CARD.height}" xmlns="http://www.w3.org/2000/svg">
  <rect width="${CARD.width}" height="${CARD.height}" fill="${SURFACE}"/>
  <rect x="0" y="0" width="${CARD.width}" height="4" fill="${PALETTE.primary}"/>

  <text x="${CARD.margin}" y="${CARD.kickerY}" class="kicker">I WALKED MY OWN ALGORITHM FORWARD</text>
  <text x="${CARD.right}" y="${CARD.kickerY}" text-anchor="end" class="mark">MAIX8</text>

  <text x="${CARD.margin}" y="${CARD.titleY[0]}" class="title">Four months of filters lost to</text>
  <text x="${CARD.margin}" y="${CARD.titleY[1]}" class="title">a rule with no thinking in it.</text>
  <text x="${CARD.margin}" y="${CARD.subY}" class="sub">Mean net R per trade · ${S.rebalances} non-overlapping rebalances · ${S.pairs} pairs · costs charged every time</text>

  <line x1="${CARD.margin}" x2="${CARD.right}" y1="${ZERO}" y2="${ZERO}" stroke="${INK.rule}" stroke-width="1"/>
  <text x="${CARD.margin}" y="522" class="axis">short and long are near-mirrors — that gap is the window, not an edge</text>

  ${rows}

  <line x1="${CARD.margin}" x2="${CARD.right}" y1="${CARD.footRuleY}" y2="${CARD.footRuleY}" stroke="${INK.rule}" stroke-width="1"/>
  <text x="${CARD.margin}" y="${CARD.statY}" class="stat">${(S.funnel.passedGeometry / S.funnel.considered * 100).toFixed(1)}%</text>
  <text x="${CARD.margin}" y="${CARD.statLabelY}" class="statlab">Of chances the filters acted on</text>

  <text x="620" y="${CARD.statY}" class="stat">t = ${r.algorithm.tStat.toFixed(2)}</text>
  <text x="620" y="${CARD.statLabelY}" class="statlab">No evidence it is good, or bad</text>

  <text x="${CARD.right}" y="${CARD.statY}" text-anchor="end" class="stat">${S.dates.filter((d) => d.taken === 0).length} of ${S.rebalances}</text>
  <text x="${CARD.right}" y="${CARD.statLabelY}" text-anchor="end" class="statlab">Rebalances that took nothing</text>
</svg>`);
