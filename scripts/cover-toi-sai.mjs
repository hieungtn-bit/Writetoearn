/**
 * Column card for post 69 — the missing branch, drawn.
 *
 * The finding is a comparison of two counts on the same grid, so the card is
 * two paired bars per pair: how many geometries paid long, how many paid short.
 * ICP's pair is the fault made visible — a stub against a full bar — and BTC's
 * is the control, mirrored, which is what shows the grid discriminates rather
 * than simply preferring shorts.
 *
 * Drawn from research/why-always-wait.json so the card cannot drift from the
 * post, with today's board counts in the stat row.
 *
 * Colour is direction, from the shared palette: secondary for long, primary for
 * short. Both bars are labelled with their own count, so nothing rests on hue.
 *
 *   node scripts/cover-toi-sai.mjs > media/toi-sai.html
 *   node scripts/render-card.mjs media/toi-sai.html media/toi-sai.png
 */

import { readFileSync } from "node:fs";
import { BRAND, CARD, INK, PALETTE, SURFACE } from "../src/palette.mjs";
import { count, pct } from "../src/format.mjs";

const W = JSON.parse(readFileSync("research/why-always-wait.json", "utf8"));
const S = JSON.parse(readFileSync("site/signals.json", "utf8"));
const t = S.tally;

const LONG = PALETTE.secondary, SHORT = PALETTE.primary;

const rows = ["ICP", "ENA", "SUI", "BTC"]
  .map((asset) => W.rows.find((r) => r.asset === asset))
  .filter(Boolean);

const X0 = 300, W_MAX = 620, TOP = 262, STEP = 68, BAR = 22, GAP = 4;
const peak = Math.max(...rows.flatMap((r) => [r.long.cells, r.short.cells]));
const len = (v) => (v / peak) * W_MAX;

const els = rows.map((r, i) => {
  const y = TOP + i * STEP;
  const lw = len(r.long.positive), sw = len(r.short.positive);
  const note = r.asset === "BTC" ? "đối chứng — ngược hẳn" : "";
  return `
  <text x="${X0 - 24}" y="${y + 16}" text-anchor="end" class="asset">${r.asset}</text>
  ${note ? `<text x="${X0 - 24}" y="${y + 38}" text-anchor="end" class="note">${note}</text>` : ""}

  <rect x="${X0}" y="${y}" width="${Math.max(3, lw)}" height="${BAR}" rx="4" fill="${LONG}"/>
  <text x="${X0 + Math.max(3, lw) + 12}" y="${y + 17}" class="val" fill="${LONG}">${r.long.positive}/${r.long.cells} long</text>

  <rect x="${X0}" y="${y + BAR + GAP}" width="${Math.max(3, sw)}" height="${BAR}" rx="4" fill="${SHORT}"/>
  <text x="${X0 + Math.max(3, sw) + 12}" y="${y + BAR + GAP + 17}" class="val" fill="${SHORT}">${r.short.positive}/${r.short.cells} short</text>`;
}).join("");

process.stdout.write(`<!doctype html><meta charset="utf-8">
<style>
  html,body{margin:0;width:${CARD.width}px;height:${CARD.height}px;overflow:hidden;background:${SURFACE}}
  svg{display:block}
  text{font-family:"DejaVu Sans",system-ui,sans-serif;fill:${INK.primary}}
  .kicker{font-size:19px;letter-spacing:3.5px;fill:${BRAND};font-weight:700}
  .title{font-size:42px;font-weight:800;letter-spacing:-0.5px}
  .sub{font-size:18px;fill:${INK.secondary}}
  .asset{font-size:24px;font-weight:800}
  .note{font-size:14px;fill:${INK.muted}}
  .val{font-size:16px;font-weight:700}
  .stat{font-size:22px;font-weight:700}
  .statlab{font-size:15px;fill:${INK.muted}}
  .mark{font-size:17px;font-weight:700;fill:${BRAND};letter-spacing:1px}
</style>
<svg width="${CARD.width}" height="${CARD.height}" viewBox="0 0 ${CARD.width} ${CARD.height}" xmlns="http://www.w3.org/2000/svg">
  <rect width="${CARD.width}" height="${CARD.height}" fill="${SURFACE}"/>
  <rect x="0" y="0" width="${CARD.width}" height="4" fill="${PALETTE.primary}"/>

  <text x="${CARD.margin}" y="${CARD.kickerY}" class="kicker">MỘT NHÁNH BỊ THIẾU</text>
  <text x="${CARD.right}" y="${CARD.kickerY}" text-anchor="end" class="mark">MAIX8</text>

  <text x="${CARD.margin}" y="${CARD.titleY[0]}" class="title">WAIT không phải nhận định.</text>
  <text x="${CARD.margin}" y="${CARD.titleY[1]}" class="title">Nó là nhánh code tôi chưa viết.</text>
  <text x="${CARD.margin}" y="${CARD.subY}" class="sub">Số hình học có kỳ vọng dương · cùng lưới, cùng dữ liệu, chỉ khác chiều</text>

  ${els}

  <line x1="${CARD.margin}" x2="${CARD.right}" y1="${CARD.footRuleY}" y2="${CARD.footRuleY}" stroke="${INK.rule}" stroke-width="1"/>
  <text x="${CARD.margin}" y="${CARD.statY}" class="stat">${count(t.LONG)} / ${count(t.SHORT)} / ${count(t.WAIT)}</text>
  <text x="${CARD.margin}" y="${CARD.statLabelY}" class="statlab">Bảng hôm nay · long / short / chờ</text>

  <text x="560" y="${CARD.statY}" class="stat">+${pct(W.holdingAverages.avg7dPct)}%</text>
  <text x="560" y="${CARD.statLabelY}" class="statlab">Mua-và-giữ tuần tôi bảo đứng ngoài</text>

  <text x="${CARD.right}" y="${CARD.statY}" text-anchor="end" class="stat">n≈5</text>
  <text x="${CARD.right}" y="${CARD.statLabelY}" text-anchor="end" class="statlab">Mẫu độc lập trung vị · còn mỏng</text>
</svg>`);
