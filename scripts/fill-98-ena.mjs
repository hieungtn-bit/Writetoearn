/**
 * Post 98 — ENA, and a p-value of 0.01 that does not survive its control.
 *
 * Ethena is the one token on this desk whose fundamentals are fetchable.
 * USDe's yield is the funding paid to a delta-neutral short, and funding is a
 * number the exchange publishes and this desk already caches. So the question
 * that is normally unanswerable becomes answerable: does the price track the
 * thing that pays it?
 *
 * The first answer is yes, and it is seductive. Twenty-eight non-overlapping
 * thirty-day windows, funding against ENA's return relative to BTC: r +0.479,
 * t +2.78, p 0.0100. Published on its own, that is a fundamentals story with a
 * significance test attached, and it would be the most respectable-looking
 * thing this desk has run in weeks.
 *
 * The control is the post.
 *
 *   The same correlation, measured for 48 liquid tokens with no mechanical
 *   link to funding at all, averages +0.257. XRP is +0.66. ADA +0.64. DOGE
 *   +0.61. ENA sits at the 77th percentile of a distribution it should
 *   dominate, and it is beaten by five names whose revenue has nothing to do
 *   with perpetual funding.
 *
 *   So funding is not measuring Ethena. It is measuring risk appetite, which
 *   moves every alt. The one token with a mechanical claim on that number
 *   tracks it less well than XRP does.
 *
 * That is the finding, and the shape of it is the lesson the desk keeps
 * relearning: a significant result and a correct control are different things,
 * and the control is the one that decides.
 *
 * The rest is stated because a reader holding the token deserves it: funding
 * sits at the 33rd percentile of its own history rather than the high everyone
 * assumes, five of twenty-eight windows paid negative, the token is 89.8% below
 * its high, there is no base by any measurable definition at 13.8 daily ranges
 * of width, and its alpha to BTC over 180 days is genuinely positive — which
 * yesterday's name, RENDER, was not.
 *
 * Figures: research/ena.json, research/daily-brief.json.
 */

import { readFileSync, writeFileSync } from "node:fs";

const E = JSON.parse(readFileSync("research/ena.json", "utf8"));
const D = JSON.parse(readFileSync("research/daily-brief.json", "utf8"));

const T = E.tape, V = E.fundingVsPrice, C = E.control, M = E.marketModel, B = E.board;
const base20 = E.bases.find((b) => b.days === 20);
const beatenBy = C.highest.filter((h) => h.corr > V.corrWithVsBtcReturn);

const claims = {
  "the correlation between funding and ENA is real on its own terms":
    V.corrWithVsBtcReturn > 0.3 && V.vsBtcTest.p < 0.05,
  "measured over non-overlapping windows":
    V.windows >= 20 && V.windowDays === 30,

  "but tokens with no link to funding show the same thing":
    C.meanCorr > 0.15,
  "and several of them beat ENA outright":
    beatenBy.length >= 3,
  "leaving ENA unremarkable in that distribution":
    C.enaPercentile < 90,
  "the control was not a handful of names":
    C.tokens >= 30,

  "funding is not in a high regime":
    E.fundingPercentileNow < 50,
  "and it has been negative in some windows":
    V.windowsWithNegativeFunding > 0,
  "live funding is fetched separately from the stale archive":
    E.liveEngineMeanAnnualisedPct != null && E.archiveEndsAt < E.measuredAt,

  "the token is far below its high":
    T.drawdownFromHighPct < -50,
  "and has no base by a measurable definition":
    base20.dailyRangesWide > 6,
  "its daily volatility is extreme":
    T.atrPct > 6,

  "its alpha to BTC over the window is positive":
    M.alphaWindowPct > 0,
  "my board still refuses it":
    B != null && (B.absent === true || (B.effectiveN ?? 0) < 12),
};
const bad = Object.entries(claims).filter(([, ok]) => !ok);
if (bad.length) { console.error("ABORT:"); for (const [c] of bad) console.error("  x " + c); process.exit(1); }

const sign = (v, dp = 2) => `${v >= 0 ? "+" : ""}${v.toFixed(dp)}`;
/** 33rd, not 33th. Teens are the exception that makes the naive rule wrong. */
const ordinal = (n) => {
  const v = Math.round(n), rem100 = v % 100, rem10 = v % 10;
  const suffix = rem100 >= 11 && rem100 <= 13 ? "th"
    : rem10 === 1 ? "st" : rem10 === 2 ? "nd" : rem10 === 3 ? "rd" : "th";
  return `${v}${suffix}`;
};

const bare = (s) => s.replace("USDT", "");

const controlTable = [
  ("token".padEnd(10) + "corr with funding".padStart(19)),
  ...C.highest.map((h) => (bare(h.symbol).padEnd(10) + sign(h.corr, 2).padStart(19)).trimEnd()),
  ("ENA".padEnd(10) + sign(V.corrWithVsBtcReturn, 2).padStart(19)),
].join("\n");

const baseTable = E.bases.map((b) => (`${b.days}d`.padEnd(6)
  + `$${b.lowUsd.toFixed(4)}-${b.highUsd.toFixed(4)}`.padStart(20)
  + `${b.widthPct.toFixed(0)}% wide`.padStart(11)
  + `${b.dailyRangesWide.toFixed(1)} daily ranges`.padStart(20)).trimEnd()).join("\n");

const text = `$ENA is the only token I follow whose fundamentals I can actually fetch.

USDe's yield comes from holding spot and shorting the perpetual against it. The revenue of that trade is the funding rate — paid three times a day by the longs — and funding is a number the exchange publishes and I already cache, month by month, going back years.

So the question that is normally unanswerable is answerable here: **does the price track the thing that pays it?**

THE ANSWER THAT LOOKS GREAT

${V.windows} non-overlapping ${V.windowDays}-day windows. Average funding across the majors the strategy shorts, against ENA's return over the same window, measured relative to BTC so a general rally is not counted as protocol performance.

**r ${sign(V.corrWithVsBtcReturn, 3)}, t ${sign(V.vsBtcTest.t)}, p ${V.vsBtcTest.p.toFixed(4)}.**

If I stopped there, this is a fundamentals story with a significance test on it, and it would be the most respectable-looking thing I have published in weeks.

THE CONTROL

Funding rises when leverage is long and risk appetite is high. So does every alt. Before crediting the mechanism, the same correlation has to be measured for tokens that have **no mechanical link to funding at all**.

${C.tokens} of them, above $${(C.minTurnoverUsd / 1e6).toFixed(0)}M turnover, same windows:

\`\`\`
${controlTable}
\`\`\`

**Average across all ${C.tokens}: ${sign(C.meanCorr, 3)}.** ENA sits at the **${ordinal(C.enaPercentile)} percentile** of them.

$XRP tracks perpetual funding *better than Ethena does*. So do ADA, XLM, HBAR and DOGE. None of them earn a cent from it.

So the number is not measuring Ethena. It is measuring risk appetite, and the one token with a mechanical claim on that number is unremarkable inside a crowd that has no claim at all.

A p of 0.01 and a correct control are different things. The control is the one that decides, and I would have shipped the first number if I had not run the second.

WHAT IS ACTUALLY TRUE ABOUT THE ENGINE

**Funding is not high.** The last archived window averaged ${sign(E.recentWindowFundingPct, 1)}% annualised — the **${ordinal(E.fundingPercentileNow)} percentile** of every interval in the archive. Live right now it is ${sign(E.liveEngineMeanAnnualisedPct, 1)}% across the three legs.

That is a working engine, not a lucrative one.

**And it runs backwards sometimes.** ${V.windowsWithNegativeFunding} of the ${V.windows} windows had negative average funding — months where the delta-neutral position *paid* to stay open instead of earning. That is the actual risk in the model, and it is not hypothetical.

One thing I will not do: quote the archive as current. The monthly dumps stop at ${E.archiveEndsAt.slice(0, 10)}, and this desk once reported late-July funding as "the last seven days". Live is fetched separately, from a different venue, and labelled as such.

THE TAPE

$${T.priceUsd.toFixed(4)}, ${sign(T.changePct24h, 1)}% today, $${(T.turnoverUsd / 1e6).toFixed(1)}M turnover, ATR **${T.atrPct.toFixed(2)}%** a day.

All-time high $${T.allTimeHighUsd.toFixed(4)}. It is **${sign(T.drawdownFromHighPct, 1)}%** from there.

Is there a base?

\`\`\`
${baseTable}
\`\`\`

**${base20.dailyRangesWide.toFixed(1)} daily ranges wide** over twenty days. A consolidation is two or three. This is not a base, it is a wide chop, and any stop tight enough to feel comfortable in it is inside a single ordinary day.

THE ONE NUMBER IN ITS FAVOUR

Beta to BTC **${M.beta.toFixed(2)}**, alpha **${sign(M.alphaDailyPct, 3)}% a day — ${sign(M.alphaWindowPct, 1)}% over ${M.days} days.**

That is genuinely positive, and worth saying because yesterday I published the same measurement for RENDER and it came out negative. On this one number ENA has paid for its risk over the window. One window, and I would not size off it, but it is the number and it is not flattering to leave out.

WHAT I WOULD WATCH

Not the price. **Funding turning negative and staying there.**

That is the one event with a mechanism behind it rather than a narrative: it is the month the engine stops earning and starts paying. It has happened in ${V.windowsWithNegativeFunding} of ${V.windows} windows already, so it is not a tail scenario, and it is three API calls to check.

My board reads ENA **${B.absent ? "not on the board" : B.bias}**${B.absent ? "" : `, ${B.agreeing} of ${B.windows} windows agreeing, ${B.effectiveN} independent episodes against a floor of 12`}. Refused, as usual, and not in today's book — which took ${D.taken.length} shorts, none of them this.

Bias: WAIT

Every figure: research/ena.json at maix8.study/data/ — all ${V.windows} windows and all ${C.tokens} control tokens, so you can check whether the control is fair rather than take my word for it.

The book, all of it stopped: maix8.study/record

If the token built on funding tracks funding worse than XRP does, what was the correlation ever telling you?

Educational research, not financial advice. You are responsible for your own risk.

#ENA #Bitcoin #Trading #Quant`;

writeFileSync("drafts/98-ena.txt", text);
console.log("claims:", Object.keys(claims).length, "| words:", text.trim().split(/\s+/).length);
