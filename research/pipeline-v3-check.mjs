/**
 * Auditing a corrected ruleset: were the new filters actually applied?
 *
 * The pipeline under test has adopted the right rules. Volume direction is now a
 * hard gate, range position caps the stage, overhead above 50% is close to
 * disqualifying, and the notes say to prefer setups with positive expectancy
 * across many stop/reward combinations rather than a single best cell. Those are
 * the corrections, and they are the correct ones.
 *
 * Which makes this audit a different question from the previous ones. Not "are
 * the rules right" — they are — but **were they run with real numbers or with
 * adjectives?** A gate that says "overhead above 50% disqualifies" does nothing
 * at all if the input for that field is the word "trung bình".
 *
 * So every name in the new output is scored against the new rules mechanically,
 * and the rules are evaluated as booleans rather than as prose. Each pair also
 * gets the multi-cell geometry test the pipeline now says it prefers, because
 * that criterion is the one most likely to be honoured in the summary and
 * skipped in the scoring.
 *
 * Reproducible:
 *   node research/pipeline-v3-check.mjs > research/pipeline-v3-check.json
 */

import { analyzeAsset, atr, correlation, fetchKlines, logReturns, mean, sma } from "../src/analysis.mjs";
import { stageOf } from "../src/stage.mjs";

/** The new ruleset, as thresholds rather than adjectives. */
const RULES = {
  volumeTrendMustBePositive: 0,
  rangePositionCapsEarlyAt: 85,
  overheadHeavyPenaltyAbove: 35,
  overheadUsuallyDisqualifiesAbove: 50,
  /** "Prefer positive expectancy across many stop/RR combinations." */
  multiCellMinPositiveSharePct: 10,
};

/** What the new pipeline output claims, so each row can be checked in place. */
const CLAIMED = [
  { asset: "SUI", symbol: "SUIUSDT", geckoId: "sui",
    rank: 1, score: 6.8, overhead: "trung bình", volume: "ổn", rangePos: "trung bình", beta: "trung" },
  { asset: "ENA", symbol: "ENAUSDT", geckoId: "ethena",
    rank: 2, score: 6.4, overhead: "cao (~35%)", volume: "yếu", rangePos: "trung-cao", beta: "cao (1.5+)" },
  { asset: "ICP", symbol: "ICPUSDT", geckoId: "internet-computer",
    rank: 3, score: 6.2, overhead: "thấp", volume: "mạnh", rangePos: "rất cao", beta: "thấp hơn" },
];

const SCAN_BTC = { bandLow: 64_000, bandHigh: 65_200, riskLow: 63_500, riskHigh: 64_000 };

const retry = async (fn, n = 6) => {
  let last;
  for (let i = 0; i < n; i++) {
    try { return await fn(); } catch (e) { last = e; await new Promise((r) => setTimeout(r, 1200 * (i + 1))); }
  }
  throw last;
};

const median = (xs) => {
  const s = [...xs].sort((a, b) => a - b);
  const m = s.length >> 1;
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};

const btcDaily = await retry(() => fetchKlines("BTCUSDT", { interval: "1d", limit: 400 }));
const btcAnalysis = await retry(() => analyzeAsset("BTCUSDT"));
const btcCloses = btcDaily.map((c) => c.close);

const btc = {
  price: btcAnalysis.price,
  claimedBand: [SCAN_BTC.bandLow, SCAN_BTC.bandHigh],
  insideClaimedBand: btcAnalysis.price >= SCAN_BTC.bandLow && btcAnalysis.price <= SCAN_BTC.bandHigh,
  riskBand: [SCAN_BTC.riskLow, SCAN_BTC.riskHigh],
  insideRiskBand: btcAnalysis.price >= SCAN_BTC.riskLow && btcAnalysis.price <= SCAN_BTC.riskHigh,
  sma50: sma(btcCloses, 50),
  sma200: sma(btcCloses, 200),
  rangePosition30d: btcAnalysis.rangePosition30d,
};

/**
 * Path-aware first touch. A bar reaching both levels is charged to the stop,
 * because a daily candle does not reveal the order inside it.
 */
const firstTouch = (candles, upPct, downPct, horizon) => {
  let up = 0, down = 0, n = 0;
  for (let i = 0; i < candles.length - horizon; i++) {
    const entry = candles[i].close;
    const target = entry * (1 + upPct / 100);
    const stop = entry * (1 - downPct / 100);
    n++;
    for (let j = i + 1; j <= i + horizon; j++) {
      if (candles[j].low <= stop) { down++; break; }
      if (candles[j].high >= target) { up++; break; }
    }
  }
  const rr = upPct / downPct;
  return { n, upPct: (up / n) * 100, downPct: (down / n) * 100, expectancyR: (up / n) * rr - (down / n) };
};

const STOP_ATRS = [1, 1.5, 2, 2.5, 3, 4];
const RRS = [1, 1.5, 2, 3, 5];
const HORIZONS = [30, 60, 90];

const rows = [];
for (const c of CLAIMED) {
  const daily = await retry(() => fetchKlines(c.symbol, { interval: "1d", limit: 1000 }));
  const analysis = await retry(() => analyzeAsset(c.symbol));
  const stage = await retry(() => stageOf(c.asset)).catch(() => null);
  const price = analysis.price;
  const atrPct = (atr(daily, 14) / price) * 100;

  const gecko = await retry(async () => {
    const res = await fetch(
      `https://api.coingecko.com/api/v3/coins/markets?vs_currency=usd&ids=${c.geckoId}`,
      { signal: AbortSignal.timeout(25_000) });
    if (!res.ok) throw new Error(`coingecko: HTTP ${res.status}`);
    return (await res.json())[0];
  });

  const beta = (() => {
    const x = logReturns(btcCloses.slice(-31));
    const y = logReturns(daily.map((k) => k.close).slice(-31));
    const n = Math.min(x.length, y.length);
    const xs = x.slice(-n), ys = y.slice(-n);
    const mx = mean(xs), my = mean(ys);
    const cov = xs.reduce((s, v, i) => s + (v - mx) * (ys[i] - my), 0) / (n - 1);
    const varx = xs.reduce((s, v) => s + (v - mx) ** 2, 0) / (n - 1);
    const r = correlation(ys, xs);
    return { beta: cov / varx, r, varianceExplainedPct: r ** 2 * 100 };
  })();

  const grid = [];
  for (const stopAtr of STOP_ATRS) {
    const stopPct = stopAtr * atrPct;
    for (const rr of RRS) {
      for (const horizon of HORIZONS) {
        const f = firstTouch(daily, stopPct * rr, stopPct, horizon);
        grid.push({ stopAtr, rr, horizonDays: horizon, expectancyR: f.expectancyR, hitPct: f.upPct });
      }
    }
  }
  const positive = grid.filter((g) => g.expectancyR > 0);
  const positiveSharePct = (positive.length / grid.length) * 100;

  const measured = {
    price,
    underwaterPct: stage?.underwaterPct ?? null,
    volumeTrendPct: stage?.volumeTrendPct ?? null,
    stage: stage?.stage ?? null,
    rangePosition30d: analysis.rangePosition30d,
    atrPct,
    rsi14: analysis.rsi14,
    marketCapUsd: gecko.market_cap,
    fromAthPct: (price / gecko.ath - 1) * 100,
    beta: beta.beta,
    btcVarianceExplainedPct: beta.varianceExplainedPct,
    positiveSharePct,
    positiveCells: positive.length,
    cellsTried: grid.length,
    medianExpectancyR: median(grid.map((g) => g.expectancyR)),
    bestExpectancyR: Math.max(...grid.map((g) => g.expectancyR)),
  };

  /**
   * The new rules, applied mechanically.
   *
   * Each entry says whether the pair passes, so a row that the summary keeps
   * while its own gate rejects it becomes visible rather than arguable.
   */
  const gates = {
    volumeTrendPositive: measured.volumeTrendPct > RULES.volumeTrendMustBePositive,
    notExtended: measured.rangePosition30d < RULES.rangePositionCapsEarlyAt,
    overheadUnderHeavyPenalty: measured.underwaterPct <= RULES.overheadHeavyPenaltyAbove,
    overheadUnderDisqualifier: measured.underwaterPct <= RULES.overheadUsuallyDisqualifiesAbove,
    multiCellGeometry: positiveSharePct >= RULES.multiCellMinPositiveSharePct,
  };
  const failed = Object.entries(gates).filter(([, ok]) => !ok).map(([k]) => k);

  rows.push({
    asset: c.asset,
    claimed: c,
    measured,
    gates,
    gatesFailed: failed,
    /**
     * Whether the ranking survives its own ruleset.
     *
     * A name held at the top of a list while failing the list's own
     * disqualifying gate is not a ranking error — it is a gate that never ran.
     */
    survivesOwnRules: failed.length === 0,
    disqualifiedByOwnRules: !gates.overheadUnderDisqualifier || !gates.multiCellGeometry,
  });
}

console.log(JSON.stringify({
  measuredAt: new Date().toISOString(),
  method: {
    question: "Not whether the new rules are right — they are — but whether they were run with measured numbers or with adjectives.",
    firstTouch: "Walked bar by bar. A bar touching both levels is charged to the stop.",
    grid: `${STOP_ATRS.length} stop distances in daily ranges x ${RRS.length} reward ratios x ${HORIZONS.length} horizons.`,
    unavailable: "Binance futures is geo-blocked from this host; nothing here uses funding, open interest or liquidation data.",
  },
  rules: RULES,
  btc,
  rows,
}, null, 2));
