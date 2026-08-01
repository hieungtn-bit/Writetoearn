#!/usr/bin/env node
/**
 * Captures the lessons' worked examples into site/lesson-data.json.
 *
 * The site build must not depend on a live exchange. A deploy that reaches out
 * to Binance fails whenever that host is slow, rate-limited or unreachable from
 * the build region — which takes down changes that have nothing to do with
 * market data. Measuring here and committing the result makes builds
 * deterministic and offline, and it lets each lesson state honestly when it was
 * measured instead of implying it is live.
 *
 * Run this whenever the examples should be refreshed, then commit the result.
 *
 *   node scripts/refresh-lessons.mjs
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { buildLessons, lessonSymbols } from "../src/lessons.mjs";
import { fetchKlines } from "../src/analysis.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const out = path.join(root, "site", "lesson-data.json");

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

const candles = {};
for (const symbol of lessonSymbols()) {
  process.stdout.write(`fetching ${symbol}... `);
  // 1000 candles so a percentile quoted in a lesson matches the same percentile
  // quoted in a published article. A shorter history ranks it differently.
  candles[symbol] = await withRetry(symbol, () => fetchKlines(symbol, { limit: 1000 }));
  console.log(`${candles[symbol].length} candles`);
}

const measuredAt = new Date().toISOString();
const examples = Object.fromEntries(buildLessons(candles).map((l) => [l.slug, l.example]));

fs.writeFileSync(out, `${JSON.stringify({ measuredAt, examples }, null, 2)}\n`);
console.log(`\nWrote ${Object.keys(examples).length} worked examples to ${out}`);
console.log(`measuredAt ${measuredAt} — commit this so the build stays offline.`);
