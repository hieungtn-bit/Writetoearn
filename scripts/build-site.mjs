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

const files = buildSite(manifest, drafts);

fs.rmSync(out, { recursive: true, force: true });
for (const f of files) {
  const dest = path.join(out, f.path);
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  fs.writeFileSync(dest, f.content);
}

const bytes = files.reduce((s, f) => s + Buffer.byteLength(f.content), 0);
console.log(`Built ${files.length} files (${(bytes / 1024).toFixed(0)} KB) into ${out}`);
