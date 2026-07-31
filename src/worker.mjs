import { STATUS, Store, utcDayKey } from "./store.mjs";
import { publishSpec } from "./publisher.mjs";
import { uploadCount } from "./post.mjs";
import { FAILURE_KIND } from "./errors.mjs";
import { sleep } from "./client.mjs";

/** Backoff schedule for transient failures; the last entry caps the wait. */
const BACKOFF_MS = [60_000, 5 * 60_000, 15 * 60_000, 60 * 60_000];
export const MAX_ATTEMPTS = BACKOFF_MS.length;

/** Why a run stopped early, if it did. */
export const STOP_REASON = {
  QUOTA: "quota",
  AUTH: "auth",
};

function backoffFor(attempts) {
  return BACKOFF_MS[Math.min(attempts, BACKOFF_MS.length - 1)];
}

function nextUtcMidnight(now = new Date()) {
  const next = new Date(now);
  next.setUTCHours(24, 0, 0, 0);
  return next;
}

/**
 * Drains everything currently due, then returns. This is the unit a cron job
 * should call.
 *
 * @returns {Promise<{published: number, failed: number, retrying: number,
 *   skipped: number, stopReason: string|null, reviewed: number}>}
 */
export async function runOnce(
  store,
  client,
  { dryRun = false, now = () => new Date(), log = () => {} } = {},
) {
  const summary = {
    published: 0,
    failed: 0,
    retrying: 0,
    skipped: 0,
    reviewed: store.reclaimStalePublishing(),
    stopReason: null,
  };

  if (summary.reviewed) {
    log(
      `${summary.reviewed} post(s) were interrupted mid-publish and need review ` +
        `(\`wte queue list --status needs_review\`)`,
    );
  }

  for (const item of store.due(now())) {
    const cost = uploadCount(item.spec);
    const budget = store.checkBudget(cost);

    if (!budget.ok) {
      // Nothing else today will fit either; park the queue until UTC rollover.
      const resumeAt = nextUtcMidnight(now()).toISOString();
      store.update(item.id, { nextAttemptAt: resumeAt, lastError: budget.reason });
      log(`Paused: ${budget.reason}. Resuming after ${resumeAt}.`);
      summary.stopReason = STOP_REASON.QUOTA;
      summary.skipped++;
      break;
    }

    log(`Publishing ${item.id.slice(0, 8)} (${item.spec.type})`);

    try {
      const outcome = await publishSpec(client, item.spec, {
        dryRun,
        onProgress: (msg) => log(`  ${msg}`),
        onBeforePublish: () => {
          if (!dryRun) store.update(item.id, { status: STATUS.PUBLISHING });
        },
      });

      if (dryRun) {
        log(`  dry run, not sent: ${JSON.stringify(outcome.body)}`);
        summary.skipped++;
        continue;
      }

      store.recordUsage({ posts: 1, uploads: outcome.uploadsUsed });
      store.update(item.id, {
        status: STATUS.PUBLISHED,
        attempts: item.attempts + 1,
        lastError: null,
        result: {
          id: outcome.result?.id ?? null,
          shareLink: outcome.result?.shareLink ?? null,
          missingPostId: Boolean(outcome.missingPostId),
          publishedAt: new Date().toISOString(),
        },
      });

      summary.published++;
      log(
        outcome.missingPostId
          ? "  published, but the gateway timed out before returning a link"
          : `  published: ${outcome.result?.shareLink ?? "(no link returned)"}`,
      );
    } catch (err) {
      const kind = err.kind ?? FAILURE_KIND.TRANSIENT;
      const attempts = item.attempts + 1;

      if (err.uploadsUsed) store.recordUsage({ posts: 0, uploads: err.uploadsUsed });

      if (kind === FAILURE_KIND.AUTH) {
        store.update(item.id, { status: STATUS.PENDING, attempts, lastError: err.message });
        log(`  auth failure: ${err.message}`);
        summary.stopReason = STOP_REASON.AUTH;
        break;
      }

      if (kind === FAILURE_KIND.QUOTA) {
        const resumeAt = nextUtcMidnight(now()).toISOString();
        // The server knows better than our local counter — trust it and stop.
        store.update(item.id, {
          status: STATUS.PENDING,
          attempts,
          nextAttemptAt: resumeAt,
          lastError: err.message,
        });
        log(`  quota exhausted server-side: ${err.message}`);
        summary.stopReason = STOP_REASON.QUOTA;
        break;
      }

      if (kind === FAILURE_KIND.TRANSIENT && attempts < MAX_ATTEMPTS) {
        const delay = backoffFor(attempts);
        store.update(item.id, {
          status: STATUS.PENDING,
          attempts,
          nextAttemptAt: new Date(now().getTime() + delay).toISOString(),
          lastError: err.message,
        });
        log(`  transient failure, retry ${attempts}/${MAX_ATTEMPTS} in ${Math.round(delay / 1000)}s: ${err.message}`);
        summary.retrying++;
        continue;
      }

      store.update(item.id, { status: STATUS.FAILED, attempts, lastError: err.message });
      log(`  failed permanently: ${err.message}`);
      summary.failed++;
    }
  }

  return summary;
}

/**
 * Long-running worker. Polls for due items, and stands down cleanly when the
 * key is bad — a wrong key will not fix itself by waiting.
 */
export async function runLoop(
  store,
  client,
  { intervalMs = 60_000, dryRun = false, log = () => {}, signal, sleepImpl = sleep } = {},
) {
  log(`Worker started; polling every ${Math.round(intervalMs / 1000)}s. Ctrl-C to stop.`);

  while (!signal?.aborted) {
    const summary = await runOnce(store, client, { dryRun, log });

    if (summary.stopReason === STOP_REASON.AUTH) {
      log("Stopping: the API key was rejected. Fix it and restart the worker.");
      return summary;
    }

    const pending = store.list({ status: STATUS.PENDING }).length;
    if (summary.published || summary.failed) {
      log(`Cycle done: +${summary.published} published, ${pending} still queued.`);
    }

    await sleepImpl(intervalMs);
  }

  log("Worker stopped.");
  return null;
}

export { Store, utcDayKey };
