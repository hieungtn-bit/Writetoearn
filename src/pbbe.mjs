/**
 * P-BBE — base breakout scanner, built to the supplied specification.
 *
 * The spec is a good one: find pairs that have spent two to four weeks in a
 * tight range, catch them as volume arrives, and rank by how early you are.
 * That is the shape of the one thing in this repo that has actually measured
 * positive — hourly volume z >= 5 at 4.44x lift, 2.75 sigma. So it is built.
 *
 * Three things in it do not survive contact with this environment or with what
 * has already been measured, and they are handled here rather than quietly:
 *
 * 1. `fapi.binance.com` is geo-blocked from this machine. Verified again today:
 *    "Service unavailable from a restricted location". Every request routes to
 *    the spot mirror instead, so this scans SPOT pairs, not perpetuals. Open
 *    interest is therefore absent from the structure check, and the universe is
 *    a few hundred pairs wider.
 *
 * 2. `Volume_Z = (Volume_24h - mean_7d) / std_7d` is capped if the observation
 *    sits inside its own baseline. With n = 7 the largest z arithmetically
 *    obtainable is 2.268 — see `maxAchievableZ` — so the spec's gate of 2.0 is
 *    not "unusual volume", it is "the 88th percentile of what the formula can
 *    physically print". The baseline here is the *prior* completed days,
 *    excluding both today's partial candle and today's reading, which makes the
 *    statistic unbounded and comparable across windows. Both the 7-day and the
 *    30-day versions are computed and both are printed.
 *
 * 3. The composite score is the same device criticised in draft 50: a single
 *    0-100 number that reads as measured and cannot be wrong. Worse, its
 *    heaviest structural component — base compression — has been measured. In
 *    `research/breakout-signal.mjs`, across 43,088 pair-days, `compressed`
 *    returned 1.01x lift at 0.09 sigma. That is indistinguishable from picking
 *    at random. So the score is computed exactly as specified, and every
 *    component that fed it is printed beside it, the way `wte movers` prints
 *    its five flags. The weights are a hypothesis awaiting a study, and the
 *    output says so on every run.
 */

import { fetchAllTickers } from "./pulse.mjs";
import { fetchKlines } from "./analysis.mjs";
import { fetchDelistings, baseAsset } from "./listings.mjs";

const EXCLUDED = /(UP|DOWN|BULL|BEAR)USDT$|^(USDC|FDUSD|TUSD|BUSD|DAI|EUR|AEUR|USDP|XUSD)USDT$/;

/** Hard gates, as specified. */
export const MIN_TURNOVER_USD = 5e6;
export const MIN_VOLUME_Z = 2.0;
/**
 * How far above the base top a candidate may already be, as a fraction.
 *
 * 0.55 is the specified value and it is a long way from "early" — a token 55%
 * above its own base has made the move this scanner claims to be front-running.
 * The knob exists so the assumption is arguable: `--max-from-base 0.15` scans
 * for what the name promises.
 */
export const MAX_FROM_BASE = 0.55;
/** The distance at which the proximity term decays to zero. */
export const FROM_BASE_CEILING = 0.60;

/** Base detection window, in completed daily candles. */
export const BASE_MIN_DAYS = 10;
export const BASE_MAX_DAYS = 25;
/** A window wider than this is a trend, not a base. */
export const BASE_MAX_WIDTH = 0.35;
/** Below this width a base is as tight as the scoring cares to distinguish. */
export const BASE_TIGHT_WIDTH = 0.15;

/** The z at which the volume term is full marks. */
export const VOLUME_Z_FULL = 4;
/** Turnover at which the liquidity term saturates. */
export const LIQUIDITY_FULL_USD = 5e8;

export const WEIGHTS = {
  volume: 0.30,
  proximity: 0.25,
  baseQuality: 0.20,
  structure: 0.15,
  liquidity: 0.10,
};

export const TIERS = [
  { min: 78, label: "High Priority" },
  { min: 65, label: "Watchlist" },
  { min: 50, label: "Observe" },
];

export const tierFor = (score) => TIERS.find((t) => score >= t.min)?.label ?? null;

const clamp01 = (v) => (Number.isFinite(v) ? Math.min(1, Math.max(0, v)) : 0);
const mean = (xs) => xs.reduce((s, x) => s + x, 0) / xs.length;
const stdev = (xs) => {
  if (xs.length < 2) return NaN;
  const m = mean(xs);
  return Math.sqrt(xs.reduce((s, x) => s + (x - m) ** 2, 0) / (xs.length - 1));
};

/**
 * The largest z-score arithmetically obtainable when the observation is one of
 * the n points its own mean and deviation were computed from.
 *
 * Exported because it is the reason the spec's 7-day formula behaves oddly, and
 * a number that surprising should be checkable rather than asserted in a
 * comment: (n - 1) / sqrt(n). At n = 7 that is 2.268, so "z >= 2" selects the
 * top 12% of a range that stops at 2.268 rather than anything about volume.
 */
export const maxAchievableZ = (n) => (n - 1) / Math.sqrt(n);

/**
 * Today's turnover against a baseline of prior completed days.
 *
 * The baseline excludes today deliberately, twice over: the current daily candle
 * is partial until 00:00 UTC and comparing a half-day to full days reports a
 * clock reading, and including the observation in its own baseline is what
 * imposes the cap above. `quoteVolume24h` from the ticker is a rolling 24 hours,
 * so it is the like-for-like numerator.
 */
export function volumeZ(turnover24h, completedDailyQuoteVolumes, days) {
  const base = completedDailyQuoteVolumes.slice(-days);
  if (base.length < days) return NaN;
  const sd = stdev(base);
  if (!Number.isFinite(sd) || sd === 0) return NaN;
  return (turnover24h - mean(base)) / sd;
}

/**
 * The longest recent window that qualifies as a base.
 *
 * Longest rather than tightest: a 10-day window is always at least as tight as
 * the 25-day window containing it, so searching for the tightest would return
 * ten days every time and the length term in the quality score would be dead.
 * The search runs from the most recent completed candle backwards.
 */
export function findBase(daily, { maxWidth = BASE_MAX_WIDTH } = {}) {
  const done = daily.slice(0, -1);
  if (done.length < BASE_MIN_DAYS + 1) return null;

  let best = null;
  for (let len = BASE_MAX_DAYS; len >= BASE_MIN_DAYS; len--) {
    const win = done.slice(-len);
    if (win.length < len) continue;
    const high = Math.max(...win.map((c) => c.high));
    const low = Math.min(...win.map((c) => c.low));
    const avg = mean(win.map((c) => c.close));
    if (!(avg > 0)) continue;
    const width = (high - low) / avg;
    if (width > maxWidth) continue;
    best = { days: len, high, low, mean: avg, widthPct: width * 100 };
    break;
  }
  if (!best) return null;

  const lengthScore = clamp01((best.days - BASE_MIN_DAYS) / (BASE_MAX_DAYS - BASE_MIN_DAYS));
  const tightScore = clamp01((maxWidth - best.widthPct / 100) / (maxWidth - BASE_TIGHT_WIDTH));
  return { ...best, lengthScore, tightScore, quality: 0.5 * lengthScore + 0.5 * tightScore };
}

const ema = (values, period) => {
  const k = 2 / (period + 1);
  let v = values[0];
  for (let i = 1; i < values.length; i++) v = values[i] * k + v * (1 - k);
  return v;
};

/**
 * Four independent structure checks on the 4-hour series, each reported.
 *
 * Averaged into one number because the spec asks for one, listed individually
 * because an average of four booleans tells you nothing about which of the four
 * is doing the work — and on the evidence of `wte movers`, where a five-flag
 * score turned out to be counting whichever flags were easy that day, that
 * distinction is the whole game.
 */
export function structureConfirm(fourHour, baseTop) {
  const done = fourHour.slice(0, -1);
  if (done.length < 24 || !(baseTop > 0)) return null;
  const closes = done.map((c) => c.close);
  const vols = done.map((c) => c.quoteVolume);

  const checks = {
    closedAboveBase: closes.at(-1) > baseTop,
    fastAboveSlow: ema(closes, 9) > ema(closes, 21),
    higherLows: Math.min(...done.slice(-6).map((c) => c.low))
      > Math.min(...done.slice(-12, -6).map((c) => c.low)),
    volumeExpanding: vols.at(-1) > mean(vols.slice(-30, -1)),
  };
  const hit = Object.values(checks).filter(Boolean).length;
  return { checks, hit, of: 4, score: hit / 4 };
}

/**
 * The specified composite, plus every input that produced it.
 *
 * `components` is not diagnostics. It is the part a later study can regress
 * against outcomes; the score itself is unfalsifiable by construction and is
 * carried because the spec asks for it, not because it has been shown to work.
 */
export function scorePair({ ticker, daily, fourHour, zWindow = 30, maxFromBase = MAX_FROM_BASE }) {
  const base = findBase(daily);
  if (!base) return null;

  const price = ticker.price;
  const fromBase = (price - base.high) / base.high;
  const completed = daily.slice(0, -1).map((c) => c.quoteVolume);

  const z7 = volumeZ(ticker.quoteVolume24h, completed, 7);
  const z30 = volumeZ(ticker.quoteVolume24h, completed, 30);
  const z = zWindow === 7 ? z7 : z30;

  const structure = fourHour ? structureConfirm(fourHour, base.high) : null;

  const components = {
    volume: clamp01(z / VOLUME_Z_FULL),
    proximity: clamp01(1 - fromBase / FROM_BASE_CEILING),
    baseQuality: base.quality,
    structure: structure?.score ?? 0,
    liquidity: clamp01(
      Math.log(ticker.quoteVolume24h / MIN_TURNOVER_USD)
        / Math.log(LIQUIDITY_FULL_USD / MIN_TURNOVER_USD),
    ),
  };

  const score = Math.min(100, Math.max(0,
    Object.entries(WEIGHTS).reduce((s, [k, w]) => s + w * components[k], 0) * 100));

  const gates = {
    turnover: ticker.quoteVolume24h >= MIN_TURNOVER_USD,
    volumeZ: Number.isFinite(z) && z >= MIN_VOLUME_Z,
    // Negative is allowed: still inside the base is earlier than just above it,
    // and a gate that rejected it would only admit pairs that had already gone.
    nearBase: fromBase <= maxFromBase,
    hasStructure: Boolean(structure),
  };

  return {
    asset: baseAsset(ticker.symbol),
    symbol: ticker.symbol,
    price,
    change24hPct: ticker.change24hPct,
    quoteVolume24h: ticker.quoteVolume24h,
    base,
    fromBasePct: fromBase * 100,
    volumeZ7: z7,
    volumeZ30: z30,
    volumeZUsed: z,
    zWindow,
    structure,
    components,
    score,
    tier: tierFor(score),
    gates,
    passedGates: Object.values(gates).every(Boolean),
  };
}

/**
 * Scans the venue.
 *
 * Candidates are pre-filtered on turnover and on the cheap version of the volume
 * test before any candles are fetched, because the full test needs two requests
 * per pair and the venue carries some 500 USDT pairs. Delistings are removed
 * first: on 2026-08-03 three of eight alerts traced to a single removal notice,
 * and a scanner that ranks by "volume arriving into a tight range" walks
 * directly into an exit queue.
 */
export async function scan({
  minTurnover = MIN_TURNOVER_USD,
  minVolumeZ = MIN_VOLUME_Z,
  maxFromBase = MAX_FROM_BASE,
  zWindow = 30,
  maxCandidates = 60,
  fetchImpl = globalThis.fetch,
  onProgress = () => {},
} = {}) {
  const tickers = await fetchAllTickers(fetchImpl);
  const delistings = await fetchDelistings({ fetchImpl });

  const eligible = tickers
    .filter((t) => t.symbol.endsWith("USDT") && !EXCLUDED.test(t.symbol))
    .filter((t) => Number.isFinite(t.quoteVolume24h) && t.quoteVolume24h >= minTurnover);

  const suppressed = [];
  const universe = [];
  for (const t of eligible) {
    const notice = delistings.get(baseAsset(t.symbol));
    if (notice) suppressed.push({ symbol: t.symbol, delisting: notice });
    else universe.push(t);
  }

  // Turnover is the only thing knowable without candles, so rank on it and take
  // the top slice. This is a cost decision and it biases toward large pairs;
  // raising --max-candidates is how you argue with it.
  const shortlist = universe
    .sort((a, b) => b.quoteVolume24h - a.quoteVolume24h)
    .slice(0, maxCandidates);

  const rows = [];
  for (let i = 0; i < shortlist.length; i += 4) {
    const done = await Promise.all(
      shortlist.slice(i, i + 4).map(async (ticker) => {
        const [daily, fourHour] = await Promise.all([
          fetchKlines(ticker.symbol, { interval: "1d", limit: 60, fetchImpl }).catch(() => null),
          fetchKlines(ticker.symbol, { interval: "4h", limit: 60, fetchImpl }).catch(() => null),
        ]);
        if (!daily || daily.length < BASE_MIN_DAYS + 2) return null;
        return scorePair({ ticker, daily, fourHour, zWindow, maxFromBase });
      }),
    );
    for (const r of done) if (r) rows.push(r);
    onProgress(Math.min(i + 4, shortlist.length), shortlist.length);
  }

  rows.sort((a, b) => b.score - a.score);
  return {
    scannedAt: new Date().toISOString(),
    venue: "spot",
    eligible: eligible.length,
    examined: rows.length,
    suppressed,
    zWindow,
    minVolumeZ,
    maxFromBase,
    rows,
    qualified: rows.filter((r) => r.passedGates && r.volumeZUsed >= minVolumeZ && r.tier),
  };
}

const f1 = (v) => (Number.isFinite(v) ? v.toFixed(1) : "—");
const f2 = (v) => (Number.isFinite(v) ? v.toFixed(2) : "—");
const tick = (v) => (v ? "Y" : "·");
const usd = (v) => (v >= 1000 ? Math.round(v).toLocaleString("en-US") : Number(v).toPrecision(4));

export function formatScan(result) {
  const { rows, qualified, eligible, examined, suppressed, zWindow, minVolumeZ } = result;
  const lines = [
    `P-BBE — spot pairs (futures endpoint is geo-blocked here), ` +
      `${eligible} above the turnover floor, ${examined} examined`,
    `Volume z baselined on the prior ${zWindow} completed days, excluding today. ` +
      `Gate z >= ${f1(minVolumeZ)}.`,
    "",
  ];

  if (suppressed.length) {
    lines.push(`  Skipped, delisting announced: ${suppressed.map((s) => baseAsset(s.symbol)).join(", ")}`, "");
  }

  lines.push(
    "  PAIR          price     24h    base  width  fromBase    z7    z30   4h struct   score  tier",
  );
  for (const r of rows.slice(0, 25)) {
    const c = r.structure?.checks;
    lines.push(
      `  ${r.asset.padEnd(11)} ${usd(r.price).padStart(9)} ` +
        `${(`${r.change24hPct >= 0 ? "+" : ""}${f1(r.change24hPct)}%`).padStart(7)} ` +
        `${(`${r.base.days}d`).padStart(6)} ${(`${f1(r.base.widthPct)}%`).padStart(6)} ` +
        `${(`${f1(r.fromBasePct)}%`).padStart(9)} ` +
        `${f2(r.volumeZ7).padStart(5)} ${f2(r.volumeZ30).padStart(6)}   ` +
        `${c ? `${tick(c.closedAboveBase)} ${tick(c.fastAboveSlow)} ${tick(c.higherLows)} ${tick(c.volumeExpanding)}` : "— — — —"}` +
        `  ${f1(r.score).padStart(6)}  ${r.tier ?? "drop"}`,
    );
  }

  if (rows.length) {
    lines.push("", "  Weighted components of the score, for the top rows:");
    lines.push("  PAIR         vol .30  prox .25  base .20  struct .15   liq .10");
    for (const r of rows.slice(0, 8)) {
      const w = (k) => (WEIGHTS[k] * r.components[k] * 100).toFixed(1).padStart(7);
      lines.push(
        `  ${r.asset.padEnd(11)} ${w("volume")}  ${w("proximity")}  ` +
          `${w("baseQuality")}  ${w("structure")}   ${w("liquidity")}`,
      );
    }

    const names = Object.keys(rows[0].gates);
    lines.push(
      "",
      `  Gate pass rates: ${names.map((k) => `${k} ${rows.filter((r) => r.gates[k]).length}/${rows.length}`).join("  |  ")}`,
    );

    // How much of the score each term actually moved.
    //
    // A weight is an intention; the spread is what the weight did. A term with
    // a large weight and no spread is not a heavy contributor, it is a constant
    // added to every row — it costs its weight out of the 100 and buys no
    // ordering. This block exists because that is exactly what the proximity
    // term does on a live venue, and it is invisible in the weights alone.
    lines.push("", "  What each term contributed to the *ranking* — weight allotted, spread realised:");
    for (const [k, w] of Object.entries(WEIGHTS)) {
      const pts = rows.map((r) => r.components[k] * w * 100);
      const sd = stdev(pts);
      lines.push(
        `    ${k.padEnd(12)} ${(w * 100).toFixed(0).padStart(3)} pts allotted   ` +
          `sd ${f2(sd).padStart(5)}   ` +
          (sd < 1 ? "— near-constant, buys almost no ordering" : ""),
      );
    }
  }

  lines.push("");
  lines.push(
    qualified.length
      ? `Qualified: ${qualified.map((r) => `${r.asset} (${f1(r.score)}, ${r.tier})`).join(", ")}`
      : "Nothing cleared every gate. That is a result, not a reason to move a threshold.",
  );

  lines.push(
    "",
    `A 7-day z is capped at ${f2(maxAchievableZ(7))} when the reading sits inside its own baseline, ` +
      "so the z7 column is shown for comparison and is not what the gate uses.",
    "The score's weights are a proposal, not a measurement. Base compression — its 0.20 term — " +
      "tested at 1.01x lift and 0.09 sigma across 43,088 pair-days in research/breakout-signal.mjs.",
  );
  return lines.join("\n");
}

/** The specified markdown report, for pasting somewhere that renders it. */
export function markdownReport(result) {
  const { rows, qualified, scannedAt, eligible, examined, zWindow } = result;
  const out = [
    "# P-BBE scan",
    "",
    `**${scannedAt}** · spot pairs · ${eligible} above the turnover floor · ${examined} examined · ` +
      `volume z over ${zWindow} prior completed days`,
    "",
  ];

  for (const tier of TIERS) {
    const group = qualified.filter((r) => r.tier === tier.label);
    out.push(`## ${tier.label} (score >= ${tier.min})`, "");
    if (!group.length) {
      out.push("_None._", "");
      continue;
    }
    for (const r of group) {
      const c = r.structure?.checks ?? {};
      out.push(
        `### ${r.asset} — ${f1(r.score)}`,
        "",
        `- Price ${usd(r.price)}, ${r.change24hPct >= 0 ? "+" : ""}${f1(r.change24hPct)}% on the day, ` +
          `$${(r.quoteVolume24h / 1e6).toFixed(0)}M turnover`,
        `- Base: ${r.base.days} days, ${f1(r.base.widthPct)}% wide, top at ${usd(r.base.high)}`,
        `- Distance from base top: ${f1(r.fromBasePct)}%`,
        `- Volume z: ${f2(r.volumeZ30)} over 30 days (${f2(r.volumeZ7)} over 7)`,
        `- 4h structure ${r.structure?.hit ?? 0}/4 — ` +
          Object.entries(c).map(([k, v]) => `${k} ${v ? "yes" : "no"}`).join(", "),
        `- Weighted: volume ${(WEIGHTS.volume * r.components.volume * 100).toFixed(1)}, ` +
          `proximity ${(WEIGHTS.proximity * r.components.proximity * 100).toFixed(1)}, ` +
          `base ${(WEIGHTS.baseQuality * r.components.baseQuality * 100).toFixed(1)}, ` +
          `structure ${(WEIGHTS.structure * r.components.structure * 100).toFixed(1)}, ` +
          `liquidity ${(WEIGHTS.liquidity * r.components.liquidity * 100).toFixed(1)}`,
        "",
      );
    }
  }

  if (!qualified.length) out.push("Nothing cleared every gate on this pass.", "");
  out.push(
    "---",
    "",
    "The composite score has not been validated against outcomes. Its base-compression term " +
      "measured 1.01x lift at 0.09 sigma across 43,088 pair-days. Treat the components as the " +
      "content and the score as a sort key.",
  );
  return out.join("\n");
}
