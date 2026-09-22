/**
 * Historical funding rates, fetched the only way this desk can reach them.
 *
 * The obvious endpoint, fapi/v1/fundingRate, answers 451 from here, and the
 * structural-edge study left funding as the one named cost it could not price.
 * That is not a footnote: the alt-versus-BTC short is two perpetual legs, and a
 * perpetual position pays or receives funding three times a day for thirty
 * days. A study that charges 0.4% in fees and ignores ninety funding payments
 * is not measuring the trade.
 *
 * The public archive at data.binance.vision serves the same exchange's own
 * monthly dumps and is reachable, so the series is rebuilt from those: one zip
 * per symbol per month, `calc_time,funding_interval_hours,last_funding_rate`.
 *
 * Two things this deliberately does not do. It does not fall back to another
 * exchange's funding when Binance has none — OKX's rate on a different order
 * book is a different number, and splicing them would invent a series. And it
 * does not treat a missing month as zero: absent is recorded as absent, so the
 * study can exclude those episodes rather than quietly score them as free.
 *
 *   node research/fetch-funding.mjs
 */

import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const KLINES = ".cache/klines";
const OUT = ".cache/funding";
const BASE = "https://data.binance.vision/data/futures/um/monthly/fundingRate";
const CONCURRENCY = Number(process.env.CONCURRENCY ?? 6);

if (!existsSync(KLINES)) {
  throw new Error("No candle cache. Run research/structural-edge.mjs first.");
}
mkdirSync(OUT, { recursive: true });

/** Months a symbol could plausibly have funding for, from its spot history. */
const monthsFor = (candles) => {
  const first = new Date(candles[0].openTime);
  const last = new Date(candles.at(-1).openTime);
  const out = [];
  const cur = new Date(Date.UTC(first.getUTCFullYear(), first.getUTCMonth(), 1));
  while (cur <= last) {
    out.push(`${cur.getUTCFullYear()}-${String(cur.getUTCMonth() + 1).padStart(2, "0")}`);
    cur.setUTCMonth(cur.getUTCMonth() + 1);
  }
  return out;
};

async function monthRates(symbol, month) {
  const url = `${BASE}/${symbol}/${symbol}-fundingRate-${month}.zip`;
  const res = await fetch(url, { signal: AbortSignal.timeout(45_000) });
  // 404 means no perpetual that month, which is information, not an error.
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`${symbol} ${month}: HTTP ${res.status}`);

  const file = join(tmpdir(), `fr-${symbol}-${month}.zip`);
  writeFileSync(file, Buffer.from(await res.arrayBuffer()));
  const csv = execFileSync("unzip", ["-p", file], { encoding: "utf8", maxBuffer: 1 << 24 });

  const rows = [];
  for (const line of csv.split("\n")) {
    const [time, , rate] = line.split(",");
    const t = Number(time), r = Number(rate);
    if (Number.isFinite(t) && Number.isFinite(r) && t > 0) rows.push([t, r]);
  }
  return rows;
}

const files = readdirSync(KLINES).filter((f) => f.endsWith(".json"));
const symbols = [...new Set(files.map((f) => f.replace(/-\d{4}-\d{2}-\d{2}\.json$/, "")))].sort();

let done = 0;
const summary = [];

async function work(symbol) {
  const target = `${OUT}/${symbol}.json`;
  if (existsSync(target)) {
    const prior = JSON.parse(readFileSync(target, "utf8"));
    summary.push({ symbol, intervals: prior.rates.length, months: prior.monthsFound, cached: true });
    return;
  }

  const file = files.find((f) => f.startsWith(`${symbol}-`));
  const candles = JSON.parse(readFileSync(`${KLINES}/${file}`, "utf8"));
  const months = monthsFor(candles);

  const rates = [];
  let found = 0, missing = 0;
  for (const m of months) {
    let rows = null;
    for (let attempt = 0; attempt < 4; attempt++) {
      try { rows = await monthRates(symbol, m); break; }
      catch { await new Promise((r) => setTimeout(r, 800 * (attempt + 1))); }
    }
    if (rows === null) { missing += 1; continue; }
    found += 1;
    rates.push(...rows);
  }
  rates.sort((a, b) => a[0] - b[0]);
  writeFileSync(target, JSON.stringify({ symbol, monthsFound: found, monthsMissing: missing, rates }));
  summary.push({ symbol, intervals: rates.length, months: found, cached: false });
}

const queue = [...symbols];
await Promise.all(Array.from({ length: CONCURRENCY }, async () => {
  while (queue.length) {
    const symbol = queue.shift();
    try { await work(symbol); }
    catch (e) { summary.push({ symbol, intervals: 0, months: 0, error: String(e.message ?? e) }); }
    done += 1;
    process.stderr.write(`\r${done}/${symbols.length} ${symbol.padEnd(14)}`);
  }
}));
process.stderr.write("\r");

const withPerp = summary.filter((s) => s.intervals > 0);
console.log(`${symbols.length} symbols · ${withPerp.length} have a perpetual with funding history`);
console.log(`  no perpetual at all: ${summary.filter((s) => !s.intervals && !s.error).length}`);
const errored = summary.filter((s) => s.error);
if (errored.length) {
  console.log(`  errored: ${errored.length}`);
  for (const s of errored.slice(0, 5)) console.log(`    ${s.symbol}: ${s.error}`);
}
console.log(`  total funding intervals: ${withPerp.reduce((a, s) => a + s.intervals, 0).toLocaleString("en-US")}`);
