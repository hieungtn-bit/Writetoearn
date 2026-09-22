import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { getStateDir, DAILY_POST_LIMIT, DAILY_UPLOAD_LIMIT } from "./config.mjs";

const STATE_VERSION = 1;

export const STATUS = {
  PENDING: "pending",
  /** Set immediately before /content/add and cleared right after. */
  PUBLISHING: "publishing",
  PUBLISHED: "published",
  FAILED: "failed",
  CANCELED: "canceled",
  /**
   * The process died between "about to publish" and "got an answer". We cannot
   * tell whether the post went live, so a human decides rather than risking a
   * duplicate.
   */
  NEEDS_REVIEW: "needs_review",
};

const TERMINAL = new Set([STATUS.PUBLISHED, STATUS.FAILED, STATUS.CANCELED]);

export function isTerminal(status) {
  return TERMINAL.has(status);
}

/** The UTC day key that quota is bucketed by; Binance resets on UTC midnight. */
export function utcDayKey(date = new Date()) {
  return date.toISOString().slice(0, 10);
}

export class Store {
  constructor({ dir = getStateDir() } = {}) {
    this.dir = dir;
    this.file = path.join(dir, "state.json");
    this.lockFile = path.join(dir, "worker.lock");
    this.state = null;
  }

  load() {
    if (this.state) return this.state;
    if (!fs.existsSync(this.file)) {
      this.state = { version: STATE_VERSION, items: [], usage: {}, claims: [], history: [] };
      return this.state;
    }
    const parsed = JSON.parse(fs.readFileSync(this.file, "utf8"));
    this.state = {
      version: parsed.version ?? STATE_VERSION,
      items: parsed.items ?? [],
      usage: parsed.usage ?? {},
      claims: parsed.claims ?? [],
      history: parsed.history ?? [],
    };
    return this.state;
  }

  /**
   * Records what a published post actually claimed, so it can be scored later.
   * The scoreboard is only possible if this starts collecting from day one.
   */
  /**
   * Records what a post committed to, once per post.
   *
   * Idempotent on `postId` because a published post has exactly one identity
   * and a track record with the same call in it twice is a track record that
   * double-counts. A re-record replaces the earlier row rather than appending —
   * a recovery run with a better publication timestamp should correct the
   * entry, not duplicate it.
   */
  recordClaim(claim) {
    const state = this.load();
    const row = { ...claim, recordedAt: new Date().toISOString(), score: null };
    const at = state.claims.findIndex((c) => String(c.postId) === String(claim.postId));
    if (at >= 0) state.claims[at] = { ...state.claims[at], ...row };
    else state.claims.push(row);
    this.save();
    return claim;
  }

  listClaims({ scored } = {}) {
    const claims = this.load().claims ?? [];
    if (scored === undefined) return claims;
    // Loose equality on purpose: a claim written by an older build, or by hand,
    // may carry no `score` key at all. Strict `=== null` treated that as
    // already-scored and the call fell out of the settlement queue silently —
    // the same class of quiet omission that left the whole board empty.
    return claims.filter((c) => (scored ? c.score != null : c.score == null));
  }

  /**
   * Records that something was published, for anti-repetition only.
   *
   * Kept separate from claims because the two have different eligibility: a
   * hand-written post belongs in the history the writer must not repeat, but
   * has no levels to score against and would otherwise sit in the scoreboard
   * as a call that can never be settled.
   */
  recordHistory(entry) {
    const state = this.load();
    state.history = state.history ?? [];
    state.history.push({ ...entry, publishedAt: entry.publishedAt ?? new Date().toISOString() });

    // Only the recent window is ever read; anything older is dead weight.
    const cutoff = Date.now() - 30 * 86_400_000;
    state.history = state.history.filter((h) => new Date(h.publishedAt).getTime() >= cutoff);
    this.save();
    return entry;
  }

  /**
   * What the channel has already said recently.
   *
   * Repetition is the quiet way an automated channel dies: four days of "BNB
   * leads the majors" and followers stop opening the posts. The writer needs to
   * see its own recent output to avoid restating it — including posts published
   * by hand, which is why this reads the history rather than the claims.
   */
  recentPosts(days = 4) {
    const cutoff = Date.now() - days * 86_400_000;
    return (this.load().history ?? [])
      .filter((h) => new Date(h.publishedAt).getTime() >= cutoff)
      .sort((a, b) => new Date(b.publishedAt) - new Date(a.publishedAt))
      .map((h) => ({
        publishedAt: h.publishedAt,
        format: h.format ?? null,
        asset: h.asset ?? null,
        bias: h.bias ?? null,
        angle: h.angle ?? null,
        hook: h.hook ?? null,
      }));
  }

  scoreClaim(postId, score) {
    const state = this.load();
    const claim = state.claims.find((c) => c.postId === postId);
    if (!claim) return null;
    claim.score = score;
    claim.scoredAt = new Date().toISOString();
    this.save();
    return claim;
  }

  /** Write through a temp file so a crash mid-write cannot truncate state. */
  save() {
    if (!this.state) return;
    fs.mkdirSync(this.dir, { recursive: true });
    const tmp = `${this.file}.${process.pid}.tmp`;
    fs.writeFileSync(tmp, `${JSON.stringify(this.state, null, 2)}\n`);
    fs.renameSync(tmp, this.file);
  }

  add(spec, { scheduledAt = new Date().toISOString(), note } = {}) {
    const state = this.load();
    const now = new Date().toISOString();
    const item = {
      id: crypto.randomUUID(),
      spec,
      note: note ?? null,
      scheduledAt,
      status: STATUS.PENDING,
      attempts: 0,
      nextAttemptAt: scheduledAt,
      lastError: null,
      result: null,
      createdAt: now,
      updatedAt: now,
    };
    state.items.push(item);
    this.save();
    return item;
  }

  get(id) {
    return this.load().items.find((i) => i.id === id || i.id.startsWith(id)) ?? null;
  }

  list({ status } = {}) {
    const items = this.load().items;
    return status ? items.filter((i) => i.status === status) : items;
  }

  update(id, patch) {
    const item = this.get(id);
    if (!item) throw new Error(`No queued post with id ${id}`);
    Object.assign(item, patch, { updatedAt: new Date().toISOString() });
    this.save();
    return item;
  }

  remove(id) {
    const state = this.load();
    const idx = state.items.findIndex((i) => i.id === id || i.id.startsWith(id));
    if (idx === -1) return null;
    const [removed] = state.items.splice(idx, 1);
    this.save();
    return removed;
  }

  /** Items whose scheduled time and backoff window have both elapsed. */
  due(now = new Date()) {
    return this.load()
      .items.filter((i) => i.status === STATUS.PENDING)
      .filter((i) => new Date(i.nextAttemptAt ?? i.scheduledAt) <= now)
      .sort((a, b) => new Date(a.scheduledAt) - new Date(b.scheduledAt));
  }

  /**
   * Any item left mid-publish by a crashed worker. Surfaced, never auto-retried.
   * @returns {number} how many were reclassified
   */
  reclaimStalePublishing() {
    const stuck = this.load().items.filter((i) => i.status === STATUS.PUBLISHING);
    for (const item of stuck) {
      item.status = STATUS.NEEDS_REVIEW;
      item.lastError =
        "Worker exited while publishing; the post may or may not be live. " +
        "Check your Square profile, then `wte queue resolve <id> --published|--retry`.";
      item.updatedAt = new Date().toISOString();
    }
    if (stuck.length) this.save();
    return stuck.length;
  }

  usageFor(day = utcDayKey()) {
    const usage = this.load().usage;
    return usage[day] ?? { posts: 0, uploads: 0 };
  }

  recordUsage({ posts = 0, uploads = 0 }, day = utcDayKey()) {
    const state = this.load();
    const current = state.usage[day] ?? { posts: 0, uploads: 0 };
    state.usage[day] = { posts: current.posts + posts, uploads: current.uploads + uploads };
    this.pruneUsage();
    this.save();
    return state.usage[day];
  }

  /** Usage buckets older than 30 days are dead weight. */
  pruneUsage() {
    const state = this.load();
    const cutoff = utcDayKey(new Date(Date.now() - 30 * 86_400_000));
    for (const day of Object.keys(state.usage)) {
      if (day < cutoff) delete state.usage[day];
    }
  }

  /**
   * Whether a post costing `uploads` uploads still fits inside today's budget.
   * @returns {{ok: boolean, reason?: string, remaining: {posts: number, uploads: number}}}
   */
  checkBudget(uploads = 0, day = utcDayKey()) {
    const used = this.usageFor(day);
    const remaining = {
      posts: DAILY_POST_LIMIT - used.posts,
      uploads: DAILY_UPLOAD_LIMIT - used.uploads,
    };
    if (remaining.posts <= 0) {
      return { ok: false, reason: `daily post limit reached (${DAILY_POST_LIMIT})`, remaining };
    }
    if (uploads > remaining.uploads) {
      return {
        ok: false,
        reason: `daily upload limit reached (${DAILY_UPLOAD_LIMIT}); ${remaining.uploads} left, post needs ${uploads}`,
        remaining,
      };
    }
    return { ok: true, remaining };
  }

  /** Cooperative lock so two workers cannot drain the same queue. */
  acquireLock() {
    fs.mkdirSync(this.dir, { recursive: true });
    try {
      fs.writeFileSync(this.lockFile, `${process.pid}\n`, { flag: "wx" });
      return true;
    } catch (err) {
      if (err.code !== "EEXIST") throw err;
      const pid = Number(fs.readFileSync(this.lockFile, "utf8").trim());
      if (pid && isAlive(pid)) return false;
      // Previous holder is gone; take over its lock.
      fs.writeFileSync(this.lockFile, `${process.pid}\n`);
      return true;
    }
  }

  releaseLock() {
    try {
      fs.unlinkSync(this.lockFile);
    } catch (err) {
      if (err.code !== "ENOENT") throw err;
    }
  }
}

function isAlive(pid) {
  try {
    process.kill(pid, 0);
    return true;
  } catch (err) {
    return err.code === "EPERM";
  }
}
