/**
 * Column card for post 68 — a gate matrix, pass and fail.
 *
 * A matrix rather than a chart, because the claim is not about magnitude at
 * all: it is that a specific ruleset, applied to specific names, rejects the
 * name sitting at the top of the list. Rows are names, columns are the rules,
 * and the shape of the failures is the finding — the first row is almost solid.
 *
 * Each cell carries its own measured value inside it, so the matrix doubles as
 * the data table. A pass/fail grid where the reader has to trust the colouring
 * is a grid that cannot be checked, which would be the exact failure the post is
 * about.
 *
 * Colour is status, not identity: #3987e5 passes, #c98500 fails, on the
 * validated dark pairing. Every cell also states its value and every column its
 * threshold, so nothing is carried by hue.
 *
 *   node scripts/cover-cong-chua-chay.mjs > media/cong-chua-chay.html
 *   node scripts/render-card.mjs media/cong-chua-chay.html media/cong-chua-chay.png
 */

import { readFileSync } from "node:fs";

const J = JSON.parse(readFileSync("research/pipeline-v3-check.json", "utf8"));
const by = Object.fromEntries(J.rows.map((r) => [r.asset, r]));

const f1 = (v) => Number(v).toFixed(1);
const pct = (v) => (Math.abs(Number(v)) < 10 ? Number(v).toFixed(2) : Number(v).toFixed(1));

const PASS = "#3987e5", FAIL = "#c98500";

const COLS = [
  { key: "volumeTrendPositive", head: "Khối lượng", rule: "phải dương",
    val: (m) => `${f1(m.volumeTrendPct)}%` },
  { key: "notExtended", head: "Biên 30 ngày", rule: "dưới 85%",
    val: (m) => `${f1(m.rangePosition30d)}%` },
  { key: "overheadUnderDisqualifier", head: "Hàng kẹt", rule: "trên 50% thì loại",
    val: (m) => `${pct(m.underwaterPct)}%` },
  { key: "multiCellGeometry", head: "Hình học", rule: "≥10% ô dương",
    val: (m) => `${m.positiveCells}/${m.cellsTried}` },
];

/** Ranked as the pipeline ranks them, so the top row is the top pick. */
const ORDER = [...J.rows].sort((a, b) => a.claimed.rank - b.claimed.rank);

const X0 = 288, COL_W = 202, GAP = 6, TOP = 300, ROW_H = 66;

const cells = ORDER.map((r, ri) => {
  const y = TOP + ri * (ROW_H + GAP);
  const said = { SUI: "nhập bằng chữ", ENA: "nhập bằng số", ICP: "nhập bằng số" }[r.asset];
  let out = `
  <text x="${X0 - 24}" y="${y + 30}" text-anchor="end" class="name">${r.asset}</text>
  <text x="${X0 - 24}" y="${y + 52}" text-anchor="end" class="namenote">xếp #${r.claimed.rank} · trượt ${r.gatesFailed.length}/5 · ${said}</text>`;
  COLS.forEach((c, ci) => {
    const ok = r.gates[c.key];
    const x = X0 + ci * (COL_W + GAP);
    out += `
  <rect x="${x}" y="${y}" width="${COL_W}" height="${ROW_H}" rx="6" fill="${ok ? PASS : FAIL}" opacity="${ok ? 0.9 : 1}"/>
  <text x="${x + COL_W / 2}" y="${y + 30}" text-anchor="middle" class="cval">${c.val(r.measured)}</text>
  <text x="${x + COL_W / 2}" y="${y + 51}" text-anchor="middle" class="cflag">${ok ? "đạt" : "trượt"}</text>`;
  });
  return out;
}).join("");

const heads = COLS.map((c, ci) => {
  const x = X0 + ci * (COL_W + GAP) + COL_W / 2;
  return `
  <text x="${x}" y="${TOP - 34}" text-anchor="middle" class="chead">${c.head}</text>
  <text x="${x}" y="${TOP - 14}" text-anchor="middle" class="crule">${c.rule}</text>`;
}).join("");

process.stdout.write(`<!doctype html><meta charset="utf-8">
<style>
  html,body{margin:0;width:1200px;height:630px;overflow:hidden;background:#0b0e11}
  svg{display:block}
  text{font-family:"DejaVu Sans",system-ui,sans-serif;fill:#e8eaed}
  .kicker{font-size:19px;letter-spacing:3.5px;fill:#f0b90b;font-weight:700}
  .title{font-size:42px;font-weight:800;letter-spacing:-0.5px}
  .sub{font-size:18px;fill:#9aa3ad}
  .chead{font-size:17px;font-weight:700;fill:#c9d1d9}
  .crule{font-size:13px;fill:#6b757f}
  .name{font-size:26px;font-weight:800}
  .namenote{font-size:14px;fill:#8b949e}
  .cval{font-size:20px;font-weight:800;fill:#0b0e11}
  .cflag{font-size:13px;font-weight:700;fill:#0b0e11;opacity:0.75}
  .stat{font-size:22px;font-weight:700}
  .statlab{font-size:15px;fill:#8b949e}
  .mark{font-size:17px;font-weight:700;fill:#f0b90b;letter-spacing:1px}
</style>
<svg width="1200" height="630" viewBox="0 0 1200 630" xmlns="http://www.w3.org/2000/svg">
  <rect width="1200" height="630" fill="#0b0e11"/>
  <rect x="0" y="0" width="1200" height="4" fill="#c98500"/>

  <text x="64" y="56" class="kicker">CỔNG CÓ BAO GIỜ ĐÓNG CHƯA</text>
  <text x="1136" y="56" text-anchor="end" class="mark">MAIX8</text>

  <text x="64" y="118" class="title">Bộ lọc đúng.</text>
  <text x="64" y="162" class="title">Nhưng chưa được cấp số để chạy.</text>
  <text x="64" y="200" class="sub">Luật của chính bản quét, áp bằng số đo · không tên nào qua cả bốn cổng</text>

  ${heads}
  ${cells}

  <line x1="64" x2="1136" y1="546" y2="546" stroke="#252a31" stroke-width="1"/>
  <text x="64" y="582" class="stat" fill="${FAIL}">${pct(by.SUI.measured.underwaterPct)}%</text>
  <text x="64" y="604" class="statlab">Hàng kẹt của tên xếp #1 · bảng ghi "trung bình"</text>

  <text x="520" y="582" class="stat">${by.ENA.measured.positiveCells}/${by.ENA.measured.cellsTried}</text>
  <text x="520" y="604" class="statlab">Hình học dương của ENA · trên 90 tổ hợp</text>

  <text x="1136" y="582" text-anchor="end" class="stat">${f1(by.SUI.measured.btcVarianceExplainedPct)}%</text>
  <text x="1136" y="604" text-anchor="end" class="statlab">BTC giải thích SUI · cao nhất nhóm</text>
</svg>`);
