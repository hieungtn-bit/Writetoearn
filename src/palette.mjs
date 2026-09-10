/**
 * The card palette and layout constants, validated, in one place.
 *
 * Twelve cover scripts each hard-coded the same hexes. That is survivable until
 * one of them is edited and the series quietly stops matching itself — and
 * worse, until a colour is picked by eye. Every value here has been run through
 * the palette validator against the card surface; the assertions in
 * test/palette.test.mjs re-run the checks that matter so a future edit cannot
 * reintroduce a pairing that fails.
 *
 * Measured on #0b0e11: PRIMARY against SECONDARY is 30.7 delta-E with normal
 * vision and stays above 23 under every dichromat simulation, while both clear
 * 3:1 contrast against the surface. The dataviz validator put protanopia at
 * 27.4 and the implementation in this file puts it at 28.1 — different
 * dichromat matrices, same conclusion, and the normal-vision figure agrees
 * exactly. deltaE() below is what the tests assert against, so a future edit
 * to any of these hexes has to survive the check rather than a memory of it.
 *
 * BRAND is deliberately NOT a data colour. Binance amber sits at lightness
 * 0.813, outside the band a categorical hue needs on a dark surface, and it
 * fails the check every time it is tried. It is for the kicker and the wordmark
 * only, where it is text on background rather than a mark to be told apart.
 */

export const SURFACE = "#0b0e11";

export const PALETTE = {
  /** First categorical hue, and the "loss"/"risk" pole when the job is diverging. */
  primary: "#c98500",
  /** Second categorical hue, and the "gain"/"reward" pole. */
  secondary: "#3987e5",
  /** Series that are present but not carrying the story. */
  muted: "#5a636d",
  /** A true zero on a diverging scale — never a hue. */
  neutral: "#39414b",
};

/** Status roles, named so a chart says what it means rather than what colour it is. */
export const ROLE = {
  loss: PALETTE.primary,
  gain: PALETTE.secondary,
  fail: PALETTE.primary,
  pass: PALETTE.secondary,
  inactive: PALETTE.muted,
  zero: PALETTE.neutral,
};

/** Kicker and wordmark only. Never a data mark — see the note above. */
export const BRAND = "#f0b90b";

export const INK = {
  primary: "#e8eaed",
  secondary: "#9aa3ad",
  muted: "#8b949e",
  faint: "#6b757f",
  rule: "#252a31",
  axis: "#39414b",
  /** Text placed on top of a filled mark, so it needs the surface colour. */
  onFill: "#0b0e11",
};

/** Card geometry, shared so every cover in the series lines up with the others. */
export const CARD = {
  width: 1200,
  height: 630,
  margin: 64,
  /** Right edge for end-anchored text. */
  right: 1136,
  kickerY: 56,
  titleY: [118, 164],
  subY: 200,
  /** The divider above the stat row, and the two baselines under it. */
  footRuleY: 546,
  statY: 582,
  statLabelY: 604,
};

/**
 * Magnitude by lightness, sign by hue, neutral at a true zero.
 *
 * The diverging fill used by heatmaps. Kept here rather than re-derived per
 * card because "never a hue at the midpoint" is a rule that is easy to state
 * and easy to forget while writing an rgba() by hand.
 */
export function divergingFill(value, { full = 0.25, deadzone = 0.005 } = {}) {
  const v = Number(value);
  if (!Number.isFinite(v) || Math.abs(v) < deadzone) return PALETTE.neutral;
  const mag = Math.min(1, Math.abs(v) / full);
  const alpha = (0.22 + 0.78 * mag).toFixed(3);
  return v > 0 ? `rgba(57,135,229,${alpha})` : `rgba(201,133,0,${alpha})`;
}

/** Relative luminance, for the contrast assertions the tests run. */
export function luminance(hex) {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255);
  const lin = (c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
  return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
}

/** WCAG contrast ratio between two hexes. */
export function contrast(a, b) {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

/* ---------- colourblind separation, computed rather than assumed ---------- */

const srgbToLinear = (c) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);

const hexToLinear = (hex) =>
  [1, 3, 5].map((i) => srgbToLinear(parseInt(hex.slice(i, i + 2), 16) / 255));

/**
 * Dichromat simulation, Viénot–Brettel–Mollon (1999), applied in linear RGB.
 *
 * Two categorical hues on a dark surface are separated by hue and chroma, not
 * by luminance — a WCAG contrast ratio between them is near 1 by design and
 * says nothing. The question that matters is whether a reader who cannot
 * distinguish those hues still sees two different marks, and that is what a
 * dichromat simulation followed by a perceptual distance answers.
 */
const CVD_MATRICES = {
  protan: [[0.1121, 0.8853, -0.0005], [0.1127, 0.8897, -0.0001], [0.0045, 0.0085, 1.0000]],
  deutan: [[0.2920, 0.7054, -0.0003], [0.2934, 0.7089, 0.0000], [-0.0209, 0.4143, 0.6060]],
  tritan: [[1.0000, 0.1502, -0.1504], [0.0000, 1.0000, 0.0000], [-0.0060, 0.9852, 0.0207]],
};

const applyMatrix = (m, [r, g, b]) => m.map((row_) => row_[0] * r + row_[1] * g + row_[2] * b);

/** Linear RGB to OKLab. */
function linearToOklab([r, g, b]) {
  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
  const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
  const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
  return [
    0.2104542553 * l + 0.7936177850 * m - 0.0040720468 * s,
    1.9779984951 * l - 2.4285922050 * m + 0.4505937099 * s,
    0.0259040371 * l + 0.7827717662 * m - 0.8086757660 * s,
  ];
}

/**
 * Perceptual distance between two hexes, optionally under a CVD simulation.
 *
 * OKLab Euclidean distance x100, the same scale the dataviz validator reports.
 * A pair at 8 or above is comfortably separable; 6 to 8 is a floor that is only
 * acceptable with a second encoding such as a direct label.
 */
export function deltaE(a, b, vision = "normal") {
  const prep = (hex) => {
    const lin = hexToLinear(hex);
    return linearToOklab(vision === "normal" ? lin : applyMatrix(CVD_MATRICES[vision], lin));
  };
  const [l1, a1, b1] = prep(a);
  const [l2, a2, b2] = prep(b);
  return Math.hypot(l1 - l2, a1 - a2, b1 - b2) * 100;
}
