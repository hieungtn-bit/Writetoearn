/**
 * Three proposed BNB setups, scored the way this desk scores its own.
 *
 * A reader combined a 4H structure read with a volume profile and produced
 * three specific ladders. Ladders are the most checkable thing anyone can
 * publish: every one implies a required win rate, and every one can be walked
 * bar by bar against history.
 *
 * Their point of control is $598–605. Mine, over 30 days, is $571. Rather than
 * assume one of us is wrong, the profile is rebuilt over five windows — a POC
 * is a property of its lookback, and a shorter one would sit higher after a
 * rally. If theirs matches a shorter window, they are reading a different and
 * equally legitimate profile, and the disagreement is about which window
 * answers the question.
 */

import { writeFileSync } from "node:fs";
import { analyzeAsset, atr, fetchKlines } from "../src/analysis.mjs";
import { volumeProfile } from "../src/profile.mjs";
import { walk } from "../src/signals.mjs";

const SYMBOL = "BNBUSDT";

/** The exchange returns 503 under load; a partial fetch must not become a post. */
const retry = async (fn, n = 6) => {
  let last;
  for (let i = 0; i < n; i++) {
    try { return await fn(); } catch (e) { last = e; await new Promise((r) => setTimeout(r, 1200 * (i + 1))); }
  }
  throw last;
};

const daily = await retry(() => fetchKlines(SYMBOL, { interval: "1d", limit: 1000 }));
const hourly = await retry(() => fetchKlines(SYMBOL, { interval: "1h", limit: 1000 }));
const h4 = await retry(() => fetchKlines(SYMBOL, { interval: "4h", limit: 500 }));
const analysis = await retry(() => analyzeAsset(SYMBOL, { candles: daily }));
const price = analysis.price;
const atrPct = (atr(daily, 14) / price) * 100;

const median = (xs) => {
  const s = [...xs].sort((a, b) => a - b);
  return s.length % 2 ? s[s.length >> 1] : (s[s.length / 2 - 1] + s[s.length / 2]) / 2;
};

/** Weekly high-to-low range: what a stop held over a week must survive. */
const weeks = [];
for (let i = 0; i + 7 <= daily.length; i += 7) {
  const w = daily.slice(i, i + 7);
  const lo = Math.min(...w.map((c) => c.low));
  weeks.push(((Math.max(...w.map((c) => c.high)) - lo) / lo) * 100);
}
const medianWeekPct = median(weeks);

/** The profile at several lookbacks, because a POC belongs to its window. */
const profiles = {};
for (const days of [7, 14, 30, 60, 90]) {
  const bars = hourly.slice(-days * 24);
  if (bars.length < 24) continue;
  const p = volumeProfile(bars, price);
  if (p) {
    profiles[`${days}d`] = {
      poc: p.pocPrice, valueAreaLow: p.valueAreaLow, valueAreaHigh: p.valueAreaHigh,
      overheadPct: p.overheadPct,
      matchesTheirPoc: p.pocPrice >= 598 && p.pocPrice <= 605,
    };
  }
}

/**
 * Each proposed ladder, using the midpoint of every stated zone.
 *
 * Scored on the daily series because the horizons are multi-day; a 4H entry
 * trigger does not change where the stop and target sit.
 */
const SETUPS = {
  "1 · pullback long": { direction: "long", entry: 601, stop: 589, targets: { TP1: 613.5, TP2: 632.5 } },
  "2 · breakout long": { direction: "long", entry: 616.5, stop: 598, targets: { TP1: 633.5, TP2: 650, TP3: 670 } },
  "3 · reject short": { direction: "short", entry: 610, stop: 619, targets: { TP1: 600, TP2: 586.5 } },
};

const scored = {};
for (const [name, s] of Object.entries(SETUPS)) {
  const long = s.direction === "long";
  const stopPct = Math.abs((s.entry - s.stop) / s.entry) * 100;
  const cells = {};
  for (const [tp, level] of Object.entries(s.targets)) {
    const targetPct = Math.abs((level - s.entry) / s.entry) * 100;
    const rr = targetPct / stopPct;
    for (const horizon of [10, 30]) {
      const r = walk(daily.slice(-365), { direction: s.direction, stopPct, targetPct, horizon });
      if (!r) continue;
      cells[`${tp} · ${horizon}d`] = {
        rr: Number(rr.toFixed(2)),
        breakEvenHitPct: Number((100 / (1 + rr)).toFixed(1)),
        hitPct: Number(r.hitPct.toFixed(1)),
        stoppedPct: Number(r.stoppedPct.toFixed(1)),
        expectancyR: Number(r.expectancyR.toFixed(3)),
        effectiveN: Number(r.effectiveN.toFixed(1)),
      };
    }
  }
  scored[name] = {
    ...s,
    stopPct,
    stopInAtr: stopPct / atrPct,
    stopInMedianWeek: stopPct / medianWeekPct,
    /** What they take off at TP1, blended with the rest at TP2. */
    firstTargetRr: Number((Math.abs((Object.values(s.targets)[0] - s.entry) / s.entry) * 100 / stopPct).toFixed(2)),
    cells,
  };
}

/** 4H structure: is price above the moving averages the read leans on? */
const closes4h = h4.map((c) => c.close);
const sma = (n) => closes4h.slice(-n).reduce((a, b) => a + b, 0) / n;

const claims = {
  // Their POC is correct for a short lookback and wrong for a long one, which
  // is a disagreement about the question rather than about the arithmetic.
  "their POC is right on a one-week profile": profiles["7d"].matchesTheirPoc,
  "and wrong on a one-month profile": !profiles["30d"].matchesTheirPoc && profiles["30d"].poc < 590,
  "the profile stops moving past a month": Math.abs(profiles["30d"].poc - profiles["90d"].poc) < 5,
  "setup 1's first target pays less than its risk": scored["1 · pullback long"].firstTargetRr < 1.2,
  "setup 2's first target pays less than its risk": scored["2 · breakout long"].firstTargetRr < 1.2,
  "setup 1's stop is inside a single day of noise": scored["1 · pullback long"].stopInAtr < 1.1,
  "setup 3's stop is well inside a day": scored["3 · reject short"].stopInAtr < 1,
  "waiting for the breakout widens the risk leg": scored["2 · breakout long"].stopPct > scored["1 · pullback long"].stopPct,
  "no stop reaches a median week": Object.values(scored).every((s) => s.stopInMedianWeek < 1),
};

const out = {
  measuredAt: new Date().toISOString(),
  symbol: SYMBOL, price, atrPct, medianWeekPct,
  claims,
  theirPoc: [598, 605],
  profiles,
  structure4h: { sma20: sma(20), sma50: sma(50), sma200: sma(200), price },
  rangePosition30d: analysis.rangePosition30d,
  setups: scored,
};
writeFileSync("research/bnb-setups.json", `${JSON.stringify(out, null, 2)}\n`);

console.log(`BNB $${price}  ATR ${atrPct.toFixed(2)}%/day  median week ${medianWeekPct.toFixed(1)}%\n`);
console.log("POC by lookback (they say $598–605):");
for (const [w, p] of Object.entries(profiles)) {
  console.log(`  ${w.padStart(4)}  POC $${p.poc.toFixed(2)}  VA $${p.valueAreaLow.toFixed(2)}–$${p.valueAreaHigh.toFixed(2)}  ${p.matchesTheirPoc ? "MATCHES" : ""}`);
}
console.log("\n4H structure: price", price.toFixed(2), "| SMA20", sma(20).toFixed(2), "SMA50", sma(50).toFixed(2), "SMA200", sma(200).toFixed(2));
for (const [name, s] of Object.entries(scored)) {
  console.log(`\n${name}`);
  console.log(`  entry ${s.entry}  stop ${s.stop} (${s.stopPct.toFixed(2)}% = ${s.stopInAtr.toFixed(2)} ATR = ${s.stopInMedianWeek.toFixed(2)}x week)`);
  console.log(`  first target pays ${s.firstTargetRr} : 1`);
  for (const [k, c] of Object.entries(s.cells)) {
    console.log(`    ${k.padEnd(14)} R:R ${String(c.rr).padStart(5)}  needs ${String(c.breakEvenHitPct).padStart(5)}%  got ${String(c.hitPct).padStart(5)}%  E ${String(c.expectancyR).padStart(7)}R  n≈${c.effectiveN}`);
  }
}
console.log("\nClaims:");
for (const [k, v] of Object.entries(claims)) console.log(`  ${v ? "OK  " : "NO  "} ${k}`);
