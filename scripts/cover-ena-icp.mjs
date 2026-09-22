/**
 * Column card for post 67 — the geometry surface for ENA and ICP.
 *
 * A heatmap, because the finding is the *shape* of a search: ninety cells per
 * pair, and what matters is whether the positive ones form a region or a
 * scatter. Bars would collapse that to a ranking and lose the only thing worth
 * seeing — ICP's positive cells all sitting together in the wide-stop corner
 * while ENA has none anywhere.
 *
 * One horizon is drawn rather than all three, so the two grids sit side by side
 * on identical axes and the comparison is a like-for-like glance. The horizon
 * shown is the one carrying the best cell, named in the subtitle.
 *
 * Colour does the diverging job: expectancy has a real, meaningful zero, so the
 * scale is two hues around a neutral midpoint — #c98500 for cells that lose,
 * #3987e5 for cells that pay, lightness carrying magnitude. Never a rainbow, and
 * never a hue at the midpoint. Every cell also prints its own value, so the
 * reading never depends on distinguishing two shades.
 *
 *   node scripts/cover-ena-icp.mjs > media/ena-icp.html
 *   node scripts/render-card.mjs media/ena-icp.html media/ena-icp.png
 */

import { readFileSync } from "node:fs";

const J = JSON.parse(readFileSync("research/ena-icp-deep.json", "utf8"));
const by = Object.fromEntries(J.rows.map((r) => [r.asset, r]));
const ENA = by.ENA, ICP = by.ICP;

const f1 = (v) => Number(v).toFixed(1);
const f2 = (v) => Number(v).toFixed(2);

/** Draw the horizon that carries the best cell across both pairs. */
const HORIZON = ICP.geometry.best.horizonDays;
const STOPS = ENA.geometry.stopAtrsTried;
const RRS = ENA.geometry.rrTried;

const LOSS = "#c98500", GAIN = "#3987e5", ZERO = "#39414b";

/** Magnitude by lightness, sign by hue, neutral at exactly zero. */
const fill = (v) => {
  const mag = Math.min(1, Math.abs(v) / 0.25);
  if (Math.abs(v) < 0.005) return ZERO;
  return v > 0
    ? `rgba(57,135,229,${(0.22 + 0.78 * mag).toFixed(3)})`
    : `rgba(201,133,0,${(0.18 + 0.62 * mag).toFixed(3)})`;
};

const CELL_W = 78, CELL_H = 44, GAP = 3;
const gridW = STOPS.length * (CELL_W + GAP) - GAP;

const drawGrid = (row, x0, y0) => {
  const cells = row.geometry.grid.filter((c) => c.horizonDays === HORIZON);
  const at = (stopAtr, rr) => cells.find((c) => c.stopAtr === stopAtr && c.rr === rr);
  let out = "";
  RRS.forEach((rr, ri) => {
    STOPS.forEach((stopAtr, si) => {
      const c = at(stopAtr, rr);
      if (!c) return;
      const x = x0 + si * (CELL_W + GAP);
      const y = y0 + ri * (CELL_H + GAP);
      out += `
  <rect x="${x}" y="${y}" width="${CELL_W}" height="${CELL_H}" rx="4" fill="${fill(c.expectancyR)}"/>
  <text x="${x + CELL_W / 2}" y="${y + CELL_H / 2 + 6}" text-anchor="middle" class="cell">${c.expectancyR > 0 ? "+" : "−"}${Math.abs(c.expectancyR).toFixed(2)}</text>`;
    });
    out += `
  <text x="${x0 - 14}" y="${y0 + ri * (CELL_H + GAP) + CELL_H / 2 + 6}" text-anchor="end" class="axlab">${rr}</text>`;
  });
  STOPS.forEach((stopAtr, si) => {
    out += `
  <text x="${x0 + si * (CELL_W + GAP) + CELL_W / 2}" y="${y0 + RRS.length * (CELL_H + GAP) + 18}" text-anchor="middle" class="axlab">${stopAtr}</text>`;
  });
  return out;
};

const LEFT_X = 148, RIGHT_X = 700, GRID_Y = 268;

process.stdout.write(`<!doctype html><meta charset="utf-8">
<style>
  html,body{margin:0;width:1200px;height:630px;overflow:hidden;background:#0b0e11}
  svg{display:block}
  text{font-family:"DejaVu Sans",system-ui,sans-serif;fill:#e8eaed}
  .kicker{font-size:19px;letter-spacing:3.5px;fill:#f0b90b;font-weight:700}
  .title{font-size:41px;font-weight:800;letter-spacing:-0.5px}
  .sub{font-size:18px;fill:#9aa3ad}
  .pair{font-size:22px;font-weight:700}
  .pairnote{font-size:14px;fill:#8b949e}
  .cell{font-size:14px;font-weight:700;fill:#0b0e11}
  .axlab{font-size:13px;fill:#8b949e}
  .axname{font-size:13px;fill:#6b757f}
  .stat{font-size:22px;font-weight:700}
  .statlab{font-size:15px;fill:#8b949e}
  .mark{font-size:17px;font-weight:700;fill:#f0b90b;letter-spacing:1px}
</style>
<svg width="1200" height="630" viewBox="0 0 1200 630" xmlns="http://www.w3.org/2000/svg">
  <rect width="1200" height="630" fill="#0b0e11"/>
  <rect x="0" y="0" width="1200" height="4" fill="#c98500"/>

  <text x="64" y="56" class="kicker">HÌNH HỌC NÀO THÌ ĂN</text>
  <text x="1136" y="56" text-anchor="end" class="mark">MAIX8</text>

  <text x="64" y="116" class="title">90 hình học mỗi đồng.</text>
  <text x="64" y="158" class="title">ENA: không một cái nào dương.</text>
  <text x="64" y="194" class="sub">Kỳ vọng mỗi lệnh (R) · khung ${HORIZON} ngày · đi từng nến · ô chạm cả hai tính về phía stop</text>

  <text x="${LEFT_X}" y="${GRID_Y - 34}" class="pair" fill="${LOSS}">$ENA</text>
  <text x="${LEFT_X}" y="${GRID_Y - 14}" class="pairnote">${ENA.geometry.positiveCells}/${ENA.geometry.cellsTried} ô dương · trung vị ${ENA.geometry.medianExpectancyR.toFixed(2)}R</text>
  <text x="${RIGHT_X}" y="${GRID_Y - 34}" class="pair" fill="${GAIN}">$ICP</text>
  <text x="${RIGHT_X}" y="${GRID_Y - 14}" class="pairnote">${ICP.geometry.positiveCells}/${ICP.geometry.cellsTried} ô dương · trung vị ${ICP.geometry.medianExpectancyR.toFixed(2)}R</text>

  ${drawGrid(ENA, LEFT_X, GRID_Y)}
  ${drawGrid(ICP, RIGHT_X, GRID_Y)}

  <text x="${LEFT_X - 14}" y="${GRID_Y - 14}" text-anchor="end" class="axname">R:R</text>
  <text x="${LEFT_X + gridW / 2}" y="${GRID_Y + RRS.length * (CELL_H + GAP) + 40}" text-anchor="middle" class="axname">khoảng cách stop, tính bằng biên độ ngày</text>
  <text x="${RIGHT_X + gridW / 2}" y="${GRID_Y + RRS.length * (CELL_H + GAP) + 40}" text-anchor="middle" class="axname">khoảng cách stop, tính bằng biên độ ngày</text>

  <line x1="64" x2="1136" y1="562" y2="562" stroke="#252a31" stroke-width="1"/>
  <text x="64" y="592" class="stat">${f2(ENA.geometry.best.expectancyR)}R</text>
  <text x="64" y="614" class="statlab">ENA · ô tốt nhất sau ${ENA.geometry.cellsTried} lần thử</text>

  <text x="470" y="592" class="stat">+${f2(ICP.geometry.best.expectancyR)}R</text>
  <text x="470" y="614" class="statlab">ICP · ô tốt nhất, stop ${f1(ICP.geometry.best.stopAtr)} biên độ ngày</text>

  <text x="1136" y="592" text-anchor="end" class="stat">${f1(ICP.positioning.volumeTrendPct)}%</text>
  <text x="1136" y="614" text-anchor="end" class="statlab">Khối lượng ICP · bản quét ghi "còn yếu"</text>
</svg>`);
