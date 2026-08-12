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
import { BIAS_PATTERNS, BIAS_PHRASES } from "./verify.mjs";

export const BIAS = {
  WAIT: "WAIT",
  LONG: "Selective Long",
  SHORT: "Selective Short",
};

/** Majors that appear as bare tickers in prose, without a cashtag. */
const BARE_TICKERS = ["BTC", "ETH", "BNB", "SOL", "XRP"];

/**
 * The sentence a bias is stated in, which is the only place its subject can be.
 *
 * Splitting on sentence punctuation is crude, but the alternative — assuming
 * the bias belongs to whichever asset the post mentions most — is what put a
 * short on BNB into the record from a post that said to stand aside on it.
 */
function biasSentence(text) {
  for (const sentence of text.split(/(?<=[.!?])\s+|\n+/)) {
    if (Object.values(BIAS_PATTERNS).some((re) => re.test(sentence))) return sentence;
  }
  return null;
}

/**
 * Reads back what a post committed to. Levels come from the brief rather than
 * from parsing prose, so a formatting quirk cannot corrupt the record.
 *
 * The subject is resolved from the sentence stating the bias, not from the
 * post's most-mentioned asset. Those two are usually the same, and when they
 * are not, guessing produces a record of a call nobody made — a post arguing
 * that BNB should be left alone was logged as a BNB short because BNB was the
 * word it used most.
 *
 * When the bias sentence is genuinely about more than one thing, the claim is
 * returned `ambiguous` with no asset. An unscoreable claim is a gap in the
 * record; a confidently wrong one is a lie in it.
 *
 * @returns {{asset: string|null, bias: string|null, support: number|null,
 *   resistance: number|null, ambiguous: boolean, ambiguityReason: string|null}}
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

  const dominant = ranked[0]?.[0] ?? null;

  // Same patterns the gate admits the post with, so a post can never pass one
  // and be invisible to the other.
  const sentence = biasSentence(text) ?? "";
  let bias = null;
  if (BIAS_PATTERNS.LONG.test(text)) bias = BIAS.LONG;
  else if (BIAS_PATTERNS.SHORT.test(text)) bias = BIAS.SHORT;
  else if (BIAS_PATTERNS.WAIT.test(text)) bias = BIAS.WAIT;

  /** Assets actually named where the bias is stated. */
  const known = new Set([...cashtags, ...BARE_TICKERS]);
  const named = [...new Set(
    [...sentence.matchAll(/\$?([A-Z]{2,10})\b/g)].map((m) => m[1]).filter((t) => known.has(t)),
  )];

  // Bare phrases, so a second commitment later in the sentence is not missed.
  const biasesInSentence = Object.values(BIAS_PHRASES).filter((re) => re.test(sentence)).length;

  let asset = null, ambiguous = false, ambiguityReason = null;
  if (biasesInSentence > 1) {
    ambiguous = true;
    ambiguityReason = `the bias sentence states ${biasesInSentence} biases; say which asset each belongs to, or set the claim by hand`;
  } else if (named.length === 1) {
    asset = `${named[0]}USDT`;
  } else if (named.length > 1) {
    ambiguous = true;
    ambiguityReason = `the bias sentence names ${named.join(", ")}; only one asset can be scored`;
  } else if (dominant) {
    // The bias sentence names nothing, so it is about the post's subject.
    asset = `${dominant}USDT`;
  }

  const levels = (brief.levels ?? []).find((l) => l.symbol === asset);

  return {
    asset,
    bias,
    ambiguous,
    ambiguityReason,
    support: levels?.support ?? null,
    resistance: levels?.resistance ?? null,
    priceAtPost: levels?.spot ?? (brief.spot ?? []).find((s) => s.symbol === asset)?.price ?? null,
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

  /**
   * Hourly candles give enough resolution to see an intraday wick through a
   * level, and the window has to reach back past the call, not just around it.
   *
   * 200 bars covered eight days, which was fine while the only consumer was a
   * claim settled a day after publication. The yardstick a WAIT is judged
   * against needs candles from *before* the call, so on anything older than a
   * week there were none and the call went unscoreable — silently, as a null.
   * A thousand bars covers six weeks and costs the same single request.
   */
  const candles = await fetchKlines(claim.asset, { interval: "1h", limit: 1000, fetchImpl });
  const window = candles.filter((c) => c.openTime > publishedAt && c.openTime <= deadline);
  if (!window.length) return null;

  const low = Math.min(...window.map((c) => c.low));
  const high = Math.max(...window.map((c) => c.high));
  const close = window.at(-1).close;
  const movePct = ((close - claim.priceAtPost) / claim.priceAtPost) * 100;

  const supportHeld = claim.support == null ? null : low >= claim.support;
  const resistanceBroken = claim.resistance == null ? null : high > claim.resistance;

  /**
   * What an ordinary move looks like on this pair over this horizon.
   *
   * Computed only from candles that closed *before* publication, so the
   * yardstick could have been known at the time. Median rather than mean:
   * one spike in the lookback should not raise the bar a WAIT has to clear.
   */
  const typicalMovePct = (() => {
    const before = candles.filter((c) => c.openTime <= publishedAt);
    const step = Math.max(1, Math.round(hours));
    const moves = [];
    for (let i = step; i < before.length; i++) {
      moves.push(Math.abs((before[i].close / before[i - step].close - 1) * 100));
    }
    if (moves.length < 10) return null;
    const sorted = moves.sort((a, b) => a - b);
    const m = sorted.length >> 1;
    return sorted.length % 2 ? sorted[m] : (sorted[m - 1] + sorted[m]) / 2;
  })();

  let biasCorrect = null;
  if (claim.bias === BIAS.LONG) biasCorrect = movePct > 0;
  else if (claim.bias === BIAS.SHORT) biasCorrect = movePct < 0;
  else if (claim.bias === BIAS.WAIT) {
    /**
     * WAIT has to be falsifiable, and for a long time it was not.
     *
     * The old rule read "right when neither level gave way", which sounds
     * reasonable until the claim carries no levels — then `supportHeld` and
     * `resistanceBroken` are both null, `null !== false && null !== true` is
     * true, and every levelless WAIT scored correct automatically. The
     * scoreboard reported 100% because it could not report anything else, and
     * a WAIT published before a 17.7% move counted as a win.
     *
     * So: when the post named levels, judge it on those — it made that claim.
     * Otherwise judge it against how far this pair ordinarily travels in the
     * same time. Standing aside is right when the move was unremarkable and
     * wrong when it was not, in *either* direction, because a WAIT gives up
     * both sides. Where neither test can run the call is unscoreable, which is
     * a null and drops out of the tally rather than padding it.
     */
    if (supportHeld !== null || resistanceBroken !== null) {
      biasCorrect = supportHeld !== false && resistanceBroken !== true;
    } else if (typicalMovePct != null) {
      biasCorrect = Math.abs(movePct) <= typicalMovePct;
    } else {
      biasCorrect = null;
    }
  }

  return {
    hours,
    low,
    high,
    close,
    movePct,
    typicalMovePct,
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
