/**
 * Column card for post 87 — the numeraire is the whole finding.
 *
 * The temptation is a BTC price chart, and it would be the wrong card: the post
 * says explicitly that BTC's direction is a coin toss and that the price is not
 * the answer. Drawing the price large would sell exactly what the text refuses.
 *
 * So the card draws the one comparison that carries the result. The same trades,
 * the same stop, the same fee, the same scoring — divided by USDT, then divided
 * by BTC. Two bars, one flat and one not, with the t under each so the reader
 * sees the claim and its evidence in the same glance.
 *
 * The third bar is the same trade after funding, because a cost measured and
 * charged is worth more on a card than a cost waved away in a caption.
 *
 *   node scripts/cover-numeraire.mjs > media/numeraire.html
 *   node scripts/render-card.mjs media/numeraire.html media/numeraire.png
 */

import { readFileSync } from "node:fs";
import { BRAND, CARD, INK, PALETTE, SURFACE } from "../src/palette.mjs";

const S = JSON.parse(readFileSync("research/structural-edge.json", "utf8"));
const B = JSON.parse(readFileSync("research/btc-now.json", "utf8"));
const M = S.matched;

const bars = [
  { label: "vs USDT", sub: "short the alt outright", v: M.vsUsdt, hero: false },
  { label: "vs BTC", sub: "short the alt, long BTC", v: M.vsBtc, hero: true },
  { label: "vs BTC, after funding", sub: "90 funding payments charged", v: M.vsBtcAfterFunding, hero: true },
];

const BASE_Y = 448, MAX_H = 176, X0 = 128, STEP = 336, BAR = 216;
const scale = Math.max(...bars.map((b) => b.v.meanNetR));

const marks = bars.map((b, i) => {
  const x = X0 + i * STEP;
  const h = Math.max(6, (b.v.meanNetR / scale) * MAX_H);
  const y = BASE_Y - h;
  const fill = b.hero ? PALETTE.primary : INK.muted;
  return `
  <rect x="${x}" y="${y}" width="${BAR}" height="${h}" rx="4" fill="${fill}"/>
  <text x="${x + BAR / 2}" y="${y - 44}" text-anchor="middle" class="val">+${b.v.meanNetR.toFixed(3)}R</text>
  <text x="${x + BAR / 2}" y="${y - 20}" text-anchor="middle" class="tstat">t = ${b.v.tStatByMonth.toFixed(2)}</text>
  <text x="${x + BAR / 2}" y="${BASE_Y + 34}" text-anchor="middle" class="lab">${b.label}</text>
  <text x="${x + BAR / 2}" y="${BASE_Y + 56}" text-anchor="middle" class="note">${b.sub}</text>`;
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
  .val{font-size:26px;font-weight:800}
  .tstat{font-size:15px;fill:${INK.secondary};font-weight:700}
  .stat{font-size:22px;font-weight:700}
  .statlab{font-size:15px;fill:${INK.muted}}
  .mark{font-size:17px;font-weight:700;fill:${BRAND};letter-spacing:1px}
</style>
<svg width="${CARD.width}" height="${CARD.height}" viewBox="0 0 ${CARD.width} ${CARD.height}" xmlns="http://www.w3.org/2000/svg">
  <rect width="${CARD.width}" height="${CARD.height}" fill="${SURFACE}"/>
  <rect x="0" y="0" width="${CARD.width}" height="4" fill="${PALETTE.primary}"/>

  <text x="${CARD.margin}" y="${CARD.kickerY}" class="kicker">BITCOIN IS NOT A CALL</text>
  <text x="${CARD.right}" y="${CARD.kickerY}" text-anchor="end" class="mark">MAIX8</text>

  <text x="${CARD.margin}" y="${CARD.titleY[0]}" class="title">Same trades. Same stop. Same fee.</text>
  <text x="${CARD.margin}" y="${CARD.titleY[1]}" class="title">Only the denominator changes.</text>
  <text x="${CARD.margin}" y="${CARD.subY}" class="sub">Shorting liquid alts · ${M.vsBtc.months} non-overlapping months since 2019 · ${S.pairs} pairs · significance per month, not per ticket</text>

  <line x1="${CARD.margin}" x2="${CARD.right}" y1="${BASE_Y}" y2="${BASE_Y}" stroke="${INK.rule}" stroke-width="1"/>

  ${marks}

  <line x1="${CARD.margin}" x2="${CARD.right}" y1="${CARD.footRuleY}" y2="${CARD.footRuleY}" stroke="${INK.rule}" stroke-width="1"/>
  <text x="${CARD.margin}" y="${CARD.statY}" class="stat">${B.standing.directionPersistence30dPct.toFixed(2)}%</text>
  <text x="${CARD.margin}" y="${CARD.statLabelY}" class="statlab">BTC direction persisting — a coin toss</text>

  <text x="560" y="${CARD.statY}" class="stat">${S.perYear.filter((r) => r.shortRelR > 0.05).length} of ${S.perYear.length}</text>
  <text x="560" y="${CARD.statLabelY}" class="statlab">Years clearly positive — 2021 was zero</text>

  <text x="${CARD.right}" y="${CARD.statY}" text-anchor="end" class="stat">${S.funding.meanCarryR.toFixed(3)}R</text>
  <text x="${CARD.right}" y="${CARD.statLabelY}" text-anchor="end" class="statlab">What funding actually costs it</text>
</svg>`);
