/**
 * Column card for post 73 — ten daily closes against a ceiling.
 *
 * The post's headline correction is a count anyone can verify: how many days
 * has BNB actually finished above the resistance band? Drawing the band as a
 * shaded strip and each day's close as a dot answers it before a word is read
 * — every dot sits below the strip.
 *
 * Deliberately the simplest card in the series, matching a post written for
 * readers who do not already trade. One idea, one axis, no legend needed.
 *
 *   node scripts/cover-watchlist.mjs > media/watchlist.html
 *   node scripts/render-card.mjs media/watchlist.html media/watchlist.png
 */

import { readFileSync } from "node:fs";
import { BRAND, CARD, INK, PALETTE, SURFACE } from "../src/palette.mjs";
import { count } from "../src/format.mjs";

const C = JSON.parse(readFileSync("research/watchlist-post-check.json", "utf8"));
const [ZONE_LOW, ZONE_HIGH] = C.bnb.zone;
const closes = C.bnb.recentCloses;

const above = closes.filter((c) => c.aboveZone).length;
const BELOW = PALETTE.primary, BAND = PALETTE.secondary;

const X0 = 230, W = 850, TOP = 250, H = 210;
const lo = Math.min(...closes.map((c) => c.close), ZONE_LOW) * 0.985;
const hi = Math.max(...closes.map((c) => c.close), ZONE_HIGH) * 1.008;
const y = (v) => TOP + H - ((v - lo) / (hi - lo)) * H;
const x = (i) => X0 + (i / (closes.length - 1)) * W;

const bandTop = y(ZONE_HIGH), bandBottom = y(ZONE_LOW);

const dots = closes.map((c, i) => `
  <circle cx="${x(i)}" cy="${y(c.close)}" r="9" fill="${BELOW}"/>
  <text x="${x(i)}" y="${y(c.close) + 30}" text-anchor="middle" class="day">${c.day.slice(5)}</text>`).join("");

const line = closes.map((c, i) => `${i ? "L" : "M"}${x(i)},${y(c.close)}`).join(" ");

process.stdout.write(`<!doctype html><meta charset="utf-8">
<style>
  html,body{margin:0;width:${CARD.width}px;height:${CARD.height}px;overflow:hidden;background:${SURFACE}}
  svg{display:block}
  text{font-family:"DejaVu Sans",system-ui,sans-serif;fill:${INK.primary}}
  .kicker{font-size:19px;letter-spacing:3.5px;fill:${BRAND};font-weight:700}
  .title{font-size:42px;font-weight:800;letter-spacing:-0.5px}
  .sub{font-size:18px;fill:${INK.secondary}}
  .day{font-size:13px;fill:${INK.muted}}
  .band{font-size:16px;font-weight:700;fill:${BAND}}
  .stat{font-size:22px;font-weight:700}
  .statlab{font-size:15px;fill:${INK.muted}}
  .mark{font-size:17px;font-weight:700;fill:${BRAND};letter-spacing:1px}
</style>
<svg width="${CARD.width}" height="${CARD.height}" viewBox="0 0 ${CARD.width} ${CARD.height}" xmlns="http://www.w3.org/2000/svg">
  <rect width="${CARD.width}" height="${CARD.height}" fill="${SURFACE}"/>
  <rect x="0" y="0" width="${CARD.width}" height="4" fill="${PALETTE.primary}"/>

  <text x="${CARD.margin}" y="${CARD.kickerY}" class="kicker">TOUCHED, NOT BROKEN</text>
  <text x="${CARD.right}" y="${CARD.kickerY}" text-anchor="end" class="mark">MAIX8</text>

  <text x="${CARD.margin}" y="${CARD.titleY[0]}" class="title">"BNB has broken $615."</text>
  <text x="${CARD.margin}" y="${CARD.titleY[1]}" class="title">Days it closed above the ceiling: ${count(above)}.</text>
  <text x="${CARD.margin}" y="${CARD.subY}" class="sub">Daily closing prices, last ${count(closes.length)} days · shaded band is the $${ZONE_LOW}–$${ZONE_HIGH} ceiling</text>

  <rect x="${X0 - 60}" y="${bandTop}" width="${W + 90}" height="${Math.max(6, bandBottom - bandTop)}"
        fill="${BAND}" fill-opacity="0.18" stroke="${BAND}" stroke-width="2"/>
  <text x="${CARD.margin}" y="${bandTop + (bandBottom - bandTop) / 2 + 6}" class="band">$${ZONE_LOW}–${ZONE_HIGH}</text>

  <path d="${line}" fill="none" stroke="${BELOW}" stroke-width="3" stroke-opacity="0.55"/>
  ${dots}

  <line x1="${CARD.margin}" x2="${CARD.right}" y1="${CARD.footRuleY}" y2="${CARD.footRuleY}" stroke="${INK.rule}" stroke-width="1"/>
  <text x="${CARD.margin}" y="${CARD.statY}" class="stat">${count(C.bnb.touches4h.rejected)} of ${count(C.bnb.touches4h.total)}</text>
  <text x="${CARD.margin}" y="${CARD.statLabelY}" class="statlab">Past visits to the ceiling that were turned back</text>

  <text x="600" y="${CARD.statY}" class="stat">${C.bnb.clearsPriorHighBy.toFixed(2)}%</text>
  <text x="600" y="${CARD.statLabelY}" class="statlab">Still under its own 30-day high</text>

  <text x="${CARD.right}" y="${CARD.statY}" text-anchor="end" class="stat">$${C.bnb.price.toFixed(2)}</text>
  <text x="${CARD.right}" y="${CARD.statLabelY}" text-anchor="end" class="statlab">Price now — inside the band</text>
</svg>`);
