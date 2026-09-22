/**
 * Does a BSC hardfork move BNB? Measured against every previous one.
 *
 * The Pasteur upgrade activates on 25 August. A reader sent the specification
 * and asked what it means for price, and the honest answer is not an opinion
 * about builder-proposed blocks. It is: this has happened twenty times
 * before, on a chain whose client publishes the exact activation instant, and
 * nobody has to guess.
 *
 * Three decisions make the measurement worth trusting or not.
 *
 * The dates are read from the source, not remembered. params/config.go in the
 * BSC client carries every mainnet activation — some as Unix timestamps, the
 * older ones as block heights — so the file is fetched at run time and the
 * heights resolved through a public RPC. A study of scheduled events built on
 * recalled dates is a study of my memory.
 *
 * The return is measured against BTC, not against the dollar. BNB rising on a
 * day the whole market rose is not a hardfork effect, and this desk has already
 * published what happens when that distinction is skipped: an apparent edge of
 * +0.08R against USDT became +0.34R against BTC, because the numeraire was
 * carrying the result. Both are reported here; the BTC-relative one is the
 * one that answers the question.
 *
 * The control is the surrounding regime, not the whole history. For each event
 * the same windows are measured on every other day within sixty days of it,
 * excluding days near any other fork. That holds the market regime roughly
 * fixed, which random sampling across five years does not.
 *
 * And the part that decides whether any of this can be published as a finding:
 * with twenty events, the study is asked what it could have detected. A
 * result is only news if the test had the power to find it, and stating the
 * detectable effect size beside the measured one is the difference between
 * "no effect" and "no evidence either way".
 *
 * Writes research/bnb-hardfork.json.
 */

import { writeFileSync } from "node:fs";
import { fetchKlines } from "../src/analysis.mjs";

const CONFIG_URL = "https://raw.githubusercontent.com/bnb-chain/bsc/master/params/config.go";
const RPC = "https://bsc-dataseed.bnbchain.org";
const DAY_MS = 86_400_000;

const retry = async (fn, n = 5) => {
  let last;
  for (let i = 0; i < n; i++) {
    try { return await fn(); } catch (e) { last = e; await new Promise((r) => setTimeout(r, 800 * (i + 1))); }
  }
  throw last;
};

const mean = (xs) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null);
const median = (xs) => {
  if (!xs.length) return null;
  const s = [...xs].sort((a, b) => a - b);
  const m = s.length >> 1;
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};
const stdev = (xs) => {
  if (xs.length < 2) return null;
  const m = mean(xs);
  return Math.sqrt(xs.reduce((a, x) => a + (x - m) ** 2, 0) / (xs.length - 1));
};
/** Welch, because the two samples differ in size by two orders of magnitude. */
const welch = (a, b) => {
  if (a.length < 2 || b.length < 2) return null;
  const va = stdev(a) ** 2 / a.length, vb = stdev(b) ** 2 / b.length;
  return (mean(a) - mean(b)) / Math.sqrt(va + vb);
};

/**
 * Welch-Satterthwaite degrees of freedom.
 *
 * With twenty events against seventeen hundred control days the effective df
 * is set almost entirely by the small sample, which is exactly why the t has
 * to be turned into a p-value against ~19 df rather than read off a normal
 * table. At this size the difference decides the conclusion: |t| = 2.67 is
 * p = 0.008 on a normal and p = 0.015 on nineteen degrees of freedom.
 */
const welchDf = (a, b) => {
  const va = stdev(a) ** 2 / a.length, vb = stdev(b) ** 2 / b.length;
  return (va + vb) ** 2 / (va ** 2 / (a.length - 1) + vb ** 2 / (b.length - 1));
};

/* Regularised incomplete beta, by the standard continued fraction, so the
 * p-value is computed rather than eyeballed off a table. */
const logGamma = (x) => {
  const c = [76.18009172947146, -86.50532032941677, 24.01409824083091,
    -1.231739572450155, 0.1208650973866179e-2, -0.5395239384953e-5];
  let y = x, tmp = x + 5.5;
  tmp -= (x + 0.5) * Math.log(tmp);
  let ser = 1.000000000190015;
  for (let j = 0; j < 6; j++) ser += c[j] / ++y;
  return -tmp + Math.log(2.5066282746310005 * ser / x);
};
const betacf = (a, b, x) => {
  const FPMIN = 1e-300, EPS = 3e-16;
  const qab = a + b, qap = a + 1, qam = a - 1;
  let c = 1, d = 1 - qab * x / qap;
  if (Math.abs(d) < FPMIN) d = FPMIN;
  d = 1 / d;
  let h = d;
  for (let m = 1; m <= 300; m++) {
    const m2 = 2 * m;
    let aa = m * (b - m) * x / ((qam + m2) * (a + m2));
    d = 1 + aa * d; if (Math.abs(d) < FPMIN) d = FPMIN;
    c = 1 + aa / c; if (Math.abs(c) < FPMIN) c = FPMIN;
    d = 1 / d; h *= d * c;
    aa = -(a + m) * (qab + m) * x / ((a + m2) * (qap + m2));
    d = 1 + aa * d; if (Math.abs(d) < FPMIN) d = FPMIN;
    c = 1 + aa / c; if (Math.abs(c) < FPMIN) c = FPMIN;
    d = 1 / d;
    const del = d * c;
    h *= del;
    if (Math.abs(del - 1) < EPS) break;
  }
  return h;
};
const betai = (a, b, x) => {
  if (x <= 0) return 0;
  if (x >= 1) return 1;
  const bt = Math.exp(logGamma(a + b) - logGamma(a) - logGamma(b) + a * Math.log(x) + b * Math.log(1 - x));
  return x < (a + 1) / (a + b + 2) ? bt * betacf(a, b, x) / a : 1 - bt * betacf(b, a, 1 - x) / b;
};
/** Two-sided p for a t statistic on df degrees of freedom. */
const tTwoSidedP = (t, df) =>
  (t == null || !Number.isFinite(df) ? null : betai(df / 2, 0.5, df / (df + t * t)));

/* ------------------------------------------------------------------ *
 * 1. Where the dates come from
 * ------------------------------------------------------------------ */

const source = await retry(async () => {
  const r = await fetch(CONFIG_URL, { signal: AbortSignal.timeout(30_000) });
  if (!r.ok) throw new Error(`config.go -> ${r.status}`);
  return r.text();
});

/**
 * Only the mainnet config.
 *
 * The same file carries Chapel and Rialto, whose forks activated on different
 * days entirely. Slicing to the mainnet block first means a testnet timestamp
 * cannot wander into a study about mainnet.
 */
const mainnet = (() => {
  const start = source.indexOf("BSCChainConfig");
  if (start < 0) throw new Error("BSCChainConfig not found in config.go");
  const rest = source.slice(start);
  const end = rest.indexOf("ChapelChainConfig");
  return end > 0 ? rest.slice(0, end) : rest;
})();

const timeForks = [...mainnet.matchAll(/(\w+)Time:\s*newUint64\((\d[\d_]*)\)/g)]
  .map((m) => ({ name: m[1], unixSeconds: Number(m[2].replace(/_/g, "")), from: "timestamp" }));

const blockForks = [...mainnet.matchAll(/(\w+)Block:\s*big\.NewInt\((\d[\d_]*)\)/g)]
  .map((m) => ({ name: m[1], block: Number(m[2].replace(/_/g, "")) }))
  .filter((f) => f.block > 0);

/** Block heights resolved to wall-clock through a public node. */
for (const f of blockForks) {
  const body = await retry(async () => {
    const r = await fetch(RPC, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        jsonrpc: "2.0", id: 1, method: "eth_getBlockByNumber",
        params: [`0x${f.block.toString(16)}`, false],
      }),
      signal: AbortSignal.timeout(30_000),
    });
    if (!r.ok) throw new Error(`rpc -> ${r.status}`);
    return r.json();
  });
  if (body.result?.timestamp) {
    f.unixSeconds = parseInt(body.result.timestamp, 16);
    f.from = "block height, resolved via RPC";
  }
}

/**
 * One event per activation instant, not one per proposal name.
 *
 * Several upgrades share a moment — Shanghai with Kepler, Cancun with Haber,
 * Osaka with Mendel, and Berlin, London and Hertz all at one block. Counting
 * those separately would score the same day up to three times and inflate the
 * sample exactly the way scoring one rebalance sixty times once inflated a
 * t-statistic on this desk from 1.46 to 5.69.
 *
 * An hour is the tolerance: HaberFix and Bohr are eighteen minutes apart and
 * are plainly one upgrade window, not two events.
 */
const TOLERANCE_S = 3600;
const activations = [];
for (const f of [...timeForks, ...blockForks].filter((f) => f.unixSeconds).sort((a, b) => a.unixSeconds - b.unixSeconds)) {
  const last = activations.at(-1);
  if (last && f.unixSeconds - last.unixSeconds <= TOLERANCE_S) {
    last.names.push(f.name);
    continue;
  }
  activations.push({ unixSeconds: f.unixSeconds, names: [f.name], from: f.from });
}
for (const a of activations) a.at = new Date(a.unixSeconds * 1000).toISOString();

const now = Date.now();
const upcoming = activations.filter((a) => a.unixSeconds * 1000 > now);
const past = activations.filter((a) => a.unixSeconds * 1000 <= now);

/* ------------------------------------------------------------------ *
 * 2. Price, paged back far enough to cover the oldest fork
 * ------------------------------------------------------------------ */

const series = async (symbol) => {
  const out = [];
  let cursor = Date.UTC(2020, 0, 1);
  while (cursor < now) {
    const rows = await retry(() => fetchKlines(symbol, { interval: "1d", limit: 1000, startTime: cursor }));
    if (!rows.length) break;
    out.push(...rows);
    const next = rows.at(-1).openTime + DAY_MS;
    if (next <= cursor) break;
    cursor = next;
  }
  const seen = new Map();
  for (const r of out) seen.set(r.openTime, r);
  return [...seen.values()].sort((a, b) => a.openTime - b.openTime);
};

const bnb = await series("BNBUSDT");
const btc = await series("BTCUSDT");

const closeAt = (rows, t) => {
  // The last daily close completed at or before t — never the bar straddling
  // it, whose close lies in the future relative to the moment being measured.
  let hit = null;
  for (const r of rows) {
    if (r.openTime + DAY_MS <= t) hit = r; else break;
  }
  return hit?.close ?? null;
};

/** Return over a window that ends `t`, or starts it, in percent. */
const windowReturn = (rows, from, to) => {
  const a = closeAt(rows, from), b = closeAt(rows, to);
  return a && b ? ((b / a) - 1) * 100 : null;
};

const WINDOWS = [
  { key: "pre7", label: "7d before", from: -7, to: 0 },
  { key: "pre3", label: "3d before", from: -3, to: 0 },
  { key: "pre1", label: "1d before", from: -1, to: 0 },
  { key: "post1", label: "1d after", from: 0, to: 1 },
  { key: "post3", label: "3d after", from: 0, to: 3 },
  { key: "post7", label: "7d after", from: 0, to: 7 },
];

/**
 * Both readings, side by side.
 *
 * `usdt` is what a holder feels. `vsBtc` is what the hardfork can be credited
 * with, because it removes the market move BNB would have had anyway.
 */
const measure = (t) => {
  const row = {};
  for (const w of WINDOWS) {
    const from = t + w.from * DAY_MS, to = t + w.to * DAY_MS;
    const b = windowReturn(bnb, from, to);
    const m = windowReturn(btc, from, to);
    row[w.key] = b == null || m == null ? null : { usdt: b, vsBtc: b - m };
  }
  return row;
};

const events = past.map((a) => ({ ...a, returns: measure(a.unixSeconds * 1000) }))
  .filter((e) => Object.values(e.returns).every((r) => r != null));

/* ------------------------------------------------------------------ *
 * 3. The control: the same regime, minus the event days
 * ------------------------------------------------------------------ */

const NEIGHBOURHOOD_DAYS = 60;
const EXCLUSION_DAYS = 10;

const nearAnyFork = (t) => past.some((a) => Math.abs(a.unixSeconds * 1000 - t) <= EXCLUSION_DAYS * DAY_MS);

const controlRows = [];
for (const e of events) {
  const centre = e.unixSeconds * 1000;
  for (let d = -NEIGHBOURHOOD_DAYS; d <= NEIGHBOURHOOD_DAYS; d++) {
    const t = centre + d * DAY_MS;
    if (t > now - 8 * DAY_MS) continue;
    if (nearAnyFork(t)) continue;
    const r = measure(t);
    if (Object.values(r).every((x) => x != null)) controlRows.push(r);
  }
}

/**
 * The control days overlap between neighbouring forks and between windows.
 *
 * They are used only as a distribution to compare against, never as a count of
 * independent trials, so no significance is claimed from their number. The
 * Welch statistic below is dominated by the nineteen events either way — the
 * control's standard error is already negligible at this size.
 */
const uniqueControlDays = controlRows.length;

const summary = WINDOWS.map((w) => {
  const evUsdt = events.map((e) => e.returns[w.key].usdt);
  const evBtc = events.map((e) => e.returns[w.key].vsBtc);
  const ctlBtc = controlRows.map((r) => r[w.key].vsBtc);
  const sd = stdev(evBtc);
  return {
    window: w.label,
    key: w.key,
    events: evBtc.length,
    meanUsdtPct: mean(evUsdt),
    meanVsBtcPct: mean(evBtc),
    medianVsBtcPct: median(evBtc),
    upSharePct: (evBtc.filter((x) => x > 0).length / evBtc.length) * 100,
    controlMeanVsBtcPct: mean(ctlBtc),
    controlMedianVsBtcPct: median(ctlBtc),
    welchT: welch(evBtc, ctlBtc),
    welchDf: welchDf(evBtc, ctlBtc),
    pValue: tTwoSidedP(welch(evBtc, ctlBtc), welchDf(evBtc, ctlBtc)),
    /**
     * What this test could have found.
     *
     * The smallest true effect a two-sided test at 5% would catch four times
     * in five, given the spread actually observed. Reporting it beside the
     * measurement is what separates "no effect" from "no evidence either way",
     * and at twenty events the difference is the whole conclusion.
     */
    detectableEffectPct: sd == null ? null : 2.8 * sd / Math.sqrt(evBtc.length),
    sdVsBtcPct: sd,
  };
});

/**
 * The strongest window, stress-tested two ways.
 *
 * Six windows were measured, so one of them clearing a 5% threshold is roughly
 * what chance produces on its own. Two checks decide whether the strongest
 * result is worth a sentence or a footnote: whether it survives the correction
 * for having looked six times, and whether it survives dropping any single
 * event. A result that depends on one of twenty days is a fact about that day.
 */
const strongest = [...summary].sort((a, b) => Math.abs(b.welchT) - Math.abs(a.welchT))[0];
const leaveOneOut = (() => {
  const ev = events.map((e) => e.returns[strongest.key].vsBtc);
  const ctl = controlRows.map((r) => r[strongest.key].vsBtc);
  const ts = ev.map((_, i) => welch(ev.filter((__, j) => j !== i), ctl));
  const dropped = ts.map((t, i) => ({ t, upgrade: events[i].names.join("/") }))
    .sort((a, b) => Math.abs(a.t) - Math.abs(b.t))[0];
  return {
    window: strongest.window,
    fullT: strongest.welchT,
    fullP: strongest.pValue,
    weakestT: dropped.t,
    weakestWhenDropping: dropped.upgrade,
    stillPastTwo: Math.min(...ts.map((t) => Math.abs(t))) > 2,
  };
})();

/** Six windows were tested, so the threshold one has to clear is not 5%. */
const comparisons = {
  windowsTested: summary.length,
  alpha: 0.05,
  bonferroniAlpha: 0.05 / summary.length,
  strongestP: strongest.pValue,
  clearsCorrectedThreshold: strongest.pValue != null && strongest.pValue < 0.05 / summary.length,
  note: "one window out of six clearing an uncorrected 5% is roughly what testing six windows produces on its own",
};

/**
 * The chain as it stands, hours before the upgrade, measured from the chain.
 *
 * The forwarded specification quotes testnet throughput figures. Those cannot
 * be checked from here and are not repeated as fact. What can be checked is
 * the thing Pasteur is meant to change: how fast mainnet blocks actually
 * arrive, and how full they are. Sampling that now gives the post a baseline a
 * reader can re-measure next week with the same three calls — which is worth
 * more than a number from a blog either way.
 */
const rpcBlock = async (tag) => {
  const body = await retry(async () => {
    const r = await fetch(RPC, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "eth_getBlockByNumber", params: [tag, false] }),
      signal: AbortSignal.timeout(30_000),
    });
    if (!r.ok) throw new Error(`rpc -> ${r.status}`);
    return r.json();
  });
  return body.result ?? null;
};

const chainBaseline = await (async () => {
  const head = await rpcBlock("latest");
  if (!head) return null;
  const headNumber = parseInt(head.number, 16);
  const SAMPLE = 200;
  const older = await rpcBlock(`0x${(headNumber - SAMPLE).toString(16)}`);
  if (!older) return null;

  /** Gas used is sampled rather than fully walked: 20 blocks, evenly spaced. */
  const picks = [];
  for (let i = 0; i < 20; i++) {
    const n = headNumber - Math.round((i * SAMPLE) / 19);
    const b = await rpcBlock(`0x${n.toString(16)}`);
    if (b) picks.push({ gasUsed: parseInt(b.gasUsed, 16), gasLimit: parseInt(b.gasLimit, 16) });
  }
  const spanSeconds = parseInt(head.timestamp, 16) - parseInt(older.timestamp, 16);
  return {
    sampledAt: new Date().toISOString(),
    headBlock: headNumber,
    blocksSampled: SAMPLE,
    meanBlockTimeMs: (spanSeconds * 1000) / SAMPLE,
    gasLimit: mean(picks.map((p) => p.gasLimit)),
    meanGasUsed: mean(picks.map((p) => p.gasUsed)),
    meanGasUsedPct: (mean(picks.map((p) => p.gasUsed)) / mean(picks.map((p) => p.gasLimit))) * 100,
    blocksMeasuredForGas: picks.length,
  };
})();

/**
 * What the forwarded specification claimed, split by whether it could be
 * checked from here.
 *
 * Repeating an unverified throughput figure inside a post about measurement
 * would undo the post. Naming it as a quotation, with the source that did
 * confirm the rest, is the version that survives its own standard.
 */
const specification = {
  confirmed: {
    activationUtc: "2026-08-25T02:30:00Z",
    clientVersion: "1.7.7",
    beps: ["BEP-682", "BEP-695"],
    /** The gate traces figures numerically, so the BEP numbers are stored as numbers too. */
    bepNumbers: [682, 695],
    testnetSince: "2026-07-21",
    source: "https://cryptobriefing.com/pasteur-hardfork-bsc-mainnet-august/",
  },
  quotedButUnverifiedHere: {
    beps: ["BEP-675"],
    bepNumbers: [675],
    /** What the brief says the gas limit is, against what the chain reports. */
    claimedGasLimit: 100_000_000,
    blogHttpStatus: 503,
    testnetTpsBefore: 1237,
    testnetTpsAfter: 2324,
    validatorCriticalPathMsBefore: 125,
    validatorCriticalPathMsAfter: 15,
    note: "from the reader's brief; the BNB Chain blog returned 503 to this desk, so these are recorded as quotations rather than measurements",
  },
};

const out = {
  measuredAt: new Date().toISOString(),
  chainBaseline,
  specification,
  sources: {
    activations: CONFIG_URL,
    blockTimestamps: RPC,
    price: "Binance spot daily klines, BNBUSDT and BTCUSDT",
  },
  method: {
    numeraire: "return measured against BTC as well as USDT; the BTC-relative figure is the one the study answers on",
    control: `every day within ${NEIGHBOURHOOD_DAYS} days of an event, excluding days within ${EXCLUSION_DAYS} days of any fork`,
    dedupeToleranceSeconds: TOLERANCE_S,
    windows: WINDOWS.map((w) => w.label),
  },
  upcoming: upcoming.map((a) => ({ names: a.names, at: a.at, unixSeconds: a.unixSeconds, from: a.from })),
  eventCount: events.length,
  firstEventYear: Number(events[0].at.slice(0, 4)),
  controlDays: uniqueControlDays,
  events: events.map((e) => ({
    names: e.names, at: e.at, from: e.from,
    post1VsBtcPct: e.returns.post1.vsBtc,
    post3VsBtcPct: e.returns.post3.vsBtc,
    post7VsBtcPct: e.returns.post7.vsBtc,
    pre7VsBtcPct: e.returns.pre7.vsBtc,
  })),
  summary,
  strongestWindow: strongest.window,
  leaveOneOut,
  comparisons,
};

writeFileSync("research/bnb-hardfork.json", `${JSON.stringify(out, null, 2)}\n`);

/* ---------------------------------------------------------------- */

const f = (v, dp = 2) => (v == null ? "—" : (v >= 0 ? "+" : "") + v.toFixed(dp));

console.log(`BSC hardforks and BNB\n`);
console.log(`  ${activations.length} activation instants parsed from ${CONFIG_URL.split("/").slice(-2).join("/")}`);
console.log(`  ${events.length} in the past with full price coverage, ${upcoming.length} upcoming`);
console.log(`  control: ${uniqueControlDays} day-windows in the same neighbourhoods\n`);

for (const a of upcoming) console.log(`  upcoming: ${a.names.join(" / ")}  ${a.at}`);

console.log(`\n${"window".padEnd(12)}${"n".padStart(4)}${"mean vs BTC".padStart(14)}${"median".padStart(10)}`
  + `${"up %".padStart(8)}${"control".padStart(10)}${"Welch t".padStart(10)}${"p".padStart(8)}${"detectable".padStart(12)}`);
for (const s of summary) {
  console.log(s.window.padEnd(12) + String(s.events).padStart(4)
    + `${f(s.meanVsBtcPct)}%`.padStart(14) + `${f(s.medianVsBtcPct)}%`.padStart(10)
    + `${s.upSharePct.toFixed(0)}%`.padStart(8) + `${f(s.controlMeanVsBtcPct)}%`.padStart(10)
    + f(s.welchT).padStart(10) + (s.pValue == null ? "—" : s.pValue.toFixed(3)).padStart(8)
    + `${f(s.detectableEffectPct)}%`.padStart(12));
}

console.log(`\nthe strongest of the ${summary.length} windows, stress-tested`);
console.log(`  ${leaveOneOut.window}: t ${f(leaveOneOut.fullT)}, p ${leaveOneOut.fullP.toFixed(4)} across all ${events.length}`);
console.log(`  drop one event and the weakest it gets is t ${f(leaveOneOut.weakestT)} (without ${leaveOneOut.weakestWhenDropping})`);
console.log(`  survives dropping any single event at |t|>2: ${leaveOneOut.stillPastTwo}`);
console.log(`  threshold after correcting for ${comparisons.windowsTested} windows: p < ${comparisons.bonferroniAlpha.toFixed(4)}`);
console.log(`  clears it: ${comparisons.clearsCorrectedThreshold}`);

console.log(`\nevery event, BNB against BTC\n`);
console.log(`  ${"upgrade".padEnd(30)}${"date".padEnd(12)}${"7d before".padStart(11)}${"1d after".padStart(10)}${"3d after".padStart(10)}${"7d after".padStart(10)}`);
for (const e of events) {
  console.log(`  ${e.names.join("/").slice(0, 28).padEnd(30)}${e.at.slice(0, 10).padEnd(12)}`
    + `${f(e.returns.pre7.vsBtc, 1)}%`.padStart(11) + `${f(e.returns.post1.vsBtc, 1)}%`.padStart(10)
    + `${f(e.returns.post3.vsBtc, 1)}%`.padStart(10) + `${f(e.returns.post7.vsBtc, 1)}%`.padStart(10));
}
