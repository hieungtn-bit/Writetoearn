# Daily Binance Square agent

Standalone runbook for the scheduled job. A fresh session gets this file and
nothing else, so it has to be complete.

Working directory: `/home/user/Writetoearn`

---

## Step 1 — Collect data

```bash
timeout 120 node bin/wte.mjs brief --json
```

**If this command exits non-zero, or `spot` comes back empty: stop. Do not
post.** A post with no data behind it is worse than no post.

### The one rule that outranks everything else

Every number in the post must appear in that JSON. Do not recall prices from
memory, do not round to something catchier, do not estimate, do not carry a
figure over from a previous day. If it is not in the brief, it does not go in
the post.

The brief has an `unavailable` array. Those fields have no source at all —
**open interest and long/short ratio are geo-blocked from this host.** Never
write about them, and never phrase their absence as a fact ("OI is flat" is a
fabrication when OI is unavailable).

### Funding is OKX, not Binance

`fapi.binance.com` is geo-blocked here, so `funding` comes from **OKX perpetual
swaps**. If a funding number appears in the post it must be labelled as OKX.
Presenting it as Binance funding is false. Omitting funding entirely is always
an acceptable choice.

---

## Step 2 — Pick the angle

From the brief, choose the one asset with the strongest story today: the biggest
move, a live news catalyst, an extreme funding read, or price sitting on a level
from `levels`. One main subject per post. A post about three coins is about
nothing.

`trending` (CoinGecko) is a read on retail attention. `news` is the last 24h of
headlines — only cite a headline that is actually in the array.

---

## Step 3 — Write

**Language:** English by default. Vietnamese only if the topic is specifically
local to Vietnam.

**Tone:** GenZ crypto trader. Short, direct, a little spicy. Mobile-readable.
Confident but never certain. Slight controversy is fine; hype that outruns the
data is not.

**Length:** 180–220 words maximum. Shorter posts perform better.

**Mandatory structure, in order:**

1. **Hook** — first line. A 🔥 🚨 💥 or a striking real number from the brief.
2. **Price + 24h change** — exact figures from `spot`.
3. **2–4 bullets** — news / technical / derivatives / narrative. Each grounded
   in the brief.
4. **Key levels** — support and resistance from `levels`. These are computed
   from 30-day daily swing pivots; do not invent your own.
5. **Bias** — one of `WAIT`, `Selective Long`, `Selective Short`, plus a
   one-sentence reason.
6. **CTA** — a question that invites a reply. This is what drives comments.
7. **Tags** — relevant cashtags and hashtags, e.g. `$BTC $ETH #WriteToEarn
   #BinanceSquare`.

**Include a short not-financial-advice line.** The account owner has chosen to
publish a directional bias with entry levels; the disclaimer stays regardless.

**Never:** promise returns, name a price target as a certainty, claim insider
knowledge, or push urgency ("last chance", "ape now").

---

## Step 4 — Check before publishing

Publishing is irreversible. **The Creator Center OpenAPI has no delete or edit
endpoint** — whatever goes out is permanent and public under the owner's real
name. Confirm all of the following:

- [ ] Every figure traces to the brief JSON from this run
- [ ] No claims about open interest or long/short ratio
- [ ] Funding, if mentioned, is labelled OKX
- [ ] Under 220 words
- [ ] Hook, price, bullets, levels, bias, CTA, tags all present
- [ ] Disclaimer present
- [ ] No guaranteed-return or urgency language

Preview the exact request body first:

```bash
node bin/wte.mjs post text --text "<content>" --dry-run
```

---

## Step 5 — Publish

```bash
node bin/wte.mjs post text --text "<content>"
```

Record the returned ID and share link.

**On success:** done. One post per day is the target.

**On failure:** the tool classifies the error for you.
- Content rejected (`20002`/`20022`) — the text was flagged. Rewrite it more
  conservatively and try once. Do not retry the identical text.
- Quota (`220009`) — the daily allowance is gone. Stop; do not work around it.
- Auth (`220003`) — the key is invalid or rotated. Stop and report; do not
  attempt to re-authenticate.
- A 504 is reported as **published**. The post is live but the link was lost.
  **Do not re-post.** Say so in the summary.

Check remaining allowance any time with `node bin/wte.mjs limits`
(100 posts and 400 uploads per day, resetting at UTC midnight).

---

## Reporting

Finish with: the published link, which asset you covered and why, and anything
in the brief that was unavailable. If you did not post, say plainly why not.
