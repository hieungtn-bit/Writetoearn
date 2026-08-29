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

For an article, one command does everything — publishes to Square, adds the
post to the website, commits and pushes. The site updates itself from there:

```bash
node bin/wte.mjs ship drafts/<file>.txt --title "<title>"
```

It derives the slug from the filename, the meta description from the first real
paragraph, the assets from the cashtags, and generates the cover image from the
title. Override any of them with `--slug`, `--description`, `--assets`,
`--topics`, `--cover`. Add `--dry-run` to see what it would do, or `--no-push`
to commit by hand.

A duplicate slug or a draft already on the site stops the run **before**
anything is published, while it is still reversible.

**How the site stays current, and why it once did not.** Vercel picks a
deployment's *target* from the project's production branch, which mirrors the
GitHub default branch and cannot be changed through the public API. The site
lives on a feature branch, so every push built a Preview while www.maix8.study
served a build from days earlier — and `ship` reported success the whole time.

The fix is not to keep asking for production builds. The serving domain is now
bound directly to this branch (`gitBranch` on the domain), so **any push
deploys the live site**, whatever Vercel labels the target. Nothing to
configure, no token needed, no dashboard step.

Getting there took one wrong turn worth recording. Protection was set to
`all_except_custom_domains`, which reads as "a custom domain is always public".
It is not: the exemption applies to **production** deployments only. Binding the
domain to a branch put Vercel's SSO login in front of www.maix8.study for about
three minutes until the binding was removed and production redeployed.

So deployment protection is now **off** for this project. That is a real
trade-off, stated plainly: every preview URL is world-readable. It is
acceptable here because the build output is a public research site with no
secrets and the project carries no environment variables — which also means a
branch build and a production build are byte-identical. Vercel sends
`x-robots-tag: noindex` on preview URLs and not on the live domain, so the
duplicates stay out of search.

If this repo ever gains an environment variable or anything private, that
calculation changes. Re-enabling protection also breaks the branch binding —
the two cannot both be on — so the way back is: unbind the domain, re-enable
protection, and return to production-target deploys, which then need a token
every time.

With `VERCEL_TOKEN` exported, `ship` additionally waits for the build Vercel
started and confirms it went green instead of assuming it. Worth doing; not
required, and it never starts a second build.

To rebuild the live site by hand — after changing a template, say, where there
is no post to publish and so no push to ride on:

```bash
node bin/wte.mjs deploy
```

For a short slot post, which does not go on the website:

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

## Programme thresholds worth aiming at

Verified badges are the only documented lever on distribution — the criteria
post lists "preferred search/recommendation ranking" among the benefits.

| Badge | Requirement |
|---|---|
| Gold Verified | 30K followers **on Square or major social channels**, complete profile, post at least once per calendar quarter, no violations |
| Verified+ | All of the above, plus 300K accumulated views **or** $1M Write to Earn volume in the quarter |

The 30K can be met on an existing X/YouTube following, which is a far shorter
path than building it here. Apply at Personal Profile → Edit Profile → Apply Now.

Nearer term, 1,000 followers unlocks Quiz Red Packets, Tips and Live.

**Write to Earn needs no registration.** Since 2026-02-02 every KYC-verified
user is eligible automatically after their first post. Commission is 20% of the
net trading fee generated by readers' trades, rising to 50% for the week's top
30 creators and 30% for ranks 31-100, settled weekly in USDC.

That formula is worth reading carefully, because it does not reward what the
view counter shows. Reach earns nothing on its own — a reader has to trade.
The three cashtags are the click surface that leads there, which makes cashtag
choice an earnings decision and not only a reach decision.

It also sits in tension with the editorial line. Almost every post here states
`WAIT`, which is the honest call on this tape and the opposite of what
maximises trading-fee commission. Keep stating it. A channel that talks people
into trades to raise its own commission has sold the only thing it has, and the
scoreboard is what makes the WAIT calls worth reading in the first place.

**Binance Angels is not a content programme.** It is unpaid community
volunteering — meetups, Telegram moderation, a boot camp — with no effect on
content distribution. The "Content Master" style badges are Square campaign
awards, not something to apply for.

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

## The daily column

`How is the market? What do we do?` — the recurring piece, started 15 August.
Two questions, the same two, in the same order every edition.

Three commands:

```
node scripts/scan-daily.mjs              # the board, ~5 min
node research/daily-brief.mjs            # breadth, funnel, plans, settlement
node scripts/fill-daily-brief.mjs        # writes drafts/brief-<day>.txt
node scripts/cover-daily-brief.mjs > media/brief.html
node scripts/render-card.mjs media/brief.html media/brief.png
wte check drafts/brief-<day>.txt --article --study research/daily-brief.json,research/stop-law.json,research/selection-bias.json
wte ship drafts/brief-<day>.txt --title "How Is the Market? What Do We Do? — <D Month>" \
  --cover media/brief.png --slug brief-<day> --claim-asset <SYM> --claim-bias "<bias>"
```

Nothing in the writer is dated by hand; every figure comes from
`research/daily-brief.json`. A day with ten longs and no shorts passes the same
claims block, because it checks internal consistency rather than a direction.

**The order of sections is not negotiable.** Yesterday's positions are settled
*before* today's are proposed. A column that offers new trades while the last
set is unaccounted for is selling, not reporting.

**The ledger** lives in `data/plans/<date>.json`, written by the brief and read
by the next edition. Positions are walked forward on hourly candles with the
stop checked before the target — the same rule the backtests use, so a live
position is never scored more kindly than a historical one.

**The filters do not move between editions**: liquid enough to fill, at least
12 independent episodes, all five lookback windows agreeing. The geometry is
fixed at 1.5 ATR with a 2:1 target over 30 days and is never fitted per pair.
Changing any of them requires its own post with a measurement attached.

`FOLLOWED` in the brief holds the names that get a line whether or not they
qualify — currently BTC, BNB, ICP. "It did not make the cut" is an answer
readers deserve to see rather than an absence they have to infer.


## Multi-platform distribution and the trust layer

The site is the canonical copy; Square and every other network are mirrors that
link back to it. Two commands rebuild both halves:

```
node scripts/build-record.mjs        # exports the public record + research snapshots
npm run site                         # builds the site, including /record/ and the feeds
node scripts/build-syndication.mjs   # per-platform copies under dist/syndication/
```

**What makes the site checkable rather than trustworthy-sounding:**

- `/record/` — every scored call, losses at the same size as wins, plus the
  walk-forward result of the pipeline behind them. Unscoreable posts are counted
  separately so the denominator is visible.
- `/data/index.json` — every research snapshot a post ever cited, served. The
  sentence "every figure traces to research/<name>.json" is only true for a
  reader if the file is reachable.
- `/record.json`, `/feed.xml`, `/feed.json` — machine-readable, so aggregators
  and answer engines can cite the numbers rather than paraphrase them.

**Distribution.** `src/syndicate.mjs` reshapes a published draft per platform: an
X thread split on the argument rather than on characters, Telegram whole,
LinkedIn with cashtags stripped and its ceiling respected, Markdown for mirrors.
Every format links back to the canonical page — a copy without that link
separates a figure from the snapshot that justifies it, which is the one thing
this project exists to argue against.

**Posting is still manual off Square.** Only Binance Square has a credential on
this host. The formatting is done and the payloads are written to disk; wiring a
network up is one HTTP call per adapter once a token exists. Do not add a token
to the repo — the Square key already leaked into a transcript once.
