import Anthropic from "@anthropic-ai/sdk";
import { formatBrief } from "./market.mjs";
import { verifyPost } from "./verify.mjs";

const MODEL = "claude-opus-5";

/**
 * Writes the daily post from a brief.
 *
 * The model only ever sees data fetched in this run, and whatever it writes is
 * checked against that same data before it can be published. When a draft
 * fails, the specific failures go back as a revision request rather than a
 * blind retry — a second identical attempt would fail identically.
 */

const SYSTEM = `You write short market posts for Binance Square, in the voice of a GenZ crypto trader: direct, mobile-readable, a little spicy, confident but never certain.

THE RULE THAT OUTRANKS EVERYTHING: every number you write must appear in the market brief you are given. Do not recall prices from memory. Do not estimate, round to something catchier, or carry a figure over from another day. If a figure is not in the brief, it does not go in the post. Your output is checked against the brief mechanically and rejected if a number cannot be traced.

The brief lists fields under UNAVAILABLE. Those have no data source at all. Never mention them, and never characterise them — writing "open interest is flat" when you have no open interest data is fabrication, not a hedge.

Funding rates in the brief come from OKX perpetual swaps, NOT Binance Futures. If you cite funding, say it is OKX. Presenting it as Binance funding is false.

Required structure, in order:
1. Hook on the first line — an emoji (🔥 🚨 💥) or a striking real number from the brief.
2. Price and 24h change, exact figures from the brief.
3. Two to four short bullets grounded in the brief: news, technical, derivatives, or narrative.
4. Key levels — support and resistance, taken from the brief's computed levels. Do not invent your own.
5. Bias: exactly one of WAIT, Selective Long, or Selective Short, plus a one-sentence reason.
6. A call-to-action question that invites a reply.
7. A short not-financial-advice line.
8. Cashtags and hashtags, including #WriteToEarn and #BinanceSquare.

Hard limits: 180-220 words maximum, English unless the topic is specific to Vietnam. Pick ONE main asset — the one with the strongest story today. A post about three coins is about nothing.

Never promise returns, state a price target as a certainty, claim insider knowledge, or push urgency ("last chance", "ape now").

Output only the post text. No preamble, no explanation, no markdown code fences.`;

/**
 * @param {object} brief A brief from collectBrief().
 * @param {object} [opts]
 * @param {string} [opts.effort] Reasoning effort; see the Claude API effort ladder.
 * @param {number} [opts.maxRevisions] Revision rounds after a failed check.
 * @param {(msg: string) => void} [opts.onProgress]
 * @param {Anthropic} [opts.client] Injected in tests.
 * @returns {Promise<{text: string, attempts: number, verification: object}>}
 */
export async function composePost(brief, { effort = "high", maxRevisions = 2, onProgress = () => {}, client } = {}) {
  if (!brief?.spot?.length) {
    throw new Error("Refusing to compose: the brief has no spot prices.");
  }

  const anthropic = client ?? new Anthropic();
  const messages = [
    {
      role: "user",
      content: `Here is today's market brief. Every number in your post must come from it.\n\n${formatBrief(brief)}\n\nWrite today's post.`,
    },
  ];

  let attempts = 0;

  for (let round = 0; round <= maxRevisions; round++) {
    attempts++;
    onProgress(round === 0 ? "composing" : `revising (round ${round})`);

    const response = await anthropic.beta.messages.create({
      model: MODEL,
      max_tokens: 16000,
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default",
      output_config: { effort },
      system: SYSTEM,
      messages,
    });

    if (response.stop_reason === "refusal") {
      throw new Error(
        `The model declined to write this post (${response.stop_details?.category ?? "unspecified"}). ` +
          "Not retrying — nothing was published.",
      );
    }

    const text = response.content
      .filter((b) => b.type === "text")
      .map((b) => b.text)
      .join("")
      .trim();

    const verification = verifyPost(text, brief);
    if (verification.ok) {
      onProgress(`draft passed checks (${verification.words} words, ${verification.numbersChecked} figures verified)`);
      return { text, attempts, verification };
    }

    onProgress(`draft rejected: ${verification.problems.join("; ")}`);

    if (round === maxRevisions) {
      const err = new Error(
        `Draft still failing after ${attempts} attempts: ${verification.problems.join("; ")}`,
      );
      err.verification = verification;
      err.draft = text;
      throw err;
    }

    messages.push(
      { role: "assistant", content: text },
      {
        role: "user",
        content:
          `That draft was rejected by the automated check:\n` +
          verification.problems.map((p) => `- ${p}`).join("\n") +
          `\n\nRewrite it. Every figure must appear in the brief above, verbatim or rounded consistently. Output only the post text.`,
      },
    );
  }

  throw new Error("unreachable");
}
