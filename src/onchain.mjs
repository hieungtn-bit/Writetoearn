/**
 * On-chain valuation metrics, each with the context that makes it mean something.
 *
 * This channel was listed as unreachable in the architecture review and it was
 * not — bitcoin-data.com serves the standard set free and without a key. It got
 * added after reading someone else's post that quoted "MVRV Z-Score ~0.32 ->
 * clearly undervalued", which turned out to be a good number attached to an
 * overstated conclusion: 0.37 sits at the 18th percentile of the available
 * record, while the last cycle bottom printed a *negative* reading. Cheap, yes.
 * As cheap as a bottom, no.
 *
 * So the rule here is that a raw value is never returned alone. Every metric
 * carries its percentile against its own history and the extremes of that
 * history, because "MVRV Z is 0.37" is not information and "0.37, lower than
 * 82% of the record, against -0.36 at the 2022 low" is.
 *
 * The history is short — roughly four years, one completed cycle. A percentile
 * against one cycle is a weak statement and is labelled as one.
 */

const BASE = "https://bitcoin-data.com/v1";
const TIMEOUT_MS = 20_000;

/**
 * The metrics worth carrying, and what each one answers.
 *
 * Deliberately a small set. Nine were available; five say different things and
 * the rest mostly restate MVRV in other units, which would pad a report without
 * adding a reading.
 */
export const METRICS = {
  mvrvZscore: {
    path: "mvrv-zscore",
    field: "mvrvZscore",
    label: "MVRV Z-score",
    note: "market value against cost basis, in standard deviations",
  },
  nupl: {
    path: "nupl",
    field: "nupl",
    label: "NUPL",
    note: "share of supply sitting in unrealised profit",
  },
  sopr: {
    path: "sopr",
    field: "sopr",
    label: "SOPR",
    note: "coins moving at a profit above 1, at a loss below",
  },
  puellMultiple: {
    path: "puell-multiple",
    field: "puellMultiple",
    label: "Puell multiple",
    note: "miner revenue against its own yearly average",
  },
  mvrv: {
    path: "mvrv",
    field: "mvrv",
    label: "MVRV ratio",
    note: "price over cost basis; below 1 the average holder is under water",
  },
  realizedPrice: {
    path: "realized-price",
    field: "realizedPrice",
    label: "realised price",
    note: "the aggregate cost basis of every coin that has moved",
  },
  /**
   * Split by holding age, added after a request for the cohort view.
   *
   * The aggregate SOPR mixes two populations that behave nothing alike: recent
   * buyers who capitulate on any drawdown, and holders sitting on years of gain
   * who only move on a decision. A single number averages them into a reading
   * that describes neither, and the two cost bases are usually thousands of
   * dollars apart.
   */
  sthSopr: {
    path: "sth-sopr",
    field: "sthSopr",
    label: "SOPR short-term",
    note: "recent buyers; below 1 they are realising losses",
  },
  lthSopr: {
    path: "lth-sopr",
    field: "lthSopr",
    label: "SOPR long-term",
    note: "coins held over 155 days; below 1 old hands are selling at a loss",
  },
  sthRealizedPrice: {
    path: "sth-realized-price",
    field: "sthRealizedPrice",
    label: "STH cost basis",
    note: "what recent buyers paid on average; the line they defend",
  },
  lthRealizedPrice: {
    path: "lth-realized-price",
    field: "lthRealizedPrice",
    label: "LTH cost basis",
    note: "what long-term holders paid; the floor under a real capitulation",
  },
};

const percentileOf = (values, v) =>
  values.length ? (values.filter((x) => x < v).length / values.length) * 100 : NaN;

/**
 * One metric's full series, reduced to the current reading and its context.
 *
 * Returns null rather than throwing. On-chain is one channel among several;
 * a report that dies because a third-party host is slow is worse than one that
 * prints the rest.
 */
export async function fetchMetric(key, { fetchImpl = globalThis.fetch } = {}) {
  const spec = METRICS[key];
  if (!spec) return null;
  try {
    const res = await fetchImpl(`${BASE}/${spec.path}`, { signal: AbortSignal.timeout(TIMEOUT_MS) });
    if (!res.ok) return null;
    const rows = (await res.json())
      .map((r) => ({ date: r.d, value: Number(r[spec.field]) }))
      .filter((r) => Number.isFinite(r.value));
    if (rows.length < 30) return null;

    const values = rows.map((r) => r.value);
    const latest = rows.at(-1);
    const lowest = rows.reduce((a, b) => (a.value < b.value ? a : b));
    const highest = rows.reduce((a, b) => (a.value > b.value ? a : b));

    return {
      key,
      label: spec.label,
      note: spec.note,
      date: latest.date,
      value: latest.value,
      percentile: percentileOf(values, latest.value),
      min: lowest.value,
      minDate: lowest.date,
      max: highest.value,
      maxDate: highest.date,
      observations: rows.length,
      firstDate: rows[0].date,
      /**
       * How much of the record sat under one. Only meaningful for MVRV, where
       * one is the line between the average holder being in profit and in loss
       * — and where every real bottom in the record has been on the far side.
       */
      belowOneSharePct: key === "mvrv"
        ? (values.filter((v) => v < 1).length / values.length) * 100
        : undefined,
    };
  } catch {
    return null;
  }
}

/** Every metric, fetched together, each failing on its own. */
export async function fetchOnchain({ fetchImpl = globalThis.fetch, keys = Object.keys(METRICS) } = {}) {
  const rows = await Promise.all(keys.map((k) => fetchMetric(k, { fetchImpl })));
  const out = {};
  for (const r of rows) if (r) out[r.key] = r;
  return Object.keys(out).length ? out : null;
}

/**
 * What the readings say together, as a sentence rather than a score.
 *
 * A "52 out of 100" reads as measured and cannot be wrong, which is the worst
 * combination a number can have. This says which side of its own history the
 * valuation sits on and refuses to translate that into a call.
 */
export function valuationNote(onchain) {
  const z = onchain?.mvrvZscore;
  if (!z) return "On-chain valuation unavailable.";
  const where =
    z.percentile <= 20 ? "in the cheapest fifth of its record"
      : z.percentile <= 40 ? "on the cheap side of its record"
        : z.percentile >= 80 ? "in the expensive fifth of its record"
          : "around the middle of its record";
  const vsLow = z.value > z.min
    ? `The record low is ${z.min.toFixed(2)}, so this is cheap without being what the last bottom looked like.`
    : "This is the lowest reading in the record.";
  return `Valuation sits ${where}. ${vsLow}`;
}

const f2 = (v) => (Number.isFinite(v) ? v.toFixed(2) : "—");
const f0 = (v) => (Number.isFinite(v) ? v.toFixed(0) : "—");

export function formatOnchain(onchain, { price } = {}) {
  if (!onchain) return "On-chain metrics unavailable.";
  const any = Object.values(onchain)[0];
  const lines = [
    `On-chain — ${any.date}, against ${any.observations} days since ${any.firstDate}`,
    "",
    "  METRIC             value   percentile      record low / high",
  ];
  for (const m of Object.values(onchain)) {
    const scale = m.key === "realizedPrice" ? f0 : f2;
    lines.push(
      `  ${m.label.padEnd(17)} ${scale(m.value).padStart(7)} ` +
        `${(`${f0(m.percentile)}th`).padStart(11)}      ${scale(m.min)} / ${scale(m.max)}`,
    );
  }

  // Spot against the aggregate cost basis is the one cross-check worth printing:
  // it is the same statement MVRV makes, in dollars a reader can act on.
  if (price && onchain.realizedPrice) {
    const rp = onchain.realizedPrice.value;
    lines.push(
      "",
      `  Spot ${f0(price)} against a cost basis of ${f0(rp)} — holders are ` +
        `${price >= rp ? "up" : "down"} ${f2(Math.abs((price / rp - 1) * 100))}% in aggregate.`,
    );
  }

  lines.push("", valuationNote(onchain));
  lines.push(
    "",
    `Percentiles run against ${any.observations} days — roughly one completed cycle. ` +
      "That is a weak base for a claim about cycles, and it is the only one this source offers.",
  );
  return lines.join("\n");
}
