/**
 * Column card for post 71 — where price sits against where volume traded.
 *
 * The post's two subjects share one shape: BNB is above its whole value area
 * with nobody trapped overhead, BTC is below its point of control with most of
 * a month's turnover above it. Drawing both on the same axis makes that a
 * picture instead of a paragraph.
 *
 * Each row is that asset's 30-day range, with the value area as a filled band,
 * the point of control as a tick, and current price as a marker. The two rows
 * are normalised to their own ranges rather than to a shared price scale,
 * because $617 and $63,588 cannot share an axis and the comparison is
 * positional anyway.
 *
 *   node scripts/cover-bnb-btc.mjs > media/bnb-btc.html
 *   node scripts/render-card.mjs media/bnb-btc.html media/bnb-btc.png
 */

import { readFileSync } from "node:fs";
import { BRAND, CARD, INK, PALETTE, SURFACE } from "../src/palette.mjs";
import { pct, price as fmtPrice } from "../src/format.mjs";

const S = JSON.parse(readFileSync("site/signals.json", "utf8"));
const board = Object.fromEntries(S.signals.map((s) => [s.asset, s]));

const VALUE = PALETTE.secondary, MARK = PALETTE.primary;

const X0 = 210, W = 760, TOP = 250, STEP = 150, BAR = 54;

const rows = ["BNB", "BTC"].map((asset, i) => {
  const s = board[asset], c = s.context;
  const y = TOP + i * STEP;

  // Own range, padded so the price marker never sits on the edge.
  const lo = Math.min(c.valueAreaLow, s.price) * 0.995;
  const hi = Math.max(c.valueAreaHigh, s.price) * 1.005;
  const x = (v) => X0 + ((v - lo) / (hi - lo)) * W;

  const vaX = x(c.valueAreaLow), vaW = x(c.valueAreaHigh) - vaX;
  const pocX = x(c.pocPrice), priceX = x(s.price);

  return `
  <text x="${X0 - 26}" y="${y + 34}" text-anchor="end" class="asset">${asset}</text>
  <text x="${X0 - 26}" y="${y + 58}" text-anchor="end" class="over">overhead ${pct(c.underwaterPct)}%</text>

  <line x1="${X0}" x2="${X0 + W}" y1="${y + BAR / 2}" y2="${y + BAR / 2}" stroke="${INK.rule}" stroke-width="2"/>
  <rect x="${vaX}" y="${y}" width="${vaW}" height="${BAR}" rx="5" fill="${VALUE}" fill-opacity="0.22" stroke="${VALUE}" stroke-width="2"/>
  <text x="${vaX + vaW / 2}" y="${y - 10}" text-anchor="middle" class="tag" fill="${VALUE}">value area</text>

  <line x1="${pocX}" x2="${pocX}" y1="${y - 2}" y2="${y + BAR + 2}" stroke="${VALUE}" stroke-width="3"/>
  <text x="${pocX}" y="${y + BAR + 24}" text-anchor="middle" class="tag" fill="${VALUE}">POC ${fmtPrice(c.pocPrice)}</text>

  <circle cx="${priceX}" cy="${y + BAR / 2}" r="11" fill="${MARK}"/>
  <text x="${priceX}" y="${y - 10}" text-anchor="middle" class="tag" fill="${MARK}">${fmtPrice(s.price)}</text>
  <text x="${priceX}" y="${y + BAR + 24}" text-anchor="middle" class="tag" fill="${MARK}">${
    s.price > c.valueAreaHigh ? "above the area" : s.price < c.pocPrice ? "below the POC" : "inside"
  }</text>`;
}).join("");

process.stdout.write(`<!doctype html><meta charset="utf-8">
<style>
  html,body{margin:0;width:${CARD.width}px;height:${CARD.height}px;overflow:hidden;background:${SURFACE}}
  svg{display:block}
  text{font-family:"DejaVu Sans",system-ui,sans-serif;fill:${INK.primary}}
  .kicker{font-size:19px;letter-spacing:3.5px;fill:${BRAND};font-weight:700}
  .title{font-size:42px;font-weight:800;letter-spacing:-0.5px}
  .sub{font-size:18px;fill:${INK.secondary}}
  .asset{font-size:26px;font-weight:800}
  .over{font-size:14px;fill:${INK.muted}}
  .tag{font-size:14px;font-weight:700}
  .stat{font-size:22px;font-weight:700}
  .statlab{font-size:15px;fill:${INK.muted}}
  .mark{font-size:17px;font-weight:700;fill:${BRAND};letter-spacing:1px}
</style>
<svg width="${CARD.width}" height="${CARD.height}" viewBox="0 0 ${CARD.width} ${CARD.height}" xmlns="http://www.w3.org/2000/svg">
  <rect width="${CARD.width}" height="${CARD.height}" fill="${SURFACE}"/>
  <rect x="0" y="0" width="${CARD.width}" height="4" fill="${PALETTE.primary}"/>

  <text x="${CARD.margin}" y="${CARD.kickerY}" class="kicker">WHERE THE VOLUME ACTUALLY TRADED</text>
  <text x="${CARD.right}" y="${CARD.kickerY}" text-anchor="end" class="mark">MAIX8</text>

  <text x="${CARD.margin}" y="${CARD.titleY[0]}" class="title">Nobody is trapped above BNB.</text>
  <text x="${CARD.margin}" y="${CARD.titleY[1]}" class="title">That still is not a reason to buy it.</text>
  <text x="${CARD.margin}" y="${CARD.subY}" class="sub">30-day volume profile · value area, point of control, price now</text>

  ${rows}

  <line x1="${CARD.margin}" x2="${CARD.right}" y1="${CARD.footRuleY}" y2="${CARD.footRuleY}" stroke="${INK.rule}" stroke-width="1"/>
  <text x="${CARD.margin}" y="${CARD.statY}" class="stat">${pct(board.BNB.context.rangePosition30d)}%</text>
  <text x="${CARD.margin}" y="${CARD.statLabelY}" class="statlab">BNB position in its 30-day range</text>

  <text x="520" y="${CARD.statY}" class="stat">${board.BTC.bias}</text>
  <text x="520" y="${CARD.statLabelY}" class="statlab">BTC — both directions lose</text>

  <text x="${CARD.right}" y="${CARD.statY}" text-anchor="end" class="stat">n≈5</text>
  <text x="${CARD.right}" y="${CARD.statLabelY}" text-anchor="end" class="statlab">Independent episodes</text>
</svg>`);
