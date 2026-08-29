/**
 * Number and table formatting, in one place.
 *
 * Twenty-six fill scripts had each written their own `f1`, `f2`, `pct` and
 * `row`, and the copies had already drifted into a real bug: a value of 3.56
 * printed as "3.6" is a 1.1% error, past the verifier's tolerance, and the gate
 * rejected two finished drafts over it before the rule "two decimals below ten"
 * got invented — by hand, in two different files, on the same afternoon.
 *
 * That is the architecture note about one metric computed in one place, applied
 * to presentation: a rounding rule that lives in twenty-six copies is a rounding
 * rule that is wrong in some of them.
 */

/**
 * Relative tolerance the verifier applies to every figure in a draft.
 * Duplicated deliberately as a named constant rather than imported, so this
 * module stays free of the gate it is helping drafts pass.
 */
const VERIFIER_TOLERANCE = 0.005;

/**
 * Coerce for display, refusing the values that quietly become zero.
 *
 * `Number(null)` and `Number("")` are both 0 and both finite, so a missing
 * field would render as "0.00%" — a fabricated figure in a published post,
 * indistinguishable from a measured one. Absence has to look like absence.
 */
function numeric(value) {
  if (value == null || value === "") return null;
  const v = Number(value);
  return Number.isFinite(v) ? v : null;
}

/**
 * A percentage, rounded to a precision the gate will accept.
 *
 * One decimal is fine at 92.5 and wrong at 3.56. Rather than pick a magic
 * cutoff, this asks the question directly: how many decimals does this value
 * need before half a printed unit sits inside the verifier's tolerance? Small
 * values get more digits because they need them, large ones stay readable.
 */
export function pct(value, { max = 4 } = {}) {
  const v = numeric(value);
  if (v === null) return "n/a";
  const magnitude = Math.max(Math.abs(v), 1);
  for (let d = 1; d < max; d++) {
    if (0.5 * 10 ** -d <= magnitude * VERIFIER_TOLERANCE) return v.toFixed(d);
  }
  return v.toFixed(max);
}

/**
 * A price. Small prices carry more decimals for the same reason percentages do
 * — quoting a sub-cent altcoin to two places destroys the figure.
 */
export function price(value) {
  const v = numeric(value);
  if (v === null) return "n/a";
  const a = Math.abs(v);
  if (a >= 1000) return v.toFixed(0);
  if (a >= 100) return v.toFixed(2);
  if (a >= 1) return v.toFixed(3);
  if (a >= 0.01) return v.toFixed(4);
  return v.toFixed(6);
}

/** Fixed decimals, for the cases where the caller genuinely knows best. */
export const fixed = (value, decimals) => {
  const v = numeric(value);
  return v === null ? "n/a" : v.toFixed(decimals);
};

/** A whole number with thousands separators, in the grouping the gate parses. */
export function count(value) {
  const v = numeric(value);
  return v === null ? "n/a" : Math.round(v).toLocaleString("en-US");
}

/** Money, scaled to the unit a reader thinks in. */
export function usd(value) {
  const v = numeric(value);
  if (v === null) return "n/a";
  const a = Math.abs(v);
  if (a >= 1e9) return `$${(v / 1e9).toFixed(2)}B`;
  if (a >= 1e6) return `$${(v / 1e6).toFixed(2)}M`;
  if (a >= 1e3) return `$${(v / 1e3).toFixed(0)}k`;
  return `$${v.toFixed(0)}`;
}

/**
 * One row of a fixed-width table.
 *
 * Padded here rather than by hand in each template because the values are live:
 * a price crossing ten, or a percentage losing a digit, silently breaks
 * hand-aligned columns and the post ships looking careless. Trailing space is
 * trimmed so an empty trailing cell leaves no ragged whitespace.
 *
 * @param {(string|number)[]} cells
 * @param {number[]} widths Positive pads left (right-aligned), negative pads right.
 */
export function row(cells, widths) {
  return cells
    .map((c, i) => {
      const w = widths[i] ?? 12;
      const s = String(c ?? "");
      return w < 0 ? s.padEnd(-w) : s.padStart(w);
    })
    .join("")
    .trimEnd();
}

/** A table: a header row plus body rows, sharing one set of column widths. */
export const table = (rows, widths) => rows.map((cells) => row(cells, widths)).join("\n");
