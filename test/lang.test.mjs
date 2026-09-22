import test from "node:test";
import assert from "node:assert/strict";
import { isEnglish, nonEnglishLines, verifyEnglish } from "../src/lang.mjs";

test("plain English passes", () => {
  assert.ok(isEnglish("Both directions lose over the recent window. Bias: WAIT."));
  assert.ok(isEnglish(""));
  assert.ok(isEnglish(null));
});

test("Vietnamese prose is caught", () => {
  assert.ok(!isEnglish("Quan điểm: short chọn lọc."));
  assert.ok(!isEnglish("Bảng tín hiệu"));
  assert.ok(!isEnglish("mẫu mỏng"));
  assert.ok(!isEnglish("Đứng ngoài là một kết luận"));
});

test("accented words English actually uses are not flagged", () => {
  // The first version of this checker matched every accented Latin vowel and
  // would have failed on a cited author and on ordinary loanwords.
  for (const s of [
    "Viénot–Brettel–Mollon (1999)",
    "a café in Zürich",
    "naïve",
    "Erdős",
    "São Paulo",
    "piñata",
    "résumé",
    "Poincaré",
  ]) {
    assert.ok(isEnglish(s), `${s} must not be flagged`);
  }
});

test("the report names the line so a human can go fix it", () => {
  const hits = nonEnglishLines("all fine here\nQuan điểm: CHỜ.\nfine again\nkỳ vọng");
  assert.equal(hits.length, 2);
  assert.equal(hits[0].line, 2);
  assert.equal(hits[1].line, 4);
  assert.equal(hits[0].text, "Quan điểm: CHỜ.");
});

test("the gate reports how much is wrong, not just that something is", () => {
  const one = verifyEnglish("hello\nmẫu mỏng");
  assert.equal(one.ok, false);
  assert.equal(one.problems.length, 1);
  assert.ok(one.problems[0].includes("line 2"));
  assert.ok(!one.problems[0].includes("and"), "a single bad line needs no tally");

  const many = verifyEnglish("mẫu mỏng\nkỳ vọng\nđổi chế độ");
  assert.ok(many.problems[0].includes("and 2 more lines"));

  assert.deepEqual(verifyEnglish("all English here").problems, []);
});
