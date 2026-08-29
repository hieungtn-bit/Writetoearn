/**
 * Column card for post 72 — what each take-profit needs against what it got.
 *
 * The finding is a comparison of two percentages per target: the win rate the
 * geometry requires, and the win rate history delivered. So each target is one
 * pair of bars, and whether the second clears the first is the whole story —
 * visible before a word is read.
 *
 * The three ladders sit in proposed order, top to bottom, so the reversal
 * shows as a shape: the first block fails and the second clears.
 *
 * Colour is outcome, from the shared palette, and every row carries both
 * numbers as text so nothing rests on hue.
 *
 *   node scripts/cover-bnb-setups.mjs > media/bnb-setups.html
 *   node scripts/render-card.mjs media/bnb-setups.html media/bnb-setups.png
 */

import { readFileSync } from "node:fs";
import { BRAND, CARD, INK, PALETTE, SURFACE } from "../src/palette.mjs";
import { pct } from "../src/format.mjs";

const B = JSON.parse(readFileSync("research/bnb-setups.json", "utf8"));
const PASS = PALETTE.secondary, FAIL = PALETTE.primary;

/** Every 30-day cell, in the order the setups were proposed. */
const rows = [];
for (const [name, s] of Object.entries(B.setups)) {
  const label = name.replace(/^\d+ · /, "");
  const cells = Object.entries(s.cells).filter(([k]) => k.endsWith("30d"));
  cells.forEach(([k, c], i) => {
    rows.push({
      setup: i === 0 ? label : "",
      target: k.split(" ")[0],
      needs: c.breakEvenHitPct,
      got: c.hitPct,
      ok: c.hitPct >= c.breakEvenHitPct,
      first: i === 0,
    });
  });
}

const X0 = 330, W = 560, TOP = 226, STEP = 40, BAR = 13;
const peak = Math.max(...rows.flatMap((r) => [r.needs, r.got]));
const len = (v) => (v / peak) * W;

const els = rows.map((r, i) => {
  const y = TOP + i * STEP;
  const colour = r.ok ? PASS : FAIL;
  return `
  ${r.setup ? `<text x="${CARD.margin}" y="${y + 16}" class="setup">${r.setup}</text>` : ""}
  <text x="${X0 - 14}" y="${y + 16}" text-anchor="end" class="tgt">${r.target}</text>

  <rect x="${X0}" y="${y}" width="${Math.max(2, len(r.needs))}" height="${BAR}" rx="3" fill="${INK.rule}"/>
  <rect x="${X0}" y="${y + BAR + 3}" width="${Math.max(2, len(r.got))}" height="${BAR}" rx="3" fill="${colour}"/>

  <text x="${X0 + Math.max(len(r.needs), len(r.got)) + 14}" y="${y + 21}" class="val" fill="${colour}">${
    pct(r.got)}% vs ${pct(r.needs)}% needed</text>`;
}).join("");

process.stdout.write(`<!doctype html><meta charset="utf-8">
<style>
  html,body{margin:0;width:${CARD.width}px;height:${CARD.height}px;overflow:hidden;background:${SURFACE}}
  svg{display:block}
  text{font-family:"DejaVu Sans",system-ui,sans-serif;fill:${INK.primary}}
  .kicker{font-size:19px;letter-spacing:3.5px;fill:${BRAND};font-weight:700}
  .title{font-size:40px;font-weight:800;letter-spacing:-0.5px}
  .sub{font-size:17px;fill:${INK.secondary}}
  .setup{font-size:19px;font-weight:800}
  .tgt{font-size:15px;fill:${INK.muted};font-weight:700}
  .val{font-size:14px;font-weight:700}
  .stat{font-size:22px;font-weight:700}
  .statlab{font-size:15px;fill:${INK.muted}}
  .mark{font-size:17px;font-weight:700;fill:${BRAND};letter-spacing:1px}
</style>
<svg width="${CARD.width}" height="${CARD.height}" viewBox="0 0 ${CARD.width} ${CARD.height}" xmlns="http://www.w3.org/2000/svg">
  <rect width="${CARD.width}" height="${CARD.height}" fill="${SURFACE}"/>
  <rect x="0" y="0" width="${CARD.width}" height="4" fill="${PALETTE.primary}"/>

  <text x="${CARD.margin}" y="${CARD.kickerY}" class="kicker">WIN RATE NEEDED vs DELIVERED</text>
  <text x="${CARD.right}" y="${CARD.kickerY}" text-anchor="end" class="mark">MAIX8</text>

  <text x="${CARD.margin}" y="${CARD.titleY[0]}" class="title">Three BNB setups, ranked by confidence.</text>
  <text x="${CARD.margin}" y="${CARD.titleY[1]}" class="title">Measurement reverses the order.</text>
  <text x="${CARD.margin}" y="${CARD.subY}" class="sub">Grey: the win rate each target requires · Colour: what history delivered · 30-day horizon</text>

  ${els}

  <line x1="${CARD.margin}" x2="${CARD.right}" y1="${CARD.footRuleY}" y2="${CARD.footRuleY}" stroke="${INK.rule}" stroke-width="1"/>
  <text x="${CARD.margin}" y="${CARD.statY}" class="stat">${pct(B.setups["1 · pullback long"].firstTargetRr)} : 1</text>
  <text x="${CARD.margin}" y="${CARD.statLabelY}" class="statlab">What the "safest" setup pays at TP1</text>

  <text x="500" y="${CARD.statY}" class="stat">${pct(B.setups["1 · pullback long"].stopInAtr)} ATR</text>
  <text x="500" y="${CARD.statLabelY}" class="statlab">Its stop — inside one day of noise</text>

  <text x="${CARD.right}" y="${CARD.statY}" text-anchor="end" class="stat">n≈11</text>
  <text x="${CARD.right}" y="${CARD.statLabelY}" text-anchor="end" class="statlab">Independent episodes</text>
</svg>`);
