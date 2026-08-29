/**
 * Column card for post 93 — the same floor, twice.
 *
 * Yesterday's card drew one funnel and let the shape make the argument. Drawing
 * it again would only repeat that. What makes today's post different is the
 * repetition itself: a fresh scan, a re-drawn universe, and the long column
 * still arriving at zero. So the card puts the two days side by side at every
 * gate, and the reader sees the pair of long bars vanish together.
 *
 * The four short bars are drawn in the muted series, not because shorts are
 * unimportant but because they are the control here. They clear the gates on
 * both days; the finding is what happens beside them.
 *
 *   node scripts/cover-again.mjs > media/again.html
 *   node scripts/render-card.mjs media/again.html media/again.png
 */

import { readFileSync } from "node:fs";
import { BRAND, CARD, INK, PALETTE, ROLE, SURFACE } from "../src/palette.mjs";

const DAY = "2026-08-21";
const TODAY = JSON.parse(readFileSync(`research/market-scan-${DAY}.json`, "utf8"));
const YESTERDAY = JSON.parse(readFileSync("research/market-scan.json", "utf8"));
const BOOK = JSON.parse(readFileSync("research/daily-brief.json", "utf8")).bookSummary;

const [lng, sht] = TODAY.engine.funnel;
const [yLng, ySht] = YESTERDAY.engine.funnel;

const GATES = [
  { key: "rows", label: "read" },
  { key: "haveFiveWindows", label: "have 5 windows" },
  { key: "unanimous", label: "all 5 agree" },
  { key: "deepEnough", label: "12+ episodes" },
  { key: "offered", label: "offered" },
];

const PLOT = { x: 150, y: 272, w: 900, h: 182 };
const maxCount = Math.max(...GATES.flatMap((g) => [lng[g.key], sht[g.key], yLng[g.key], ySht[g.key]]));
const stepW = PLOT.w / GATES.length;
const barW = 20;
const GAP = 3;

/**
 * Four bars per gate: two days for each direction, days adjacent.
 *
 * Pairing by day rather than by direction is what makes the repetition
 * readable — the two long bars sit together and disappear together, which is
 * the claim. Interleaving them by direction would show the same numbers and
 * hide the point.
 */
const groups = [
  { row: yLng, cls: "long", alpha: 0.55, slot: 0 },
  { row: lng, cls: "long", alpha: 1, slot: 1 },
  { row: ySht, cls: "short", alpha: 0.55, slot: 2 },
  { row: sht, cls: "short", alpha: 1, slot: 3 },
];
const groupSpan = 4 * barW + 3 * GAP;

const bars = groups.flatMap(({ row, cls, alpha, slot }) =>
  GATES.map((g, i) => {
    const v = row[g.key];
    const left = PLOT.x + stepW * (i + 0.5) - groupSpan / 2 + slot * (barW + GAP);
    const h = (v / maxCount) * PLOT.h;
    // A zero still needs a mark, or an empty slot reads as missing data
    // rather than as the finding.
    const drawn = v === 0 ? 3 : h;
    const y = PLOT.y + PLOT.h - drawn;
    const fill = cls === "long" ? ROLE.fail : PALETTE.muted;
    return `<rect x="${left}" y="${y}" width="${barW}" height="${drawn}" fill="${fill}" fill-opacity="${alpha}" rx="2"/>`;
  })
).join("\n  ");

/**
 * One label per direction per gate, not one per bar.
 *
 * Four numbers over four 20px bars collide at every gate. The pair that
 * matters reads as "yesterday → today", so it is printed once above the pair.
 */
const values = GATES.map((g, i) => {
  const cx = PLOT.x + stepW * (i + 0.5);
  /**
   * The two labels are stacked, not placed side by side.
   *
   * "59→55" is about 55px wide and the two pairs of bars are only 48px apart,
   * so any horizontal arrangement collides — putting them on a shared baseline
   * made it worse, and anchoring each to its own pair only hid the overlap at
   * the gates where the heights happened to differ. Stacking above the gate
   * removes the constraint entirely, and the colour says which row is which.
   */
  const tallest = Math.max(yLng[g.key], lng[g.key], ySht[g.key], sht[g.key]);
  const top = PLOT.y + PLOT.h - Math.max((tallest / maxCount) * PLOT.h, 3);
  return `
  <text x="${cx}" y="${top - 30}" text-anchor="middle" class="val long">${yLng[g.key]}→${lng[g.key]}</text>
  <text x="${cx}" y="${top - 11}" text-anchor="middle" class="val short">${ySht[g.key]}→${sht[g.key]}</text>`;
}).join("");

const gateLabels = GATES.map((g, i) =>
  `<text x="${PLOT.x + stepW * (i + 0.5)}" y="${PLOT.y + PLOT.h + 28}" text-anchor="middle" class="gate">${g.label}</text>`
).join("\n  ");

process.stdout.write(`<!doctype html><meta charset="utf-8">
<style>
  html,body{margin:0;width:${CARD.width}px;height:${CARD.height}px;overflow:hidden;background:${SURFACE}}
  svg{display:block}
  text{font-family:"DejaVu Sans",system-ui,sans-serif;fill:${INK.primary}}
  .kicker{font-size:19px;letter-spacing:3.5px;fill:${BRAND};font-weight:700}
  .title{font-size:40px;font-weight:800;letter-spacing:-0.5px}
  .sub{font-size:17px;fill:${INK.secondary}}
  .val{font-size:15px;font-weight:800}
  .long{fill:${ROLE.fail}}
  .short{fill:${PALETTE.muted}}
  .gate{font-size:15px;fill:${INK.muted}}
  .key{font-size:15px;font-weight:800;letter-spacing:1px}
  .stat{font-size:22px;font-weight:700}
  .statlab{font-size:15px;fill:${INK.muted}}
  .mark{font-size:17px;font-weight:700;fill:${BRAND};letter-spacing:1px}
</style>
<svg width="${CARD.width}" height="${CARD.height}" viewBox="0 0 ${CARD.width} ${CARD.height}" xmlns="http://www.w3.org/2000/svg">
  <rect width="${CARD.width}" height="${CARD.height}" fill="${SURFACE}"/>
  <rect x="0" y="0" width="${CARD.width}" height="4" fill="${ROLE.fail}"/>

  <text x="${CARD.margin}" y="${CARD.kickerY}" class="kicker">TWO DAYS, SAME FLOOR</text>
  <text x="${CARD.right}" y="${CARD.kickerY}" text-anchor="end" class="mark">MAIX8</text>

  <text x="${CARD.margin}" y="${CARD.titleY[0]}" class="title">I published this flaw last night.</text>
  <text x="${CARD.margin}" y="${CARD.titleY[1]}" class="title">A fresh board did it again by morning.</text>
  <text x="${CARD.margin}" y="${CARD.subY}" class="sub">Each pair is 20 Aug → 21 Aug, on a rescanned board with the universe re-drawn between them</text>

  <rect x="${CARD.margin}" y="${PLOT.y + 4}" width="13" height="13" fill="${ROLE.fail}" rx="2"/>
  <text x="${CARD.margin + 20}" y="${PLOT.y + 15}" class="key long">LONG</text>
  <rect x="${CARD.margin}" y="${PLOT.y + 30}" width="13" height="13" fill="${PALETTE.muted}" rx="2"/>
  <text x="${CARD.margin + 20}" y="${PLOT.y + 41}" class="key short">SHORT</text>

  <line x1="${PLOT.x}" x2="${PLOT.x + PLOT.w}" y1="${PLOT.y + PLOT.h}" y2="${PLOT.y + PLOT.h}"
        stroke="${INK.axis}" stroke-width="1"/>
  ${bars}
  ${values}
  ${gateLabels}

  <line x1="${CARD.margin}" x2="${CARD.right}" y1="${CARD.footRuleY}" y2="${CARD.footRuleY}" stroke="${INK.rule}" stroke-width="1"/>
  <text x="${CARD.margin}" y="${CARD.statY}" class="stat">0 and 0</text>
  <text x="${CARD.margin}" y="${CARD.statLabelY}" class="statlab">Longs offered, both days</text>

  <text x="440" y="${CARD.statY}" class="stat">${ySht.unanimousSharePct.toFixed(0)}% / ${sht.unanimousSharePct.toFixed(0)}%</text>
  <text x="440" y="${CARD.statLabelY}" class="statlab">Agreement passes shorts · ${yLng.unanimousSharePct.toFixed(0)}% / ${lng.unanimousSharePct.toFixed(0)}% longs</text>

  <text x="${CARD.right}" y="${CARD.statY}" text-anchor="end" class="stat">${BOOK.aheadCount} of ${BOOK.positions}</text>
  <text x="${CARD.right}" y="${CARD.statLabelY}" text-anchor="end" class="statlab">Open positions ahead · ${BOOK.totalResultR.toFixed(1)}R</text>
</svg>`);
