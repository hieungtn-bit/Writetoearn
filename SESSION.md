# Daily run from a Claude chat session

Use this when there is **no `ANTHROPIC_API_KEY`**. The chat session *is* the
model: you play the analyst, writer and critic yourself, and the deterministic
gates do the refereeing.

Paste this whole file's "Run it" section as the prompt for a fresh session, or
just say: *"Run the daily MAIX8 post for the `<slot>` slot, following
SESSION.md."*

---

## The one rule that makes this work

**Write from the same snapshot you verify against, minutes apart.**

Figures drift fast enough to matter. Observed repeatedly in one afternoon: a
30-day range position moved 4.46% → 4.29% in the time it took to draft, and BTC
lost a support pivot between two drafts, turning "price is sitting on support"
into a false sentence. Every failure was caught, but only because the draft was
re-checked against fresh data immediately before publishing.

Never write a draft now and publish it an hour later. Re-check or rewrite.

---

## Run it

Working directory: the repo root. Slot is one of `recap`, `europe`,
`positioning`, `wrap`, `event` — see `wte slots`.

### 1. Data

```bash
node bin/wte.mjs brief                      # majors: price, levels, analysis
node bin/wte.mjs screen                     # 26 alt pairs, outliers flagged
node bin/wte.mjs stage <SYM...>             # how far through a move an asset is
node bin/wte.mjs team --format <slot> --dry-run   # prints the analyst prompt
```

`stage` answers a different question from `screen`: not "what moved" but "how
far through a move is it". Use it on whatever the screen surfaces. The reading
that matters is `vol_trend` — the share of money underwater is near zero both
for a move still recruiting buyers and one that has run out of them, so it
cannot separate the two, and participation can.

The `--dry-run` output is the exact prompt the automated analyst would get,
including the recent-post history. Read it and answer it yourself.

**If the brief has no spot prices, stop. Do not post.** A post with no data
behind it is worse than no post.

### 2. Analyst — pick the angle

From the data, choose the single most interesting *and defensible* story.
Interesting means the reader learns something they could not get by glancing at
a price. Defensible means every part traces to a figure in the brief.

Check the recent-post list in the dry-run output and **do not repeat it**.
Restating a live thesis with fresh decimals is how the channel loses people.

**You are allowed to conclude there is no story.** On a quiet day, skip the
slot. The 100/day allowance is a rate limit, not a target.

### 3. Writer — draft it

Follow `src/brand.mjs` for voice and `src/slots.mjs` for the slot's shape.
Non-negotiables:

- Every number must appear in the brief you just fetched.
- Exactly **three** distinct cashtags. A fourth is rejected by the API with
  `[220095]`; three is the maximum number of price widgets, which are the
  highest-intent click surface on the post.
- Never mention open interest or long/short ratio as fact — no data source.
  Saying you *cannot* see them is fine and encouraged.
- Funding is **OKX**, not Binance. Label it.
- State a bias: `WAIT`, `Selective Long`, or `Selective Short`. Without one the
  post is unscoreable and vanishes from the track record.
- Round carefully. For values under ~10, one decimal place — `4.9%` for `4.874%`
  is 1% off and gets rejected.

Write to `drafts/<n>-<name>.txt`.

### 4. Check — the real gate

```bash
node bin/wte.mjs check drafts/<file>.txt --format <slot>
node bin/wte.mjs check drafts/<file>.txt --format <slot> --screen   # writing about alts
```

Refetches the market and traces every figure. Fix whatever it names and run it
again until it passes. It fails loudly rather than guessing.

The plain check fetches the **majors brief only**, so any $ATOM or $PUMP figure
is unverifiable and fails. Add `--screen` to fetch the 26 alt pairs too and
trace those figures as well; it costs a second, slower fetch, which is why it is
opt-in. If a draft cites a coin outside the brief, the failure output says so.

This is for **pre-publication** checking only. Running it against an
already-published post will fail simply because prices moved — that is
expected, and auditing past calls is `wte score`, not this.

### 5. Critic — read it once more

Ask yourself, honestly: would a professional forward this without
embarrassment? Reject your own draft if the thesis is a truism, if it asserts
causation the data cannot support, if it hypes, or if the bias does not follow
from the evidence.

**This step is weaker here than in the automated team**, where the critic runs
in a context that never saw the draft being written. You wrote it, so you will
rationalise it. Lean on the deterministic checker and be harder on yourself
than feels necessary.

### 6. Publish

```bash
node bin/wte.mjs post text --text "$(cat drafts/<file>.txt)"
```

Then record it so tomorrow's session does not repeat it:

```bash
node -e 'import("./src/store.mjs").then(({Store})=>{
  new Store().recordHistory({
    format:"<slot>", asset:"<SYMBOLUSDT>", bias:"WAIT",
    angle:"<one line: the thesis>", hook:"<first line of the post>"
  });
})'
```

`wte post` records a minimal history entry automatically, but the angle is what
actually prevents repetition, so add it explicitly.

### 7. Weekly

Mondays, settle last week's calls and publish the scoreboard:

```bash
node bin/wte.mjs score
```

Show the losses. A scoreboard that only shows wins is marketing, and readers
can tell.

---

## What this cannot do

Binance's API publishes only — no commenting, liking, searching, or reading the
feed. **Replying to comments is manual and worth your time**; it is the one
engagement lever a machine cannot pull here.

## Known gaps in the checker

It is a strong gate, not a complete one. Eyeball these yourself:

1. **Small integers from arithmetic.** `"26 dollars above support"` passed the
   check while being wrong — bare integers ≤100 are treated as structural.
2. **Levels from earlier posts.** The brief holds current state only, so an
   accountability post referencing yesterday's level cannot be auto-verified.
3. **Values below 1.** The matcher floors its comparison scale at 1, so funding
   rates are compared by absolute difference, not relative — effectively
   unchecked at the 0.5% level.
4. **Small values rounded to one decimal get *false* failures.** Tolerance is
   0.5% *relative*, so a z-score of -1.18 written as `-1.2` is off by 2.8% at
   that scale and is rejected — as is `3%` for a 3.43% range position. The
   "one decimal under 10" habit from the writing rules fights the checker here.
   Print two decimals below 10 and four below 1, or reword to drop the figure.

## Scheduling

There is no durable scheduler wired up: the Routine tool is gated behind an
approval that has not come through, and in-session cron dies with the container.
So today this runs when a session is opened — either by you, or by whatever
schedules sessions on your account.

With an `ANTHROPIC_API_KEY` set, none of this is needed: `wte team --format
<slot>` does all six steps unattended, and `wte slots` prints the crontab.
