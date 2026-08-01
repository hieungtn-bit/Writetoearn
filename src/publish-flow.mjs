/**
 * One command from draft to live: publish to Square, record it on the site,
 * commit, push. Vercel deploys on the push.
 *
 * The daily cost of a post used to be five manual steps, and the manual step
 * that gets skipped is always the same one — updating the site manifest — which
 * leaves the web archive silently behind the feed. Making it a single command
 * removes the opportunity to forget.
 */

import { ValidationError } from "./errors.mjs";

/** Turns "22-btc-compression.txt" into "btc-compression". */
export function slugFromDraft(filename) {
  const base = String(filename).replace(/^.*\//, "").replace(/\.[^.]+$/, "");
  const slug = base.replace(/^\d+-/, "").toLowerCase().replace(/[^a-z0-9-]+/g, "-").replace(/^-|-$/g, "");
  if (!slug) throw new ValidationError(`Could not derive a slug from "${filename}".`);
  return slug;
}

/**
 * First sentence of the draft, as a fallback meta description.
 *
 * A description is what search and answer engines quote, so an explicit one is
 * better — but a reasonable derived one beats a missing one, which is what
 * happens when the field is mandatory and someone is in a hurry.
 */
export function descriptionFromText(text, max = 200) {
  const body = String(text)
    .split(/\n\s*\n/)
    .map((p) => p.trim())
    .find((p) => p && !/^[A-Z0-9 .,'—-]+$/.test(p) && !p.startsWith("#"));
  if (!body) return "";
  const flat = body.replace(/\s+/g, " ").replace(/^[🚨🔍💥🔥]\s*/u, "");
  if (flat.length <= max) return flat;
  const cut = flat.slice(0, max);
  return `${cut.slice(0, cut.lastIndexOf(" "))}…`;
}

/** Cashtags carried by the post, in order of first appearance. */
export function assetsFromText(text, limit = 3) {
  const seen = [];
  for (const m of String(text).matchAll(/\$([A-Z]{2,10})\b/g)) {
    if (!seen.includes(m[1])) seen.push(m[1]);
  }
  return seen.slice(0, limit);
}

/**
 * Adds a published article to the site manifest.
 *
 * Pure so the failure cases are testable: a duplicate slug would silently
 * overwrite a live URL, and a missing draft would build a blank page.
 *
 * @returns {object} A new manifest; the input is not mutated.
 */
export function addArticle(manifest, entry) {
  if (!entry.slug) throw new ValidationError("An article entry needs a slug.");
  if (!entry.draft) throw new ValidationError("An article entry needs a draft filename.");
  if (!entry.title) throw new ValidationError("An article entry needs a title.");

  const articles = manifest.articles ?? [];
  if (articles.some((a) => a.slug === entry.slug)) {
    throw new ValidationError(
      `Slug "${entry.slug}" is already published. Pick another with --slug, or it would replace a live URL.`,
    );
  }
  if (articles.some((a) => a.draft === entry.draft)) {
    throw new ValidationError(`Draft "${entry.draft}" is already on the site.`);
  }

  const article = {
    slug: entry.slug,
    draft: entry.draft,
    title: entry.title,
    description: entry.description ?? "",
    published: entry.published ?? new Date().toISOString(),
    assets: entry.assets ?? [],
    topics: entry.topics ?? [],
  };
  if (entry.squareId) article.squareId = entry.squareId;

  return {
    ...manifest,
    articles: [article, ...articles].sort((a, b) => b.published.localeCompare(a.published)),
  };
}
