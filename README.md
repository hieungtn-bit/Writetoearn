# writetoearn

`wte` — a command-line tool that publishes to **Binance Square** through the
Creator Center OpenAPI, with a scheduling queue, daily-quota tracking and a
retry policy built to never double-post.

It talks to the same endpoints as Binance's official
[square-post skill](https://github.com/binance/binance-skills-hub/tree/main/skills/binance/square-post),
so a key saved by either tool works with the other.

---

## Hướng dẫn nhanh (Tiếng Việt)

```bash
# 1. Tạo API key tại Creator Center:
#    https://www.binance.com/square/creator-center/home
#    Đây là key riêng cho đăng bài — KHÔNG đụng tới số dư hay giao dịch.

# 2. Lưu key (đọc từ stdin, không bao giờ nhận qua tham số dòng lệnh)
echo "PASTE_KEY_HERE" | node bin/wte.mjs auth save

# 3. Thử trước, chưa gửi gì lên Binance
node bin/wte.mjs post text --text "GM! #Bitcoin" --dry-run

# 4. Đăng thật
node bin/wte.mjs post text --text "GM! #Bitcoin"

# 5. Hẹn giờ đăng, rồi chạy worker cho nó tự đăng
node bin/wte.mjs queue add text --text "Bản tin sáng" --in 2h
node bin/wte.mjs run
```

Xem hạn mức còn lại trong ngày: `node bin/wte.mjs limits`.

---

## Autonomous daily posting

`wte auto` is the whole daily job in one command: collect live data, write the
post with Claude, verify every figure against the data, publish.

```bash
export BINANCE_SQUARE_OPENAPI_KEY=...   # publishing
export ANTHROPIC_API_KEY=...            # writing

wte auto --dry-run     # research + write + verify, publish nothing
wte auto               # the real thing
```

Cron it and it runs itself — no scheduler service required:

```cron
0 13 * * * cd /path/to/Writetoearn && /usr/bin/node bin/wte.mjs auto >> wte.log 2>&1
```

It exits non-zero on any failure, so a cron mailer or monitor catches problems.

### Why the generated post can be trusted

A prompt saying "never invent numbers" is not enforcement — a model writing
market commentary will happily produce a plausible price. So the draft is
checked against the data before anything is published:

- **Every figure must trace to the brief.** Numbers are extracted from the
  draft and matched against the fetched data, tolerant of rounding and
  abbreviation (`63,250` ≡ `63.2K` ≡ `$63250`). An unmatched price or
  percentage fails the post. Bare small integers (`3 charts`, `24h`) are
  treated as structural and skipped — but anything with a decimal point or a
  percent sign is checked.
- **Unavailable fields cannot be written about.** Open interest and long/short
  ratio have no source here, so any mention of them is blocked. "OI is flat" is
  fabrication when there is no OI data, disclaimer or not.
- **Structure is enforced** — word count, cashtags, hashtags, disclaimer, and a
  call-to-action question.

A failing draft goes back to the model with the specific problems named, up to
two revisions. If it still fails, the run aborts and **nothing is published** —
a bad post is worse than no post, because the API has no delete endpoint.

Key levels are computed from real 30-day daily swing pivots, so support and
resistance are as grounded as the prices.

## Install

Node.js 18+ is the only hard requirement (Node 22 recommended). There are no
runtime dependencies. `ffmpeg`/`ffprobe` are needed **only** for video posts.

```bash
git clone <this repo> && cd Writetoearn
npm link          # optional, puts `wte` on your PATH
```

Without `npm link`, run everything as `node bin/wte.mjs …`.

## Authentication

Create a key at <https://www.binance.com/square/creator-center/home>. It is a
publishing-only credential and is separate from trading API keys.

Provide it either way:

```bash
export BINANCE_SQUARE_OPENAPI_KEY=...      # takes precedence
echo "$KEY" | wte auth save                # or persist to ~/.config/binance-square/openapi-key (0600)

wte auth status                            # shows the masked key and where it came from
```

The tool **refuses** a key passed as `--key`. Command-line arguments are visible
to every process on the machine via `/proc` and get written to shell history.

## Publishing

Add `--dry-run` to any publish command to validate the post and print the exact
request body without sending it.

```bash
# Short text post
wte post text --text "BTC just reclaimed the 200D MA. #Bitcoin"

# Long-form article (a --title makes it an article, and articles need a cover)
wte post article --text "$(cat weekly.md)" --title "Weekly Recap" --cover chart.png

# Image post, up to 4 images
wte post image --text "Three charts to watch" --images a.png,b.png,c.png

# Video post — duration is read off the file when you omit --duration
wte post video --video clip.mp4 --text "60-second breakdown"
```

## Scheduling

Queue posts, then let a worker publish them when they come due.

```bash
wte queue add text --text "Morning note" --in 8h
wte queue add article --text "$(cat recap.md)" --title "Recap" --cover c.png \
    --at 2026-08-01T09:00:00Z --note "monday slot"

wte queue list
wte queue remove 89d44661        # an id prefix is enough

wte run --once                   # publish everything due, then exit — ideal for cron
wte run --interval 120           # stay resident, polling every 2 minutes
```

For cron, `--once` is the right entry point:

```cron
*/10 * * * * cd /path/to/Writetoearn && /usr/bin/node bin/wte.mjs run --once >> wte.log 2>&1
```

A lock file in the state directory keeps two workers from draining the same
queue, so overlapping cron runs are safe.

## Quotas

Binance allows **100 posts** and **400 uploads** per day. `wte` counts both
locally and refuses a post that would exceed either ceiling, so you find out
before spending an upload rather than after. Counters bucket by UTC day, which
is when Binance resets them.

```bash
wte limits
```

If the server reports quota exhaustion first (code `220009`), the worker trusts
the server, parks the queue, and resumes after UTC midnight.

## How failures are handled

The retry policy exists to protect against the one outcome that cannot be undone
— publishing the same post twice.

| Situation | Behaviour |
|---|---|
| Network error, 5xx | Retried with backoff: 1m, 5m, 15m, 60m, then failed |
| Content rejected (`20002`, `20022`) | Failed immediately — replaying the same body cannot help |
| Bad key (`220003`) | The whole run stops; a wrong key will not fix itself by waiting |
| Quota hit (`220009`) | Queue parks until the next UTC day |
| **504 from `/content/add`** | Treated as **published**. The gateway timed out but the post is live; retrying would duplicate it |
| Worker killed mid-publish | Item is held as `needs_review`, never republished automatically |

That last row needs a human, because nothing can tell from the outside whether
the post landed:

```bash
wte queue list --status needs_review
wte queue resolve <id> --published    # you checked your profile, it is live
wte queue resolve <id> --retry        # it never landed, put it back in the queue
```

Uploads that succeeded before a publish failed are still billed against the
daily allowance, because Binance counts them.

## State

Queue, history and quota counters live in `./.wte/state.json` (override with
`WTE_STATE_DIR`). It is written atomically and is git-ignored. The API key is
**not** kept there — it lives in `~/.config/binance-square/openapi-key`.

## Project layout

```
bin/wte.mjs      CLI entry point
src/config.mjs   Endpoints, limits, key resolution
src/client.mjs   HTTP client: auth header, uploads, media polling, publish
src/post.mjs     Post validation and /content/add body building
src/publisher.mjs  One post end to end: validate, upload, publish
src/store.mjs    Queue, quota counters, worker lock
src/worker.mjs   Scheduling, retry policy, failure classification
src/errors.mjs   Error taxonomy driving retry decisions
src/cli.mjs      Argument parsing and commands
```

## Tests

```bash
npm test
```

39 tests covering post validation, body shapes, the 504 path, retry
classification, quota enforcement and crash recovery. They run entirely against
stubs — no network, no credentials, nothing published.

## Scope

This tool creates new posts. It does not edit, delete, comment, like or search
existing content; the Creator Center OpenAPI does not expose those operations.
