# Running the system continuously

Three ways to keep this running. They are not equivalent, and the difference
matters more here than in most projects: the only measured edge in this repo
is *latency* (`research/intraday-signal.json` — 4.44x lift at 2.75σ for a
5σ turnover hour), so a scheduler that adds twenty minutes of delay is
spending the very thing the signal is made of.

| | Latency | Cost | Setup | Survives neglect |
|---|---|---|---|---|
| **A. VPS + cron** | ~1 min | $4–6/mo | 10 min | Yes |
| **B. GitHub Actions** | 10–20 min | Free | 2 min | Needs repo activity |
| **C. Local machine** | ~1 min | Free | 5 min | Only while awake |

Publishing is a different story: a daily post does not care about twenty
minutes, so **B is fine for publishing even if you pick A for scanning.**

---

## A. VPS + cron — recommended for the scanner

Any $4/month box. The scanner is one Node process doing ~155 HTTPS requests
every 15 minutes; it needs no database and almost no memory.

```bash
git clone https://github.com/hieungtn-bit/writetoearn.git
cd writetoearn
npm ci --omit=dev          # no build step, no native deps
npm test                   # confirm the gate works before trusting output

crontab -e
```

Paste what `node bin/wte.mjs slots` prints. The scanner line is:

```cron
*/15 * * * * cd /home/you/writetoearn && /usr/bin/node bin/wte.mjs scan >> scan.log 2>&1
```

For publishing as well, add the four `wte auto` lines from the same output and
put the keys in the crontab environment:

```cron
BINANCE_SQUARE_OPENAPI_KEY=...
ANTHROPIC_API_KEY=...
```

### As a service instead of cron

`wte watch` runs the scan on a loop in one long-lived process, which avoids
paying Node's startup on every tick. Use systemd so it restarts on crash and
on reboot:

```ini
# /etc/systemd/system/maix8-watch.service
[Unit]
Description=MAIX8 intraday scanner
After=network-online.target

[Service]
Type=simple
User=you
WorkingDirectory=/home/you/writetoearn
ExecStart=/usr/bin/node bin/wte.mjs watch --every 15
Restart=always
RestartSec=30

[Install]
WantedBy=multi-user.target
```

```bash
sudo systemctl enable --now maix8-watch
journalctl -u maix8-watch -f
```

---

## B. GitHub Actions — zero infrastructure

Already committed: `.github/workflows/scan.yml` and `.github/workflows/publish.yml`.

**The scanner workflow starts working once it is on the default branch.**
Scheduled workflows only fire from the default branch — a workflow sitting on a
feature branch never runs on its schedule, which is the single most common way
this setup silently does nothing.

Three things worth knowing before relying on it:

1. **Scheduled runs are queued, not guaranteed.** `*/15` is a request. Under
   load GitHub commonly delivers ten to twenty minutes late, and occasionally
   skips a run. For the scanner that is real signal decay; for publishing it is
   irrelevant.
2. **Scheduled workflows are disabled after 60 days without repository
   activity.** The scan workflow commits `data/alerts.jsonl`, which counts as
   activity, so it keeps itself alive as long as it is finding anything.
3. **Alerts arrive as GitHub issues.** No extra service and no secret: install
   the GitHub mobile app and it becomes a push notification. If you would
   rather have Telegram or email, that is a small change to the last step of
   `scan.yml`.

For publishing, add two repository secrets under
*Settings → Secrets and variables → Actions*:

- `BINANCE_SQUARE_OPENAPI_KEY`
- `ANTHROPIC_API_KEY`

Then run *Actions → publish → Run workflow*. Leave **dry run** ticked the first
time; it writes and verifies a draft without posting. The daily schedule is
present in the file but commented out on purpose — turning it on means the
account posts without anyone reading the draft first.

---

## C. Local machine

Same as A, using your own crontab (macOS/Linux). Fine for testing, unreliable
as the real deployment: it stops when the laptop sleeps, and the gap is
invisible — you find out by noticing you got no alerts on a busy day.

---

## Verifying it is actually running

The failure this system already had once was not a broken detector. It was a
working detector that nobody ran, so **check that it is alive rather than
assuming it**:

```bash
tail -5 scan.log                                   # cron path
journalctl -u maix8-watch -n 20                    # systemd path
node -e 'console.log(require("./src/alerts.mjs"))' # module loads

# What has actually fired, most recent last:
tail -20 data/alerts.jsonl
```

An empty log after a quiet day is correct. An empty log after a day when
something obviously moved means the scanner is not running — go and look.

---

## What each schedule costs

| Job | Frequency | Requests/run | Notes |
|---|---|---|---|
| `wte scan` | 15 min | ~156 | One ticker call plus one per pair |
| `wte auto` | 4×/day | ~40 | Brief, screen, verify |
| `wte score` | weekly | ~30 | Settles past calls |

The scan is the heavy one: roughly 15,000 requests a day against Binance's
public data API. That is well inside the published limits, but it is why the
scanner batches at a concurrency of 8 rather than firing all 155 at once.

---

## Secrets

Never commit keys. `.gitignore` already covers `.env` and `openapi-key`, and
`wte` refuses to accept a key as a command-line argument so it cannot end up in
your shell history.

If a key has ever been pasted into a chat, a log, or a screenshot, rotate it —
exposure is not undone by deleting the message.
