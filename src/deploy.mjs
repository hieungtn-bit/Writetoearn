/**
 * Explicit production deploys.
 *
 * Vercel decides a deployment's target from the project's *production branch*,
 * which mirrors the GitHub default branch and is only overridable in the
 * dashboard — not through the public API. This repo's work lives on a feature
 * branch, so every push built a Preview and maix8.study kept serving a build
 * from days earlier while `wte ship` reported success. The push was real; the
 * inference that a push means production was not.
 *
 * So the deploy stops being a side effect of pushing and becomes something the
 * ship command asks for by name, with the target stated in the request.
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
 * Queues a production build of one commit and returns the deployment.
 *
 * `sha` is passed explicitly rather than letting Vercel resolve the branch
 * head: between `git push` and this call the branch can move, and deploying
 * "whatever is on the branch now" would silently ship a different commit than
 * the one just published to Square.
 */
export async function createProductionDeploy(config, { ref, sha }, { fetchImpl = fetch } = {}) {
  if (!ref) throw new ValidationError("A production deploy needs a git ref.");
  if (!sha) throw new ValidationError("A production deploy needs a commit sha.");

  const res = await fetchImpl(apiUrl("/v13/deployments", config.teamId), {
    method: "POST",
    headers: {
      Authorization: `Bearer ${config.token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      name: config.project,
      project: config.project,
      target: "production",
      gitSource: { type: "github", repoId: config.repoId, ref, sha },
    }),
  });

  const body = await res.json();
  if (body.error) throw new ValidationError(`Vercel refused the deploy: ${body.error.message}`);
  if (!body.id) throw new ValidationError("Vercel accepted the request but returned no deployment id.");
  return { id: body.id, url: body.url ?? null, readyState: body.readyState ?? "QUEUED" };
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
