/**
 * Column card for post 75 — what you sit through against what you collect.
 *
 * The post's decisive number is a ratio, and a ratio drawn as two opposing
 * bars from a shared centre reads instantly: the fall is longer than the rise.
 * Everything else in the post supports that one comparison, so the card shows
 * only it, with the same pair drawn for an ordinary day underneath as the
 * control.
 *
 *   node scripts/cover-bnb-ceiling.mjs > media/bnb-ceiling.html
 *   node scripts/render-card.mjs media/bnb-ceiling.html media/bnb-ceiling.png
 */

import { readFileSync } from "node:fs";
import { BRAND, CARD, INK, PALETTE, SURFACE } from "../src/palette.mjs";
import { count, pct, price as fmtPrice } from "../src/format.mjs";

const B = JSON.parse(readFileSync("research/bnb-deep.json", "utf8"));
const p = B.path;

const DOWN = PALETTE.primary, UP = PALETTE.secondary;
const MID = 640, HALF = 430, TOP = 268, ROW = 118, BAR = 46;

const scale = Math.max(Math.abs(p.medianDrawdownPct), p.medianRisePct, Math.abs(p.baselineDrawdownPct));
const len = (v) => (Math.abs(v) / scale) * HALF;

const band = (label, y, drop, rise, dim) => `
  <text x="${MID}" y="${y - 14}" text-anchor="middle" class="lbl">${label}</text>
  <rect x="${MID - len(drop)}" y="${y}" width="${len(drop)}" height="${BAR}" rx="5"
        fill="${DOWN}" fill-opacity="${dim ? 0.35 : 1}"/>
  <text x="${MID - len(drop) - 14}" y="${y + 31}" text-anchor="end" class="val" fill="${DOWN}">${pct(drop)}%</text>
  ${rise == null ? "" : `
  <rect x="${MID}" y="${y}" width="${len(rise)}" height="${BAR}" rx="5" fill="${UP}"/>
  <text x="${MID + len(rise) + 14}" y="${y + 31}" class="val" fill="${UP}">+${pct(rise)}%</text>`}`;

process.stdout.write(`<!doctype html><meta charset="utf-8">
<style>
  html,body{margin:0;width:${CARD.width}px;height:${CARD.height}px;overflow:hidden;background:${SURFACE}}
  svg{display:block}
  text{font-family:"DejaVu Sans",system-ui,sans-serif;fill:${INK.primary}}
  .kicker{font-size:19px;letter-spacing:3.5px;fill:${BRAND};font-weight:700}
  .title{font-size:41px;font-weight:800;letter-spacing:-0.5px}
  .sub{font-size:17px;fill:${INK.secondary}}
  .lbl{font-size:16px;font-weight:700;fill:${INK.secondary}}
  .val{font-size:20px;font-weight:800}
  .stat{font-size:22px;font-weight:700}
  .statlab{font-size:15px;fill:${INK.muted}}
  .mark{font-size:17px;font-weight:700;fill:${BRAND};letter-spacing:1px}
</style>
<svg width="${CARD.width}" height="${CARD.height}" viewBox="0 0 ${CARD.width} ${CARD.height}" xmlns="http://www.w3.org/2000/svg">
  <rect width="${CARD.width}" height="${CARD.height}" fill="${SURFACE}"/>
  <rect x="0" y="0" width="${CARD.width}" height="4" fill="${PALETTE.primary}"/>

  <text x="${CARD.margin}" y="${CARD.kickerY}" class="kicker">BNB · TEN DAYS FROM HERE</text>
  <text x="${CARD.right}" y="${CARD.kickerY}" text-anchor="end" class="mark">MAIX8</text>

  <text x="${CARD.margin}" y="${CARD.titleY[0]}" class="title">It tried ${fmtPrice(B.range30.high)} and closed ${fmtPrice(B.highDay.close)}.</text>
  <text x="${CARD.margin}" y="${CARD.titleY[1]}" class="title">From here you sit through more than you collect.</text>
  <text x="${CARD.margin}" y="${CARD.subY}" class="sub">Median deepest fall and highest rise over the next ten days, from ${pct(B.rangePosition30d)}% of the 30-day range</text>

  <line x1="${MID}" x2="${MID}" y1="${TOP - 26}" y2="${TOP + ROW + BAR + 12}" stroke="${INK.rule}" stroke-width="2"/>

  ${band("from a day like today", TOP, p.medianDrawdownPct, p.medianRisePct, false)}
  ${band("from an ordinary day", TOP + ROW, p.baselineDrawdownPct, null, true)}

  <line x1="${CARD.margin}" x2="${CARD.right}" y1="${CARD.footRuleY}" y2="${CARD.footRuleY}" stroke="${INK.rule}" stroke-width="1"/>
  <text x="${CARD.margin}" y="${CARD.statY}" class="stat">${pct(p.painToGain)}</text>
  <text x="${CARD.margin}" y="${CARD.statLabelY}" class="statlab">Pain to gain — the wrong way round</text>

  <text x="480" y="${CARD.statY}" class="stat">${count(B.closesAboveZoneLast30)} of 30</text>
  <text x="480" y="${CARD.statLabelY}" class="statlab">Days closing above ${B.zone[1]}</text>

  <text x="820" y="${CARD.statY}" class="stat">${pct(B.overheadPct)}%</text>
  <text x="820" y="${CARD.statLabelY}" class="statlab">Trapped overhead</text>

  <text x="${CARD.right}" y="${CARD.statY}" text-anchor="end" class="stat">${count(B.call.agreeing)}/${count(B.call.windows)}</text>
  <text x="${CARD.right}" y="${CARD.statLabelY}" text-anchor="end" class="statlab">Lookbacks agree</text>
</svg>`);
