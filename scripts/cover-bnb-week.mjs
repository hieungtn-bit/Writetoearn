/**
 * Column card for the BNB weekly plan.
 *
 * The chart is the weekly range distribution with the two stop distances drawn
 * across it, because that is the argument: a stop sized off a daily ATR sits
 * inside the quietest quarter of weeks, and a week is not a day.
 *
 * A distribution rather than a price chart. A candlestick would invite the
 * reader to find a pattern; the claim here is about distance, and distance is
 * what a distribution shows.
 *
 * Palette: #c98500 for the weekly stop that clears the median, #9085e9 for the
 * daily stop that does not. Validated at 27.3 delta-E under protanopia against
 * the dark surface — the same pair the funding card uses for "real versus
 * unreachable", which is the same relationship.
 *
 *   node scripts/cover-bnb-week.mjs > media/bnb-week.html
 */

import { readFileSync } from "node:fs";

const J = JSON.parse(readFileSync("research/bnb-week.json", "utf8"));
const w = J.weeklyRange;

const f1 = (v) => Number(v).toFixed(1);
const f2 = (v) => Number(v).toFixed(2);

const X0 = 96, X1 = 1120, AXIS = 430, MAX = 24;
const x = (v) => X0 + (v / MAX) * (X1 - X0);

/** The interquartile box, with the median inside it. */
const boxA = x(w.p25Pct), boxB = x(w.p75Pct), med = x(w.medianPct), p90 = x(w.p90Pct);

const stops = [
  { v: J.dayPlan.stopDistancePct, label: "Stop theo ATR ngày", sub: "nằm trong nhóm tuần yên nhất", colour: "#9085e9", up: true },
  { v: J.weekPlan.stopDistancePct, label: "Stop theo biên tuần", sub: "vượt nửa số tuần", colour: "#c98500", up: false },
];

const stopEls = stops.map((s) => {
  const px = x(s.v);
  const y1 = s.up ? AXIS - 118 : AXIS + 34;
  const y2 = s.up ? AXIS - 34 : AXIS + 74;
  const ty = s.up ? AXIS - 130 : AXIS + 96;
  return `
  <line x1="${px}" x2="${px}" y1="${y1}" y2="${y2}" stroke="${s.colour}" stroke-width="3"/>
  <text x="${px}" y="${ty}" text-anchor="middle" class="mk" fill="${s.colour}">${s.label} ${f2(s.v)}%</text>
  <text x="${px}" y="${ty + (s.up ? -24 : 24)}" text-anchor="middle" class="mksub" fill="${s.colour}">${s.sub}</text>`;
}).join("");

process.stdout.write(`<!doctype html><meta charset="utf-8">
<style>
  html,body{margin:0;width:1200px;height:630px;overflow:hidden;background:#0b0e11}
  svg{display:block}
  text{font-family:"DejaVu Sans",system-ui,sans-serif;fill:#e8eaed}
  .kicker{font-size:19px;letter-spacing:3.5px;fill:#f0b90b;font-weight:700}
  .title{font-size:43px;font-weight:800;letter-spacing:-0.5px}
  .sub{font-size:19px;fill:#9aa3ad}
  .mk{font-size:19px;font-weight:700}
  .mksub{font-size:16px}
  .boxlab{font-size:16px;font-weight:700;fill:#0b0e11}
  .tick{font-size:15px;fill:#6b757f}
  .stat{font-size:22px;font-weight:700}
  .statlab{font-size:15px;fill:#8b949e}
  .mark{font-size:17px;font-weight:700;fill:#f0b90b;letter-spacing:1px}
</style>
<svg width="1200" height="630" viewBox="0 0 1200 630" xmlns="http://www.w3.org/2000/svg">
  <rect width="1200" height="630" fill="#0b0e11"/>
  <rect x="0" y="0" width="1200" height="4" fill="#c98500"/>

  <text x="64" y="56" class="kicker">KẾ HOẠCH TUẦN · BNB</text>
  <text x="1136" y="56" text-anchor="end" class="mark">MAIX8</text>

  <text x="64" y="118" class="title">Một tuần BNB đi ${f2(w.medianPct)}%.</text>
  <text x="64" y="164" class="title">Stop theo ATR ngày chỉ ${f2(J.dayPlan.stopDistancePct)}%.</text>
  <text x="64" y="200" class="sub">Biên độ tuần đỉnh–đáy · ${w.weeks} tuần hoàn tất · $BNB ${f2(J.price)}</text>

  <!-- interquartile box: half of all weeks land inside it -->
  <rect x="${boxA}" y="${AXIS - 26}" width="${boxB - boxA}" height="52" rx="6" fill="#3987e5" opacity="0.5"/>
  <text x="${(boxA + boxB) / 2}" y="${AXIS + 6}" text-anchor="middle" class="boxlab">nửa số tuần nằm trong đây</text>

  <line x1="${med}" x2="${med}" y1="${AXIS - 26}" y2="${AXIS + 26}" stroke="#e8eaed" stroke-width="3"/>
  <line x1="${boxB}" x2="${p90}" y1="${AXIS}" y2="${AXIS}" stroke="#3987e5" stroke-width="2" stroke-dasharray="5 4"/>
  <line x1="${p90}" x2="${p90}" y1="${AXIS - 14}" y2="${AXIS + 14}" stroke="#3987e5" stroke-width="2"/>
  <text x="${p90 + 14}" y="${AXIS - 10}" class="tick">p90 ${f2(w.p90Pct)}%</text>

  ${stopEls}

  <line x1="${X0}" x2="${X1}" y1="${AXIS}" y2="${AXIS}" stroke="#39414b" stroke-width="1"/>

  <line x1="64" x2="1136" y1="556" y2="556" stroke="#252a31" stroke-width="1"/>
  <text x="64" y="590" class="stat" fill="#c98500">${f2(J.medianWeekOverDayStop)}x</text>
  <text x="64" y="612" class="statlab">Tuần trung vị so với stop ngày</text>

  <text x="480" y="590" class="stat">${f1(J.positioning.underwaterPct)}%</text>
  <text x="480" y="612" class="statlab">Hàng kẹt trên giá · gần như không có</text>

  <text x="1136" y="590" text-anchor="end" class="stat">${f1(w.positiveWeeksPct)}%</text>
  <text x="1136" y="612" text-anchor="end" class="statlab">Số tuần đóng cửa tăng · gần đồng xu</text>
</svg>`);
