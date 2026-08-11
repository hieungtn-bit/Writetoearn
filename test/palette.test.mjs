import test from "node:test";
import assert from "node:assert/strict";
import {
  BRAND, CARD, INK, PALETTE, ROLE, SURFACE, contrast, deltaE, divergingFill,
} from "../src/palette.mjs";

test("both data hues clear 3:1 against the card surface", () => {
  for (const [name, hex] of [["primary", PALETTE.primary], ["secondary", PALETTE.secondary]]) {
    const ratio = contrast(hex, SURFACE);
    assert.ok(ratio >= 3, `${name} ${hex} is ${ratio.toFixed(2)}:1 against the surface`);
  }
});

test("every pair of marks stays separable, including under colour blindness", () => {
  // A WCAG contrast ratio between two categorical hues is near 1 by design —
  // they share a lightness band and differ in hue. Asserting on it was the
  // wrong test and it failed for the right reason. Perceptual distance under a
  // dichromat simulation is the question that actually matters.
  const marks = [PALETTE.primary, PALETTE.secondary, PALETTE.muted];
  for (const vision of ["normal", "protan", "deutan", "tritan"]) {
    for (let i = 0; i < marks.length; i++) {
      for (let j = i + 1; j < marks.length; j++) {
        const d = deltaE(marks[i], marks[j], vision);
        assert.ok(d >= 8, `${marks[i]} vs ${marks[j]} is ${d.toFixed(1)} under ${vision}`);
      }
    }
  }
});

test("the headline pair clears the comfortable threshold, not just the floor", () => {
  for (const vision of ["normal", "protan", "deutan", "tritan"]) {
    const d = deltaE(PALETTE.primary, PALETTE.secondary, vision);
    assert.ok(d >= 20, `primary/secondary is ${d.toFixed(1)} under ${vision}`);
  }
});

test("the delta-E implementation agrees with the validator that vetted this pair", () => {
  // The dataviz validator reported 30.7 with normal vision for this pair. An
  // implementation that cannot reproduce a known figure is not a check, it is a
  // second opinion nobody asked for.
  assert.ok(Math.abs(deltaE(PALETTE.primary, PALETTE.secondary, "normal") - 30.7) < 0.5);
});

test("brand amber is never offered as a data colour", () => {
  const dataColours = [...Object.values(PALETTE), ...Object.values(ROLE)];
  assert.ok(
    !dataColours.includes(BRAND),
    "Binance amber fails the dark lightness band; it is for the kicker and wordmark only",
  );
});

test("text on a filled mark uses the surface colour, not ink", () => {
  // A label drawn inside a bar has the fill behind it, so it needs the dark
  // surface colour. Using primary ink there is invisible on a light fill.
  assert.equal(INK.onFill, SURFACE);
});

test("the diverging scale puts a neutral at zero and never a hue", () => {
  assert.equal(divergingFill(0), PALETTE.neutral);
  assert.equal(divergingFill(0.001), PALETTE.neutral);
  assert.notEqual(divergingFill(0.2), divergingFill(-0.2));
  // Magnitude drives lightness, so a bigger number is a stronger fill.
  const weak = divergingFill(0.05);
  const strong = divergingFill(0.25);
  assert.ok(Number(/([\d.]+)\)$/.exec(strong)[1]) > Number(/([\d.]+)\)$/.exec(weak)[1]));
});

test("a non-numeric expectancy does not paint a confident colour", () => {
  for (const bad of [null, undefined, NaN, "x"]) {
    assert.equal(divergingFill(bad), PALETTE.neutral);
  }
});

test("card geometry keeps the stat row inside the painted area", () => {
  // Headless Chromium paints roughly the first 540px of a 630px window, which
  // is why render-card renders tall and crops. Everything must still fit the
  // intended frame.
  assert.ok(CARD.statLabelY < CARD.height, "stat labels must sit inside the card");
  assert.ok(CARD.footRuleY < CARD.statY, "the rule sits above the stats it separates");
  assert.ok(CARD.right < CARD.width, "end-anchored text stays inside the frame");
});
