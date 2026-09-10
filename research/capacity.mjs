/**
 * How much money the one working trade can actually absorb.
 *
 * The structural study found that shorting liquid alts against BTC returns
 * +0.2866R a month after funding, t 3.24 over 79 months. Every number in it is
 * a return per unit of risk, and a return per unit of risk says nothing about
 * how many units exist. A strategy that pays 0.29R on a thousand dollars and
 * cannot take ten thousand is a finding, not a business.
 *
 * Binance's futures API is geo-blocked here, but the public archive publishes
 * order book depth: for every symbol, every thirty seconds, the notional
 * resting within 0.2%, 1%, 2%... of mid. That is a direct measurement of what a
 * market order would eat, which is better than the usual proxy of guessing from
 * daily volume.
 *
 * Two estimates are produced, from independent data, because one number with no
 * second opinion is how a capacity estimate becomes a marketing number:
 *
 *   Book depth. Notional resting within a tolerated impact band, right now.
 *   Participation. A share of daily turnover, the standard desk convention.
 *
 * If they disagree by an order of magnitude, something is wrong and the post
 * says so rather than picking the friendlier one.
 *
 * Three deliberate conservatisms, because capacity errors are expensive in one
 * direction only:
 *
 *   The tenth percentile of depth is reported alongside the median. A position
 *   sized for a typical book is a position that cannot be closed on a bad day,
 *   and the bad day is exactly when it needs closing.
 *
 *   Both sides are measured. Entering a short sells into bids; exiting buys
 *   back from asks. Capacity is the smaller of the two, not the average.
 *
 *   The round trip is charged. The binding constraint is not getting in.
 *
 * Raw depth files are parsed and discarded — only the per-symbol summary is
 * kept, so this does not put hundreds of megabytes of order books on disk.
 */

import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync, unlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const KLINES = ".cache/klines";
const OUT = ".cache/bookdepth";
const BASE = "https://data.binance.vision/data/futures/um/daily/bookDepth";

const DAYS = Number(process.env.DAYS ?? 8);
const MAX_SYMBOLS = Number(process.env.MAX_SYMBOLS ?? 32);
const CONCURRENCY = Number(process.env.CONCURRENCY ?? 6);
/** Impact bands the archive publishes that a real order would care about. */
const BANDS = [0.2, 1];
const MIN_TURNOVER_USD = 2e6;
/** The desk's convention: never take more than this share of a day's volume. */
const PARTICIPATION = 0.1;

const mean = (xs) => (xs.length ? xs.reduce((a, x) => a + x, 0) / xs.length : null);
const quantile = (xs, q) => {
  if (!xs.length) return null;
  const v = [...xs].sort((a, b) => a - b);
  const i = Math.min(v.length - 1, Math.max(0, Math.floor(q * (v.length - 1))));
  return v[i];
};

const dayOf = (c) => new Date(c.openTime).toISOString().slice(0, 10);

/* ---- universe: what the strategy actually trades ---- */
if (!existsSync(KLINES)) throw new Error("No candle cache. Run research/structural-edge.mjs first.");
const series = [];
for (const f of readdirSync(KLINES).filter((n) => n.endsWith(".json"))) {
  const symbol = f.replace(/-\d{4}-\d{2}-\d{2}\.json$/, "");
  const daily = JSON.parse(readFileSync(`${KLINES}/${f}`, "utf8"));
  if (daily.length < 60) continue;
  const turnover = mean(daily.slice(-30).map((c) => c.quoteVolume));
  if (!(turnover >= MIN_TURNOVER_USD)) continue;
  series.push({ symbol, turnover, lastDay: dayOf(daily.at(-1)) });
}
series.sort((a, b) => b.turnover - a.turnover);
const universe = series.slice(0, MAX_SYMBOLS);

/** The most recent days the archive is likely to have published. */
const latest = universe.map((s) => s.lastDay).sort().at(-1);
const dates = [];
for (let i = 1; i <= DAYS + 3 && dates.length < DAYS + 3; i++) {
  const d = new Date(`${latest}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() - i);
  dates.push(d.toISOString().slice(0, 10));
}

mkdirSync(OUT, { recursive: true });

/**
 * One symbol-day of book depth, reduced to what a position sizer needs.
 *
 * The archive's `notional` is cumulative to that percentage band, so the value
 * at 1% already includes everything inside it — which is exactly the quantity
 * a market order of that size would consume.
 */
async function depthForDay(symbol, date) {
  const cacheFile = `${OUT}/${symbol}-${date}.json`;
  if (existsSync(cacheFile)) return JSON.parse(readFileSync(cacheFile, "utf8"));

  const res = await fetch(`${BASE}/${symbol}/${symbol}-bookDepth-${date}.zip`, {
    signal: AbortSignal.timeout(90_000),
  });
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`${symbol} ${date}: HTTP ${res.status}`);

  const zip = join(tmpdir(), `bd-${symbol}-${date}.zip`);
  writeFileSync(zip, Buffer.from(await res.arrayBuffer()));
  let csv;
  try {
    csv = execFileSync("unzip", ["-p", zip], { encoding: "utf8", maxBuffer: 1 << 28 });
  } finally {
    try { unlinkSync(zip); } catch { /* already gone */ }
  }

  // bid side is the negative percentages, ask side the positive ones
  const bid = Object.fromEntries(BANDS.map((b) => [b, []]));
  const ask = Object.fromEntries(BANDS.map((b) => [b, []]));
  for (const line of csv.split("\n")) {
    const parts = line.split(",");
    if (parts.length < 4) continue;
    const pct = Number(parts[1]), notional = Number(parts[3]);
    if (!Number.isFinite(pct) || !Number.isFinite(notional)) continue;
    const band = Math.abs(pct);
    if (!BANDS.includes(band)) continue;
    (pct < 0 ? bid : ask)[band].push(notional);
  }

  const summarise = (side) => Object.fromEntries(BANDS.map((b) => [b, {
    median: quantile(side[b], 0.5),
    p10: quantile(side[b], 0.1),
    snapshots: side[b].length,
  }]));

  const out = { symbol, date, bid: summarise(bid), ask: summarise(ask) };
  writeFileSync(cacheFile, JSON.stringify(out));
  return out;
}

const rows = [];
let done = 0;
const jobs = [];
for (const s of universe) for (const d of dates.slice(0, DAYS)) jobs.push([s.symbol, d]);

await Promise.all(Array.from({ length: CONCURRENCY }, async () => {
  while (jobs.length) {
    const [symbol, date] = jobs.shift();
    try {
      const r = await depthForDay(symbol, date);
      if (r) rows.push(r);
    } catch { /* absent rather than guessed */ }
    done += 1;
    process.stderr.write(`\r${done}/${done + jobs.length} ${symbol.padEnd(14)}`);
  }
}));
process.stderr.write("\r");

/* ---- per symbol ---- */
const bySymbol = [];
for (const s of universe) {
  const mine = rows.filter((r) => r.symbol === s.symbol);
  if (!mine.length) continue;

  const band = (b) => {
    // Capacity is the thinner side: a short sells into bids and buys back asks.
    const medians = mine.map((r) => Math.min(r.bid[b].median, r.ask[b].median));
    const thin = mine.map((r) => Math.min(r.bid[b].p10, r.ask[b].p10));
    return { medianUsd: quantile(medians, 0.5), thinUsd: quantile(thin, 0.5) };
  };

  bySymbol.push({
    symbol: s.symbol,
    days: mine.length,
    turnoverUsd: s.turnover,
    depth: Object.fromEntries(BANDS.map((b) => [b, band(b)])),
    participationUsd: s.turnover * PARTICIPATION,
  });
}
bySymbol.sort((a, b) => b.turnoverUsd - a.turnoverUsd);

const alts = bySymbol.filter((r) => r.symbol !== "BTCUSDT");
const btc = bySymbol.find((r) => r.symbol === "BTCUSDT") ?? null;

/**
 * What the whole rebalance can take.
 *
 * The strategy opens one position per qualifying alt at equal risk, so the
 * book-depth ceiling for the basket is the sum of the per-name ceilings — the
 * legs are separate instruments and do not compete for the same book. The BTC
 * hedge is one order equal to the whole basket, so it is checked separately
 * and is never the binding side.
 */
const basket = (b) => ({
  band: b,
  namesCounted: alts.length,
  medianTotalUsd: alts.reduce((a, r) => a + r.depth[b].medianUsd, 0),
  thinTotalUsd: alts.reduce((a, r) => a + r.depth[b].thinUsd, 0),
  perNameMedianUsd: quantile(alts.map((r) => r.depth[b].medianUsd), 0.5),
  perNameWorstUsd: quantile(alts.map((r) => r.depth[b].thinUsd), 0.1),
  btcHedgeUsd: btc ? btc.depth[b].thinUsd : null,
});

const participationTotal = alts.reduce((a, r) => a + r.participationUsd, 0);
const depthTotal1pct = basket(1).thinTotalUsd;

const out = {
  measuredAt: new Date().toISOString(),
  source: "data.binance.vision futures bookDepth, USDS-M perpetuals",
  daysSampled: dates.slice(0, DAYS),
  symbolsRequested: universe.length,
  symbolsWithData: bySymbol.length,
  rules: {
    bands: BANDS,
    participationShare: PARTICIPATION,
    minTurnoverUsd: MIN_TURNOVER_USD,
    note: "Capacity per name is the thinner of bid and ask, because a short sells into bids and buys back from asks. The tenth percentile is the thin-book case a position must still be closeable in.",
  },
  perBand: BANDS.map(basket),
  participation: {
    shareOfDailyTurnover: PARTICIPATION,
    basketUsd: participationTotal,
    perNameMedianUsd: quantile(alts.map((r) => r.participationUsd), 0.5),
  },
  /** The two independent estimates, and how far apart they are. */
  agreement: {
    depthAt1PctThinUsd: depthTotal1pct,
    participationUsd: participationTotal,
    ratio: participationTotal ? depthTotal1pct / participationTotal : null,
  },
  bySymbol,
};
writeFileSync("research/capacity.json", `${JSON.stringify(out, null, 2)}\n`);

const usd = (v) => (v == null ? "—" : v >= 1e9 ? `$${(v / 1e9).toFixed(2)}B` : v >= 1e6 ? `$${(v / 1e6).toFixed(1)}M` : `$${(v / 1e3).toFixed(0)}K`);

console.log(`${bySymbol.length} symbols with depth data · ${dates.slice(0, DAYS).length} days sampled\n`);
console.log("what the alt basket can absorb, per rebalance");
console.log("  band     names   typical book      thin book    per name (typ)   per name (worst)");
for (const b of out.perBand) {
  console.log(`  ${(b.band + "%").padEnd(9)}${String(b.namesCounted).padStart(5)}`
    + `${usd(b.medianTotalUsd)}`.padStart(16)
    + `${usd(b.thinTotalUsd)}`.padStart(15)
    + `${usd(b.perNameMedianUsd)}`.padStart(18)
    + `${usd(b.perNameWorstUsd)}`.padStart(19));
}

console.log(`\nsecond opinion — ${(PARTICIPATION * 100).toFixed(0)}% of daily turnover`);
console.log(`  basket ${usd(out.participation.basketUsd)} · per name (median) ${usd(out.participation.perNameMedianUsd)}`);
console.log(`  depth at 1% (thin book) is ${out.agreement.ratio.toFixed(2)}x the participation estimate`);

if (btc) {
  console.log(`\nthe BTC hedge leg: ${usd(btc.depth[1].thinUsd)} within 1% on a thin book`
    + ` — ${(btc.depth[1].thinUsd / basket(1).thinTotalUsd).toFixed(1)}x the whole alt basket`);
}

console.log("\nthinnest names in the basket (1% band, thin book)");
const thinnest = [...alts].sort((a, b) => a.depth[1].thinUsd - b.depth[1].thinUsd).slice(0, 6);
for (const r of thinnest) {
  console.log(`  ${r.symbol.replace("USDT", "").padEnd(10)}${usd(r.depth[1].thinUsd).padStart(10)}`
    + `   turnover ${usd(r.turnoverUsd)}`);
}
