/**
 * One post, reshaped for every place it can be published.
 *
 * Binance Square is the only channel this desk can currently post to
 * automatically — it is the only one with a credential. That is a distribution
 * problem, not a writing problem, so this module solves the writing half now
 * and leaves a socket where each API goes.
 *
 * Every format links back to the canonical page rather than reproducing the
 * whole argument. A post's figures only mean anything next to the research
 * snapshot they came from, and a copy floating on another network without that
 * link is the thing this project exists to argue against.
 *
 * Nothing here invents a claim. Each adapter selects from text that already
 * passed the verifier, so a syndicated copy cannot say something the audited
 * original did not.
 */

/** Square's own footer conventions, which mean nothing anywhere else. */
const HASHTAG_LINE = /^\s*(?:\$[A-Z]{2,10}\s*)*#\w[\w\s#]*$/;
const DISCLAIMER = /^Educational research, not financial advice/i;

/** The lines that carry the argument, with the platform furniture removed. */
export function coreLines(text) {
  return String(text)
    .split("\n")
    .filter((l) => !HASHTAG_LINE.test(l) && !DISCLAIMER.test(l.trim()))
    .join("\n")
    .trim();
}

/** Fenced tables travel badly off a monospace surface; this finds them. */
const codeBlocks = (text) => [...String(text).matchAll(/```\n([\s\S]*?)```/g)].map((m) => m[1].trimEnd());

/** Paragraphs, excluding headings, fences and the closing question. */
export function paragraphs(text) {
  return coreLines(text)
    .split(/\n\s*\n/)
    .map((p) => p.trim())
    .filter((p) => p && !p.startsWith("```") && !/^[A-Z][A-Z ,'—-]+$/.test(p));
}

/** Bold markers and stray markdown, for surfaces that render neither. */
export const plain = (s) => String(s).replace(/\*\*/g, "").replace(/^\*|\*$/g, "");

const HARD_LIMITS = { x: 280, telegram: 4096, facebook: 63206, linkedin: 3000 };

/**
 * A thread for X.
 *
 * Split on the argument rather than on characters: the opening claim, the
 * numbers that support it, the caveat, then the link. A thread cut at 280
 * characters mid-sentence reads as a bot, and a desk that publishes its own
 * failures cannot afford to look automated.
 */
export function toXThread(text, { url, maxPosts = 6 } = {}) {
  const paras = paragraphs(text).map(plain);
  const table = codeBlocks(text)[0];
  const posts = [];

  /**
   * The "4/6" counter is part of the post, so it has to be part of the budget.
   *
   * Measuring the body against 280 and *then* appending the counter shipped a
   * 285-character tweet — the limit was enforced against a string that was
   * never the one posted. Everything below budgets against the emitted text.
   */
  const counter = (i, n) => `\n\n${i + 1}/${n}`;
  const BUDGET = HARD_LIMITS.x - counter(maxPosts - 1, maxPosts).length;

  const opener = paras[0] ?? "";
  posts.push(opener.length <= BUDGET ? opener : `${opener.slice(0, BUDGET - 1)}…`);

  // The strongest supporting paragraphs: the ones carrying figures.
  const withNumbers = paras.slice(1).filter((p) => /\d/.test(p));
  for (const p of withNumbers) {
    if (posts.length >= maxPosts - 1) break;
    if (p.length <= BUDGET) posts.push(p);
  }

  if (table && posts.length < maxPosts - 1) {
    const block = table.split("\n").slice(0, 7).join("\n");
    if (block.length <= BUDGET - 20) posts.push(block);
  }

  posts.push(`Every figure traces to a published snapshot. Full post and the data behind it:\n${url}`);
  return posts.slice(0, maxPosts).map((body, i, all) => {
    const suffix = counter(i, all.length);
    const room = HARD_LIMITS.x - suffix.length;
    return (body.length <= room ? body : `${body.slice(0, room - 1)}…`) + suffix;
  });
}

/** Telegram takes the whole thing; it only needs the furniture swapped. */
export function toTelegram(text, { url } = {}) {
  const body = coreLines(text).replace(/```/g, "```");
  return `${body}\n\nFull post, with every figure traced to its snapshot:\n${url}\n\nEducational research, not financial advice.`;
}

/** LinkedIn: no fences, no cashtags, and a hard ceiling. */
export function toLinkedIn(text, { url } = {}) {
  const body = plain(coreLines(text))
    .replace(/```[\s\S]*?```/g, (m) => m.replace(/```/g, "").trim())
    .replace(/\$([A-Z]{2,10})\b/g, "$1");
  const tail = `\n\nMethod, data and the track record: ${url}\n\nEducational research, not financial advice.`;
  const room = HARD_LIMITS.linkedin - tail.length;
  return (body.length <= room ? body : `${body.slice(0, room - 1)}…`) + tail;
}

/** Markdown for anywhere that renders it — newsletters, forums, mirrors. */
export function toMarkdown(text, { title, url } = {}) {
  return `# ${title}\n\n${coreLines(text)}\n\n---\n\nOriginally published at [${url}](${url}). `
    + `Every figure traces to a snapshot served at /data/.\n\n`
    + `_Educational research, not financial advice._\n`;
}

export const PLATFORMS = ["x", "telegram", "linkedin", "markdown"];

/**
 * Every format at once, keyed by platform.
 *
 * @param {string} text The published draft, already verified.
 * @param {{title: string, url: string}} meta
 */
export function syndicate(text, { title, url }) {
  return {
    x: toXThread(text, { url }),
    telegram: toTelegram(text, { url }),
    linkedin: toLinkedIn(text, { url }),
    markdown: toMarkdown(text, { title, url }),
  };
}
