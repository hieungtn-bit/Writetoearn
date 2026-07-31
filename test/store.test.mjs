import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { STATUS, Store, utcDayKey } from "../src/store.mjs";
import { DAILY_POST_LIMIT, DAILY_UPLOAD_LIMIT } from "../src/config.mjs";
import { parseDuration, parseFlags } from "../src/cli.mjs";
import { classify, FAILURE_KIND } from "../src/errors.mjs";

function freshStore(t) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "wte-store-"));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  return new Store({ dir });
}

test("state survives a reload", async (t) => {
  const store = freshStore(t);
  const item = store.add({ type: "text", text: "hi" }, { note: "launch" });

  const reopened = new Store({ dir: store.dir });
  const loaded = reopened.get(item.id);
  assert.equal(loaded.note, "launch");
  assert.equal(loaded.status, STATUS.PENDING);
});

test("items can be addressed by an id prefix", async (t) => {
  const store = freshStore(t);
  const item = store.add({ type: "text", text: "hi" });
  assert.equal(store.get(item.id.slice(0, 8))?.id, item.id);
});

test("due() respects both the schedule and the backoff window", async (t) => {
  const store = freshStore(t);
  const past = store.add({ type: "text", text: "a" }, { scheduledAt: "2020-01-01T00:00:00Z" });
  store.add({ type: "text", text: "b" }, { scheduledAt: "2999-01-01T00:00:00Z" });

  assert.deepEqual(store.due().map((i) => i.id), [past.id]);

  store.update(past.id, { nextAttemptAt: "2999-01-01T00:00:00Z" });
  assert.equal(store.due().length, 0);
});

test("published items are never due again", async (t) => {
  const store = freshStore(t);
  const item = store.add({ type: "text", text: "a" }, { scheduledAt: "2020-01-01T00:00:00Z" });
  store.update(item.id, { status: STATUS.PUBLISHED });
  assert.equal(store.due().length, 0);
});

test("the budget refuses a post that would exceed either daily ceiling", async (t) => {
  const store = freshStore(t);
  assert.equal(store.checkBudget(4).ok, true);

  store.recordUsage({ posts: DAILY_POST_LIMIT });
  assert.match(store.checkBudget(0).reason, /daily post limit/);

  const other = freshStore(t);
  other.recordUsage({ uploads: DAILY_UPLOAD_LIMIT - 1 });
  assert.equal(other.checkBudget(1).ok, true);
  assert.match(other.checkBudget(2).reason, /daily upload limit/);
});

test("usage is bucketed per UTC day", async (t) => {
  const store = freshStore(t);
  store.recordUsage({ posts: 3 }, "2026-07-30");
  store.recordUsage({ posts: 1 }, "2026-07-31");

  assert.equal(store.usageFor("2026-07-30").posts, 3);
  assert.equal(store.usageFor("2026-07-31").posts, 1);
  assert.equal(store.usageFor("2026-08-01").posts, 0);
});

test("usage buckets older than 30 days are pruned", async (t) => {
  const store = freshStore(t);
  store.recordUsage({ posts: 1 }, "2020-01-01");
  store.recordUsage({ posts: 1 });
  assert.equal(store.load().usage["2020-01-01"], undefined);
  assert.equal(store.usageFor(utcDayKey()).posts, 1);
});

test("the worker lock excludes a second live worker but not a dead one", async (t) => {
  const store = freshStore(t);
  assert.equal(store.acquireLock(), true);

  const rival = new Store({ dir: store.dir });
  assert.equal(rival.acquireLock(), false, "a live holder blocks the lock");

  fs.writeFileSync(path.join(store.dir, "worker.lock"), "999999\n");
  assert.equal(rival.acquireLock(), true, "a stale lock from a dead pid is reclaimed");
  rival.releaseLock();
});

test("duration strings parse into milliseconds", () => {
  assert.equal(parseDuration("30s"), 30_000);
  assert.equal(parseDuration("45m"), 2_700_000);
  assert.equal(parseDuration("2h"), 7_200_000);
  assert.equal(parseDuration("3d"), 259_200_000);
  assert.throws(() => parseDuration("soon"), /Could not parse duration/);
});

test("flags parse into values and booleans", () => {
  const flags = parseFlags(["queue", "add", "text", "--text", "hi there", "--dry-run"]);
  assert.deepEqual(flags._, ["queue", "add", "text"]);
  assert.equal(flags.text, "hi there");
  assert.equal(flags["dry-run"], true);
});

test("unknown business codes are treated as permanent, not retried forever", () => {
  assert.equal(classify({ code: "999999" }), FAILURE_KIND.CONTENT);
  assert.equal(classify({ httpStatus: 500 }), FAILURE_KIND.TRANSIENT);
  assert.equal(classify({ httpStatus: 401 }), FAILURE_KIND.AUTH);
  assert.equal(classify({}), FAILURE_KIND.TRANSIENT);
});
