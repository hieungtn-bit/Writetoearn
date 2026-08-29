/**
 * Column card for post 62 — what waiting for confirmation does to the geometry.
 *
 * The form follows the argument. The claim is about two *distances* measured
 * from the same entry in opposite directions, so the chart is diverging: each
 * entry is one row, the entry price is the neutral midpoint, the risk leg runs
 * left and the reward leg runs right, and both are drawn on one shared scale in
 * percent. A reader compares lengths and sees the inversion without reading a
 * single number — the top row's right leg is the long one, the bottom row's
 * left leg is.
 *
 * Not a price chart. A candlestick would invite the reader to look for a
 * pattern; nothing here is a prediction about direction, and drawing one would
 * make a claim the post explicitly refuses to make.
 *
 * Colour is doing the diverging job: #c98500 for risk, #3987e5 for reward,
 * around a neutral midpoint rule. Validated against #0b0e11 — 27.4 delta-E
 * protan, 30.7 normal, every check passing. Both legs also carry a direct
 * label, so identity never rests on hue alone.
 *
 * Figures come from research/icp-grok-check.json so the card cannot drift away
 * from the post it illustrates.
 *
 *   node scripts/cover-cho-xac-nhan.mjs > media/cho-xac-nhan.html
 *   node scripts/render-card.mjs media/cho-xac-nhan.html media/cho-xac-nhan.png
 */

import { readFileSync } from "node:fs";

const J = JSON.parse(readFileSync("research/icp-grok-check.json", "utf8"));
const spot = J.geometry.spot, trig = J.geometry.trigger;
const tp1 = J.baseRates.ladder[0].byHorizon.find((b) => b.horizonDays === 30);

const f1 = (v) => Number(v).toFixed(1);
const f2 = (v) => Number(v).toFixed(2);

/** One shared scale for both rows, so the two rows are comparable by length. */
const MID = 500, SPAN = 380, MAX = 13;
const len = (pct) => (Math.abs(pct) / MAX) * SPAN;

const RISK = "#c98500", REWARD = "#3987e5";
const BAR = 30, GAP = 2;

const rows = [
  {
    label: "Vào ngay",
    note: `${f2(spot.entry)}`,
    risk: spot.riskPct, reward: spot.targets[0].rewardPct,
    rr: spot.targets[0].rr, be: spot.breakevenWinRatePct,
    y: 322,
  },
  {
    label: "Chờ xác nhận",
    note: `${f2(trig.entry)}`,
    risk: trig.riskPct, reward: trig.targets[0].rewardPct,
    rr: trig.targets[0].rr, be: trig.breakevenWinRatePct,
    y: 452,
  },
];

const els = rows.map((r) => {
  const rl = len(r.risk), rw = len(r.reward);
  const top = r.y - BAR / 2;
  return `
  <text x="64" y="${r.y - 40}" class="rlab">${r.label}</text>
  <text x="64" y="${r.y - 18}" class="rnote">vào ở ${r.note} · R:R ${f2(r.rr)} · cần thắng ${f1(r.be)}%</text>

  <rect x="${MID - GAP - rl}" y="${top}" width="${rl}" height="${BAR}" rx="4" fill="${RISK}"/>
  <text x="${MID - GAP - rl - 12}" y="${r.y + 6}" text-anchor="end" class="rval" fill="${RISK}">−${f2(r.risk)}%</text>

  <rect x="${MID + GAP}" y="${top}" width="${rw}" height="${BAR}" rx="4" fill="${REWARD}"/>
  <text x="${MID + GAP + rw + 12}" y="${r.y + 6}" class="rval" fill="${REWARD}">+${f2(r.reward)}%</text>`;
}).join("");

process.stdout.write(`<!doctype html><meta charset="utf-8">
<style>
  html,body{margin:0;width:1200px;height:630px;overflow:hidden;background:#0b0e11}
  svg{display:block}
  text{font-family:"DejaVu Sans",system-ui,sans-serif;fill:#e8eaed}
  .kicker{font-size:19px;letter-spacing:3.5px;fill:#f0b90b;font-weight:700}
  .title{font-size:43px;font-weight:800;letter-spacing:-0.5px}
  .sub{font-size:19px;fill:#9aa3ad}
  .rlab{font-size:22px;font-weight:700}
  .rnote{font-size:15px;fill:#8b949e}
  .rval{font-size:19px;font-weight:700}
  .rbe{font-size:17px;font-weight:700;fill:#9aa3ad}
  .legend{font-size:16px;font-weight:700}
  .axis{font-size:14px;fill:#6b757f}
  .stat{font-size:22px;font-weight:700}
  .statlab{font-size:15px;fill:#8b949e}
  .mark{font-size:17px;font-weight:700;fill:#f0b90b;letter-spacing:1px}
</style>
<svg width="1200" height="630" viewBox="0 0 1200 630" xmlns="http://www.w3.org/2000/svg">
  <rect width="1200" height="630" fill="#0b0e11"/>
  <rect x="0" y="0" width="1200" height="4" fill="#c98500"/>

  <text x="64" y="56" class="kicker">HÌNH HỌC CỦA MỘT KÈO</text>
  <text x="1136" y="56" text-anchor="end" class="mark">MAIX8</text>

  <text x="64" y="118" class="title">Chờ xác nhận không làm kèo an toàn hơn.</text>
  <text x="64" y="164" class="title">Nó đảo ngược tỷ lệ được–mất.</text>
  <text x="64" y="200" class="sub">Cùng một mức cắt lỗ ${f2(trig.stop)} · $ICP ${f2(J.price)} · mục tiêu đầu 2.50</text>

  <g>
    <rect x="756" y="190" width="14" height="14" rx="3" fill="${RISK}"/>
    <text x="780" y="202" class="legend" fill="${RISK}">rủi ro</text>
    <rect x="872" y="190" width="14" height="14" rx="3" fill="${REWARD}"/>
    <text x="896" y="202" class="legend" fill="${REWARD}">lợi nhuận tới TP1</text>
  </g>

  ${els}

  <!-- the entry itself: neutral midpoint both legs are measured from -->
  <line x1="${MID}" x2="${MID}" y1="248" y2="478" stroke="#39414b" stroke-width="2"/>
  <text x="${MID}" y="240" text-anchor="middle" class="axis">điểm vào</text>

  <line x1="64" x2="1136" y1="512" y2="512" stroke="#252a31" stroke-width="1"/>
  <text x="64" y="548" class="stat" fill="${REWARD}">${f2(spot.targets[0].rr)} → ${f2(trig.targets[0].rr)}</text>
  <text x="64" y="570" class="statlab">R:R sau khi chờ · dưới 1 là chân dưới dài hơn chân trên</text>

  <text x="560" y="548" class="stat" fill="${RISK}">${f1(tp1.upPct)}%</text>
  <text x="560" y="570" class="statlab">Tỷ lệ chạm TP1 trước, đo từng nến trên ${tp1.n.toLocaleString("en-US")} cửa sổ</text>

  <text x="1136" y="548" text-anchor="end" class="stat">${f1(trig.breakevenWinRatePct)}%</text>
  <text x="1136" y="570" text-anchor="end" class="statlab">Tỷ lệ cần có để hoà vốn</text>
</svg>`);
