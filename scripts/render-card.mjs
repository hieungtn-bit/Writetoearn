/**
 * HTML to a pixel-exact PNG, working around a headless viewport that lies.
 *
 * `--window-size=1200,630` does not give 1200x630 of usable page. Measured here,
 * roughly the last ninety pixels are never painted: a magenta test block at
 * y=540 came back as background at that window size and rendered correctly at
 * window height 700. The existing cover generator has been living inside that
 * hole without knowing — its template happens to stop at y=514, so it has always
 * fit by luck rather than by design, and anything drawn lower would have been
 * silently cropped.
 *
 * So the page is rendered tall and the image is cut back to the intended size.
 * Cropping is done here rather than by an image library because none is
 * installed, and adding a native dependency to trim rows off a bitmap is a poor
 * trade — PNG is a container this can open honestly with zlib alone.
 *
 *   node scripts/render-card.mjs <in.html> <out.png> [width] [height]
 */

import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import zlib from "node:zlib";

/** Extra window height so the intended area is inside the painted region. */
const HEADROOM = 120;

function findChrome() {
  return [
    process.env.CHROME_PATH,
    "/opt/pw-browsers/chromium",
    "/opt/pw-browsers/chromium-1194/chrome-linux/chrome",
    "/usr/bin/chromium",
  ].filter(Boolean).find((p) => existsSync(p));
}

/** Decodes a PNG to {width, height, rgba}. Handles the five standard filters. */
export function decodePng(buf) {
  let pos = 8, idat = [], width = 0, height = 0, colorType = 6, bitDepth = 8;
  while (pos < buf.length) {
    const len = buf.readUInt32BE(pos);
    const type = buf.toString("ascii", pos + 4, pos + 8);
    if (type === "IHDR") {
      width = buf.readUInt32BE(pos + 8);
      height = buf.readUInt32BE(pos + 12);
      bitDepth = buf[pos + 16];
      colorType = buf[pos + 17];
    }
    if (type === "IDAT") idat.push(buf.subarray(pos + 8, pos + 8 + len));
    pos += 12 + len;
  }
  if (bitDepth !== 8 || (colorType !== 6 && colorType !== 2)) {
    throw new Error(`unsupported PNG: depth ${bitDepth}, colour type ${colorType}`);
  }
  const bpp = colorType === 6 ? 4 : 3;
  const raw = zlib.inflateSync(Buffer.concat(idat));
  const stride = width * bpp;
  const out = Buffer.alloc(height * stride);

  for (let y = 0; y < height; y++) {
    const filter = raw[y * (stride + 1)];
    const line = raw.subarray(y * (stride + 1) + 1, (y + 1) * (stride + 1));
    for (let i = 0; i < stride; i++) {
      const a = i >= bpp ? out[y * stride + i - bpp] : 0;
      const b = y > 0 ? out[(y - 1) * stride + i] : 0;
      const c = y > 0 && i >= bpp ? out[(y - 1) * stride + i - bpp] : 0;
      let v = line[i];
      if (filter === 1) v += a;
      else if (filter === 2) v += b;
      else if (filter === 3) v += (a + b) >> 1;
      else if (filter === 4) {
        const p = a + b - c;
        const pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c);
        v += pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
      }
      out[y * stride + i] = v & 255;
    }
  }
  return { width, height, bpp, pixels: out };
}

/** Re-encodes with filter 0 on every row — larger than optimal, and exact. */
export function encodePng({ width, height, bpp, pixels }) {
  const stride = width * bpp;
  const raw = Buffer.alloc(height * (stride + 1));
  for (let y = 0; y < height; y++) {
    raw[y * (stride + 1)] = 0;
    pixels.copy(raw, y * (stride + 1) + 1, y * stride, (y + 1) * stride);
  }
  const chunk = (type, data) => {
    const out = Buffer.alloc(data.length + 12);
    out.writeUInt32BE(data.length, 0);
    out.write(type, 4, "ascii");
    data.copy(out, 8);
    out.writeInt32BE(zlib.crc32(Buffer.concat([Buffer.from(type, "ascii"), data])) | 0, data.length + 8);
    return out;
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;
  ihdr[9] = bpp === 4 ? 6 : 2;
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", ihdr),
    chunk("IDAT", zlib.deflateSync(raw, { level: 9 })),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

export function cropTopLeft(img, width, height) {
  const w = Math.min(width, img.width), h = Math.min(height, img.height);
  const out = Buffer.alloc(w * h * img.bpp);
  for (let y = 0; y < h; y++) {
    img.pixels.copy(out, y * w * img.bpp, y * img.width * img.bpp, y * img.width * img.bpp + w * img.bpp);
  }
  return { width: w, height: h, bpp: img.bpp, pixels: out };
}

const [input, output, wArg, hArg] = process.argv.slice(2);
if (!input || !output) {
  console.error("usage: render-card.mjs <in.html> <out.png> [width] [height]");
  process.exit(1);
}
const W = Number(wArg ?? 1200), H = Number(hArg ?? 630);
const SCALE = 2;

const chrome = findChrome();
if (!chrome) { console.error("no headless Chromium found; set CHROME_PATH"); process.exit(1); }

const tmp = `${output}.raw.png`;
execFileSync(chrome, [
  "--headless=new", "--no-sandbox", "--disable-gpu", "--hide-scrollbars",
  `--force-device-scale-factor=${SCALE}`,
  `--window-size=${W},${H + HEADROOM}`,
  `--screenshot=${tmp}`, input,
], { stdio: "ignore" });

const img = decodePng(readFileSync(tmp));
const cropped = cropTopLeft(img, W * SCALE, H * SCALE);
writeFileSync(output, encodePng(cropped));
console.log(`${output} — ${cropped.width}x${cropped.height} (rendered ${img.width}x${img.height}, cropped)`);
