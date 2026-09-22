/**
 * The English-only rule, made checkable.
 *
 * This channel publishes to a global audience on Binance Square and mirrors
 * every post to an `en` website, so the language of everything that ships is
 * part of the contract rather than a matter of taste. The rule was previously
 * only in someone's head, and fourteen posts went out in Vietnamese before
 * anyone compared the site against its own locale.
 *
 * Detection is by script, not by dictionary. A word list only catches what it
 * has already seen, and the failure here is whole articles rather than stray
 * words. Vietnamese is the language actually at risk in this repo, and it is
 * detectable with certainty from its letters alone: no Vietnamese sentence of
 * any length avoids them.
 *
 * The character set is deliberately narrow. An earlier pass flagged "Viénot"
 * and would have flagged "café" and "naïve", because it matched every accented
 * Latin vowel — but é, à and ó are ordinary in English loanwords and in the
 * proper nouns this research cites. What is listed below is the part of the
 * Vietnamese alphabet that does not appear in French, Spanish, Portuguese,
 * German or in any English borrowing from them: the horned and breved vowels,
 * đ, and the vowels carrying hook-above, tilde or dot-below.
 *
 * The cost of that narrowness is honest: this will not catch Vietnamese
 * written without diacritics. Nothing in this repo produces that, and a check
 * that cries wolf on a French surname is one that gets switched off.
 */

/** Letters that are Vietnamese and are not shared with Western European languages. */
const VIETNAMESE_LETTERS = [
  "ăĂ", "âÂ", "đĐ", "êÊ", "ôÔ", "ơƠ", "ưƯ",
  // Hook above.
  "ảẢ", "ẻẺ", "ỉỈ", "ỏỎ", "ủỦ", "ỷỶ",
  // Tilde (on vowels Spanish and Portuguese do not carry it on).
  "ẽẼ", "ĩĨ", "õÕ", "ũŨ", "ỹỸ",
  // Dot below.
  "ạẠ", "ẹẸ", "ịỊ", "ọỌ", "ụỤ", "ỵỴ",
  // Combining forms built on the horned and breved vowels.
  "ằắẳẵặẰẮẲẴẶ", "ầấẩẫậẦẤẨẪẬ", "ềếểễệỀẾỂỄỆ",
  "ồốổỗộỒỐỔỖỘ", "ờớởỡợỜỚỞỠỢ", "ừứửữựỪỨỬỮỰ",
].join("");

const VIETNAMESE = new RegExp(`[${VIETNAMESE_LETTERS}]`, "u");

/** True when the text carries no non-English script this checker knows about. */
export function isEnglish(text) {
  return !VIETNAMESE.test(String(text ?? ""));
}

/**
 * Every line that is not English, with its number, for a report a human reads.
 * @returns {{line: number, text: string}[]}
 */
export function nonEnglishLines(text) {
  const hits = [];
  for (const [i, line] of String(text ?? "").split("\n").entries()) {
    if (VIETNAMESE.test(line)) hits.push({ line: i + 1, text: line.trim() });
  }
  return hits;
}

/**
 * The publish gate.
 *
 * Returns the same `{ok, problems}` shape the other verifiers use so it can
 * join them without special handling at the call site.
 */
export function verifyEnglish(text) {
  const hits = nonEnglishLines(text);
  if (!hits.length) return { ok: true, problems: [] };
  const first = hits[0];
  const more = hits.length > 1 ? ` (and ${hits.length - 1} more line${hits.length > 2 ? "s" : ""})` : "";
  return {
    ok: false,
    problems: [
      `line ${first.line} is not English${more}: "${first.text.slice(0, 80)}" — `
      + "this channel publishes in English on both surfaces",
    ],
  };
}
