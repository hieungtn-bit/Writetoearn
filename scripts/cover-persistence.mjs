/**
 * Column card for post 86 — persistence against a coin toss.
 *
 * The obvious chart is three bars of match percentage, and it would be a lie by
 * framing: 49.55, 50.70 and 50.60 drawn from a zero baseline are three
 * identical bars, which reads as "stable and slightly positive" rather than
 * "nothing". Drawn from a 50% baseline instead, the same numbers become three
 * tiny slivers, which overstates the other way.
 *
 * So the card plots the deviation from a coin toss *against the error bar it
 * has to clear*. Each horizon gets its own band, one standard error wide on the
 * de-overlapped sample, and the observed value sits as a dot inside it. The
 * bands differ in height because the samples differ — 90 days has a sixth of
 * the independent observations 30 days does — and that is the honest shape of
 * the result: the dot never leaves the band.
 *
 *   node scripts/cover-persistence.mjs > media/persistence.html
 *   node scripts/render-card.mjs media/persistence.html media/persistence.png
 */

import { readFileSync } from "node:fs";
import { BRAND, CARD, INK, PALETTE, ROLE, SURFACE } from "../src/palette.mjs";

const S = JSON.parse(readFileSync("research/persistence.json", "utf8"));
const P = S.persistence, D = S.derived, C = S.selectors;
const HORIZONS = S.rules.persistenceHorizons;

const points = HORIZONS.map((h) => ({
  h,
  label: `${h} days`,
  deviation: P[h].matchPct - 50,
  se: 50 / Math.sqrt(P[h].effectiveN),
  matchPct: P[h].matchPct,
  effectiveN: P[h].effectiveN,
}));

/** Full scale, chosen from the widest band so no error bar is clipped. */
const SCALE_PP = Math.ceil(Math.max(...points.map((p) => p.se)) * 10) / 10 + 0.6;
const ZERO_Y = 368;
const HALF_H = 112;
const pxPerPP = HALF_H / SCALE_PP;
const y = (pp) => ZERO_Y - pp * pxPerPP;

const X0 = 258, STEP = 320, BAND = 108;
/**
 * One baseline for the category labels, not one per box.
 *
 * The bands are deliberately different heights, so hanging each label off its
 * own box bottom staggers the axis and makes three comparable things look like
 * three unrelated ones. The labels sit under the deepest band instead.
 */
const deepest = Math.max(...points.map((p) => y(-p.se)));
const LABEL_Y = deepest + 42;
const NOTE_Y = LABEL_Y + 22;

const marks = points.map((p, i) => {
  const cx = X0 + i * STEP;
  const top = y(p.se), bottom = y(-p.se);
  const dotY = y(p.deviation);
  return `
  <rect x="${cx - BAND / 2}" y="${top}" width="${BAND}" height="${bottom - top}" rx="4"
        fill="${PALETTE.neutral}" fill-opacity="0.55"/>
  <line x1="${cx - BAND / 2}" x2="${cx + BAND / 2}" y1="${top}" y2="${top}" stroke="${INK.axis}" stroke-width="1.5"/>
  <line x1="${cx - BAND / 2}" x2="${cx + BAND / 2}" y1="${bottom}" y2="${bottom}" stroke="${INK.axis}" stroke-width="1.5"/>
  <circle cx="${cx}" cy="${dotY}" r="10" fill="${INK.primary}" stroke="${SURFACE}" stroke-width="2"/>
  <text x="${cx}" y="${top - 16}" text-anchor="middle" class="val">${p.matchPct.toFixed(2)}%</text>
  <text x="${cx}" y="${LABEL_Y}" text-anchor="middle" class="lab">${p.label}</text>
  <text x="${cx}" y="${NOTE_Y}" text-anchor="middle" class="note">${Math.round(p.effectiveN).toLocaleString("en-US")} independent</text>`;
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
  .val{font-size:21px;font-weight:800}
  .axis{font-size:14px;fill:${INK.muted}}
  .axisstrong{font-size:15px;font-weight:700;fill:${INK.secondary}}
  .stat{font-size:22px;font-weight:700}
  .statlab{font-size:15px;fill:${INK.muted}}
  .mark{font-size:17px;font-weight:700;fill:${BRAND};letter-spacing:1px}
</style>
<svg width="${CARD.width}" height="${CARD.height}" viewBox="0 0 ${CARD.width} ${CARD.height}" xmlns="http://www.w3.org/2000/svg">
  <rect width="${CARD.width}" height="${CARD.height}" fill="${SURFACE}"/>
  <rect x="0" y="0" width="${CARD.width}" height="4" fill="${PALETTE.primary}"/>

  <text x="${CARD.margin}" y="${CARD.kickerY}" class="kicker">DOES DIRECTION PERSIST?</text>
  <text x="${CARD.right}" y="${CARD.kickerY}" text-anchor="end" class="mark">MAIX8</text>

  <text x="${CARD.margin}" y="${CARD.titleY[0]}" class="title">Every filter I built reads past</text>
  <text x="${CARD.margin}" y="${CARD.titleY[1]}" class="title">direction. It continues 50.70%.</text>
  <text x="${CARD.margin}" y="${CARD.subY}" class="sub">Sign of the trailing return vs the next one · ${S.pairs} liquid pairs · box is one standard error, de-overlapped</text>
  <text x="${CARD.margin}" y="${CARD.subY + 26}" class="sub">Not one horizon leaves its own error bar.</text>

  <line x1="${CARD.margin}" x2="${CARD.right}" y1="${ZERO_Y}" y2="${ZERO_Y}"
        stroke="${INK.secondary}" stroke-width="1.5" stroke-dasharray="6 5"/>
  <text x="${CARD.right}" y="${ZERO_Y - 14}" text-anchor="end" class="axisstrong">50% — a coin toss</text>

  ${marks}

  <line x1="${CARD.margin}" x2="${CARD.right}" y1="${CARD.footRuleY}" y2="${CARD.footRuleY}" stroke="${INK.rule}" stroke-width="1"/>
  <text x="${CARD.margin}" y="${CARD.statY}" class="stat">${D.engineOverMomentumR >= 0 ? "+" : ""}${D.engineOverMomentumR.toFixed(4)}R</text>
  <text x="${CARD.margin}" y="${CARD.statLabelY}" class="statlab">All my filters, over the sign of last month</text>

  <text x="560" y="${CARD.statY}" class="stat">${D.gapOverClaimedEdge.toFixed(1)}x</text>
  <text x="560" y="${CARD.statLabelY}" class="statlab">Run-to-run wobble in that number</text>

  <text x="${CARD.right}" y="${CARD.statY}" text-anchor="end" class="stat">t = ${C.unanimous.tStat.toFixed(2)}</text>
  <text x="${CARD.right}" y="${CARD.statLabelY}" text-anchor="end" class="statlab">The one filter still standing</text>
</svg>`);
