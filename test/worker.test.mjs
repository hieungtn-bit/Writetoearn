import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { STATUS, Store } from "../src/store.mjs";
import { MAX_ATTEMPTS, STOP_REASON, runOnce } from "../src/worker.mjs";
import { SquareApiError } from "../src/errors.mjs";
import { normalizePost } from "../src/post.mjs";
import { PUBLISH_STATUS_NO_ID } from "../src/client.mjs";
import { DAILY_POST_LIMIT } from "../src/config.mjs";

function freshStore(t) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "wte-test-"));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  return new Store({ dir });
}

/** A client whose publish() behaviour the test dictates. */
function fakeClient(publishImpl) {
  return {
    publish: publishImpl,
    uploadImage: async () => "https://cdn/img.png",
    uploadVideo: async () => "ticket",
  };
}

const textSpec = (text = "hello") => normalizePost({ type: "text", text });

test("a due post is published once and marked with its link", async (t) => {
  const store = freshStore(t);
  const item = store.add(textSpec());
  let calls = 0;

  const summary = await runOnce(
    store,
    fakeClient(async () => {
      calls++;
      return { id: "42", shareLink: "https://binance.com/square/post/42" };
    }),
  );

  assert.equal(calls, 1);
  assert.equal(summary.published, 1);
  const stored = store.get(item.id);
  assert.equal(stored.status, STATUS.PUBLISHED);
  assert.equal(stored.result.shareLink, "https://binance.com/square/post/42");
  assert.equal(store.usageFor().posts, 1);
});

test("a post scheduled for later is left alone", async (t) => {
  const store = freshStore(t);
  store.add(textSpec(), { scheduledAt: new Date(Date.now() + 3_600_000).toISOString() });

  const summary = await runOnce(
    store,
    fakeClient(async () => assert.fail("should not publish a future post")),
  );

  assert.equal(summary.published, 0);
});

test("a content rejection fails immediately rather than burning retries", async (t) => {
  const store = freshStore(t);
  const item = store.add(textSpec());
  let calls = 0;

  await runOnce(
    store,
    fakeClient(async () => {
      calls++;
      throw new SquareApiError("[20002] sensitive content", { code: "20002" });
    }),
  );

  assert.equal(calls, 1, "a rejected body must not be replayed");
  assert.equal(store.get(item.id).status, STATUS.FAILED);
});

test("a transient failure schedules a backoff and stays pending", async (t) => {
  const store = freshStore(t);
  const item = store.add(textSpec());

  await runOnce(
    store,
    fakeClient(async () => {
      throw new SquareApiError("connection reset", { httpStatus: 503 });
    }),
  );

  const stored = store.get(item.id);
  assert.equal(stored.status, STATUS.PENDING);
  assert.equal(stored.attempts, 1);
  assert.ok(new Date(stored.nextAttemptAt) > new Date(), "backoff should be in the future");
});

test("transient failures give up after the attempt budget", async (t) => {
  const store = freshStore(t);
  const item = store.add(textSpec());
  const client = fakeClient(async () => {
    throw new SquareApiError("connection reset", { httpStatus: 503 });
  });

  for (let i = 0; i < MAX_ATTEMPTS; i++) {
    // Each cycle pretends enough time has passed for the backoff to elapse.
    store.update(item.id, { nextAttemptAt: new Date(Date.now() - 1000).toISOString() });
    await runOnce(store, client);
  }

  const stored = store.get(item.id);
  assert.equal(stored.status, STATUS.FAILED);
  assert.equal(stored.attempts, MAX_ATTEMPTS);
});

test("a server-side quota error parks the queue until UTC midnight", async (t) => {
  const store = freshStore(t);
  const first = store.add(textSpec("one"));
  const second = store.add(textSpec("two"));

  const summary = await runOnce(
    store,
    fakeClient(async () => {
      throw new SquareApiError("[220009] daily limit", { code: "220009" });
    }),
  );

  assert.equal(summary.stopReason, STOP_REASON.QUOTA);
  assert.equal(store.get(first.id).status, STATUS.PENDING);
  assert.ok(new Date(store.get(first.id).nextAttemptAt) > new Date());
  assert.equal(store.get(second.id).attempts, 0, "the run should stop, not keep trying");
});

test("the local budget stops the run before the API is even called", async (t) => {
  const store = freshStore(t);
  store.recordUsage({ posts: DAILY_POST_LIMIT });
  store.add(textSpec());

  const summary = await runOnce(
    store,
    fakeClient(async () => assert.fail("should not call the API with no budget left")),
  );

  assert.equal(summary.stopReason, STOP_REASON.QUOTA);
});

test("an auth failure stops the run so a bad key cannot drain the queue", async (t) => {
  const store = freshStore(t);
  const first = store.add(textSpec("one"));
  const second = store.add(textSpec("two"));

  const summary = await runOnce(
    store,
    fakeClient(async () => {
      throw new SquareApiError("[220003] key not found", { code: "220003" });
    }),
  );

  assert.equal(summary.stopReason, STOP_REASON.AUTH);
  assert.equal(store.get(first.id).status, STATUS.PENDING);
  assert.equal(store.get(second.id).attempts, 0);
});

test("a gateway timeout counts as published, never as a retry", async (t) => {
  const store = freshStore(t);
  const item = store.add(textSpec());
  let calls = 0;

  await runOnce(
    store,
    fakeClient(async () => {
      calls++;
      return { id: null, shareLink: null, publishStatus: PUBLISH_STATUS_NO_ID };
    }),
  );

  assert.equal(calls, 1);
  const stored = store.get(item.id);
  assert.equal(stored.status, STATUS.PUBLISHED);
  assert.equal(stored.result.missingPostId, true);
});

test("a post interrupted mid-publish is held for review, not republished", async (t) => {
  const store = freshStore(t);
  const item = store.add(textSpec());
  store.update(item.id, { status: STATUS.PUBLISHING });

  const summary = await runOnce(
    store,
    fakeClient(async () => assert.fail("must not republish an in-flight post")),
  );

  assert.equal(summary.reviewed, 1);
  assert.equal(store.get(item.id).status, STATUS.NEEDS_REVIEW);
});

test("dry run validates and reports without publishing or spending quota", async (t) => {
  const store = freshStore(t);
  const item = store.add(textSpec());

  const summary = await runOnce(
    store,
    fakeClient(async () => assert.fail("dry run must not publish")),
    { dryRun: true },
  );

  assert.equal(summary.published, 0);
  assert.equal(store.get(item.id).status, STATUS.PENDING);
  assert.equal(store.usageFor().posts, 0);
});

test("uploads that succeeded before a failed publish still count against quota", async (t) => {
  const store = freshStore(t);
  store.add(normalizePost({ type: "image", text: "hi", images: "a.png,b.png" }));

  const client = {
    uploadImage: async () => "https://cdn/img.png",
    publish: async () => {
      throw new SquareApiError("[20002] sensitive content", { code: "20002" });
    },
  };

  // The spec points at files that do not exist, so stub the existence check
  // by writing them into the temp dir the store already owns.
  const dir = store.dir;
  fs.writeFileSync(path.join(dir, "a.png"), "x");
  fs.writeFileSync(path.join(dir, "b.png"), "x");
  const item = store.list()[0];
  store.update(item.id, {
    spec: { ...item.spec, images: [path.join(dir, "a.png"), path.join(dir, "b.png")] },
  });

  await runOnce(store, client);

  assert.equal(store.usageFor().uploads, 2, "two images were accepted before the post failed");
  assert.equal(store.usageFor().posts, 0, "no post was created");
});
