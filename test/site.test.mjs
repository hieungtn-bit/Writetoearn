import test from "node:test";
import assert from "node:assert/strict";
import {
  articleJsonLd,
  articleUrl,
  buildSite,
  escapeHtml,
  renderBody,
  renderIndexPage,
  renderRobots,
  renderSitemap,
  stripPlatformFooter,
  renderCoverSvg,
  wrapText,
} from "../src/site.mjs";

const site = {
  name: "MAIX8 Research",
  tagline: "Evidence Over Emotion.",
  description: "Data-verified crypto research.",
  locale: "en",
  baseUrl: "https://example.test",
};

const article = {
  slug: "btc-range",
  draft: "18.txt",
  cover: "cover.png",
  title: "BTC's Tightest Range",
  description: "A description.",
  published: "2026-08-01T09:20:00Z",
  assets: ["BTC"],
  squareId: "123",
  topics: ["volatility"],
};

test("html special characters are escaped", () => {
  assert.equal(escapeHtml(`<script>"x" & 'y'</script>`),
    "&lt;script&gt;&quot;x&quot; &amp; &#39;y&#39;&lt;/script&gt;");
});

test("all-caps lines become headings, prose becomes paragraphs", () => {
  const html = renderBody("THE MEASUREMENT\n\nPrice moved today.");
  assert.match(html, /<h2>THE MEASUREMENT<\/h2>/);
  assert.match(html, /<p>Price moved today\.<\/p>/);
});

test("a numbered subsection becomes an h3", () => {
  const html = renderBody("3.1  ORDER FLOW IMBALANCE");
  assert.match(html, /<h3>3\.1  ORDER FLOW IMBALANCE<\/h3>/);
});

test("bullet runs become a real list, not styled paragraphs", () => {
  const html = renderBody("• first point\n• second point");
  assert.match(html, /<ul>/);
  assert.equal((html.match(/<li>/g) ?? []).length, 2);
  assert.doesNotMatch(html, /•/, "the bullet glyph should be replaced by markup");
});

test("a sentence in caps that ends in a period is not treated as a heading", () => {
  const html = renderBody("THIS IS SHOUTING, NOT A HEADING.");
  assert.match(html, /<p>/);
  assert.doesNotMatch(html, /<h2>/);
});

test("cashtags become links only when a base is supplied", () => {
  const plain = renderBody("$BTC held support.");
  assert.doesNotMatch(plain, /<a/);

  const linked = renderBody("$BTC held support.", { cashtagBase: "https://x.test/" });
  assert.match(linked, /href="https:\/\/x\.test\/BTC_USDT"/);
  assert.match(linked, />\$BTC</);
});

test("platform-only hashtag footers are stripped", () => {
  const text = "Real analysis here.\n\n$BTC $ETH #WriteToEarn #BinanceSquare";
  const out = stripPlatformFooter(text);
  assert.match(out, /Real analysis here\./);
  assert.doesNotMatch(out, /#WriteToEarn/);
});

test("article urls end in a trailing slash for stable canonicals", () => {
  assert.equal(articleUrl(site, article), "https://example.test/btc-range/");
});

test("structured data carries the fields crawlers and answer engines read", () => {
  const ld = articleJsonLd(site, article);
  assert.equal(ld["@context"], "https://schema.org");
  assert.equal(ld.headline, article.title);
  assert.equal(ld.datePublished, article.published);
  assert.equal(ld.url, "https://example.test/btc-range/");
  assert.equal(ld.publisher.name, site.name);
  assert.deepEqual(ld.about, [{ "@type": "Thing", name: "BTC" }]);
  assert.match(ld.keywords, /volatility/);
});

test("the sitemap lists the index and every article", () => {
  const xml = renderSitemap(site, [article]);
  assert.match(xml, /<loc>https:\/\/example\.test\/<\/loc>/);
  assert.match(xml, /<loc>https:\/\/example\.test\/btc-range\/<\/loc>/);
  assert.match(xml, /<lastmod>2026-08-01T09:20:00Z<\/lastmod>/);
});

test("robots points crawlers at the sitemap and allows them", () => {
  const txt = renderRobots(site);
  assert.match(txt, /Allow: \//);
  assert.match(txt, /Sitemap: https:\/\/example\.test\/sitemap\.xml/);
});

test("the index page is mobile-first and self-describing", () => {
  const html = renderIndexPage(site, [article]);
  assert.match(html, /<meta name="viewport" content="width=device-width,initial-scale=1">/);
  assert.match(html, /<link rel="canonical" href="https:\/\/example\.test\/">/);
  assert.match(html, /application\/ld\+json/);
  assert.match(html, /href="\/btc-range\/"/);
});

test("buildSite emits an index, sitemap, robots and a page per article", () => {
  const manifest = { site, articles: [article] };
  const files = buildSite(manifest, { "18.txt": "THE MEASUREMENT\n\nBTC held." });
  const paths = files.map((f) => f.path);

  assert.deepEqual(paths.sort(), [
    "assets/btc-range.svg",
    "btc-range/index.html",
    "feed.json",
    "feed.xml",
    "index.html",
    "robots.txt",
    "sitemap.xml",
    "style.css",
  ]);
  const page = files.find((f) => f.path === "btc-range/index.html").content;
  assert.match(page, /<h1>BTC&#39;s Tightest Range<\/h1>/);
  assert.match(page, /Originally published on Binance Square/);
});

test("the feeds carry every article and link back to its own page", () => {
  const manifest = { site, articles: [article] };
  const files = buildSite(manifest, { "18.txt": "THE MEASUREMENT\n\nBTC held." });

  const rss = files.find((f) => f.path === "feed.xml").content;
  assert.match(rss, /<rss version="2\.0">/);
  assert.match(rss, new RegExp(`${site.baseUrl}/btc-range/`));

  const json = JSON.parse(files.find((f) => f.path === "feed.json").content);
  assert.equal(json.items.length, 1);
  assert.equal(json.items[0].url, `${site.baseUrl}/btc-range/`);
});

test("the record page only appears when a record has been exported", () => {
  const manifest = { site, articles: [article] };
  const drafts = { "18.txt": "THE MEASUREMENT\n\nBTC held." };

  const without = buildSite(manifest, drafts).map((f) => f.path);
  assert.ok(!without.includes("record/index.html"), "a clean checkout must still build");

  const record = {
    generatedAt: new Date().toISOString(),
    summary: { scored: 2, biasCorrect: 1, biasTotal: 2, biasPct: 50, pending: 0, unscoreable: 3, publishedTotal: 5 },
    backtest: null,
    calls: [
      { asset: "BTCUSDT", bias: "WAIT", publishedAt: "2026-08-01T00:00:00.000Z", correct: true, movePct: 0.4, hours: 24 },
      { asset: "SOLUSDT", bias: "LONG", publishedAt: "2026-08-02T00:00:00.000Z", correct: false, movePct: -3.1, hours: 24 },
    ],
    ledger: [],
    snapshots: 7,
  };
  const page = buildSite(manifest, drafts, [], null, {}, record)
    .find((f) => f.path === "record/index.html").content;

  // The losing call has to be on the page, at the same size as the winner.
  assert.match(page, /SOL/);
  assert.match(page, /class="no">wrong/);
  assert.match(page, /class="ok">right/);
  // And the unscoreable posts have to be declared, not silently dropped.
  assert.match(page, /3 of 5 published pieces stated no directional call/);
});

test("a manifest referencing a missing draft fails loudly", () => {
  const manifest = { site, articles: [article] };
  assert.throws(() => buildSite(manifest, {}), /Missing draft "18\.txt"/);
});

test("articles are ordered newest first", () => {
  const older = { ...article, slug: "older", published: "2026-07-01T00:00:00Z" };
  const files = buildSite({ site, articles: [older, article] }, { "18.txt": "x" });
  const index = files.find((f) => f.path === "index.html").content;
  assert.ok(index.indexOf("/btc-range/") < index.indexOf("/older/"), "newest article should come first");
});

test("wrapText breaks on word boundaries without splitting words", () => {
  const lines = wrapText("the quick brown fox jumps over", 12);
  assert.ok(lines.every((l) => l.length <= 12), JSON.stringify(lines));
  assert.equal(lines.join(" "), "the quick brown fox jumps over");
});

test("a cover card is generated per article, as valid standalone svg", () => {
  const svg = renderCoverSvg(site, article);
  assert.match(svg, /^<svg xmlns="http:\/\/www\.w3\.org\/2000\/svg"/);
  assert.match(svg, /<\/svg>$/);
  assert.match(svg, /viewBox="0 0 1200 630"/);
  assert.match(svg, /BTC/);
  assert.match(svg, /MAIX8 Research/);
});

test("cover cards escape titles rather than injecting raw markup", () => {
  const svg = renderCoverSvg(site, { ...article, title: '<script>alert(1)</script>' });
  assert.doesNotMatch(svg, /<script>/);
  assert.match(svg, /&lt;script&gt;/);
});

test("the build emits a vector card for every article", () => {
  const files = buildSite({ site, articles: [article] }, { "18.txt": "x" });
  assert.ok(files.some((f) => f.path === "assets/btc-range.svg"));
  const page = files.find((f) => f.path === "btc-range/index.html").content;
  assert.match(page, /src="\/assets\/btc-range\.svg"/);
  assert.match(page, /og:image" content="https:\/\/example\.test\/assets\/btc-range\.svg"/);
});
