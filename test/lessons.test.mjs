import test from "node:test";
import assert from "node:assert/strict";
import { LESSONS, buildLessons, lessonSymbols, windowStats } from "../src/lessons.mjs";
import { barChart, distributionChart, formatTick, lineChart, ticks } from "../src/charts.mjs";

/** Deterministic candles: a flat stretch, then a rally on rising volume. */
function candles(n, { close = 100, quoteVolume = 1_000_000 } = {}) {
  return Array.from({ length: n }, (_, i) => ({
    openTime: Date.UTC(2026, 0, 1) + i * 86400000,
    high: close * 1.01,
    low: close * 0.99,
    close,
    quoteVolume,
  }));
}

const series = (n = 400) => candles(n).map((k, i) => ({ ...k, openTime: Date.UTC(2025, 0, 1) + i * 86400000 }));

test("windowStats measures VWAP, underwater share and volume trend together", () => {
  const c = [...candles(27, { close: 100, quoteVolume: 100 }), ...candles(3, { close: 200, quoteVolume: 900 })];
  const s = windowStats(c, 30);

  assert.equal(s.price, 200);
  assert.ok(s.vwap > 100 && s.vwap < 200, `vwap ${s.vwap}`);
  assert.equal(s.underwaterPct, 0, "nothing traded above the current price");
  assert.ok(s.volumeTrendPct > 0, "volume expanded into the move");
  // 3 days x 900 against 27 days x 100 is exactly half the month's turnover.
  assert.ok(s.concentrationPct >= 50, `three days carried half the turnover, got ${s.concentrationPct}`);
});

test("underwater share counts turnover done above the current price", () => {
  const c = [...candles(15, { close: 200, quoteVolume: 100 }), ...candles(15, { close: 50, quoteVolume: 100 })];
  const s = windowStats(c, 30);
  assert.ok(s.underwaterPct > 49 && s.underwaterPct < 51, `got ${s.underwaterPct}`);
  assert.ok(s.vsVwapPct < 0);
});

test("every lesson declares the pieces a practical lesson needs", () => {
  for (const l of LESSONS) {
    assert.ok(l.slug && /^[a-z0-9-]+$/.test(l.slug), `bad slug: ${l.slug}`);
    assert.ok(l.title?.length > 10, l.slug);
    assert.ok(l.question?.includes("?"), `${l.slug} should pose a question`);
    assert.ok(l.concept?.length > 100, `${l.slug} concept too thin`);
    assert.ok(Array.isArray(l.formula) && l.formula.length, `${l.slug} needs a formula`);
    assert.ok(l.mistake?.length > 30, `${l.slug} needs a common mistake`);
    assert.ok(l.symbols?.length, `${l.slug} needs data`);
  }
});

test("lesson slugs are unique", () => {
  const slugs = LESSONS.map((l) => l.slug);
  assert.equal(new Set(slugs).size, slugs.length);
});

test("lessonSymbols de-duplicates so each pair is fetched once", () => {
  const syms = lessonSymbols();
  assert.equal(new Set(syms).size, syms.length);
  assert.ok(syms.includes("XRPUSDT"));
});

test("buildLessons produces a worked example with readings, verdict and a chart", () => {
  const data = Object.fromEntries(lessonSymbols().map((s) => [s, series()]));
  const built = buildLessons(data);

  assert.equal(built.length, LESSONS.length);
  for (const l of built) {
    assert.ok(l.example.readings.length >= 3, `${l.slug} needs readings`);
    assert.ok(l.example.verdict.length > 40, `${l.slug} needs a verdict`);
    assert.ok(l.example.charts.length >= 1, `${l.slug} needs a chart`);
    assert.match(l.example.charts[0], /<svg /);
  }
});

test("a lesson missing its data fails loudly rather than rendering blanks", () => {
  assert.throws(() => buildLessons({}), /needs candles/);
});

test("charts scale with the viewport instead of using fixed pixel sizes", () => {
  const svg = lineChart([1, 2, 3, 4], { title: "t" });
  assert.match(svg, /viewBox="0 0 \d+ \d+"/);
  assert.doesNotMatch(svg, /<svg[^>]*width="\d+"/, "a fixed width would break on mobile");
});

test("charts refuse empty input rather than drawing nothing", () => {
  assert.throws(() => lineChart([], { title: "t" }), /needs values/);
  assert.throws(() => barChart([], { title: "t" }), /needs bars/);
  assert.throws(() => distributionChart([], 1, { title: "t" }), /needs values/);
});

test("a reference level is drawn and labelled on the price chart", () => {
  const svg = lineChart([10, 12, 11], { title: "t", levels: [{ value: 11, label: "VWAP 11" }] });
  assert.match(svg, /VWAP 11/);
  assert.match(svg, /stroke-dasharray/);
});

test("the highlighted bar is coloured differently from the rest", () => {
  const svg = barChart(
    [{ label: "a", value: 1 }, { label: "b", value: 5, highlight: true }],
    { title: "t" },
  );
  assert.match(svg, /#f0b90b/, "highlight colour");
  assert.match(svg, /#2f6f5a/, "base colour");
});

test("the distribution chart marks where today sits", () => {
  const svg = distributionChart([1, 2, 3, 4, 5], 4.5, { title: "t", label: "now" });
  assert.match(svg, /#f6465d/, "the marker should stand out");
  assert.match(svg, />now</);
});

test("chart titles and labels are escaped", () => {
  const svg = lineChart([1, 2], { title: '<script>alert(1)</script>' });
  assert.doesNotMatch(svg, /<script>/);
  assert.match(svg, /&lt;script&gt;/);
});

test("tick helpers stay readable across magnitudes", () => {
  assert.equal(ticks(0, 0, 4).length, 1, "a flat range should not divide by zero");
  assert.equal(formatTick(12345), "12k");
  assert.equal(formatTick(1.5), "1.50");
  assert.equal(formatTick(0.00123), "0.0012");
});
