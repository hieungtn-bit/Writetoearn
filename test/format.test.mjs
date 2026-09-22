import test from "node:test";
import assert from "node:assert/strict";
import { count, fixed, pct, price, row, table, usd } from "../src/format.mjs";

test("pct gives small values the decimals they need to survive the gate", () => {
  // The bug this module exists for: 3.56 printed as "3.6" is a 1.1% error and
  // the verifier rejected two finished drafts over it.
  assert.equal(pct(3.56), "3.56");
  assert.equal(pct(6.25), "6.25");
  // Large values stay readable — one decimal is well inside tolerance there.
  assert.equal(pct(92.5), "92.5");
  assert.equal(pct(-58.04), "-58.0");
});

test("every pct output rounds to within the verifier's tolerance", () => {
  const TOLERANCE = 0.005;
  for (const v of [0.0, 0.004, 0.5, 1, 3.56, 6.25, 9.99, 10.1, 47.3, 92.5, 1234.5]) {
    const printed = Number(pct(v));
    const scale = Math.max(Math.abs(v), Math.abs(printed), 1);
    assert.ok(
      Math.abs(printed - v) / scale <= TOLERANCE,
      `${v} printed as ${pct(v)} is outside tolerance`,
    );
  }
});

test("price keeps enough digits for sub-cent assets", () => {
  assert.equal(price(64_006.4), "64006");
  assert.equal(price(604.87), "604.87");
  assert.equal(price(2.357), "2.357");
  assert.equal(price(0.0886), "0.0886");
  assert.equal(price(0.00249), "0.002490");
});

test("non-numbers do not silently become zero", () => {
  for (const bad of [null, undefined, NaN, "abc"]) {
    assert.equal(pct(bad), "n/a");
    assert.equal(price(bad), "n/a");
    assert.equal(count(bad), "n/a");
    assert.equal(usd(bad), "n/a");
    assert.equal(fixed(bad, 2), "n/a");
  }
});

test("usd scales to the unit a reader thinks in", () => {
  assert.equal(usd(1.31e9), "$1.31B");
  assert.equal(usd(9.8e6), "$9.80M");
  assert.equal(usd(103_000), "$103k");
  assert.equal(usd(168), "$168");
});

test("count uses the grouping the verifier parses", () => {
  // English grouping, because "." is a thousands separator in Vietnamese and
  // would collide with the decimals every figure already carries.
  assert.equal(count(43_088), "43,088");
  assert.equal(count(970.4), "970");
});

test("row aligns live values and leaves no ragged tail", () => {
  const line = row(["ICP", "92.4%", ""], [-8, 10, 10]);
  assert.equal(line, "ICP          92.4%");
  assert.ok(!/\s$/.test(line), "trailing padding must be trimmed");
});

test("table shares one set of widths across every row", () => {
  const out = table(
    [["", "trúng", "kỳ vọng"], ["ICP", "27.4%", "+0.16R"]],
    [-8, 9, 9],
  );
  const [head, body] = out.split("\n");
  assert.equal(head.indexOf("trúng") + "trúng".length, body.indexOf("27.4%") + "27.4%".length);
});
