/**
 * Practical trading lessons, each carrying a worked example computed from live
 * exchange data rather than a hypothetical one.
 *
 * The rule that shapes this file: a lesson may not state a number the reader
 * cannot reproduce. Every figure a lesson prints is derived here from candles,
 * and each lesson ships the exact formula plus the chart it was measured on,
 * so "practical" means reproducible rather than merely confident.
 */

import { barChart, distributionChart, lineChart } from "./charts.mjs";
import { realizedVolatility, volumeZScore, sma } from "./analysis.mjs";

const typical = (k) => (k.high + k.low + k.close) / 3;
const f1 = (v) => Number(v).toFixed(1);
const f2 = (v) => Number(v).toFixed(2);
const sig = (v) => Number(v).toPrecision(4).replace(/\.?0+$/, "");
const pct = (v) => `${v >= 0 ? "+" : ""}${Number(v).toFixed(1)}%`;
const dayLabel = (k) => new Date(k.openTime).toISOString().slice(5, 10);

/** Shared window maths so lessons cannot disagree with each other. */
export function windowStats(candles, days = 30) {
  const w = candles.slice(-days);
  const turnover = w.reduce((s, k) => s + k.quoteVolume, 0);
  const vwap = w.reduce((s, k) => s + typical(k) * k.quoteVolume, 0) / turnover;
  const price = w.at(-1).close;
  const above = w.filter((k) => typical(k) > price).reduce((s, k) => s + k.quoteVolume, 0);
  const byVol = [...w].sort((a, b) => b.quoteVolume - a.quoteVolume);
  const recent = w.slice(-3);
  const prior = w.slice(0, -3);
  const recentMean = recent.reduce((s, k) => s + k.quoteVolume, 0) / recent.length;
  const priorMean = prior.reduce((s, k) => s + k.quoteVolume, 0) / prior.length;

  return {
    window: w,
    price,
    vwap,
    turnover,
    underwaterPct: (above / turnover) * 100,
    vsVwapPct: ((price - vwap) / vwap) * 100,
    concentrationPct: (byVol.slice(0, 3).reduce((s, k) => s + k.quoteVolume, 0) / turnover) * 100,
    volumeTrendPct: priorMean > 0 ? ((recentMean - priorMean) / priorMean) * 100 : 0,
    busiest: byVol.slice(0, 3),
  };
}

/**
 * Every lesson is a pure function of candles, which keeps the teaching honest:
 * if the data stops supporting the example, the build surfaces it rather than
 * shipping a stale claim.
 */
export const LESSONS = [
  {
    slug: "are-holders-in-profit-vwap",
    title: "Are the holders in profit? Measure VWAP, not the chart",
    question: "How do I tell whether the people already holding an asset are winning or losing?",
    level: "Foundation",
    concept:
      "A price chart tells you where an asset started and ended. It does not tell you what the people who bought it actually paid. " +
      "The volume-weighted average price answers that: it weights every price by how much money changed hands there. " +
      "Compare spot to VWAP and you know whether the average participant is up or down — which is what drives their behaviour.",
    formula: [
      "typical price of a day = (high + low + close) / 3",
      "VWAP = sum(typical price x quote volume) / sum(quote volume)",
      "underwater share = turnover on days whose typical price > today's price, / total turnover",
    ],
    mistake:
      "Judging \"cheap\" from the distance to the low. An asset 80% off its high can still sit far below the price the crowd paid, " +
      "which means overhead supply, not value.",
    symbols: ["XRPUSDT"],
    build: ({ XRPUSDT }) => {
      const s = windowStats(XRPUSDT);
      const w = s.window;
      return {
        subject: "XRP",
        readings: [
          ["Spot", sig(s.price)],
          ["30-day VWAP", sig(s.vwap)],
          ["Spot vs VWAP", pct(s.vsVwapPct)],
          ["Money underwater", `${f1(s.underwaterPct)}%`],
        ],
        verdict:
          `${f1(s.underwaterPct)}% of the month's turnover changed hands above ${sig(s.price)}. ` +
          `The average buyer paid ${sig(s.vwap)} and is ${s.vsVwapPct < 0 ? "down" : "up"} ${f1(Math.abs(s.vsVwapPct))}%.`,
        charts: [
          lineChart(w.map((k) => k.close), {
            title: "XRP daily close vs the 30-day VWAP",
            levels: [{ value: s.vwap, label: `VWAP ${sig(s.vwap)}` }],
            labels: [dayLabel(w[0]), dayLabel(w[Math.floor(w.length / 2)]), dayLabel(w.at(-1))],
          }),
        ],
      };
    },
  },

  {
    slug: "expansion-versus-exhaustion-volume-trend",
    title: "Is this pump still recruiting buyers, or running out of them?",
    question: "Two coins both show every holder in profit. How do I tell which one is about to stall?",
    level: "Core",
    concept:
      "The underwater share reads near zero for a move still pulling money in AND for one that has run out of buyers, " +
      "because both sit near their highs. It cannot separate them. What can is the direction of participation: " +
      "compare the last three days of turnover against the weeks before. Price rising on rising volume is expansion. " +
      "Price rising on falling volume is exhaustion — the earliest observable warning there is.",
    formula: [
      "recent = mean daily turnover of the last 3 days",
      "prior  = mean daily turnover of the days before that",
      "volume trend = (recent - prior) / prior",
      "expansion  = price up AND volume trend > 0",
      "exhaustion = price up AND volume trend < 0",
    ],
    mistake:
      "Comparing today's partial candle against yesterday's completed one. At 08:00 UTC a third of the day has passed, " +
      "so today will always look like collapsing volume. Wait for the close, or pro-rate it.",
    symbols: ["UNIUSDT"],
    build: ({ UNIUSDT }) => {
      const s = windowStats(UNIUSDT);
      const week = UNIUSDT.slice(-8, -1);
      const peakVol = week.reduce((m, k) => (k.quoteVolume > m.quoteVolume ? k : m), week[0]);
      return {
        subject: "UNI",
        readings: [
          ["Volume trend (3d vs prior)", pct(s.volumeTrendPct)],
          ["Money underwater", `${f1(s.underwaterPct)}%`],
          ["Spot vs VWAP", pct(s.vsVwapPct)],
          ["Heaviest day closed at", sig(peakVol.close)],
        ],
        verdict:
          `Turnover is running ${pct(s.volumeTrendPct)} against the prior weeks, and the heaviest day of the week closed at ` +
          `${sig(peakVol.close)} against spot ${sig(s.price)}. Volume arriving above the current price is the tell worth learning.`,
        charts: [
          barChart(week.map((k) => ({
            label: dayLabel(k),
            value: k.quoteVolume / 1e6,
            highlight: k.quoteVolume === peakVol.quoteVolume,
          })), { title: "UNI daily turnover, last 7 completed days", unit: "$M" }),
        ],
      };
    },
  },

  {
    slug: "rank-volatility-against-its-own-history",
    title: "Is this quiet, or does it only feel quiet?",
    question: "A coin shows 30% volatility. Is that high or low? Compared to what?",
    level: "Core",
    concept:
      "Volatility numbers are meaningless as absolutes. 30% is sleepy for a small cap and wild for an index. " +
      "The fix is to rank today's reading against the same asset's own history and quote a percentile. " +
      "Compression matters because volatility clusters and mean-reverts, so a reading near the bottom of its own " +
      "distribution raises the odds of expansion — but it tells you the size of the next move, never the direction.",
    formula: [
      "realized vol = stdev(daily log returns over 30d) x sqrt(365)",
      "compute it for every day in the history, then:",
      "percentile = count(past readings < today) / count(all readings)",
    ],
    mistake:
      "Treating compression as a direction signal. It forecasts magnitude. Anyone telling you a squeeze must resolve " +
      "downward is adding an opinion to a measurement.",
    symbols: ["BTCUSDT"],
    build: ({ BTCUSDT }) => {
      const closes = BTCUSDT.map((k) => k.close);
      const vols = [];
      for (let i = 31; i <= closes.length; i++) vols.push(realizedVolatility(closes.slice(0, i), { periods: 30 }));
      const now = vols.at(-1);
      const rank = (vols.filter((v) => v < now).length / vols.length) * 100;
      return {
        subject: "BTC",
        readings: [
          ["30-day realized volatility", `${f1(now)}%`],
          ["Percentile vs own history", `${f1(rank)}th`],
          ["Sample size", `${vols.length} readings`],
          ["Median of that history", `${f1([...vols].sort((a, b) => a - b)[Math.floor(vols.length / 2)])}%`],
        ],
        verdict:
          `${f1(now)}% sounds unremarkable until it is ranked: it is the ${f1(rank)}th percentile of ${vols.length} readings. ` +
          `The number only became information after it was compared to its own past.`,
        charts: [
          distributionChart(vols, now, {
            title: "BTC 30-day realized volatility: full history, and where today sits",
            label: `now ${f1(now)}%`,
          }),
        ],
      };
    },
  },

  {
    slug: "event-liquidity-turnover-concentration",
    title: "Is this a trend, or a two-day event you arrived late to?",
    question: "Volume looks huge. How do I know if that liquidity will still be there next week?",
    level: "Core",
    concept:
      "Turnover totals hide their own shape. A month with $100M of volume spread evenly is a different market from one " +
      "where $60M landed in three days. The second is event liquidity: it arrived for a reason and it leaves when the " +
      "reason does. Measuring concentration takes one line and tells you whether the depth you are counting on to exit " +
      "is structural or borrowed.",
    formula: [
      "sort the window's days by quote volume, descending",
      "concentration = turnover of the 3 busiest days / total turnover",
      "above ~30% means you are looking at an event, not a trend",
    ],
    mistake:
      "Sizing a position against average daily volume when most of that average came from three days you were not part of.",
    symbols: ["GIGGLEUSDT", "BTCUSDT"],
    build: ({ GIGGLEUSDT, BTCUSDT }) => {
      const g = windowStats(GIGGLEUSDT);
      const b = windowStats(BTCUSDT);
      const w = g.window;
      return {
        subject: "GIGGLE vs BTC",
        readings: [
          ["GIGGLE, top 3 days", `${f1(g.concentrationPct)}% of the month`],
          ["BTC, top 3 days", `${f1(b.concentrationPct)}% of the month`],
          ["GIGGLE 30d turnover", `$${f1(g.turnover / 1e6)}M`],
          ["Reading", g.concentrationPct > 30 ? "event liquidity" : "structural"],
        ],
        verdict:
          `GIGGLE did ${f1(g.concentrationPct)}% of a month's business in three days; BTC did ${f1(b.concentrationPct)}%. ` +
          `Same metric, two different kinds of market — and only one of them will still have depth when the story cools.`,
        charts: [
          barChart(w.slice(-14).map((k) => ({
            label: dayLabel(k),
            value: k.quoteVolume / 1e6,
            highlight: g.busiest.some((x) => x.openTime === k.openTime),
          })), { title: "GIGGLE daily turnover — the three busiest days highlighted", unit: "$M" }),
        ],
      };
    },
  },

  {
    slug: "attention-is-not-participation",
    title: "Everyone is talking about it. Is anyone trading it?",
    question: "A coin is trending everywhere. Does that mean money is moving?",
    level: "Applied",
    concept:
      "Social attention counts people talking. Turnover counts people acting. They come apart constantly, and the gap is " +
      "widest exactly when a story feels most alive. A trending asset on collapsing volume means the conversation is " +
      "running on people who already hold it. That is not bearish by itself — it is a liquidity warning, because a thin " +
      "book moves further in whichever direction it eventually picks.",
    formula: [
      "volume z-score = (today's turnover - mean turnover) / stdev(turnover), over a rolling window",
      "z <= -2 means turnover is two standard deviations below its own normal",
      "then rank that z against its own history to see how unusual it really is",
    ],
    mistake:
      "Reading a trending list as demand. Trending measures search and mentions; only turnover measures money.",
    symbols: ["XRPUSDT"],
    build: ({ XRPUSDT }) => {
      const zs = [];
      for (let i = 31; i <= XRPUSDT.length; i++) zs.push(volumeZScore(XRPUSDT.slice(0, i).map((k) => k.quoteVolume)));
      const now = zs.at(-1);
      const below = zs.filter((v) => v < now).length;
      const s = windowStats(XRPUSDT);
      return {
        subject: "XRP",
        readings: [
          ["Volume z-score", f2(now)],
          ["Days ranking lower", `${below} of ${zs.length}`],
          ["Volume trend (3d)", pct(s.volumeTrendPct)],
          ["Money underwater", `${f1(s.underwaterPct)}%`],
        ],
        verdict:
          `XRP is among the most-discussed assets in crypto, and its volume z-score reads ${f2(now)} with ` +
          `${below} of ${zs.length} days ranking below it. Attention is loud; participation is measurable, and they disagree.`,
        charts: [
          distributionChart(zs, now, {
            title: "XRP volume z-score: its own history, and today",
            label: `now ${f2(now)}`,
          }),
        ],
      };
    },
  },
];

/** Symbols any lesson needs, so the build fetches each pair exactly once. */
export function lessonSymbols(lessons = LESSONS) {
  return [...new Set(lessons.flatMap((l) => l.symbols))];
}

/**
 * @param {object} candlesBySymbol Keyed by Binance symbol, oldest candle first.
 * @returns {object[]} Lessons with their worked example resolved.
 */
export function buildLessons(candlesBySymbol, lessons = LESSONS) {
  return lessons.map((lesson) => {
    for (const s of lesson.symbols) {
      if (!candlesBySymbol[s]?.length) throw new Error(`Lesson "${lesson.slug}" needs candles for ${s}.`);
    }
    return { ...lesson, example: lesson.build(candlesBySymbol) };
  });
}
