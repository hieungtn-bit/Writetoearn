/**
 * Column card for post 66 — the levels in a 4-hour note, counted.
 *
 * A count chart, because "held well" and "repeatedly rejected" are claims about
 * counts and the fastest way to test one is to draw it. Five zones, bar length
 * is how many times price entered, and the two zones the note talks about most
 * are the two with no bar at all.
 *
 * The zero rows are the whole card, which makes them the hard part: an absent
 * bar reads as missing data unless it says otherwise, so each one carries an
 * explicit "0 lần chạm" rather than empty space.
 *
 * Where price did enter, the bar splits into what followed — a real partition,
 * since every visit either closed below the zone inside the lookahead or did
 * not. #c98500 for the ones that broke, #3987e5 for the ones that held.
 * Validated pair at 27.4 delta-E protan; both segments are also labelled and a
 * legend names them, so the split never rests on hue.
 *
 *   node scripts/cover-icp-4h.mjs > media/icp-4h.html
 *   node scripts/render-card.mjs media/icp-4h.html media/icp-4h.png
 */

import { readFileSync } from "node:fs";

const J = JSON.parse(readFileSync("research/icp-4h-check.json", "utf8"));
const z = J.zones, r = J.range, n = J.now;
const s1 = J.support.find((s) => s.nearPct === 1.0);

const f1 = (v) => Number(v).toFixed(1);
const f2 = (v) => Number(v).toFixed(2);

const BROKE = "#c98500", HELD = "#3987e5", MUTED = "#5a636d";

const rows = [
  { key: "supportNear", label: "2.15 – 2.17", note: 'bản phân tích: "đang được test"' },
  { key: "supportMain", label: "2.08 – 2.12", note: "bản phân tích: hỗ trợ chính" },
  { key: "supportDeep", label: "2.00 – 2.05", note: "bản phân tích: xếp thấp nhất" },
  { key: "resistNear", label: "2.22 – 2.26", note: 'bản phân tích: "liên tục bị từ chối"' },
  { key: "resistNext", label: "2.30 – 2.35", note: "bản phân tích: mốc xác nhận" },
].map((row) => ({ ...row, ...z[row.key] }));

const peak = Math.max(...rows.map((r2) => r2.visits), 1);
const X0 = 300, W = 520, TOP = 268, STEP = 54, BAR = 28;
const len = (v) => (v / peak) * W;

const els = rows.map((row, i) => {
  const y = TOP + i * STEP;
  const mid = y + BAR / 2 + 6;
  if (!row.visits) {
    return `
  <text x="${X0 - 20}" y="${mid}" text-anchor="end" class="zlab">${row.label}</text>
  <text x="${X0 - 20}" y="${mid + 20}" text-anchor="end" class="znote">${row.note}</text>
  <rect x="${X0}" y="${y}" width="4" height="${BAR}" rx="2" fill="${MUTED}"/>
  <text x="${X0 + 18}" y="${mid}" class="zzero">0 lần chạm</text>`;
  }
  const brokeW = len(row.brokeThroughDown);
  const heldW = len(row.visits - row.brokeThroughDown);
  return `
  <text x="${X0 - 20}" y="${mid}" text-anchor="end" class="zlab">${row.label}</text>
  <text x="${X0 - 20}" y="${mid + 20}" text-anchor="end" class="znote">${row.note}</text>
  <rect x="${X0}" y="${y}" width="${brokeW}" height="${BAR}" rx="4" fill="${BROKE}"/>
  <rect x="${X0 + brokeW + 2}" y="${y}" width="${Math.max(0, heldW - 2)}" height="${BAR}" rx="4" fill="${HELD}"/>
  <text x="${X0 + brokeW + heldW + 16}" y="${mid}" class="zval">${row.visits} lần · ${row.brokeThroughDown} thủng</text>`;
}).join("");

process.stdout.write(`<!doctype html><meta charset="utf-8">
<style>
  html,body{margin:0;width:1200px;height:630px;overflow:hidden;background:#0b0e11}
  svg{display:block}
  text{font-family:"DejaVu Sans",system-ui,sans-serif;fill:#e8eaed}
  .kicker{font-size:19px;letter-spacing:3.5px;fill:#f0b90b;font-weight:700}
  .title{font-size:43px;font-weight:800;letter-spacing:-0.5px}
  .sub{font-size:19px;fill:#9aa3ad}
  .zlab{font-size:20px;font-weight:700}
  .znote{font-size:14px;fill:#8b949e}
  .zval{font-size:17px;font-weight:700;fill:#c9d1d9}
  .zzero{font-size:17px;font-weight:700;fill:#8b949e}
  .legend{font-size:16px;font-weight:700}
  .stat{font-size:22px;font-weight:700}
  .statlab{font-size:15px;fill:#8b949e}
  .mark{font-size:17px;font-weight:700;fill:#f0b90b;letter-spacing:1px}
</style>
<svg width="1200" height="630" viewBox="0 0 1200 630" xmlns="http://www.w3.org/2000/svg">
  <rect width="1200" height="630" fill="#0b0e11"/>
  <rect x="0" y="0" width="1200" height="4" fill="#c98500"/>

  <text x="64" y="56" class="kicker">VÙNG HỖ TRỢ · KHÁNG CỰ, ĐẾM THỬ</text>
  <text x="1136" y="56" text-anchor="end" class="mark">MAIX8</text>

  <text x="64" y="118" class="title">"Liên tục bị từ chối."</text>
  <text x="64" y="164" class="title">Số lần giá chạm vùng đó: 0.</text>
  <text x="64" y="200" class="sub">$ICP khung 4H · ${J.range.bars} nến gần nhất · bỏ ${z.supportMain.lookaheadBars} nến cuối vì chưa có kết quả để chấm</text>

  <g>
    <rect x="${X0}" y="228" width="14" height="14" rx="3" fill="${BROKE}"/>
    <text x="${X0 + 24}" y="240" class="legend" fill="${BROKE}">sau đó thủng xuống</text>
    <rect x="${X0 + 210}" y="228" width="14" height="14" rx="3" fill="${HELD}"/>
    <text x="${X0 + 234}" y="240" class="legend" fill="${HELD}">giữ được</text>
  </g>

  ${els}

  <line x1="64" x2="1136" y1="536" y2="536" stroke="#252a31" stroke-width="1"/>
  <text x="64" y="572" class="stat">${f1(r.closesOutsidePct)}%</text>
  <text x="64" y="594" class="statlab">Số nến đóng cửa ngoài cái hộp được vẽ</text>

  <text x="520" y="572" class="stat">${f2(r.widthInDailyAtr)}</text>
  <text x="520" y="594" class="statlab">Bề rộng hộp, tính bằng ngày</text>

  <text x="1136" y="572" text-anchor="end" class="stat">${f2(s1.sigmasDeOverlapped)}σ</text>
  <text x="1136" y="594" text-anchor="end" class="statlab">Lợi thế hỗ trợ · chưa chứng minh</text>
</svg>`);
