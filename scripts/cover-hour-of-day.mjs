/**
 * The column card for the hour-of-day study.
 *
 * Built from research/hour-of-day.json rather than typed in, so the picture and
 * the post can never disagree — a cover with a hand-copied number is a claim
 * nobody checks.
 *
 * Palette is two categorical slots validated against the dark chart surface:
 * #c98500 for the evening block, #3987e5 for the rest of the day. Binance yellow
 * (#f0b90b) is the site's brand colour and was the obvious pick; it fails the
 * lightness band on a dark surface, so it stays on the wordmark, where it is
 * text rather than a data mark, and the bars use the stepped yellow instead.
 *
 * The x-axis is Vietnam time, not UTC. The study is indexed by UTC because that
 * is what the exchange stamps, but a reader deciding whether to leave a position
 * open tonight needs the hour on their own clock.
 *
 *   node scripts/cover-hour-of-day.mjs > media/hour-of-day.html
 */

import { readFileSync } from "node:fs";

const J = JSON.parse(readFileSync("research/hour-of-day.json", "utf8"));
const EVENING = J.method.eveningHoursUtc;

const bars = [];
for (let utc = 0; utc < 24; utc++) {
  const h = J.byHour[utc];
  if (!h) continue;
  bars.push({ utc, vn: (utc + 7) % 24, range: h.medianRangePct, evening: EVENING.includes(utc) });
}
bars.sort((a, b) => a.vn - b.vn);

const peak = bars.reduce((a, b) => (a.range > b.range ? a : b));
const trough = bars.reduce((a, b) => (a.range < b.range ? a : b));

const X0 = 88, X1 = 1136, BASE = 498, Y_MAX = 1.0, H = 236;
const slot = (X1 - X0) / bars.length;
const BAR_W = slot - 7;               // 7px of surface between bars, over the 2px minimum
const y = (v) => BASE - (v / Y_MAX) * H;

const f2 = (v) => v.toFixed(2);
const vi = (n) => n.toLocaleString("de-DE"); // dot thousands, as written in Vietnamese

const gridlines = [0.25, 0.5, 0.75, 1.0].map((g) => `
  <line x1="${X0}" x2="${X1}" y1="${y(g)}" y2="${y(g)}" stroke="#252a31" stroke-width="1"/>
  <text x="${X0 - 14}" y="${y(g) + 5}" text-anchor="end" class="ax">${f2(g)}%</text>`).join("");

const rects = bars.map((b, i) => {
  const x = X0 + i * slot + 3.5;
  const h = BASE - y(b.range);
  const fill = b.evening ? "#c98500" : "#3987e5";
  // 4px rounded data-end, square against the baseline.
  return `<path d="M${x} ${BASE} V${y(b.range) + 4} a4 4 0 0 1 4 -4 h${BAR_W - 8} a4 4 0 0 1 4 4 V${BASE} Z"
    fill="${fill}" opacity="${b.evening ? 1 : 0.82}"/>`;
}).join("");

const ticks = bars.map((b, i) => {
  if (b.vn % 3 !== 0) return "";
  return `<text x="${X0 + i * slot + slot / 2}" y="${BASE + 26}" text-anchor="middle" class="ax">${b.vn}h</text>`;
}).join("");

const peakX = X0 + bars.indexOf(peak) * slot + slot / 2;
const troughX = X0 + bars.indexOf(trough) * slot + slot / 2;

process.stdout.write(`<!doctype html><meta charset="utf-8">
<style>
  @font-face{font-family:x;src:local("DejaVu Sans")}
  html,body{margin:0;width:1200px;height:630px;overflow:hidden;background:#0b0e11}
  svg{display:block}
  text{font-family:"DejaVu Sans",system-ui,sans-serif;fill:#e8eaed}
  .kicker{font-size:19px;letter-spacing:3.5px;fill:#f0b90b;font-weight:700}
  .title{font-size:46px;font-weight:800;letter-spacing:-0.5px}
  .sub{font-size:20px;fill:#9aa3ad}
  .ax{font-size:15px;fill:#6b757f}
  .callout{font-size:20px;font-weight:700}
  .stat{font-size:22px;font-weight:700}
  .statlab{font-size:15px;fill:#8b949e}
  .legend{font-size:16px;fill:#9aa3ad}
  .mark{font-size:17px;font-weight:700;fill:#f0b90b;letter-spacing:1px}
</style>
<svg width="1200" height="630" viewBox="0 0 1200 630" xmlns="http://www.w3.org/2000/svg">
  <rect width="1200" height="630" fill="#0b0e11"/>
  <rect x="0" y="0" width="1200" height="4" fill="#c98500"/>

  <text x="64" y="56" class="kicker">GIỜ CỦA THỊ TRƯỜNG</text>
  <text x="1136" y="56" text-anchor="end" class="mark">MAIX8</text>

  <text x="64" y="118" class="title">BTC ngủ ban ngày.</text>
  <text x="64" y="170" class="title">Nó thức lúc ${peak.vn} giờ tối.</text>
  <text x="64" y="204" class="sub">Biên độ trung vị mỗi giờ · ${vi(J.hours)} giờ nến · 2 năm · giờ Việt Nam</text>

  <g>
    <rect x="912" y="112" width="14" height="14" rx="3" fill="#c98500"/>
    <text x="936" y="124" class="legend">Phiên tối (19–24h)</text>
    <rect x="912" y="142" width="14" height="14" rx="3" fill="#3987e5" opacity="0.82"/>
    <text x="936" y="154" class="legend">Các giờ còn lại</text>
  </g>

  ${gridlines}
  ${rects}
  <line x1="${X0}" x2="${X1}" y1="${BASE}" y2="${BASE}" stroke="#39414b" stroke-width="1.5"/>
  ${ticks}

  <line x1="${peakX}" x2="${peakX}" y1="${y(peak.range) - 46}" y2="${y(peak.range) - 10}" stroke="#c98500" stroke-width="2"/>
  <text x="${peakX}" y="${y(peak.range) - 56}" text-anchor="middle" class="callout" fill="#c98500">${f2(peak.range)}% — dữ nhất ngày</text>

  <line x1="${troughX}" x2="${troughX}" y1="${y(trough.range) - 40}" y2="${y(trough.range) - 8}" stroke="#5b6b7f" stroke-width="2"/>
  <text x="${troughX}" y="${y(trough.range) - 50}" text-anchor="middle" class="callout" fill="#8b949e">${f2(trough.range)}% — ${trough.vn}h trưa, ngủ</text>

  <line x1="64" x2="1136" y1="556" y2="556" stroke="#252a31" stroke-width="1"/>
  <text x="64" y="590" class="stat" fill="#c98500">${f2(J.evening.medianRangePct)}% vs ${f2(J.rest.medianRangePct)}%</text>
  <text x="64" y="612" class="statlab">Biên độ tối so với ngày · ${f2(J.evening.sizeVsRest.sigmas)} sigma</text>

  <text x="470" y="590" class="stat">${f2(J.evening.positiveSharePct)}%</text>
  <text x="470" y="612" class="statlab">Số giờ tối tăng giá · ${f2(J.evening.directionVsRest.sigmas)} sigma</text>

  <text x="810" y="590" class="stat">${f2(J.eveningBlock.p25RangePct)}–${f2(J.eveningBlock.p75RangePct)}%</text>
  <text x="810" y="612" class="statlab">Biên độ nửa số phiên tối · n=${J.eveningBlock.sessions}</text>

</svg>`);
