/**
 * Catching a move while it is still starting.
 *
 * The signal board answers "does a geometry pay over weeks". It cannot answer
 * "what is waking up right now", and widening its universe did not change
 * that: by the time a name reaches a gainers list the move is largely done —
 * measured on the day this was written, PROM was 19.5% below the high it had
 * set before it appeared on one.
 *
 * So this is a different detector, on hourly bars, and it looks for the thing
 * that precedes a move rather than the move itself: turnover arriving while
 * price has not yet travelled far.
 *
 * The `maxMovePct` ceiling is the whole point. Without it the detector fires
 * on candles that have already run, which is chasing with extra steps. With
 * it, a signal means participation is unusual *and* the price has not yet paid
 * for it.
 *
 * Nothing here asserts the detector works. `backtest` scores it the same way
 * every other claim on this desk is scored — bar by bar, a bar touching both
 * levels charged to the stop, unresolved positions marked to market, and the
 * sample de-overlapped — and it is entirely possible for the answer to be no.
 */

/** Bars of history the volume baseline is measured over. Three days. */
export const BASELINE_BARS = 72;

/** Bars a pair stays quiet after firing, so one event is not counted many times. */
export const COOLDOWN_BARS = 12;

/**
 * @typedef {{high:number,low:number,close:number,openTime:number,quoteVolume:number}} Bar
 */

const mean = (xs) => xs.reduce((s, x) => s + x, 0) / xs.length;

/**
 * Every bar where turnover arrived but price had not yet moved much.
 *
 * @param {Bar[]} bars Hourly candles, oldest first.
 * @param {object} [opts]
 * @param {number} [opts.minVolumeZ] How unusual the turnover must be.
 * @param {number} [opts.lookbackBars] Window the price move is measured over.
 * @param {number} [opts.minMovePct] Ignore a volume spike with no price response.
 * @param {number} [opts.maxMovePct] Refuse to fire on a move that already ran.
 */
export function detect(bars, {
  minVolumeZ = 3,
  lookbackBars = 6,
  minMovePct = 0.5,
  maxMovePct = 6,
} = {}) {
  const events = [];
  let lastFired = -Infinity;

  for (let i = BASELINE_BARS; i < bars.length; i++) {
    if (i - lastFired < COOLDOWN_BARS) continue;

    const history = bars.slice(i - BASELINE_BARS, i).map((b) => b.quoteVolume);
    const mu = mean(history);
    const sd = Math.sqrt(mean(history.map((v) => (v - mu) ** 2)));
    if (!(sd > 0) || !(mu > 0)) continue;

    const volumeZ = (bars[i].quoteVolume - mu) / sd;
    if (volumeZ < minVolumeZ) continue;

    const before = bars[i - lookbackBars];
    if (!before?.close) continue;
    const movePct = ((bars[i].close / before.close) - 1) * 100;
    if (movePct < minMovePct || movePct > maxMovePct) continue;

    lastFired = i;
    events.push({
      index: i,
      at: bars[i].openTime,
      price: bars[i].close,
      volumeZ,
      movePct,
      turnoverUsd: bars[i].quoteVolume,
    });
  }
  return events;
}

/**
 * What happened after each signal, scored honestly.
 *
 * Same discipline as the signal board: the stop is checked before the target
 * on every bar, so a bar reaching both is charged against the trade; a
 * position still open at the horizon is closed at the market rather than
 * counted flat; and the effective sample divides by the horizon because
 * overlapping windows are not independent observations.
 *
 * @param {Bar[]} bars
 * @param {{index:number}[]} events
 * @param {object} opts
 * @param {number} opts.stopPct
 * @param {number} opts.targetPct
 * @param {number} opts.horizonBars
 */
export function backtest(bars, events, { stopPct, targetPct, horizonBars }) {
  let hit = 0, stopped = 0, openR = 0, unresolved = 0, n = 0;
  const outcomes = [];

  for (const e of events) {
    if (e.index + horizonBars >= bars.length) continue; // no outcome yet
    n += 1;
    const entry = bars[e.index].close;
    const stop = entry * (1 - stopPct / 100);
    const target = entry * (1 + targetPct / 100);

    let done = null;
    for (let j = e.index + 1; j <= e.index + horizonBars; j++) {
      if (bars[j].low <= stop) { stopped += 1; done = "stop"; break; }
      if (bars[j].high >= target) { hit += 1; done = "target"; break; }
    }
    if (!done) {
      const movePct = ((bars[e.index + horizonBars].close / entry) - 1) * 100;
      openR += movePct / stopPct;
      unresolved += 1;
      done = "open";
    }
    outcomes.push(done);
  }

  if (!n) return null;
  const rr = targetPct / stopPct;
  return {
    n,
    hitPct: (hit / n) * 100,
    stoppedPct: (stopped / n) * 100,
    unresolvedPct: (unresolved / n) * 100,
    rr,
    expectancyR: (hit * rr - stopped + openR) / n,
    breakEvenHitPct: 100 / (1 + rr),
    /** Signals overlap in time only within a pair; divide by the horizon. */
    effectiveN: n / Math.max(1, horizonBars / COOLDOWN_BARS),
  };
}

/**
 * The same geometry applied to every eligible bar, not just the signalled ones.
 *
 * Without this a hit rate means nothing. A detector that fires in a rising
 * market will show a fine hit rate while adding no information at all, and the
 * only way to see that is to ask what an arbitrary entry would have done over
 * the identical window.
 */
export function baseline(bars, { stopPct, targetPct, horizonBars, step = COOLDOWN_BARS }) {
  const every = [];
  for (let i = BASELINE_BARS; i < bars.length - horizonBars; i += step) every.push({ index: i });
  return backtest(bars, every, { stopPct, targetPct, horizonBars });
}
