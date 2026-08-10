/**
 * Does a retail cross-exchange arbitrage actually exist? Measured, not argued.
 *
 * Every claim in a "$68 to $750k with a bot" story is usually met with reasoning
 * — latency is hard, fees eat the edge, HFT gets there first. All true and all
 * unfalsifiable as stated. The same claims are measurable from an ordinary
 * machine, which is the point: the machine measuring them *is* the retail setup
 * under discussion.
 *
 * Four things are measured here:
 *
 *   1. Round-trip latency from this host to both venues. Not a quoted range —
 *      the actual distribution, because the story's edge lives or dies inside it.
 *
 *   2. The live spread between Binance and OKX top-of-book on a set of pairs,
 *      sampled repeatedly. Both sides are taken from the same sample so a spread
 *      is a spread at one instant rather than two prices from different seconds.
 *
 *   3. How much of that spread survives fees. A cross-venue round trip is two
 *      taker fills, so the threshold is both venues' taker fee added together —
 *      and the honest version also crosses each venue's own bid-ask, because you
 *      buy at the ask and sell at the bid, never at the midpoint.
 *
 *   4. Whether the capital in the story can even place the orders. Exchanges
 *      enforce a minimum notional per order, and that floor is a hard gate no
 *      amount of code removes.
 *
 * The naive version of this measurement — comparing midpoints and calling any
 * gap an opportunity — is the error that makes arbitrage look easy. A midpoint
 * is a price nobody trades at. Both readings are reported so the difference
 * between them is visible rather than asserted.
 *
 * Reproducible:
 *   node research/arb-reality.mjs > research/arb-reality.json
 */

const BINANCE = "https://data-api.binance.vision/api/v3";
const OKX = "https://www.okx.com/api/v5";

/** Pairs liquid on both venues, spanning the size range a retail bot would scan. */
const PAIRS = [
  { binance: "BTCUSDT", okx: "BTC-USDT" },
  { binance: "ETHUSDT", okx: "ETH-USDT" },
  { binance: "SOLUSDT", okx: "SOL-USDT" },
  { binance: "XRPUSDT", okx: "XRP-USDT" },
  { binance: "DOGEUSDT", okx: "DOGE-USDT" },
  { binance: "ADAUSDT", okx: "ADA-USDT" },
  { binance: "LINKUSDT", okx: "LINK-USDT" },
  { binance: "ICPUSDT", okx: "ICP-USDT" },
];

/**
 * Standard spot taker fee at the entry tier on each venue, in percent.
 *
 * The entry tier is the right one for this test: the story's capital is $68,
 * and every fee discount on either venue is gated behind volume or a token
 * holding that $68 cannot reach. Quoting a VIP rate here would be assuming away
 * the exact constraint being tested.
 */
const FEES = { binanceTakerPct: 0.1, okxTakerPct: 0.1 };
const ROUND_TRIP_FEE_PCT = FEES.binanceTakerPct + FEES.okxTakerPct;

/** The story, in numbers. */
const STORY = { startUsd: 68, endUsd: 750_000 };

/**
 * The analysis being audited, in its own numbers.
 *
 * Carried in the output rather than quoted loosely, because an audit that keeps
 * the claims it is testing in a different place from its own measurements will
 * eventually conflate the two — which is the failure the audit exists to catch.
 */
const AUDITED = {
  retailLatencyRangeMs: [50, 300],
  hftLatencyMs: "single-digit, co-located",
  quotedSpreadRangePct: [0.05, 0.3],
  opportunityLifetime: "a few hundred milliseconds",
  concern: "minimum order size makes many opportunities uneconomic at $68",
  verdict: "not feasible",
};

const SAMPLES = 40;
const SAMPLE_GAP_MS = 3_000;

const timed = async (fn) => {
  const t0 = process.hrtime.bigint();
  const value = await fn();
  return { value, ms: Number(process.hrtime.bigint() - t0) / 1e6 };
};

const getJson = async (url) => {
  const res = await fetch(url, { signal: AbortSignal.timeout(15_000) });
  if (!res.ok) throw new Error(`HTTP ${res.status} ${url}`);
  return res.json();
};

/** Binance top-of-book for every pair in one request. */
const binanceBook = async () => {
  const symbols = JSON.stringify(PAIRS.map((p) => p.binance));
  const rows = await getJson(`${BINANCE}/ticker/bookTicker?symbols=${encodeURIComponent(symbols)}`);
  return Object.fromEntries(rows.map((r) => [r.symbol, { bid: Number(r.bidPrice), ask: Number(r.askPrice) }]));
};

/** OKX top-of-book for every spot pair in one request. */
const okxBook = async () => {
  const body = await getJson(`${OKX}/market/tickers?instType=SPOT`);
  const want = new Set(PAIRS.map((p) => p.okx));
  const out = {};
  for (const r of body.data ?? []) {
    if (want.has(r.instId)) out[r.instId] = { bid: Number(r.bidPx), ask: Number(r.askPx) };
  }
  return out;
};

const median = (xs) => {
  const s = [...xs].sort((a, b) => a - b);
  const m = s.length >> 1;
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};
const pctile = (xs, p) => {
  const s = [...xs].sort((a, b) => a - b);
  return s[Math.min(s.length - 1, Math.floor(s.length * p))];
};

const latency = { binance: [], okx: [] };
const samples = [];

for (let i = 0; i < SAMPLES; i++) {
  try {
    // Both venues in the same tick, so a spread is one instant rather than two.
    const [b, o] = await Promise.all([timed(binanceBook), timed(okxBook)]);
    latency.binance.push(b.ms);
    latency.okx.push(o.ms);

    for (const p of PAIRS) {
      const bb = b.value[p.binance], oo = o.value[p.okx];
      if (!bb || !oo || !bb.bid || !oo.bid) continue;

      const bMid = (bb.bid + bb.ask) / 2, oMid = (oo.bid + oo.ask) / 2;

      /**
       * Two readings of the same moment.
       *
       * "midpoint" is the flattering one and the one a naive scanner reports.
       * "executable" is what a taker actually gets: buy the ask on one venue,
       * sell the bid on the other, best direction of the two. The gap between
       * the two numbers is the whole illusion.
       */
      const midSpreadPct = (Math.abs(bMid - oMid) / Math.min(bMid, oMid)) * 100;
      const buyBinance = ((oo.bid - bb.ask) / bb.ask) * 100;
      const buyOkx = ((bb.bid - oo.ask) / oo.ask) * 100;
      const executablePct = Math.max(buyBinance, buyOkx);

      samples.push({
        pair: p.binance,
        midSpreadPct,
        executablePct,
        netAfterFeesPct: executablePct - ROUND_TRIP_FEE_PCT,
      });
    }
  } catch {
    // A dropped sample is a dropped sample; it is not an opportunity, and
    // filling it in with the previous tick would invent liquidity.
  }
  if (i < SAMPLES - 1) await new Promise((r) => setTimeout(r, SAMPLE_GAP_MS));
}

const perPair = PAIRS.map((p) => {
  const rows = samples.filter((s) => s.pair === p.binance);
  if (!rows.length) return { pair: p.binance, samples: 0 };
  const mid = rows.map((r) => r.midSpreadPct);
  const exe = rows.map((r) => r.executablePct);
  return {
    pair: p.binance,
    samples: rows.length,
    midSpreadMedianPct: median(mid),
    midSpreadP90Pct: pctile(mid, 0.9),
    executableMedianPct: median(exe),
    executableMaxPct: Math.max(...exe),
    /** Ticks where a naive midpoint scanner would have flagged an edge. */
    midpointLooksProfitablePct: (mid.filter((v) => v > ROUND_TRIP_FEE_PCT).length / rows.length) * 100,
    /** Ticks where the trade actually pays after crossing both books and both fees. */
    trulyProfitablePct: (rows.filter((r) => r.netAfterFeesPct > 0).length / rows.length) * 100,
  };
});

const allMid = samples.map((s) => s.midSpreadPct);
const allExe = samples.map((s) => s.executablePct);

/**
 * Minimum order notional, straight from the venue.
 *
 * The gate nobody models. A bot with $68 must place an order on each side, and
 * if either side is below the venue's floor the opportunity is not thin — it is
 * unreachable, and no latency improvement changes that.
 */
const minNotional = await (async () => {
  try {
    const symbols = PAIRS.map((p) => p.binance);
    const info = await getJson(
      `${BINANCE}/exchangeInfo?symbols=${encodeURIComponent(JSON.stringify(symbols))}`);
    return info.symbols.map((s) => ({
      pair: s.symbol,
      minNotionalUsd: Number(
        s.filters.find((f) => f.filterType === "NOTIONAL" || f.filterType === "MIN_NOTIONAL")?.minNotional ?? 0),
    }));
  } catch { return null; }
})();

/**
 * What the story's return would require.
 *
 * Stated without a time frame, so it is expressed as the multiple and as the
 * per-trade edge needed to reach it over plausible trade counts. Not a
 * refutation on its own — a number, so the reader can weigh it against the
 * measured edge above rather than against a feeling.
 */
const storyMath = (() => {
  const multiple = STORY.endUsd / STORY.startUsd;
  const perTradeGainPct = (trades) => (multiple ** (1 / trades) - 1) * 100;
  const bestObserved = Math.max(...allExe);
  return {
    multiple,
    /**
     * Compounding every dollar, no withdrawals, no losing trades at all — and
     * then the gross spread each of those trades would have to find, since the
     * fee is paid before any of the gain exists.
     */
    requiredGainPerTradePct: [100, 1_000, 10_000, 100_000].map((t) => ({
      trades: t,
      gainPerTradePct: perTradeGainPct(t),
      requiredGrossSpreadPct: perTradeGainPct(t) + ROUND_TRIP_FEE_PCT,
      timesLargerThanBestObserved: (perTradeGainPct(t) + ROUND_TRIP_FEE_PCT) / bestObserved,
    })),
    /**
     * The best spread that actually occurred, after fees.
     *
     * If this is negative there is no trade count that reaches the target,
     * because every round trip shrinks the account. It ends the arithmetic
     * before any argument about latency or competition is needed.
     */
    bestObservedGrossPct: bestObserved,
    bestObservedNetPct: bestObserved - ROUND_TRIP_FEE_PCT,
  };
})();

console.log(JSON.stringify({
  measuredAt: new Date().toISOString(),
  audited: AUDITED,
  method: {
    venues: ["Binance spot (data-api.binance.vision)", "OKX spot (www.okx.com)"],
    samples: SAMPLES,
    sampleGapMs: SAMPLE_GAP_MS,
    observations: samples.length,
    fees: { ...FEES, roundTripPct: ROUND_TRIP_FEE_PCT, tier: "entry tier, no VIP or token discount" },
    spread: "Both venues fetched in the same tick. Executable spread crosses each book: buy the ask, sell the bid.",
    latency: "Wall-clock round trip from this host, including TLS and the agent proxy — the same path a retail bot takes.",
    caveat: "REST top-of-book, sampled every few seconds. A real bot uses WebSocket and sees more ticks; it also faces the same fees and the same books.",
  },
  latency: {
    binance: { medianMs: median(latency.binance), p90Ms: pctile(latency.binance, 0.9), n: latency.binance.length },
    okx: { medianMs: median(latency.okx), p90Ms: pctile(latency.okx, 0.9), n: latency.okx.length },
  },
  spreads: {
    midpointMedianPct: median(allMid),
    midpointP90Pct: pctile(allMid, 0.9),
    midpointMaxPct: Math.max(...allMid),
    executableMedianPct: median(allExe),
    executableMaxPct: Math.max(...allExe),
    roundTripFeePct: ROUND_TRIP_FEE_PCT,
    midpointLooksProfitablePct: (allMid.filter((v) => v > ROUND_TRIP_FEE_PCT).length / allMid.length) * 100,
    trulyProfitablePct: (samples.filter((s) => s.netAfterFeesPct > 0).length / samples.length) * 100,
    /** How far the median executable spread falls short of just the fees. */
    medianShortfallPct: ROUND_TRIP_FEE_PCT - median(allExe),
    /**
     * The round-trip fee as a multiple of the best gap that actually opened.
     *
     * Derived rather than left to the reader because it is the sentence the
     * whole measurement reduces to, and a ratio recomputed by hand downstream
     * is a ratio that drifts away from the data it came from.
     */
    feeOverBestObservedX: ROUND_TRIP_FEE_PCT / Math.max(...allExe),
    /**
     * The executable spread as a distribution rather than three summary numbers.
     *
     * Carried so a chart can show the sample itself. A median and a max invite
     * the reader to imagine the shape between them; the buckets remove the
     * imagining, and the shape is the argument — every observation piled up far
     * to the left of a fee line it never reaches.
     */
    histogram: (() => {
      const step = 0.01, lo = -0.05, hi = 0.25;
      const bins = [];
      for (let x = lo; x < hi - 1e-9; x += step) {
        bins.push({
          fromPct: Number(x.toFixed(2)),
          toPct: Number((x + step).toFixed(2)),
          count: allExe.filter((v) => v >= x && v < x + step).length,
        });
      }
      return bins.filter((b) => b.count > 0);
    })(),
    /**
     * Share of ticks with any positive executable spread at all, fees ignored.
     *
     * The most generous test that can be constructed: a free exchange, no fees,
     * no slippage, instant fills. Whatever survives here is the ceiling on
     * everything else.
     */
    positiveBeforeFeesPct: (allExe.filter((v) => v > 0).length / allExe.length) * 100,
  },
  perPair,
  minNotional,
  story: { ...STORY, ...storyMath },
}, null, 2));
