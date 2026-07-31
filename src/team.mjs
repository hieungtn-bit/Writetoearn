import Anthropic from "@anthropic-ai/sdk";
import { formatBrief } from "./market.mjs";
import { formatScreen, findOutliers } from "./screen.mjs";
import { verifyPost } from "./verify.mjs";
import { getFormat } from "./slots.mjs";
import { VOICE } from "./brand.mjs";

/**
 * The daily content team.
 *
 * Three roles, not one prompt, because they are genuinely different jobs:
 * choosing what is worth saying, saying it, and judging whether it was worth
 * saying. The critic in particular needs a context that never saw the draft
 * being written — a writer reviewing itself rationalises, which is the whole
 * reason writer-verifier pairs beat self-critique.
 *
 * Everything mechanical stays out of here. Number tracing, cashtag limits and
 * structural rules live in verify.mjs where they are deterministic and tested;
 * asking a model to check arithmetic it just produced would be strictly worse.
 *
 * This is a workflow, not an autonomous agent loop: the control flow is code,
 * the model supplies judgment at three fixed points. That is the simplest tier
 * that does the job, and simpler is more reliable when it runs unattended.
 */

const MODEL = "claude-opus-5";

const ANGLE_SCHEMA = {
  type: "object",
  properties: {
    subject: { type: "string", description: "Primary symbol, e.g. BTCUSDT" },
    supporting: {
      type: "array",
      items: { type: "string" },
      description: "Up to two other symbols to cite as context",
    },
    thesis: { type: "string", description: "One sentence: the story in the data today" },
    evidence: {
      type: "array",
      items: { type: "string" },
      description: "3-4 specific figures from the brief that support the thesis",
    },
    freshness: {
      type: "string",
      description: "How this differs from the recent posts listed, or 'no recent overlap'",
    },
    skip: { type: "boolean", description: "True when nothing today is worth posting" },
    skipReason: { type: "string" },
  },
  required: ["subject", "supporting", "thesis", "evidence", "freshness", "skip", "skipReason"],
  additionalProperties: false,
};

const CRITIQUE_SCHEMA = {
  type: "object",
  properties: {
    publish: { type: "boolean" },
    problems: {
      type: "array",
      items: { type: "string" },
      description: "Specific, actionable defects. Empty when publishable.",
    },
    repetitive: { type: "boolean", description: "True if it restates a recent post" },
  },
  required: ["publish", "problems", "repetitive"],
  additionalProperties: false,
};

async function ask(client, { system, user, schema, maxTokens = 8000 }) {
  const params = {
    model: MODEL,
    max_tokens: maxTokens,
    betas: ["server-side-fallback-2026-07-01"],
    fallbacks: "default",
    output_config: { effort: "high" },
    system,
    messages: [{ role: "user", content: user }],
  };
  if (schema) params.output_config.format = { type: "json_schema", schema };

  const response = await client.beta.messages.create(params);

  if (response.stop_reason === "refusal") {
    const err = new Error(
      `Model declined (${response.stop_details?.category ?? "unspecified"}). Nothing was published.`,
    );
    err.refusal = true;
    throw err;
  }

  const text = response.content
    .filter((b) => b.type === "text")
    .map((b) => b.text)
    .join("")
    .trim();

  if (!schema) return text;
  try {
    return JSON.parse(text);
  } catch {
    throw new Error(`Expected JSON from a structured call, got: ${text.slice(0, 200)}`);
  }
}

/** Role 1 — decides what today's story is, and whether there is one at all. */
export async function pickAngle({ brief, screenResult, format, recentPosts, client }) {
  const spec = getFormat(format);
  const recent = recentPosts.length
    ? recentPosts
        .map((p) => `- ${p.publishedAt.slice(0, 16)} [${p.format ?? "?"}] ${p.asset ?? "?"}: ${p.angle ?? p.hook ?? "(no summary)"}`)
        .join("\n")
    : "(nothing published recently)";

  const system = `You are the analyst on a crypto research desk. You do not write posts; you decide what the day's story is.

Pick the single most interesting, defensible story in the data. Interesting means a reader learns something they could not get from glancing at a price. Defensible means every part of it is backed by a figure in the brief.

You are allowed — expected — to say there is no story. A channel that posts something forced every slot trains its readers to ignore it. Set skip=true when the data is genuinely unremarkable.

Do not repeat the recent posts listed. Restating a live thesis with updated numbers is the fastest way to lose an audience.

Never propose a story about open interest, long/short ratio, liquidations, or anything else listed as unavailable. Those have no data source.`;

  const user = `Slot: ${spec.label} (${spec.slot})
${spec.instruction}

=== MARKET BRIEF ===
${formatBrief(brief)}

${screenResult ? `=== ALTCOIN SCREEN ===\n${formatScreen(screenResult, findOutliers(screenResult.rows))}\n` : ""}
=== RECENTLY PUBLISHED (do not repeat) ===
${recent}

Choose today's angle.`;

  return ask(client, { system, user, schema: ANGLE_SCHEMA });
}

/** Role 2 — writes the post to the chosen angle. */
export async function writePost({ brief, screenResult, format, angle, recentPosts, client, revisionNotes }) {
  const spec = getFormat(format);
  const [minWords, maxWords] = spec.words;

  const system = `You write short market posts for Binance Square.

${VOICE}

THE RULE THAT OUTRANKS EVERYTHING: every number you write must appear in the data below. Never recall a price from memory, never estimate, never round to something catchier. Your output is machine-checked against this data and rejected if a figure cannot be traced.

Fields listed as UNAVAILABLE have no source. Never mention them, and never characterise them — "open interest is flat" with no open interest data is fabrication.

Funding rates are from OKX perpetual swaps, NOT Binance Futures. Label them as OKX if you cite them.

Use EXACTLY THREE distinct cashtags. Each renders a tappable price widget — the highest-intent click surface on the post — but a fourth gets the whole post rejected by the API.

Required structure, in order: hook with an emoji or a striking real figure; price and change; 2-4 bullets grounded in the data; key levels; a bias of WAIT, Selective Long or Selective Short with a one-sentence reason; a question that invites a reply; a short not-financial-advice line; cashtags and hashtags including #WriteToEarn and #BinanceSquare.

Language: English. Square auto-translates per reader locale.

Output only the post text. No preamble, no code fences.`;

  const user = `Slot: ${spec.label}
${spec.instruction}
Target length: ${minWords}-${maxWords} words.

=== TODAY'S ANGLE (from the analyst) ===
Subject: ${angle.subject}
Supporting: ${angle.supporting.join(", ") || "(none)"}
Thesis: ${angle.thesis}
Evidence to use: ${angle.evidence.join(" | ")}

=== MARKET BRIEF ===
${formatBrief(brief)}

${screenResult ? `=== ALTCOIN SCREEN ===\n${formatScreen(screenResult, findOutliers(screenResult.rows))}\n` : ""}
${recentPosts.length ? `=== RECENTLY PUBLISHED (do not restate) ===\n${recentPosts.map((p) => `- ${p.asset ?? "?"}: ${p.angle ?? p.hook ?? ""}`).join("\n")}\n` : ""}
${revisionNotes ? `=== REVISION REQUIRED ===\nThe previous draft was rejected:\n${revisionNotes}\nRewrite it addressing every point.\n` : ""}
Write the post.`;

  return ask(client, { system, user });
}

/** Role 3 — fresh eyes. Judges whether the post is worth a reader's time. */
export async function critique({ draft, angle, format, recentPosts, client }) {
  const spec = getFormat(format);

  const system = `You are the editor on a crypto research desk. You did not write this draft and you have no attachment to it.

Judge one thing: is this worth a reader's time, and does it live up to a channel whose promise is "Evidence Over Emotion"?

Reject it for any of these:
- It restates a recent post with fresh numbers.
- The thesis is a truism ("price is volatile", "watch the levels").
- It asserts causation the data cannot support.
- It hypes, manufactures urgency, or reads like a shill.
- The bias does not follow from the evidence given.
- It buries the interesting fact under boilerplate.

Do NOT check arithmetic, cashtag counts, word counts, or whether figures trace to source. A separate deterministic checker does all of that, and duplicating it here wastes your judgment.

Be strict but not precious. A solid, clear, unexciting post on a quiet day is publishable — the channel's value is consistency and rigour, not novelty for its own sake.`;

  const user = `Slot: ${spec.label} — ${spec.instruction}

Intended thesis: ${angle.thesis}

=== DRAFT ===
${draft}

${recentPosts.length ? `=== RECENT POSTS ===\n${recentPosts.map((p) => `- ${p.asset ?? "?"}: ${p.angle ?? p.hook ?? ""}`).join("\n")}` : "(no recent posts)"}

Verdict?`;

  return ask(client, { system, user, schema: CRITIQUE_SCHEMA });
}

/**
 * Runs the whole team for one slot.
 *
 * @returns {Promise<{skipped: boolean, reason?: string, text?: string, angle?: object, rounds?: number}>}
 */
export async function runTeam({
  brief,
  screenResult = null,
  format = "positioning",
  recentPosts = [],
  client,
  maxRounds = 3,
  log = () => {},
} = {}) {
  if (!brief?.spot?.length) {
    throw new Error("Refusing to run: the brief has no spot prices.");
  }
  const anthropic = client ?? new Anthropic();
  const [, maxWords] = getFormat(format).words;

  log("analyst: choosing today's angle");
  const angle = await pickAngle({ brief, screenResult, format, recentPosts, client: anthropic });

  if (angle.skip) {
    log(`analyst: nothing worth posting — ${angle.skipReason}`);
    return { skipped: true, reason: angle.skipReason, angle };
  }
  log(`analyst: ${angle.subject} — ${angle.thesis}`);

  let revisionNotes = null;

  for (let round = 1; round <= maxRounds; round++) {
    log(`writer: draft ${round}`);
    const draft = await writePost({
      brief, screenResult, format, angle, recentPosts, client: anthropic, revisionNotes,
    });

    // Deterministic gate first: it is free, exact, and its failures are the
    // most specific feedback the writer can get.
    const mechanical = verifyPost(draft, brief, { maxWords: maxWords + 20, minWords: 40 });
    if (!mechanical.ok) {
      log(`  checker rejected: ${mechanical.problems.join("; ")}`);
      revisionNotes = mechanical.problems.map((p) => `- ${p}`).join("\n");
      continue;
    }

    log("critic: reviewing");
    const verdict = await critique({ draft, angle, format, recentPosts, client: anthropic });
    if (verdict.publish) {
      log(`  approved (${mechanical.words} words, ${mechanical.numbersChecked} figures verified)`);
      return { skipped: false, text: draft, angle, rounds: round, verification: mechanical };
    }

    log(`  critic rejected: ${verdict.problems.join("; ")}`);
    revisionNotes = verdict.problems.map((p) => `- ${p}`).join("\n");
  }

  const err = new Error(`No draft survived ${maxRounds} rounds. Last issues:\n${revisionNotes}`);
  err.angle = angle;
  throw err;
}
