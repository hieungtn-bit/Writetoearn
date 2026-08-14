/**
 * The daily signal engine, rebuilt after a trader pointed out it could only
 * ever say one thing.
 *
 * Three faults produced that, and all three are addressed here rather than
 * softened.
 *
 *   1. **The grid was long-only.** Every geometry bought and held to a target
 *      above entry, so on a falling asset expectancy was negative by
 *      construction and WAIT was the only remaining option. Measured across the
 *      same grid, long was positive in 2 of 96 cells on ICP while short was
 *      positive in 89 — the WAIT was a missing branch, not a market view. Both
 *      directions are now scored on equal terms.
 *
 *   2. **The window was the whole history.** Run on 180 days instead of 1000,
 *      every sign flipped: ICP long went from 0% of cells positive to 88%,
 *      while ICP short went from 94% to 0%. A thousand-day average measures an
 *      old regime and applies it to a market that has already turned. The
 *      recent window decides; the long window is kept only to detect the
 *      disagreement.
 *
 *   3. **WAIT was the default rather than a conclusion.** It is now only
 *      reachable when *both* directions are unprofitable. If long loses and
 *      short pays, the answer is short.
 *
 * What has not changed: every cell is walked bar by bar, a bar reaching both
 * levels is charged to the stop, unresolved positions close at the market
 * rather than counting as flat, and stops price cannot reach are thrown out
 * instead of scored.
 */

/** Stops wider than this are not risk management, they are a decision to hold. */
export const MAX_STOP_PCT = 60;

/** Turnover below this cannot absorb a position, whatever the geometry says. */
export const MIN_TURNOVER_USD = 2e6;

export const STOP_ATRS = [1, 1.5, 2, 3];
export const REWARD_RATIOS = [1, 1.5, 2, 3];
export const HORIZONS = [3, 5, 10, 30];

/** Days in the window that decides the call. */
export const RECENT_DAYS = 180;

/**
 * Lookbacks the call is re-tested against, to see whether it survives them.
 *
 * Starts at the deciding window and widens. An asset without enough history
 * simply reports fewer windows rather than being dropped — a young token can
 * still be scored, it just cannot claim stability it has not lived through.
 */
export const AGREEMENT_WINDOWS = [180, 270, 365, 540, 730];

export const BIAS = { LONG: "LONG", SHORT: "SHORT", WAIT: "WAIT" };

const median = (xs) => {
  if (!xs.length) return null;
  const s = [...xs].sort((a, b) => a - b);
  const m = s.length >> 1;
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};

/**
 * One geometry, walked bar by bar, in either direction.
 *
 * A short is not a long with the arithmetic negated: its stop sits *above*
 * entry and its target below, so the bar's high is checked against the stop and
 * its low against the target. Getting that inverted is the standard way a short
 * backtest reports a fortune that was never available.
 */
export function walk(candles, { direction, stopPct, targetPct, horizon }) {
  const long = direction === "long";
  let hit = 0, stopped = 0, n = 0;
  const open = [];

  for (let i = 0; i < candles.length - horizon; i++) {
    const entry = candles[i].close;
    const stop = long ? entry * (1 - stopPct / 100) : entry * (1 + stopPct / 100);
    const target = long ? entry * (1 + targetPct / 100) : entry * (1 - targetPct / 100);
    n++;
    let done = false;
    for (let j = i + 1; j <= i + horizon; j++) {
      const c = candles[j];
      // Stop first, so a bar reaching both levels is charged against the trade.
      if (long ? c.low <= stop : c.high >= stop) { stopped++; done = true; break; }
      if (long ? c.high >= target : c.low <= target) { hit++; done = true; break; }
    }
    if (!done) {
      const movePct = (candles[i + horizon].close / entry - 1) * 100;
      open.push(long ? movePct : -movePct);
    }
  }

  if (!n) return null;
  const rr = targetPct / stopPct;
  // Each open position is worth its mark-to-market divided by the risk, which
  // puts it on the same R scale as a stop or a target.
  const openR = open.reduce((s, m) => s + m / stopPct, 0);
  return {
    n,
    hitPct: (hit / n) * 100,
    stoppedPct: (stopped / n) * 100,
    unresolvedPct: (open.length / n) * 100,
    rr,
    expectancyR: (hit * rr - stopped + openR) / n,
    effectiveN: n / horizon,
  };
}

/** Every tradeable geometry in one direction, over one candle series. */
export function grid(candles, atrPct, { direction }) {
  const cells = [];
  for (const stopAtr of STOP_ATRS) {
    const stopPct = stopAtr * atrPct;
    if (!Number.isFinite(stopPct) || stopPct <= 0 || stopPct >= MAX_STOP_PCT) continue;
    for (const rr of REWARD_RATIOS) {
      for (const horizon of HORIZONS) {
        if (candles.length <= horizon + 1) continue;
        const r = walk(candles, { direction, stopPct, targetPct: stopPct * rr, horizon });
        if (r) cells.push({ direction, stopAtr, stopPct, rr, horizonDays: horizon, targetPct: stopPct * rr, ...r });
      }
    }
  }
  return cells;
}

/** Median expectancy, share of cells that pay, and the single best cell. */
export function summarise(cells) {
  if (!cells.length) return null;
  const positive = cells.filter((c) => c.expectancyR > 0);
  return {
    cells: cells.length,
    positive: positive.length,
    positiveSharePct: (positive.length / cells.length) * 100,
    medianExpectancyR: median(cells.map((c) => c.expectancyR)),
    best: [...cells].sort((a, b) => b.expectancyR - a.expectancyR)[0],
  };
}

/**
 * The call for one pair.
 *
 * The recent window decides, because that is the market being traded. The full
 * history is scored only so a disagreement between the two can be reported — a
 * sign flip is the most useful thing this engine can tell anyone, and averaging
 * it away is precisely how the old version stayed blind to a turn.
 */
export function signalFor({ symbol, candles, atrPct, price, turnoverUsd, recentDays = RECENT_DAYS }) {
  if (!candles?.length || !Number.isFinite(atrPct) || atrPct <= 0) {
    return { symbol, bias: BIAS.WAIT, reason: "no usable candles", tradeable: false };
  }

  const recent = candles.slice(-recentDays);
  const view = (series) => ({
    long: summarise(grid(series, atrPct, { direction: "long" })),
    short: summarise(grid(series, atrPct, { direction: "short" })),
  });
  const now = view(recent);
  const history = view(candles);

  if (!now.long || !now.short) {
    return { symbol, bias: BIAS.WAIT, reason: "grid is entirely untradeable at this volatility", tradeable: false };
  }

  const liquid = !Number.isFinite(turnoverUsd) || turnoverUsd >= MIN_TURNOVER_USD;

  const longR = now.long.medianExpectancyR;
  const shortR = now.short.medianExpectancyR;

  let bias = BIAS.WAIT;
  let side = null;
  if (longR > 0 || shortR > 0) {
    side = longR >= shortR ? "long" : "short";
    bias = side === "long" ? BIAS.LONG : BIAS.SHORT;
  }

  /**
   * Does the recent window disagree with the long one?
   *
   * A sign flip means the regime has turned inside the sample, and it is the
   * single most decision-relevant thing here: it says the long-run average is
   * describing a market that no longer exists.
   */
  const flipped = (a, b) => a != null && b != null && Math.sign(a) !== Math.sign(b) && a !== 0 && b !== 0;
  const regime = {
    longFlipped: flipped(now.long.medianExpectancyR, history.long?.medianExpectancyR ?? null),
    shortFlipped: flipped(now.short.medianExpectancyR, history.short?.medianExpectancyR ?? null),
    recentLongR: now.long.medianExpectancyR,
    historyLongR: history.long?.medianExpectancyR ?? null,
    recentShortR: now.short.medianExpectancyR,
    historyShortR: history.short?.medianExpectancyR ?? null,
  };
  regime.turning = regime.longFlipped || regime.shortFlipped;

  /**
   * How many independent lookbacks agree with the call.
   *
   * `regime.turning` answers this as a yes or no, and that turns out to hide
   * most of the information. Measured across five windows, two calls on the
   * same board can both be flagged "turning" while one has four of five
   * lookbacks behind it and the other has one — the first is a call with a
   * dissenting window, the second is a call the evidence mostly contradicts.
   *
   * The windows are nested rather than disjoint, so they are not independent
   * samples and this is not a significance test. It is a stability check: a
   * direction that only pays inside one lookback is a property of that
   * lookback.
   */
  const agreement = side
    ? (() => {
      const tested = [];
      for (const days of AGREEMENT_WINDOWS) {
        if (candles.length < days + Math.max(...HORIZONS)) continue;
        const g = summarise(grid(candles.slice(-days), atrPct, { direction: side }));
        if (g) tested.push({ days, medianExpectancyR: g.medianExpectancyR });
      }
      const agree = tested.filter((t) => t.medianExpectancyR > 0).length;
      return {
        windows: tested.length,
        agreeing: agree,
        sharePct: tested.length ? (agree / tested.length) * 100 : null,
        detail: tested,
      };
    })()
    : null;

  const chosen = side ? now[side] : null;
  const best = chosen?.best ?? null;

  return {
    symbol,
    price,
    atrPct,
    turnoverUsd: turnoverUsd ?? null,
    tradeable: liquid,
    bias,
    side,
    reason: bias === BIAS.WAIT
      ? "both directions lose over the recent window"
      : `${side} pays in ${chosen.positive} of ${chosen.cells} geometries`,
    recent: now,
    history,
    regime,
    agreement,
    plan: best && {
      direction: best.direction,
      horizonDays: best.horizonDays,
      stopAtr: best.stopAtr,
      stopPct: best.stopPct,
      targetPct: best.targetPct,
      rr: best.rr,
      hitPct: best.hitPct,
      stoppedPct: best.stoppedPct,
      unresolvedPct: best.unresolvedPct,
      expectancyR: best.expectancyR,
      effectiveN: best.effectiveN,
      entry: price,
      stop: best.direction === "long"
        ? price * (1 - best.stopPct / 100)
        : price * (1 + best.stopPct / 100),
      target: best.direction === "long"
        ? price * (1 + best.targetPct / 100)
        : price * (1 - best.targetPct / 100),
      /** Sizing so one full stop costs exactly 1% of the account. */
      positionUsdPer1000: (1000 * 0.01) / (best.stopPct / 100),
      maxLeverage: 100 / best.stopPct,
    },
    /**
     * How much weight this deserves. Sample first, because a strong expectancy
     * over four independent episodes is a story, not a finding.
     */
    confidence: best
      ? {
        effectiveN: best.effectiveN,
        thin: best.effectiveN < 12,
        agreesWithHistory: side
          ? Math.sign(now[side].medianExpectancyR) === Math.sign(history[side]?.medianExpectancyR ?? 0)
          : null,
      }
      : null,
  };
}

/**
 * How many independent episodes a row needs before its figure is taken at
 * face value. At n = k the expectancy is halved; at n = 12, the threshold
 * this file already uses for "not thin", three quarters of it survives.
 */
export const SAMPLE_SHRINK_K = 4;

/**
 * Expectancy discounted by how little the sample supports it.
 *
 * Ranking on the raw figure put six tokenised equities at the top of the
 * board, every one showing above 1.6R on fewer than two independent episodes.
 * That is not bad luck to be filtered around afterwards. `plan` is the maximum
 * of 64 geometries, and a maximum over noisy estimates is largest exactly
 * where the sample is smallest — so ranking on it systematically surfaces the
 * rows carrying the least evidence, which is the opposite of what a board is
 * for.
 *
 * The shrink is deliberately crude, because this decides a display order
 * rather than a forecast. Nothing here alters the published expectancy; it
 * alters only which row a reader sees first.
 */
export function trustedExpectancyR(signal, k = SAMPLE_SHRINK_K) {
  const e = signal.plan?.expectancyR;
  if (!Number.isFinite(e)) return null;
  const n = signal.plan?.effectiveN ?? 0;
  return e * (n / (n + k));
}

/** Ranks a set of signals: actionable and liquid first, then by conviction. */
export function rankSignals(signals) {
  const strength = (s) => (s.bias === BIAS.WAIT ? -Infinity : trustedExpectancyR(s) ?? -Infinity);
  return [...signals].sort((a, b) => {
    if (a.tradeable !== b.tradeable) return a.tradeable ? -1 : 1;
    return strength(b) - strength(a);
  });
}

/** Counts for the header of a report or a page. */
export function tallySignals(signals) {
  const by = { LONG: 0, SHORT: 0, WAIT: 0 };
  for (const s of signals) by[s.bias] = (by[s.bias] ?? 0) + 1;
  return {
    total: signals.length,
    ...by,
    turning: signals.filter((s) => s.regime?.turning).length,
    untradeable: signals.filter((s) => !s.tradeable).length,
  };
}
