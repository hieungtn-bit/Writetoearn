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

/**
 * Ceiling for a long-form article, as opposed to a slot post.
 *
 * Generous on purpose. It exists to catch a runaway draft, not to shape one —
 * the slot word ranges do that job for the formats they belong to.
 */
export const ARTICLE_MAX_WORDS = 2500;

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
/**
 * Every citable figure on one analysed asset. Shared by the majors brief and
 * the altcoin screen, which produce the same row shape from the same candles.
 */
function pushAssetNumbers(push, a) {
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
  push(a.avgQuoteVolume30d);
  push(a.quoteVolumeLatest);
  push(a.rangeCompressionPct);
  push(a.todayChangePct);
  push(a.dailySigmaPct);
  push(a.sigmaMove);
  push(a.dailyMovePercentile);
  push(a.biggerDaySharePct);
  push(a.biggerDayCount);
  push(a.sampleDays);
  push(a.corr30dToBase);
  push(a.returnPerVol30d);
  push(a.rangeWidth30dPct);
}

/**
 * Figures from an altcoin screen, so a post about the wider board can be
 * verified too. The screen is a separate fetch from the brief, so it has to be
 * passed in explicitly — a post citing alt figures without it fails closed.
 *
 * @param {{rows?: object[]}} screen A result from screen().
 */
export function collectScreenNumbers(screen) {
  const values = [];
  const push = (n) => {
    if (typeof n === "number" && Number.isFinite(n)) values.push(Math.abs(n));
  };
  for (const row of screen?.rows ?? []) pushAssetNumbers(push, row);
  if (screen?.baseRow) pushAssetNumbers(push, screen.baseRow);
  for (const v of Object.values(screen?.aggregates ?? {})) push(v);
  return values;
}

/**
 * Figures from a raw candle series, for posts that argue from intraday shape.
 *
 * The brief and the screen are daily-only, so an hourly table is unverifiable
 * without this — and an article whose whole thesis is "look which candle the
 * move lives in" cannot have its central evidence go unchecked.
 *
 * Each candle contributes its own prices, its turnover and its own percent
 * change. Spans *between* candles are deliberately not included: allowing every
 * pairwise combination would add thousands of values and turn the gate into a
 * rubber stamp. Cite the endpoints instead — they are more concrete anyway.
 */
export function collectCandleNumbers(candles) {
  const values = [];
  const push = (n) => {
    if (typeof n === "number" && Number.isFinite(n)) values.push(Math.abs(n));
  };
  for (const c of candles ?? []) {
    push(c.open);
    push(c.high);
    push(c.low);
    push(c.close);
    push(c.quoteVolume);
    if (c.open) push((c.close / c.open - 1) * 100);
  }
  return values;
}

/**
 * Figures from the stage classifier.
 *
 * Its metrics — underwater share, volume trend, distance from the high — are
 * computed from daily candles but are not fields on an analysed asset, so a
 * post citing them had no source to trace to. They passed only when they
 * happened to collide with an unrelated figure, which is not verification.
 */
export function collectStageNumbers(stages) {
  const values = [];
  const push = (n) => {
    if (typeof n === "number" && Number.isFinite(n)) values.push(Math.abs(n));
  };
  for (const st of stages ?? []) {
    push(st.underwaterPct);
    push(st.vsVwapPct);
    push(st.volumeTrendPct);
    push(st.recentPricePct);
    push(st.drawdownPct);
    push(st.concentrationPct);
    push(st.high);
    push(st.rsi14);
  }
  return values;
}

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
  for (const h of brief.fundingHistory ?? []) {
    push(h.latestPct);
    push(h.annualisedPct);
    push(h.annualised7dPct);
    push(h.annualisedPrior14dPct);
    push(h.negativeSharePct);
    push(h.negativePeriods);
    push(h.periods);
    push(h.windowDays);
  }

  // Computed analysis is as citable as raw price — it is arithmetic over real
  // candles, not model output.
  for (const a of brief.analysis?.assets ?? []) pushAssetNumbers(push, a);
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
export function verifyNumbers(text, brief, { screen, candles, stages } = {}) {
  const allowed = collectBriefNumbers(brief);
  if (screen) allowed.push(...collectScreenNumbers(screen));
  if (candles) allowed.push(...collectCandleNumbers(candles));
  if (stages) allowed.push(...collectStageNumbers(stages));
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
export function verifyStructure(text, { maxWords = 220, minWords = 40, requireBias = true } = {}) {
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

  // The scoreboard parses the bias out of the published text, so a post
  // without one is unscoreable — it silently drops out of the track record
  // the whole channel is built on.
  //
  // A profile or announcement post makes no market claim, so there is nothing
  // for the scoreboard to settle and demanding a bias would only produce a
  // decorative one. That exemption is opt-in and narrow on purpose: the day it
  // becomes a convenient way to skip the rule on a real call, the track record
  // stops meaning anything.
  if (requireBias && !/selective\s+long|selective\s+short|\bWAIT\b/i.test(text)) {
    problems.push("no bias stated (WAIT / Selective Long / Selective Short)");
  }

  return { ok: problems.length === 0, problems, words };
}

/** Runs every gate. Publishing should be blocked unless this passes. */
export function verifyPost(text, brief, opts = {}) {
  const numbers = verifyNumbers(text, brief, { screen: opts.screen, candles: opts.candles, stages: opts.stages });
  const claims = verifyNoForbiddenClaims(text, brief);
  const structure = verifyStructure(text, opts);

  // Naming the sources that were actually searched keeps the failure honest:
  // "not in the brief" is misleading when an alt figure was never checkable.
  const searched = ["the brief"];
  if (opts.screen) searched.push("the screen");
  if (opts.candles) searched.push("the candle series");
  if (opts.stages) searched.push("the stage metrics");
  const sources = searched.length === 1 ? searched[0] : `${searched.slice(0, -1).join(", ")} or ${searched.at(-1)}`;
  const problems = [
    ...numbers.unmatched.map((u) => `figure "${u.raw}" does not appear in ${sources}`),
    ...claims.violations.map((v) => `mentions ${v}, which the brief could not retrieve`),
    ...structure.problems,
  ];

  return { ok: problems.length === 0, problems, numbersChecked: numbers.checked, words: structure.words };
}
