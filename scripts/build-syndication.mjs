/**
 * Writes every published post out in every platform's shape.
 *
 * Automatic posting needs a credential per network and this host has exactly
 * one, for Binance Square. Waiting for the rest is not a reason to leave the
 * work undone: the formatting, the length limits and the link-back discipline
 * are the parts that take judgement, and they can be finished now.
 *
 * So each post is rendered into `dist/syndication/<slug>/` — an X thread as
 * numbered files, Telegram and LinkedIn as single bodies, and Markdown for
 * anywhere that renders it. Publishing is then a copy-paste, or one HTTP call
 * per network once a token exists.
 *
 * Regenerated wholesale each run rather than appended to, so a post that is
 * corrected on the site cannot leave a stale copy waiting to be pasted
 * somewhere.
 */

import { mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import { PLATFORMS, syndicate } from "../src/syndicate.mjs";

const root = process.cwd();
const manifest = JSON.parse(readFileSync(path.join(root, "site", "manifest.json"), "utf8"));
const OUT = path.join(root, "site", "dist", "syndication");

rmSync(OUT, { recursive: true, force: true });
mkdirSync(OUT, { recursive: true });

const base = manifest.site.baseUrl.replace(/\/$/, "");
const index = [];
let files = 0;

for (const a of manifest.articles) {
  const draftPath = path.join(root, "drafts", a.draft);
  let text;
  try { text = readFileSync(draftPath, "utf8"); } catch { continue; }

  const url = `${base}/${a.slug}/`;
  const out = syndicate(text, { title: a.title, url });
  const dir = path.join(OUT, a.slug);
  mkdirSync(dir, { recursive: true });

  out.x.forEach((post, i) => {
    writeFileSync(path.join(dir, `x-${String(i + 1).padStart(2, "0")}.txt`), `${post}\n`);
    files += 1;
  });
  writeFileSync(path.join(dir, "telegram.txt"), `${out.telegram}\n`);
  writeFileSync(path.join(dir, "linkedin.txt"), `${out.linkedin}\n`);
  writeFileSync(path.join(dir, "post.md"), out.markdown);
  files += 3;

  index.push({
    slug: a.slug,
    title: a.title,
    url,
    published: a.published,
    formats: Object.fromEntries(PLATFORMS.map((p) => [
      p,
      p === "x"
        ? out.x.map((_, i) => `/syndication/${a.slug}/x-${String(i + 1).padStart(2, "0")}.txt`)
        : `/syndication/${a.slug}/${p === "markdown" ? "post.md" : `${p}.txt`}`,
    ])),
  });
}

index.sort((a, b) => String(b.published).localeCompare(String(a.published)));
writeFileSync(path.join(OUT, "index.json"), `${JSON.stringify({
  generatedAt: new Date().toISOString(),
  note: "Each post, reshaped per platform. Every copy links back to the canonical page so its figures stay next to their source.",
  posts: index,
}, null, 2)}\n`);

console.log(`${index.length} posts × ${PLATFORMS.length} platforms → ${files + 1} files in site/dist/syndication/`);
console.log(`  index: /syndication/index.json`);
