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
import { pct, price as fmtPrice, usd } from "../src/format.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const argv = process.argv.slice(2);
const flag = (name) => {
  const hit = argv.find((a) => a === `--${name}` || a.startsWith(`--${name}=`));
  return hit ? (hit.includes("=") ? hit.split("=").slice(1).join("=") : true) : null;
};

const MAJORS = ["BTCUSDT", "ETHUSDT", "SOLUSDT", "BNBUSDT"];
const symbols = flag("symbols")
  ? String(flag("symbols")).split(",").map((s) => s.trim().toUpperCase()).filter(Boolean)
  : [...MAJORS, ...ALT_UNIVERSE];

const retry = async (fn, n = 5) => {
  let last;
  for (let i = 0; i < n; i++) {
    try { return await fn(); } catch (e) { last = e; await new Promise((r) => setTimeout(r, 900 * (i + 1))); }
  }
  throw last;
};

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

    const signal = signalFor({
      symbol,
      candles,
      atrPct,
      price: analysis.price,
      turnoverUsd: analysis.quoteVolumeLatest ?? null,
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
        underwaterPct: stage?.underwaterPct ?? null,
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
    horizonsDays: [3, 5, 10, 30],
    // The window that decides the call, recorded so a snapshot can be read
    // years later without guessing what "recent" meant when it was taken.
    recentWindowDays: RECENT_DAYS,
  },
  tally: tallySignals(signals),
  failed,
  signals: ranked,
};

const out = path.join(root, "site", "signals.json");
fs.writeFileSync(out, `${JSON.stringify(snapshot, null, 2)}\n`);

const t = snapshot.tally;
console.log(
  `${out}\n${t.total} scanned · ${t.LONG} long · ${t.SHORT} short · ${t.WAIT} wait`
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
