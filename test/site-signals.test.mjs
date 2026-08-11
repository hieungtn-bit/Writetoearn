import test from "node:test";
import assert from "node:assert/strict";
import { renderSignalsPage } from "../src/site.mjs";

const site = {
  name: "MAIX8 Research",
  tagline: "Evidence Over Emotion.",
  baseUrl: "https://maix8.study",
  locale: "en",
};

const snapshot = {
  scannedAt: "2026-08-11T08:31:00.000Z",
  tally: { total: 3, LONG: 1, SHORT: 1, WAIT: 1, turning: 1, untradeable: 1 },
  signals: [
    {
      asset: "ICP", symbol: "ICPUSDT", price: 2.314, bias: "LONG", tradeable: true,
      reason: "long pays in 54 of 64 geometries",
      regime: { turning: true }, confidence: { thin: true, effectiveN: 5 },
      context: { stage: "2 expansion", underwaterPct: 4.9, volumeTrendPct: 112.3 },
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

test("every scanned pair reaches the HTML, so the board works without JavaScript", () => {
  const html = renderSignalsPage(site, snapshot);
  for (const asset of ["ICP", "SUI", "BTC"]) {
    assert.ok(html.includes(`>${asset}<`), `${asset} must be in the served markup`);
  }
  assert.equal((html.match(/class="sig"/g) ?? []).length, 3);
});

test("filters are driven by data attributes the script can read", () => {
  const html = renderSignalsPage(site, snapshot);
  assert.ok(html.includes('data-bias="LONG"'));
  assert.ok(html.includes('data-bias="SHORT"'));
  assert.ok(html.includes('data-bias="WAIT"'));
  assert.ok(html.includes('data-horizon="30"'));
  assert.ok(html.includes('data-tradeable="false"'), "an unsizeable pair must be filterable");
});

test("a row leads with what should make a reader distrust it", () => {
  // Sample size and the regime flag sit beside the bias, above the entry price.
  const html = renderSignalsPage(site, snapshot);
  const icpRow = html.slice(html.indexOf(">ICP<"), html.indexOf(">SUI<"));
  assert.ok(icpRow.includes("regime turn"));
  assert.ok(icpRow.includes("thin sample"));
  assert.ok(
    icpRow.indexOf("thin sample") < icpRow.indexOf("Entry"),
    "the warning must appear before the entry price",
  );
});

test("a WAIT row states its reason instead of showing an empty plan", () => {
  const html = renderSignalsPage(site, snapshot);
  const btcRow = html.slice(html.indexOf(">BTC<"));
  assert.ok(btcRow.includes("both directions lose"));
  assert.ok(!btcRow.includes("<dl class=\"plan\">"), "no plan table on a stand-aside call");
});

test("an empty scan renders a page rather than throwing", () => {
  const html = renderSignalsPage(site, { scannedAt: "", tally: {}, signals: [] });
  assert.ok(html.includes("No scan on record yet"));
});
