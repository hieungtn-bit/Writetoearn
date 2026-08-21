/**
 * Column card for post 94 — twenty hardforks, one day after, against BTC.
 *
 * The wrong card here is a bar chart of the six window averages. It would put
 * the eye on the one bar that looks different, which is exactly the window the
 * post spends four paragraphs refusing to trade, and a reader who only sees
 * the card would leave with the opposite of the argument.
 *
 * So the card draws the raw distribution instead: one dot per upgrade, at what
 * BNB did against BTC in the day after it activated, on a zero line. Twenty
 * dots scattered either side of zero is the finding, and it needs no
 * statistics to read. The detection floor is drawn as a shaded band, because
 * the second half of the result — that an effect smaller than this is
 * invisible at twenty events — is the half most likely to be dropped.
 *
 *   node scripts/cover-hardfork.mjs > media/hardfork.html
 *   node scripts/render-card.mjs media/hardfork.html media/hardfork.png
 */

import { readFileSync } from "node:fs";
import { BRAND, CARD, INK, PALETTE, ROLE, SURFACE } from "../src/palette.mjs";

const H = JSON.parse(readFileSync("research/bnb-hardfork.json", "utf8"));
const post1 = H.summary.find((s) => s.key === "post1");
const pasteur = H.upcoming.find((u) => u.names.includes("Pasteur"));

const AXIS = { x: 110, y: 420, w: 1000 };
const values = H.events.map((e) => e.post1VsBtcPct);
const span = Math.ceil(Math.max(...values.map(Math.abs)) + 0.5);
const xFor = (v) => AXIS.x + ((v + span) / (2 * span)) * AXIS.w;

/**
 * Dots at the same value would sit on top of each other, so ties are nudged
 * upward in the order they occur. The vertical axis carries no meaning; it
 * exists only so twenty events are twenty marks.
 */
const placed = [];
const dots = H.events.map((e) => {
  const cx = xFor(e.post1VsBtcPct);
  const collisions = placed.filter((p) => Math.abs(p - cx) < 15).length;
  placed.push(cx);
  const cy = AXIS.y - collisions * 19;
  return `<circle cx="${cx.toFixed(1)}" cy="${cy}" r="7"
    fill="${e.post1VsBtcPct >= 0 ? PALETTE.secondary : ROLE.fail}" fill-opacity="0.85"/>`;
}).join("\n  ");

const ticks = [-span, -span / 2, 0, span / 2, span].map((v) => `
  <line x1="${xFor(v).toFixed(1)}" x2="${xFor(v).toFixed(1)}" y1="${AXIS.y + 12}" y2="${AXIS.y + 20}" stroke="${INK.axis}" stroke-width="1"/>
  <text x="${xFor(v).toFixed(1)}" y="${AXIS.y + 42}" text-anchor="middle" class="tick">${v > 0 ? "+" : ""}${v.toFixed(0)}%</text>`).join("");

/** The band inside which this study cannot tell an effect from noise. */
const floor = post1.detectableEffectPct;
/** Below the deck, so the band's caption cannot land on the subtitle. */
const BAND_TOP = 258;
const bandLeft = xFor(-floor), bandRight = xFor(floor);

process.stdout.write(`<!doctype html><meta charset="utf-8">
<style>
  html,body{margin:0;width:${CARD.width}px;height:${CARD.height}px;overflow:hidden;background:${SURFACE}}
  svg{display:block}
  text{font-family:"DejaVu Sans",system-ui,sans-serif;fill:${INK.primary}}
  .kicker{font-size:19px;letter-spacing:3.5px;fill:${BRAND};font-weight:700}
  .title{font-size:40px;font-weight:800;letter-spacing:-0.5px}
  .sub{font-size:17px;fill:${INK.secondary}}
  .tick{font-size:15px;fill:${INK.muted}}
  .band{font-size:14px;fill:${INK.faint}}
  .stat{font-size:22px;font-weight:700}
  .statlab{font-size:15px;fill:${INK.muted}}
  .mark{font-size:17px;font-weight:700;fill:${BRAND};letter-spacing:1px}
</style>
<svg width="${CARD.width}" height="${CARD.height}" viewBox="0 0 ${CARD.width} ${CARD.height}" xmlns="http://www.w3.org/2000/svg">
  <rect width="${CARD.width}" height="${CARD.height}" fill="${SURFACE}"/>
  <rect x="0" y="0" width="${CARD.width}" height="4" fill="${PALETTE.secondary}"/>

  <text x="${CARD.margin}" y="${CARD.kickerY}" class="kicker">BSC HARDFORKS AND BNB</text>
  <text x="${CARD.right}" y="${CARD.kickerY}" text-anchor="end" class="mark">MAIX8</text>

  <text x="${CARD.margin}" y="${CARD.titleY[0]}" class="title">Twenty upgrades. One day after each.</text>
  <text x="${CARD.margin}" y="${CARD.titleY[1]}" class="title">This is the whole effect on price.</text>
  <text x="${CARD.margin}" y="${CARD.subY}" class="sub">Every BSC mainnet activation since 2021, measured against BTC · Pasteur activates ${pasteur.at.slice(0, 10)}</text>

  <rect x="${bandLeft.toFixed(1)}" y="${BAND_TOP}" width="${(bandRight - bandLeft).toFixed(1)}" height="${AXIS.y + 12 - BAND_TOP}"
        fill="${PALETTE.neutral}" fill-opacity="0.35"/>
  <text x="${xFor(0).toFixed(1)}" y="${BAND_TOP - 12}" text-anchor="middle" class="band">below ±${floor.toFixed(2)}%, this study cannot tell an effect from noise</text>

  <line x1="${AXIS.x}" x2="${AXIS.x + AXIS.w}" y1="${AXIS.y + 12}" y2="${AXIS.y + 12}" stroke="${INK.axis}" stroke-width="1"/>
  <line x1="${xFor(0).toFixed(1)}" x2="${xFor(0).toFixed(1)}" y1="${BAND_TOP}" y2="${AXIS.y + 20}" stroke="${INK.rule}" stroke-width="1"/>
  ${ticks}
  ${dots}

  <line x1="${CARD.margin}" x2="${CARD.right}" y1="${CARD.footRuleY}" y2="${CARD.footRuleY}" stroke="${INK.rule}" stroke-width="1"/>
  <text x="${CARD.margin}" y="${CARD.statY}" class="stat">${post1.meanVsBtcPct >= 0 ? "+" : ""}${post1.meanVsBtcPct.toFixed(2)}%</text>
  <text x="${CARD.margin}" y="${CARD.statLabelY}" class="statlab">Average day-after move against BTC</text>

  <text x="480" y="${CARD.statY}" class="stat">p ${post1.pValue.toFixed(2)}</text>
  <text x="480" y="${CARD.statLabelY}" class="statlab">Against ${H.controlDays.toLocaleString("en-US")} control days in the same regime</text>

  <text x="${CARD.right}" y="${CARD.statY}" text-anchor="end" class="stat">${post1.upSharePct.toFixed(0)}%</text>
  <text x="${CARD.right}" y="${CARD.statLabelY}" text-anchor="end" class="statlab">Of the twenty rose against BTC</text>
</svg>`);
