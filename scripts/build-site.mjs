#!/usr/bin/env node
/**
 * Standalone site build.
 *
 * Deliberately imports nothing but src/site.mjs and node builtins: the CLI
 * pulls in the Anthropic SDK through the composer, so building the site
 * through `wte site` would need the full dependency tree on a host that only
 * needs to render HTML. This runs on a bare Node with no install step.
 *
 *   node scripts/build-site.mjs [outDir]
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { buildSite } from "../src/site.mjs";
import { buildLessons, lessonSymbols } from "../src/lessons.mjs";
import { fetchKlines } from "../src/analysis.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const out = path.resolve(root, process.argv[2] ?? "site/dist");

const manifest = JSON.parse(fs.readFileSync(path.join(root, "site", "manifest.json"), "utf8"));

const drafts = {};
for (const article of manifest.articles) {
  const file = path.join(root, "drafts", article.draft);
  if (!fs.existsSync(file)) {
    console.error(`Draft not found for "${article.slug}": ${file}`);
    process.exit(1);
  }
  drafts[article.draft] = fs.readFileSync(file, "utf8");
}

/**
 * Exchange endpoints return the occasional 503, and a build host retries
 * nothing by itself. Without this a transient blip takes down a deploy that
 * has nothing to do with the market.
 */
async function withRetry(label, fn, attempts = 6) {
  let last;
  for (let i = 0; i < attempts; i++) {
    try {
      return await fn();
    } catch (err) {
      last = err;
      if (i < attempts - 1) await new Promise((r) => setTimeout(r, 1500 * (i + 1)));
    }
  }
  throw new Error(`${label} failed after ${attempts} attempts: ${last.message}`);
}

// Lessons are computed from live candles at build time, so a deploy always
// ships examples measured against the market as it stands, not as it was.
//
// A failure here fails the whole build on purpose: Vercel keeps the previous
// successful deployment live, which is safer than silently publishing a site
// whose lessons section has quietly gone missing.
const candles = {};
for (const symbol of lessonSymbols()) {
  // 1000 candles so a percentile quoted in a lesson matches the same
  // percentile quoted in a published article. A shorter history would silently
  // rank the identical reading differently.
  candles[symbol] = await withRetry(symbol, () => fetchKlines(symbol, { limit: 1000 }));
}
const lessons = buildLessons(candles);

const files = buildSite(manifest, drafts, lessons);

fs.rmSync(out, { recursive: true, force: true });
for (const f of files) {
  const dest = path.join(out, f.path);
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  fs.writeFileSync(dest, f.content);
}

const bytes = files.reduce((s, f) => s + Buffer.byteLength(f.content), 0);
console.log(`Built ${files.length} files (${(bytes / 1024).toFixed(0)} KB) into ${out}`);
