/**
 * Column card for post 80 — five overhead bands that all land on the baseline.
 *
 * The finding is an absence, which is hard to draw. A bar chart of the five
 * bands' distance from baseline shows it directly: five stubs either side of a
 * zero line, none of them reaching anywhere. The reader's eye looks for the
 * pattern and does not find one, which is the point.
 *
 * The axis is deliberately scaled to a full percentage point rather than to
 * the data. Scaling to the largest bar would inflate a 0.8-point difference
 * into a dramatic-looking chart and argue the opposite of the post.
 *
 *   node scripts/cover-overhead.mjs > media/overhead.html
 *   node scripts/render-card.mjs media/overhead.html media/overhead.png
 */

import { readFileSync } from "node:fs";
import { BRAND, CARD, INK, PALETTE, SURFACE } from "../src/palette.mjs";

const O = JSON.parse(readFileSync("research/overhead-test.json", "utf8"));

/** The largest distance from baseline any band manages, at either horizon. */
const widestGap = Math.max(...O.bands.flatMap((b) => O.horizons.map((h) => Math.abs(b.forward[h].differencePct))));

/** A full point either way, fixed, so an absence cannot be drawn as a signal. */
const SCALE = 1;
const ZERO = 400, MAX_H = 118, X0 = 148, STEP = 200, BAR = 128;

const bars = O.bands.map((b, i) => {
  const x = X0 + i * STEP;
  const v = b.forward[10].differencePct;
  const h = Math.max(3, (Math.abs(v) / SCALE) * MAX_H);
  const up = v > 0;
  const y = up ? ZERO - h : ZERO;
  const fill = up ? PALETTE.secondary : PALETTE.primary;
  return `
  <text x="${x + BAR / 2}" y="248" text-anchor="middle" class="lab">${b.band[0]}–${b.band[1]}%</text>
  <text x="${x + BAR / 2}" y="269" text-anchor="middle" class="note">${b.sharePct.toFixed(0)}% of days</text>
  <rect x="${x}" y="${y}" width="${BAR}" height="${h}" rx="3" fill="${fill}"/>
  <text x="${x + BAR / 2}" y="${up ? y - 12 : ZERO + h + 26}" text-anchor="middle" class="val" fill="${fill}">${v >= 0 ? "+" : ""}${v.toFixed(2)}</text>`;
}).join("");

process.stdout.write(`<!doctype html><meta charset="utf-8">
<style>
  html,body{margin:0;width:${CARD.width}px;height:${CARD.height}px;overflow:hidden;background:${SURFACE}}
  svg{display:block}
  text{font-family:"DejaVu Sans",system-ui,sans-serif;fill:${INK.primary}}
  .kicker{font-size:19px;letter-spacing:3.5px;fill:${BRAND};font-weight:700}
  .title{font-size:40px;font-weight:800;letter-spacing:-0.5px}
  .sub{font-size:17px;fill:${INK.secondary}}
  .lab{font-size:20px;font-weight:800}
  .note{font-size:13px;fill:${INK.muted}}
  .val{font-size:17px;font-weight:700}
  .axis{font-size:14px;fill:${INK.muted}}
  .stat{font-size:22px;font-weight:700}
  .statlab{font-size:15px;fill:${INK.muted}}
  .mark{font-size:17px;font-weight:700;fill:${BRAND};letter-spacing:1px}
</style>
<svg width="${CARD.width}" height="${CARD.height}" viewBox="0 0 ${CARD.width} ${CARD.height}" xmlns="http://www.w3.org/2000/svg">
  <rect width="${CARD.width}" height="${CARD.height}" fill="${SURFACE}"/>
  <rect x="0" y="0" width="${CARD.width}" height="4" fill="${PALETTE.primary}"/>

  <text x="${CARD.margin}" y="${CARD.kickerY}" class="kicker">THE NUMBER I QUOTE IN EVERY POST</text>
  <text x="${CARD.right}" y="${CARD.kickerY}" text-anchor="end" class="mark">MAIX8</text>

  <text x="${CARD.margin}" y="${CARD.titleY[0]}" class="title">Trapped supply overhead</text>
  <text x="${CARD.margin}" y="${CARD.titleY[1]}" class="title">predicts nothing at all.</text>
  <text x="${CARD.margin}" y="${CARD.subY}" class="sub">10-day return vs the same universe's baseline · ${O.pairs} pairs · ${O.labelledDays.toLocaleString("en-US")} labelled days</text>

  <line x1="${CARD.margin}" x2="${CARD.right}" y1="${ZERO}" y2="${ZERO}" stroke="${INK.rule}" stroke-width="1"/>
  <text x="${CARD.margin}" y="302" class="axis">line = baseline · axis fixed at ±1 point</text>

  ${bars}

  <line x1="${CARD.margin}" x2="${CARD.right}" y1="${CARD.footRuleY}" y2="${CARD.footRuleY}" stroke="${INK.rule}" stroke-width="1"/>
  <text x="${CARD.margin}" y="${CARD.statY}" class="stat">${O.trades.lowOverheadLong.medianNetR.toFixed(3)}R</text>
  <text x="${CARD.margin}" y="${CARD.statLabelY}" class="statlab">Buying the state I called bullish</text>

  <text x="600" y="${CARD.statY}" class="stat">${O.bands[4].sharePct.toFixed(0)}%</text>
  <text x="600" y="${CARD.statLabelY}" class="statlab">Of days sit in the top band</text>

  <text x="${CARD.right}" y="${CARD.statY}" text-anchor="end" class="stat">${widestGap.toFixed(2)} pt</text>
  <text x="${CARD.right}" y="${CARD.statLabelY}" text-anchor="end" class="statlab">Widest gap any band shows</text>
</svg>`);
