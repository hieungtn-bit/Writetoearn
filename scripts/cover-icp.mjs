/**
 * Column card for post 95 — a stop measured against the instrument.
 *
 * The post makes three checks and only one of them belongs on a card. The
 * backtest cannot go here: at 2.5 independent episodes it establishes nothing,
 * and a card is the one place a caveat never survives — a reader who sees a
 * losing bar chart will remember "the strategy loses", which is precisely what
 * the post refuses to claim.
 *
 * The stop check is the opposite. It is a count over 1,929 days, it is certain,
 * and it is the finding a reader can act on tonight. So the card draws the two
 * stops against the distribution of what ICP actually does in a day: the
 * fallback stop sits deep inside the shaded region of ordinary movement, the
 * main stop sits at its edge, and the median day is longer than the whole first
 * leg of the trade.
 *
 *   node scripts/cover-icp.mjs > media/icp.html
 *   node scripts/render-card.mjs media/icp.html media/icp.png
 */

import { readFileSync } from "node:fs";
import { BRAND, CARD, INK, PALETTE, ROLE, SURFACE } from "../src/palette.mjs";

const S = JSON.parse(readFileSync("research/icp-strategy.json", "utf8"));
const A = S.arithmetic, I = S.instrument, HA = S.houseAlternative;

/**
 * Three stops, each with the share of days that would have taken it.
 *
 * Ordered by size so the bars descend, which makes the argument before any
 * label is read: the tighter the stop, the more of the pair's ordinary daily
 * movement it is standing inside.
 */
const BARS = [
  { label: "Fallback stop", sub: `$2.29 entry, $2.25 stop · ${A.fallbackStopPct.toFixed(2)}%`,
    pct: I.daysTakingFallbackStopFromOpenPct, cls: "bad" },
  { label: "Plan stop", sub: `$2.515 entry, $2.39 stop · ${A.stopPct.toFixed(2)}%`,
    pct: I.daysTakingPlanStopFromOpenPct, cls: "mid" },
  { label: "1.5 ATR stop", sub: `the house rule · ${HA.stopPct.toFixed(2)}%`,
    pct: HA.daysTakingThisStopFromOpenPct, cls: "ok" },
];

const PLOT = { x: 300, y: 262, w: 700 };
const ROW_H = 74;
const maxPct = 80;
const wFor = (p) => (p / maxPct) * PLOT.w;

const rows = BARS.map((b, i) => {
  const y = PLOT.y + i * ROW_H;
  const w = wFor(b.pct);
  return `
  <text x="${PLOT.x - 24}" y="${y + 20}" text-anchor="end" class="lab">${b.label}</text>
  <text x="${PLOT.x - 24}" y="${y + 40}" text-anchor="end" class="sub2">${b.sub}</text>
  <rect x="${PLOT.x}" y="${y + 2}" width="${w.toFixed(1)}" height="34" rx="3" class="${b.cls}"/>
  <text x="${(PLOT.x + w + 14).toFixed(1)}" y="${y + 26}" class="val ${b.cls}">${b.pct.toFixed(1)}%</text>`;
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
  .sub2{font-size:14px;fill:${INK.muted}}
  .val{font-size:20px;font-weight:800}
  rect.bad{fill:${ROLE.fail}}
  rect.mid{fill:${PALETTE.muted}}
  rect.ok{fill:${PALETTE.secondary}}
  text.bad{fill:${ROLE.fail}}
  text.mid{fill:${PALETTE.muted}}
  text.ok{fill:${PALETTE.secondary}}
  .stat{font-size:22px;font-weight:700}
  .statlab{font-size:15px;fill:${INK.muted}}
  .mark{font-size:17px;font-weight:700;fill:${BRAND};letter-spacing:1px}
</style>
<svg width="${CARD.width}" height="${CARD.height}" viewBox="0 0 ${CARD.width} ${CARD.height}" xmlns="http://www.w3.org/2000/svg">
  <rect width="${CARD.width}" height="${CARD.height}" fill="${SURFACE}"/>
  <rect x="0" y="0" width="${CARD.width}" height="4" fill="${ROLE.fail}"/>

  <text x="${CARD.margin}" y="${CARD.kickerY}" class="kicker">A READER'S ICP PLAN, CHECKED</text>
  <text x="${CARD.right}" y="${CARD.kickerY}" text-anchor="end" class="mark">MAIX8</text>

  <text x="${CARD.margin}" y="${CARD.titleY[0]}" class="title">How often an ordinary day</text>
  <text x="${CARD.margin}" y="${CARD.titleY[1]}" class="title">would have taken each stop.</text>
  <text x="${CARD.margin}" y="${CARD.subY}" class="sub">Every ICP day since ${I.firstBar} · did price fall this far from the open before the day closed</text>

  ${rows}

  <line x1="${CARD.margin}" x2="${CARD.right}" y1="${CARD.footRuleY}" y2="${CARD.footRuleY}" stroke="${INK.rule}" stroke-width="1"/>
  <text x="${CARD.margin}" y="${CARD.statY}" class="stat">${I.medianDailyRangePct.toFixed(2)}%</text>
  <text x="${CARD.margin}" y="${CARD.statLabelY}" class="statlab">Median daily range · the first leg is ${S.backtest.geometry.tp1Pct.toFixed(2)}%</text>

  <text x="500" y="${CARD.statY}" class="stat">${A.tp1R.toFixed(2)}R</text>
  <text x="500" y="${CARD.statLabelY}" class="statlab">What the first target pays · claimed ${S.plan.claimedRR.low}-${S.plan.claimedRR.high}R</text>

  <text x="${CARD.right}" y="${CARD.statY}" text-anchor="end" class="stat">${A.blendedBestCaseR.toFixed(2)}R</text>
  <text x="${CARD.right}" y="${CARD.statLabelY}" text-anchor="end" class="statlab">Best case, with its own partial</text>
</svg>`);
