import test from "node:test";
import assert from "node:assert/strict";
import { renderSignalsPage, slimSnapshot } from "../src/site.mjs";
import { nonEnglishLines } from "../src/lang.mjs";

const site = {
  name: "MAIX8 Research",
  tagline: "Evidence Over Emotion.",
  baseUrl: "https://maix8.study",
  locale: "en",
};

const snapshot = {
  scannedAt: "2026-08-11T08:31:00.000Z",
  method: { recentWindowDays: 180 },
  tally: { total: 3, LONG: 1, SHORT: 1, WAIT: 1, turning: 1, untradeable: 1 },
  signals: [
    {
      asset: "ICP", symbol: "ICPUSDT", price: 2.314, bias: "LONG", tradeable: true,
      reason: "long pays in 54 of 64 geometries",
      regime: { turning: true }, confidence: { thin: true, effectiveN: 5 },
      context: { stage: "2 expansion", underwaterPct: 4.9, volumeTrendPct: 112.3 },
      // The audit trail the page must not ship to a phone.
      grid: Array.from({ length: 64 }, (_, i) => ({
        stopAtrs: 1 + (i % 4), rr: 1 + (i % 4), horizonDays: 30,
        hitPct: 40 + i, stopPct: 7, expectancyR: 0.1, n: 30, effectiveN: 5,
      })),
      plan: {
        direction: "long", horizonDays: 30, stopPct: 7.88, targetPct: 15.75, rr: 2,
        hitPct: 47.3, expectancyR: 0.47, effectiveN: 5,
        entry: 2.314, stop: 2.132, target: 2.679, positionUsdPer1000: 127,
      },
    },
    {
      asset: "SUI", symbol: "SUIUSDT", price: 0.6885, bias: "SHORT", tradeable: false,
      reason: "short pays in 51 of 64 geometries",
      regime: { turning: false }, confidence: { thin: false, effectiveN: 17 },
      context: {}, plan: {
        direction: "short", horizonDays: 10, stopPct: 3.49, targetPct: 10.47, rr: 3,
        hitPct: 25.9, expectancyR: 0.24, effectiveN: 17,
        entry: 0.6885, stop: 0.7125, target: 0.6164, positionUsdPer1000: 286,
      },
    },
    {
      asset: "BTC", symbol: "BTCUSDT", price: 64070, bias: "WAIT", tradeable: true,
      reason: "both directions lose over the recent window",
      regime: { turning: true }, confidence: null, context: {}, plan: null,
    },
  ],
};

/** Just the server-rendered rows — the client script below them repeats the markup. */
function boardOf(html) {
  const start = html.indexOf('<div id="board">');
  return html.slice(start, html.indexOf('<nav class="pager"', start));
}

test("every scanned pair reaches the HTML, so the board works without JavaScript", () => {
  const board = boardOf(renderSignalsPage(site, snapshot));
  for (const asset of ["ICP", "SUI", "BTC"]) {
    assert.ok(board.includes(`>${asset}<`), `${asset} must be in the served markup`);
  }
  assert.equal((board.match(/<article class="sig">/g) ?? []).length, 3);
});

test("the controls stay hidden until the script that drives them runs", () => {
  // A filter button that does nothing is worse than no filter button.
  const html = renderSignalsPage(site, snapshot);
  assert.ok(html.includes('<form class="filters" id="filters" hidden>'));
  assert.ok(html.includes("form.hidden = false"), "the script must reveal them");
});

test("the page carries the data its filters re-render from", () => {
  const html = renderSignalsPage(site, snapshot);
  const m = html.match(/<script id="board-data" type="application\/json">([\s\S]*?)<\/script>/);
  assert.ok(m, "board data must be inlined");
  const data = JSON.parse(m[1].replace(/\\u003c/g, "<"));
  assert.equal(data.signals.length, 3);
  assert.equal(data.signals[0].asset, "ICP");
  assert.equal(data.signals[0].thin, true);
  assert.equal(data.signals[0].turning, true);
  assert.equal(data.signals[1].tradeable, false, "an unsizeable pair must be filterable");
  assert.equal(data.recentWindowDays, 180, "the deciding window travels with the data");
});

test("a filter exists for each axis a reader asks about", () => {
  const html = renderSignalsPage(site, snapshot, { days: ["2026-08-10", "2026-08-11"] });
  for (const f of ["bias", "horizon", "hit", "quality"]) {
    assert.ok(html.includes(`data-f="${f}"`), `missing the ${f} filter`);
  }
  assert.ok(html.includes('data-v="LONG"') && html.includes('data-v="SHORT"') && html.includes('data-v="WAIT"'));
  assert.ok(html.includes('data-v="30"'), "the horizons present in the scan become chips");
  assert.ok(html.includes('id="f-q"'), "free text over asset and reason");
  assert.ok(html.includes('id="f-sort"'), "sort control");
  assert.ok(html.includes('id="f-day"'), "date picker");
  assert.ok(html.includes('<option value="2026-08-10">'), "an archived day is selectable");
  assert.ok(html.includes('id="pager"'), "pagination container");
});

test("a row leads with what should make a reader distrust it", () => {
  // Sample size and the regime flag sit beside the bias, above the entry price.
  const board = boardOf(renderSignalsPage(site, snapshot));
  const icpRow = board.slice(board.indexOf(">ICP<"), board.indexOf(">SUI<"));
  assert.ok(icpRow.includes("regime turn"));
  assert.ok(icpRow.includes("thin sample"));
  assert.ok(
    icpRow.indexOf("thin sample") < icpRow.indexOf("Entry"),
    "the warning must appear before the entry price",
  );
});

test("a WAIT row states its reason instead of showing an empty plan", () => {
  const board = boardOf(renderSignalsPage(site, snapshot));
  const btcRow = board.slice(board.indexOf(">BTC<"));
  assert.ok(btcRow.includes("both directions lose"));
  assert.ok(!btcRow.includes('<div class="levels">'), "no price levels on a stand-aside call");
});

test("the board is published in English", () => {
  const html = renderSignalsPage(site, snapshot, { days: ["2026-08-10"] });
  const hits = nonEnglishLines(html);
  assert.deepEqual(hits, [], `non-English on the board: ${JSON.stringify(hits.slice(0, 3))}`);
});

test("signal cards do not restyle the lesson difficulty badge", () => {
  // `.lvl` is the lesson badge; the board's price cells must not claim it.
  const html = renderSignalsPage(site, snapshot);
  assert.ok(!/class="lvl[ "]/.test(html), "board must not emit a bare .lvl element");
});

test("an empty scan renders a page rather than throwing", () => {
  const html = renderSignalsPage(site, { scannedAt: "", tally: {}, signals: [] });
  assert.ok(html.includes("No scan on record yet"));
});

test("the slim snapshot drops the grid but keeps every decision number", () => {
  const slim = slimSnapshot(snapshot);
  const icp = slim.signals[0];
  assert.equal(icp.plan.hitPct, 47.3);
  assert.equal(icp.plan.expectancyR, 0.47);
  assert.equal(icp.plan.effectiveN, 5);
  assert.ok(!("grid" in icp), "the geometry grid must not ship to a phone");
  assert.ok(JSON.stringify(slim).length < JSON.stringify(snapshot).length);
});
