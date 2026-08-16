# Content plan

Built from `research/content-audit.json`. Every number below is measured, not
estimated. Regenerate with `node research/content-audit.mjs`.

## What we do not know

**There is no audience research and none is available.** The Binance Square API
exposes `/content/add` and nothing else — no views, likes, shares or retention.
Any statement here about "what readers want" would be invented, so there are
none.

The only demand signal that exists is **reader-initiated requests**: the moments
someone pushed material at this desk instead of the other way round. Sixteen of
them, from one inbox, over six days. That is a real signal and a tiny one, and
it is used below with that weight and no more.

## What we know about supply

```
56 posts over 16 days          3.50 per day
median length                  832 words
published on                   14 distinct days
busiest day                    9 posts
```

```
method study      22   ██████████████████████
market call       21   █████████████████████
self-audit         7   ███████
other              4   ████
reader audit       2   ██
```

Assets: BTC 30 · ICP 13 · ENA 10 · ETH 10 · BNB 10 · GIGGLE 7.

Three quality counts, and one of them is the problem:

```
states a bias                  43 / 56
contains a table               25 / 56
names the snapshot behind it   18 / 56   ← the gap
```

## What we know about demand

```
audit my analysis        5   ███████████
deep dive                5   ███████████
algorithm complaint      3   ███████
scan request             1   ██
position question        1   ██
entertainment            1   ██
```

**Sixty-two percent of what readers actually asked for was "check this" or
"go deeper on these names".** Nobody once asked for a new signal.

## What the algorithm can actually supply

```
board                    77 rows
qualify after filters     4
positions                 3        (5.2% of the board)
longs surviving           0
shorts surviving          4
research snapshots       52
walk-forward result  -0.0428R      does not beat shorting everything
```

That last line governs everything else. **The calls are not the product.** They
are unproven — 22 of 39 scored right, and the pipeline behind them has no
demonstrated edge. A plan that leads with signals is selling something the
measurements do not support.

The method is the product. It is also the thing readers asked for.

---

## The plan

### 1. Cut the cadence to a third

3.5 posts a day is a volume strategy on a channel whose entire claim is rigour.
It is also why 38 of 56 posts never named their source file — at that rate there
is no time to.

**Target: 1.2 per day.** One daily column, one weekly measurement, audits as
they arrive, and a method study only when a real question has been answered.

### 2. Fixed slots

| Slot | Cadence | Source | Cost |
|---|---|---|---|
| **Daily column** — *How is the market? What do we do?* | every day | `research/daily-brief.mjs` | 3 commands |
| **The weekly number** — walk the pipeline forward, publish whatever it says | Sunday | `research/self-backtest.mjs` | 1 run |
| **Reader audit** — check a forwarded analysis line by line | on arrival, cap 2/week | reader supplies material | half a day |
| **Method study** — one question, measured across the universe | when one is ready, never forced | new research file | 1–2 days |

Nothing publishes without a snapshot named in the text. That rule is what turns
`traces to a snapshot: 18/56` into the number it should be.

### 3. What each slot is for

**The daily column** is the habit. It settles yesterday's positions before
proposing today's, carries the walk-forward result beside the picks, and gives
BTC/BNB/ICP a line whether or not they qualify. Its value is not the trades —
it is that a reader can watch a rule being followed on a day it produces
nothing.

**The weekly number** is the differentiator. No other channel publishes what its
own strategy is worth, weekly, including when the answer is negative. It costs
one script run and it is the reason to believe anything else here.

**Reader audits** are the highest-demand, lowest-cost, highest-trust format:
31% of requests, material supplied by someone else, and the one thing nobody
else does. Cap at two a week — a third audit of the same author in a week reads
as a vendetta rather than a service.

**Method studies** are the flagship and cannot be scheduled. Forcing one
produces the thing this desk spent a week criticising: a result found by looking
until something appeared.

### 4. Stop doing

- **Publishing a market call as the headline.** The walk-forward says they are
  unproven. They belong inside the column, sized small, with the number attached.
- **Same-day multiple posts.** Nine in one day happened. Nothing was better for it.
- **Deep dives on request without a measurement.** Five were asked for; the good
  ones tested something. "Here is what I think about BNB" is not a product.

### 5. The backlog the algorithm already supports

Each of these has data on disk or a defined test. None needs a new idea.

1. **The filters select for consistency, not persistence.** The failure the
   walk-forward exposed. This is the most important unwritten piece.
2. **How to check a gainers list in thirty seconds.** Six names, the checkable
   ones wrong — teaches the reader the method rather than scoring a point.
3. **The 760-candle constraint.** The five-window filter cannot be evaluated on
   anything younger than two years, which quietly excludes most of the market.
4. **Gold.** PAXG/XAUT are on the exchange; nothing here has ever tested them.
5. **Fee arithmetic as a first-class idea.** `feeR = 0.2 / stopPct` decided four
   separate findings this week and has never had its own piece.

### 6. What success looks like

Not reach — there is no way to measure it.

**A reader can recompute any number on the site.** Currently 18 of 56 posts make
that possible; the target is all of them.

**The weekly number is published on time whether it is good or bad.** Missing
one because it was ugly would end the project.

**The track record page stays complete.** 22 of 39 right, losses at the same
size as the wins, 5 posts correctly excluded for stating no direction.
