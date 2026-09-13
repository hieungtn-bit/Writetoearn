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
 * Magnitude words, for posts not written in English.
 *
 * "$2.2M" was multiplied by a million and "$2.2 triệu" was not, so the gate read
 * the same figure as 2.2 and refused it. That is not the post being wrong, it is
 * the gate only speaking one language — and the failure mode is worse than a
 * rejection, because the cheap way around it is to drop the unit and write a
 * bare number nobody can sanity-check.
 *
 * Written unaccented-insensitive is not attempted: "ty" without the diacritic
 * is a different word, and guessing is how a billion becomes a thousand.
 */
const WORD_SUFFIXES = { nghìn: 1e3, ngàn: 1e3, triệu: 1e6, tỷ: 1e9, tỉ: 1e9 };

/** ISO dates: their parts are calendar labels, never market claims. */
// A month label -- 2021-10 -- is a calendar reference exactly as a full date is.
// Without the optional day, "2021-10" split into 2021 and 10 and the gate asked
// the market data to vouch for the year.
//
// The digit boundaries are load-bearing, not tidiness. A hyphenated level range
// contains a date-shaped substring: "63250-64100" matches on "3250-64", and the
// skip span that produced then swallowed the *upper bound of the range*, which
// went out unchecked. Requiring a non-digit on both sides means only a real date
// label is skipped.
const ISO_DATE = /(?<!\d)\d{4}-\d{2}(?:-\d{2}(?:T[\d:.]+Z?)?)?(?!\d)/g;

/**
 * Indicator period labels — the 200 in SMA200 is a parameter, not a price.
 *
 * The structural allowance stops at 100, which covers RSI14 and SMA50 but not
 * SMA200, so a post that names its own moving averages fails on the label
 * rather than on anything it claims. Naming the parameters is how a reader
 * reproduces the work; punishing it is backwards.
 */
const INDICATOR_LABEL = /\b(?:SMA|EMA|MA|RSI|ATR|VWAP)\s?\d{1,4}\b|\b\d{1,4}-day\b/gi;

/**
 * Index names. The 500 in "S&P 500" is part of a proper noun, and asking the
 * market data to vouch for it fails a post for naming the thing it compares
 * against — the same mistake as reading SMA200 as a price.
 */
const INDEX_NAME = /\b(?:S&P|Nasdaq|Russell|FTSE|DAX|Nikkei|Dow|CAC)\s?\d{2,5}\b/gi;

/**
 * Pulls every numeric literal out of the text, keeping enough context to tell
 * a percentage from a bare count.
 *
 * `value` is always a magnitude; a sign written in the draft is reported
 * separately in `sign`, because the two are different kinds of claim. See
 * `matches` for why that separation matters.
 *
 * @returns {{raw: string, value: number, sign: number, isPercent: boolean,
 *            hasDecimal: boolean, halfPlace: number}[]}
 */
export function extractNumbers(text) {
  const out = [];

  // A dated table would otherwise fail on the year: 2026 is above the
  // structural threshold and matches nothing in any market feed, so every post
  // that timestamps its evidence gets punished for showing its work.
  const skipSpans = [];
  for (const re of [ISO_DATE, INDICATOR_LABEL, INDEX_NAME]) {
    for (const m of String(text).matchAll(re)) skipSpans.push([m.index, m.index + m[0].length]);
  }
  const insideDate = (i) => skipSpans.some(([a, b]) => i >= a && i < b);
  // A magnitude suffix has to sit flush against the digits and not begin a
  // word: without both guards, "66,956\n\nBias:" reads as 66,956 billion.
  //
  // The leading sign is captured, but only where a sign is what it can be. A
  // hyphen *between two digits* is a range separator — "63250-64100" — and
  // reading it as a minus would turn the upper bound of every level range into
  // a negative claim that traces to nothing. Hence the lookbehind: the match may
  // not begin immediately after a digit or a decimal point.
  const re =
    /(?<![\d.])([-+−])?(\d[\d,]*(?:\.\d+)?)(?:\s*(nghìn|ngàn|triệu|tỷ|tỉ)|([KkMmBb])(?![A-Za-z]))?(\s*%)?/giu;

  for (const m of text.matchAll(re)) {
    if (insideDate(m.index)) continue;
    const [, signChar, digits, wordSuffix, suffix, percent] = m;
    const bare = digits.replace(/,/g, "");
    let value = Number(bare);
    if (!Number.isFinite(value)) continue;

    const multiplier = suffix
      ? SUFFIXES[suffix.toLowerCase()]
      : wordSuffix
        ? WORD_SUFFIXES[wordSuffix.toLowerCase()]
        : 1;
    value *= multiplier;

    // Half a unit in the last place the writer actually wrote. "0.023" claims
    // the value lies within 0.0005 of it; "0.0270" claims within 0.00005. This
    // is what lets a correct rounding through without letting a wrong figure
    // ride on a tolerance borrowed from a larger number.
    const decimals = bare.includes(".") ? bare.split(".")[1].length : 0;
    const halfPlace = 0.5 * 10 ** -decimals * multiplier;

    out.push({
      raw: m[0].trim(),
      value,
      sign: signChar === "+" ? 1 : signChar ? -1 : 0,
      isPercent: Boolean(percent),
      hasDecimal: bare.includes("."),
      halfPlace,
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
  push(a.volumeZScoreCompleted);
  push(a.avgQuoteVolume30d);
  push(a.upDownVolumeRatio30d);
  push(a.upDownVolumeRatio90d);
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
    if (typeof n === "number" && Number.isFinite(n)) values.push(n);
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
 *
 * The window itself is an endpoint, though, and that is the one exception. A
 * post arguing a long-horizon trend has to say how far price has come over the
 * series and how far it sits below the series high; those are four numbers per
 * series, not thousands, and refusing them forces the writer to either drop the
 * horizon or state it vaguely. Pass an array of series to keep each window's
 * own aggregates separate — a flat array is treated as a single series.
 */
export function collectCandleNumbers(candles) {
  const values = [];
  const push = (n) => {
    if (typeof n === "number" && Number.isFinite(n)) values.push(n);
  };
  const seriesList = Array.isArray(candles?.[0]) ? candles : [candles ?? []];

  for (const series of seriesList) {
    for (const c of series ?? []) {
      push(c.open);
      push(c.high);
      push(c.low);
      push(c.close);
      push(c.quoteVolume);
      if (c.open) push((c.close / c.open - 1) * 100);
    }
    if (!series?.length) continue;

    const last = series.at(-1).close;
    const high = Math.max(...series.map((c) => c.high));
    const low = Math.min(...series.map((c) => c.low));
    push(series.length);
    push(high);
    push(low);
    if (series[0].close) push((last / series[0].close - 1) * 100);
    if (high) push((last / high - 1) * 100);
    if (low) push((last / low - 1) * 100);
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
    if (typeof n === "number" && Number.isFinite(n)) values.push(n);
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

/**
 * Figures from a committed research snapshot.
 *
 * A backtest result is not a market quote — no brief or candle series can vouch
 * for "17.2% of signals reached +30%". The provenance is different in kind: a
 * generator script is committed next to its output, so anyone can rerun it and
 * get the same file. Treating those numbers as citable is the same bargain the
 * site's lesson snapshot already makes, and it is the only alternative to
 * publishing research figures through no gate at all.
 */
export function collectStudyNumbers(study) {
  const values = [];
  const walk = (node) => {
    if (typeof node === "number" && Number.isFinite(node)) values.push(node);
    else if (node && typeof node === "object") for (const v of Object.values(node)) walk(v);
  };
  walk(study);
  return values;
}

export function collectBriefNumbers(brief) {
  const values = [];
  const push = (n) => {
    if (typeof n === "number" && Number.isFinite(n)) values.push(n);
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

/**
 * Does one figure from the draft trace to a figure in the data?
 *
 * Two rules, each closing a hole the single relative tolerance had.
 *
 * **Scale.** The tolerance is relative, with no absolute floor. The floor used
 * to be 1, which meant every value below a dollar was checked against a fixed
 * ±0.005 — on a token at 0.02266 that admitted 0.0180 and 0.0270 alike, a
 * twenty-percent error either way, and most of the universe the scanners surface
 * trades under a dollar. What replaces the floor is the precision the writer
 * chose: half a unit in the last place they wrote. "0.023" is a correct rounding
 * of 0.02266 and passes; "0.0270" is not one and fails.
 *
 * **Sign.** An explicit sign is itself a claim and has to hold. Every figure
 * used to be compared on magnitude alone, so inverting the direction of every
 * number in a draft cleared the gate — "-3.21%" traced happily to a real
 * +3.21%, which is the one error that misleads a reader about what the market
 * did. An *unsigned* literal still matches on magnitude, because prose carries
 * direction perfectly well: "BTC fell 3.21%" is true of a -3.21% reading.
 */
function matches(n, allowed) {
  const target = n.value;
  return allowed.some((a) => {
    // A zero reading has no direction to contradict.
    if (n.sign && a !== 0 && Math.sign(a) !== n.sign) return false;
    const source = Math.abs(a);
    const scale = Math.max(source, target);
    return Math.abs(source - target) <= Math.max(scale * TOLERANCE, n.halfPlace);
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
export function verifyNumbers(text, brief, { screen, candles, stages, study } = {}) {
  const allowed = collectBriefNumbers(brief);
  if (screen) allowed.push(...collectScreenNumbers(screen));
  if (candles) allowed.push(...collectCandleNumbers(candles));
  if (stages) allowed.push(...collectStageNumbers(stages));
  if (study) allowed.push(...collectStudyNumbers(study));
  const unmatched = [];
  let checked = 0;

  for (const n of extractNumbers(text)) {
    // A signed integer is never a count. Nobody writes "-3 charts"; a sign marks
    // the number as a directional measurement, so it loses the structural pass.
    const structural = !n.hasDecimal && !n.isPercent && !n.sign && n.value <= STRUCTURAL_MAX;
    if (structural) continue;

    checked++;
    if (!matches(n, allowed)) unmatched.push({ raw: n.raw, value: n.value });
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
 *
 * What the disclosure has to be *about* is the load-bearing part, and it was
 * missing. The list used to carry bare `without`, `cannot` and `don't have`,
 * which are among the commonest words in market prose — so "open interest rose
 * sharply without any price follow-through" and "open interest is climbing and
 * bulls cannot be stopped" both exempted themselves and published a figure the
 * brief never had. A sentence is a disclosure when it says the *data* is
 * missing, not merely when it contains a negation.
 *
 * So the test is in two parts. Some phrases can only mean the figure was not
 * obtainable, and those stand alone. An inability discloses nothing by itself —
 * it depends entirely on what is said to be missing, so the thing that follows
 * it has to be either the data or the field being disclaimed.
 */

/** Wording that can only mean the figure was never obtained. */
const ABSENCE =
  /\b(?:not available|unavailable|not visible|not accessible|geo-?blocked|no data|no source|no feed|not retrievable|not in the brief)\b/i;

/** An inability. On its own this says nothing about the data — see `discloses`. */
const INABILITY =
  /\b(?:cannot|can't|could not|couldn't|do not have|don't have|have no|lacks?|lacking|without)\b/i;

/** What has to be missing for an inability to amount to a disclosure. */
const THE_READING = /\b(?:access|sources?|feeds?|data|figures?|numbers?|readings?|visibility)\b/i;

/**
 * Where an inability stops governing. A clause boundary is the edge of what a
 * negation can be about: in "I cannot see open interest, but the long/short
 * ratio is stretched" the inability covers the first clause and the second is an
 * ordinary claim. Without this cut the second clause borrows the first one's
 * disclaimer, which is how one honest admission licences one fabrication.
 */
const CLAUSE_END = /[,;:]|\b(?:but|however|though|although|while|whereas|yet|still)\b/i;

/**
 * Is this sentence disclaiming `field` rather than making a claim about it?
 *
 * The distinction lives entirely in what is said to be missing. "I cannot see
 * open interest" and "without open interest data" disclaim it. "Bulls cannot be
 * stopped" and "open interest rose without any price follow-through" are claims
 * that happen to contain a negation, and the negation is about something else.
 */
function discloses(sentence, field) {
  if (ABSENCE.test(sentence)) return true;
  const at = sentence.search(INABILITY);
  if (at < 0) return false;
  const clause = sentence.slice(at).split(CLAUSE_END)[0];
  return THE_READING.test(clause) || field.pattern.test(clause);
}

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
    for (const f of FORBIDDEN) {
      if (!missing.has(f.field) || !f.pattern.test(sentence)) continue;
      // Per field, not per sentence: a sentence can disclaim one unavailable
      // field while asserting the other.
      if (!discloses(sentence, f)) violations.add(f.field);
    }
  }
  return { ok: violations.size === 0, violations: [...violations] };
}

/**
 * The vocabulary a post may state its bias in, in one place.
 *
 * These used to be written out twice — once here to admit a post and once in
 * the scoreboard to read it back — and the two copies had already drifted. The
 * gate accepted a lower-case "wait"; the scoreboard only matched upper case. A
 * post could clear the gate and then be unscoreable, dropping silently out of
 * the track record the whole channel rests on. Sharing them makes that class of
 * bug impossible rather than unlikely.
 *
 * Vietnamese is here because the channel is not staying English-only, and a
 * gate that only speaks English is not a lighter gate — it is no gate at all
 * for every post written in the other language.
 *
 * Boundaries use Unicode lookarounds rather than \b. In JavaScript \b is
 * defined on ASCII word characters, so \bCHỜ\b asks for a boundary after a
 * character the engine does not consider a word character, and matches in
 * places nobody intended.
 */
/**
 * A bias must be *declared*, not merely mentioned.
 *
 * The marker alone is not enough. "I am waiting for a retest" is prose, and in
 * Vietnamese the problem is worse: "chờ" is an ordinary verb, so a bare match on
 * it reads a bias into any sentence containing the word "wait". Requiring the
 * label the desk already uses fixes both languages with one rule.
 *
 * The gap after the label is deliberate rather than strict punctuation: across
 * forty published posts the convention is "Bias: WAIT", but two say "BIAS —
 * WAIT" and "BIAS: I remain WAIT". A rule that only admits a colon would have
 * silently dropped those from the track record.
 */
const BIAS_LABEL = String.raw`(?:bias|quan\s+điểm|khuyến\s+nghị)\s*[:\uFF1A\u2014-]?[^\n]{0,30}?`;

/**
 * The vocabulary a post may state its bias in, in one place.
 *
 * These used to be written out twice — once here to admit a post and once in
 * the scoreboard to read it back — and the two copies had already drifted. The
 * gate accepted a lower-case "wait"; the scoreboard only matched upper case. A
 * post could clear the gate and then be unscoreable, dropping silently out of
 * the track record the whole channel rests on. Sharing them makes that class of
 * bug impossible rather than unlikely.
 *
 * Vietnamese is here because the channel is not staying English-only, and a
 * gate that only speaks English is not a lighter gate — it is no gate at all
 * for every post written in the other language.
 *
 * Boundaries use Unicode lookarounds rather than \b. In JavaScript \b is
 * defined on ASCII word characters, so \bCHỜ\b asks for a boundary after a
 * character the engine does not consider a word character.
 *
 * Long and short need no label: "selective long" and "long chọn lọc" are
 * phrases nobody writes by accident.
 */
export const BIAS_PATTERNS = {
  LONG: /(?<!\p{L})(?:selective\s+long|long\s+chọn\s+lọc|mua\s+chọn\s+lọc)(?!\p{L})/iu,
  SHORT: /(?<!\p{L})(?:selective\s+short|short\s+chọn\s+lọc|bán\s+chọn\s+lọc)(?!\p{L})/iu,
  WAIT: new RegExp(`${BIAS_LABEL}(?:wait|chờ|đứng\\s+ngoài)(?!\\p{L})`, "iu"),
};

/**
 * Hashtags that describe the act of posting rather than the subject of the post.
 *
 * Both are enormous — #BinanceSquare carries 732,603 discussing, #WriteToEarn
 * 81,414 — and both gather people talking about the creator programme, not
 * people looking for market analysis. Every one of the first fifty-one posts
 * from this desk carried these two and nothing else, so every post landed on the
 * two most crowded surfaces on the platform and none landed on a topic page a
 * trader browses. #FundingRate, a subject covered twice in one week, holds 948.
 *
 * They are not banned — the creator programme wants one of them. They just no
 * longer count toward the requirement that a post name its own subject.
 * See research/hashtag-reach.md.
 */
const META_HASHTAGS = new Set(["writetoearn", "binancesquare", "binance", "crypto"]);

/** Wording that tells a reader this is not advice, in either language. */
const DISCLAIMER = /not financial advice|nfa\b|dyor|không\s+phải\s+lời\s+khuyên|tự\s+chịu\s+trách\s+nhiệm/iu;

/**
 * Structural requirements from the post spec, checked before anything is sent.
 * @returns {{ok: boolean, problems: string[], words: number}}
 */
export function verifyStructure(text, { maxWords = 220, minWords = 40, requireBias = true } = {}) {
  const problems = [];
  const words = text.trim().split(/\s+/).filter(Boolean).length;

  if (words > maxWords) problems.push(`${words} words exceeds the ${maxWords}-word limit`);
  if (words < minWords) problems.push(`${words} words is too short to be a real post`);
  const hashtags = [...text.matchAll(/#(\w+)/g)].map((m) => m[1]);
  if (!hashtags.length) problems.push("no hashtags");
  else if (!hashtags.some((h) => !META_HASHTAGS.has(h.toLowerCase()))) {
    problems.push(
      `every hashtag is a meta tag (${hashtags.join(", ")}) — add one naming the subject, `
        + "or the post only reaches the crowded creator surfaces",
    );
  }
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
  if (!DISCLAIMER.test(text)) problems.push("no disclaimer");
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
  if (requireBias && !Object.values(BIAS_PATTERNS).some((re) => re.test(text))) {
    problems.push("no bias stated (WAIT / Selective Long / Selective Short, or CHỜ / Long chọn lọc / Short chọn lọc)");
  }

  return { ok: problems.length === 0, problems, words };
}

/** Runs every gate. Publishing should be blocked unless this passes. */
export function verifyPost(text, brief, opts = {}) {
  const numbers = verifyNumbers(text, brief, { screen: opts.screen, candles: opts.candles, stages: opts.stages, study: opts.study });
  const claims = verifyNoForbiddenClaims(text, brief);
  const structure = verifyStructure(text, opts);

  // Naming the sources that were actually searched keeps the failure honest:
  // "not in the brief" is misleading when an alt figure was never checkable.
  const searched = ["the brief"];
  if (opts.screen) searched.push("the screen");
  if (opts.candles) searched.push("the candle series");
  if (opts.stages) searched.push("the stage metrics");
  if (opts.study) searched.push("the study snapshot");
  const sources = searched.length === 1 ? searched[0] : `${searched.slice(0, -1).join(", ")} or ${searched.at(-1)}`;
  const problems = [
    ...numbers.unmatched.map((u) => `figure "${u.raw}" does not appear in ${sources}`),
    ...claims.violations.map((v) => `mentions ${v}, which the brief could not retrieve`),
    ...structure.problems,
  ];

  return { ok: problems.length === 0, problems, numbersChecked: numbers.checked, words: structure.words };
}
