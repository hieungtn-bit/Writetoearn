#!/usr/bin/env node
/**
 * The daily scan: runs the signal engine over the universe and writes the
 * snapshot the website reads.
 *
 * The build performs no network I/O — a deploy must not fail because an
 * exchange is unreachable from the build region — so this is the step that
 * touches the market, and its output is committed. Same arrangement as
 * site/lesson-data.json, for the same reason.
 *
 * It publishes nothing. The scan reports; a human decides what to do with it.
 *
 *   node scripts/scan-daily.mjs                  # write site/signals.json
 *   node scripts/scan-daily.mjs --print          # also print the board
 *   node scripts/scan-daily.mjs --symbols A,B    # a subset, for a quick look
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { analyzeAsset, atr, fetchKlines } from "../src/analysis.mjs";
import { ALT_UNIVERSE } from "../src/screen.mjs";
import { stageOf } from "../src/stage.mjs";
import { RECENT_DAYS, rankSignals, signalFor, tallySignals } from "../src/signals.mjs";
import { volumeProfile } from "../src/profile.mjs";
import { slimSnapshot } from "../src/site.mjs";
import { DEFAULT_LIMIT, liveUniverse } from "../src/universe.mjs";
import { pct, price as fmtPrice, usd } from "../src/format.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const argv = process.argv.slice(2);
const flag = (name) => {
  const hit = argv.find((a) => a === `--${name}` || a.startsWith(`--${name}=`));
  return hit ? (hit.includes("=") ? hit.split("=").slice(1).join("=") : true) : null;
};

/**
 * What to scan.
 *
 * Derived from the market rather than hardcoded, because the hardcoded version
 * is why the board missed the movers: 32 names against 489 trading pairs, and
 * one of the day's ten biggest gainers inside our list. `--limit` bounds the
 * run time; the hand-written ALT_UNIVERSE survives only as the offline
 * fallback for when the exchange cannot be reached.
 */
const retry = async (fn, n = 5) => {
  let last;
  for (let i = 0; i < n; i++) {
    try { return await fn(); } catch (e) { last = e; await new Promise((r) => setTimeout(r, 900 * (i + 1))); }
  }
  throw last;
};

const MAJORS = ["BTCUSDT", "ETHUSDT", "SOLUSDT", "BNBUSDT"];
const limit = Number(flag("limit") ?? DEFAULT_LIMIT);

let symbols;
let universeNote = `top ${limit} USDT pairs by turnover, refreshed this run`;
if (flag("symbols")) {
  symbols = String(flag("symbols")).split(",").map((s) => s.trim().toUpperCase()).filter(Boolean);
  universeNote = "explicit --symbols list";
} else {
  try {
    const live = await retry(() => liveUniverse({ limit }));
    symbols = live.symbols;
    universeNote += ` (${live.considered} pairs considered)`;
  } catch (err) {
    symbols = [...MAJORS, ...ALT_UNIVERSE];
    universeNote = `fallback to the static list — could not reach the exchange (${err.message})`;
    process.stderr.write(`\n${universeNote}\n`);
  }
}

const signals = [];
const failed = [];

for (const [i, symbol] of symbols.entries()) {
  process.stderr.write(`\rscanning ${i + 1}/${symbols.length} ${symbol.padEnd(12)}`);
  try {
    const candles = await retry(() => fetchKlines(symbol, { interval: "1d", limit: 1000 }));
    const analysis = await retry(() => analyzeAsset(symbol, { candles }));
    const atrPct = (atr(candles, 14) / analysis.price) * 100;

    // Context the engine does not use but a reader needs to judge the call.
    const stage = await stageOf(symbol.replace(/USDT$/, "")).catch(() => null);

    /**
     * Overhead supply, from a real volume profile rather than whole daily bars.
     *
     * The daily proxy in `stageOf` charges each bar entirely to one side of the
     * current price. Measured against this, it is off by up to eleven points,
     * and worst where price sits mid-distribution — BTC read 88.9% by bars and
     * 78.8% by profile on the day this was written. The profile is published;
     * the proxy is kept beside it so the gap stays visible.
     */
    const hourly = await retry(() => fetchKlines(symbol, { interval: "1h", limit: 30 * 24 }))
      .catch(() => null);
    const profile = hourly ? volumeProfile(hourly, analysis.price) : null;

    const signal = signalFor({
      symbol,
      candles,
      atrPct,
      price: analysis.price,
      // Mean turnover over completed days, not the bar still forming — a scan
      // run at midday would otherwise judge every pair on half a session.
      turnoverUsd: Number.isFinite(analysis.avgQuoteVolume30d) ? analysis.avgQuoteVolume30d : null,
    });

    signals.push({
      ...signal,
      asset: symbol.replace(/USDT$/, ""),
      context: {
        rsi14: analysis.rsi14,
        rangePosition30d: analysis.rangePosition30d,
        change7dPct: analysis.change7dPct,
        change30dPct: analysis.change30dPct,
        volumeZScoreCompleted: analysis.volumeZScoreCompleted,
        // The profile figure is the published one; the daily-bar proxy is
        // retained so the difference between the two methods stays auditable.
        underwaterPct: profile?.overheadPct ?? stage?.underwaterPct ?? null,
        underwaterByDailyBarsPct: stage?.underwaterPct ?? null,
        underwaterMethod: profile ? "hourly volume profile" : "daily bars",
        pocPrice: profile?.pocPrice ?? null,
        valueAreaLow: profile?.valueAreaLow ?? null,
        valueAreaHigh: profile?.valueAreaHigh ?? null,
        volumeTrendPct: stage?.volumeTrendPct ?? null,
        stage: stage?.stage ?? null,
      },
    });
  } catch (err) {
    failed.push({ symbol, reason: err.message });
  }
}
process.stderr.write("\r");

const ranked = rankSignals(signals);
const snapshot = {
  scannedAt: new Date().toISOString(),
  method: {
    engine: "src/signals.mjs",
    note: "Both directions scored on equal terms; the recent window decides and the long window is kept only to detect a regime turn. WAIT is only reachable when both directions lose.",
    walk: "Bar by bar. A bar reaching both levels is charged to the stop. Unresolved positions close at the market, not at zero.",
    unavailable: "Binance futures is geo-blocked from this host, so nothing here uses funding, open interest or liquidation data.",
    overhead: "Share of 30-day turnover above the current price, from an hourly volume profile with each bar spread across the bins its range covers. The older whole-daily-bar proxy is kept alongside as underwaterByDailyBarsPct.",
    horizonsDays: [3, 5, 10, 30],
    // The window that decides the call, recorded so a snapshot can be read
    // years later without guessing what "recent" meant when it was taken.
    recentWindowDays: RECENT_DAYS,
    universe: universeNote,
  },
  tally: tallySignals(signals),
  failed,
  signals: ranked,
};

/**
 * Two writes, on purpose.
 *
 * `site/signals.json` is the latest board and stays where the build already
 * looks for it. The dated copy under `site/signals-archive/` is what makes the
 * date filter possible at all — a scan that overwrites its predecessor cannot
 * be filtered by day, and the record of what the board said on a given morning
 * is the only way anyone can check it later.
 *
 * Re-running on the same day replaces that day's file rather than appending, so
 * a scan repeated after a data outage corrects the record instead of doubling
 * it.
 */
const day = snapshot.scannedAt.slice(0, 10);
const archiveDir = path.join(root, "site", "signals-archive");
fs.mkdirSync(path.join(archiveDir, "scans"), { recursive: true });

/**
 * The archive stores the slim shape, which is what the site serves anyway.
 * A full record of 100 pairs is 462KB, most of it geometry grids no reader
 * opens; slim is a fraction of that and keeps the repository honest about
 * what it is actually publishing.
 */
const archived = slimSnapshot(snapshot);

/**
 * Two archive writes, because they answer different questions.
 *
 * `<day>.json` is what the date picker fetches, and re-running on the same day
 * replaces it — a scan repeated after an outage should correct the record, not
 * double it.
 *
 * `scans/<minute>.json` is immutable. Three posts published on 12 August cited
 * a board that a later scan the same day overwrote, so the figures in them
 * could no longer be checked against anything served. A snapshot a post points
 * at has to survive the next scan.
 */
const stamp = snapshot.scannedAt.slice(0, 16).replace(/[:T]/g, "-");
fs.writeFileSync(path.join(archiveDir, "scans", `${stamp}.json`), `${JSON.stringify(archived)}\n`);
fs.writeFileSync(path.join(archiveDir, `${day}.json`), `${JSON.stringify(archived, null, 2)}\n`);

const out = path.join(root, "site", "signals.json");
fs.writeFileSync(out, `${JSON.stringify(snapshot, null, 2)}\n`);

const t = snapshot.tally;
console.log(
  `${out} · archived ${day}\n${t.total} scanned · ${t.LONG} long · ${t.SHORT} short · ${t.WAIT} wait`
  + ` · ${t.turning} regime turn(s) · ${t.untradeable} too thin`
  + (failed.length ? ` · ${failed.length} failed` : ""),
);

if (flag("print")) {
  console.log("");
  for (const s of ranked.slice(0, 20)) {
    const p = s.plan;
    console.log(
      `${s.asset.padEnd(7)} ${s.bias.padEnd(5)} ${s.tradeable ? "  " : "· thin"} `
      + (p
        ? `${p.horizonDays}d  stop ${pct(p.stopPct)}%  RR ${pct(p.rr)}  hit ${pct(p.hitPct)}%  `
          + `E ${pct(p.expectancyR)}R  n≈${Math.round(p.effectiveN)}  `
          + `${fmtPrice(p.entry)} → ${fmtPrice(p.target)} (stop ${fmtPrice(p.stop)})`
        : s.reason)
      + (s.regime?.turning ? "  ⟲ regime turn" : "")
      + (s.turnoverUsd ? `  ${usd(s.turnoverUsd)}` : ""),
    );
  }
}
