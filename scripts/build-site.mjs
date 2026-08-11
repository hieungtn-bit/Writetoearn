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
import { LESSONS } from "../src/lessons.mjs";

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

// Worked examples come from site/lesson-data.json, captured by
// scripts/refresh-lessons.mjs. The build stays offline on purpose: a deploy
// must not fail because an exchange is unreachable from the build region.
// The signal board, when a scan has been committed. Optional: a clean checkout
// that has never run scripts/scan-daily.mjs still builds, and the build never
// reaches for the market to fill the gap.
const signalsPath = path.join(root, "site", "signals.json");
const signals = fs.existsSync(signalsPath)
  ? JSON.parse(fs.readFileSync(signalsPath, "utf8"))
  : null;

// Every archived scan, so the board's date picker has something to pick from.
// Read from disk rather than fetched: the build stays offline.
const archiveDir = path.join(root, "site", "signals-archive");
const archive = {};
if (fs.existsSync(archiveDir)) {
  for (const file of fs.readdirSync(archiveDir).filter((f) => f.endsWith(".json"))) {
    archive[file.replace(/\.json$/, "")] = JSON.parse(fs.readFileSync(path.join(archiveDir, file), "utf8"));
  }
}

const dataPath = path.join(root, "site", "lesson-data.json");
if (!fs.existsSync(dataPath)) {
  console.error(`Missing ${dataPath}. Run: node scripts/refresh-lessons.mjs`);
  process.exit(1);
}
const lessonData = JSON.parse(fs.readFileSync(dataPath, "utf8"));

const lessons = LESSONS.map((lesson) => {
  const example = lessonData.examples[lesson.slug];
  if (!example) {
    console.error(`No captured example for lesson "${lesson.slug}". Run: node scripts/refresh-lessons.mjs`);
    process.exit(1);
  }
  return { ...lesson, example, measuredAt: lessonData.measuredAt };
});

const files = buildSite(manifest, drafts, lessons, signals, archive);

fs.rmSync(out, { recursive: true, force: true });
for (const f of files) {
  const dest = path.join(out, f.path);
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  fs.writeFileSync(dest, f.content);
}

const bytes = files.reduce((s, f) => s + Buffer.byteLength(f.content), 0);
console.log(`Built ${files.length} files (${(bytes / 1024).toFixed(0)} KB) into ${out}`);
