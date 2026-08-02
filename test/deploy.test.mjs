import { strict as assert } from "node:assert";
import { test } from "node:test";

import {
  apiUrl,
  createProductionDeploy,
  deployConfigFromEnv,
  readDeploy,
  waitForDeploy,
} from "../src/deploy.mjs";

const CONFIG = { token: "tok", project: "writetoearn", repoId: 42, teamId: null };

/** A fetch stand-in that returns the queued bodies and records the requests. */
function stubFetch(bodies) {
  const calls = [];
  const queue = [...bodies];
  const impl = async (url, init) => {
    calls.push({ url, init });
    return { json: async () => queue.shift() ?? {} };
  };
  impl.calls = calls;
  return impl;
}

test("no token means no deploy config, so publishing still finishes", () => {
  assert.equal(deployConfigFromEnv({}), null);
  assert.equal(deployConfigFromEnv({ VERCEL_TOKEN: "   " }), null);
});

test("config falls back to this repo's project but env wins", () => {
  const fallback = deployConfigFromEnv({ VERCEL_TOKEN: "tok" });
  assert.equal(fallback.project, "writetoearn");
  assert.equal(fallback.teamId, null);

  const explicit = deployConfigFromEnv({
    VERCEL_TOKEN: "tok",
    VERCEL_PROJECT_ID: "other",
    VERCEL_REPO_ID: "7",
    VERCEL_TEAM_ID: "team_1",
  });
  assert.equal(explicit.project, "other");
  assert.equal(explicit.repoId, 7);
  assert.equal(explicit.teamId, "team_1");
});

test("team scope is carried on the query string", () => {
  assert.equal(apiUrl("/v13/deployments", null), "https://api.vercel.com/v13/deployments");
  assert.equal(
    apiUrl("/v13/deployments", "team_1"),
    "https://api.vercel.com/v13/deployments?teamId=team_1",
  );
});

test("the request states production and pins the exact commit", async () => {
  const fetchImpl = stubFetch([{ id: "dpl_1", url: "x.vercel.app", readyState: "INITIALIZING" }]);
  const out = await createProductionDeploy(CONFIG, { ref: "feature", sha: "abc123" }, { fetchImpl });

  assert.equal(out.id, "dpl_1");
  const body = JSON.parse(fetchImpl.calls[0].init.body);
  assert.equal(body.target, "production");
  assert.equal(body.gitSource.ref, "feature");
  assert.equal(body.gitSource.sha, "abc123");
  assert.equal(body.gitSource.repoId, 42);
  assert.equal(fetchImpl.calls[0].init.headers.Authorization, "Bearer tok");
});

test("a ref or sha is required — deploying an unknown commit is worse than failing", async () => {
  const fetchImpl = stubFetch([]);
  await assert.rejects(() => createProductionDeploy(CONFIG, { sha: "abc" }, { fetchImpl }), /git ref/);
  await assert.rejects(() => createProductionDeploy(CONFIG, { ref: "main" }, { fetchImpl }), /commit sha/);
  assert.equal(fetchImpl.calls.length, 0);
});

test("an API error surfaces its message instead of a missing id", async () => {
  const fetchImpl = stubFetch([{ error: { code: "forbidden", message: "Not authorized" } }]);
  await assert.rejects(
    () => createProductionDeploy(CONFIG, { ref: "main", sha: "abc" }, { fetchImpl }),
    /Not authorized/,
  );
});

test("a response with neither error nor id is treated as a failure", async () => {
  const fetchImpl = stubFetch([{}]);
  await assert.rejects(
    () => createProductionDeploy(CONFIG, { ref: "main", sha: "abc" }, { fetchImpl }),
    /no deployment id/,
  );
});

test("polling stops at the first terminal state", async () => {
  const fetchImpl = stubFetch([
    { readyState: "BUILDING" },
    { readyState: "BUILDING" },
    { readyState: "READY", url: "live.vercel.app" },
    { readyState: "READY" },
  ]);
  const seen = [];
  const final = await waitForDeploy(CONFIG, "dpl_1", {
    fetchImpl,
    intervalMs: 0,
    sleep: async () => {},
    onState: (s) => seen.push(s.readyState),
  });

  assert.equal(final.readyState, "READY");
  assert.equal(fetchImpl.calls.length, 3, "should not poll past the terminal state");
  assert.deepEqual(seen, ["BUILDING", "READY"], "unchanged states are not re-announced");
});

test("a failed build is terminal too, and reported as itself", async () => {
  const fetchImpl = stubFetch([{ readyState: "ERROR" }]);
  const final = await waitForDeploy(CONFIG, "dpl_1", { fetchImpl, sleep: async () => {} });
  assert.equal(final.readyState, "ERROR");
});

test("a slow build times out rather than being called a failure", async () => {
  const fetchImpl = stubFetch(Array.from({ length: 50 }, () => ({ readyState: "BUILDING" })));
  let clock = 0;
  const final = await waitForDeploy(CONFIG, "dpl_1", {
    fetchImpl,
    intervalMs: 1000,
    timeoutMs: 3000,
    now: () => clock,
    sleep: async (ms) => {
      clock += ms;
    },
  });
  assert.equal(final.readyState, "TIMEOUT");
});

test("reading a deployment tolerates the status alias", async () => {
  const fetchImpl = stubFetch([{ status: "QUEUED" }]);
  const state = await readDeploy(CONFIG, "dpl_1", { fetchImpl });
  assert.equal(state.readyState, "QUEUED");
});
