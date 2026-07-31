# The daily team

One command runs the whole day's work for a slot:

```bash
wte team --format positioning            # publish
wte team --format positioning --dry-run  # everything except publish
```

---

## What it cannot do — read this first

**Interacting with other people's content is not possible through this API.**
Binance's own documentation is explicit:

> This skill only supports publishing new posts. It does not support:
> Commenting, liking, or other interactions.

There is no endpoint to read the feed, search posts, reply to a comment, like,
follow, or quote. So "an agent that engages with the whole market" cannot be
built on the Creator Center OpenAPI — not because it is hard, but because the
surface does not exist. Any tool claiming otherwise is either using a private
API or driving the web UI, both of which risk the account.

What the team does instead is the half that *is* automatable: research, write,
verify, publish, and keep score. **Replying to comments stays manual**, and it
is worth your time — a reply from the author is the cheapest engagement signal
there is, and it is the one thing here a machine cannot take off your hands.

---

## Why three roles and not one prompt

Multi-agent designs are usually worse than one good prompt, so each role here
has to justify itself.

| Role | Job | Why it is separate |
|---|---|---|
| **Analyst** | Reads the brief, the alt screen and the recent post history; picks the day's subject and thesis, or declines | Choosing *what is worth saying* is a different skill from saying it. Bundled together, the model writes about whatever it happened to notice first. |
| **Writer** | Drafts to the chosen angle, in voice, for the slot format | Needs the angle fixed before it starts, or it drifts mid-post. |
| **Critic** | Fresh context that never saw the draft being written. Judges whether it is worth a reader's time | A writer reviewing its own draft rationalises. This is the writer-verifier split, and the fresh context is the entire point. |

Deliberately **not** a role: the mechanical checker. Number tracing, cashtag
counts, word limits and forbidden-field claims live in `src/verify.mjs`, where
they are deterministic, tested, and free. Asking a model to check arithmetic it
just produced would be slower, costlier and less reliable.

This is a **workflow, not an autonomous agent loop** — control flow is code,
and the model supplies judgment at three fixed points. That is the simplest
tier that does the job, and simple is what survives running unattended.

## The run

```
collect brief ─┐
alt screen ────┼─▶ ANALYST ──▶ angle │ or skip
recent posts ──┘                 │
                                 ▼
                    ┌───▶ WRITER ──▶ draft
                    │              │
                    │              ▼
                    │      CHECKER (deterministic)
                    │         fail │ pass
                    └──────────────┤
                                   ▼
                               CRITIC
                            reject │ approve
                    └──────────────┤
                                   ▼
                        publish + record claim
```

Ordering matters. The deterministic checker runs **before** the critic, because
its failures are exact and free — there is no point spending a critique on a
draft with a fabricated number in it. Up to three rounds; if nothing passes,
the run fails and **nothing is published**.

## Two things that stop it going stale

**The analyst may decline.** If the data is unremarkable it sets `skip` and no
post goes out. A channel that forces something into every slot teaches readers
to skip it, and the quota is a rate limit rather than a target.

**Anti-repetition.** Every published post records its thesis and hook, and the
last four days of them go to both the analyst and the writer with an explicit
instruction not to restate them. Repetition is the quiet way an automated
channel dies: four days of "BNB leads the majors" with fresh decimals and the
audience is gone.

## Schedule

```cron
30 0  * * * cd /path/to/Writetoearn && node bin/wte.mjs team --format recap       >> wte.log 2>&1
30 7  * * * cd /path/to/Writetoearn && node bin/wte.mjs team --format europe      >> wte.log 2>&1
15 13 * * * cd /path/to/Writetoearn && node bin/wte.mjs team --format positioning >> wte.log 2>&1
0 20  * * * cd /path/to/Writetoearn && node bin/wte.mjs team --format wrap        >> wte.log 2>&1
0 9   * * 1 cd /path/to/Writetoearn && node bin/wte.mjs score                     >> wte.log 2>&1
```

Needs `BINANCE_SQUARE_OPENAPI_KEY` and `ANTHROPIC_API_KEY`. Every command exits
non-zero on failure, so a cron mailer catches problems.

`wte auto` remains as the single-model version — same gates, no analyst or
critic. Cheaper per post; use it if the team's cost is not worth it on quiet
slots.

## Cost

Each `team` run makes three to five model calls on `claude-opus-5`, most of the
tokens being the brief and the screen. Four slots a day is roughly 12–20 calls.
If that is too much for the quieter slots, run `auto` for `europe` and `wrap`
and keep `team` for `recap` and `positioning`, where the analysis carries the
post.

## Status

The orchestration is covered by tests against a stubbed model: role ordering,
the analyst's skip path, checker-before-critic, revision feedback carrying the
specific defect, the three-round give-up, anti-repetition reaching both roles,
and refusal handling.

**The live path has never run.** No `ANTHROPIC_API_KEY` was available in the
environment where this was built, so every model call is exercised against a
stub. Run `wte team --dry-run` first.
