/**
 * Backfills the track record that `ship` was never writing.
 *
 * Every article published through `ship` cleared the numeric gate, reached
 * Square and reached the site — and none of them entered the claim store,
 * because that path recorded usage and a manifest entry and nothing else. The
 * scoreboard is the channel's whole differentiator and it had zero rows.
 *
 * The bug is fixed in src/cli.mjs. This recovers the calls already published,
 * which is worth doing carefully rather than quickly: a track record assembled
 * from convenient assumptions is worse than no track record, because it looks
 * like evidence.
 *
 * Two rules make the recovery honest.
 *
 *   1. **The publication time comes from git, not from now.** Each `ship` run
 *      commits immediately after publishing, so the commit's author date is the
 *      publication time to within seconds.
 *
 *   2. **The price comes from the candle that was open at that moment**, fetched
 *      from history — never from today's tape. Scoring a call against an entry
 *      price it never had would flatter or damn it at random, and the whole
 *      point of the record is that it cannot be argued with.
 *
 * Every recovered row is marked `backfilled` so it can be told apart from a
 * claim logged live, and so this run can be undone.
 *
 *   node scripts/backfill-claims.mjs            # report only
 *   node scripts/backfill-claims.mjs --write    # record them
 */

import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { extractClaim } from "../src/scoreboard.mjs";
import { Store } from "../src/store.mjs";
import { fetchKlines } from "../src/analysis.mjs";

const WRITE = process.argv.includes("--write");
const root = process.cwd();

const manifest = JSON.parse(fs.readFileSync(path.join(root, "site", "manifest.json"), "utf8"));
const articles = manifest.articles ?? manifest;

/** Publication times, straight from the commit each ship run made. */
const publishCommits = execFileSync(
  "git",
  ["log", "--format=%aI%x00%s", "--since=14 days ago"],
  { cwd: root, encoding: "utf8" },
)
  .split("\n")
  .map((line) => line.split("\0"))
  .filter(([, subject]) => subject?.startsWith("Publish: "))
  .map(([iso, subject]) => ({ publishedAt: iso, title: subject.slice("Publish: ".length).trim() }));

const timeForTitle = new Map();
// Oldest wins: a title republished later should keep the date it first went out.
for (const c of [...publishCommits].reverse()) timeForTitle.set(c.title, c.publishedAt);

/**
 * The price at publication, from the hourly candle covering that instant.
 *
 * Binance returns candles by open time, so the bar containing the publication
 * is the last one whose open is at or before it. Its close is the best single
 * price available for that moment without a tick feed.
 */
const priceAt = async (symbol, iso) => {
  const t = Date.parse(iso);
  const candles = await fetchKlines(symbol, { interval: "1h", limit: 1000 });
  const bar = [...candles].reverse().find((c) => c.openTime <= t);
  if (!bar) return null;
  // A bar more than a day away from the timestamp is not the right bar; the
  // window simply does not reach back far enough, and guessing would be worse
  // than skipping the row.
  if (t - bar.openTime > 36 * 3600 * 1000) return null;
  return { price: bar.close, barOpen: new Date(bar.openTime).toISOString() };
};

const store = new Store();
const existing = new Set(store.listClaims().map((c) => `${c.asset}|${c.publishedAt}`));

const rows = [];
for (const a of articles) {
  const publishedAt = timeForTitle.get(a.title);
  if (!publishedAt) continue;

  const draftPath = path.join(root, "drafts", a.draft);
  if (!fs.existsSync(draftPath)) { rows.push({ title: a.title, skip: "draft missing" }); continue; }
  const text = fs.readFileSync(draftPath, "utf8");

  // No brief: levels and price are filled from history below, and passing an
  // empty one keeps asset and bias extraction identical to the live path.
  const claim = extractClaim(text, { levels: [], spot: [] });
  if (!claim.asset) { rows.push({ title: a.title, publishedAt, skip: "no cashtag to score" }); continue; }
  if (!claim.bias) { rows.push({ title: a.title, publishedAt, skip: "no stated bias" }); continue; }

  let priced = null;
  try { priced = await priceAt(claim.asset, publishedAt); }
  catch (e) { rows.push({ title: a.title, publishedAt, skip: `price fetch failed: ${e.message}` }); continue; }
  if (!priced) { rows.push({ title: a.title, publishedAt, skip: "no candle covering that time" }); continue; }

  const key = `${claim.asset}|${publishedAt}`;
  if (existing.has(key)) { rows.push({ title: a.title, publishedAt, skip: "already recorded" }); continue; }

  const record = {
    ...claim,
    priceAtPost: priced.price,
    postId: a.squareId ?? `backfill-${a.slug}`,
    shareLink: null,
    format: "article",
    publishedAt,
    backfilled: true,
    backfillPriceBar: priced.barOpen,
  };
  rows.push({ title: a.title, publishedAt, asset: claim.asset, bias: claim.bias, price: priced.price });
  if (WRITE) { store.recordClaim(record); existing.add(key); }
}

const recorded = rows.filter((r) => !r.skip);
const skipped = rows.filter((r) => r.skip);

console.log(`${WRITE ? "Recorded" : "Would record"} ${recorded.length} call(s); skipped ${skipped.length}.\n`);
for (const r of recorded) {
  console.log(`  ${r.publishedAt.slice(0, 16)}  ${String(r.asset).padEnd(10)} ${String(r.bias).padEnd(16)} @ ${r.price}`);
}
if (skipped.length) {
  console.log("\nSkipped:");
  for (const r of skipped) console.log(`  ${(r.publishedAt ?? "").slice(0, 16)}  ${r.skip}  — ${r.title.slice(0, 60)}`);
}
if (!WRITE) console.log("\nDry run. Re-run with --write to record.");
