/**
 * Column card for post 79 — the ratio the note advertises against the one its
 * own numbers produce.
 *
 * The post checks a lot of things, but only one of them changes what a reader
 * would do: a trade sold as 1:2 is 1:1 at its first target, which moves the
 * win rate you need from a third to a half. Two bars, one axis, no other
 * message — the audit's other findings are what the post is for, and a card
 * that tried to carry them all would carry none.
 *
 * The win-rate figures are the footer stats rather than the bars, because the
 * ratio is the claim and the win rate is the consequence.
 *
 *   node scripts/cover-btc-audit.mjs > media/btc-audit.html
 *   node scripts/render-card.mjs media/btc-audit.html media/btc-audit.png
 */

import { readFileSync } from "node:fs";
import { BRAND, CARD, INK, PALETTE, SURFACE } from "../src/palette.mjs";

const A = JSON.parse(readFileSync("research/btc-audit.json", "utf8"));
const g = A.geometry.long, t = A.triggers;

// The advertised bar is drawn at the LOW end of the stated range, the most
// charitable reading available to the note, and labelled with the full range
// so the card does not quietly pick the number that flatters the finding.
const bars = [
  { label: "as advertised", sub: "stated range, both triggers",
    v: A.note.long.statedRr[0], text: `1 : ${A.note.long.statedRr[0]}–${A.note.long.statedRr[1]}`, hero: false },
  { label: "as it computes", sub: "from its own entry, stop and TP1",
    v: g.tp1.rr, text: `1 : ${g.tp1.rr.toFixed(2)}`, hero: true },
];

const ZERO = 470, MAX_W = 620, X0 = 300, TOP = 262, STEP = 116, BAR = 62;
const scale = Math.max(...bars.map((b) => b.v));

const rows = bars.map((b, i) => {
  const y = TOP + i * STEP;
  const w = Math.max(6, (b.v / scale) * MAX_W);
  const fill = b.hero ? PALETTE.primary : PALETTE.muted;
  return `
  <rect x="${X0}" y="${y}" width="${w}" height="${BAR}" rx="4" fill="${fill}"/>
  <text x="${X0 - 24}" y="${y + 30}" text-anchor="end" class="lab">${b.label}</text>
  <text x="${X0 - 24}" y="${y + 52}" text-anchor="end" class="note">${b.sub}</text>
  <text x="${X0 + w + 18}" y="${y + 44}" class="val" fill="${fill}">${b.text}</text>`;
}).join("");

process.stdout.write(`<!doctype html><meta charset="utf-8">
<style>
  html,body{margin:0;width:${CARD.width}px;height:${CARD.height}px;overflow:hidden;background:${SURFACE}}
  svg{display:block}
  text{font-family:"DejaVu Sans",system-ui,sans-serif;fill:${INK.primary}}
  .kicker{font-size:19px;letter-spacing:3.5px;fill:${BRAND};font-weight:700}
  .title{font-size:40px;font-weight:800;letter-spacing:-0.5px}
  .sub{font-size:17px;fill:${INK.secondary}}
  .lab{font-size:21px;font-weight:800}
  .note{font-size:13px;fill:${INK.muted}}
  .val{font-size:30px;font-weight:800}
  .stat{font-size:22px;font-weight:700}
  .statlab{font-size:15px;fill:${INK.muted}}
  .mark{font-size:17px;font-weight:700;fill:${BRAND};letter-spacing:1px}
</style>
<svg width="${CARD.width}" height="${CARD.height}" viewBox="0 0 ${CARD.width} ${CARD.height}" xmlns="http://www.w3.org/2000/svg">
  <rect width="${CARD.width}" height="${CARD.height}" fill="${SURFACE}"/>
  <rect x="0" y="0" width="${CARD.width}" height="4" fill="${PALETTE.primary}"/>

  <text x="${CARD.margin}" y="${CARD.kickerY}" class="kicker">SAME CALL AS MINE. I CHECKED IT ANYWAY.</text>
  <text x="${CARD.right}" y="${CARD.kickerY}" text-anchor="end" class="mark">MAIX8</text>

  <text x="${CARD.margin}" y="${CARD.titleY[0]}" class="title">A trade sold as one to two</text>
  <text x="${CARD.margin}" y="${CARD.titleY[1]}" class="title">is one to one at its first target.</text>
  <text x="${CARD.margin}" y="${CARD.subY}" class="sub">A reader's BTC note, audited · seven claims stand · three do not · one is arithmetic</text>

  ${rows}

  <line x1="${CARD.margin}" x2="${CARD.right}" y1="${CARD.footRuleY}" y2="${CARD.footRuleY}" stroke="${INK.rule}" stroke-width="1"/>
  <text x="${CARD.margin}" y="${CARD.statY}" class="stat">${g.advertisedBreakEvenPct.toFixed(0)}% → ${g.tp1.breakEvenHitPct.toFixed(0)}%</text>
  <text x="${CARD.margin}" y="${CARD.statLabelY}" class="statlab">Win rate needed to break even</text>

  <text x="640" y="${CARD.statY}" class="stat">${t.longTp1.hitPct.toFixed(0)}%</text>
  <text x="640" y="${CARD.statLabelY}" class="statlab">What the long trigger has hit</text>

  <text x="${CARD.right}" y="${CARD.statY}" text-anchor="end" class="stat">${A.geometry.long.stopInAtr.toFixed(2)} ATR</text>
  <text x="${CARD.right}" y="${CARD.statLabelY}" text-anchor="end" class="statlab">Its stop width — that part is right</text>
</svg>`);
