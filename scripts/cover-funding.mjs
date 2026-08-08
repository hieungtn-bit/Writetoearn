/**
 * Column card for the funding-threshold audit.
 *
 * Drawn from research/funding-distribution.json, so the picture cannot drift
 * from the post. The chart is deliberately not a distribution histogram: the
 * finding is about four claimed thresholds and where they land, and a histogram
 * would make the reader do that comparison themselves.
 *
 * Instead it is a single axis of the actual range, with the four thresholds
 * marked on it. Two of them sit outside the data entirely, which is the whole
 * story and needs no explanation once you can see it.
 *
 * Palette: #c98500 for the readings that exist, #9085e9 for the thresholds that
 * cannot occur. The obvious pick for "impossible" was a red, and the validator
 * refused it: #d95926 against #c98500 separates by only 4.8 delta-E under
 * deuteranopia and 10.6 with normal vision — orange beside yellow, which most
 * readers cannot tell apart and some cannot see at all. The violet passes every
 * check at 27.3 and 27.5. Dashes carry the meaning; colour only has to be
 * distinguishable.
 *
 *   node scripts/cover-funding.mjs > media/funding.html
 */

import { readFileSync } from "node:fs";

const J = JSON.parse(readFileSync("research/funding-distribution.json", "utf8"));
const d = J.distribution;
const t = J.claimedThresholds;

const X0 = 90, X1 = 1110, AXIS = 360;
// The scale has to show the unreachable thresholds, or the point is invisible.
const LO = -0.010, HI = 0.045;
const x = (v) => X0 + ((v - LO) / (HI - LO)) * (X1 - X0);

const f2 = (v) => Number(v).toFixed(2);
const f4 = (v) => Number(v).toFixed(4);

/** The band the data actually occupies, p05 to max. */
const bandX0 = x(d.p05), bandX1 = x(d.max);

const marks = [
  { v: t.healthyLow.level, label: '"lành mạnh" dưới', pct: t.healthyLow.percentileOfLevel, real: true, up: true },
  { v: t.healthyHigh.level, label: '"lành mạnh" trên', pct: t.healthyHigh.percentileOfLevel, real: true, up: false },
  { v: t.crowdingWatch.level, label: '"long đông"', real: false, up: true },
  { v: t.extreme.level, label: '"cực đoan"', real: false, up: false },
];

const markEls = marks.map((m) => {
  const px = x(m.v);
  const colour = m.real ? "#c98500" : "#9085e9";
  const y1 = m.up ? AXIS - 96 : AXIS + 30;
  const y2 = m.up ? AXIS - 14 : AXIS + 96;
  const ty = m.up ? AXIS - 106 : AXIS + 118;
  const sub = m.real ? `phân vị ${f2(m.pct)}` : "không bao giờ xảy ra";
  return `
  <line x1="${px}" x2="${px}" y1="${y1}" y2="${y2}" stroke="${colour}" stroke-width="2" stroke-dasharray="${m.real ? "0" : "5 4"}"/>
  <text x="${px}" y="${ty}" text-anchor="middle" class="mk" fill="${colour}">${m.label} ${m.v}%</text>
  <text x="${px}" y="${ty + (m.up ? -24 : 24)}" text-anchor="middle" class="mksub" fill="${colour}">${sub}</text>`;
}).join("");

process.stdout.write(`<!doctype html><meta charset="utf-8">
<style>
  html,body{margin:0;width:1200px;height:630px;overflow:hidden;background:#0b0e11}
  svg{display:block}
  text{font-family:"DejaVu Sans",system-ui,sans-serif;fill:#e8eaed}
  .kicker{font-size:19px;letter-spacing:3.5px;fill:#f0b90b;font-weight:700}
  .title{font-size:44px;font-weight:800;letter-spacing:-0.5px}
  .sub{font-size:19px;fill:#9aa3ad}
  .mk{font-size:19px;font-weight:700}
  .mksub{font-size:16px;font-weight:400}
  .ax{font-size:15px;fill:#6b757f}
  .bandlab{font-size:15px;font-weight:700;fill:#0b0e11}
  .stat{font-size:22px;font-weight:700}
  .statlab{font-size:15px;fill:#8b949e}
  .mark{font-size:17px;font-weight:700;fill:#f0b90b;letter-spacing:1px}
</style>
<svg width="1200" height="630" viewBox="0 0 1200 630" xmlns="http://www.w3.org/2000/svg">
  <rect width="1200" height="630" fill="#0b0e11"/>
  <rect x="0" y="0" width="1200" height="4" fill="#9085e9"/>

  <text x="64" y="56" class="kicker">NGƯỠNG AI CŨNG CHÉP</text>
  <text x="1136" y="56" text-anchor="end" class="mark">MAIX8</text>

  <text x="64" y="118" class="title">Hai ngưỡng funding này</text>
  <text x="64" y="166" class="title">chưa từng xảy ra một lần nào.</text>
  <text x="64" y="202" class="sub">Funding rate $BTC mỗi 8 tiếng · ${J.distribution.n} kỳ · ${J.span.days} ngày · ${J.venue}</text>

  ${markEls}

  <!-- where the data actually lives -->
  <rect x="${bandX0}" y="${AXIS - 13}" width="${bandX1 - bandX0}" height="26" rx="6" fill="#c98500"/>
  <text x="${(bandX0 + bandX1) / 2}" y="${AXIS + 6}" text-anchor="middle" class="bandlab">dữ liệu thật</text>

  <line x1="${X0}" x2="${X1}" y1="${AXIS}" y2="${AXIS}" stroke="#39414b" stroke-width="1.5"/>

  <line x1="64" x2="1136" y1="556" y2="556" stroke="#252a31" stroke-width="1"/>
  <text x="64" y="590" class="stat" fill="#c98500">${f4(d.max)}%</text>
  <text x="64" y="612" class="statlab">Trần cứng · phân vị 95 = 99 = lớn nhất</text>

  <text x="470" y="590" class="stat">${f2(t.healthyHigh.percentileOfLevel - t.healthyLow.percentileOfLevel)} điểm</text>
  <text x="470" y="612" class="statlab">Bề rộng dải "lành mạnh", tính theo phân vị</text>

  <text x="880" y="590" class="stat">${f2(J.auditedReading.percentile)}</text>
  <text x="880" y="612" class="statlab">Phân vị của con số gọi là "dương nhẹ"</text>
</svg>`);
