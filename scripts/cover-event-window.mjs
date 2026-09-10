/**
 * Column card for post 90 — the reaction window against a coin toss.
 *
 * The advice is "watch the next 24 to 72 hours", so the card answers exactly
 * that span and nothing else. Three bars for three horizons, drawn as deviation
 * from 50% rather than from zero, because 50.7% and 42.2% plotted from a zero
 * baseline are three near-identical bars and the whole point is how far each
 * sits from a toss.
 *
 * The error bar is drawn per horizon from its own window count, so a reader can
 * see that the three-day bar is both the furthest from the line and the one
 * with the fewest independent windows behind it. That tension is the honest
 * shape of the result and the card should not resolve it.
 *
 *   node scripts/cover-event-window.mjs > media/event-window.html
 *   node scripts/render-card.mjs media/event-window.html media/event-window.png
 */

import { readFileSync } from "node:fs";
import { BRAND, CARD, INK, PALETTE, SURFACE } from "../src/palette.mjs";

const E = JSON.parse(readFileSync("research/event-window.json", "utf8"));

const points = E.baseRate.map((r) => ({
  label: `${r.horizonDays} day${r.horizonDays > 1 ? "s" : ""}`,
  pct: r.sameDirectionPct,
  deviation: r.sameDirectionPct - 50,
  se: 50 / Math.sqrt(r.windows),
  windows: r.windows,
}));

const SCALE_PP = Math.ceil(Math.max(...points.map((p) => Math.abs(p.deviation) + p.se)) / 2) * 2 + 2;
const ZERO_Y = 356;
const HALF_H = 112;
const y = (pp) => ZERO_Y - (pp / SCALE_PP) * HALF_H;

const X0 = 300, STEP = 268, BAND = 128;
/**
 * The caption baseline has to clear the dots, not just the boxes.
 *
 * Two of the three readings sit *outside* their own error bar, so the marker
 * hangs below the box it belongs to. Measuring the baseline from the box
 * bottoms alone put the captions straight through those dots.
 */
const deepest = Math.max(
  ...points.map((p) => y(-p.se)),
  ...points.map((p) => y(p.deviation)),
);
const LABEL_Y = deepest + 40;
const NOTE_Y = LABEL_Y + 22;

const marks = points.map((p, i) => {
  const cx = X0 + i * STEP;
  const top = y(p.se), bottom = y(-p.se);
  const dotY = y(p.deviation);
  const inBand = Math.abs(p.deviation) <= p.se;
  return `
  <rect x="${cx - BAND / 2}" y="${top}" width="${BAND}" height="${bottom - top}" rx="4"
        fill="${PALETTE.neutral}" fill-opacity="0.55"/>
  <line x1="${cx - BAND / 2}" x2="${cx + BAND / 2}" y1="${top}" y2="${top}" stroke="${INK.axis}" stroke-width="1.5"/>
  <line x1="${cx - BAND / 2}" x2="${cx + BAND / 2}" y1="${bottom}" y2="${bottom}" stroke="${INK.axis}" stroke-width="1.5"/>
  <circle cx="${cx}" cy="${dotY}" r="10" fill="${inBand ? INK.primary : PALETTE.primary}" stroke="${SURFACE}" stroke-width="2"/>
  <text x="${cx}" y="${top - 16}" text-anchor="middle" class="val">${p.pct.toFixed(1)}%</text>
  <text x="${cx}" y="${LABEL_Y}" text-anchor="middle" class="lab">${p.label}</text>
  <text x="${cx}" y="${NOTE_Y}" text-anchor="middle" class="note">${p.windows} independent windows</text>`;
}).join("");

process.stdout.write(`<!doctype html><meta charset="utf-8">
<style>
  html,body{margin:0;width:${CARD.width}px;height:${CARD.height}px;overflow:hidden;background:${SURFACE}}
  svg{display:block}
  text{font-family:"DejaVu Sans",system-ui,sans-serif;fill:${INK.primary}}
  .kicker{font-size:19px;letter-spacing:3.5px;fill:${BRAND};font-weight:700}
  .title{font-size:40px;font-weight:800;letter-spacing:-0.5px}
  .sub{font-size:17px;fill:${INK.secondary}}
  .lab{font-size:19px;font-weight:800}
  .note{font-size:13px;fill:${INK.muted}}
  .val{font-size:23px;font-weight:800}
  .axisstrong{font-size:15px;font-weight:700;fill:${INK.secondary}}
  .stat{font-size:22px;font-weight:700}
  .statlab{font-size:15px;fill:${INK.muted}}
  .mark{font-size:17px;font-weight:700;fill:${BRAND};letter-spacing:1px}
</style>
<svg width="${CARD.width}" height="${CARD.height}" viewBox="0 0 ${CARD.width} ${CARD.height}" xmlns="http://www.w3.org/2000/svg">
  <rect width="${CARD.width}" height="${CARD.height}" fill="${SURFACE}"/>
  <rect x="0" y="0" width="${CARD.width}" height="4" fill="${PALETTE.primary}"/>

  <text x="${CARD.margin}" y="${CARD.kickerY}" class="kicker">"WATCH THE 24-72 HOUR REACTION"</text>
  <text x="${CARD.right}" y="${CARD.kickerY}" text-anchor="end" class="mark">MAIX8</text>

  <text x="${CARD.margin}" y="${CARD.titleY[0]}" class="title">The most common advice in crypto.</text>
  <text x="${CARD.margin}" y="${CARD.titleY[1]}" class="title">Nobody had measured it.</text>
  <text x="${CARD.margin}" y="${CARD.subY}" class="sub">How often BTC's move continues · ${E.firstDate} to ${E.lastDate} · non-overlapping windows · box is one standard error</text>

  <line x1="${CARD.margin}" x2="${CARD.right}" y1="${ZERO_Y}" y2="${ZERO_Y}"
        stroke="${INK.secondary}" stroke-width="1.5" stroke-dasharray="6 5"/>
  <text x="${CARD.margin}" y="${ZERO_Y - 14}" class="axisstrong">50% — a coin toss</text>

  ${marks}

  <line x1="${CARD.margin}" x2="${CARD.right}" y1="${CARD.footRuleY}" y2="${CARD.footRuleY}" stroke="${INK.rule}" stroke-width="1"/>
  <text x="${CARD.margin}" y="${CARD.statY}" class="stat">${E.baseRate.filter((r) => r.sameDirectionPct < 50).length} of ${E.baseRate.length}</text>
  <text x="${CARD.margin}" y="${CARD.statLabelY}" class="statlab">Horizons that reverse rather than continue</text>

  <text x="540" y="${CARD.statY}" class="stat">${E.daysWithMetrics}</text>
  <text x="540" y="${CARD.statLabelY}" class="statlab">Days with exchange open interest</text>

  <text x="${CARD.right}" y="${CARD.statY}" text-anchor="end" class="stat">12</text>
  <text x="${CARD.right}" y="${CARD.statLabelY}" text-anchor="end" class="statlab">Comparisons run — expect an outlier</text>
</svg>`);
