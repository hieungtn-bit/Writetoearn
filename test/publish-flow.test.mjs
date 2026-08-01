import test from "node:test";
import assert from "node:assert/strict";
import {
  addArticle,
  assetsFromText,
  descriptionFromText,
  slugFromDraft,
} from "../src/publish-flow.mjs";

const base = {
  site: { name: "MAIX8", baseUrl: "https://example.test" },
  articles: [
    { slug: "older", draft: "1-older.txt", title: "Older", published: "2026-07-01T00:00:00Z" },
  ],
};

test("a slug is derived from the draft filename, without its ordering prefix", () => {
  assert.equal(slugFromDraft("drafts/22-btc-compression.txt"), "btc-compression");
  assert.equal(slugFromDraft("7-monthend.txt"), "monthend");
});

test("an underivable slug is refused rather than guessed", () => {
  assert.throws(() => slugFromDraft("123-.txt"), /Could not derive a slug/);
});

test("the description falls back to the first real paragraph, not the hook emoji", () => {
  const text = "🚨 BTC printed its tightest range.\n\nTHE MEASUREMENT\n\nDetail follows here.";
  const d = descriptionFromText(text);
  assert.match(d, /^BTC printed its tightest range/);
  assert.doesNotMatch(d, /🚨/);
});

test("an all-caps heading is never mistaken for the description", () => {
  const d = descriptionFromText("THE MEASUREMENT\n\nReal prose lives here and continues.");
  assert.match(d, /^Real prose/);
});

test("a long description is truncated on a word boundary", () => {
  const d = descriptionFromText(`${"word ".repeat(80)}end.`, 60);
  assert.ok(d.length <= 61, `got ${d.length}`);
  assert.match(d, /…$/);
  assert.doesNotMatch(d, /wor…$/, "should not cut mid-word");
});

test("assets come from the cashtags actually used, in order, capped at three", () => {
  const text = "$BTC leads $ETH and $BNB, and $BTC again, plus $SOL.";
  assert.deepEqual(assetsFromText(text), ["BTC", "ETH", "BNB"]);
});

test("addArticle prepends the new post and keeps the list newest first", () => {
  const next = addArticle(base, {
    slug: "newer",
    draft: "2-newer.txt",
    title: "Newer",
    published: "2026-08-01T00:00:00Z",
  });

  assert.equal(next.articles.length, 2);
  assert.equal(next.articles[0].slug, "newer");
  assert.equal(next.articles[1].slug, "older");
});

test("addArticle does not mutate the manifest it was given", () => {
  addArticle(base, { slug: "x", draft: "x.txt", title: "X" });
  assert.equal(base.articles.length, 1, "the original manifest should be untouched");
});

test("a duplicate slug is refused, because it would replace a live URL", () => {
  assert.throws(
    () => addArticle(base, { slug: "older", draft: "2-new.txt", title: "T" }),
    /already published/,
  );
});

test("publishing the same draft twice is refused", () => {
  assert.throws(
    () => addArticle(base, { slug: "different", draft: "1-older.txt", title: "T" }),
    /already on the site/,
  );
});

test("the required fields are checked before anything is written", () => {
  assert.throws(() => addArticle(base, { draft: "a.txt", title: "T" }), /needs a slug/);
  assert.throws(() => addArticle(base, { slug: "a", title: "T" }), /needs a draft/);
  assert.throws(() => addArticle(base, { slug: "a", draft: "a.txt" }), /needs a title/);
});

test("the Square post id is recorded when there is one, and omitted otherwise", () => {
  const withId = addArticle(base, { slug: "a", draft: "a.txt", title: "T", squareId: "123" });
  assert.equal(withId.articles[0].squareId, "123");

  const without = addArticle(base, { slug: "b", draft: "b.txt", title: "T" });
  assert.ok(!("squareId" in without.articles[0]));
});
