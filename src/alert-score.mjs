/**
 * Did our own alerts go anywhere?
 *
 * research/intraday-signal.json says a 5-sigma turnover hour is followed by a
 * 10% rise within twelve hours 27.6% of the time against a 6.2% baseline. That
 * is a backtest: it measures the past, under conditions we chose after seeing
 * the data. This measures *us* — the alerts actually raised, at the prices
 * actually recorded, scored against the same threshold.
 *
 * The two numbers will disagree, and the gap is the honest one to publish. A
 * backtest that cannot be reproduced forward is a story about history.
 */

import { fetchKlines } from "./analysis.mjs";
import { AlertLog } from "./alerts.mjs";

/** Same horizon and target the study used, so the comparison is like for like. */
export const HORIZON_HOURS = 12;
export const TARGET_PCT = 10;
export const BASELINE_PCT = 6.22;

/**
 * Scores one alert against the hours that followed it.
 *
 * Returns `pending` while the horizon is still open — an alert fired an hour
 * ago has not failed, it has not finished. Counting it as a miss would drag the
 * hit rate down by exactly the alerts most likely to still work.
 */
export function scoreAlert(alert, candles, { now = Date.now() } = {}) {
  const start = alert.hourOpenTime;
  const deadline = start + HORIZON_HOURS * 3_600_000;
  const window = candles.filter((c) => c.openTime > start && c.openTime <= deadline);

  const elapsedHours = Math.max(0, Math.floor((now - start) / 3_600_000));
  const high = window.length ? Math.max(...window.map((c) => c.high)) : NaN;
  const last = window.length ? window.at(-1).close : NaN;

  const maxGainPct = Number.isFinite(high) ? (high / alert.price - 1) * 100 : NaN;
  const hit = Number.isFinite(maxGainPct) && maxGainPct >= TARGET_PCT;

  return {
    symbol: alert.symbol,
    firedAt: alert.firedAt,
    volumeZScore: alert.volumeZScore,
    entry: alert.price,
    maxGainPct,
    currentPct: Number.isFinite(last) ? (last / alert.price - 1) * 100 : NaN,
    hoursObserved: Math.min(elapsedHours, HORIZON_HOURS),
    // A hit is settled the moment it happens; a miss is only a miss once the
    // full window has closed.
    status: hit ? "hit" : now < deadline ? "pending" : "miss",
  };
}

export async function scoreAlerts({
  log = new AlertLog(),
  fetchImpl = globalThis.fetch,
  now = Date.now(),
  limit = 100,
} = {}) {
  const alerts = log.all().slice(-limit);
  const rows = [];

  for (const alert of alerts) {
    const candles = await fetchKlines(alert.symbol, { interval: "1h", limit: 48, fetchImpl }).catch(() => null);
    if (!candles) continue;
    rows.push(scoreAlert(alert, candles, { now }));
  }

  const settled = rows.filter((r) => r.status !== "pending");
  const hits = settled.filter((r) => r.status === "hit");
  return {
    scoredAt: new Date(now).toISOString(),
    rows,
    settled: settled.length,
    pending: rows.length - settled.length,
    hitRatePct: settled.length ? (hits.length / settled.length) * 100 : NaN,
    baselinePct: BASELINE_PCT,
    liftVsBaseline: settled.length ? (hits.length / settled.length) * 100 / BASELINE_PCT : NaN,
  };
}

const f1 = (v) => (Number.isFinite(v) ? v.toFixed(1) : "—");
const f2 = (v) => (Number.isFinite(v) ? v.toFixed(2) : "—");

export function formatAlertScore(result) {
  const lines = ["Alert scoreboard — our own alerts, scored on the study's terms", ""];
  if (!result.rows.length) {
    lines.push("  No alerts recorded yet. Run `wte scan` (or the cron) and come back.");
    return lines.join("\n");
  }

  lines.push("  FIRED             PAIR         volZ    entry        peak      now   status");
  for (const r of result.rows) {
    lines.push(
      `  ${r.firedAt.slice(5, 16).replace("T", " ")}  ${r.symbol.replace(/USDT$/, "").padEnd(10)} ` +
        `${f1(r.volumeZScore).padStart(6)} ${String(r.entry).padStart(9)} ` +
        `${(`${r.maxGainPct >= 0 ? "+" : ""}${f2(r.maxGainPct)}%`).padStart(9)} ` +
        `${(`${r.currentPct >= 0 ? "+" : ""}${f2(r.currentPct)}%`).padStart(8)}   ${r.status}`,
    );
  }

  lines.push("");
  if (result.settled) {
    lines.push(
      `${result.settled} settled, ${result.pending} still inside the ${HORIZON_HOURS}h window. ` +
        `Hit rate ${f1(result.hitRatePct)}% against a ${result.baselinePct}% baseline (${f2(result.liftVsBaseline)}x).`,
    );
    if (result.settled < 30) {
      lines.push(
        `That is ${result.settled} observations. The backtest used 31,515 — do not read a rate off this yet.`,
      );
    }
  } else {
    lines.push(`Nothing settled yet: every alert is still inside its ${HORIZON_HOURS}-hour window.`);
  }
  return lines.join("\n");
}
