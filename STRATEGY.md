# Channel strategy — BTC / ETH / SOL / BNB

The operating plan for the daily agent. Read alongside `AGENT.md`, which covers
mechanics; this covers *what to post, when, and why*.

---

## 1. What actually pays

Write-to-Earn is **not** paid per view, per like, or per follower. It pays a
share of the **trading fee** a reader generates after clicking a cashtag in your
post and executing a trade.

```
your payout = (reader's trading fee) × (your commission rate)
```

Reported rates differ between program periods and sources — one Binance
announcement describes "up to 30%", other write-ups describe a 20% base rising
to 50% for the weekly top 30. **Verify the current rate in Creator Center
before modelling income.** What is consistent across sources:

- Credit is **once per trade per reader** — not per impression.
- A **weekly leaderboard** ranks creators by *basic commission earned*, and the
  top ranks get a large multiplier. This multiplier, not raw volume, is the
  prize.
- Paid weekly (Mon–Sun cycle), minimum ~0.1 USDC or the balance resets.
- Eligibility needs only ~7 posts per 30 days. Volume is not the constraint.

### The consequence

The funnel is:

```
impression → read → cashtag click → trade executed → fee → your cut
```

Every stage after "read" is where the money is, and none of them respond to
posting more. A post earns nothing unless it puts a reader in a **decision
moment** with the cashtag as the obvious next click.

**Therefore: 100 posts/day is a rate limit, not a target.** Posting near the cap
would suppress per-post reach, exhaust followers, and risk spam classification —
while the leaderboard ranks on commission earned, which volume does not move.
Plan for **4 scheduled posts/day plus event-driven extras**, and spend the
surplus quota on quality and timing instead.

---

## 2. Cadence — anchored to when people actually trade

All times UTC (Vietnam = UTC+7). Slots are chosen around real liquidity events,
not spread evenly.

| Slot | UTC | VN | Format | Why this time |
|---|---|---|---|---|
| 1 | 00:30 | 07:30 | **Daily Close Recap + Level Map** | The 00:00 UTC daily candle just closed. New levels are valid for the whole day. |
| 2 | 07:30 | 14:30 | **Europe Open Check** | European desks coming online; first real volume of the session. |
| 3 | 13:15 | 20:15 | **Pre-US-Open Positioning** | US equities open 13:30 UTC — the highest-volatility hour in crypto. **The most valuable slot.** |
| 4 | 20:00 | 03:00 | **US Close Wrap** | Session result, overnight risk, what to watch into Asia. |
| + | ad hoc | | **Event Trigger** | Level break, funding flip, volatility spike, major headline. |

That is 4–8 posts/day. Funding settles on most venues at 00:00 / 08:00 / 16:00
UTC, so slots 1 and 2 land near settlement — useful for funding commentary.

**Consistency beats frequency.** A reader who knows the 13:15 post always
arrives will come back for it. A reader flooded with 100 posts mutes you.

---

## 3. The five recurring formats

Named, repeatable formats build the habit. People return for a *show*, not for
scattered posts.

### A. Daily Close Recap + Level Map (slot 1, every day)
The day's support/resistance for all four assets, computed from 30-day daily
swing pivots. One line each, plus one paragraph on whichever asset has the
strongest setup. This is the reference post people screenshot.

### B. Session Check (slots 2 and 4)
Short. What moved since the last post, whether the levels from slot 1 held, and
one thing to watch. 120–150 words.

### C. Pre-US-Open Positioning (slot 3, the flagship)
The deepest post of the day and the one most likely to convert, because it lands
when readers are deciding whether to take a position. Lead with the single
asset having the clearest structure. Include relative strength across the four —
which is leading, which is lagging.

### D. Weekly Deep Dive (once a week, Sunday)
Long-form article, not a short post. Multi-timeframe structure, volatility
regime, correlation between the four, what changed over the week. This is the
authority piece that earns follows; follows compound every other slot.

### E. Scoreboard (weekly, Monday)
**The differentiator.** Publicly score last week's calls: which levels held,
which broke, which bias was right, which was wrong. Almost nobody does this.

Being visibly wrong on the record buys more credibility than being vaguely right
in private — and credibility is exactly what converts a reader into someone who
clicks your cashtag instead of scrolling past.

---

## 4. What "deep analysis" can actually be sourced

Depth has to come from computed, reproducible data, or the numeric verifier in
`src/verify.mjs` will reject the post — correctly.

**Available now** (Binance spot klines via `data-api.binance.vision`, any
interval and lookback):

- Multi-timeframe structure: swing pivots on 4h / 1d / 1w
- Realized volatility and ATR; range compression vs expansion
- Position within the N-day range (where price sits between floor and ceiling)
- Volume anomalies (z-score against trailing average)
- **Relative strength across BTC / ETH / SOL / BNB** — the single most useful
  multi-asset signal available, and cheap to compute
- Rolling correlation between the four (is this a BTC-beta move or idiosyncratic?)
- Standard indicators: RSI, moving averages, VWAP, daily/weekly opens

**Available, must be labelled:** perp funding from **OKX** — not Binance.

**Not available:** Binance Futures open interest, long/short ratio, liquidation
data. `fapi.binance.com` geo-blocks the host. Never write about these.

Closing that gap is the highest-value upgrade available — OI and positioning
data is what separates surface commentary from genuine derivatives analysis. It
needs either a Coinglass/CryptoQuant API key or an unblocked egress path.

### Why computed analysis wins here

Every competitor posting "BTC looks bullish 🚀" is interchangeable. A post that
says *"SOL is the weakest of the four this week: −8.1% against BTC's −2.7%,
while its 30-day realized volatility sits in the top decile"* is checkable,
specific, and gives a reader an actual reason to open a chart — which is the
click that pays.

---

## 5. Conversion mechanics

The cashtag click is the only thing that earns. Treat it as the design goal.

- **Cashtag next to the decision, not in a tag dump at the bottom.** Write
  `$SOL` inline at the moment the reader thinks "let me look at that", not only
  in a trailing hashtag block.
- **One primary asset per post.** A post covering four assets splits attention
  and converts on none. Mention the others as context; make one the subject.
- **Give a reason to act now.** "Price is at support" is a decision moment.
  "SOL had a nice week" is not.
- **Futures readers generate far more fee than spot buyers** — leverage means
  larger notional per trade. Content that speaks to derivatives traders converts
  better per reader, which is a direct argument for closing the OI data gap.
- **Never manufacture urgency.** "Last chance", "ape now" burns the credibility
  that makes the next click happen, and invites content moderation.

---

## 6. Metrics that matter

Track weekly, in this order:

1. **Commission earned** — the only real number, and the leaderboard input.
2. **Commission per post** — the efficiency metric. If this falls while post
   count rises, cut the post count.
3. **Which slot earns most** — reallocate effort toward it.
4. **Follower growth** — a leading indicator for every later week.
5. Views and likes — diagnostic only. They tell you if distribution is working;
   they do not pay.

If commission per post drops for two consecutive weeks, **post less, not more.**

---

## 7. Build roadmap

Current state: data collection, key levels, composition, verification, queue and
scheduler all exist. To execute this plan:

| Priority | Work | Why |
|---|---|---|
| 1 | `src/analysis.mjs` — relative strength, realized vol, range position, volume z-score, correlation, RSI/ATR from klines | Turns the posts from price reporting into actual analysis. Everything is computed, so it survives the verifier. |
| 2 | Slot-aware scheduling — bind formats A–C to the four daily slots via the existing queue | Turns the plan into something that runs unattended. |
| 3 | Per-slot prompt variants | A recap and a positioning post should not read the same. |
| 4 | `src/scoreboard.mjs` — persist each post's levels and bias, score them against later candles | Powers format E, the credibility engine. Needs history, so start collecting now. |
| 5 | Weekly long-form generator (`contentType: 2`) | Format D; the publisher already supports articles with covers. |
| 6 | Binance Futures OI + long/short via a paid data source | Closes the one real analytical gap. Requires a key from you. |

Items 1–3 make the daily plan operational. Item 4 only becomes possible after
several days of stored history — which is the argument for starting it early.

---

## 8. Honest expectations

- **Week 1–2:** almost no commission. No audience, no clicks. The goal is
  consistency and history for the scoreboard, not income.
- **Week 3–6:** first commissions. The scoreboard starts having something to
  show, which is when follows accelerate.
- **Top-30 leaderboard:** realistic only after a sustained audience. Since the
  multiplier is large, everything before that is an investment in reaching it.

The failure mode is not posting too little. It is posting a high volume of
generic content, converting nothing, and concluding the program does not work.

Sources: [Write to Earn commission announcement](https://www.binance.com/en/support/announcement/binance-square-will-extend-write-to-earn-post-content-on-binance-square-to-earn-up-to-30-trading-fee-commissions-9baa3ddb869e44b3baa1dee2e37751de) ·
[Write to Earn FAQ](https://www.binance.com/en/support/faq/frequently-asked-questions-on-binance-square-write-to-earn-promotion-3f4940d27ff04748a13e0fc1d3f1598d)
