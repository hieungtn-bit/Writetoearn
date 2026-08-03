# First live catch: VIC, 2026-08-03

The first token the scanner found after it was wired up, and the first honest
test of whether any of this was worth building.

## What happened

VIC-USDT, hourly, all times UTC. The z-score is turnover against the pair's
own trailing 168 hours, computed causally — only hours strictly before the one
being scored.

| Hour | Close | 1h | volume z |
|---|---|---|---|
| 08:00 | 0.0288 | +5.49% | 1.6 |
| **09:00** | **0.0308** | **+6.94%** | **7.2** |
| 10:00 | 0.0315 | +2.27% | 1.5 |
| 11:00 | 0.0307 | −2.54% | 1.3 |
| 12:00 | 0.0358 | +16.61% | 2.4 |
| 13:00 | 0.0470 | +31.28% | 25.9 |

The threshold is 5σ. **The 09:00 hour cleared it at 7.2σ**, four hours before
anybody looked.

Replaying `scoreSeries` against the series truncated at that point — the exact
committed code, on the exact data it would have had at 10:00 — returns volume
z 7.2 at a price of 0.0308, and `alertsFrom` accepts it. Within twelve hours
of that entry the peak was **+60.1%**, so on the study's own terms
(+10% inside 12 hours) it is a **hit**.

The alert that actually fired came at 13:00, at 0.0470. Same token, same
detector, same threshold — **52% higher entry**, and the difference is not the
algorithm. It is that no scan ran between 10:00 and 14:11, because the cron
did not exist until 13:57 that afternoon.

## What this does and does not show

It shows the thing that had been argued from a backtest all along: the
constraint was never the detection logic, it was that nothing ran it. The
09:00 hour was legible at the time, by the code as committed, at a price 52%
below where we noticed.

It does not show that the scanner is 100% accurate. This is **one** case, and
the measured rate is 27.6% of alerts reaching +10% within twelve hours against
a 6.2% baseline. Most alerts will not do this. A single spectacular case is
exactly the kind of evidence that produced `quietBidAtFloor` — a hypothesis
read off one chart that tested at −1.12σ, worse than random.

It is also a **reconstruction**, not a live call. The code is causal and the
data is the data it would have had, but nobody was watching at 10:00 and no
alert was recorded at 0.0308. The honest record is `data/alerts.jsonl`: eight
alerts fired live on 2026-08-03, entries committed to git before the outcomes
were known, none settled at the time of writing. That file is the test. This
page is the reason to keep it running.

## Reproduce

```bash
node bin/wte.mjs alerts          # every alert, scored against what followed
git log --follow data/alerts.jsonl   # entries timestamped before the outcome
```
