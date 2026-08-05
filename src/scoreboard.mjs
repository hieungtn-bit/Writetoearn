/**
 * Public accountability for past calls.
 *
 * Almost nobody scores their own predictions in public, which is exactly why
 * doing it is worth more than another take. Being visibly wrong on the record
 * buys credibility that vague correctness never does — and credibility is what
 * turns a reader into someone who clicks the cashtag instead of scrolling past.
 *
 * A claim can only be scored against candles that closed *after* it was
 * published, so nothing here can be backfilled or quietly reinterpreted.
 */

import { fetchKlines } from "./analysis.mjs";
import { BIAS_PATTERNS } from "./verify.mjs";

export const BIAS = {
  WAIT: "WAIT",
  LONG: "Selective Long",
  SHORT: "Selective Short",
};

/**
 * Reads back what a post committed to. Levels come from the brief rather than
 * from parsing prose, so a formatting quirk cannot corrupt the record.
 *
 * @returns {{asset: string|null, bias: string|null, support: number|null, resistance: number|null}}
 */
export function extractClaim(text, brief) {
  const cashtags = [...text.matchAll(/\$([A-Z]{2,10})\b/g)].map((m) => m[1]);

  // The subject is whichever asset the post leans on most, tie-broken by first
  // mention — the same rule a reader would apply.
  const counts = new Map();
  for (const tag of cashtags) counts.set(tag, (counts.get(tag) ?? 0) + 1);
  const ranked = [...counts.entries()].sort((a, b) => {
    if (b[1] !== a[1]) return b[1] - a[1];
    return cashtags.indexOf(a[0]) - cashtags.indexOf(b[0]);
  });

  const base = ranked[0]?.[0] ?? null;
  const symbol = base ? `${base}USDT` : null;
  const levels = (brief.levels ?? []).find((l) => l.symbol === symbol);

  // Same patterns the gate admits the post with, so a post can never pass one
  // and be invisible to the other.
  let bias = null;
  if (BIAS_PATTERNS.LONG.test(text)) bias = BIAS.LONG;
  else if (BIAS_PATTERNS.SHORT.test(text)) bias = BIAS.SHORT;
  else if (BIAS_PATTERNS.WAIT.test(text)) bias = BIAS.WAIT;

  return {
    asset: symbol,
    bias,
    support: levels?.support ?? null,
    resistance: levels?.resistance ?? null,
    priceAtPost: levels?.spot ?? (brief.spot ?? []).find((s) => s.symbol === symbol)?.price ?? null,
  };
}

/**
 * Scores one claim against what price actually did afterwards.
 *
 * @param {object} claim A stored claim.
 * @param {object} [opts]
 * @param {number} [opts.hours] How long after publication to judge.
 * @returns {Promise<object|null>} null when there is not enough history yet
 */
export async function scoreClaim(claim, { hours = 24, fetchImpl = globalThis.fetch } = {}) {
  if (!claim.asset || !claim.priceAtPost) return null;

  const publishedAt = new Date(claim.publishedAt).getTime();
  const deadline = publishedAt + hours * 3_600_000;
  if (Date.now() < deadline) return null; // too early to judge; leave it open

  // Hourly candles give enough resolution to see an intraday wick through a level.
  const candles = await fetchKlines(claim.asset, { interval: "1h", limit: 200, fetchImpl });
  const window = candles.filter((c) => c.openTime > publishedAt && c.openTime <= deadline);
  if (!window.length) return null;

  const low = Math.min(...window.map((c) => c.low));
  const high = Math.max(...window.map((c) => c.high));
  const close = window.at(-1).close;
  const movePct = ((close - claim.priceAtPost) / claim.priceAtPost) * 100;

  const supportHeld = claim.support == null ? null : low >= claim.support;
  const resistanceBroken = claim.resistance == null ? null : high > claim.resistance;

  let biasCorrect = null;
  if (claim.bias === BIAS.LONG) biasCorrect = movePct > 0;
  else if (claim.bias === BIAS.SHORT) biasCorrect = movePct < 0;
  else if (claim.bias === BIAS.WAIT) {
    // WAIT is a claim that the range holds, so it is right when neither side gave way.
    biasCorrect = supportHeld !== false && resistanceBroken !== true;
  }

  return {
    hours,
    low,
    high,
    close,
    movePct,
    supportHeld,
    resistanceBroken,
    biasCorrect,
    judgedAt: new Date().toISOString(),
  };
}

/** Scores every claim that has come of age. Returns how many were settled. */
export async function scoreDueClaims(store, { hours = 24, fetchImpl = globalThis.fetch, log = () => {} } = {}) {
  const pending = store.listClaims({ scored: false });
  let settled = 0;

  for (const claim of pending) {
    let score;
    try {
      score = await scoreClaim(claim, { hours, fetchImpl });
    } catch (err) {
      log(`  could not score ${claim.postId}: ${err.message}`);
      continue;
    }
    if (!score) continue;
    store.scoreClaim(claim.postId, score);
    settled++;
  }
  return settled;
}

/** Aggregate hit rates across scored claims. */
export function tally(claims) {
  const scored = claims.filter((c) => c.score);
  const rate = (predicate) => {
    const applicable = scored.filter((c) => predicate(c) !== null);
    if (!applicable.length) return null;
    const hits = applicable.filter((c) => predicate(c) === true).length;
    return { hits, total: applicable.length, pct: (hits / applicable.length) * 100 };
  };

  return {
    total: scored.length,
    bias: rate((c) => c.score.biasCorrect),
    support: rate((c) => c.score.supportHeld),
  };
}

/**
 * Renders the weekly scoreboard as post-ready text.
 *
 * Losses are listed as plainly as wins. A scoreboard that only shows hits is
 * marketing, and readers can tell.
 */
export function formatScoreboard(claims, { days = 7 } = {}) {
  const cutoff = Date.now() - days * 86_400_000;
  const recent = claims.filter((c) => c.score && new Date(c.publishedAt).getTime() >= cutoff);

  if (!recent.length) {
    return `No scored calls in the last ${days} days yet — the scoreboard needs ${days} days of published calls before it can say anything honest.`;
  }

  const t = tally(recent);
  const lines = [`📊 SCOREBOARD — last ${days} days`, ""];

  if (t.bias) lines.push(`Bias called right: ${t.bias.hits}/${t.bias.total} (${t.bias.pct.toFixed(0)}%)`);
  if (t.support) lines.push(`Support held as called: ${t.support.hits}/${t.support.total} (${t.support.pct.toFixed(0)}%)`);
  lines.push("");

  for (const c of recent) {
    const s = c.score;
    const mark = s.biasCorrect === true ? "✅" : s.biasCorrect === false ? "❌" : "•";
    const asset = c.asset.replace("USDT", "");
    lines.push(
      `${mark} ${asset} ${c.bias ?? "no bias"} — ${s.movePct >= 0 ? "+" : ""}${s.movePct.toFixed(2)}% in ${s.hours}h` +
        (s.supportHeld === false ? `, support ${c.support} broke` : ""),
    );
  }

  return lines.join("\n");
}
