/**
 * What this channel has actually published, and what it can afford to publish.
 *
 * A content plan usually starts with audience research. There is none available
 * here and pretending otherwise would be the first dishonest thing on this
 * desk: the Square API exposes `/content/add` and nothing else — no views, no
 * likes, no shares, no retention. Anything claimed about "what readers want"
 * would be invented.
 *
 * So the plan is built from three things that can be counted instead.
 *
 * Supply: the corpus itself. Fifty-odd posts with dates, assets and drafts on
 * disk — cadence, topic mix, asset concentration, and how many carried a
 * verifiable claim rather than an opinion.
 *
 * Demand, narrowly: reader-initiated requests. Not analytics, but real — every
 * time a reader forwarded an analysis or asked a question, that was someone
 * telling us what they wanted. It is a small, self-selected sample from one
 * inbox and is labelled as such rather than dressed up as research.
 *
 * Capacity: what the algorithm can actually produce with evidence behind it,
 * measured from the live board. A plan promising five signal posts a week when
 * the filters admit three positions a day is a plan to start inventing.
 */

import { existsSync, readFileSync, readdirSync } from "node:fs";
import { writeFileSync } from "node:fs";
import { Store } from "../src/store.mjs";

const manifest = JSON.parse(readFileSync("site/manifest.json", "utf8"));
const articles = manifest.articles;

/**
 * Topic, inferred from the draft rather than from the title.
 *
 * Titles are written to be read; the body is written to be checked. Classifying
 * on the body means a post that promises method and delivers a price call is
 * counted as a price call.
 */
const TOPICS = [
  ["self-audit", /walked (my|this desk's) own|I was wrong|half of it|my own board|my own algorithm|correcting|I said something stronger/i],
  ["method study", /across \d+ pairs|labelled days|pair-days|walk(ed)? forward|expectancy|out of sample/i],
  ["reader audit", /a reader sent|reader's|someone sent me|checked (it|this) against/i],
  ["daily column", /How is the market|what do we do about it/i],
  ["market call", /Bias:|selective (short|long)|stand aside/i],
  ["education", /what this means if you|the honest version|how to check/i],
];

const classify = (text) => {
  for (const [name, re] of TOPICS) if (re.test(text)) return name;
  return "other";
};

const drafts = {};
for (const a of articles) {
  const p = `drafts/${a.draft}`;
  if (existsSync(p)) drafts[a.draft] = readFileSync(p, "utf8");
}

const rows = articles
  .filter((a) => drafts[a.draft])
  .map((a) => {
    const text = drafts[a.draft];
    return {
      slug: a.slug,
      published: a.published,
      day: a.published.slice(0, 10),
      words: text.trim().split(/\s+/).length,
      assets: a.assets ?? [],
      topic: classify(text),
      // A post that names its own source file can be recomputed by a reader.
      tracesToSnapshot: /research\/[a-z0-9-]+\.json|traces to|every figure/i.test(text),
      // A post that states a falsifiable direction enters the track record.
      statesBias: /Bias:\s*\*?\*?(WAIT|Selective|stand aside|LONG|SHORT)/i.test(text),
      hasTable: text.includes("```"),
    };
  })
  .sort((a, b) => a.published.localeCompare(b.published));

const count = (key, pick) => {
  const out = {};
  for (const r of rows) for (const v of [].concat(pick(r))) out[v] = (out[v] ?? 0) + 1;
  return Object.fromEntries(Object.entries(out).sort((a, b) => b[1] - a[1]));
};

const byDay = count("day", (r) => r.day);
const days = Object.keys(byDay).sort();
const spanDays = days.length
  ? Math.round((new Date(days.at(-1)) - new Date(days[0])) / 86_400_000) + 1
  : 0;

/**
 * Reader-initiated requests, recorded by hand.
 *
 * This is the only demand signal that exists. Each entry is a moment a reader
 * pushed something at this desk rather than a moment we pushed at them, which
 * is a different and better signal than a view count — but the sample is one
 * inbox over a handful of days and it cannot carry more weight than that.
 */
const REQUESTS = [
  { day: "2026-08-11", kind: "audit my analysis", subject: "INJ" },
  { day: "2026-08-12", kind: "audit my analysis", subject: "ICP volume profile" },
  { day: "2026-08-12", kind: "deep dive", subject: "BNB INJ ENA ICP GIGGLE" },
  { day: "2026-08-13", kind: "deep dive", subject: "BNB BTC" },
  { day: "2026-08-13", kind: "deep dive", subject: "BNBUSDT setups" },
  { day: "2026-08-13", kind: "scan request", subject: "watchlist stages" },
  { day: "2026-08-13", kind: "algorithm complaint", subject: "why does the scanner miss gainers" },
  { day: "2026-08-13", kind: "algorithm complaint", subject: "it must be early AND profitable" },
  { day: "2026-08-13", kind: "position question", subject: "should I close BNB" },
  { day: "2026-08-14", kind: "deep dive", subject: "BTC BNB ICP stages" },
  { day: "2026-08-14", kind: "audit my analysis", subject: "BTC multi-timeframe" },
  { day: "2026-08-15", kind: "audit my analysis", subject: "multiplier scan, zero results" },
  { day: "2026-08-15", kind: "entertainment", subject: "meme post" },
  { day: "2026-08-15", kind: "deep dive", subject: "BTC BNB, make it a column" },
  { day: "2026-08-15", kind: "algorithm complaint", subject: "audit the algorithm itself" },
  { day: "2026-08-16", kind: "audit my analysis", subject: "BTC confluence + gold" },
];
const requestKinds = REQUESTS.reduce((o, r) => ({ ...o, [r.kind]: (o[r.kind] ?? 0) + 1 }), {});

/** What the pipeline can actually supply, from the most recent brief. */
const brief = existsSync("research/daily-brief.json")
  ? JSON.parse(readFileSync("research/daily-brief.json", "utf8"))
  : null;
const backtest = existsSync("research/self-backtest.json")
  ? JSON.parse(readFileSync("research/self-backtest.json", "utf8"))
  : null;

const snapshots = readdirSync("research").filter((f) => f.endsWith(".json"));

const store = new Store();
const claims = store.listClaims();
const scored = claims.filter((c) => c.score && c.asset);

const out = {
  measuredAt: new Date().toISOString(),
  corpus: {
    posts: rows.length,
    spanDays,
    postsPerDay: spanDays ? rows.length / spanDays : null,
    medianWords: (() => {
      const w = rows.map((r) => r.words).sort((a, b) => a - b);
      return w.length % 2 ? w[w.length >> 1] : (w[w.length / 2 - 1] + w[w.length / 2]) / 2;
    })(),
    byTopic: count("topic", (r) => r.topic),
    byAsset: count("asset", (r) => r.assets),
    tracesToSnapshot: rows.filter((r) => r.tracesToSnapshot).length,
    statesBias: rows.filter((r) => r.statesBias).length,
    hasTable: rows.filter((r) => r.hasTable).length,
    busiestDay: Object.entries(byDay).sort((a, b) => b[1] - a[1])[0] ?? null,
    daysPublished: days.length,
  },
  demand: {
    note: "Reader-initiated requests only. No platform analytics exist: the Square API exposes /content/add and nothing else.",
    requests: REQUESTS.length,
    byKind: Object.fromEntries(Object.entries(requestKinds).sort((a, b) => b[1] - a[1])),
    detail: REQUESTS,
  },
  capacity: brief ? {
    boardSize: brief.tally.total,
    qualifying: brief.qualifying,
    positionsToday: brief.taken.length,
    longsSurviving: brief.funnel.long.unanimous,
    shortsSurviving: brief.funnel.short.unanimous,
    selectionRatePct: brief.tally.total ? (brief.qualifying / brief.tally.total) * 100 : null,
    researchSnapshots: snapshots.length,
    walkForwardNetR: backtest?.results?.algorithm?.meanNetR ?? null,
    beatsDoingNothing: backtest?.versusAlwaysShort?.algorithmBeatsIt ?? null,
  } : null,
  record: {
    published: claims.length,
    scored: scored.length,
    correct: scored.filter((c) => c.score.biasCorrect).length,
    unscoreable: claims.filter((c) => !c.asset).length,
  },
  rows,
};
writeFileSync("research/content-audit.json", `${JSON.stringify(out, null, 2)}\n`);

const c = out.corpus;
console.log(`${c.posts} posts over ${c.spanDays} days (${c.postsPerDay.toFixed(2)}/day) · median ${c.medianWords} words`);
console.log(`  published on ${c.daysPublished} distinct days · busiest ${c.busiestDay[0]} with ${c.busiestDay[1]}`);
console.log(`  traces to a snapshot: ${c.tracesToSnapshot}/${c.posts} · states a bias: ${c.statesBias}/${c.posts} · has a table: ${c.hasTable}/${c.posts}\n`);

console.log("by topic:");
for (const [k, v] of Object.entries(c.byTopic)) console.log(`  ${k.padEnd(16)}${String(v).padStart(4)}  ${"█".repeat(v)}`);

console.log("\nmost-covered assets:");
for (const [k, v] of Object.entries(c.byAsset).slice(0, 10)) console.log(`  ${k.padEnd(10)}${String(v).padStart(4)}`);

console.log(`\nreader-initiated requests (${out.demand.requests}, one inbox — not analytics):`);
for (const [k, v] of Object.entries(out.demand.byKind)) console.log(`  ${k.padEnd(22)}${String(v).padStart(3)}`);

if (out.capacity) {
  const p = out.capacity;
  console.log(`\nwhat the pipeline can supply today:`);
  console.log(`  board ${p.boardSize} rows → ${p.qualifying} qualify → ${p.positionsToday} positions`
    + ` (${p.selectionRatePct.toFixed(1)}% of the board)`);
  console.log(`  longs surviving ${p.longsSurviving} · shorts ${p.shortsSurviving} · snapshots on file ${p.researchSnapshots}`);
  console.log(`  walk-forward ${p.walkForwardNetR.toFixed(4)}R · beats doing nothing: ${p.beatsDoingNothing}`);
}
console.log(`\ntrack record: ${out.record.correct}/${out.record.scored} scored right · ${out.record.unscoreable} of ${out.record.published} carried no directional call`);
