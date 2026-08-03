import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { alertsFrom, scoreSeries, LOOKBACK_HOURS } from "../src/intraday.mjs";
import { AlertLog } from "../src/alerts.mjs";

const hour = 3_600_000;
/** A week of steady hours, so anything appended stands out against a real baseline. */
const steady = (n = LOOKBACK_HOURS + 2, volume = 1000) =>
  Array.from({ length: n }, (_, i) => ({
    openTime: i * hour, open: 100, high: 100, low: 100, close: 100, volume: 1, quoteVolume: volume + (i % 2),
  }));

test("the live hour is excluded, so the scanner does not go blind mid-hour", () => {
  const candles = steady();
  candles.at(-2).quoteVolume = 50_000;   // the last completed hour: a real spike
  candles.at(-1).quoteVolume = 3;        // the live hour, seconds old

  const row = scoreSeries("TESTUSDT", candles);
  assert.ok(row.volumeZScore > 5, `the completed spike should score, got ${row.volumeZScore}`);
});

test("a series shorter than its own baseline scores nothing rather than guessing", () => {
  assert.equal(scoreSeries("TESTUSDT", steady(40)), null);
});

test("a flat pair produces no alert", () => {
  const row = scoreSeries("TESTUSDT", steady());
  assert.ok(Math.abs(row.volumeZScore) < 5);
  assert.deepEqual(alertsFrom([row]), []);
});

const tmpLog = () => new AlertLog({ file: path.join(fs.mkdtempSync(path.join(os.tmpdir(), "wte-")), "alerts.jsonl") });

test("the same breakout does not alert every hour", () => {
  const log = tmpLog();
  const alert = { symbol: "BICOUSDT", hourOpenTime: 1, volumeZScore: 6.7, price: 0.0122 };
  const t0 = new Date("2026-08-02T14:00:00Z");

  assert.equal(log.record([alert], { now: t0 }).length, 1, "the first one fires");
  assert.equal(
    log.record([{ ...alert, hourOpenTime: 2 }], { now: new Date(t0.getTime() + hour) }).length,
    0,
    "the next hour of the same move is suppressed",
  );
  assert.equal(
    log.record([{ ...alert, hourOpenTime: 3 }], { now: new Date(t0.getTime() + 7 * hour) }).length,
    1,
    "a second leg after the cooldown is its own alert",
  );
});

test("rescanning within the hour is the same observation, not a new one", () => {
  const log = tmpLog();
  const alert = { symbol: "UTKUSDT", hourOpenTime: 99, volumeZScore: 19.1, price: 1 };
  const now = new Date("2026-08-03T10:00:00Z");
  assert.equal(log.record([alert], { now }).length, 1);
  assert.equal(log.record([alert], { now, cooldownHours: 0 }).length, 0, "same candle, same alert");
});

test("the log is append-only and survives a reload", () => {
  const log = tmpLog();
  log.record([{ symbol: "AUSDT", hourOpenTime: 1, volumeZScore: 6 }], { now: new Date("2026-08-01T00:00:00Z") });
  log.record([{ symbol: "BUSDT", hourOpenTime: 1, volumeZScore: 7 }], { now: new Date("2026-08-01T01:00:00Z") });

  const reopened = new AlertLog({ file: log.file });
  assert.deepEqual(reopened.all().map((a) => a.symbol), ["AUSDT", "BUSDT"]);
  assert.ok(reopened.all()[0].firedAt, "an alert records when we saw it");
});

test("an alert inside its window is pending, not a miss", async () => {
  const { scoreAlert } = await import("../src/alert-score.mjs");
  const t0 = Date.UTC(2026, 7, 3, 13);
  const alert = { symbol: "SUSDT", hourOpenTime: t0, price: 100, volumeZScore: 7, firedAt: new Date(t0).toISOString() };
  const candles = [{ openTime: t0 + hour, high: 102, low: 99, close: 101 }];

  const r = scoreAlert(alert, candles, { now: t0 + 2 * hour });
  assert.equal(r.status, "pending", "two hours in is not a verdict");
  assert.ok(Math.abs(r.maxGainPct - 2) < 1e-9);
});

test("a hit settles the moment it happens, a miss waits for the window to close", async () => {
  const { scoreAlert } = await import("../src/alert-score.mjs");
  const t0 = Date.UTC(2026, 7, 3, 13);
  const alert = { symbol: "XUSDT", hourOpenTime: t0, price: 100, volumeZScore: 6, firedAt: new Date(t0).toISOString() };

  const won = [{ openTime: t0 + hour, high: 115, low: 100, close: 114 }];
  assert.equal(scoreAlert(alert, won, { now: t0 + 2 * hour }).status, "hit");

  const flat = [{ openTime: t0 + hour, high: 101, low: 99, close: 100 }];
  assert.equal(scoreAlert(alert, flat, { now: t0 + 13 * hour }).status, "miss", "the window closed");
});

test("candles beyond the horizon do not rescue a miss", async () => {
  const { scoreAlert } = await import("../src/alert-score.mjs");
  const t0 = Date.UTC(2026, 7, 3, 13);
  const alert = { symbol: "YUSDT", hourOpenTime: t0, price: 100, volumeZScore: 6, firedAt: new Date(t0).toISOString() };
  // The 20% candle lands on hour 20, well past the twelve-hour window.
  const candles = [
    { openTime: t0 + hour, high: 101, low: 99, close: 100 },
    { openTime: t0 + 20 * hour, high: 120, low: 100, close: 119 },
  ];
  assert.equal(scoreAlert(alert, candles, { now: t0 + 30 * hour }).status, "miss");
});
