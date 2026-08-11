import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { formatDoctor, runDoctor } from "../src/doctor.mjs";
import { Store } from "../src/store.mjs";

const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), "wte-doctor-"));

test("the self-check runs and reports every wiring question", async () => {
  const report = await runDoctor({ root: tmp(), store: new Store({ dir: tmp() }) });
  assert.ok(report.checks.length >= 6, "every check should report a row");
  for (const c of report.checks) {
    assert.ok(["ok", "warn", "fail"].includes(c.status), `${c.name} has status ${c.status}`);
    assert.ok(c.name, "a check without a name cannot be acted on");
  }
});

test("the scoreboard check proves a call can be marked wrong", async () => {
  // The check exists because a scoreboard that can only pass looks identical to
  // one that is working. If this row ever goes green while the rule is broken,
  // the check itself is broken.
  const { checks } = await runDoctor({ root: tmp(), store: new Store({ dir: tmp() }) });
  const row = checks.find((c) => c.name === "scoreboard can fail a call");
  assert.ok(row, "the check must be present");
  assert.equal(row.status, "ok");
  assert.match(row.detail, /scores as a miss/);
});

test("a missing manifest warns rather than throwing", async () => {
  // The doctor is what you run when something is already wrong. It has to
  // survive a half-built working directory.
  const report = await runDoctor({ root: tmp(), store: new Store({ dir: tmp() }) });
  assert.notEqual(report.worst, "fail");
});

test("an article that made a call and never entered the board is flagged", async () => {
  const root = tmp();
  fs.mkdirSync(path.join(root, "site"), { recursive: true });
  fs.mkdirSync(path.join(root, "drafts"), { recursive: true });
  fs.writeFileSync(
    path.join(root, "drafts", "1-called.txt"),
    "Quan điểm: CHỜ. Không phải lời khuyên đầu tư. Bạn nghĩ sao?",
  );
  fs.writeFileSync(
    path.join(root, "site", "manifest.json"),
    JSON.stringify({ articles: [{ slug: "called", draft: "1-called.txt", squareId: "999" }] }),
  );

  const { checks } = await runDoctor({ root, store: new Store({ dir: tmp() }) });
  const row = checks.find((c) => c.name === "published articles are all logged");
  assert.equal(row.status, "warn");
  assert.match(row.detail, /made a call and never entered the board/);
});

test("an article that states no bias is not counted as a gap", async () => {
  const root = tmp();
  fs.mkdirSync(path.join(root, "site"), { recursive: true });
  fs.mkdirSync(path.join(root, "drafts"), { recursive: true });
  fs.writeFileSync(
    path.join(root, "drafts", "2-no-call.txt"),
    "Bài này chỉ là một phép trừ. Không phải lời khuyên đầu tư. Bạn đã trừ phí chưa?",
  );
  fs.writeFileSync(
    path.join(root, "site", "manifest.json"),
    JSON.stringify({ articles: [{ slug: "no-call", draft: "2-no-call.txt", squareId: "998" }] }),
  );

  const { checks } = await runDoctor({ root, store: new Store({ dir: tmp() }) });
  const row = checks.find((c) => c.name === "published articles are all logged");
  assert.equal(row.status, "ok", row.detail);
  assert.match(row.detail, /correctly unlogged/);
});

test("the report reads as a verdict, not a list", () => {
  const text = formatDoctor({
    checks: [{ name: "a thing", status: "fail", detail: "broke" }],
    worst: "fail",
  });
  assert.match(text, /Do not publish/);
});
