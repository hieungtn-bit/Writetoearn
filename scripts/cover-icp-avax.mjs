/**
 * Column card for the ICP / AVAX comparison.
 *
 * Four paired rows, because the argument is that the widely-quoted differences
 * are the small ones. Each row is a horizontal pair on a shared scale so the
 * reader compares lengths rather than reading numbers — the base-width rows
 * nearly match, and the overhead-supply row does not.
 *
 * Drawn from research/icp-vs-avax.json so the card cannot drift from the post.
 *
 * Palette is the validated pair used on every card in this series: #c98500 for
 * ICP, #3987e5 for AVAX. 27.4 delta-E under protanopia, every check passing on
 * the dark surface. Colour carries identity only — each bar is also labelled,
 * so a reader who cannot separate the hues loses nothing.
 *
 *   node scripts/cover-icp-avax.mjs > media/icp-avax.html
 */

import { readFileSync } from "node:fs";

const J = JSON.parse(readFileSync("research/icp-vs-avax.json", "utf8"));
const I = J.pairs.ICP, A = J.pairs.AVAX;

const f1 = (v) => Number(v).toFixed(1);
const f2 = (v) => Number(v).toFixed(2);

const rows = [
  {
    label: "Bề rộng nền 25 ngày",
    note: "cái ai cũng nhắc",
    icp: I.base.widthPct, avax: A.base.widthPct,
    fmt: (v) => `${f2(v)}%`, max: 70,
  },
  {
    label: "Khối lượng / vốn hoá",
    note: "thanh khoản, tính theo tỷ lệ",
    icp: I.volumeToMarketCapPct, avax: A.volumeToMarketCapPct,
    fmt: (v) => `${f2(v)}%`, max: 70,
  },
  {
    label: "Hàng kẹt trên giá",
    note: "cái chẳng ai nhắc",
    icp: I.underwaterPct, avax: A.underwaterPct,
    fmt: (v) => `${f1(v)}%`, max: 70, accent: true,
  },
];

const X0 = 470, W = 560, ROW_H = 92, TOP = 268, BAR_H = 20;
const len = (v, max) => (v / max) * W;

const els = rows.map((r, i) => {
  const y = TOP + i * ROW_H;
  const strong = r.accent ? 1 : 0.85;
  return `
  <text x="64" y="${y + 10}" class="rlab">${r.label}</text>
  <text x="64" y="${y + 34}" class="rnote">${r.note}</text>

  <rect x="${X0}" y="${y - 12}" width="${len(r.icp, r.max)}" height="${BAR_H}" rx="4" fill="#c98500" opacity="${strong}"/>
  <text x="${X0 + len(r.icp, r.max) + 12}" y="${y + 3}" class="rval" fill="#c98500">${r.fmt(r.icp)}</text>

  <rect x="${X0}" y="${y + 14}" width="${len(r.avax, r.max)}" height="${BAR_H}" rx="4" fill="#3987e5" opacity="${strong}"/>
  <text x="${X0 + len(r.avax, r.max) + 12}" y="${y + 29}" class="rval" fill="#3987e5">${r.fmt(r.avax)}</text>`;
}).join("");

process.stdout.write(`<!doctype html><meta charset="utf-8">
<style>
  html,body{margin:0;width:1200px;height:630px;overflow:hidden;background:#0b0e11}
  svg{display:block}
  text{font-family:"DejaVu Sans",system-ui,sans-serif;fill:#e8eaed}
  .kicker{font-size:19px;letter-spacing:3.5px;fill:#f0b90b;font-weight:700}
  .title{font-size:42px;font-weight:800;letter-spacing:-0.5px}
  .sub{font-size:19px;fill:#9aa3ad}
  .rlab{font-size:21px;font-weight:700}
  .rnote{font-size:15px;fill:#8b949e}
  .rval{font-size:18px;font-weight:700}
  .legend{font-size:17px;font-weight:700}
  .stat{font-size:22px;font-weight:700}
  .statlab{font-size:15px;fill:#8b949e}
  .mark{font-size:17px;font-weight:700;fill:#f0b90b;letter-spacing:1px}
</style>
<svg width="1200" height="630" viewBox="0 0 1200 630" xmlns="http://www.w3.org/2000/svg">
  <rect width="1200" height="630" fill="#0b0e11"/>
  <rect x="0" y="0" width="1200" height="4" fill="#c98500"/>

  <text x="64" y="56" class="kicker">ĐO LẠI MỘT SO SÁNH</text>
  <text x="1136" y="56" text-anchor="end" class="mark">MAIX8</text>

  <text x="64" y="118" class="title">Nền ICP sạch hơn thật.</text>
  <text x="64" y="164" class="title">Nhưng đó là khác biệt nhỏ nhất.</text>
  <text x="64" y="200" class="sub">$ICP ${f2(I.price)} · $AVAX ${f2(A.price)} · cùng một thước đo cho cả hai</text>

  <g>
    <rect x="470" y="222" width="14" height="14" rx="3" fill="#c98500"/>
    <text x="494" y="234" class="legend" fill="#c98500">ICP</text>
    <rect x="570" y="222" width="14" height="14" rx="3" fill="#3987e5"/>
    <text x="594" y="234" class="legend" fill="#3987e5">AVAX</text>
  </g>

  ${els}

  <line x1="64" x2="1136" y1="556" y2="556" stroke="#252a31" stroke-width="1"/>
  <text x="64" y="590" class="stat" fill="#c98500">−${f1(Math.abs(I.fromAthPct))}% / −${f1(Math.abs(A.fromAthPct))}%</text>
  <text x="64" y="612" class="statlab">Cách đỉnh lịch sử · ICP / AVAX</text>

  <text x="560" y="590" class="stat">${Math.round(I.multipleToReclaimAth)}x vs ${Math.round(A.multipleToReclaimAth)}x</text>
  <text x="560" y="612" class="statlab">Số lần cần tăng để về đỉnh cũ</text>

  <text x="1136" y="590" text-anchor="end" class="stat">${f1(I.volumeTrendPct)}% / ${f1(A.volumeTrendPct)}%</text>
  <text x="1136" y="612" text-anchor="end" class="statlab">Xu hướng khối lượng · ngược chiều</text>
</svg>`);
