/**
 * Column card for post 65 — the overhead supply the scan said it could not get.
 *
 * A ranked bar chart, because the job is magnitude across a small set of named
 * things and the reader's question is "how much, and which is worst". Four
 * bars on one scale answer both in a glance; the two the scan left blank are
 * the two that dominate, which is the finding.
 *
 * The bump chart from the previous card would be wrong here — nothing about
 * this is a change in order. The bars are sorted worst-first so the eye lands
 * on 92.5% before it reads a single label.
 *
 * Colour separates the two the scan quoted from the two it left blank, which
 * is the distinction the post is about. #c98500 for the numbers it never had,
 * muted ink for the ones it did — validated pairing, and each bar is labelled,
 * so the split is legible without colour.
 *
 *   node scripts/cover-quet-v2.mjs > media/quet-v2.html
 *   node scripts/render-card.mjs media/quet-v2.html media/quet-v2.png
 */

import { readFileSync } from "node:fs";

const J = JSON.parse(readFileSync("research/scan-v2-check.json", "utf8"));
const by = Object.fromEntries(J.rows.map((r) => [r.asset, r]));
const btc30 = (r) => r.btc.find((b) => b.days === 30);

const f1 = (v) => Number(v).toFixed(1);
const f2 = (v) => Number(v).toFixed(2);
const pct = (v) => (Math.abs(Number(v)) < 10 ? Number(v).toFixed(2) : Number(v).toFixed(1));

const NEW = "#c98500", HAD = "#5a636d";

const bars = [...J.rows]
  .sort((a, b) => b.measured.underwaterPct - a.measured.underwaterPct)
  .map((r) => ({
    asset: r.asset,
    value: r.measured.underwaterPct,
    // The scan quoted a figure for two of these and declared the other two
    // unavailable; that split is what the card is about.
    isNew: r.claimed.overheadStated == null,
    note: r.claimed.overheadStated == null ? "bản quét để trống" : `bản quét ghi ~${r.claimed.overheadStated}%`,
  }));

const X0 = 300, W = 660, TOP = 274, STEP = 62, BAR = 34;
const len = (v) => (v / 100) * W;

const els = bars.map((b, i) => {
  const y = TOP + i * STEP;
  const c = b.isNew ? NEW : HAD;
  return `
  <text x="${X0 - 20}" y="${y + BAR / 2 + 7}" text-anchor="end" class="alab" fill="${c}">${b.asset}</text>
  <rect x="${X0}" y="${y}" width="${len(b.value)}" height="${BAR}" rx="4" fill="${c}"/>
  <text x="${X0 + len(b.value) + 14}" y="${y + BAR / 2 + 7}" class="aval" fill="${c}">${pct(b.value)}%</text>
  <text x="${X0 + len(b.value) + 14 + (b.value > 50 ? 0 : 78)}" y="${y + BAR / 2 + 7}" class="anote">${b.value > 50 ? "" : b.note}</text>`;
}).join("");

const noteFor = bars.filter((b) => b.value > 50)
  .map((b, i) => `<text x="${X0}" y="${TOP + i * STEP + BAR + 20}" class="anote">${b.note}</text>`).join("");

process.stdout.write(`<!doctype html><meta charset="utf-8">
<style>
  html,body{margin:0;width:1200px;height:630px;overflow:hidden;background:#0b0e11}
  svg{display:block}
  text{font-family:"DejaVu Sans",system-ui,sans-serif;fill:#e8eaed}
  .kicker{font-size:19px;letter-spacing:3.5px;fill:#f0b90b;font-weight:700}
  .title{font-size:43px;font-weight:800;letter-spacing:-0.5px}
  .sub{font-size:19px;fill:#9aa3ad}
  .alab{font-size:23px;font-weight:700}
  .aval{font-size:20px;font-weight:700}
  .anote{font-size:15px;fill:#8b949e}
  .stat{font-size:22px;font-weight:700}
  .statlab{font-size:15px;fill:#8b949e}
  .mark{font-size:17px;font-weight:700;fill:#f0b90b;letter-spacing:1px}
</style>
<svg width="1200" height="630" viewBox="0 0 1200 630" xmlns="http://www.w3.org/2000/svg">
  <rect width="1200" height="630" fill="#0b0e11"/>
  <rect x="0" y="0" width="1200" height="4" fill="#c98500"/>

  <text x="64" y="56" class="kicker">HAI SỐ BẢN QUÉT BẢO KHÔNG CÓ</text>
  <text x="1136" y="56" text-anchor="end" class="mark">MAIX8</text>

  <text x="64" y="118" class="title">Hàng kẹt trên đầu giá.</text>
  <text x="64" y="164" class="title">Tính được, một lần fetch.</text>
  <text x="64" y="200" class="sub">Phần khối lượng 30 ngày đã giao dịch cao hơn giá hiện tại · càng cao càng nhiều người chờ thoát</text>

  <text x="${X0}" y="248" class="anote">0%</text>
  <text x="${X0 + W}" y="248" text-anchor="end" class="anote">100%</text>
  <line x1="${X0}" x2="${X0 + W}" y1="258" y2="258" stroke="#252a31" stroke-width="1"/>

  ${els}
  ${noteFor}

  <line x1="64" x2="1136" y1="536" y2="536" stroke="#252a31" stroke-width="1"/>
  <text x="64" y="572" class="stat" fill="${NEW}">${pct(by.XLM.measured.underwaterPct)}%</text>
  <text x="64" y="594" class="statlab">XLM · khối lượng ${f1(by.XLM.measured.volumeTrendPct)}% cùng lúc</text>

  <text x="500" y="572" class="stat">${f2(btc30(by.ICP).beta)}</text>
  <text x="500" y="594" class="statlab">Beta ICP · bản quét ghi "beta cao"</text>

  <text x="1136" y="572" text-anchor="end" class="stat">${f1(btc30(by.SUI).varianceExplainedPct)}%</text>
  <text x="1136" y="594" text-anchor="end" class="statlab">BTC giải thích biến động của SUI</text>
</svg>`);
