/**
 * Column card for post 64 — the arbitrage edge against the fee that eats it.
 *
 * The form is a histogram with a threshold line, because the argument is a
 * distribution against a constant. Two summary bars would say the same thing
 * and prove less: a reader can always suspect a median of hiding a fat tail,
 * and the whole claim here is that there is no tail. Showing all 320
 * observations piled far to the left of a line they never approach removes the
 * suspicion instead of asking for trust.
 *
 * The x-axis is deliberately extended past the data to include the fee. Cutting
 * it at the last observation would fill the frame with the spread distribution
 * and make the gap look like a matter of degree; the empty space between the
 * bars and the line is the finding.
 *
 * Colour is doing the status job, not identity: #c98500 for the spreads that
 * occur, #3987e5 for the fee threshold. Validated against #0b0e11 at 27.4
 * delta-E protan. Both are labelled directly.
 *
 *   node scripts/cover-bot-arb.mjs > media/bot-arb.html
 *   node scripts/render-card.mjs media/bot-arb.html media/bot-arb.png
 */

import { readFileSync } from "node:fs";

const J = JSON.parse(readFileSync("research/arb-reality.json", "utf8"));
const s = J.spreads, st = J.story, L = J.latency;

const f0 = (v) => Math.round(Number(v)).toLocaleString("en-US");
const f1 = (v) => Number(v).toFixed(1);
const f2 = (v) => Number(v).toFixed(2);
const f3 = (v) => Number(v).toFixed(3);

const SPREAD = "#c98500", FEE = "#3987e5";

const X0 = 96, X1 = 1104, BASE = 452, LO = -0.06, HI = 0.23;
const x = (v) => X0 + ((v - LO) / (HI - LO)) * (X1 - X0);

const peak = Math.max(...s.histogram.map((b) => b.count));
const H = 168;

const bars = s.histogram.map((b) => {
  const left = x(b.fromPct), right = x(b.toPct);
  const h = Math.max(3, (b.count / peak) * H);
  // A 2px surface gap so adjacent bins read as separate marks.
  return `<rect x="${left + 1}" y="${BASE - h}" width="${Math.max(2, right - left - 2)}" height="${h}"
          rx="4" fill="${SPREAD}"/>`;
}).join("\n  ");

const feeX = x(s.roundTripFeePct);
const zeroX = x(0);

const ticks = [-0.05, 0, 0.05, 0.10, 0.15, 0.20].map((v) =>
  `<text x="${x(v)}" y="${BASE + 26}" text-anchor="middle" class="tick">${f2(v)}%</text>`).join("\n  ");

process.stdout.write(`<!doctype html><meta charset="utf-8">
<style>
  html,body{margin:0;width:1200px;height:630px;overflow:hidden;background:#0b0e11}
  svg{display:block}
  text{font-family:"DejaVu Sans",system-ui,sans-serif;fill:#e8eaed}
  .kicker{font-size:19px;letter-spacing:3.5px;fill:#f0b90b;font-weight:700}
  .title{font-size:43px;font-weight:800;letter-spacing:-0.5px}
  .sub{font-size:19px;fill:#9aa3ad}
  .lab{font-size:19px;font-weight:700}
  .labsub{font-size:15px}
  .tick{font-size:14px;fill:#6b757f}
  .stat{font-size:22px;font-weight:700}
  .statlab{font-size:15px;fill:#8b949e}
  .mark{font-size:17px;font-weight:700;fill:#f0b90b;letter-spacing:1px}
</style>
<svg width="1200" height="630" viewBox="0 0 1200 630" xmlns="http://www.w3.org/2000/svg">
  <rect width="1200" height="630" fill="#0b0e11"/>
  <rect x="0" y="0" width="1200" height="4" fill="#c98500"/>

  <text x="64" y="56" class="kicker">BOT ARBITRAGE · ĐO THẬT</text>
  <text x="1136" y="56" text-anchor="end" class="mark">MAIX8</text>

  <text x="64" y="118" class="title">Khe hở có mở ra thật.</text>
  <text x="64" y="164" class="title">Không lần nào đủ trả phí.</text>
  <text x="64" y="200" class="sub">Binance vs OKX · 8 cặp · ${f0(J.method.observations)} quan sát · độ trễ ${f0(L.binance.medianMs)}/${f0(L.okx.medianMs)} ms</text>

  <text x="${X0}" y="248" class="lab" fill="${SPREAD}">Chênh lệch khớp được</text>
  <text x="${X0}" y="272" class="labsub" fill="${SPREAD}">${f0(J.method.observations)} quan sát, gộp lại</text>

  ${bars}

  <!-- zero: below it the two venues are crossed the wrong way -->
  <line x1="${zeroX}" x2="${zeroX}" y1="${BASE - H - 16}" y2="${BASE}" stroke="#39414b" stroke-width="1" stroke-dasharray="4 4"/>

  <!-- the fee: the constant every one of those bars has to clear, and none does -->
  <line x1="${feeX}" x2="${feeX}" y1="${BASE - H - 6}" y2="${BASE}" stroke="${FEE}" stroke-width="4"/>
  <text x="${feeX}" y="${BASE - H - 46}" text-anchor="middle" class="lab" fill="${FEE}">Phí khứ hồi ${f2(s.roundTripFeePct)}%</text>
  <text x="${feeX}" y="${BASE - H - 22}" text-anchor="middle" class="labsub" fill="${FEE}">taker hai sàn, bậc thường</text>

  <line x1="${X0}" x2="${X1}" y1="${BASE}" y2="${BASE}" stroke="#39414b" stroke-width="1"/>
  ${ticks}

  <line x1="64" x2="1136" y1="516" y2="516" stroke="#252a31" stroke-width="1"/>
  <text x="64" y="552" class="stat">${f1(s.trulyProfitablePct)}%</text>
  <text x="64" y="574" class="statlab">Số lần có lãi sau phí · trên ${f0(J.method.observations)} quan sát</text>

  <text x="480" y="552" class="stat">${f1(s.feeOverBestObservedX)}x</text>
  <text x="480" y="574" class="statlab">Phí so với khe hở lớn nhất</text>

  <text x="1136" y="552" text-anchor="end" class="stat">−${f3(Math.abs(st.bestObservedNetPct))}%</text>
  <text x="1136" y="574" text-anchor="end" class="statlab">Lệnh tốt nhất quan sát được · vẫn lỗ</text>
</svg>`);
