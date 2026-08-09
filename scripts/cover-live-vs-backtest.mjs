/**
 * Column card for the live-versus-backtest scoreboard.
 *
 * Three bars, one comparison: what a random hour does, what the backtest
 * promised, what the scanner actually delivered on money. Drawn from
 * research/live-catches.json so the card cannot drift from the post.
 *
 * A bar chart rather than a hero number because the whole point is the gap
 * between two of the three, and a single figure cannot show a gap.
 *
 * The delivered bar is the accent; the other two are context. Same validated
 * pair as the hour-of-day card — #c98500 against #3987e5, 27.4 delta-E under
 * protanopia, every check passing on the dark surface.
 *
 *   node scripts/cover-live-vs-backtest.mjs > media/live-vs-backtest.html
 */

import { readFileSync } from "node:fs";

const J = JSON.parse(readFileSync("research/live-catches.json", "utf8"));
const v = J.versusBacktest;

const bars = [
  { label: "Giờ ngẫu nhiên", value: v.baselineTouchPct, note: "mốc so sánh", accent: false },
  { label: "Backtest hứa", value: v.backtestTouchPct, note: "trên quá khứ", accent: false },
  { label: "Chạy thật", value: v.livePct, note: `${J.excludingDelistings.n} lệnh sạch`, accent: true },
];

const X0 = 90, BASE = 470, MAX = 32, H = 250, BAR_W = 190, GAP = 90;
const y = (val) => BASE - (val / MAX) * H;
const f2 = (n) => Number(n).toFixed(2);

const els = bars.map((b, i) => {
  const x = X0 + i * (BAR_W + GAP);
  const top = y(b.value);
  const fill = b.accent ? "#c98500" : "#3987e5";
  return `
  <path d="M${x} ${BASE} V${top + 4} a4 4 0 0 1 4 -4 h${BAR_W - 8} a4 4 0 0 1 4 4 V${BASE} Z"
        fill="${fill}" opacity="${b.accent ? 1 : 0.75}"/>
  <text x="${x + BAR_W / 2}" y="${top - 18}" text-anchor="middle" class="val" fill="${fill}">${f2(b.value)}%</text>
  <text x="${x + BAR_W / 2}" y="${BASE + 30}" text-anchor="middle" class="lab">${b.label}</text>
  <text x="${x + BAR_W / 2}" y="${BASE + 54}" text-anchor="middle" class="labsub">${b.note}</text>`;
}).join("");

// The gap is the story, so it is drawn rather than left to be inferred.
const gapX = X0 + (BAR_W + GAP) * 1 + BAR_W + GAP / 2;
const yB = y(v.backtestTouchPct), yL = y(v.livePct);

process.stdout.write(`<!doctype html><meta charset="utf-8">
<style>
  html,body{margin:0;width:1200px;height:630px;overflow:hidden;background:#0b0e11}
  svg{display:block}
  text{font-family:"DejaVu Sans",system-ui,sans-serif;fill:#e8eaed}
  .kicker{font-size:19px;letter-spacing:3.5px;fill:#f0b90b;font-weight:700}
  .title{font-size:44px;font-weight:800;letter-spacing:-0.5px}
  .sub{font-size:19px;fill:#9aa3ad}
  .val{font-size:30px;font-weight:800}
  .lab{font-size:19px;font-weight:700}
  .labsub{font-size:15px;fill:#8b949e}
  .gap{font-size:18px;font-weight:700;fill:#9085e9}
  .stat{font-size:22px;font-weight:700}
  .statlab{font-size:15px;fill:#8b949e}
  .mark{font-size:17px;font-weight:700;fill:#f0b90b;letter-spacing:1px}
</style>
<svg width="1200" height="630" viewBox="0 0 1200 630" xmlns="http://www.w3.org/2000/svg">
  <rect width="1200" height="630" fill="#0b0e11"/>
  <rect x="0" y="0" width="1200" height="4" fill="#c98500"/>

  <text x="64" y="56" class="kicker">BẢNG ĐIỂM THẬT</text>
  <text x="1136" y="56" text-anchor="end" class="mark">MAIX8</text>

  <text x="64" y="118" class="title">Backtest hứa ${f2(v.backtestTouchPct)}%.</text>
  <text x="64" y="166" class="title">Tiền thật trả ${f2(v.livePct)}%.</text>
  <text x="64" y="202" class="sub">Cảnh báo volume theo giờ · chạm +10% trong 12 tiếng · ${J.settled} lệnh đã chốt</text>

  ${els}
  <line x1="${X0 - 14}" x2="${X0 + 3 * BAR_W + 2 * GAP}" y1="${BASE}" y2="${BASE}" stroke="#39414b" stroke-width="1.5"/>

  <line x1="${gapX}" x2="${gapX}" y1="${yB}" y2="${yL}" stroke="#9085e9" stroke-width="2"/>
  <line x1="${gapX - 8}" x2="${gapX + 8}" y1="${yB}" y2="${yB}" stroke="#9085e9" stroke-width="2"/>
  <line x1="${gapX - 8}" x2="${gapX + 8}" y1="${yL}" y2="${yL}" stroke="#9085e9" stroke-width="2"/>
  <text x="${gapX}" y="${yB - 22}" text-anchor="middle" class="gap">−${f2(Math.abs(v.shortfallPp))} điểm</text>

  <line x1="64" x2="1136" y1="556" y2="556" stroke="#252a31" stroke-width="1"/>
  <text x="64" y="590" class="stat" fill="#c98500">${f2(v.liveLiftVsBaseline)}x</text>
  <text x="64" y="612" class="statlab">Chạy thật so với giờ ngẫu nhiên</text>

  <text x="470" y="590" class="stat">${J.pending}</text>
  <text x="470" y="612" class="statlab">Lệnh còn mở · không được tính là thắng</text>

  <text x="880" y="590" class="stat">${J.delistingDriven.count}</text>
  <text x="880" y="612" class="statlab">Lệnh do tin gỡ niêm yết · đã loại bỏ</text>
</svg>`);
