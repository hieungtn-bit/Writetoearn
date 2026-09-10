/**
 * Column card for post 97 — the AI basket against 200 random ones.
 *
 * The post has two findings and only one belongs here. The alpha table is the
 * argumentative one, and a card of it would read as "buy TAO, sell RENDER",
 * which is not what a single 180-day window supports.
 *
 * The cohesion test is the finding that stands on its own, and it draws itself:
 * a histogram of what 200 random baskets scored, and one line far off the right
 * edge of it. Nobody needs the word "z" explained to see that.
 *
 * The bars are the control distribution; the marker is the AI basket. Drawing
 * the control as the mass and the finding as a single rule is the honest shape
 * here — it puts the burden on the distance, not on the statistic.
 *
 *   node scripts/cover-ai-sector.mjs > media/ai-sector.html
 *   node scripts/render-card.mjs media/ai-sector.html media/ai-sector.png
 */

import { readFileSync } from "node:fs";
import { BRAND, CARD, INK, PALETTE, ROLE, SURFACE } from "../src/palette.mjs";

const A = JSON.parse(readFileSync("research/ai-sector.json", "utf8"));
const C = A.cohesion;

/**
 * The control distribution is rebuilt as a histogram from its own summary.
 *
 * The snapshot stores the mean and spread rather than all two hundred values,
 * so the bars are the normal implied by them — stated here because a drawn
 * histogram that is really a curve should say so rather than imply the raw
 * draws were kept.
 */
const BINS = 26;
const lo = Math.min(C.controlMeanCorr - 4 * C.controlSd, 0);
const hi = Math.max(C.aiWithinCorr + 0.04, C.controlMeanCorr + 4 * C.controlSd);
const PLOT = { x: 96, y: 300, w: 1010, h: 190 };
const xFor = (v) => PLOT.x + ((v - lo) / (hi - lo)) * PLOT.w;

const density = (v) => Math.exp(-((v - C.controlMeanCorr) ** 2) / (2 * C.controlSd ** 2));
const binW = (hi - lo) / BINS;
const bars = Array.from({ length: BINS }, (_, i) => {
  const centre = lo + binW * (i + 0.5);
  const h = density(centre) * PLOT.h;
  if (h < 0.6) return "";
  const x = xFor(lo + binW * i);
  const w = (PLOT.w / BINS) - 3;
  return `<rect x="${x.toFixed(1)}" y="${(PLOT.y + PLOT.h - h).toFixed(1)}" width="${w.toFixed(1)}" height="${h.toFixed(1)}" fill="${PALETTE.muted}" fill-opacity="0.75" rx="2"/>`;
}).filter(Boolean).join("\n  ");

const aiX = xFor(C.aiWithinCorr);
const ctlX = xFor(C.controlMeanCorr);

const ticks = [0, 0.1, 0.2, 0.3, 0.4].filter((v) => v >= lo && v <= hi).map((v) => `
  <text x="${xFor(v).toFixed(1)}" y="${PLOT.y + PLOT.h + 30}" text-anchor="middle" class="tick">${v.toFixed(1)}</text>`).join("");

process.stdout.write(`<!doctype html><meta charset="utf-8">
<style>
  html,body{margin:0;width:${CARD.width}px;height:${CARD.height}px;overflow:hidden;background:${SURFACE}}
  svg{display:block}
  text{font-family:"DejaVu Sans",system-ui,sans-serif;fill:${INK.primary}}
  .kicker{font-size:19px;letter-spacing:3.5px;fill:${BRAND};font-weight:700}
  .title{font-size:40px;font-weight:800;letter-spacing:-0.5px}
  .sub{font-size:17px;fill:${INK.secondary}}
  .tick{font-size:15px;fill:${INK.muted}}
  .pin{font-size:18px;font-weight:800;fill:${PALETTE.secondary}}
  .pinsub{font-size:14px;fill:${INK.muted}}
  .ctl{font-size:16px;font-weight:700;fill:${PALETTE.muted}}
  .stat{font-size:22px;font-weight:700}
  .statlab{font-size:15px;fill:${INK.muted}}
  .mark{font-size:17px;font-weight:700;fill:${BRAND};letter-spacing:1px}
</style>
<svg width="${CARD.width}" height="${CARD.height}" viewBox="0 0 ${CARD.width} ${CARD.height}" xmlns="http://www.w3.org/2000/svg">
  <rect width="${CARD.width}" height="${CARD.height}" fill="${SURFACE}"/>
  <rect x="0" y="0" width="${CARD.width}" height="4" fill="${PALETTE.secondary}"/>

  <text x="${CARD.margin}" y="${CARD.kickerY}" class="kicker">IS "AI" A SECTOR OR A LABEL</text>
  <text x="${CARD.right}" y="${CARD.kickerY}" text-anchor="end" class="mark">MAIX8</text>

  <text x="${CARD.margin}" y="${CARD.titleY[0]}" class="title">I expected this premise to dissolve.</text>
  <text x="${CARD.margin}" y="${CARD.titleY[1]}" class="title">It is the strongest thing on the page.</text>
  <text x="${CARD.margin}" y="${CARD.subY}" class="sub">How correlated ${A.basket.length} AI pairs stay after BTC is regressed out — against ${C.controlBaskets} random baskets of the same size</text>

  ${bars}
  <line x1="${PLOT.x}" x2="${PLOT.x + PLOT.w}" y1="${PLOT.y + PLOT.h}" y2="${PLOT.y + PLOT.h}" stroke="${INK.axis}" stroke-width="1"/>
  ${ticks}

  <line x1="${ctlX.toFixed(1)}" x2="${ctlX.toFixed(1)}" y1="${PLOT.y + PLOT.h - 24}" y2="${PLOT.y + PLOT.h}" stroke="${INK.primary}" stroke-width="2"/>
  <text x="${ctlX.toFixed(1)}" y="${PLOT.y - 14}" text-anchor="middle" class="ctl">random baskets</text>
  <text x="${ctlX.toFixed(1)}" y="${PLOT.y + 8}" text-anchor="middle" class="pinsub">${C.controlMeanCorr.toFixed(3)} ± ${C.controlSd.toFixed(3)}</text>

  <line x1="${aiX.toFixed(1)}" x2="${aiX.toFixed(1)}" y1="${PLOT.y - 40}" y2="${PLOT.y + PLOT.h}" stroke="${PALETTE.secondary}" stroke-width="3"/>
  <text x="${aiX.toFixed(1)}" y="${PLOT.y - 52}" text-anchor="middle" class="pin">the AI basket</text>
  <text x="${aiX.toFixed(1)}" y="${PLOT.y - 30}" text-anchor="middle" class="pinsub">${C.aiWithinCorr.toFixed(3)}</text>

  <line x1="${CARD.margin}" x2="${CARD.right}" y1="${CARD.footRuleY}" y2="${CARD.footRuleY}" stroke="${INK.rule}" stroke-width="1"/>
  <text x="${CARD.margin}" y="${CARD.statY}" class="stat">z ${C.zVsControl >= 0 ? "+" : ""}${C.zVsControl.toFixed(2)}</text>
  <text x="${CARD.margin}" y="${CARD.statLabelY}" class="statlab">Above every one of ${C.controlBaskets} random baskets</text>

  <text x="440" y="${CARD.statY}" class="stat">z +${C.weakestAfterDropping.z.toFixed(2)}</text>
  <text x="440" y="${CARD.statLabelY}" class="statlab">Weakest after dropping any single member</text>

  <text x="${CARD.right}" y="${CARD.statY}" text-anchor="end" class="stat">${A.windowDays} days</text>
  <text x="${CARD.right}" y="${CARD.statLabelY}" text-anchor="end" class="statlab">Daily returns, ${C.poolSize} pairs in the control pool</text>
</svg>`);
