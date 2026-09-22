/**
 * Column card for post 81 — two coins whose own histories reverse my usage.
 *
 * The post's sharpest moment is a symmetry: the coin whose overhead reading I
 * called dangerous outperformed its own baseline, and the coin whose reading I
 * called excellent underperformed. Two bars either side of zero say that in one
 * glance, and the reading itself is printed under each coin so the reversal is
 * visible rather than asserted.
 *
 * The axis is pinned to two points rather than scaled to the bars, for the same
 * reason as the overhead card: these differences are small, and a chart that
 * magnifies them would argue against the post it illustrates.
 *
 *   node scripts/cover-btc-bnb.mjs > media/btc-bnb.html
 *   node scripts/render-card.mjs media/btc-bnb.html media/btc-bnb.png
 */

import { readFileSync } from "node:fs";
import { BRAND, CARD, INK, PALETTE, SURFACE } from "../src/palette.mjs";

const F = JSON.parse(readFileSync("research/btc-bnb-final.json", "utf8"));
const btc = F.assets.BTCUSDT, bnb = F.assets.BNBUSDT;

const coins = [
  { name: "BTC", a: btc, verdict: "I called this reading dangerous" },
  { name: "BNB", a: bnb, verdict: "I called this one excellent" },
];

/** Two points either way, fixed, so a small difference stays small. */
const SCALE = 2;
const ZERO = 396, MAX_H = 104, X0 = 240, STEP = 440, BAR = 200;

const bars = coins.map((c, i) => {
  const x = X0 + i * STEP;
  const v = c.a.conditional[10].differencePct;
  const h = Math.max(4, (Math.abs(v) / SCALE) * MAX_H);
  const up = v > 0;
  const y = up ? ZERO - h : ZERO;
  const fill = up ? PALETTE.secondary : PALETTE.primary;
  // An upward bar reaches its own caption, so its value goes inside instead.
  const inside = up && h >= 50;
  const valY = inside ? y + 38 : up ? y - 14 : ZERO + h + 28;
  const valFill = inside ? INK.primary : fill;
  return `
  <text x="${x + BAR / 2}" y="262" text-anchor="middle" class="coin">${c.name}</text>
  <text x="${x + BAR / 2}" y="288" text-anchor="middle" class="read">${c.a.overheadProfilePct.toFixed(0)}% of the month's money underwater</text>
  <text x="${x + BAR / 2}" y="309" text-anchor="middle" class="note">${c.verdict}</text>
  <rect x="${x}" y="${y}" width="${BAR}" height="${h}" rx="4" fill="${fill}"/>
  <text x="${x + BAR / 2}" y="${valY}" text-anchor="middle" class="val" fill="${valFill}">${v >= 0 ? "+" : ""}${v.toFixed(2)} pts</text>`;
}).join("");

process.stdout.write(`<!doctype html><meta charset="utf-8">
<style>
  html,body{margin:0;width:${CARD.width}px;height:${CARD.height}px;overflow:hidden;background:${SURFACE}}
  svg{display:block}
  text{font-family:"DejaVu Sans",system-ui,sans-serif;fill:${INK.primary}}
  .kicker{font-size:19px;letter-spacing:3.5px;fill:${BRAND};font-weight:700}
  .title{font-size:40px;font-weight:800;letter-spacing:-0.5px}
  .sub{font-size:17px;fill:${INK.secondary}}
  .coin{font-size:30px;font-weight:800}
  .read{font-size:15px;fill:${INK.secondary}}
  .note{font-size:14px;fill:${INK.muted}}
  .val{font-size:22px;font-weight:800}
  .axis{font-size:14px;fill:${INK.muted}}
  .stat{font-size:22px;font-weight:700}
  .statlab{font-size:15px;fill:${INK.muted}}
  .mark{font-size:17px;font-weight:700;fill:${BRAND};letter-spacing:1px}
</style>
<svg width="${CARD.width}" height="${CARD.height}" viewBox="0 0 ${CARD.width} ${CARD.height}" xmlns="http://www.w3.org/2000/svg">
  <rect width="${CARD.width}" height="${CARD.height}" fill="${SURFACE}"/>
  <rect x="0" y="0" width="${CARD.width}" height="4" fill="${PALETTE.primary}"/>

  <text x="${CARD.margin}" y="${CARD.kickerY}" class="kicker">I DELETED MY FAVOURITE ARGUMENT</text>
  <text x="${CARD.right}" y="${CARD.kickerY}" text-anchor="end" class="mark">MAIX8</text>

  <text x="${CARD.margin}" y="${CARD.titleY[0]}" class="title">Both coins reversed the number</text>
  <text x="${CARD.margin}" y="${CARD.titleY[1]}" class="title">I was reading them with.</text>
  <text x="${CARD.margin}" y="${CARD.subY}" class="sub">10-day return from today's overhead reading, against each coin's own baseline</text>

  <line x1="${CARD.margin}" x2="${CARD.right}" y1="${ZERO}" y2="${ZERO}" stroke="${INK.rule}" stroke-width="1"/>
  <text x="${CARD.margin}" y="${ZERO + 22}" class="axis">line = the coin's</text>
  <text x="${CARD.margin}" y="${ZERO + 42}" class="axis">own average</text>
  <text x="${CARD.right}" y="${ZERO + 22}" text-anchor="end" class="axis">axis fixed at ±2 points</text>

  ${bars}

  <line x1="${CARD.margin}" x2="${CARD.right}" y1="${CARD.footRuleY}" y2="${CARD.footRuleY}" stroke="${INK.rule}" stroke-width="1"/>
  <text x="${CARD.margin}" y="${CARD.statY}" class="stat">${btc.leaningShort} of ${btc.lookbackCount}</text>
  <text x="${CARD.margin}" y="${CARD.statLabelY}" class="statlab">BTC lookbacks leaning short</text>

  <text x="560" y="${CARD.statY}" class="stat">${bnb.lookbackCount - bnb.leaningShort} of ${bnb.lookbackCount}</text>
  <text x="560" y="${CARD.statLabelY}" class="statlab">BNB lookbacks leaning long, on n=${Math.round(bnb.call.effectiveN)}</text>

  <text x="${CARD.right}" y="${CARD.statY}" text-anchor="end" class="stat">WAIT</text>
  <text x="${CARD.right}" y="${CARD.statLabelY}" text-anchor="end" class="statlab">Where I land on both</text>
</svg>`);
