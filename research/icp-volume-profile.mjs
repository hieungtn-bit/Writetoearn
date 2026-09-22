/**
 * A real volume profile for ICP, against an estimated one.
 *
 * A reader sent a volume-profile read with an estimated POC, value area and
 * overhead share. Every one of those is computable rather than estimable, and
 * the interesting part is that this codebase's own overhead figure is built on
 * a coarser method than theirs.
 *
 * `computeStageMetrics` charges a whole daily bar to one side of the current
 * price based on that bar's typical price. A day that traded through the
 * current price contributes all of its volume or none of it. That is fast and
 * reproducible from a daily export, which is why it was written that way, but
 * it cannot see inside a bar.
 *
 * So this builds the profile properly: hourly bars, each bar's quote volume
 * spread across the price bins its high-low range covers. Spreading uniformly
 * is an approximation too — an hour does not trade evenly across its range —
 * but it is a far finer one than charging a whole day to one side, and it is
 * the standard way a profile is built without tick data.
 *
 * The comparison at the end is the point: if the two methods disagree
 * materially, the daily one is understating something the board reports.
 */

import { writeFileSync } from "node:fs";
import { fetchKlines } from "../src/analysis.mjs";
import { computeStageMetrics } from "../src/stage.mjs";

const SYMBOL = "ICPUSDT";
const DAYS = 30;
const BINS = 200;
const VALUE_AREA = 0.70;

/** 30 days of hourly bars: 720 of them, fetched in one page. */
const hourly = await fetchKlines(SYMBOL, { interval: "1h", limit: DAYS * 24 });
const daily = await fetchKlines(SYMBOL, { interval: "1d", limit: DAYS + 5 });
const price = hourly.at(-1).close;

const lo = Math.min(...hourly.map((c) => c.low));
const hi = Math.max(...hourly.map((c) => c.high));
const width = (hi - lo) / BINS;

/**
 * Volume at price.
 *
 * Each bar's volume is spread across every bin its range touches, weighted by
 * how much of the bin that bar actually covers, so a bar spanning two bins
 * does not donate equally to a bin it barely clips.
 */
const bins = Array.from({ length: BINS }, (_, i) => ({
  low: lo + i * width,
  high: lo + (i + 1) * width,
  mid: lo + (i + 0.5) * width,
  volume: 0,
}));

for (const c of hourly) {
  const span = c.high - c.low;
  if (span <= 0) {
    // A flat hour still traded; put it all in the bin containing its price.
    const i = Math.min(BINS - 1, Math.max(0, Math.floor((c.close - lo) / width)));
    bins[i].volume += c.quoteVolume;
    continue;
  }
  const first = Math.max(0, Math.floor((c.low - lo) / width));
  const last = Math.min(BINS - 1, Math.floor((c.high - lo) / width));
  for (let i = first; i <= last; i++) {
    const overlap = Math.min(c.high, bins[i].high) - Math.max(c.low, bins[i].low);
    if (overlap > 0) bins[i].volume += c.quoteVolume * (overlap / span);
  }
}

const total = bins.reduce((s, b) => s + b.volume, 0);

/** Point of control: the single busiest price bin. */
const poc = bins.reduce((best, b) => (b.volume > best.volume ? b : best), bins[0]);

/**
 * Value area: grow outward from the POC, always taking the richer neighbour,
 * until 70% of volume is enclosed. This is the standard construction.
 */
let lower = bins.indexOf(poc), upper = lower, acc = poc.volume;
while (acc < total * VALUE_AREA && (lower > 0 || upper < BINS - 1)) {
  const below = lower > 0 ? bins[lower - 1].volume : -1;
  const above = upper < BINS - 1 ? bins[upper + 1].volume : -1;
  if (above >= below) { upper += 1; acc += bins[upper].volume; }
  else { lower -= 1; acc += bins[lower].volume; }
}

/** Overhead by profile: volume sitting above the current price. */
const overheadProfile = bins.reduce(
  (s, b) => s + (b.mid > price ? b.volume : 0), 0,
) / total * 100;

/** Overhead the board actually publishes, from whole daily bars. */
const stage = computeStageMetrics(daily.slice(-DAYS), price);

/** Their zone estimates, checked against measured share of volume. */
const zoneShare = (from, to) =>
  bins.reduce((s, b) => s + (b.mid >= from && b.mid < to ? b.volume : 0), 0) / total * 100;

const zones = {
  "2.00-2.08": zoneShare(2.00, 2.08),
  "2.08-2.18": zoneShare(2.08, 2.18),
  "2.18-2.28": zoneShare(2.18, 2.28),
  "2.28-2.38": zoneShare(2.28, 2.38),
  "2.38-2.45": zoneShare(2.38, 2.45),
};

/** The two phases they describe, by UTC date. */
const between = (a, b) => hourly.filter((c) => {
  const d = new Date(c.openTime).toISOString().slice(0, 10);
  return d >= a && d <= b;
});
const phase = (a, b) => {
  const w = between(a, b);
  if (!w.length) return null;
  return {
    low: Math.min(...w.map((c) => c.low)),
    high: Math.max(...w.map((c) => c.high)),
    meanHourlyQuoteUsd: w.reduce((s, c) => s + c.quoteVolume, 0) / w.length,
    hours: w.length,
  };
};
const base = phase("2026-08-01", "2026-08-07");
const expansion = phase("2026-08-08", "2026-08-11");

const range30 = { lo: Math.min(...daily.slice(-30).map((c) => c.low)), hi: Math.max(...daily.slice(-30).map((c) => c.high)) };
const rangePositionPct = ((price - range30.lo) / (range30.hi - range30.lo)) * 100;

const claims = {
  "POC lands in their 2.13-2.17 estimate": poc.mid >= 2.13 && poc.mid <= 2.17,
  "value area low near their 2.08": Math.abs(bins[lower].low - 2.08) < 0.05,
  "value area high near their 2.28": Math.abs(bins[upper].high - 2.28) < 0.05,
  "overhead is 43-47% as they estimate": overheadProfile >= 43 && overheadProfile <= 47,
  "range position is 68-75% as they estimate": rangePositionPct >= 68 && rangePositionPct <= 75,
  "2.08-2.18 is the thickest zone": Object.entries(zones).every(([k, v]) => k === "2.08-2.18" || v <= zones["2.08-2.18"]),
  "2.28-2.38 is thinner than 2.18-2.28": zones["2.28-2.38"] < zones["2.18-2.28"],
  "base phase traded 2.02-2.15": base && base.low >= 2.00 && base.high <= 2.18,
  "expansion phase volume beat the base phase": expansion && base && expansion.meanHourlyQuoteUsd > base.meanHourlyQuoteUsd,
  "the two overhead methods agree within 5 points": Math.abs(overheadProfile - stage.underwaterPct) < 5,
};

const out = {
  measuredAt: new Date().toISOString(),
  symbol: SYMBOL, price, days: DAYS, hourlyBars: hourly.length, bins: BINS,
  claims,
  profile: {
    pocPrice: poc.mid,
    pocBin: [poc.low, poc.high],
    valueAreaLow: bins[lower].low,
    valueAreaHigh: bins[upper].high,
    valueAreaSharePct: (acc / total) * 100,
    profileLow: lo, profileHigh: hi, binWidth: width,
  },
  overhead: {
    byProfilePct: overheadProfile,
    byDailyBarsPct: stage.underwaterPct,
    differencePoints: overheadProfile - stage.underwaterPct,
  },
  zones,
  phases: { base, expansion },
  range30: { ...range30, positionPct: rangePositionPct },
  vwap30d: stage.vwap,
  volumeTrendPct: stage.volumeTrendPct,
  stage: stage.stage,
};

writeFileSync("research/icp-volume-profile.json", `${JSON.stringify(out, null, 2)}\n`);

console.log(`ICP $${price}  ·  ${hourly.length} hourly bars  ·  ${BINS} bins of $${width.toFixed(4)}\n`);
console.log(`POC          $${poc.mid.toFixed(4)}`);
console.log(`Value area   $${bins[lower].low.toFixed(4)} – $${bins[upper].high.toFixed(4)}  (${((acc / total) * 100).toFixed(1)}% of volume)`);
console.log(`30d VWAP     $${stage.vwap.toFixed(4)}`);
console.log(`Range 30d    $${range30.lo.toFixed(4)} – $${range30.hi.toFixed(4)}  → position ${rangePositionPct.toFixed(1)}%\n`);
console.log(`Overhead by profile      ${overheadProfile.toFixed(1)}%`);
console.log(`Overhead by daily bars   ${stage.underwaterPct.toFixed(1)}%   <- what the board publishes`);
console.log(`Difference               ${(overheadProfile - stage.underwaterPct).toFixed(1)} points\n`);
console.log("Zone shares of 30d volume:");
for (const [k, v] of Object.entries(zones)) console.log(`  $${k}   ${v.toFixed(2)}%`);
console.log("\nPhases:");
console.log("  base      ", base && `$${base.low.toFixed(3)}–$${base.high.toFixed(3)}  mean hourly $${(base.meanHourlyQuoteUsd / 1e3).toFixed(0)}k`);
console.log("  expansion ", expansion && `$${expansion.low.toFixed(3)}–$${expansion.high.toFixed(3)}  mean hourly $${(expansion.meanHourlyQuoteUsd / 1e3).toFixed(0)}k`);
console.log("\nClaims:");
for (const [k, v] of Object.entries(claims)) console.log(`  ${v ? "OK  " : "NO  "} ${k}`);
