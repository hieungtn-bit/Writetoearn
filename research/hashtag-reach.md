# Which hashtag pages our posts land on, and how crowded they are

Measured 2026-08-05, after Binance Square announced that API posting now supports
token tags and topic hashtags "for a chance to land on trending topic pages".

## What the announcement does and does not change for us

Three of the four upgrades were already in use. We publish long-form articles,
we attach a cover image, and per Binance's own skill documentation `$coin` and
`#topic` text "passes through verbatim — the backend parses them". Tags are
extracted server-side from the body; there is no separate JSON field to add, and
`buildPublishBody` in `src/post.mjs` was never missing one.

So the capability was never the constraint. Which tags we choose is.

## The audit

Every published draft, all fifty-one of them, carries exactly two hashtags:

    51  #WriteToEarn
    51  #BinanceSquare

No topical variation across three months of posts.

## Pool sizes, read off the public hashtag pages

Collected by hand through a rendering fetch. Headless Chromium cannot reach these
pages from this machine — it returns Chrome's error page — so this is not
automatable here and the numbers are a snapshot rather than a feed.

| hashtag          | views  | discussing | what it is                  |
|------------------|--------|------------|-----------------------------|
| `#BTC`           | 9.1B   | 57.8M      | the asset everyone posts to |
| `#BinanceSquare` | 175.4M | 732,603    | platform meta               |
| `#WriteToEarn`   | 43.3M  | 81,414     | creator-programme meta      |
| `#FundingRate`   | 199K   | 948        | a topic we actually write   |
| `#API`           | 59.5K  | 236        | a topic we actually write   |

## What this says

The two tags on every post are not dead — they are the opposite. They are among
the most crowded surfaces on the platform, and both are *meta* tags: they gather
people talking about posting and about the creator programme, not people looking
for market analysis. A trader hunting for funding-rate work lands on
`#FundingRate`, where 948 posts exist and ours is not one of them.

Views per discussing sits between 157 and 532 across all five, so that ratio is
not the discriminator. Competition density is: a post on `#FundingRate` competes
with roughly a thousand others, the same post on `#BinanceSquare` with seven
hundred thousand.

This is a mechanism, not a measurement of our own reach. Square exposes the
topic's cumulative views, never the individual post's, so switching tags remains
a hypothesis — a cheap one with a documented route behind it, which is more than
the language and length changes had.

## The caveat that keeps this honest

We still cannot see our own view counts. Every reach change made so far —
shorter posts, Vietnamese, now tags — is untested, and will stay untested until
either Square exposes a stats endpoint or we find another way to observe it.
Nothing here should be reported as an improvement. It is a better-argued guess.
