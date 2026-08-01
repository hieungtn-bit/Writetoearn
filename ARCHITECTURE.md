# Platform architecture

How this system is decomposed, why the boundaries sit where they do, and what
has to become true before a boundary turns into a network call.

The design is not generic. Every boundary below exists because something
concrete went wrong or nearly went wrong in this codebase, and the boundary is
what would have prevented it.

---

## The position: boundaries now, processes later

Today this is one Node process, roughly five thousand lines, one operator, 158
tests. Splitting that into deployed services would add network failure modes,
six deploy pipelines and distributed debugging in exchange for nothing — there
is no independent scaling pressure, no second team, no differing runtime need.

So the plan is:

1. **Define the services and their contracts now.** Enforce them in-process.
2. **Extract a service only when a stated trigger fires.** Each service below
   lists its own.

A boundary you can already point at is most of the value. Extracting it later
is then a deployment change, not a rewrite.

---

## Services

### 1. `market-data` — the only thing allowed to touch an exchange

**Owns:** OHLCV candles, spot tickers, funding rates, trending lists, the
altcoin universe. Normalisation across venues. Caching and retry.

**Exposes:**

```
GET  /snapshots/{id}                 -> a frozen, immutable market snapshot
POST /snapshots                      -> capture one now, returns {id, takenAt}
GET  /candles/{symbol}?limit&interval
GET  /symbols                        -> what actually trades, per venue
```

**Why it is a service at all.** Three separate failures in this codebase came
from treating exchange access as a library call:

- The site build fetched candles from Binance at deploy time. When that host
  was unreachable from the build region, a deploy carrying only prose changes
  failed and the previous version stayed live.
- `fapi.binance.com` is geo-blocked from the host this runs on, so open
  interest and long/short ratio are simply unavailable — a fact that has to be
  surfaced as data, not discovered as an exception.
- Transient 503s took down whole runs until retry was added, in one place, by
  hand.

Centralising means retry, caching, geo-fallback and the unavailable-field list
are implemented once and every consumer inherits them.

**The snapshot is the core idea.** A snapshot is immutable and addressable.
Everything downstream references a snapshot ID rather than "now". This is what
makes a published claim auditable: the figure was true *against snapshot X*,
and anyone can re-fetch X and check.

**Extraction trigger:** when a second consumer needs the same data on a
different schedule — e.g. a live dashboard polling every minute while the
publisher runs four times a day.

---

### 2. `analytics` — pure computation, no I/O

**Owns:** every derived number. Realized volatility, ATR, RSI, VWAP, underwater
share, volume z-score, turnover concentration, volume trend, correlations,
range position, stage classification.

**Exposes:**

```
POST /analyse   {snapshotId, symbols[], metrics[]}  -> readings
POST /stage     {snapshotId, symbol}                -> {stage, note, metrics}
```

**Why separate.** It is already the only genuinely pure part of the system —
`src/analysis.mjs`, `src/stage.mjs` and `src/lessons.mjs` are functions over
candles with no side effects, which is why they carry the densest tests.
Purity means it can be cached aggressively (a snapshot ID plus a metric name is
a perfect cache key) and scaled horizontally without any coordination.

**Rule that must survive extraction:** a metric is computed in exactly one
place. When the volatility percentile was computed against 400 candles in a
lesson and 1000 in an article, the same reading was reported as the 22.4th and
the 10.9th percentile. One implementation, one window, one answer.

**Extraction trigger:** when computation time starts dominating a run, or when
a second language needs the same metrics.

---

### 3. `verification` — the gate that content cannot bypass

**Owns:** tracing every figure in a draft back to a snapshot, structural rules
(word count, cashtag limit, required bias, disclaimer), and forbidden-claim
detection for fields the snapshot marks unavailable.

**Exposes:**

```
POST /verify  {text, snapshotId, format, includeScreen}
              -> {ok, problems[], figuresChecked, verifiedAgainst}
```

**Why it is its own service and not a library.** Because it must be impossible
to skip, and in practice it was skipped. A render step and a publish step were
chained with a newline instead of `&&`, the guard exited non-zero, and the post
went out anyway carrying a figure that had gone stale within hours.

As a service, publishing takes a **verification token** rather than a boolean:
the publisher refuses any payload without a token that references the same
snapshot and hashes to the same text. A human cannot forget the `&&`.

**Known gaps that belong here, documented rather than hidden:** bare integers
at or below 100 are treated as structural and go unchecked; values under 1 are
compared by absolute difference; small values printed to one decimal can breach
the 0.5% relative tolerance and produce *false* rejections.

**Extraction trigger:** when a second content producer exists — a human writing
by hand, or another model — that must be held to the same gate.

---

### 4. `content` — drafting and editorial rules

**Owns:** slot formats, brand voice, the analyst/writer/critic pipeline, the
repetition history that stops a live thesis being restated with fresh decimals.

**Exposes:**

```
POST /drafts  {slot, snapshotId, angle?}  -> {text, claims[], needsVerification}
GET  /history?days=14                     -> recent angles, to avoid repeats
```

**Design note.** Content is the only service permitted to be non-deterministic,
which is exactly why it must not be trusted. It produces a draft; it never
decides that a draft is publishable. That decision belongs to `verification`.

**Extraction trigger:** when drafting needs a different runtime — a GPU, a
different model provider, or a much longer timeout than the rest of the system.

---

### 5. `publisher` — the only thing that talks to Binance Square

**Owns:** the Square OpenAPI client, media upload, daily quota, the outbound
queue, retry and idempotency, and the record of what was published.

**Exposes:**

```
POST /publish  {spec, verificationToken, idempotencyKey}
               -> {postId, shareLink, snapshotId}
GET  /quota    -> {postsUsed, uploadsUsed, limits}
```

**Why idempotency is not optional.** The gateway already returns 504 after the
content was accepted, leaving the caller unable to tell whether a post exists.
The current code flags this as `missingPostId` and asks a human to check the
profile before re-posting. An idempotency key turns that into a safe retry.

**Rule:** every published post is stored with the snapshot ID it was verified
against. That is what makes a correction possible later — you can prove what
was true when, instead of arguing about it.

**Extraction trigger:** when a second destination exists. X, Telegram and the
website are all outbound channels with the same shape, and the moment there are
two, quota and idempotency stop being Binance-specific concerns.

---

### 6. `web` — the owned, indexable surface

**Owns:** the static site: research archive, `/learn` lessons, charts, sitemap,
structured data.

**Consumes:** published drafts, and captured lesson examples.

**Hard constraint, learned the hard way:** the build performs **no** network
I/O. Lesson examples are captured into `site/lesson-data.json` by an explicit
refresh step and committed. A deploy must be reproducible offline, because a
deploy that depends on an exchange fails for reasons that have nothing to do
with the change being deployed.

**Extraction trigger:** already effectively separate — it is a static artifact
built from committed inputs.

---

### 7. `scoreboard` — accountability

**Owns:** settling past calls against later snapshots, win/loss records, the
public track record.

**Why it matters architecturally:** it is the only consumer that reads *old*
snapshots. That is the requirement that forces snapshots to be immutable and
retained, rather than a cache that may be evicted.

---

## How a daily run flows

```
market-data ── capture snapshot ──► snapshotId
                                      │
                    ┌─────────────────┼─────────────────┐
                    ▼                 ▼                 ▼
               analytics         content            scoreboard
             (readings)        (draft text)      (settle old calls)
                    │                 │
                    └────────► verification ◄────┘
                                      │
                            verificationToken
                                      │
                                      ▼
                                  publisher ──► Binance Square
                                      │
                                      └──────► web (static rebuild)
```

Every arrow carries a snapshot ID. Nothing downstream ever asks an exchange
"what is the price now" — it asks a snapshot "what was true at capture".

---

## Cross-cutting

**Contracts.** One package of schemas shared by every service. A snapshot, a
reading, a draft, a verification result and a publish record each have exactly
one definition. Contract tests run in CI on both sides of every boundary.

**Idempotency and retry.** Uniform: every mutating endpoint takes an
idempotency key; every outbound call retries with backoff; every retry is
bounded and logged. Retry was added ad hoc, twice, in different files — that is
the signal it belongs in one shared place.

**Observability.** A single correlation ID per run, threaded from snapshot
capture to published post. The question worth answering fast is "which snapshot
did this number come from", and that only works if the ID travels.

**Failure posture.** Fail closed on anything that publishes; fail open on
anything cosmetic. A missing lesson snapshot fails the build on purpose,
because the previous deployment staying live is better than a site quietly
missing a section. An unreachable news feed does not block a post, because
headlines are context and prices are the claim.

---

## Migration, in the order that pays

1. **Extract contracts.** Schemas for snapshot, reading, draft, verification,
   publish record. No behaviour change; makes every later step mechanical.
2. **Make snapshots real.** Persist them, address them by ID, thread the ID
   through drafting, verification and publishing. This is the single highest
   value change — it removes an entire class of stale-figure bug.
3. **Turn verification into a token.** The publisher refuses payloads without
   one. Closes the skipped-gate hole structurally rather than by discipline.
4. **Split market-data out.** First real process boundary, and the one with a
   genuine operational case: caching, rate limits, geo-fallback.
5. **Everything else, only on its stated trigger.**

Steps 1 to 3 are worth doing regardless of whether a single service is ever
deployed separately. They are where the correctness lives.

---

## What this deliberately does not do

No message broker, no service mesh, no per-service database, no Kubernetes.
Those solve coordination problems this system does not have, and each one adds
a component that can fail independently of the work it supports.

The failure modes that actually hurt here were: a stale figure published, a
gate skipped by a shell operator, a build coupled to a third-party API, and the
same metric computed two ways. None of them are fixed by infrastructure. They
are fixed by immutable snapshots, a verification token, an offline build and a
single implementation per metric — all of which are in the list above.
