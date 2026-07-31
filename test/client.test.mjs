import test from "node:test";
import assert from "node:assert/strict";
import { PUBLISH_STATUS_NO_ID, SquareClient } from "../src/client.mjs";
import { FAILURE_KIND } from "../src/errors.mjs";
import { API_KEY_HEADER } from "../src/config.mjs";

function stubFetch(responses) {
  const calls = [];
  const queue = [...responses];
  const fetchImpl = async (url, options) => {
    calls.push({ url, options });
    const next = queue.shift();
    if (!next) throw new Error(`Unexpected request to ${url}`);
    return {
      status: next.status ?? 200,
      statusText: next.statusText ?? "OK",
      ok: (next.status ?? 200) < 400,
      text: async () => (typeof next.body === "string" ? next.body : JSON.stringify(next.body)),
    };
  };
  return { fetchImpl, calls };
}

const ok = (data) => ({ body: { code: "000000", data } });

test("the API key travels in the header, never the body or query", async () => {
  const { fetchImpl, calls } = stubFetch([ok({ id: "1" })]);
  const client = new SquareClient({ apiKey: "secret-key", fetchImpl });

  await client.publish({ contentType: 1, bodyTextOnly: "hi" });

  const [call] = calls;
  assert.equal(call.options.headers[API_KEY_HEADER], "secret-key");
  assert.ok(!call.url.includes("secret-key"));
  assert.ok(!call.options.body.includes("secret-key"));
});

test("/content/add is served from the v1 host while media uses v2", async () => {
  const { fetchImpl, calls } = stubFetch([ok({ id: "1" }), ok({ presignedUrl: "u", fileTicket: "t" })]);
  const client = new SquareClient({ apiKey: "k", fetchImpl });

  await client.publish({ contentType: 1 });
  await client.request("/image/presignedUrl", { imageName: "a.png" });

  assert.match(calls[0].url, /\/composite\/v1\/.*\/content\/add$/);
  assert.match(calls[1].url, /\/composite\/v2\/.*\/image\/presignedUrl$/);
});

test("a 504 from /content/add reports success without an id, not an error", async () => {
  const { fetchImpl } = stubFetch([{ status: 504, statusText: "Gateway Timeout", body: "<html>" }]);
  const client = new SquareClient({ apiKey: "k", fetchImpl });

  const result = await client.publish({ contentType: 1, bodyTextOnly: "hi" });

  assert.equal(result.publishStatus, PUBLISH_STATUS_NO_ID);
  assert.equal(result.id, null);
});

test("a 504 anywhere else is still a failure", async () => {
  const { fetchImpl } = stubFetch([{ status: 504, statusText: "Gateway Timeout", body: "<html>" }]);
  const client = new SquareClient({ apiKey: "k", fetchImpl });

  await assert.rejects(() => client.request("/image/imageStatus", { fileTicket: "t" }), /Non-JSON/);
});

test("a non-zero business code is surfaced with its code and classification", async () => {
  const { fetchImpl } = stubFetch([{ body: { code: "220009", message: "daily limit" } }]);
  const client = new SquareClient({ apiKey: "k", fetchImpl });

  await assert.rejects(
    () => client.publish({ contentType: 1 }),
    (err) => {
      assert.equal(err.code, "220009");
      assert.equal(err.kind, FAILURE_KIND.QUOTA);
      return true;
    },
  );
});

test("media polling waits for status 1 and gives up on status 2", async () => {
  const { fetchImpl } = stubFetch([ok({ status: 0 }), ok({ status: 1, imageUrl: "https://cdn/a.png" })]);
  const client = new SquareClient({ apiKey: "k", fetchImpl, sleepImpl: async () => {} });

  const status = await client.pollMediaStatus("ticket");
  assert.equal(status.imageUrl, "https://cdn/a.png");

  const failing = stubFetch([ok({ status: 2, failedReason: "too large" })]);
  const client2 = new SquareClient({ apiKey: "k", fetchImpl: failing.fetchImpl, sleepImpl: async () => {} });
  await assert.rejects(() => client2.pollMediaStatus("ticket"), /too large/);
});

test("a network throw is classified transient so the caller may retry", async () => {
  const fetchImpl = async () => {
    throw new Error("ECONNRESET");
  };
  const client = new SquareClient({ apiKey: "k", fetchImpl });

  await assert.rejects(
    () => client.request("/image/imageStatus", {}),
    (err) => {
      assert.equal(err.kind, FAILURE_KIND.TRANSIENT);
      return true;
    },
  );
});
