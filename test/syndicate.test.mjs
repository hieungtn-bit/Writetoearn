import test from "node:test";
import assert from "node:assert/strict";
import { coreLines, paragraphs, syndicate, toLinkedIn, toXThread } from "../src/syndicate.mjs";

const post = `The market fell and I said so.

THE MEASUREMENT

Across 61 pairs the median was -2.40%.

\`\`\`
stop      result
1.5 ATR   -0.044
\`\`\`

Bias: **stand aside**.

Educational research, not financial advice. You are responsible for your own risk.

#BTC #RiskManagement`;

const meta = { title: "A Post", url: "https://example.test/a-post/" };

test("platform furniture is stripped, argument is kept", () => {
  const core = coreLines(post);
  assert.ok(!core.includes("#RiskManagement"), "hashtag line must go");
  assert.ok(!core.includes("Educational research"), "the Square disclaimer must go");
  assert.ok(core.includes("median was -2.40%"), "the figure must stay");
});

test("an X thread stays inside the character limit and ends with the link", () => {
  const thread = toXThread(post, { url: meta.url });
  for (const p of thread) assert.ok(p.length <= 280, `post too long: ${p.length}`);
  assert.match(thread.at(-1), /example\.test\/a-post/);
  assert.match(thread[0], /1\/\d/, "posts are numbered");
});

/**
 * The counter is part of the post, and for a while it was not part of the
 * budget: a paragraph measured at exactly 280 shipped as 285 once "4/6" was
 * appended. The limit has to hold on the string that actually gets posted.
 */
test("the n/N counter is counted against the limit, not added after it", () => {
  const exact = `Opening line with a 1 in it.\n\n${"a".repeat(272)} 9.9%.`;
  for (const p of toXThread(exact, { url: meta.url })) {
    assert.ok(p.length <= 280, `emitted post too long: ${p.length}`);
  }
});

test("a long post is still cut to the thread ceiling", () => {
  const long = Array.from({ length: 40 }, (_, i) => `Paragraph ${i} with a figure ${i}.5%.`).join("\n\n");
  assert.ok(toXThread(long, { url: meta.url }).length <= 6);
});

test("LinkedIn drops cashtags and respects its ceiling", () => {
  const body = toLinkedIn(`$BTC held. ${"x".repeat(4000)}`, { url: meta.url });
  assert.ok(!body.includes("$BTC"), "cashtags mean nothing there");
  assert.ok(body.includes("BTC held"));
  assert.ok(body.length <= 3000, `too long: ${body.length}`);
  assert.match(body, /example\.test/);
});

test("every format links back to the canonical page", () => {
  const out = syndicate(post, meta);
  assert.match(out.telegram, /example\.test\/a-post/);
  assert.match(out.linkedin, /example\.test\/a-post/);
  assert.match(out.markdown, /example\.test\/a-post/);
  assert.match(out.x.at(-1), /example\.test\/a-post/);
});

test("headings are not mistaken for paragraphs", () => {
  assert.ok(!paragraphs(post).includes("THE MEASUREMENT"));
});
