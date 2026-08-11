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
.wrap.board{max-width:60rem}
.board h1{margin-bottom:.3rem}
details.box summary{cursor:pointer;font-size:.8rem;letter-spacing:.1em;text-transform:uppercase;color:var(--muted);margin-bottom:.5rem}
details.box[open] summary{margin-bottom:.7rem}
.filters{display:flex;flex-direction:column;gap:.85rem;margin:0 0 1.2rem;padding:.9rem;border:1px solid var(--line);border-radius:12px;background:var(--card)}
.filters fieldset{border:0;margin:0;padding:0;display:flex;gap:.35rem;flex-wrap:wrap}
.filters legend{width:100%;color:var(--muted);font-size:.7rem;letter-spacing:.1em;text-transform:uppercase;margin-bottom:.4rem}
.filters button[data-f],.pager button,.reset{font:inherit;font-size:.85rem;color:var(--muted);background:transparent;border:1px solid var(--line);border-radius:999px;padding:.4rem .8rem;cursor:pointer;min-height:2.25rem}
.filters button[aria-pressed=true]{color:#0b0e11;background:var(--accent);border-color:var(--accent);font-weight:700}
.frow{display:flex;gap:.7rem;flex-wrap:wrap;align-items:flex-end}
.fld{display:flex;flex-direction:column;gap:.3rem;flex:1 1 12rem;min-width:0}
.fld span{color:var(--muted);font-size:.7rem;letter-spacing:.1em;text-transform:uppercase}
.fld select,.fld input{font:inherit;font-size:.95rem;color:var(--fg);background:var(--bg);border:1px solid var(--line);border-radius:8px;padding:.5rem .6rem;min-height:2.6rem;width:100%}
.reset{flex:0 0 auto}
.count{color:var(--muted);font-size:.85rem;margin:0 0 .7rem}
.sig{border:1px solid var(--line);border-radius:12px;background:var(--card);padding:.9rem 1rem;margin-bottom:.75rem}
.sig-head{display:flex;align-items:center;gap:.5rem;flex-wrap:wrap}
.sig-head .asset{font-weight:800;font-size:1.2rem;letter-spacing:-.01em}
.sig-head .price{color:var(--muted);font-size:.9rem;font-variant-numeric:tabular-nums}
.sig-head .hz{margin-left:auto;color:var(--muted);font-size:.8rem;border:1px solid var(--line);border-radius:999px;padding:.1rem .55rem}
.bias{font-size:.7rem;letter-spacing:.08em;font-weight:800;border-radius:4px;padding:.2rem .5rem;color:#0b0e11}
.bias.LONG{background:#3987e5}
.bias.SHORT{background:#c98500}
.bias.WAIT{background:#5a636d;color:#eaecef}
.flags{display:flex;gap:.35rem;flex-wrap:wrap;margin-top:.5rem}
.flag{font-size:.7rem;border:1px solid var(--line);border-radius:999px;padding:.12rem .5rem;color:var(--muted)}
.flag.turn{border-color:var(--accent);color:var(--accent)}
.flag.thin{border-color:#f6465d;color:#f6465d}
/* Named .levels/.level, not .lvl — .lvl is already the lesson difficulty badge,
   and a signal card redefining it would restyle every lesson page. */
.levels{display:grid;grid-template-columns:repeat(3,1fr);gap:.4rem;margin:.85rem 0 .6rem}
.level{border:1px solid var(--line);border-radius:8px;padding:.45rem .5rem;min-width:0}
.level span{display:block;color:var(--muted);font-size:.65rem;letter-spacing:.06em;text-transform:uppercase}
.level b{display:block;font-size:1rem;font-variant-numeric:tabular-nums;overflow-wrap:anywhere}
.level i{display:block;font-style:normal;font-size:.75rem;color:var(--muted);font-variant-numeric:tabular-nums}
.level.out{border-left:3px solid #c98500}
.level.tgt{border-left:3px solid #3987e5}
.nums{display:grid;grid-template-columns:repeat(2,1fr);gap:.45rem .8rem}
.nums div{min-width:0}
.nums span{display:block;color:var(--muted);font-size:.65rem;letter-spacing:.06em;text-transform:uppercase}
.nums b{font-size:.95rem;font-variant-numeric:tabular-nums}
.why{color:var(--muted);font-size:.85rem;margin:.8rem 0 0;line-height:1.5}
.why .k{color:var(--fg);font-weight:700;font-size:.7rem;letter-spacing:.08em;text-transform:uppercase;margin-right:.35rem}
.pager{display:flex;gap:.35rem;flex-wrap:wrap;margin:1rem 0}
.pager button[aria-current=page]{color:#0b0e11;background:var(--accent);border-color:var(--accent);font-weight:700}
.empty{color:var(--muted);padding:1.5rem 0;text-align:center}
@media(min-width:34rem){.nums{grid-template-columns:repeat(4,1fr)}}
/* On a wide screen the stacked fieldsets push the first signal below the fold
   for no reason — half the panel is empty to the right of each chip row. */
@media(min-width:48rem){
.filters{display:grid;grid-template-columns:1fr 1fr;gap:.9rem 1.6rem;align-items:start}
.filters .frow{grid-column:1/-1}
}
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
 * Everything the board page needs, and nothing it does not.
 *
 * A full snapshot carries the whole geometry grid for every pair — 78KB, most
 * of it cells no reader will ever see. Inlining that would make a phone
 * download an audit trail to read a table. This is the shape the page renders
 * from and the shape each archived day is served as: 25KB, same numbers.
 */
export function slimSnapshot(snapshot) {
  return {
    scannedAt: snapshot.scannedAt ?? null,
    tally: snapshot.tally ?? {},
    recentWindowDays: snapshot.method?.recentWindowDays ?? null,
    signals: (snapshot.signals ?? []).map((s) => ({
      asset: s.asset ?? String(s.symbol ?? "").replace(/USDT$/, ""),
      price: s.price ?? null,
      bias: s.bias,
      tradeable: s.tradeable !== false,
      reason: s.reason ?? "",
      turning: Boolean(s.regime?.turning),
      thin: Boolean(s.confidence?.thin),
      plan: s.plan
        ? {
          horizonDays: s.plan.horizonDays,
          entry: s.plan.entry,
          stop: s.plan.stop,
          target: s.plan.target,
          stopPct: s.plan.stopPct,
          targetPct: s.plan.targetPct,
          rr: s.plan.rr,
          hitPct: s.plan.hitPct,
          expectancyR: s.plan.expectancyR,
          effectiveN: s.plan.effectiveN,
          positionUsdPer1000: s.plan.positionUsdPer1000,
        }
        : null,
      context: {
        stage: s.context?.stage ?? null,
        underwaterPct: s.context?.underwaterPct ?? null,
        volumeTrendPct: s.context?.volumeTrendPct ?? null,
        rangePosition30d: s.context?.rangePosition30d ?? null,
        change7dPct: s.context?.change7dPct ?? null,
      },
    })),
  };
}

/**
 * The daily signal board.
 *
 * Rebuilt for a phone. The first version laid each call out as a seven-column
 * grid, which is a table wearing a costume: on a 390px screen it reflowed into
 * a ragged stack where the stop price and its distance landed on different
 * rows. This version is a card that is designed narrow and merely gets roomier,
 * with the numbers grouped the way a decision uses them — where you get in,
 * where you are wrong, what it pays, and how much of that to believe.
 *
 * Rendering happens twice, deliberately. The latest day is written into the
 * HTML so the board works with JavaScript off and so a search engine sees the
 * calls. The same data is inlined as JSON, and the moment anyone touches a
 * filter the script re-renders from that — which is also what lets a different
 * day be fetched and shown without a page load.
 *
 * The filters are the ones a reader actually asks for: which day, which
 * direction, which horizon, how likely, how liquid, and free text over the
 * asset and the reason. Pagination keeps a thirty-row scan to a screenful.
 */
export function renderSignalsPage(site, snapshot, { days = [] } = {}) {
  const canonical = `${site.baseUrl}/signals/`;
  const slim = slimSnapshot(snapshot);
  const t = slim.tally ?? {};
  const when = String(slim.scannedAt ?? "").replace("T", " ").slice(0, 16);
  const today = String(slim.scannedAt ?? "").slice(0, 10);
  const allDays = [...new Set([today, ...days])].filter(Boolean).sort().reverse();

  const horizons = [...new Set(slim.signals.map((s) => s.plan?.horizonDays).filter(Boolean))]
    .sort((a, b) => a - b);

  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "Dataset",
    name: `${site.name} — daily signal board`,
    description: "Two-sided geometry scan across the majors and a liquid altcoin universe, scored bar by bar.",
    url: canonical,
    dateModified: slim.scannedAt,
    temporalCoverage: allDays.length > 1 ? `${allDays.at(-1)}/${allDays[0]}` : allDays[0],
    creator: { "@type": "Organization", name: site.name },
  };

  return `${head({
    title: `Daily signal board — ${site.name}`,
    description: "Long, short or stand aside on every pair scanned, with the hit rate, the expectancy and the honest sample size behind each call.",
    canonical,
    jsonLd,
    site,
  }).replace('<div class="wrap">', '<div class="wrap board">')}
<h1>Signal board</h1>
<p class="lede">Every pair is scored in <strong>both directions</strong> over the last ${slim.recentWindowDays ?? 180} days. Standing aside is a conclusion, not a default — it appears only when long and short both lose.</p>
<p class="meta" id="stamp">Scanned ${escapeHtml(when)} UTC · ${t.total ?? 0} pairs · ${t.LONG ?? 0} long · ${t.SHORT ?? 0} short · ${t.WAIT ?? 0} wait · ${t.turning ?? 0} regime turns</p>

<details class="box warn" open>
  <summary>Read the <strong>n</strong> column before the expectancy</summary>
  <p>The measurement windows overlap, so the honest sample is the number of <strong>independent episodes</strong> — usually five or fewer at the 30-day horizon. A strong number over five episodes is a story, not yet a finding. A row tagged <em>regime turn</em> is one where the recent window disagrees in sign with the full history: the market changed inside the sample.</p>
</details>

<form class="filters" id="filters" hidden>
  <div class="frow">
    <label class="fld"><span>Day</span>
      <select id="f-day">${allDays.map((d) => `<option value="${d}">${d}</option>`).join("")}</select>
    </label>
    <label class="fld"><span>Search coin or reason</span>
      <input type="search" id="f-q" placeholder="SOL, short pays…" autocomplete="off">
    </label>
  </div>

  <fieldset><legend>Signal</legend>
    <button type="button" data-f="bias" data-v="all" aria-pressed="true">All</button>
    <button type="button" data-f="bias" data-v="LONG" aria-pressed="false">Long</button>
    <button type="button" data-f="bias" data-v="SHORT" aria-pressed="false">Short</button>
    <button type="button" data-f="bias" data-v="WAIT" aria-pressed="false">Wait</button>
  </fieldset>

  <fieldset><legend>Horizon</legend>
    <button type="button" data-f="horizon" data-v="all" aria-pressed="true">All</button>
    ${horizons.map((h) => `<button type="button" data-f="horizon" data-v="${h}" aria-pressed="false">${h} days</button>`).join("")}
  </fieldset>

  <fieldset><legend>Hit rate</legend>
    <button type="button" data-f="hit" data-v="all" aria-pressed="true">All</button>
    <button type="button" data-f="hit" data-v="20" aria-pressed="false">≥ 20%</button>
    <button type="button" data-f="hit" data-v="30" aria-pressed="false">≥ 30%</button>
    <button type="button" data-f="hit" data-v="40" aria-pressed="false">≥ 40%</button>
  </fieldset>

  <fieldset><legend>Confidence</legend>
    <button type="button" data-f="quality" data-v="all" aria-pressed="true">All</button>
    <button type="button" data-f="quality" data-v="liquid" aria-pressed="false">Liquid enough</button>
    <button type="button" data-f="quality" data-v="solid" aria-pressed="false">Sample not thin</button>
  </fieldset>

  <div class="frow">
    <label class="fld"><span>Sort</span>
      <select id="f-sort">
        <option value="expectancy">Highest expectancy</option>
        <option value="hit">Highest hit rate</option>
        <option value="sample">Largest sample</option>
        <option value="asset">Coin name</option>
      </select>
    </label>
    <button type="button" class="reset" id="f-reset">Clear filters</button>
  </div>
</form>

<p class="count" id="count"></p>
<div id="board">
${slim.signals.length
    ? slim.signals.map(signalCard).join("\n")
    : '<p class="empty">No scan on record yet.</p>'}
</div>
<nav class="pager" id="pager" hidden></nav>
<p class="empty" id="none" hidden>Nothing matches those filters.</p>

<h2>How a call is scored</h2>
<ul>
  <li>Every geometry is walked <strong>bar by bar</strong>. A bar that reaches both the stop and the target is charged to the <strong>stop</strong> — a daily bar does not reveal the order of events inside it.</li>
  <li>A position still open at the end of the horizon is <strong>closed at the market</strong>. Counting those as flat once turned a −7.4% median outcome into a +0.115R headline.</li>
  <li>A stop the price cannot reach is rejected rather than scored. A stop below zero can never be hit, so every cell like that used to look profitable.</li>
  <li>The call takes the <strong>median cell</strong> of the grid, not the best one. A single bright cell in a field of losses is a product of searching.</li>
  <li>Funding, open interest and liquidation data are blocked from this host, so nothing here uses them.</li>
</ul>

<script id="board-data" type="application/json">${JSON.stringify(slim).replace(/</g, "\\u003c")}</script>
<script>
(function () {
  var data = JSON.parse(document.getElementById("board-data").textContent);
  var cache = {};
  var today = String(data.scannedAt || "").slice(0, 10);
  if (today) cache[today] = data;

  var PER_PAGE = 10;
  var state = { bias: "all", horizon: "all", hit: "all", quality: "all", q: "", sort: "expectancy", page: 1 };

  var board = document.getElementById("board");
  var pager = document.getElementById("pager");
  var none = document.getElementById("none");
  var countEl = document.getElementById("count");
  var stamp = document.getElementById("stamp");
  var form = document.getElementById("filters");

  function n(v, d) { return typeof v === "number" && isFinite(v) ? v.toFixed(d) : "—"; }
  function money(v) {
    if (typeof v !== "number" || !isFinite(v)) return "—";
    var a = Math.abs(v);
    if (a >= 1000) return v.toFixed(0);
    if (a >= 1) return v.toFixed(3);
    if (a >= 0.01) return v.toFixed(4);
    return v.toFixed(6);
  }
  function esc(s) {
    return String(s == null ? "" : s).replace(/[&<>"]/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c];
    });
  }

  function card(s) {
    var p = s.plan;
    var flags = "";
    if (s.turning) flags += '<span class="flag turn">regime turn</span>';
    if (s.thin) flags += '<span class="flag thin">thin sample</span>';
    if (!s.tradeable) flags += '<span class="flag thin">thin liquidity</span>';

    var plan = p ? (
      '<div class="levels">'
      + '<div class="level in"><span>Entry</span><b>' + money(p.entry) + '</b></div>'
      + '<div class="level out"><span>Stop</span><b>' + money(p.stop) + '</b><i>' + n(p.stopPct, 2) + '%</i></div>'
      + '<div class="level tgt"><span>Target</span><b>' + money(p.target) + '</b><i>' + n(p.targetPct, 2) + '%</i></div>'
      + "</div>"
      + '<div class="nums">'
      + '<div><span>Hit rate</span><b>' + n(p.hitPct, 1) + "%</b></div>"
      + '<div><span>Expectancy</span><b>' + n(p.expectancyR, 2) + "R</b></div>"
      + '<div><span>Independent n</span><b>' + Math.round(p.effectiveN) + "</b></div>"
      + '<div><span>Size / $1k</span><b>$' + n(p.positionUsdPer1000, 0) + "</b></div>"
      + "</div>"
    ) : "";

    var ctx = [];
    if (s.context.stage) ctx.push("stage " + esc(s.context.stage));
    if (typeof s.context.underwaterPct === "number") ctx.push("underwater " + n(s.context.underwaterPct, 1) + "%");
    if (typeof s.context.volumeTrendPct === "number") ctx.push("volume " + n(s.context.volumeTrendPct, 1) + "%");

    return '<article class="sig">'
      + '<div class="sig-head">'
      + '<span class="asset">' + esc(s.asset) + "</span>"
      + '<span class="price">' + money(s.price) + "</span>"
      + '<span class="bias ' + s.bias + '">' + s.bias + "</span>"
      + (p ? '<span class="hz">' + p.horizonDays + " days</span>" : "")
      + "</div>"
      + (flags ? '<div class="flags">' + flags + "</div>" : "")
      + plan
      + '<p class="why"><span class="k">Why</span> ' + esc(s.reason) + (ctx.length ? " · " + ctx.join(" · ") : "") + "</p>"
      + "</article>";
  }

  function matches(s) {
    if (state.bias !== "all" && s.bias !== state.bias) return false;
    if (state.horizon !== "all" && String(s.plan && s.plan.horizonDays) !== state.horizon) return false;
    if (state.hit !== "all" && !(s.plan && s.plan.hitPct >= Number(state.hit))) return false;
    if (state.quality === "liquid" && !s.tradeable) return false;
    if (state.quality === "solid" && s.thin) return false;
    if (state.q) {
      var hay = (s.asset + " " + s.reason + " " + (s.context.stage || "")).toLowerCase();
      if (hay.indexOf(state.q.toLowerCase()) === -1) return false;
    }
    return true;
  }

  function sorted(rows) {
    var by = {
      expectancy: function (a, b) { return (b.plan ? b.plan.expectancyR : -1e9) - (a.plan ? a.plan.expectancyR : -1e9); },
      hit: function (a, b) { return (b.plan ? b.plan.hitPct : -1) - (a.plan ? a.plan.hitPct : -1); },
      sample: function (a, b) { return (b.plan ? b.plan.effectiveN : -1) - (a.plan ? a.plan.effectiveN : -1); },
      asset: function (a, b) { return a.asset.localeCompare(b.asset); }
    };
    return rows.slice().sort(by[state.sort] || by.expectancy);
  }

  function render() {
    var rows = sorted(data.signals.filter(matches));
    var pages = Math.max(1, Math.ceil(rows.length / PER_PAGE));
    if (state.page > pages) state.page = pages;
    var slice = rows.slice((state.page - 1) * PER_PAGE, state.page * PER_PAGE);

    board.innerHTML = slice.map(card).join("");
    none.hidden = rows.length !== 0;
    // Two different nothings: a scan with no matching rows, and no scan at all.
    none.textContent = data.signals.length
      ? "Nothing matches those filters."
      : "No scan on record yet.";
    countEl.textContent = rows.length
      ? rows.length + (rows.length === 1 ? " pair" : " pairs") + " · page " + state.page + " of " + pages
      : "";

    if (pages > 1) {
      var html = "";
      for (var i = 1; i <= pages; i++) {
        html += '<button type="button" data-page="' + i + '"' + (i === state.page ? ' aria-current="page"' : "") + ">" + i + "</button>";
      }
      pager.innerHTML = html;
      pager.hidden = false;
    } else {
      // Emptied, not just hidden: a stale page 3 button left in the DOM is
      // still reachable by keyboard and by anything reading the page.
      pager.innerHTML = "";
      pager.hidden = true;
    }
  }

  form.addEventListener("click", function (e) {
    var b = e.target.closest("button[data-f]");
    if (!b) return;
    state[b.dataset.f] = b.dataset.v;
    state.page = 1;
    form.querySelectorAll('button[data-f="' + b.dataset.f + '"]').forEach(function (o) {
      o.setAttribute("aria-pressed", String(o === b));
    });
    render();
  });

  document.getElementById("f-q").addEventListener("input", function (e) {
    state.q = e.target.value.trim();
    state.page = 1;
    render();
  });

  document.getElementById("f-sort").addEventListener("change", function (e) {
    state.sort = e.target.value;
    render();
  });

  document.getElementById("f-reset").addEventListener("click", function () {
    state = { bias: "all", horizon: "all", hit: "all", quality: "all", q: "", sort: "expectancy", page: 1 };
    document.getElementById("f-q").value = "";
    document.getElementById("f-sort").value = "expectancy";
    form.querySelectorAll("button[data-f]").forEach(function (o) {
      o.setAttribute("aria-pressed", String(o.dataset.v === "all"));
    });
    render();
  });

  pager.addEventListener("click", function (e) {
    var b = e.target.closest("button[data-page]");
    if (!b) return;
    state.page = Number(b.dataset.page);
    render();
    board.scrollIntoView({ block: "start" });
  });

  var dayPicker = document.getElementById("f-day");
  dayPicker.addEventListener("change", function (e) {
    var day = e.target.value;
    if (cache[day]) { data = cache[day]; state.page = 1; stampFor(data); render(); return; }
    countEl.textContent = "Loading " + day + "…";
    fetch("/signals/data/" + day + ".json")
      .then(function (r) { if (!r.ok) throw new Error(r.status); return r.json(); })
      .then(function (j) { cache[day] = j; data = j; state.page = 1; stampFor(j); render(); })
      .catch(function () { countEl.textContent = "Could not load the scan for " + day + "."; });
  });

  function stampFor(j) {
    var t = j.tally || {};
    stamp.textContent = "Scanned " + String(j.scannedAt).replace("T", " ").slice(0, 16)
      + " UTC · " + (t.total || 0) + " pairs · " + (t.LONG || 0) + " long · " + (t.SHORT || 0)
      + " short · " + (t.WAIT || 0) + " wait · " + (t.turning || 0) + " regime turns";
  }

  // The controls are inert without this script, so they stay hidden until it
  // runs rather than offering a reader buttons that do nothing.
  form.hidden = false;
  render();
})();
</script>
${foot(site)}`;
}

/** One call, server-rendered so the board works with JavaScript off. */
function signalCard(s) {
  const n = (v, d) => (typeof v === "number" && Number.isFinite(v) ? v.toFixed(d) : "—");
  const money = (v) => {
    if (typeof v !== "number" || !Number.isFinite(v)) return "—";
    const a = Math.abs(v);
    if (a >= 1000) return v.toFixed(0);
    if (a >= 1) return v.toFixed(3);
    if (a >= 0.01) return v.toFixed(4);
    return v.toFixed(6);
  };
  const p = s.plan;

  const flags = [
    s.turning ? '<span class="flag turn">regime turn</span>' : "",
    s.thin ? '<span class="flag thin">thin sample</span>' : "",
    !s.tradeable ? '<span class="flag thin">thin liquidity</span>' : "",
  ].join("");

  const plan = p
    ? `<div class="levels">
    <div class="level in"><span>Entry</span><b>${money(p.entry)}</b></div>
    <div class="level out"><span>Stop</span><b>${money(p.stop)}</b><i>${n(p.stopPct, 2)}%</i></div>
    <div class="level tgt"><span>Target</span><b>${money(p.target)}</b><i>${n(p.targetPct, 2)}%</i></div>
  </div>
  <div class="nums">
    <div><span>Hit rate</span><b>${n(p.hitPct, 1)}%</b></div>
    <div><span>Expectancy</span><b>${n(p.expectancyR, 2)}R</b></div>
    <div><span>Independent n</span><b>${Math.round(p.effectiveN)}</b></div>
    <div><span>Size / $1k</span><b>$${n(p.positionUsdPer1000, 0)}</b></div>
  </div>`
    : "";

  const ctx = [
    s.context?.stage ? `stage ${escapeHtml(String(s.context.stage))}` : "",
    typeof s.context?.underwaterPct === "number" ? `underwater ${n(s.context.underwaterPct, 1)}%` : "",
    typeof s.context?.volumeTrendPct === "number" ? `volume ${n(s.context.volumeTrendPct, 1)}%` : "",
  ].filter(Boolean).join(" · ");

  return `<article class="sig">
  <div class="sig-head">
    <span class="asset">${escapeHtml(s.asset)}</span>
    <span class="price">${money(s.price)}</span>
    <span class="bias ${s.bias}">${s.bias}</span>
    ${p ? `<span class="hz">${p.horizonDays} days</span>` : ""}
  </div>
  ${flags ? `<div class="flags">${flags}</div>` : ""}
  ${plan}
  <p class="why"><span class="k">Why</span> ${escapeHtml(s.reason)}${ctx ? ` · ${ctx}` : ""}</p>
</article>`;
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
export function buildSite(manifest, drafts, lessons = [], signals = null, archive = {}) {
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
    const days = Object.keys(archive).sort().reverse();
    files.push({ path: "signals/index.html", content: renderSignalsPage(site, signals, { days }) });
    // One slim file per archived day, so the date picker can fetch a past board
    // without shipping every scan to every reader.
    for (const [day, snap] of Object.entries(archive)) {
      files.push({ path: `signals/data/${day}.json`, content: `${JSON.stringify(slimSnapshot(snap))}\n` });
    }
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
