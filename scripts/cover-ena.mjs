/**
 * Column card for post 98 — the correlation that loses to its own control.
 *
 * The wrong card is ENA's r of 0.479 with a p-value beside it. It is the true
 * number and it would leave a reader believing the opposite of the post.
 *
 * So the card draws the control instead, ranked: five tokens with no
 * mechanical claim on funding, then ENA below them. The argument is the
 * ordering, and it needs no statistics — the token built on funding sits
 * beneath five that are not.
 *
 * ENA's bar is the only one in the fail colour, and the control average is
 * drawn as a reference line so a reader can see that ENA is above the crowd
 * while still losing to its top. Both facts belong on the card; leaving out
 * the average would overstate the case.
 *
 *   node scripts/cover-ena.mjs > media/ena.html
 *   node scripts/render-card.mjs media/ena.html media/ena.png
 */

import { readFileSync } from "node:fs";
import { BRAND, CARD, INK, PALETTE, ROLE, SURFACE } from "../src/palette.mjs";

const E = JSON.parse(readFileSync("research/ena.json", "utf8"));
const V = E.fundingVsPrice, C = E.control;

/** 33rd, not 33th. Teens are the exception that makes the naive rule wrong. */
const ordinal = (n) => {
  const v = Math.round(n), rem100 = v % 100, rem10 = v % 10;
  const suffix = rem100 >= 11 && rem100 <= 13 ? "th"
    : rem10 === 1 ? "st" : rem10 === 2 ? "nd" : rem10 === 3 ? "rd" : "th";
  return `${v}${suffix}`;
};

const ROWS = [
  ...C.highest.map((h) => ({ label: h.symbol.replace("USDT", ""), corr: h.corr, cls: "other" })),
  { label: "ENA", corr: V.corrWithVsBtcReturn, cls: "ena" },
];

const PLOT = { x: 250, y: 244, w: 720 };
const ROW_H = 42;
const maxCorr = Math.max(...ROWS.map((r) => r.corr), C.meanCorr) * 1.12;
const wFor = (v) => (v / maxCorr) * PLOT.w;

const rows = ROWS.map((r, i) => {
  const y = PLOT.y + i * ROW_H;
  const w = wFor(r.corr);
  return `
  <text x="${PLOT.x - 20}" y="${y + 22}" text-anchor="end" class="lab ${r.cls}">${r.label}</text>
  <rect x="${PLOT.x}" y="${y + 4}" width="${w.toFixed(1)}" height="26" rx="3" class="${r.cls}"/>
  <text x="${(PLOT.x + w + 14).toFixed(1)}" y="${y + 24}" class="val ${r.cls}">+${r.corr.toFixed(2)}</text>`;
}).join("");

const avgX = PLOT.x + wFor(C.meanCorr);
const bottom = PLOT.y + ROWS.length * ROW_H;

process.stdout.write(`<!doctype html><meta charset="utf-8">
<style>
  html,body{margin:0;width:${CARD.width}px;height:${CARD.height}px;overflow:hidden;background:${SURFACE}}
  svg{display:block}
  text{font-family:"DejaVu Sans",system-ui,sans-serif;fill:${INK.primary}}
  .kicker{font-size:19px;letter-spacing:3.5px;fill:${BRAND};font-weight:700}
  .title{font-size:40px;font-weight:800;letter-spacing:-0.5px}
  .sub{font-size:17px;fill:${INK.secondary}}
  .lab{font-size:19px;font-weight:800}
  .val{font-size:18px;font-weight:800}
  rect.other{fill:${PALETTE.muted}}
  rect.ena{fill:${ROLE.fail}}
  .lab.other,.val.other{fill:${PALETTE.muted}}
  .lab.ena,.val.ena{fill:${ROLE.fail}}
  .ref{font-size:14px;fill:${INK.faint}}
  .stat{font-size:22px;font-weight:700}
  .statlab{font-size:15px;fill:${INK.muted}}
  .mark{font-size:17px;font-weight:700;fill:${BRAND};letter-spacing:1px}
</style>
<svg width="${CARD.width}" height="${CARD.height}" viewBox="0 0 ${CARD.width} ${CARD.height}" xmlns="http://www.w3.org/2000/svg">
  <rect width="${CARD.width}" height="${CARD.height}" fill="${SURFACE}"/>
  <rect x="0" y="0" width="${CARD.width}" height="4" fill="${ROLE.fail}"/>

  <text x="${CARD.margin}" y="${CARD.kickerY}" class="kicker">A P-VALUE THAT LOST TO ITS CONTROL</text>
  <text x="${CARD.right}" y="${CARD.kickerY}" text-anchor="end" class="mark">MAIX8</text>

  <text x="${CARD.margin}" y="${CARD.titleY[0]}" class="title">ENA is built on funding.</text>
  <text x="${CARD.margin}" y="${CARD.titleY[1]}" class="title">XRP tracks it better.</text>
  <text x="${CARD.margin}" y="${CARD.subY}" class="sub">Correlation with perpetual funding over ${V.windows} non-overlapping ${V.windowDays}-day windows, measured against BTC</text>

  <line x1="${avgX.toFixed(1)}" x2="${avgX.toFixed(1)}" y1="${PLOT.y - 6}" y2="${bottom + 6}" stroke="${INK.axis}" stroke-width="1" stroke-dasharray="5 4"/>
  <text x="${avgX.toFixed(1)}" y="${bottom + 22}" text-anchor="middle" class="ref">average of all ${C.tokens} tokens with no claim on funding: +${C.meanCorr.toFixed(3)}</text>

  ${rows}

  <line x1="${CARD.margin}" x2="${CARD.right}" y1="${CARD.footRuleY}" y2="${CARD.footRuleY}" stroke="${INK.rule}" stroke-width="1"/>
  <text x="${CARD.margin}" y="${CARD.statY}" class="stat">p ${V.vsBtcTest.p.toFixed(3)}</text>
  <text x="${CARD.margin}" y="${CARD.statLabelY}" class="statlab">ENA's correlation, taken on its own</text>

  <text x="470" y="${CARD.statY}" class="stat">${ordinal(C.enaPercentile)}</text>
  <text x="470" y="${CARD.statLabelY}" class="statlab">Percentile among tokens earning nothing from it</text>

  <text x="${CARD.right}" y="${CARD.statY}" text-anchor="end" class="stat">${ordinal(E.fundingPercentileNow)}</text>
  <text x="${CARD.right}" y="${CARD.statLabelY}" text-anchor="end" class="statlab">Where funding sits in its own history</text>
</svg>`);
