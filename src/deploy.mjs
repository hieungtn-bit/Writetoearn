/**
 * Watching the deploy that a push already started.
 *
 * www.maix8.study is bound to this branch (`gitBranch` on the domain), so
 * pushing *is* deploying and nothing here needs to trigger anything. Creating a
 * second, production-target deployment — which an earlier version of this file
 * did — would build the same commit twice and produce a deployment the domain
 * does not even follow.
 *
 * What is worth having is confirmation. Publishing to Square and walking away
 * from a build that failed is how the live site fell days behind the feed, and
 * a failed build looks exactly like a successful one from the shell.
 */

import { ValidationError } from "./errors.mjs";

const API = "https://api.vercel.com";

/** Terminal deployment states, from Vercel's readyState enum. */
export const TERMINAL = new Set(["READY", "ERROR", "CANCELED"]);

/**
 * Reads deploy config from the environment.
 *
 * Returns null when no token is set, which is the normal case for a checkout
 * that only drafts posts — a missing token should skip the deploy, not fail
 * the publish. The post is already live at that point; refusing to finish
 * would be the worse outcome.
 */
export function deployConfigFromEnv(env = process.env) {
  const token = env.VERCEL_TOKEN?.trim();
  if (!token) return null;
  return {
    token,
    project: env.VERCEL_PROJECT_ID?.trim() || "writetoearn",
    repoId: Number(env.VERCEL_REPO_ID ?? 1318375380),
    teamId: env.VERCEL_TEAM_ID?.trim() || null,
  };
}

/** Adds ?teamId= when the project sits under a team scope. */
export function apiUrl(pathname, teamId) {
  return teamId ? `${API}${pathname}?teamId=${encodeURIComponent(teamId)}` : `${API}${pathname}`;
}

/**
 * Queues a build of one commit and returns the deployment.
 *
 * No `target` is sent, deliberately. The domain follows this *branch*, so a
 * branch-target build is the one that reaches the live site; asking for
 * `production` would build something the domain ignores.
 *
 * `sha` is passed explicitly rather than letting Vercel resolve the branch
 * head: between `git push` and this call the branch can move, and deploying
 * "whatever is on the branch now" would silently ship a different commit than
 * the one just published to Square.
 */
export async function createDeploy(config, { ref, sha }, { fetchImpl = fetch } = {}) {
  if (!ref) throw new ValidationError("A deploy needs a git ref.");
  if (!sha) throw new ValidationError("A deploy needs a commit sha.");

  const res = await fetchImpl(apiUrl("/v13/deployments", config.teamId), {
    method: "POST",
    headers: {
      Authorization: `Bearer ${config.token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      name: config.project,
      project: config.project,
      gitSource: { type: "github", repoId: config.repoId, ref, sha },
    }),
  });

  const body = await res.json();
  if (body.error) throw new ValidationError(`Vercel refused the deploy: ${body.error.message}`);
  if (!body.id) throw new ValidationError("Vercel accepted the request but returned no deployment id.");
  return { id: body.id, url: body.url ?? null, readyState: body.readyState ?? "QUEUED" };
}

/**
 * Finds the build Vercel started for a commit, or null if it has not appeared.
 *
 * The git webhook takes a few seconds, so "not found" early on means "not
 * yet", not "never" — the caller polls rather than concluding anything.
 */
export async function findDeployForCommit(config, sha, { fetchImpl = fetch, limit = 10 } = {}) {
  const scope = config.teamId ? `&teamId=${encodeURIComponent(config.teamId)}` : "";
  const res = await fetchImpl(
    `${API}/v6/deployments?projectId=${encodeURIComponent(config.project)}&limit=${limit}${scope}`,
    { headers: { Authorization: `Bearer ${config.token}` } },
  );
  const body = await res.json();
  if (body.error) throw new ValidationError(`Vercel: ${body.error.message}`);

  const match = (body.deployments ?? []).find((d) => d.meta?.githubCommitSha === sha);
  if (!match) return null;
  return { id: match.uid, readyState: match.state ?? match.readyState ?? "QUEUED", url: match.url ?? null };
}

/**
 * Waits for the push-triggered build of `sha` to finish.
 *
 * Two waits in one: for the webhook to produce a deployment at all, then for
 * that deployment to settle. A build that never appears is reported as
 * NOT_FOUND rather than as a failure — the likely cause is the git integration,
 * not the commit, and saying "deploy failed" would send someone to the wrong
 * place.
 */
export async function waitForCommitDeploy(
  config,
  sha,
  { fetchImpl = fetch, intervalMs = 5000, timeoutMs = 300000, sleep = defaultSleep, now = Date.now, onState } = {},
) {
  const deadline = now() + timeoutMs;
  let found = null;

  while (now() < deadline) {
    found = await findDeployForCommit(config, sha, { fetchImpl });
    if (found) break;
    await sleep(intervalMs);
  }
  if (!found) return { id: null, readyState: "NOT_FOUND", url: null };

  if (TERMINAL.has(found.readyState)) {
    onState?.(found);
    return found;
  }
  return waitForDeploy(config, found.id, {
    fetchImpl,
    intervalMs,
    timeoutMs: Math.max(0, deadline - now()),
    sleep,
    now,
    onState,
  });
}

/** Current state of a deployment. */
export async function readDeploy(config, id, { fetchImpl = fetch } = {}) {
  const res = await fetchImpl(apiUrl(`/v13/deployments/${id}`, config.teamId), {
    headers: { Authorization: `Bearer ${config.token}` },
  });
  const body = await res.json();
  if (body.error) throw new ValidationError(`Vercel: ${body.error.message}`);
  return { id, readyState: body.readyState ?? body.status ?? "QUEUED", url: body.url ?? null };
}

/**
 * Polls until the build finishes.
 *
 * A build that is still running when the budget expires is reported as such
 * rather than as a failure: the deploy usually completes a few seconds later,
 * and calling it an error would send someone to the dashboard for nothing.
 */
export async function waitForDeploy(
  config,
  id,
  { fetchImpl = fetch, intervalMs = 5000, timeoutMs = 300000, sleep = defaultSleep, now = Date.now, onState } = {},
) {
  const deadline = now() + timeoutMs;
  let last = null;
  while (now() < deadline) {
    const state = await readDeploy(config, id, { fetchImpl });
    if (state.readyState !== last) {
      last = state.readyState;
      onState?.(state);
    }
    if (TERMINAL.has(state.readyState)) return state;
    await sleep(intervalMs);
  }
  return { id, readyState: "TIMEOUT", url: null };
}

function defaultSleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
