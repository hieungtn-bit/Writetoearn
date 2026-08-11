/**
 * Static site generator for the research archive.
 *
 * Binance Square content is not indexable: it cannot be crawled by search
 * engines or cited by answer engines, so every post published there is an asset
 * that stops existing the moment someone leaves the app. This mirrors the same
 * drafts to owned, indexable pages.
 *
 * The source of truth is the draft file that was actually published, so the
 * site cannot drift from what went out. Metadata lives in site/manifest.json.
 */

const ESCAPES = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" };

export function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => ESCAPES[c]);
}

/** A heading in the published plain text: short, all-caps, no sentence period. */
function isHeading(line) {
  const t = line.trim();
  if (t.length === 0 || t.length > 90) return false;
  if (!/[A-Z]/.test(t)) return false;
  return t === t.toUpperCase() && !/[.!?]$/.test(t);
}

/** "3.1  ORDER FLOW IMBALANCE" — a numbered subsection. */
function isSubHeading(line) {
  return /^\d+\.\d+\s/.test(line.trim());
}

/**
 * Converts a published post's plain text into semantic HTML.
 *
 * Answer engines reward clear structure and self-contained factual sentences,
 * so headings become real heading elements and bullet runs become real lists
 * rather than styled paragraphs.
 */
export function renderBody(text, { cashtagBase } = {}) {
  const blocks = String(text).trim().split(/\n\s*\n/);
  const out = [];

  for (const raw of blocks) {
    const lines = raw.split("\n").map((l) => l.trimEnd()).filter((l) => l.trim());
    if (!lines.length) continue;

    // A run of bullets becomes a list.
    if (lines.every((l) => l.trim().startsWith("•") || l.trim().startsWith("-"))) {
      const items = lines
        .map((l) => `    <li>${linkCashtags(escapeHtml(l.replace(/^\s*[•-]\s*/, "")), cashtagBase)}</li>`)
        .join("\n");
      out.push(`  <ul>\n${items}\n  </ul>`);
      continue;
    }

    if (lines.length === 1 && isSubHeading(lines[0])) {
      out.push(`  <h3>${escapeHtml(lines[0].trim())}</h3>`);
      continue;
    }

    if (lines.length === 1 && isHeading(lines[0])) {
      out.push(`  <h2>${escapeHtml(lines[0].trim())}</h2>`);
      continue;
    }

    // Indented monospace runs (the scoring skeleton) stay preformatted.
    if (lines.every((l) => /^\s{2,}/.test(l) || /[=|]/.test(l))) {
      out.push(`  <pre><code>${escapeHtml(raw.replace(/\n+$/, ""))}</code></pre>`);
      continue;
    }

    const para = lines.map((l) => escapeHtml(l.trim())).join("<br>\n    ");
    out.push(`  <p>${linkCashtags(para, cashtagBase)}</p>`);
  }

  return out.join("\n");
}

/** Cashtags become links so a reader can act on the asset being discussed. */
function linkCashtags(html, base) {
  if (!base) return html;
  return html.replace(/\$([A-Z]{2,10})\b/g, (m, sym) =>
    `<a class="cashtag" href="${base}${sym}_USDT" rel="nofollow noopener" target="_blank">$${sym}</a>`);
}

/** Strips the trailing hashtag/disclaimer lines that only make sense on Square. */
export function stripPlatformFooter(text) {
  return String(text)
    .replace(/^\s*(\$[A-Z]{2,10}\s*)*#\w+.*$/gm, "")
    .trimEnd();
}

export function articleUrl(site, article) {
  return `${site.baseUrl.replace(/\/$/, "")}/${article.slug}/`;
}

/** Greedy wrap on word boundaries, for SVG text that cannot reflow itself. */
export function wrapText(text, maxChars) {
  const words = String(text).split(/\s+/).filter(Boolean);
  const lines = [];
  let line = "";
  for (const w of words) {
    if (!line) line = w;
    else if ((line + " " + w).length <= maxChars) line += " " + w;
    else { lines.push(line); line = w; }
  }
  if (line) lines.push(line);
  return lines;
}

/**
 * Social card, generated from the manifest instead of hand-built.
 *
 * Shipping raster covers meant ~1.7MB of base64 for nine articles and a manual
 * design pass per post. Generating vector cards keeps the payload at a few
 * kilobytes, stays crisp at any density, and means a new article gets a card
 * for free.
 */
export function renderCoverSvg(site, article) {
  const lines = wrapText(article.title, 30).slice(0, 3);
  const startY = 250 - (lines.length - 1) * 34;
  const titleTspans = lines
    .map((l, i) => `<tspan x="72" y="${startY + i * 68}">${escapeHtml(l)}</tspan>`)
    .join("");

  const pills = (article.assets ?? []).slice(0, 3);
  const pillEls = pills
    .map((sym, i) => {
      const w = 40 + sym.length * 17;
      const x = 72 + i * 0 + pills.slice(0, i).reduce((s, p) => s + 40 + p.length * 17 + 12, 0);
      return `<g><rect x="${x}" y="470" rx="22" width="${w}" height="44" fill="#1a1f27" stroke="#2b323c"/>` +
        `<text x="${x + w / 2}" y="499" text-anchor="middle" font-size="20" fill="#f0b90b" font-weight="700">$${escapeHtml(sym)}</text></g>`;
    })
    .join("");

  return `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630" viewBox="0 0 1200 630" role="img" aria-label="${escapeHtml(article.title)}">
<defs>
  <linearGradient id="g" x1="1" y1="0" x2="0" y2="1">
    <stop offset="0%" stop-color="#f0b90b" stop-opacity="0.16"/>
    <stop offset="60%" stop-color="#0b0e11" stop-opacity="0"/>
  </linearGradient>
  <pattern id="grid" width="60" height="60" patternUnits="userSpaceOnUse">
    <path d="M60 0H0V60" fill="none" stroke="#f0b90b" stroke-opacity="0.05" stroke-width="1"/>
  </pattern>
</defs>
<rect width="1200" height="630" fill="#0b0e11"/>
<rect width="1200" height="630" fill="url(#grid)"/>
<rect width="1200" height="630" fill="url(#g)"/>
<text x="72" y="110" font-family="Helvetica,Arial,sans-serif" font-size="20" letter-spacing="5" font-weight="700" fill="#f0b90b">RESEARCH</text>
<text font-family="Helvetica,Arial,sans-serif" font-size="54" font-weight="800" fill="#eaecef">${titleTspans}</text>
<rect x="72" y="${startY + lines.length * 68 - 30}" width="96" height="5" rx="2" fill="#f0b90b"/>
${pillEls}
<line x1="72" y1="548" x2="1128" y2="548" stroke="#20262e"/>
<text x="72" y="590" font-family="Helvetica,Arial,sans-serif" font-size="26" font-weight="800" fill="#eaecef">${escapeHtml(site.name)}</text>
<text x="1128" y="590" text-anchor="end" font-family="Helvetica,Arial,sans-serif" font-size="19" fill="#848e9c">${escapeHtml(site.tagline)}</text>
</svg>`;
}

/**
 * Structured data. Answer engines and search crawlers both read this, and it is
 * the cheapest way to make a claim machine-readable.
 */
export function articleJsonLd(site, article) {
  return {
    "@context": "https://schema.org",
    "@type": "AnalysisNewsArticle",
    headline: article.title,
    description: article.description,
    datePublished: article.published,
    dateModified: article.published,
    inLanguage: site.locale,
    isAccessibleForFree: true,
    url: articleUrl(site, article),
    mainEntityOfPage: { "@type": "WebPage", "@id": articleUrl(site, article) },
    image: [`${site.baseUrl}/assets/${article.slug}.svg`],
    author: { "@type": "Organization", name: site.name, url: site.baseUrl },
    publisher: {
      "@type": "Organization",
      name: site.name,
      url: site.baseUrl,
      slogan: site.tagline,
    },
    about: (article.assets ?? []).map((a) => ({ "@type": "Thing", name: a })),
    keywords: [...(article.topics ?? []), ...(article.assets ?? [])].join(", "),
  };
}

const CSS = `:root{color-scheme:dark;--bg:#0b0e11;--fg:#eaecef;--muted:#848e9c;--line:#20262e;--accent:#f0b90b;--card:#12171d}
*{box-sizing:border-box}
html{-webkit-text-size-adjust:100%}
body{margin:0;background:var(--bg);color:var(--fg);font:17px/1.7 -apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Helvetica,Arial,sans-serif}
a{color:var(--accent)}
.wrap{max-width:44rem;margin:0 auto;padding:1.5rem 1.15rem 4rem}
header.site{display:flex;align-items:baseline;gap:.7rem;flex-wrap:wrap;border-bottom:1px solid var(--line);padding-bottom:1rem;margin-bottom:2rem}
header.site a.brand{font-weight:800;font-size:1.2rem;color:var(--fg);text-decoration:none}
header.site .tag{color:var(--muted);font-size:.9rem}
h1{font-size:2rem;line-height:1.2;letter-spacing:-.02em;margin:.4rem 0 .6rem;font-weight:800}
h2{font-size:1.25rem;margin:2.4rem 0 .8rem;letter-spacing:-.01em;font-weight:700}
h3{font-size:1.05rem;margin:1.8rem 0 .6rem;color:var(--accent);font-weight:700}
p{margin:0 0 1.1rem}
ul{margin:0 0 1.2rem;padding-left:1.1rem}
li{margin:0 0 .55rem}
pre{background:var(--card);border:1px solid var(--line);border-radius:10px;padding:1rem;overflow-x:auto;font-size:.85rem;line-height:1.5}
code{font-family:ui-monospace,SFMono-Regular,Menlo,monospace}
.meta{color:var(--muted);font-size:.9rem;margin-bottom:1.6rem}
.cover{width:100%;height:auto;border-radius:12px;border:1px solid var(--line);margin:1rem 0 2rem;display:block}
.cashtag{text-decoration:none;font-weight:600;white-space:nowrap}
.card{display:block;border:1px solid var(--line);border-radius:12px;padding:1.1rem 1.2rem;margin-bottom:1rem;text-decoration:none;color:inherit;background:var(--card)}
.card:hover{border-color:var(--accent)}
.card h2{margin:0 0 .45rem;font-size:1.1rem;color:var(--fg)}
.card p{margin:0;color:var(--muted);font-size:.94rem}
.card .when{display:block;color:var(--muted);font-size:.8rem;margin-top:.6rem}
.lede{color:var(--muted);font-size:1.05rem;margin-bottom:2rem}
footer{border-top:1px solid var(--line);margin-top:3rem;padding-top:1.2rem;color:var(--muted);font-size:.85rem}
.pill{display:inline-block;border:1px solid var(--line);border-radius:999px;padding:.15rem .6rem;font-size:.78rem;color:var(--muted);margin-right:.35rem}
.backlink{display:inline-block;margin-bottom:1.5rem;font-size:.9rem;text-decoration:none}
header.site nav{margin-left:auto;display:flex;gap:1rem}
header.site nav a{font-size:.95rem;text-decoration:none;font-weight:600}
.chart{margin:1.4rem 0;padding:0}
.chart svg{width:100%;height:auto;display:block;border:1px solid var(--line);border-radius:10px}
.chart figcaption{color:var(--muted);font-size:.85rem;margin-top:.5rem;text-align:center}
.readings{width:100%;border-collapse:collapse;margin:1.2rem 0;font-size:.95rem}
.readings td{border-bottom:1px solid var(--line);padding:.6rem .4rem}
.readings td:last-child{text-align:right;font-weight:700;color:var(--accent);white-space:nowrap}
.box{border:1px solid var(--line);border-left:3px solid var(--accent);border-radius:8px;padding:1rem 1.1rem;margin:1.4rem 0;background:var(--card)}
.box.warn{border-left-color:#f6465d}
.box h4{margin:0 0 .5rem;font-size:.8rem;letter-spacing:.12em;text-transform:uppercase;color:var(--muted)}
.box p{margin:0}
.lvl{display:inline-block;font-size:.72rem;letter-spacing:.1em;text-transform:uppercase;color:#0b0e11;background:var(--accent);border-radius:4px;padding:.15rem .45rem;font-weight:800;margin-bottom:.6rem}
.q{color:var(--fg);font-size:1.05rem;font-style:italic;border-left:3px solid var(--line);padding-left:.9rem;margin:0 0 1.4rem}
.wrap.wide{max-width:64rem}
.filters{display:flex;gap:.5rem;flex-wrap:wrap;margin:0 0 1.4rem;padding:.9rem;border:1px solid var(--line);border-radius:12px;background:var(--card)}
.filters fieldset{border:0;margin:0;padding:0;display:flex;gap:.35rem;align-items:center;flex-wrap:wrap}
.filters legend{float:left;width:100%;color:var(--muted);font-size:.72rem;letter-spacing:.1em;text-transform:uppercase;margin-bottom:.35rem}
.filters button{font:inherit;font-size:.85rem;color:var(--muted);background:transparent;border:1px solid var(--line);border-radius:999px;padding:.25rem .75rem;cursor:pointer}
.filters button[aria-pressed=true]{color:#0b0e11;background:var(--accent);border-color:var(--accent);font-weight:700}
.sig{border:1px solid var(--line);border-radius:12px;background:var(--card);padding:1rem 1.1rem;margin-bottom:.8rem}
.sig[hidden]{display:none}
.sig-head{display:flex;align-items:baseline;gap:.6rem;flex-wrap:wrap}
.sig-head .asset{font-weight:800;font-size:1.15rem}
.sig-head .price{color:var(--muted);font-size:.9rem}
.sig-head .spacer{margin-left:auto}
.bias{font-size:.72rem;letter-spacing:.1em;text-transform:uppercase;font-weight:800;border-radius:4px;padding:.15rem .5rem;color:#0b0e11}
.bias.LONG{background:#3987e5}
.bias.SHORT{background:#c98500}
.bias.WAIT{background:#5a636d;color:#eaecef}
.flag{font-size:.72rem;border:1px solid var(--line);border-radius:999px;padding:.1rem .5rem;color:var(--muted)}
.flag.turn{border-color:var(--accent);color:var(--accent)}
.flag.thin{border-color:#f6465d;color:#f6465d}
.plan{display:grid;grid-template-columns:repeat(auto-fit,minmax(7.5rem,1fr));gap:.5rem .9rem;margin:.9rem 0 0}
.plan div{font-size:.85rem}
.plan dt{color:var(--muted);font-size:.72rem;letter-spacing:.06em;text-transform:uppercase}
.plan dd{margin:0;font-weight:700;font-variant-numeric:tabular-nums}
.sig .why{color:var(--muted);font-size:.85rem;margin:.7rem 0 0}
.empty{color:var(--muted);padding:2rem 0;text-align:center}
@media(max-width:480px){h1{font-size:1.6rem}body{font-size:16px}.readings{font-size:.88rem}}`;

function head({ title, description, canonical, image, jsonLd, site }) {
  return `<!doctype html>
<html lang="${site.locale}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${escapeHtml(title)}</title>
<meta name="description" content="${escapeHtml(description)}">
<link rel="canonical" href="${canonical}">
<meta property="og:type" content="article">
<meta property="og:title" content="${escapeHtml(title)}">
<meta property="og:description" content="${escapeHtml(description)}">
<meta property="og:url" content="${canonical}">
<meta property="og:site_name" content="${escapeHtml(site.name)}">
${image ? `<meta property="og:image" content="${image}">` : ""}
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="${escapeHtml(title)}">
<meta name="twitter:description" content="${escapeHtml(description)}">
${image ? `<meta name="twitter:image" content="${image}">` : ""}
<meta name="robots" content="index,follow,max-image-preview:large,max-snippet:-1">
<link rel="stylesheet" href="/style.css">
<script type="application/ld+json">${JSON.stringify(jsonLd)}</script>
</head>
<body>
<div class="wrap">
<header class="site">
  <a class="brand" href="/">${escapeHtml(site.name)}</a>
  <nav><a href="/signals/">Signals</a><a href="/learn/">Learn</a><a href="/">Research</a></nav>
</header>`;
}

const foot = (site) => `
<footer>
  <p>${escapeHtml(site.name)} — ${escapeHtml(site.tagline)} Educational research, not financial advice.</p>
  <p>Every figure is traced to public exchange data at the time of writing. Market data moves; verify before acting.</p>
</footer>
</div>
</body>
</html>`;

export function renderArticlePage(site, article, text) {
  const canonical = articleUrl(site, article);
  const image = `${site.baseUrl}/assets/${article.slug}.svg`;
  const body = renderBody(stripPlatformFooter(text), { cashtagBase: "https://www.binance.com/en/trade/" });
  const date = new Date(article.published);

  return `${head({
    title: `${article.title} | ${site.name}`,
    description: article.description,
    canonical,
    image,
    jsonLd: articleJsonLd(site, article),
    site,
  })}
<a class="backlink" href="/">&larr; All research</a>
<article>
<h1>${escapeHtml(article.title)}</h1>
<p class="meta"><time datetime="${article.published}">${date.toISOString().slice(0, 10)}</time>
${(article.assets ?? []).map((a) => `<span class="pill">$${escapeHtml(a)}</span>`).join("")}</p>
<img class="cover" src="/assets/${article.slug}.svg" alt="${escapeHtml(article.title)}" width="1200" height="630" loading="eager">
${body}
</article>
${article.squareId ? `<p class="meta">Originally published on Binance Square · <a href="https://app.binance.com/uni-qr/cart/${article.squareId}?r=LOHZTAM2&amp;l=en" rel="noopener" target="_blank">read it there</a></p>` : ""}
${foot(site)}`;
}

export function renderIndexPage(site, articles) {
  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "Blog",
    name: site.name,
    description: site.description,
    url: site.baseUrl,
    inLanguage: site.locale,
    publisher: { "@type": "Organization", name: site.name, slogan: site.tagline, url: site.baseUrl },
    blogPost: articles.map((a) => ({
      "@type": "BlogPosting",
      headline: a.title,
      description: a.description,
      datePublished: a.published,
      url: articleUrl(site, a),
    })),
  };

  const cards = articles
    .map(
      (a) => `<a class="card" href="/${a.slug}/">
  <h2>${escapeHtml(a.title)}</h2>
  <p>${escapeHtml(a.description)}</p>
  <span class="when"><time datetime="${a.published}">${a.published.slice(0, 10)}</time> · ${(a.assets ?? []).map((s) => `$${escapeHtml(s)}`).join(" ")}</span>
</a>`,
    )
    .join("\n");

  return `${head({
    title: `${site.name} — ${site.tagline}`,
    description: site.description,
    canonical: `${site.baseUrl}/`,
    image: articles[0] ? `${site.baseUrl}/assets/${articles[0].slug}.svg` : null,
    jsonLd,
    site,
  })}
<h1>Crypto research you can check</h1>
<p class="lede">${escapeHtml(site.description)}</p>
${cards}
${foot(site)}`;
}

export function lessonUrl(site, lesson) {
  return `${site.baseUrl.replace(/\/$/, "")}/learn/${lesson.slug}/`;
}

/**
 * Lessons are marked up as HowTo rather than Article: each one teaches a
 * repeatable procedure, and that is what makes it eligible to be surfaced as an
 * answer instead of as a link.
 */
export function lessonJsonLd(site, lesson) {
  return {
    "@context": "https://schema.org",
    "@type": "HowTo",
    name: lesson.title,
    description: lesson.question,
    inLanguage: site.locale,
    isAccessibleForFree: true,
    url: lessonUrl(site, lesson),
    mainEntityOfPage: { "@type": "WebPage", "@id": lessonUrl(site, lesson) },
    publisher: { "@type": "Organization", name: site.name, url: site.baseUrl },
    step: lesson.formula.map((f, i) => ({
      "@type": "HowToStep",
      position: i + 1,
      text: f,
    })),
  };
}

export function renderLessonPage(site, lesson) {
  const e = lesson.example;
  const rows = e.readings
    .map(([k, v]) => `  <tr><td>${escapeHtml(k)}</td><td>${escapeHtml(v)}</td></tr>`)
    .join("\n");

  return `${head({
    title: `${lesson.title} | ${site.name}`,
    description: lesson.question,
    canonical: lessonUrl(site, lesson),
    image: `${site.baseUrl}/assets/learn-${lesson.slug}.svg`,
    jsonLd: lessonJsonLd(site, lesson),
    site,
  })}
<a class="backlink" href="/learn/">&larr; All lessons</a>
<article>
<span class="lvl">${escapeHtml(lesson.level)}</span>
<h1>${escapeHtml(lesson.title)}</h1>
<p class="q">${escapeHtml(lesson.question)}</p>

<h2>The idea</h2>
<p>${escapeHtml(lesson.concept)}</p>

<h2>The formula</h2>
<pre><code>${escapeHtml(lesson.formula.join("\n"))}</code></pre>

<h2>Worked example — ${escapeHtml(e.subject)}</h2>
<p class="meta">Measured on Binance spot daily candles${lesson.measuredAt ? ` at <time datetime="${lesson.measuredAt}">${escapeHtml(lesson.measuredAt.slice(0, 16).replace("T", " "))} UTC</time>` : ""}. Re-run the formula on current data and you should reproduce the method, not necessarily these figures.</p>
<table class="readings">
${rows}
</table>
${e.charts.join("\n")}
<p>${escapeHtml(e.verdict)}</p>

<div class="box warn">
  <h4>Common mistake</h4>
  <p>${escapeHtml(lesson.mistake)}</p>
</div>

<div class="box">
  <h4>Do it yourself</h4>
  <p>Export daily candles for any pair, apply the formula above, and compare your number to the one on this page.
  If they disagree, one of us is wrong and it is worth finding out which.</p>
</div>
</article>
${foot(site)}`;
}

export function renderLearnIndex(site, lessons) {
  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "ItemList",
    name: `${site.name} — trading lessons`,
    description: "Practical trading techniques, each with a worked example computed from live exchange data.",
    url: `${site.baseUrl}/learn/`,
    itemListElement: lessons.map((l, i) => ({
      "@type": "ListItem",
      position: i + 1,
      name: l.title,
      url: lessonUrl(site, l),
    })),
  };

  const cards = lessons.map((l) => `<a class="card" href="/learn/${l.slug}/">
  <span class="lvl">${escapeHtml(l.level)}</span>
  <h2>${escapeHtml(l.title)}</h2>
  <p>${escapeHtml(l.question)}</p>
  <span class="when">Worked example: ${escapeHtml(l.example.subject)}</span>
</a>`).join("\n");

  return `${head({
    title: `Learn trading, with worked examples | ${site.name}`,
    description: "Practical trading techniques, each with a worked example computed from live exchange data — not theory.",
    canonical: `${site.baseUrl}/learn/`,
    image: `${site.baseUrl}/assets/learn-${lessons[0]?.slug}.svg`,
    jsonLd,
    site,
  })}
<h1>Learn the measurement, not the opinion</h1>
<p class="lede">Every lesson below teaches one technique, gives you the exact formula, and works it through on live
exchange data. If you cannot reproduce a number here, that is a defect worth reporting.</p>
${cards}
${foot(site)}`;
}


/**
 * The daily signal board.
 *
 * Rendered from site/signals.json, which scripts/scan-daily.mjs writes. The
 * build stays offline: a deploy must not fail because an exchange is
 * unreachable from the build region, so the market is touched by the scan and
 * never by the build.
 *
 * Filtering is done in the page rather than by generating a page per
 * combination. Every row is already in the HTML, so the board works without
 * JavaScript — the filters are an enhancement, not the content — and a reader
 * on a phone gets the whole board in one request.
 *
 * The design decision that matters: a row leads with what would make you
 * *distrust* it. Sample size and the regime flag sit next to the bias, not
 * buried under the plan, because a strong expectancy over five independent
 * episodes is a story rather than a finding and the board should say so before
 * anyone reads the entry price.
 */
export function renderSignalsPage(site, snapshot) {
  const canonical = `${site.baseUrl}/signals/`;
  const t = snapshot.tally ?? {};
  const when = String(snapshot.scannedAt ?? "").replace("T", " ").slice(0, 16);

  const n2 = (v) => (typeof v === "number" && Number.isFinite(v) ? v.toFixed(2) : "—");
  const n1 = (v) => (typeof v === "number" && Number.isFinite(v) ? v.toFixed(1) : "—");
  const money = (v) => {
    if (typeof v !== "number" || !Number.isFinite(v)) return "—";
    const a = Math.abs(v);
    if (a >= 1000) return v.toFixed(0);
    if (a >= 1) return v.toFixed(3);
    if (a >= 0.01) return v.toFixed(4);
    return v.toFixed(6);
  };

  const rows = (snapshot.signals ?? []).map((s) => {
    const p = s.plan;
    const flags = [
      s.regime?.turning ? '<span class="flag turn">regime turn</span>' : "",
      s.confidence?.thin ? '<span class="flag thin">thin sample</span>' : "",
      s.tradeable === false ? '<span class="flag thin">too thin to size</span>' : "",
    ].join("");

    const plan = p
      ? `<dl class="plan">
      <div><dt>Horizon</dt><dd>${p.horizonDays}d</dd></div>
      <div><dt>Entry</dt><dd>${money(p.entry)}</dd></div>
      <div><dt>Stop</dt><dd>${money(p.stop)} <span class="price">· ${n2(p.stopPct)}%</span></dd></div>
      <div><dt>Target</dt><dd>${money(p.target)} <span class="price">· ${n2(p.targetPct)}%</span></dd></div>
      <div><dt>Hit rate</dt><dd>${n1(p.hitPct)}%</dd></div>
      <div><dt>Expectancy</dt><dd>${n2(p.expectancyR)}R</dd></div>
      <div><dt>Independent n</dt><dd>${Math.round(p.effectiveN ?? 0)}</dd></div>
      <div><dt>Size / $1k</dt><dd>$${n1(p.positionUsdPer1000)}</dd></div>
    </dl>`
      : "";

    const ctx = s.context ?? {};
    return `<article class="sig" data-bias="${s.bias}" data-horizon="${p ? p.horizonDays : ""}" data-tradeable="${s.tradeable !== false}">
    <div class="sig-head">
      <span class="asset">${escapeHtml(s.asset ?? s.symbol ?? "")}</span>
      <span class="price">${money(s.price)}</span>
      <span class="spacer"></span>
      <span class="bias ${s.bias}">${s.bias}</span>
    </div>
    <div>${flags}</div>
    ${plan}
    <p class="why">${escapeHtml(s.reason ?? "")}${
      ctx.stage ? ` · stage ${escapeHtml(String(ctx.stage))}` : ""
    }${
      typeof ctx.underwaterPct === "number" ? ` · ${n1(ctx.underwaterPct)}% overhead` : ""
    }${
      typeof ctx.volumeTrendPct === "number" ? ` · volume ${n1(ctx.volumeTrendPct)}%` : ""
    }</p>
  </article>`;
  }).join("\n");

  const horizons = [...new Set((snapshot.signals ?? []).map((s) => s.plan?.horizonDays).filter(Boolean))]
    .sort((a, b) => a - b);

  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "Dataset",
    name: `${site.name} — daily signal board`,
    description: "Two-sided geometry scan across the majors and a liquid altcoin universe, scored bar by bar.",
    url: canonical,
    dateModified: snapshot.scannedAt,
    creator: { "@type": "Organization", name: site.name },
  };

  return `${head({
    title: `Daily signal board — ${site.name}`,
    description: "Long, short or stand aside on every pair scanned, with the expectancy and the sample size behind each call.",
    canonical,
    jsonLd,
    site,
  }).replace('<div class="wrap">', '<div class="wrap wide">')}
<h1>Daily signal board</h1>
<p class="lede">Every pair scored in <strong>both</strong> directions over the last 180 days. Stand aside is a conclusion here, not a default — it appears only when long and short both lose.</p>
<p class="meta">Scanned ${escapeHtml(when)} UTC · ${t.total ?? 0} pairs · ${t.LONG ?? 0} long · ${t.SHORT ?? 0} short · ${t.WAIT ?? 0} wait · ${t.turning ?? 0} regime turn${t.turning === 1 ? "" : "s"}</p>

<div class="box warn">
  <h4>Read this before the table</h4>
  <p>Expectancy is measured on overlapping windows, so the honest sample is the <strong>independent n</strong> column — often five or fewer on a 30-day horizon. A strong number over five episodes is a story, not a finding. Rows marked <em>regime turn</em> are ones where the recent window disagrees in sign with the full history: the market has changed inside the sample, and the long-run average describes a market that no longer exists.</p>
</div>

<form class="filters" id="filters">
  <fieldset><legend>Direction</legend>
    <button type="button" data-filter="bias" data-value="all" aria-pressed="true">All</button>
    <button type="button" data-filter="bias" data-value="LONG" aria-pressed="false">Long</button>
    <button type="button" data-filter="bias" data-value="SHORT" aria-pressed="false">Short</button>
    <button type="button" data-filter="bias" data-value="WAIT" aria-pressed="false">Wait</button>
  </fieldset>
  <fieldset><legend>Horizon</legend>
    <button type="button" data-filter="horizon" data-value="all" aria-pressed="true">All</button>
    ${horizons.map((h) => `<button type="button" data-filter="horizon" data-value="${h}" aria-pressed="false">${h}d</button>`).join("")}
  </fieldset>
  <fieldset><legend>Liquidity</legend>
    <button type="button" data-filter="tradeable" data-value="all" aria-pressed="true">All</button>
    <button type="button" data-filter="tradeable" data-value="true" aria-pressed="false">Sizeable only</button>
  </fieldset>
</form>

<div id="board">
${rows || '<p class="empty">No scan on record yet. Run <code>node scripts/scan-daily.mjs</code>.</p>'}
</div>
<p class="empty" id="none" hidden>Nothing matches those filters.</p>

<h2>How a call is made</h2>
<ul>
  <li>Every geometry is walked bar by bar. A bar reaching both the stop and the target is charged to the <strong>stop</strong>, because a daily candle does not reveal the order inside it.</li>
  <li>Positions still open at the horizon close <strong>at the market</strong>. Counting them as flat once turned a −7.4% median outcome into a +0.115R headline.</li>
  <li>Stops price cannot reach are discarded rather than scored. A stop below zero is never hit, which used to make every such cell look profitable.</li>
  <li>The call is the <strong>median</strong> cell across the grid, not the best one. One bright cell in a field of losses is a search artefact.</li>
  <li>Funding, open interest and liquidation data are unavailable from this host and are used nowhere.</li>
</ul>

<script>
(function () {
  var state = { bias: "all", horizon: "all", tradeable: "all" };
  var form = document.getElementById("filters");
  var none = document.getElementById("none");
  if (!form) return;

  function apply() {
    var shown = 0;
    document.querySelectorAll(".sig").forEach(function (el) {
      var ok =
        (state.bias === "all" || el.dataset.bias === state.bias) &&
        (state.horizon === "all" || el.dataset.horizon === state.horizon) &&
        (state.tradeable === "all" || el.dataset.tradeable === state.tradeable);
      el.hidden = !ok;
      if (ok) shown++;
    });
    if (none) none.hidden = shown !== 0;
  }

  form.addEventListener("click", function (e) {
    var b = e.target.closest("button[data-filter]");
    if (!b) return;
    state[b.dataset.filter] = b.dataset.value;
    form.querySelectorAll('button[data-filter="' + b.dataset.filter + '"]').forEach(function (o) {
      o.setAttribute("aria-pressed", String(o === b));
    });
    apply();
  });
})();
</script>
${foot(site)}`;
}

export function renderSitemap(site, articles, lessons = [], signals = null) {
  const urls = [
    { loc: `${site.baseUrl}/`, lastmod: articles[0]?.published, priority: "1.0" },
    ...(signals ? [{ loc: `${site.baseUrl}/signals/`, lastmod: signals.scannedAt, priority: "0.9" }] : []),
    { loc: `${site.baseUrl}/learn/`, priority: "0.9" },
    ...lessons.map((l) => ({ loc: lessonUrl(site, l), priority: "0.8" })),
    ...articles.map((a) => ({ loc: articleUrl(site, a), lastmod: a.published, priority: "0.8" })),
  ];
  const body = urls
    .map(
      (u) =>
        `  <url>\n    <loc>${u.loc}</loc>\n${u.lastmod ? `    <lastmod>${u.lastmod}</lastmod>\n` : ""}    <priority>${u.priority}</priority>\n  </url>`,
    )
    .join("\n");
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${body}\n</urlset>\n`;
}

export function renderRobots(site) {
  // Answer engines are allowed on purpose: being cited is the point of
  // publishing research outside a walled garden.
  return `User-agent: *\nAllow: /\n\nSitemap: ${site.baseUrl}/sitemap.xml\n`;
}

/**
 * Builds every file for the site.
 * @returns {{path: string, content: string}[]} Text files only; assets are copied separately.
 */
export function buildSite(manifest, drafts, lessons = [], signals = null) {
  const { site } = manifest;
  const articles = [...manifest.articles].sort((a, b) => b.published.localeCompare(a.published));

  const files = [
    { path: "style.css", content: CSS },
    { path: "index.html", content: renderIndexPage(site, articles) },
    { path: "sitemap.xml", content: renderSitemap(site, articles, lessons, signals) },
    { path: "robots.txt", content: renderRobots(site) },
  ];

  /**
   * The signal board, when a scan has been captured.
   *
   * Optional on purpose: the build must succeed on a clean checkout that has
   * never run a scan, and it must never reach for the market itself to fill
   * the gap. A missing board is a missing page, not a failed deploy.
   */
  if (signals) {
    files.push({ path: "signals/index.html", content: renderSignalsPage(site, signals) });
  }

  if (lessons.length) {
    files.push({ path: "learn/index.html", content: renderLearnIndex(site, lessons) });
    for (const l of lessons) {
      files.push({ path: `learn/${l.slug}/index.html`, content: renderLessonPage(site, l) });
      files.push({
        path: `assets/learn-${l.slug}.svg`,
        content: renderCoverSvg(site, { title: l.title, assets: [l.level.toUpperCase()] }),
      });
    }
  }

  for (const a of articles) {
    const text = drafts[a.draft];
    if (!text) throw new Error(`Missing draft "${a.draft}" for article "${a.slug}".`);
    files.push({ path: `${a.slug}/index.html`, content: renderArticlePage(site, a, text) });
    files.push({ path: `assets/${a.slug}.svg`, content: renderCoverSvg(site, a) });
  }

  return files;
}
