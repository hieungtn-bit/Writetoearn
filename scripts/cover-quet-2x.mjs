/**
 * Column card for post 63 — a scored watchlist against measured expectancy.
 *
 * The form is a bump chart because the finding is about *order*, not level. Two
 * columns, one line per asset, and the lines cross: a reader sees that the
 * scan's ranking and the measured ranking disagree before reading a single
 * number, which is exactly what a rank correlation of zero means.
 *
 * A bar chart of expectancy was the obvious alternative and it is the wrong
 * one — it would put four numbers on a scale and invite comparison of their
 * sizes, when the claim being made is that the *sequence* does not survive.
 *
 * Colour highlights rather than enumerates. Four categorical hues would need a
 * four-way palette and would imply the identities matter equally; they do not.
 * The two lines that carry the story get the validated pair — #c98500 for the
 * name scored highest, #3987e5 for the name that actually ranks best — and the
 * rest stay in muted ink. Every line is labelled at both ends, so nothing rests
 * on colour.
 *
 * Figures come from research/multiplier-scan-check.json.
 *
 *   node scripts/cover-quet-2x.mjs > media/quet-2x.html
 *   node scripts/render-card.mjs media/quet-2x.html media/quet-2x.png
 */

import { readFileSync } from "node:fs";

const J = JSON.parse(readFileSync("research/multiplier-scan-check.json", "utf8"));
const by = Object.fromEntries(J.rows.map((r) => [r.asset, r]));

const f1 = (v) => Number(v).toFixed(1);
const f2 = (v) => Number(v).toFixed(2);

const LEFT = 430, RIGHT = 800, TOP = 300, STEP = 54;
const y = (i) => TOP + i * STEP;

const HI = "#c98500", ALT = "#3987e5", MUTED = "#5a636d";

const colourFor = (asset) =>
  asset === J.ranking.byScore[0] ? HI : asset === J.ranking.byExpectancy[0] ? ALT : MUTED;

const d90 = (r) => r.doubling.find((x) => x.horizonDays === 90).withStatedStop;

const lines = J.rows.map((r) => {
  const a = J.ranking.byScore.indexOf(r.asset);
  const b = J.ranking.byExpectancy.indexOf(r.asset);
  const c = colourFor(r.asset);
  const strong = c !== MUTED;
  return `
  <line x1="${LEFT}" y1="${y(a)}" x2="${RIGHT}" y2="${y(b)}" stroke="${c}"
        stroke-width="${strong ? 4 : 2}" opacity="${strong ? 1 : 0.65}"/>
  <circle cx="${LEFT}" cy="${y(a)}" r="7" fill="${c}"/>
  <circle cx="${RIGHT}" cy="${y(b)}" r="7" fill="${c}"/>
  <text x="${LEFT - 20}" y="${y(a) + 7}" text-anchor="end" class="node" fill="${c}">${r.asset} ${f1(r.claimed.score)}</text>
  <text x="${RIGHT + 20}" y="${y(b) + 7}" class="node" fill="${c}">${r.asset} ${f2(r.expectancyR90d)}R</text>`;
}).join("");

process.stdout.write(`<!doctype html><meta charset="utf-8">
<style>
  html,body{margin:0;width:1200px;height:630px;overflow:hidden;background:#0b0e11}
  svg{display:block}
  text{font-family:"DejaVu Sans",system-ui,sans-serif;fill:#e8eaed}
  .kicker{font-size:19px;letter-spacing:3.5px;fill:#f0b90b;font-weight:700}
  .title{font-size:43px;font-weight:800;letter-spacing:-0.5px}
  .sub{font-size:19px;fill:#9aa3ad}
  .colhead{font-size:18px;font-weight:700;fill:#9aa3ad}
  .colnote{font-size:14px;fill:#6b757f}
  .node{font-size:19px;font-weight:700}
  .stat{font-size:22px;font-weight:700}
  .statlab{font-size:15px;fill:#8b949e}
  .mark{font-size:17px;font-weight:700;fill:#f0b90b;letter-spacing:1px}
</style>
<svg width="1200" height="630" viewBox="0 0 1200 630" xmlns="http://www.w3.org/2000/svg">
  <rect width="1200" height="630" fill="#0b0e11"/>
  <rect x="0" y="0" width="1200" height="4" fill="#c98500"/>

  <text x="64" y="56" class="kicker">KIỂM MỘT BẢN QUÉT 2X</text>
  <text x="1136" y="56" text-anchor="end" class="mark">MAIX8</text>

  <text x="64" y="118" class="title">Điểm số xếp một đằng.</text>
  <text x="64" y="164" class="title">Kỳ vọng đo được xếp một nẻo.</text>
  <text x="64" y="200" class="sub">Bốn ứng viên · mục tiêu 2x · đo từng nến trên lịch sử của chính chúng</text>

  <text x="${LEFT}" y="248" text-anchor="middle" class="colhead">BẢN QUÉT CHẤM</text>
  <text x="${LEFT}" y="270" text-anchor="middle" class="colnote">điểm trên 10</text>
  <text x="${RIGHT}" y="248" text-anchor="middle" class="colhead">KỲ VỌNG ĐO ĐƯỢC</text>
  <text x="${RIGHT}" y="270" text-anchor="middle" class="colnote">R mỗi lệnh, 90 ngày</text>

  ${lines}

  <line x1="64" x2="1136" y1="536" y2="536" stroke="#252a31" stroke-width="1"/>
  <text x="64" y="572" class="stat">${f2(J.ranking.spearmanRho)}</text>
  <text x="64" y="594" class="statlab">Tương quan hạng · bốn mẫu, chưa đủ để kết luận</text>

  <text x="560" y="572" class="stat">${f1(d90(by.ICP).upPct)}%</text>
  <text x="560" y="594" class="statlab">Tỷ lệ ICP gấp đôi trước khi dính stop</text>

  <text x="1136" y="572" text-anchor="end" class="stat">4/4</text>
  <text x="1136" y="594" text-anchor="end" class="statlab">Số ứng viên có kỳ vọng âm</text>
</svg>`);
