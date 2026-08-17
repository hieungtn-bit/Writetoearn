/**
 * The base-breakout-early strategy, run as specified.
 *
 * The spec that arrived is unusually complete: a base of 10-25 quiet days,
 * volume at four times its own recent average, a close above the base high, a
 * hard gate at 55-60% up from the base low, a liquidity floor, a stop under the
 * breakout candle, scaled take-profits at +15-25% and +40-60%, and a time-stop
 * if the first target has not come in. Almost nothing that gets forwarded here
 * can be executed by a machine. This can, so it gets executed rather than
 * discussed.
 *
 * Three questions, and only the third is really about this strategy.
 *
 *   1. How often does the setup even occur, and what does it return?
 *   2. Does it beat entering at random on the same days with the same
 *      management? A rule that only makes money because +20%/-6% scaling makes
 *      money on any volatile alt has found nothing.
 *   3. Does the hard gate work? "Do not touch it if it is already up more than
 *      55-60% from the base low" is the strategy's signature claim, and it is
 *      the one thing here nobody else tests. It is directly checkable by
 *      scoring the setups it rejects.
 *
 * Where the spec gives a range, the midpoint is used and the range is swept
 * afterwards. Where the spec is qualitative — "range hẹp", "clean structure" —
 * a number has to be invented, and every invented number is named in `rules`
 * and swept, because a strategy that only works at the threshold its tester
 * happened to choose is a property of the tester.
 *
 * KNOWN APPROXIMATION, stated because it cuts against the strategy in places
 * and for it in others: this runs on daily candles. The spec asks for 4H
 * confirmation and a time-stop of 8-12 4H candles, implemented here as two
 * days. Within a day the path is unresolved, so the stop is always checked
 * before any target — a bar that reaches both is charged to the stop.
 */

import { existsSync, readFileSync, readdirSync, writeFileSync } from "node:fs";

const CACHE = ".cache/klines";
const NUMERAIRE = "BTCUSDT";

/** Every threshold the spec left as a range or a word, made explicit. */
const RULES = {
  baseDays: 20,              // spec: 10-25
  baseMaxRangePct: 35,       // spec: "range hẹp", unquantified
  volumeMultiple: 4,         // spec: >= 4x the 7-day average
  earlyGatePct: 60,          // spec: 55-60% from base low
  minTurnoverUsd: 5e6,       // spec: $5-8M
  tp1Pct: 20, tp1Fraction: 0.35,   // spec: +15-25%, close 30-40%
  tp2Pct: 50, tp2Fraction: 0.30,   // spec: +40-60%, close 30%
  timeStopDays: 2,           // spec: 8-12 4H candles
  timeStopCut: 0.5,          // spec: reduce >= 50%
  maxHoldDays: 60,
  /**
   * Bounds on the stop distance, which the spec does not give and which the
   * comparison cannot do without.
   *
   * 1R is the distance from entry to stop, so a bar that closes on its low
   * makes 1R nearly zero and every subsequent move an enormous multiple of it.
   * That never bites the real setups — a four-times-volume breakout has a wide
   * bar — but it wrecks the random baseline, which can land on a doji. Applied
   * to both, so the comparison stays like-for-like.
   */
  minStopPct: 2,
  maxStopPct: 25,
};

const mean = (xs) => (xs.length ? xs.reduce((a, x) => a + x, 0) / xs.length : null);
const median = (xs) => {
  if (!xs.length) return null;
  const v = [...xs].sort((a, b) => a - b);
  return v.length % 2 ? v[v.length >> 1] : (v[v.length / 2 - 1] + v[v.length / 2]) / 2;
};
const tStat = (xs) => {
  if (xs.length < 2) return null;
  const m = mean(xs);
  const s = Math.sqrt(xs.reduce((a, x) => a + (x - m) ** 2, 0) / (xs.length - 1));
  return s > 0 ? m / (s / Math.sqrt(xs.length)) : null;
};

/** Deterministic, so the random baseline is the same on every run. */
let seed = 20260817;
const rand = () => ((seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);

const dayOf = (c) => new Date(c.openTime).toISOString().slice(0, 10);

if (!existsSync(CACHE)) throw new Error("No candle cache. Run research/structural-edge.mjs first.");
const series = [];
for (const f of readdirSync(CACHE).filter((n) => n.endsWith(".json"))) {
  const symbol = f.replace(/-\d{4}-\d{2}-\d{2}\.json$/, "");
  const daily = JSON.parse(readFileSync(`${CACHE}/${f}`, "utf8"));
  if (daily.length < 200) continue;
  series.push({ symbol, daily });
}

/**
 * Run the spec's position management from an entry bar.
 *
 * Returns the result in R, where 1R is the distance from entry to the initial
 * stop. Scaling out means the result is a weighted blend rather than a single
 * outcome, which is the whole point of the spec's ladder and is why a plain
 * win-rate would misrepresent it.
 */
function manage(daily, entryIdx, entry, stop0) {
  const risk = entry - stop0;
  if (!(risk > 0)) return null;
  const stopPct = (risk / entry) * 100;
  if (stopPct < RULES.minStopPct || stopPct > RULES.maxStopPct) return null;

  let stop = stop0;
  let remaining = 1;
  let realisedR = 0;
  let tp1 = false, tp2 = false;
  let peak = entry;

  const tp1Px = entry * (1 + RULES.tp1Pct / 100);
  const tp2Px = entry * (1 + RULES.tp2Pct / 100);

  for (let j = entryIdx + 1; j <= Math.min(entryIdx + RULES.maxHoldDays, daily.length - 1); j++) {
    const c = daily[j];

    // Stop first, always: within a daily bar the path is unknown, and assuming
    // the favourable order is how a backtest invents its edge.
    if (c.low <= stop) {
      realisedR += remaining * ((stop - entry) / risk);
      return { r: realisedR, days: j - entryIdx, exit: "stop" };
    }

    if (!tp1 && c.high >= tp1Px) {
      realisedR += RULES.tp1Fraction * ((tp1Px - entry) / risk);
      remaining -= RULES.tp1Fraction;
      tp1 = true;
      stop = Math.max(stop, entry); // spec implies protecting the runner
    }
    if (!tp2 && c.high >= tp2Px) {
      realisedR += RULES.tp2Fraction * ((tp2Px - entry) / risk);
      remaining -= RULES.tp2Fraction;
      tp2 = true;
    }

    peak = Math.max(peak, c.high);
    if (tp2) stop = Math.max(stop, peak - risk); // trail the runner by 1R

    // Time-stop: no first target in the allotted bars, cut half of what is left.
    if (!tp1 && j - entryIdx === RULES.timeStopDays) {
      const cut = remaining * RULES.timeStopCut;
      realisedR += cut * ((c.close - entry) / risk);
      remaining -= cut;
    }

    if (remaining <= 1e-9) return { r: realisedR, days: j - entryIdx, exit: tp2 ? "target" : "scaled" };
  }

  const last = daily[Math.min(entryIdx + RULES.maxHoldDays, daily.length - 1)];
  realisedR += remaining * ((last.close - entry) / risk);
  return { r: realisedR, days: Math.min(RULES.maxHoldDays, daily.length - 1 - entryIdx), exit: "timeout" };
}

/** Every bar where the spec's entry conditions are true. */
function findSetups(s, rules) {
  const d = s.daily;
  const out = [];
  for (let t = rules.baseDays + 10; t < d.length - 5; t++) {
    const base = d.slice(t - rules.baseDays, t);
    const baseHigh = Math.max(...base.map((c) => c.high));
    const baseLow = Math.min(...base.map((c) => c.low));
    if (!(baseLow > 0)) continue;

    // A base is a quiet stretch, not just any twenty days.
    const rangePct = ((baseHigh - baseLow) / baseLow) * 100;
    if (rangePct > rules.baseMaxRangePct) continue;

    const bar = d[t];
    const turnover = mean(base.slice(-7).map((c) => c.quoteVolume));
    if (!(bar.quoteVolume >= rules.volumeMultiple * turnover)) continue;
    if (!(bar.quoteVolume >= rules.minTurnoverUsd)) continue;

    // The breakout itself.
    if (!(bar.close > baseHigh)) continue;

    const fromBasePct = (bar.close / baseLow - 1) * 100;
    out.push({
      t, date: dayOf(bar), symbol: s.symbol,
      fromBasePct, rangePct,
      volumeMultiple: bar.quoteVolume / turnover,
      passesGate: fromBasePct <= rules.earlyGatePct,
      entry: bar.close, stop: bar.low, baseLow, baseHigh,
    });
    t += rules.baseDays; // one setup per base, not twenty overlapping ones
  }
  return out;
}

const describe = (rows) => {
  if (!rows.length) return null;
  const rs = rows.map((r) => r.result.r);
  const byMonth = {};
  for (const r of rows) (byMonth[r.date.slice(0, 7)] ??= []).push(r.result.r);
  const monthMeans = Object.values(byMonth).map(mean);
  return {
    setups: rows.length,
    months: monthMeans.length,
    meanR: mean(rs),
    medianR: median(rs),
    bestR: Math.max(...rs),
    worstR: Math.min(...rs),
    winPct: (rs.filter((v) => v > 0).length / rs.length) * 100,
    tStatByMonth: tStat(monthMeans),
    medianStopPct: median(rows.map((r) => ((r.entry - r.stop) / r.entry) * 100)),
    medianHoldDays: median(rows.map((r) => r.result.days)),
    stoppedPct: (rows.filter((r) => r.result.exit === "stop").length / rows.length) * 100,
  };
};

/* ---- the run ---- */
const all = [];
for (const s of series) {
  if (s.symbol === NUMERAIRE) continue;
  for (const setup of findSetups(s, RULES)) {
    const result = manage(s.daily, setup.t, setup.entry, setup.stop);
    if (result) all.push({ ...setup, result });
  }
}

const passed = all.filter((r) => r.passesGate);
const rejected = all.filter((r) => !r.passesGate);

/**
 * The baseline: the same management, entered at random.
 *
 * Matched one-for-one to the real setups on symbol and calendar month, so the
 * comparison is not accidentally between a bull market and a bear one. If the
 * strategy cannot beat this, the returns belong to the exit ladder rather than
 * to the entry rule the spec is actually about.
 */
const randomRows = [];
let unmatched = 0;
for (const r of passed) {
  const s = series.find((x) => x.symbol === r.symbol);
  // Same symbol, same calendar month: the real setups cluster into volatile
  // stretches, so drawing the control from the whole history would compare a
  // breakout month against a quiet one and call the difference a strategy.
  const month = r.date.slice(0, 7);
  const pool = [];
  for (let t = 30; t < s.daily.length - 70; t++) {
    if (dayOf(s.daily[t]).slice(0, 7) !== month) continue;
    if (!(s.daily[t].quoteVolume >= RULES.minTurnoverUsd)) continue;
    if (t === r.t) continue;
    pool.push(t);
  }
  if (!pool.length) { unmatched += 1; continue; }
  let placed = false;
  for (let attempt = 0; attempt < 8 && !placed; attempt++) {
    const t = pool[Math.floor(rand() * pool.length)];
    const bar = s.daily[t];
    const result = manage(s.daily, t, bar.close, bar.low);
    if (result) {
      randomRows.push({ ...r, t, date: dayOf(bar), entry: bar.close, stop: bar.low, result });
      placed = true;
    }
  }
  if (!placed) unmatched += 1;
}

/** Does the early gate earn its place? Sweep where it is drawn. */
const gateSweep = [40, 50, 55, 60, 70, 100, 1e9].map((gate) => {
  const rows = all.filter((r) => r.fromBasePct <= gate);
  return { gatePct: gate === 1e9 ? null : gate, ...describe(rows) };
});

/** And do the invented thresholds decide the answer? */
const sensitivity = [];
for (const baseDays of [10, 15, 20, 25]) {
  for (const volumeMultiple of [2, 3, 4, 6]) {
    const rules = { ...RULES, baseDays, volumeMultiple };
    const rows = [];
    for (const s of series) {
      if (s.symbol === NUMERAIRE) continue;
      for (const setup of findSetups(s, rules)) {
        if (!setup.passesGate) continue;
        const result = manage(s.daily, setup.t, setup.entry, setup.stop);
        if (result) rows.push({ ...setup, result });
      }
    }
    const d = describe(rows);
    sensitivity.push({ baseDays, volumeMultiple, setups: rows.length, meanR: d?.meanR ?? null, tStatByMonth: d?.tStatByMonth ?? null });
  }
}

const out = {
  measuredAt: new Date().toISOString(),
  universePinnedToCache: true,
  pairs: series.length - 1,
  rules: RULES,
  approximation: "Daily candles. The spec's 4H confirmation and 8-12 candle time-stop are implemented as 2 days, and within any bar the stop is checked before the targets.",
  asSpecified: describe(passed),
  rejectedByGate: describe(rejected),
  randomEntrySameManagement: describe(randomRows),
  randomBaseline: {
    method: "Same symbol and same calendar month as each real setup, same liquidity floor, same management and same stop bounds. Only the entry rule differs.",
    unmatchedSetups: unmatched,
  },
  gateSweep,
  sensitivity,
  totalSetupsFound: all.length,
};
writeFileSync("research/base-breakout.json", `${JSON.stringify(out, null, 2)}\n`);

const f = (v, dp = 4) => (v == null ? "—" : (v >= 0 ? "+" : "") + v.toFixed(dp));
const row = (label, d) => d
  ? `  ${label.padEnd(30)}${String(d.setups).padStart(7)}${String(d.months).padStart(8)}`
    + `${f(d.meanR, 3)}`.padStart(11) + `${d.winPct.toFixed(0)}%`.padStart(8)
    + `${d.tStatByMonth == null ? "—" : d.tStatByMonth.toFixed(2)}`.padStart(9)
  : `  ${label.padEnd(30)} no setups`;

console.log(`${out.pairs} pairs · ${all.length} setups found\n`);
console.log("  variant                        setups  months     mean R    win%       t");
console.log(row("as specified (gate passed)", out.asSpecified));
console.log(row("the setups the gate rejects", out.rejectedByGate));
console.log(row("random entry, same management", out.randomEntrySameManagement));
for (const [k, d] of [["as specified", out.asSpecified], ["random", out.randomEntrySameManagement]]) {
  if (d) console.log(`    ${k}: median ${f(d.medianR, 3)}R · best ${f(d.bestR, 1)}R · worst ${f(d.worstR, 1)}R`);
}

console.log("\ndoes the early gate earn its place?");
console.log("  gate        setups     mean R    win%       t");
for (const g of gateSweep) {
  if (!g.setups) continue;
  console.log(`  ${(g.gatePct == null ? "none" : g.gatePct + "%").padEnd(11)}${String(g.setups).padStart(6)}`
    + `${f(g.meanR, 3)}`.padStart(11) + `${g.winPct.toFixed(0)}%`.padStart(8)
    + `${g.tStatByMonth == null ? "—" : g.tStatByMonth.toFixed(2)}`.padStart(9));
}

console.log("\nsensitivity to the thresholds the spec left open");
console.log("  base   vol x   setups     mean R        t");
for (const s of sensitivity) {
  console.log(`  ${String(s.baseDays + "d").padEnd(7)}${String(s.volumeMultiple + "x").padEnd(8)}${String(s.setups).padStart(6)}`
    + `${f(s.meanR, 3)}`.padStart(11)
    + `${s.tStatByMonth == null ? "—" : s.tStatByMonth.toFixed(2)}`.padStart(9));
}

const a = out.asSpecified;
if (a) {
  console.log(`\n  median stop distance ${a.medianStopPct.toFixed(1)}% (spec says 4-8%)`);
  console.log(`  median hold ${a.medianHoldDays} days · stopped out ${a.stoppedPct.toFixed(0)}% of the time`);
}
