# MAIX8 — the whole method, as a prompt

Paste this file into a fresh session to hand the system over. It describes what
MAIX8 does, the exact arithmetic behind each step, the results already
established, and the mistakes that produced each rule.

Written in English to match the rest of `docs/`; **published posts are
Vietnamese**. See §9.

---

## 0. The one sentence

MAIX8 measures claims about crypto markets against exchange data, publishes what
survives, and says plainly what did not — including its own failures.

Everything below is downstream of that. If a rule here conflicts with getting a
post out, the post loses.

---

## 1. Epistemics — the actual algorithm

These are not style preferences. Each one exists because a specific published
claim was wrong, and each one would have caught it. They apply before any
market logic.

### 1.1 A rate without a baseline is not a finding

"This setup hits 28% of the time" says nothing until you know the unconditional
rate over the same bars. If the market does that anyway, the setup is
decoration.

Always report: **conditional rate, baseline rate, difference, and sample size.**

### 1.2 Path-aware, never naive

Reading a horizon's high and low separately lets one episode count as reaching
both target and stop. The two rates then sum past 100 and describe a trade
nobody could have taken.

Walk forward bar by bar. Whichever level is touched first is the one that counts.
A bar touching both is **charged to the stop** — intraday order is unknowable
from a daily or 4-hour candle, and the ambiguous case must not be credited to
the forecast.

This correction alone moved a published headline from 4.36x to 3.96x.

### 1.3 De-overlap before claiming significance

Overlapping windows share bars. Treating them as independent inflates n and
every sigma computed from it.

```
effectiveN = n / horizon
sigma      = (p_conditional − p_baseline) / sqrt(p_baseline(1 − p_baseline) / effectiveN)
```

Report **both** the naive and de-overlapped figures. The conclusion is written
against the de-overlapped one. Printing only the naive number is exactly how a
coin flip gets published as an edge — the 4-hour support test measured 3.17σ
naive and 0.92σ de-overlapped, and 0.92σ is the answer.

### 1.4 Name the bucket before the run

Multiple comparisons manufacture significance. Decide which cell you are testing
in advance, and when you slice afterwards, report **the best sigma produced
across every cell you tried**, not just the winning one.

Twenty-four hour-of-day buckets produced a best cell at 2.79σ. That is exactly
what noise produces across 24 tries. It was published as noise.

### 1.5 Ceiling on a z-score

When an observation sits inside its own baseline window, the maximum achievable
z is bounded:

```
z_max = (n − 1) / sqrt(n)          n = 7  →  2.268
```

A reported z above that ceiling is an artifact, not a signal. Usually it means a
delisting or a data error — a 172-sigma volume reading turned out to be a
delisting artifact in a scanner that never filtered removals.

### 1.6 Live beats backtest, always

A detector that *would have* fired is not a track record. Log alerts to an
append-only file **before any outcome exists**, then settle them later. Only live
fires count.

Backtest said 28.72%. Live says 23.46% on 162 clean alerts. The 5.26-point
shortfall is the honest number and it gets published.

### 1.7 Correlation is not beta, and r is not a share of movement

- **r** = how tightly two series move together.
- **r²** = the share of variance explained. `r = 0.56` means BTC explains **32%**
  of the move, not 56%.
- **beta** = regression slope, how far this asset moves per 1% of BTC. An asset
  can be loosely correlated and high-beta at once.

Risk to a position is beta. A note claiming "high BTC beta" for ICP was wrong —
measured 0.80, the lowest of its group.

### 1.8 Reward-to-risk is not expectancy

```
expectancy_R = p_hit × RR − p_stop
```

A 20:1 payoff at a 3% hit rate is **−0.35R**. Any table quoting RR without the
hit rate is quoting the half that flatters.

### 1.9 A stop is measured in units of the asset's own day

```
stopInAtr = stopDistancePct / dailyAtrPct
```

Below 1.0 the stop is inside ordinary daily noise and gets hit almost regardless
of where the target sits. Observed twice (XLM 0.75, a proposed ICP 4H trade
0.78), both negative in every cell. **Two instances is a mechanism, not a rule** —
state it as such.

Same logic on a longer horizon: a stop sized off a daily ATR and held for a week
is swept by an ordinary week. BNB's median week travels 3.16× the day-trade stop.

### 1.10 Waiting for confirmation without moving the stop inverts the geometry

Entering higher while the stop stays put lengthens the risk leg and shortens the
reward leg. On ICP: R:R 2.74 → 0.83, break-even win rate 26.8% → 54.5%.

Confirmation is not wrong. Confirmation with a fixed stop is.

### 1.11 Four points do not support a rule

When a pattern lines up across three or four names, report the figure and refuse
the rule. Spearman ρ on four items is descriptive, never a significance test.

### 1.12 Report results that cut against you

The 4-hour support test came back **positive** — the first positive result in the
whole series. It was published in full, with the caveat that kills it. A method
that only finds what it expects is not a method.

---

## 2. Data — what works and what is blocked

Verified by testing, not by documentation.

### Working, free

| Source | What |
|---|---|
| `data-api.binance.vision/api/v3` | spot klines, bookTicker, ticker/24hr, exchangeInfo. Any interval, up to 1000 bars |
| `www.okx.com/api/v5` | funding rate + history, open interest, position tiers, spot tickers |
| `api.coingecko.com/api/v3` | market cap, rank, ATH, circulating/max supply, 1y change |
| `bitcoin-data.com` | mvrv, mvrv-zscore, sopr, nupl, puell-multiple, realized-price, **sth-sopr, lth-sopr, sth-realized-price, lth-realized-price**, reserve-risk, cvdd, balanced-price, thermocap-multiple |
| `mempool.space`, `api.blockchain.info/charts` | on-chain BTC |
| DefiLlama, `alternative.me` | TVL, fear & greed |

### Blocked from this host — never write about these as fact

- `fapi.binance.com` → **451**. No Binance futures OI, no long/short ratio, no
  Binance funding.
- CryptoQuant 403 · Glassnode 401 · CoinGlass "API key missing" · Coinalyze 401
- SoSoValue / Farside / TheBlock → 403
- bitcoinisdata, bgeometrics, lookintobitcoin, chainspect → JS-only pages, and
  headless Chromium is proxy-blocked
- `bitcoin-data.com` 404s: exchange-netflow, supply-in-profit, hodl-waves,
  stock-to-flow

**Saying you cannot see a field is encouraged. Asserting it is forbidden.** The
verifier enforces this per sentence, in English and Vietnamese.

Funding is **OKX**, always labelled as such.

---

## 3. Metric definitions — one implementation each

A metric computed twice drifts. The same volatility percentile was once reported
as 22.4 and 10.9 because two call sites used 400 and 1000 candles.

- **ATR(14)**, reported as `% of price`.
- **RSI(14)** on closes.
- **SMA** 10 / 20 / 50 / 200, per interval.
- **Volume z-score**: last *completed* bar against the trailing 30, sample stdev.
- **Range position**: `(price − low_N) / (high_N − low_N) × 100`.
- **Realized volatility**: stdev of log returns over 30, annualised ×√365.
- **Up/down volume ratio**: turnover on up-closes ÷ turnover on down-closes,
  over 30 and 90 days. 30d > 1 with 90d < 1 means a one-month-old reversal.
- **Underwater share** (`stage.mjs`): share of the last 30 days' volume that
  traded **above** current price — trapped supply waiting to break even. The
  single most under-quoted number in retail analysis. ICP 3.6%, ENA 21.9%,
  SUI 60.7%, XLM 92.5%.
- **Volume trend**: last 3 days' mean turnover vs the prior 10.
- **vs VWAP**: price against the 30-day volume-weighted average.
- **Concentration**: share of window turnover in its top 3 days.
- **Beta / correlation**: regression slope and r of daily log returns on BTC's,
  reported together with r².

### Stage classification (`stage.mjs`)

Five stages from five numbers. Thresholds are **calibration starting points, not
laws**, and should be refit per asset class.

```
hangoverDrawdownPct     −60      breakdownVsVwapPct     −15
breakdownUnderwaterPct   70      liveUnderwaterPct       25
movePricePct              5      drainingVolumePct      −20
expandingVolumePct       20      quietConcentrationPct   20
quietVolumeSwingPct      40
```

```
1 quiet       turnover is structural, no event in progress
2 expansion   price and participation rising together
3 exhaustion  price still rising while participation drains
4 breakdown   price below window VWAP, most money underwater
5 hangover    deep drawdown, liquidity has left
mixed         no clean stage — read the metrics directly
```

`vol_trend` is the reading that matters: underwater share is near zero both for a
move still recruiting buyers and one that has run out, so it cannot separate
them. Participation can.

---

## 4. Scanners

### 4.1 P-BBE — base breakout (`pbbe.mjs`)

Hard gates, all must pass:

```
quoteVolume24h ≥ $5,000,000
volumeZ        ≥ 2.0
%fromBase      ≤ 0.55           (ceiling 0.60 used in scoring)
```

Base detection: the **longest** window of 10–25 days whose width ≤ 35%. Longest,
not shortest — a 10-day window is always at least as tight as the 25-day window
containing it, so taking the shortest trivially always wins.

```
Score = 0.30 × volumeZ_norm        (z / 4, clamped)
      + 0.25 × (1 − fromBase/0.60)
      + 0.20 × baseQuality         (tight ≤ 15% scores full)
      + 0.15 × structureConfirm
      + 0.10 × liquidityScore      (turnover / $500M, clamped)

≥78 High Priority · 65–77 Watchlist · 50–64 Observe
```

Output prints "weight allotted, spread realised" per term so a score can be read
back to its parts.

### 4.2 Two-sided (`sides.mjs`)

Mirrored long/short conditions. `notOverextended` uses `Math.abs(change24hPct)` —
a −55% day is as extended as +55%.

```
LONG_MAX_RANGE_POSITION   92
SHORT_MIN_RANGE_POSITION   8
MAX_RUN_PCT               40
SPIKE_Z                    2
```

### 4.3 Intraday alerts (`intraday.mjs`)

`alertsFrom(rows, { minZ, delistings })` **must** filter delistings.
`suppressedByDelisting()` reports what was removed rather than silently dropping
it. An unfiltered scanner published a 172-sigma volume reading that was a
delisting artifact.

Scored at `HORIZON_HOURS = 12`, `TARGET_PCT = 10`, `BASELINE_PCT = 6.22`.

---

## 5. Trade geometry

Given entry, stop, targets:

```
riskPct            = (1 − stop/entry) × 100
rewardPct          = (target/entry − 1) × 100
RR                 = rewardPct / riskPct
breakevenWinRate   = 100 / (1 + RR)
stopInAtr          = riskPct / dailyAtrPct
expectancyR        = p_hit × RR − p_stop      (unresolved counted flat)
```

Then measure `p_hit` and `p_stop` path-aware over the intended holding horizon
(§1.2), de-overlap (§1.3), and compare `p_hit` to `breakevenWinRate`.

Default day-trade stop is `1.5 × ATR`. For a weekly hold, size the stop off the
**weekly range distribution** (completed calendar weeks, high-to-low, as
percentiles), not the daily ATR.

Position sizing: `positionUsd` per $1,000 such that risk is exactly 1%. Cap
leverage below the venue's liquidation threshold — `fetchPositionTiers` takes an
**instrument family** (`"BNB-USDT"`, not `"BNB"`); the wrong argument returns
nothing and every leverage figure silently loses its venue anchor.

---

## 6. The verification gate — cannot be skipped

`node bin/wte.mjs check <draft> [flags]`

Refetches the market and traces **every figure** in the draft back to live data,
a study snapshot, a candle series or stage metrics.

```
TOLERANCE        0.005 relative
STRUCTURAL_MAX   100        (bare integers ≤100 treated as structural, unchecked)
ARTICLE_MAX_WORDS 2500      (--article; otherwise slotMax + 20)
minWords         40
MAX_CASHTAGS     3          (a 4th is rejected by the API with [220095])
```

Flags: `--article` · `--screen=SYM,...` · `--study file.json,...` ·
`--stage SYM,...` · `--hourly SYM --interval 4h --limit 1000` · `--no-call`
(only for a post that states no market view) · `--max-words N`.

### Structural rules

- **≥1 non-meta hashtag.** `#WriteToEarn #BinanceSquare #Binance #Crypto` are
  meta surfaces; a post using only those is rejected. 51 consecutive posts used
  the two most crowded tags (#BinanceSquare: 732,603 discussing) instead of
  topic pages (#FundingRate: 948).
- **A stated bias** — `WAIT` / `Selective Long` / `Selective Short`, or the
  Vietnamese `CHỜ` / `long chọn lọc` / `short chọn lọc`. Without one the post is
  unscoreable and vanishes from the track record.
- **A disclaimer and a closing question.**
- **Forbidden fields**: open interest and long/short ratio may not be asserted.
  A per-sentence disclosure test allows honest admissions in either language
  (`không có`, `chưa có`, `chặn địa lý`, `bị chặn`, `thiếu dữ liệu`, and the
  English equivalents). Unicode lookarounds, never `\b` — JS `\b` is ASCII-only
  and will not delimit `ế` or `ộ`.

### Known gaps, documented rather than hidden

- Bare integers ≤ 100 go unchecked.
- Values under 1 are compared by absolute difference.
- Small values printed to one decimal used to breach the tolerance and produce
  **false** rejections. Fixed: a figure now also matches when it is within half a
  unit of its own printed precision, which is exactly the band of true values
  that round to what was written. Use `pct()` from `src/format.mjs` and the
  rounding is right by construction.

### The claims block — a second, independent gate

Every `scripts/fill-NN-*.mjs` opens with an assertion block: every prose claim in
the post, as a boolean over the research JSON. If the tape stops supporting a
sentence, the script **refuses to write the file**.

```js
const claims = {
  "price is high in its own month, not near the bottom": r30.positionPct > 70,
  "and the sample behind it is large": tp1.n > 900,
};
const bad = Object.entries(claims).filter(([, ok]) => !ok);
if (bad.length) { console.error("ABORT:"); ...; process.exit(1); }
```

This has caught real drift repeatedly: a threshold set too tight after prices
moved, a ratio written out in words that changed from twelve to four between
runs, a comparison that stopped being true. **Fix the sentence to match the data,
never the data to match the sentence.**

---

## 6b. `wte doctor` — the wiring check

Every serious fault in this codebase has been **silent**. `ship` published and
recorded no claim, so the track record stayed empty. The scoreboard scored every
levelless WAIT correct, so it reported 100% and looked like success. The
settlement window reached back eight days, so older calls vanished from the
tally. None was caught by a unit test, because each is a property of how the
pieces are wired rather than of any one function.

```bash
npm run check      # tests, then the wiring self-check
wte doctor         # the self-check alone; exits non-zero on a failure
```

It asks: can the scoreboard mark a call **wrong** (a check that can only pass is
worth nothing)? Does every bias the gate admits also parse in the scoreboard?
Does every published article that stated a call carry a claim? Is anything past
its deadline unjudged? Does the palette still separate under three CVD
simulations? Does the formatter round inside the gate's tolerance?

Run it before a publishing session, not after a mystery.

## 7. Publishing

```
node scripts/fill-NN-name.mjs                  # draft, gated by its claims block
node bin/wte.mjs check drafts/NN-name.txt ...  # gate
node scripts/cover-name.mjs > media/name.html
node scripts/render-card.mjs media/name.html media/name.png 1200 630
node bin/wte.mjs ship drafts/NN-name.txt --title "..." --cover media/name.png
```

`ship` publishes to Square, adds the article to the site manifest, commits and
pushes. Vercel builds on the push. `--dry-run` shows what it would do.

**Write from the same snapshot you verify against, minutes apart.** A 30-day
range position moved 4.46% → 4.29% in the time it took to draft. Never write now
and publish an hour later — re-check or rewrite.

Order matters: if the research JSON is regenerated after the draft, **regenerate
the draft too**. The gate refetches the market but reads whatever JSON is on disk.

---

## 8. What has already been measured

Do not re-derive these. Do challenge them with better data.

| Claim | Result |
|---|---|
| Range compression predicts breakouts | **1.01x, 0.09σ** — 10,024 compressed days against a 43,088-day baseline. Nothing. |
| Dormancy predicts breakouts | **0.77x, −3.22σ**, n=16,880. Actively worse than random. |
| Quiet accumulation | 0.80x, −1.76σ |
| Oversold | 1.22x, 1.57σ — the least dead of the seven, still not significant |
| Volume-spike alerts, long side | longFirst **24.18%** vs 6.11% random-hour baseline, +18.07pp, **2.42σ**, n=397 |
| Best sub-bucket inside those alerts | **1.36σ** — no slice beats the whole set |
| Same alerts, live | **23.46%** on 162 clean fires vs 28.72% backtest — a 5.26pp shortfall, 3.56x over a 6.59% base rate |
| Direction is predictable intraday | corr 0.06. No. |
| Hour of day predicts direction | −0.63σ over 17,518 hours. No. |
| Hour of day predicts **size** | **23.57σ**. Yes, strongly. |
| Best single hour for direction | 2.79σ across 24 tries = exactly noise |
| Shorting a crash | downHard resolves long 31.76% / short 11.76%. Do not. |
| Funding "healthy band" | spans percentile 4.3–93.6. `+0.015%` and `+0.04%` **never occur** — the venue caps at 0.0100 |
| Retail CEX–CEX arbitrage | 320 same-tick observations, Binance vs OKX, 8 pairs. Gaps open on ~29% of ticks; **0 clear the 0.20% round-trip fee.** Best round trip observed still loses 0.18%. Latency from an ordinary host: 160 / 193 ms |
| Support levels on 4H | +13.6pp over baseline — **3.17σ naive, 0.92σ de-overlapped.** Suggestive, unproven. The only positive result so far |

### The live track record

32 published calls, settled 24 hours after publication, priced from the hourly
candle open at the moment each went out. **15 of 26 judged calls correct, 58%.**
Almost all are WAIT; the one directional call (GIGGLE Selective Short) resolved
−20.60% and scored correct.

The first run of this board reported **100%**, because WAIT was unfalsifiable.
Treat any track record that has never printed a miss as broken until proven
otherwise — including your own.

---

## 9. Writing

Voice: **MAIX8 Research (@mAix8) — "Evidence Over Emotion."**

- Evidence leads. Every claim arrives attached to a figure that traces to data.
- Plain, confident sentences. Short paragraphs, mobile-readable.
- Confident about what the data shows, honest about what it does not.
- **No hype vocabulary**, no rocket emojis, no manufactured urgency.
- Say the uncomfortable thing when the data says it. Naming a level that broke,
  or a call you got wrong, is the whole brand.
- Disclose conflicts at the top, not in a footnote — a BNB post opens by stating
  BNB is the token of the exchange being published on.

**Language: Vietnamese.** Natural, plain register — not textbook, not hype.
Vietnamese uses ~26% more space-separated tokens than English; budget for it.
Note `.` is a thousands separator in Vietnamese and collides with English
decimals, so all figures come from `toFixed` and use English grouping.

Structure that works:
1. Where the piece came from, in one line.
2. The claim being tested, quoted.
3. Measurement, with the method stated before the number.
4. The number that contradicts the writer's own preferred story.
5. What could not be checked, and why.
6. Bias, then one closing question.

**Exactly three cashtags** where the content honestly supports three — each one
renders a price widget, and widgets are the highest-intent click surface. Analyse
one asset, cite three. Never a fourth. Never a cashtag the post does not discuss.

---

## 10. Cards

Every post carries a 1200×630 cover generated from the same research JSON as the
post, so the card cannot drift from the text.

**Pick the form from the job, not from habit.**

- magnitude across named things → ranked horizontal bars
- a change in *order* → bump chart (never bars — bars invite size comparison)
- a distribution against a constant → histogram + threshold line
- two distances from a shared origin → diverging bars around a neutral midpoint
- a single headline → a stat tile, not a chart

Never a price chart for an argument that is not about price. A candlestick
invites the reader to find a pattern; if the post refuses to predict direction,
drawing one makes a claim the post does not.

**Colour comes last, and is computed.** Validated pair on `#0b0e11`:
`#c98500` + `#3987e5` — 27.4 ΔE protan, 30.7 normal, all checks pass. Muted ink
`#5a636d` for series that are not carrying the story. Run the palette validator;
never eyeball ΔE. `#f0b90b` fails the dark lightness band — use it for the kicker
and wordmark only, never as a data colour.

Every mark also carries a direct label, so nothing rests on hue.

**Render it and look at it.** The validator checks colour, not layout. Three
separate label collisions in this series were invisible in code and obvious in
the PNG. Headless Chromium at `--window-size=1200,630` paints only ~540px —
`scripts/render-card.mjs` renders tall with 120px headroom and crops back.

---

## 11. Failure modes seen in this repo

- A gate skipped because two commands were joined with a newline instead of `&&`.
  The guard exited non-zero and the post went out anyway, carrying a stale
  figure. **Publishing must take a verification token, not a boolean.**
- The site build fetched candles at deploy time; the fetch failed from the build
  region and a prose-only deploy failed. **The build performs no network I/O.**
- Three false prose claims in one draft — "for three weeks I have been
  publishing" in a five-day-old repo; a figure attributed to a post that never
  contained it; a study described as finding nothing when it read −2.02σ. Prose
  claims now go in the assertion block alongside the numbers.
- Fixtures rewritten to match a broken rule. **When 15 tests fail on a new rule,
  check whether the fixtures encoded the old standard** — then fix the root
  cause, which was in the prompts telling the model to use exactly two meta tags.
- A test asserting two distances differ at a price where they provably do not
  (low 80, high 120, price 96: 80×1.2 = 120×0.8). Fix the fixture, not the code.
- Two unpushed commits hidden because `tail -1` cut the real ref line.

---

## 12. Standing constraints

- Push only to the designated feature branch.
- Never put a model identifier in a commit message, PR, code comment, or any
  pushed artifact.
- Scheduled automation **must never auto-publish** to Square. Report only.
- Any credential that appears in a transcript is burned and must be rotated.
- Do not create a pull request unless explicitly asked.

---

## 13. How to use this prompt

1. Read the pasted claim. Extract every checkable statement into numbers.
2. Write `research/<topic>.mjs` that measures them. Header comment states what is
   measured and **why that framing rather than the obvious one**.
3. Run it to `research/<topic>.json`. Read the output before writing a word.
4. Write `scripts/fill-NN-<name>.mjs` with the claims block first, prose second.
5. Gate it. Fix what it names. Re-gate until it passes.
6. Build the card, render it, **look at it**, fix collisions.
7. Regenerate the draft if the JSON changed. Ship.
8. Commit research, fill script and card together, with a message explaining what
   was found and what was refused.

The measurement is the product. The post is how it travels.
