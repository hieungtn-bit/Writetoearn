/**
 * Card for post 84 — the joke, drawn as two bars.
 *
 * The punchline is a comparison: getting scammed and refunded leaves you flat,
 * while actually buying the median liquid pair has cost 16.72% over ninety
 * days. Two bars either side of zero is the entire gag, and it is also an
 * accurate chart, which is the only reason it is allowed on this channel.
 *
 * The scammed bar is drawn at zero height with a visible stub, because a bar
 * of literally nothing reads as a rendering fault rather than as a result.
 *
 *   node scripts/cover-meme.mjs > media/meme.html
 *   node scripts/render-card.mjs media/meme.html media/meme.png
 */

import { readFileSync } from "node:fs";
import { BRAND, CARD, INK, PALETTE, SURFACE } from "../src/palette.mjs";

const A = JSON.parse(readFileSync("research/multiplier-audit.json", "utf8"));
const loss = A.baseline[90].medianPct;
const doubled = A.bands.map((x) => x.forward[90].doubledSharePct);

const bars = [
  { label: "Scammed, then refunded", sub: "police recovered every coin", v: 0 },
  { label: "Actually bought the coin", sub: `median liquid pair, 90 days`, v: loss },
];

// The value label sits below the bar, so the bar has to stop far enough
// above the footer rule for that label to clear it.
const ZERO = 340, MAX_H = 130, X0 = 240, STEP = 440, BAR = 200;
const scale = Math.abs(loss);

const rows = bars.map((b, i) => {
  const x = X0 + i * STEP;
  const h = b.v === 0 ? 5 : (Math.abs(b.v) / scale) * MAX_H;
  const fill = b.v === 0 ? PALETTE.muted : PALETTE.primary;
  return `
  <text x="${x + BAR / 2}" y="272" text-anchor="middle" class="lab">${b.label}</text>
  <text x="${x + BAR / 2}" y="295" text-anchor="middle" class="note">${b.sub}</text>
  <rect x="${x}" y="${ZERO}" width="${BAR}" height="${h}" rx="3" fill="${fill}"/>
  <text x="${x + BAR / 2}" y="${ZERO + h + 34}" text-anchor="middle" class="val" fill="${fill}">${b.v === 0 ? "0.00" : b.v.toFixed(2)}%</text>`;
}).join("");

process.stdout.write(`<!doctype html><meta charset="utf-8">
<style>
  html,body{margin:0;width:${CARD.width}px;height:${CARD.height}px;overflow:hidden;background:${SURFACE}}
  svg{display:block}
  text{font-family:"DejaVu Sans",system-ui,sans-serif;fill:${INK.primary}}
  .kicker{font-size:19px;letter-spacing:3.5px;fill:${BRAND};font-weight:700}
  .title{font-size:37px;font-weight:800;letter-spacing:-0.5px}
  .sub{font-size:17px;fill:${INK.secondary}}
  .lab{font-size:21px;font-weight:800}
  .note{font-size:14px;fill:${INK.muted}}
  .val{font-size:30px;font-weight:800}
  .stat{font-size:22px;font-weight:700}
  .statlab{font-size:15px;fill:${INK.muted}}
  .mark{font-size:17px;font-weight:700;fill:${BRAND};letter-spacing:1px}
</style>
<svg width="${CARD.width}" height="${CARD.height}" viewBox="0 0 ${CARD.width} ${CARD.height}" xmlns="http://www.w3.org/2000/svg">
  <rect width="${CARD.width}" height="${CARD.height}" fill="${SURFACE}"/>
  <rect x="0" y="0" width="${CARD.width}" height="4" fill="${PALETTE.primary}"/>

  <text x="${CARD.margin}" y="${CARD.kickerY}" class="kicker">THE OFFICER WAS RIGHT, AND I CHECKED BY HOW MUCH</text>
  <text x="${CARD.right}" y="${CARD.kickerY}" text-anchor="end" class="mark">MAIX8</text>

  <text x="${CARD.margin}" y="${CARD.titleY[0]}" class="title">"Lucky you got scammed. If you'd actually</text>
  <text x="${CARD.margin}" y="${CARD.titleY[1]}" class="title">bought the coin, we couldn't get it back."</text>
  <text x="${CARD.margin}" y="${CARD.subY}" class="sub">90-day return · ${A.universe} pairs · ${A.labelledDays.toLocaleString("en-US")} pair-days · the median case, not a crash</text>

  <line x1="${CARD.margin}" x2="${CARD.right}" y1="${ZERO}" y2="${ZERO}" stroke="${INK.rule}" stroke-width="1"/>

  ${rows}

  <line x1="${CARD.margin}" x2="${CARD.right}" y1="${CARD.footRuleY}" y2="${CARD.footRuleY}" stroke="${INK.rule}" stroke-width="1"/>
  <text x="${CARD.margin}" y="${CARD.statY}" class="stat">${Math.abs(loss).toFixed(1)} pts</text>
  <text x="${CARD.margin}" y="${CARD.statLabelY}" class="statlab">How right the officer was</text>

  <text x="600" y="${CARD.statY}" class="stat">${Math.min(...doubled).toFixed(1)}–${Math.max(...doubled).toFixed(1)}%</text>
  <text x="600" y="${CARD.statLabelY}" class="statlab">Odds of a 2x in 90 days</text>

  <text x="${CARD.right}" y="${CARD.statY}" text-anchor="end" class="stat">10x</text>
  <text x="${CARD.right}" y="${CARD.statLabelY}" text-anchor="end" class="statlab">What the pinned post promised</text>
</svg>`);
