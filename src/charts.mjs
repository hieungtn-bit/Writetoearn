/**
 * Inline SVG charts drawn from real candle data.
 *
 * A lesson claiming to be practical has to show the actual measurement on an
 * actual chart. These render server-side into the page: no JavaScript, no
 * chart library, and they scale with the viewport because the SVG carries a
 * viewBox rather than fixed pixel dimensions.
 */

const W = 720;
const H = 300;
const PAD = { top: 18, right: 14, bottom: 26, left: 46 };

const esc = (s) => String(s).replace(/[&<>"']/g, (c) =>
  ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

const num = (v) => Math.round(Number(v) * 100) / 100;

/** Nice-ish tick values across a range, without pulling in a scale library. */
export function ticks(min, max, count = 4) {
  if (!(max > min)) return [min];
  const step = (max - min) / count;
  return Array.from({ length: count + 1 }, (_, i) => min + step * i);
}

export function formatTick(v) {
  const a = Math.abs(v);
  if (a >= 1000) return `${(v / 1000).toFixed(a >= 10000 ? 0 : 1)}k`;
  if (a >= 1) return v.toFixed(a >= 100 ? 0 : 2);
  if (a >= 0.01) return v.toFixed(4);
  return v.toPrecision(2);
}

function frame(inner, { title, height = H }) {
  return `<figure class="chart">
<svg viewBox="0 0 ${W} ${height}" role="img" aria-label="${esc(title)}" preserveAspectRatio="xMidYMid meet">
<rect width="${W}" height="${height}" fill="#0f141a" rx="10"/>
${inner}
</svg>
<figcaption>${esc(title)}</figcaption>
</figure>`;
}

/**
 * Price line with optional horizontal reference levels (VWAP, a moving
 * average, a range boundary) — the levels are the point of most lessons.
 *
 * @param {number[]} values Closes, oldest first.
 * @param {{value:number,label:string,color?:string}[]} [levels]
 */
export function lineChart(values, { title, levels = [], labels = [] } = {}) {
  if (!values?.length) throw new Error("lineChart needs values");
  const all = [...values, ...levels.map((l) => l.value)];
  const min = Math.min(...all);
  const max = Math.max(...all);
  const span = max - min || Math.abs(max) || 1;
  const lo = min - span * 0.08;
  const hi = max + span * 0.08;

  const x = (i) => PAD.left + (i / Math.max(values.length - 1, 1)) * (W - PAD.left - PAD.right);
  const y = (v) => PAD.top + (1 - (v - lo) / (hi - lo)) * (H - PAD.top - PAD.bottom);

  const path = values.map((v, i) => `${i ? "L" : "M"}${num(x(i))} ${num(y(v))}`).join(" ");
  const area = `${path} L${num(x(values.length - 1))} ${num(y(lo))} L${num(x(0))} ${num(y(lo))} Z`;

  const grid = ticks(lo, hi).map((t) =>
    `<line x1="${PAD.left}" y1="${num(y(t))}" x2="${W - PAD.right}" y2="${num(y(t))}" stroke="#20262e"/>` +
    `<text x="${PAD.left - 6}" y="${num(y(t)) + 4}" text-anchor="end" font-size="11" fill="#848e9c">${formatTick(t)}</text>`,
  ).join("");

  const lvl = levels.map((l) => {
    const yy = num(y(l.value));
    const color = l.color ?? "#f0b90b";
    return `<line x1="${PAD.left}" y1="${yy}" x2="${W - PAD.right}" y2="${yy}" stroke="${color}" stroke-width="1.5" stroke-dasharray="5 4"/>` +
      `<text x="${W - PAD.right - 4}" y="${yy - 6}" text-anchor="end" font-size="12" fill="${color}" font-weight="700">${esc(l.label)}</text>`;
  }).join("");

  const xlab = labels.map((l, i) => {
    const idx = Math.round((i / Math.max(labels.length - 1, 1)) * (values.length - 1));
    return `<text x="${num(x(idx))}" y="${H - 8}" text-anchor="middle" font-size="11" fill="#848e9c">${esc(l)}</text>`;
  }).join("");

  return frame(
    `${grid}<path d="${area}" fill="#f0b90b" fill-opacity="0.07"/>` +
    `<path d="${path}" fill="none" stroke="#eaecef" stroke-width="2" stroke-linejoin="round"/>${lvl}${xlab}`,
    { title },
  );
}

/**
 * Turnover bars, with optional highlighting so a lesson can point at the days
 * that actually carried the month.
 *
 * @param {{label:string,value:number,highlight?:boolean}[]} bars
 */
export function barChart(bars, { title, unit = "" } = {}) {
  if (!bars?.length) throw new Error("barChart needs bars");
  const max = Math.max(...bars.map((b) => b.value));
  const hi = max * 1.12 || 1;
  const bw = (W - PAD.left - PAD.right) / bars.length;
  const y = (v) => PAD.top + (1 - v / hi) * (H - PAD.top - PAD.bottom);

  const grid = ticks(0, hi).map((t) =>
    `<line x1="${PAD.left}" y1="${num(y(t))}" x2="${W - PAD.right}" y2="${num(y(t))}" stroke="#20262e"/>` +
    `<text x="${PAD.left - 6}" y="${num(y(t)) + 4}" text-anchor="end" font-size="11" fill="#848e9c">${formatTick(t)}</text>`,
  ).join("");

  const rects = bars.map((b, i) => {
    const bx = PAD.left + i * bw + bw * 0.16;
    const by = num(y(b.value));
    const bh = Math.max(num(y(0) - y(b.value)), 1);
    const fill = b.highlight ? "#f0b90b" : "#2f6f5a";
    return `<rect x="${num(bx)}" y="${by}" width="${num(bw * 0.68)}" height="${bh}" fill="${fill}" rx="2"/>` +
      `<text x="${num(bx + bw * 0.34)}" y="${H - 8}" text-anchor="middle" font-size="10" fill="#848e9c">${esc(b.label)}</text>`;
  }).join("");

  return frame(`${grid}${rects}`, { title: unit ? `${title} (${unit})` : title });
}

/**
 * Where today's reading sits inside its own history. Percentile claims are the
 * easiest thing to assert and the easiest to check, so lessons show the
 * distribution rather than asking the reader to trust the number.
 */
export function distributionChart(values, current, { title, label = "now" } = {}) {
  if (!values?.length) throw new Error("distributionChart needs values");
  const min = Math.min(...values, current);
  const max = Math.max(...values, current);
  const bins = 28;
  const width = (max - min) / bins || 1;
  const counts = new Array(bins).fill(0);
  for (const v of values) counts[Math.min(Math.floor((v - min) / width), bins - 1)]++;
  const peak = Math.max(...counts) || 1;

  const bw = (W - PAD.left - PAD.right) / bins;
  const y = (c) => PAD.top + (1 - c / (peak * 1.1)) * (H - PAD.top - PAD.bottom);

  const rects = counts.map((c, i) => {
    const bx = PAD.left + i * bw;
    const by = num(y(c));
    return `<rect x="${num(bx)}" y="${by}" width="${num(bw - 1)}" height="${Math.max(num(y(0) - y(c)), 0)}" fill="#2b3946" rx="1"/>`;
  }).join("");

  const cx = PAD.left + ((current - min) / (max - min || 1)) * (W - PAD.left - PAD.right);
  const marker =
    `<line x1="${num(cx)}" y1="${PAD.top}" x2="${num(cx)}" y2="${H - PAD.bottom}" stroke="#f6465d" stroke-width="2"/>` +
    `<text x="${num(Math.min(cx + 6, W - PAD.right - 40))}" y="${PAD.top + 14}" font-size="12" fill="#f6465d" font-weight="700">${esc(label)}</text>`;

  const axis =
    `<text x="${PAD.left}" y="${H - 8}" font-size="11" fill="#848e9c">${formatTick(min)}</text>` +
    `<text x="${W - PAD.right}" y="${H - 8}" text-anchor="end" font-size="11" fill="#848e9c">${formatTick(max)}</text>`;

  return frame(`${rects}${marker}${axis}`, { title });
}
