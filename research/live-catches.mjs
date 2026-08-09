/**
 * What the live scanner actually caught, and what happened next.
 *
 * There is a difference between a detector that would have fired on history and
 * one that did fire, and it is the difference between a backtest and a track
 * record. The study that motivated this whole channel cites BICO at 0.01220 on
 * 2026-08-02 — a price found by replaying history after the fact, when nothing
 * was running. Quoting it as a call would invent a track record, which is the
 * exact error a draft was caught making this week.
 *
 * So this reads the append-only alert log instead. Every row here fired in real
 * time, was written to disk before the outcome existed, and carries the hour it
 * fired. Nothing retrospective gets in.
 *
 * Outcomes are marked settled only once the twelve-hour horizon has fully
 * elapsed. A position still inside its window is pending, not a win — counting
 * it either way is how a scoreboard flatters itself.
 *
 * Reproducible:
 *   node research/live-catches.mjs > research/live-catches.json
 */

import { readFileSync } from "node:fs";
import { fetchAllTickers } from "../src/pulse.mjs";
import { fetchKlines } from "../src/analysis.mjs";
import { fetchDelistings, baseAsset } from "../src/listings.mjs";

const HORIZON_HOURS = 12;
const TARGET_PCT = 10;

const retry = async (fn, n = 5) => {
  let last;
  for (let i = 0; i < n; i++) {
    try { return await fn(); } catch (e) { last = e; await new Promise((r) => setTimeout(r, 900 * (i + 1))); }
  }
  throw last;
};

const alerts = readFileSync("data/alerts.jsonl", "utf8")
  .trim().split("\n")
  .map((l) => { try { return JSON.parse(l); } catch { return null; } })
  .filter((r) => r && r.symbol && Number.isFinite(r.price));

const delistings = await retry(() => fetchDelistings());
const tickers = await retry(() => fetchAllTickers());
const priceNow = new Map(tickers.map((t) => [t.symbol, t.price]));

const rows = [];
for (const a of alerts) {
  const candles = await retry(() => fetchKlines(a.symbol, { interval: "1h", limit: 400 })).catch(() => null);
  if (!candles) continue;
  const done = candles.slice(0, -1);
  const window = done.filter((c) => c.openTime > a.hourOpenTime
    && c.openTime <= a.hourOpenTime + HORIZON_HOURS * 3_600_000);

  const settled = window.length >= HORIZON_HOURS;
  const best = window.length ? Math.max(...window.map((c) => c.high)) : NaN;
  const worst = window.length ? Math.min(...window.map((c) => c.low)) : NaN;

  rows.push({
    symbol: a.symbol,
    asset: baseAsset(a.symbol),
    firedAt: a.firedAt,
    alertHour: new Date(a.hourOpenTime).toISOString(),
    alertPrice: a.price,
    volumeZScore: a.volumeZScore,
    hourTurnoverUsd: a.quoteVolume,
    averageHourTurnoverUsd: a.averageQuoteVolume,
    /** How many times its own normal hour traded in the hour that fired. */
    turnoverVsNormal: a.averageQuoteVolume ? a.quoteVolume / a.averageQuoteVolume : NaN,
    change1hPct: a.change1hPct,
    priceNow: priceNow.get(a.symbol) ?? NaN,
    changeSinceAlertPct: priceNow.has(a.symbol) ? (priceNow.get(a.symbol) / a.price - 1) * 100 : NaN,
    settled,
    bestGainPct: Number.isFinite(best) ? (best / a.price - 1) * 100 : NaN,
    worstDrawdownPct: Number.isFinite(worst) ? (worst / a.price - 1) * 100 : NaN,
    hit: settled ? (best / a.price - 1) * 100 >= TARGET_PCT : null,
    /**
     * A removal notice makes the move an artefact of the exchange, not of the
     * market. Three of the first eight alerts traced to one announcement, and a
     * track record that counts them is measuring a press release.
     */
    delisting: delistings.has(baseAsset(a.symbol)) || null,
  });
}

/**
 * What the backtest promised, so the live record can be judged against it.
 *
 * Read from the committed study rather than typed in, and read from the *naive*
 * touch measure — not longFirst — because that is what `hit` computes here: the
 * highest high inside the window. Comparing a touch-based live record to a
 * path-aware backtest would flatter the live number by construction.
 */
let promised = null;
try {
  const T = JSON.parse(readFileSync("research/two-sided.json", "utf8"));
  promised = {
    backtestTouchPct: T.allAlerts.touchedUpPct,
    baselineTouchPct: T.baseline.touchedUpPct,
    note: "Naive touch measure on both sides of the comparison. two-sided.json also reports the path-aware longFirst, which is the tradeable figure and is lower.",
  };
} catch { /* the study is optional; the record stands without it */ }

const settled = rows.filter((r) => r.settled);
const clean = settled.filter((r) => !r.delisting);
const share = (xs, f) => (xs.length ? (xs.filter(f).length / xs.length) * 100 : NaN);

console.log(JSON.stringify({
  measuredAt: new Date().toISOString(),
  method: {
    horizonHours: HORIZON_HOURS,
    targetPct: TARGET_PCT,
    source: "data/alerts.jsonl — append-only, written by the scheduled scanner before any outcome existed",
    note: "Live fires only. Prices found by replaying history are excluded by construction, because a detector that would have fired is not a track record.",
  },
  logged: alerts.length,
  settled: settled.length,
  pending: rows.length - settled.length,
  overall: { hitRatePct: share(settled, (r) => r.hit), n: settled.length },
  excludingDelistings: { hitRatePct: share(clean, (r) => r.hit), n: clean.length },
  delistingDriven: {
    count: rows.filter((r) => r.delisting).length,
    sharePct: (rows.filter((r) => r.delisting).length / rows.length) * 100,
  },
  versusBacktest: promised && {
    ...promised,
    livePct: share(clean, (r) => r.hit),
    liveLiftVsBaseline: share(clean, (r) => r.hit) / promised.baselineTouchPct,
    shortfallPp: share(clean, (r) => r.hit) - promised.backtestTouchPct,
  },
  rows: rows.sort((a, b) => (b.changeSinceAlertPct || -1e9) - (a.changeSinceAlertPct || -1e9)),
}, null, 2));
