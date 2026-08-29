/**
 * Column card for post 70 — one call, five lookbacks.
 *
 * The finding is a count out of five, so the card draws it as five cells per
 * name: filled where that lookback agrees with the call, hollow where it does
 * not. A reader sees the difference between BNB and ICP before reading a word,
 * which no expectancy number on the same card could do.
 *
 * GIGGLE is drawn with one cell and four struck out, because "1 of 1" and
 * "5 of 5" are not the same claim and the card must not let them look alike.
 *
 * Colour is agreement, from the shared palette, and every row is also labelled
 * with its own fraction so nothing rests on hue.
 *
 *   node scripts/cover-lookbacks.mjs > media/lookbacks.html
 *   node scripts/render-card.mjs media/lookbacks.html media/lookbacks.png
 */

import { readFileSync } from "node:fs";
import { BRAND, CARD, INK, PALETTE, SURFACE } from "../src/palette.mjs";
import { count, pct } from "../src/format.mjs";

const S = JSON.parse(readFileSync("site/signals.json", "utf8"));
const board = Object.fromEntries(S.signals.map((s) => [s.asset, s]));
const FIVE = ["BNB", "INJ", "ENA", "ICP", "GIGGLE"];

const AGREE = PALETTE.secondary, DISAGREE = PALETTE.primary;

const withAgreement = S.signals.filter((s) => s.agreement);
const longs = withAgreement.filter((s) => s.bias === "LONG");
const shorts = withAgreement.filter((s) => s.bias === "SHORT");
const meanShare = (g) => g.reduce((t, s) => t + s.agreement.sharePct, 0) / g.length;

const X0 = 300, TOP = 232, STEP = 60, CELL = 44, GAP = 10;

const rows = FIVE.map((asset, i) => {
  const g = board[asset].agreement;
  const y = TOP + i * STEP;
  const cells = Array.from({ length: 5 }, (_, k) => {
    const x = X0 + k * (CELL + GAP);
    // Beyond this name's tested windows: drawn as an absence, not a failure.
    if (k >= g.windows) {
      return `<rect x="${x}" y="${y}" width="${CELL}" height="${CELL}" rx="6" fill="none"
        stroke="${INK.rule}" stroke-width="2" stroke-dasharray="4 4"/>`;
    }
    const on = k < g.agreeing;
    return `<rect x="${x}" y="${y}" width="${CELL}" height="${CELL}" rx="6"
      fill="${on ? AGREE : "none"}" stroke="${on ? AGREE : DISAGREE}" stroke-width="2"/>`;
  }).join("");

  return `
  <text x="${X0 - 24}" y="${y + 31}" text-anchor="end" class="asset">${asset}</text>
  ${cells}
  <text x="${X0 + 5 * (CELL + GAP) + 14}" y="${y + 31}" class="frac"
    fill="${g.agreeing * 2 > g.windows ? AGREE : DISAGREE}">${g.agreeing}/${g.windows}</text>`;
}).join("");

process.stdout.write(`<!doctype html><meta charset="utf-8">
<style>
  html,body{margin:0;width:${CARD.width}px;height:${CARD.height}px;overflow:hidden;background:${SURFACE}}
  svg{display:block}
  text{font-family:"DejaVu Sans",system-ui,sans-serif;fill:${INK.primary}}
  .kicker{font-size:19px;letter-spacing:3.5px;fill:${BRAND};font-weight:700}
  .title{font-size:42px;font-weight:800;letter-spacing:-0.5px}
  .sub{font-size:18px;fill:${INK.secondary}}
  .asset{font-size:24px;font-weight:800}
  .frac{font-size:20px;font-weight:800}
  .stat{font-size:22px;font-weight:700}
  .statlab{font-size:15px;fill:${INK.muted}}
  .mark{font-size:17px;font-weight:700;fill:${BRAND};letter-spacing:1px}
</style>
<svg width="${CARD.width}" height="${CARD.height}" viewBox="0 0 ${CARD.width} ${CARD.height}" xmlns="http://www.w3.org/2000/svg">
  <rect width="${CARD.width}" height="${CARD.height}" fill="${SURFACE}"/>
  <rect x="0" y="0" width="${CARD.width}" height="4" fill="${PALETTE.primary}"/>

  <text x="${CARD.margin}" y="${CARD.kickerY}" class="kicker">ONE CALL, FIVE LOOKBACKS</text>
  <text x="${CARD.right}" y="${CARD.kickerY}" text-anchor="end" class="mark">MAIX8</text>

  <text x="${CARD.margin}" y="${CARD.titleY[0]}" class="title">All five say LONG.</text>
  <text x="${CARD.margin}" y="${CARD.titleY[1]}" class="title">Only two survive the question.</text>
  <text x="${CARD.margin}" y="${CARD.subY}" class="sub">Lookbacks agreeing with the call · 180 / 270 / 365 / 540 / 730 days</text>

  ${rows}

  <line x1="${CARD.margin}" x2="${CARD.right}" y1="${CARD.footRuleY}" y2="${CARD.footRuleY}" stroke="${INK.rule}" stroke-width="1"/>
  <text x="${CARD.margin}" y="${CARD.statY}" class="stat">${pct(meanShare(shorts))}% / ${pct(meanShare(longs))}%</text>
  <text x="${CARD.margin}" y="${CARD.statLabelY}" class="statlab">Mean agreement · shorts vs longs</text>

  <text x="560" y="${CARD.statY}" class="stat">${count(withAgreement.filter((s) => s.agreement.agreeing * 2 <= s.agreement.windows).length)} of ${count(withAgreement.length)}</text>
  <text x="560" y="${CARD.statLabelY}" class="statlab">Contradicted by most lookbacks — all long</text>

  <text x="${CARD.right}" y="${CARD.statY}" text-anchor="end" class="stat">n≈5</text>
  <text x="${CARD.right}" y="${CARD.statLabelY}" text-anchor="end" class="statlab">Independent episodes</text>
</svg>`);
