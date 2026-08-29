/**
 * Column card for post 92 — where every long died.
 *
 * The obvious card is the board's rising long share, and it would be the wrong
 * one: a line going up is a card about being right early, and the post is not
 * about that. The finding is a shape, not a level. Two directions enter the
 * same four gates and one of them arrives at zero.
 *
 * So it draws the funnel as two descending step charts side by side, with the
 * gates as shared labels. The asymmetry is the whole argument and it is legible
 * before any number is read: the short row stays tall, the long row falls off
 * a cliff at the third gate and never comes back.
 *
 * The stat row carries the part a reader should leave with — that the board
 * read long while the book was short, across seven editions, and offered no
 * longs at all.
 *
 *   node scripts/cover-filter-funnel.mjs > media/filter-funnel.html
 *   node scripts/render-card.mjs media/filter-funnel.html media/filter-funnel.png
 */

import { readFileSync } from "node:fs";
import { BRAND, CARD, INK, PALETTE, ROLE, SURFACE } from "../src/palette.mjs";

const M = JSON.parse(readFileSync("research/market-scan.json", "utf8"));
const [lng, sht] = M.engine.funnel;
const H = M.boardSummary;

/** The four gates, in the order a row passes through them. */
const GATES = [
  { key: "rows", label: "read" },
  { key: "haveFiveWindows", label: "have 5 windows" },
  { key: "unanimous", label: "all 5 agree" },
  { key: "deepEnough", label: "12+ episodes" },
  { key: "offered", label: "offered" },
];

/* Plot box. The bars are counts, so one shared scale or the comparison lies. */
const PLOT = { x: 150, y: 268, w: 900, h: 190 };
const maxCount = Math.max(...GATES.map((g) => Math.max(lng[g.key], sht[g.key])));
const stepW = PLOT.w / GATES.length;
const barW = 44;
const yFor = (v) => PLOT.y + PLOT.h - (v / maxCount) * PLOT.h;

/**
 * Colour is carried by a class, not a fill attribute.
 *
 * The stylesheet sets a fill on `text`, and a CSS declaration beats a
 * presentation attribute — so `fill="..."` on each label silently lost and
 * every value printed in the body colour. The two series were then told apart
 * only by position, which is exactly the encoding this card exists to remove.
 */
const series = [
  { row: lng, cls: "long", dx: -26 },
  { row: sht, cls: "short", dx: 26 },
];

const bars = series.flatMap(({ row, cls, dx }) =>
  GATES.map((g, i) => {
    const v = row[g.key];
    const cx = PLOT.x + stepW * (i + 0.5) + dx;
    const top = yFor(v);
    const h = PLOT.y + PLOT.h - top;
    /**
     * A zero still needs a mark.
     *
     * With height 0 the bar vanishes and the reader sees an empty slot, which
     * reads as missing data rather than as the finding. A 3px stub on the
     * baseline says "measured, and it is nothing".
     */
    const drawn = Math.max(h, v === 0 ? 3 : h);
    const y = PLOT.y + PLOT.h - drawn;
    return `
    <rect x="${cx - barW / 2}" y="${y}" width="${barW}" height="${drawn}" fill="${cls === "long" ? ROLE.fail : PALETTE.muted}" rx="2"/>
    <text x="${cx}" y="${y - 10}" text-anchor="middle" class="val ${cls}">${v}</text>`;
  })
).join("");

const gateLabels = GATES.map((g, i) => {
  const cx = PLOT.x + stepW * (i + 0.5);
  return `<text x="${cx}" y="${PLOT.y + PLOT.h + 28}" text-anchor="middle" class="gate">${g.label}</text>`;
}).join("");

process.stdout.write(`<!doctype html><meta charset="utf-8">
<style>
  html,body{margin:0;width:${CARD.width}px;height:${CARD.height}px;overflow:hidden;background:${SURFACE}}
  svg{display:block}
  text{font-family:"DejaVu Sans",system-ui,sans-serif;fill:${INK.primary}}
  .kicker{font-size:19px;letter-spacing:3.5px;fill:${BRAND};font-weight:700}
  .title{font-size:40px;font-weight:800;letter-spacing:-0.5px}
  .sub{font-size:17px;fill:${INK.secondary}}
  .val{font-size:19px;font-weight:800}
  .long{fill:${ROLE.fail}}
  .short{fill:${PALETTE.muted}}
  .gate{font-size:15px;fill:${INK.muted}}
  .key{font-size:16px;font-weight:800;letter-spacing:1px}
  .stat{font-size:22px;font-weight:700}
  .statlab{font-size:15px;fill:${INK.muted}}
  .mark{font-size:17px;font-weight:700;fill:${BRAND};letter-spacing:1px}
</style>
<svg width="${CARD.width}" height="${CARD.height}" viewBox="0 0 ${CARD.width} ${CARD.height}" xmlns="http://www.w3.org/2000/svg">
  <rect width="${CARD.width}" height="${CARD.height}" fill="${SURFACE}"/>
  <rect x="0" y="0" width="${CARD.width}" height="4" fill="${ROLE.fail}"/>

  <text x="${CARD.margin}" y="${CARD.kickerY}" class="kicker">WHERE EVERY LONG DIED</text>
  <text x="${CARD.right}" y="${CARD.kickerY}" text-anchor="end" class="mark">MAIX8</text>

  <text x="${CARD.margin}" y="${CARD.titleY[0]}" class="title">My board read long all week.</text>
  <text x="${CARD.margin}" y="${CARD.titleY[1]}" class="title">It could not offer a single one.</text>
  <text x="${CARD.margin}" y="${CARD.subY}" class="sub">Every row on tonight's board, followed through the four filters it has to clear before it can be traded</text>

  <rect x="${CARD.margin}" y="${PLOT.y + 2}" width="14" height="14" fill="${ROLE.fail}" rx="2"/>
  <text x="${CARD.margin + 22}" y="${PLOT.y + 14}" class="key long">LONG</text>
  <rect x="${CARD.margin}" y="${PLOT.y + 30}" width="14" height="14" fill="${PALETTE.muted}" rx="2"/>
  <text x="${CARD.margin + 22}" y="${PLOT.y + 42}" class="key short">SHORT</text>

  <line x1="${PLOT.x}" x2="${PLOT.x + PLOT.w}" y1="${PLOT.y + PLOT.h}" y2="${PLOT.y + PLOT.h}"
        stroke="${INK.axis}" stroke-width="1"/>
  ${bars}
  ${gateLabels}

  <line x1="${CARD.margin}" x2="${CARD.right}" y1="${CARD.footRuleY}" y2="${CARD.footRuleY}" stroke="${INK.rule}" stroke-width="1"/>
  <text x="${CARD.margin}" y="${CARD.statY}" class="stat">${sht.unanimousSharePct.toFixed(0)}% vs ${lng.unanimousSharePct.toFixed(0)}%</text>
  <text x="${CARD.margin}" y="${CARD.statLabelY}" class="statlab">Agreement passes short rows, then long rows</text>

  <text x="500" y="${CARD.statY}" class="stat">${H.longSharePctFirst.toFixed(0)}% → ${H.longSharePctLast.toFixed(0)}%</text>
  <text x="500" y="${CARD.statLabelY}" class="statlab">Board reading long, over ${H.editions} editions</text>

  <text x="${CARD.right}" y="${CARD.statY}" text-anchor="end" class="stat">${H.editionsOfferingAnyLong} of ${H.positions}</text>
  <text x="${CARD.right}" y="${CARD.statLabelY}" text-anchor="end" class="statlab">Positions offered long</text>
</svg>`);
