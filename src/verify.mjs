/**
 * Numeric verification: every figure in a post must trace back to the brief.
 *
 * The publishing rule is "never invent numbers", and a prompt alone cannot
 * enforce that — a model writing market commentary will happily produce a
 * plausible-looking price. This module checks the finished text against the
 * data that was actually fetched, so a hallucinated figure fails the run
 * instead of going out under the account owner's name.
 */

/** Numbers that carry no market claim and appear constantly in prose. */
const STRUCTURAL_MAX = 100;

/** Relative slack, so 63,250 still matches "63.2K" and "$1.08B". */
const TOLERANCE = 0.005;

/**
 * Distinct coin pairs allowed per post. Established empirically: a post with
 * three cashtags publishes, four is rejected with [220095].
 */
export const MAX_CASHTAGS = 3;

const SUFFIXES = { k: 1e3, m: 1e6, b: 1e9 };

/**
 * Pulls every numeric literal out of the text, keeping enough context to tell
 * a percentage from a bare count.
 *
 * @returns {{raw: string, value: number, isPercent: boolean, hasDecimal: boolean}[]}
 */
export function extractNumbers(text) {
  const out = [];
  // A magnitude suffix has to sit flush against the digits and not begin a
  // word: without both guards, "66,956\n\nBias:" reads as 66,956 billion.
  const re = /(\d[\d,]*(?:\.\d+)?)(?:([KkMmBb])(?![A-Za-z]))?(\s*%)?/g;

  for (const m of text.matchAll(re)) {
    const [, digits, suffix, percent] = m;
    const bare = digits.replace(/,/g, "");
    let value = Number(bare);
    if (!Number.isFinite(value)) continue;

    if (suffix) value *= SUFFIXES[suffix.toLowerCase()];

    out.push({
      raw: m[0].trim(),
      value,
      isPercent: Boolean(percent),
      hasDecimal: bare.includes("."),
    });
  }
  return out;
}

/** Every figure the brief actually vouches for. */
export function collectBriefNumbers(brief) {
  const values = [];
  const push = (n) => {
    if (typeof n === "number" && Number.isFinite(n)) values.push(Math.abs(n));
  };

  for (const s of brief.spot ?? []) {
    push(s.price);
    push(s.change24hPct);
    push(s.high24h);
    push(s.low24h);
    push(s.quoteVolume24h);
  }
  for (const l of brief.levels ?? []) {
    push(l.spot);
    push(l.support);
    push(l.resistance);
    push(l.periodHigh);
    push(l.periodLow);
    push(l.windowDays);
  }
  for (const f of brief.funding ?? []) push(f.fundingRatePct);

  // Computed analysis is as citable as raw price — it is arithmetic over real
  // candles, not model output.
  for (const a of brief.analysis?.assets ?? []) {
    push(a.price);
    push(a.change7dPct);
    push(a.change30dPct);
    push(a.rsi14);
    push(a.atr14);
    push(a.atrPct);
    push(a.realizedVol30d);
    push(a.realizedVol7d);
    push(a.rangePosition30d);
    push(a.high30d);
    push(a.low30d);
    push(a.sma20);
    push(a.sma50);
    push(a.volumeZScore);
    push(a.rangeCompressionPct);
    push(a.todayChangePct);
    push(a.dailySigmaPct);
    push(a.sigmaMove);
  }
  for (const r of brief.analysis?.relativeStrength ?? []) {
    push(r.change7dPct);
    push(r.vsBase7dPct);
  }
  for (const c of brief.analysis?.correlations ?? []) push(c.correlation30d);

  return values;
}

function matches(value, allowed) {
  const target = Math.abs(value);
  return allowed.some((a) => {
    const scale = Math.max(Math.abs(a), target, 1);
    return Math.abs(a - target) / scale <= TOLERANCE;
  });
}

/**
 * Checks a draft against the brief it was written from.
 *
 * Bare small integers are allowed through — "3 charts", "top 5", "24h" carry
 * no market claim and cannot be wrong in a way that misleads. Anything with a
 * decimal point, a percent sign, or a magnitude above the structural threshold
 * has to be backed by real data.
 *
 * @returns {{ok: boolean, unmatched: {raw: string, value: number}[], checked: number}}
 */
export function verifyNumbers(text, brief) {
  const allowed = collectBriefNumbers(brief);
  const unmatched = [];
  let checked = 0;

  for (const n of extractNumbers(text)) {
    const structural = !n.hasDecimal && !n.isPercent && n.value <= STRUCTURAL_MAX;
    if (structural) continue;

    checked++;
    if (!matches(n.value, allowed)) unmatched.push({ raw: n.raw, value: n.value });
  }

  return { ok: unmatched.length === 0, unmatched, checked };
}

/** Fields the brief could not retrieve must not be written about at all. */
const FORBIDDEN = [
  { field: "openInterest", pattern: /\bopen interest\b|\bOI\b/i },
  { field: "longShortRatio", pattern: /long\/short|long-short|\bL\/S ratio\b/i },
];

/**
 * Language that marks a mention as a disclosure of absence rather than a claim.
 * "Open interest is flat" is fabrication; "open interest is not available to
 * me" is the most honest sentence in the post, and blocking it would punish
 * exactly the behaviour the channel is built on.
 */
const DISCLOSURE = /\b(not available|unavailable|cannot|can't|could not|couldn't|do not have|don't have|no data|not visible|not accessible|geo-blocked|no source|without)\b/i;

/**
 * Flags claims about data we never had, while allowing honest admissions that
 * we lack it. The check runs per sentence, so a disclosure in one sentence does
 * not licence a fabricated claim in the next.
 */
export function verifyNoForbiddenClaims(text, brief) {
  const missing = new Set((brief.unavailable ?? []).map((u) => u.field));
  const sentences = text.split(/(?<=[.!?\n])/);
  const violations = new Set();

  for (const sentence of sentences) {
    if (DISCLOSURE.test(sentence)) continue;
    for (const f of FORBIDDEN) {
      if (missing.has(f.field) && f.pattern.test(sentence)) violations.add(f.field);
    }
  }
  return { ok: violations.size === 0, violations: [...violations] };
}

/**
 * Structural requirements from the post spec, checked before anything is sent.
 * @returns {{ok: boolean, problems: string[], words: number}}
 */
export function verifyStructure(text, { maxWords = 220, minWords = 40 } = {}) {
  const problems = [];
  const words = text.trim().split(/\s+/).filter(Boolean).length;

  if (words > maxWords) problems.push(`${words} words exceeds the ${maxWords}-word limit`);
  if (words < minWords) problems.push(`${words} words is too short to be a real post`);
  if (!/#\w+/.test(text)) problems.push("no hashtags");
  if (!/\$[A-Z]{2,}/.test(text)) problems.push("no cashtags");

  // The API rejects a post carrying too many distinct coin pairs with
  // [220095]. Catching it here costs nothing; discovering it at publish time
  // wastes the composition and, in an unattended run, drops the slot entirely.
  const cashtags = new Set([...text.matchAll(/\$([A-Z]{2,10})\b/g)].map((m) => m[1]));
  if (cashtags.size > MAX_CASHTAGS) {
    problems.push(
      `${cashtags.size} distinct cashtags (${[...cashtags].join(", ")}) exceeds the limit of ${MAX_CASHTAGS}`,
    );
  }
  if (!/not financial advice|nfa\b|dyor/i.test(text)) problems.push("no disclaimer");
  if (!/\?/.test(text)) problems.push("no call-to-action question");

  return { ok: problems.length === 0, problems, words };
}

/** Runs every gate. Publishing should be blocked unless this passes. */
export function verifyPost(text, brief, opts = {}) {
  const numbers = verifyNumbers(text, brief);
  const claims = verifyNoForbiddenClaims(text, brief);
  const structure = verifyStructure(text, opts);

  const problems = [
    ...numbers.unmatched.map((u) => `figure "${u.raw}" does not appear in the brief`),
    ...claims.violations.map((v) => `mentions ${v}, which the brief could not retrieve`),
    ...structure.problems,
  ];

  return { ok: problems.length === 0, problems, numbersChecked: numbers.checked, words: structure.words };
}
