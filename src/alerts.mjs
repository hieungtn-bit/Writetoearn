/**
 * A memory for the scanner.
 *
 * Every scan in this repo was discarded the moment it printed, which is why the
 * question "how often does the detector fire, and what happened afterwards"
 * could only ever be answered by rerunning a backtest. A backtest measures the
 * past; this measures *us* — the alerts we actually raised, at the prices we
 * actually saw them.
 *
 * Append-only JSONL, one alert per line, because the value is entirely in never
 * rewriting history. An alert whose outcome was disappointing is the most
 * useful row in the file.
 */

import fs from "node:fs";
import path from "node:path";
import { getStateDir } from "./config.mjs";

/**
 * How long a pair stays quiet after firing.
 *
 * Without this the same breakout alerts every hour for a day: the hour that
 * triggers is followed by more busy hours, and each one clears the threshold
 * against a baseline that has not caught up yet. Six hours is short enough that
 * a genuine second leg still gets its own alert.
 */
export const DEFAULT_COOLDOWN_HOURS = 6;

export class AlertLog {
  constructor({ dir = getStateDir(), file } = {}) {
    this.file = file ?? path.join(dir, "alerts.jsonl");
  }

  all() {
    if (!fs.existsSync(this.file)) return [];
    return fs
      .readFileSync(this.file, "utf8")
      .split("\n")
      .filter(Boolean)
      .flatMap((line) => {
        try { return [JSON.parse(line)]; } catch { return []; }
      });
  }

  /** The most recent alert per symbol, for cooldown checks. */
  lastBySymbol() {
    const last = new Map();
    for (const a of this.all()) {
      const prev = last.get(a.symbol);
      if (!prev || a.firedAt > prev.firedAt) last.set(a.symbol, a);
    }
    return last;
  }

  /**
   * Records the alerts that are genuinely new, and returns them.
   *
   * Deduplication happens here rather than at the call site so that a scanner
   * loop, a one-off command and a future notifier all suppress repeats the same
   * way. Returning only the fresh ones lets a caller notify without re-checking.
   */
  record(alerts, { cooldownHours = DEFAULT_COOLDOWN_HOURS, now = new Date() } = {}) {
    const last = this.lastBySymbol();
    const cutoff = now.getTime() - cooldownHours * 3_600_000;
    const fresh = [];

    for (const a of alerts) {
      const prev = last.get(a.symbol);
      if (prev && Date.parse(prev.firedAt) > cutoff) continue;
      // Two scans inside the same hour see the same completed candle. That is
      // the same observation, not a second one.
      if (prev && prev.hourOpenTime === a.hourOpenTime) continue;
      fresh.push({ ...a, firedAt: now.toISOString() });
    }

    if (fresh.length) {
      fs.mkdirSync(path.dirname(this.file), { recursive: true });
      fs.appendFileSync(this.file, fresh.map((a) => JSON.stringify(a)).join("\n") + "\n");
    }
    return fresh;
  }
}
