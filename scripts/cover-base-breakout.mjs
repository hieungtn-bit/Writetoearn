/**
 * Column card for post 89 — the strategy against its own control.
 *
 * The finding has two halves that point opposite ways, and a card that shows
 * only one of them lies. On the mean the strategy loses to a random entry with
 * the same exits; on the median and the hit rate it wins clearly. Draw only the
 * mean and it reads as a debunking; draw only the median and it reads as an
 * endorsement. Both go on, side by side, which is what the post actually says.
 *
 * Mean and median are on separate scales because they are separate questions —
 * forcing one axis would squash the median pair into invisibility. The axis
 * labels say which is which, and the bars are grouped by measure rather than by
 * arm so the eye compares the right pairs.
 *
 *   node scripts/cover-base-breakout.mjs > media/base-breakout.html
 *   node scripts/render-card.mjs media/base-breakout.html media/base-breakout.png
 */

import { readFileSync } from "node:fs";
import { BRAND, CARD, INK, PALETTE, SURFACE } from "../src/palette.mjs";

const B = JSON.parse(readFileSync("research/base-breakout.json", "utf8"));
const A = B.asSpecified, R = B.randomEntrySameManagement;

const PANELS = [
  {
    title: "mean R — the strategy loses",
    spec: A.meanR, ctrl: R.meanR, dp: 3,
  },
  {
    title: "median R — the strategy wins",
    spec: A.medianR, ctrl: R.medianR, dp: 3,
  },
];

const ZERO_Y = 370, MAX_H = 95, BAR = 118;
const PANEL_X = [130, 700];

const panels = PANELS.map((p, pi) => {
  const scale = Math.max(Math.abs(p.spec), Math.abs(p.ctrl));
  const x0 = PANEL_X[pi];
  const height = (v) => Math.max(5, (Math.abs(v) / scale) * MAX_H);
  /**
   * One caption baseline per panel, set by the deepest bar in it.
   *
   * Hanging each caption off its own bar staggers two comparable things and
   * makes the panel look broken; on the downward panel it also pushed the
   * longer bar's caption through the footer rule.
   */
  const deepest = Math.max(...[p.spec, p.ctrl].filter((v) => v < 0).map(height), 0);
  const captionY = ZERO_Y + (deepest ? deepest + 48 : 26);
  const bars = [["as specified", p.spec, PALETTE.primary], ["random entry", p.ctrl, INK.muted]]
    .map(([label, v, fill], i) => {
      const x = x0 + i * (BAR + 56);
      const bh = height(v);
      const up = v >= 0;
      const y = up ? ZERO_Y - bh : ZERO_Y;
      // Values sit outside the bar, on whichever side the bar is not.
      const vy = up ? y - 14 : ZERO_Y + bh + 24;
      return `
  <rect x="${x}" y="${y}" width="${BAR}" height="${bh}" rx="3" fill="${fill}"/>
  <text x="${x + BAR / 2}" y="${vy}" text-anchor="middle" class="val">${v >= 0 ? "+" : ""}${v.toFixed(p.dp)}</text>
  <text x="${x + BAR / 2}" y="${captionY}" text-anchor="middle" class="lab">${label}</text>`;
    }).join("");
  return `
  <text x="${x0}" y="${ZERO_Y - MAX_H - 46}" class="panel">${p.title}</text>
  ${bars}`;
}).join("");

process.stdout.write(`<!doctype html><meta charset="utf-8">
<style>
  html,body{margin:0;width:${CARD.width}px;height:${CARD.height}px;overflow:hidden;background:${SURFACE}}
  svg{display:block}
  text{font-family:"DejaVu Sans",system-ui,sans-serif;fill:${INK.primary}}
  .kicker{font-size:19px;letter-spacing:3.5px;fill:${BRAND};font-weight:700}
  .title{font-size:40px;font-weight:800;letter-spacing:-0.5px}
  .sub{font-size:17px;fill:${INK.secondary}}
  .panel{font-size:18px;font-weight:800;fill:${INK.secondary}}
  .lab{font-size:15px;fill:${INK.muted}}
  .val{font-size:21px;font-weight:800}
  .stat{font-size:22px;font-weight:700}
  .statlab{font-size:15px;fill:${INK.muted}}
  .mark{font-size:17px;font-weight:700;fill:${BRAND};letter-spacing:1px}
</style>
<svg width="${CARD.width}" height="${CARD.height}" viewBox="0 0 ${CARD.width} ${CARD.height}" xmlns="http://www.w3.org/2000/svg">
  <rect width="${CARD.width}" height="${CARD.height}" fill="${SURFACE}"/>
  <rect x="0" y="0" width="${CARD.width}" height="4" fill="${PALETTE.primary}"/>

  <text x="${CARD.margin}" y="${CARD.kickerY}" class="kicker">I RAN THE STRATEGY YOU SENT ME</text>
  <text x="${CARD.right}" y="${CARD.kickerY}" text-anchor="end" class="mark">MAIX8</text>

  <text x="${CARD.margin}" y="${CARD.titleY[0]}" class="title">The exit ladder is doing the work.</text>
  <text x="${CARD.margin}" y="${CARD.titleY[1]}" class="title">The entry buys a smoother ride.</text>
  <text x="${CARD.margin}" y="${CARD.subY}" class="sub">${A.setups} setups · ${B.pairs} pairs since ${B.historyFromYear} · control is the same symbol, month, stop and exits — only the entry differs</text>

  <line x1="${CARD.margin}" x2="${CARD.right}" y1="${ZERO_Y}" y2="${ZERO_Y}" stroke="${INK.rule}" stroke-width="1"/>

  ${panels}

  <line x1="${CARD.margin}" x2="${CARD.right}" y1="${CARD.footRuleY}" y2="${CARD.footRuleY}" stroke="${INK.rule}" stroke-width="1"/>
  <text x="${CARD.margin}" y="${CARD.statY}" class="stat">${A.medianStopPct.toFixed(1)}%</text>
  <text x="${CARD.margin}" y="${CARD.statLabelY}" class="statlab">Real stop distance — spec says 4-8%</text>

  <text x="560" y="${CARD.statY}" class="stat">${B.rejectedByGate.setups} of ${B.totalSetupsFound}</text>
  <text x="560" y="${CARD.statLabelY}" class="statlab">Setups the hard gate actually rejects</text>

  <text x="${CARD.right}" y="${CARD.statY}" text-anchor="end" class="stat">${A.stoppedPct.toFixed(0)}%</text>
  <text x="${CARD.right}" y="${CARD.statLabelY}" text-anchor="end" class="statlab">Stopped out, median hold ${A.medianHoldDays} days</text>
</svg>`);
