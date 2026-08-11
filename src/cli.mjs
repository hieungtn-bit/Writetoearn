import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import process from "node:process";
import { SquareClient } from "./client.mjs";
import {
  DAILY_POST_LIMIT,
  DAILY_UPLOAD_LIMIT,
  getKeyFilePath,
  getStateDir,
  maskApiKey,
  readSavedApiKey,
  resolveApiKey,
  saveApiKey,
} from "./config.mjs";
import { ValidationError } from "./errors.mjs";
import { POST_TYPE, normalizePost, uploadCount } from "./post.mjs";
import { publishSpec } from "./publisher.mjs";
import { STATUS, Store, utcDayKey } from "./store.mjs";
import { runLoop, runOnce } from "./worker.mjs";
import { probeDurationSeconds } from "./media.mjs";
import { collectBrief, formatBrief } from "./market.mjs";
import { fetchKlines } from "./analysis.mjs";
import { FORMATS, crontabLines, getFormat } from "./slots.mjs";
import { extractClaim, formatScoreboard, scoreDueClaims } from "./scoreboard.mjs";
import { formatDoctor, runDoctor } from "./doctor.mjs";
import { ALT_UNIVERSE, findOutliers, formatScreen, screen } from "./screen.mjs";
import { formatPulse, pulse } from "./pulse.mjs";
import { DEFAULT_MIN_Z, alertsFrom, formatIntraday, scanIntraday } from "./intraday.mjs";
import { AlertLog, DEFAULT_COOLDOWN_HOURS } from "./alerts.mjs";
import { formatAlertScore, scoreAlerts } from "./alert-score.mjs";
import { formatContext, marketContext } from "./context.mjs";
import { fetchOnchain, formatOnchain } from "./onchain.mjs";
import { correlationOnDates, fetchMacro, formatMacro } from "./equities.mjs";
import { formatFlow, takerFlow } from "./orderflow.mjs";
import { bandsFor, clusterMap, fetchPositionTiers, formatLiquidation } from "./liquidation.mjs";
import { buildCard, formatCard } from "./card.mjs";
import { formatSweep, sweep } from "./movers.mjs";
import { formatScan, markdownReport, scan as pbbeScan } from "./pbbe.mjs";
import { formatSides, scanSides } from "./sides.mjs";
import { DEFAULT_DAYS, formatStage, normalizeSymbol, stageOf } from "./stage.mjs";
import { buildSite, renderCoverSvg } from "./site.mjs";
import { addArticle, assetsFromText, descriptionFromText, slugFromDraft } from "./publish-flow.mjs";
import { createDeploy, deployConfigFromEnv, waitForCommitDeploy, waitForDeploy } from "./deploy.mjs";
import { execFileSync } from "node:child_process";
import { ARTICLE_MAX_WORDS, verifyPost } from "./verify.mjs";

const HELP = `wte — automated publishing for Binance Square

Usage
  wte auth save                       Save your Square OpenAPI key (reads stdin)
  wte auth status                     Show which key is in effect

  wte post <type> [options]           Publish one post right now
  wte queue add <type> [options]      Schedule a post
  wte queue list [--status <s>]       Show the queue
  wte queue remove <id>               Drop a queued post
  wte queue resolve <id> --published | --retry
                                      Settle a post left in needs_review

  wte run [--once] [--interval <s>]   Publish everything that is due
  wte limits                          Today's quota usage

  wte brief [--json]                  Live market data, with gaps listed
  wte auto [--format <f>] [--dry-run] The whole daily job: research, write,
                                      verify, publish. For cron.
  wte slots                           The daily schedule + crontab lines
  wte score [--days <n>]              Settle past calls, print the scoreboard
  wte check <draft.txt>               Verify a draft against freshly fetched data.
            [--screen [SYM,...]]        --screen traces altcoin figures; name
                                      symbols to skip the full 26-pair fetch
            [--article] [--max-words <n>]  --article lifts the slot word limit
            [--funding <INST,...>]      --funding traces funding history,
            [--hourly <SYM,...>]        --hourly a candle series, --interval
            [--interval <i>] [--limit <n>]  and --limit set its span
            [--stage <SYM,...>]         --stage the move-stage metrics
            [--no-call]                 profile/announcement post: no bias needed
            [--study <a.json,b.json>]   cite committed research snapshots
  wte screen [--symbols <a,b>]        Screen the altcoin universe for outliers
  wte pulse [--min-volume <n>]        Scan every USDT pair for today's real event
  wte scan [--min-z <n>] [--top <n>]  Hourly turnover scan — the measured edge
  wte watch [--every <min>]           Run the hourly scan on a loop and log alerts
           [--min-z <n>] [--once]
  wte alerts [--json]                 Score our own alerts against what followed
  wte context [--json]                Breadth, concentration, leverage, funding
  wte onchain [--json]                Valuation metrics, each with its own
                                      percentile and record extremes
  wte macro [--json]                  US indices, rates, dollar, gold — and
                                      BTC's correlation to each
  wte flow <sym> [--minutes <n>]      Who is crossing the spread, and does
                                      price agree with them
  wte liq <sym> [--hours <n>]         Liquidation bands, and where positions
                                      opened recently would be stopped out
  wte movers [--min-score <n>]        Daily gainer sweep: five filters, each
             [--min-volume <n>] [--cards]  reported; --cards writes the plans
  wte sides [--min-score <n>]         Both ends of the board, symmetric rules.
            [--per-side <n>]           Long side is measured; short side is not
  wte pbbe [--z-window 7|30]          Base breakout scan: tight ranges with
           [--max-from-base <f>]      volume arriving. Every component of the
           [--min-volume-z <n>] [--md]  score printed beside it
  wte card <sym> [--short] [--risk <n>]  One-screen trade plan: stop and
           [--account <n>] [--stop-atr <n>]  targets from ATR, leverage
                                      ceiling from real maintenance margin
  wte stage <sym...> [--days <n>]     Which stage of a move an asset is in
  wte site [--out <dir>]              Build the indexable research site
  wte ship <draft.txt> --title <t>    Publish to Square, add to the site,
           [--cover <img>] [--slug <s>]  commit and push. The push deploys.
           [--no-push] [--dry-run]
  wte deploy [--ref <b>] [--sha <c>]  Rebuild the live site from this commit
  wte team [--format <f>] [--dry-run] Full daily run: analyst picks the angle,
                                      writer drafts, checker + critic gate it

Post types and their options
  text     --text <content>
  article  --text <content> --title <title> --cover <image>
  image    --text <content> --images <a.png,b.png>   (max 4)
  video    --video <file> [--duration <seconds>] [--text <content>]

Scheduling (queue add)
  --at <ISO timestamp>                e.g. 2026-08-01T09:00:00Z
  --in <duration>                     e.g. 45m, 2h, 3d
  --note <text>                       A label for your own reference

Global flags
  --dry-run     Build and validate the request, send nothing
  --json        Machine-readable output where it applies

Authentication
  Create a key at https://www.binance.com/square/creator-center/home
  Provide it via BINANCE_SQUARE_OPENAPI_KEY or \`wte auth save\`.
  Keys are never accepted as command-line arguments.

Limits: ${DAILY_POST_LIMIT} posts/day, ${DAILY_UPLOAD_LIMIT} uploads/day.
`;

export async function main(argv = process.argv.slice(2)) {
  const flags = parseFlags(argv);
  const [command, ...rest] = flags._;

  if (!command || flags.help || command === "help") {
    process.stdout.write(HELP);
    return 0;
  }

  switch (command) {
    case "auth":
      return cmdAuth(rest, flags);
    case "post":
      return cmdPost(rest, flags, argv);
    case "queue":
      return cmdQueue(rest, flags);
    case "run":
      return cmdRun(flags, argv);
    case "limits":
      return cmdLimits(flags);
    case "brief":
      return cmdBrief(flags);
    case "auto":
      return cmdAuto(flags, argv);
    case "score":
      return cmdScore(flags);
    case "slots":
      return cmdSlots(flags);
    case "screen":
      return cmdScreen(flags);
    case "pulse":
      return cmdPulse(flags);
    case "scan":
      return cmdScan(flags);
    case "watch":
      return cmdWatch(flags);
    case "alerts":
      return cmdAlerts(flags);
    case "context":
      return cmdContext(flags);
    case "onchain":
      return cmdOnchain(flags);
    case "macro":
      return cmdMacro(flags);
    case "flow":
      return cmdFlow(rest, flags);
    case "liq":
      return cmdLiq(rest, flags);
    case "card":
      return cmdCard(rest, flags);
    case "movers":
      return cmdMovers(flags);
    case "pbbe":
      return cmdPbbe(flags);
    case "sides":
      return cmdSides(flags);
    case "stage":
      return cmdStage(rest, flags);
    case "site":
      return cmdSite(flags);
    case "ship":
      return cmdShip(rest, flags, argv);
    case "deploy":
      return cmdDeploy(flags);
    case "team":
      return cmdTeam(flags, argv);
    case "check":
      return cmdCheck(rest, flags);
    case "doctor":
      return cmdDoctor(flags);
    default:
      throw new ValidationError(`Unknown command "${command}". Run \`wte help\`.`);
  }
}

async function cmdAuth([sub], flags) {
  if (sub === "status") {
    const envKey = process.env.BINANCE_SQUARE_OPENAPI_KEY?.trim();
    const savedKey = readSavedApiKey();
    const source = envKey ? "BINANCE_SQUARE_OPENAPI_KEY" : savedKey ? getKeyFilePath() : null;
    const key = envKey || savedKey;

    if (flags.json) {
      print({ configured: Boolean(key), source, key: maskApiKey(key) }, flags);
      return key ? 0 : 1;
    }
    if (!key) {
      console.log("No key configured. Run `wte auth save` or set BINANCE_SQUARE_OPENAPI_KEY.");
      return 1;
    }
    console.log(`Key ${maskApiKey(key)} (from ${source})`);
    return 0;
  }

  if (sub === "save") {
    const key = (process.env.BINANCE_SQUARE_OPENAPI_KEY?.trim() || (await readStdin())).trim();
    if (!key) {
      throw new ValidationError(
        "No key received. Pipe it in (`echo $KEY | wte auth save`) or set " +
          "BINANCE_SQUARE_OPENAPI_KEY before running this.",
      );
    }
    const file = saveApiKey(key);
    console.log(`Saved ${maskApiKey(key)} to ${file} (mode 0600).`);
    return 0;
  }

  throw new ValidationError("Usage: wte auth <save|status>");
}

async function cmdPost([type], flags, argv) {
  const spec = specFromFlags(type, flags);
  const store = new Store();

  if (!flags["dry-run"]) {
    const budget = store.checkBudget(uploadCount(spec));
    if (!budget.ok) throw new ValidationError(`Refusing to publish: ${budget.reason}.`);
  }

  const client = flags["dry-run"] ? null : new SquareClient({ apiKey: resolveApiKey(argv) });

  const outcome = await publishSpec(client ?? {}, spec, {
    dryRun: Boolean(flags["dry-run"]),
    onProgress: (msg) => console.log(`  ${msg}`),
  });

  if (outcome.dryRun) {
    console.log("Dry run — nothing was sent. Request body:");
    console.log(JSON.stringify(outcome.body, null, 2));
    return 0;
  }

  store.recordUsage({ posts: 1, uploads: outcome.uploadsUsed });

  if (spec.type === POST_TYPE.TEXT) {
    const seen = extractClaim(spec.text, { levels: [], spot: [] });
    store.recordHistory({
      format: "manual",
      asset: seen.asset,
      bias: seen.bias,
      hook: spec.text.split("\n")[0].slice(0, 120),
    });
  }

  if (flags.json) {
    print({ id: outcome.result?.id ?? null, shareLink: outcome.result?.shareLink ?? null }, flags);
    return 0;
  }

  console.log("\nPublished.");
  console.log(`  ID:   ${outcome.result?.id ?? "unavailable"}`);
  console.log(`  Link: ${outcome.result?.shareLink ?? "unavailable"}`);
  if (outcome.missingPostId) {
    console.log(
      "  Note: the gateway timed out before returning a link. The post is " +
        "almost certainly live — check your profile before re-posting.",
    );
  }
  return 0;
}

async function cmdQueue([sub, ...args], flags) {
  const store = new Store();

  if (sub === "add") {
    const spec = specFromFlags(args[0], flags);
    const scheduledAt = resolveSchedule(flags);
    const item = store.add(spec, { scheduledAt, note: flags.note });
    console.log(`Queued ${item.id.slice(0, 8)} (${spec.type}) for ${scheduledAt}.`);
    return 0;
  }

  if (sub === "list") {
    const items = store.list(flags.status ? { status: flags.status } : {});
    if (flags.json) {
      print(items, flags);
      return 0;
    }
    if (!items.length) {
      console.log("Queue is empty.");
      return 0;
    }
    for (const item of items) {
      const when = item.status === STATUS.PENDING ? item.nextAttemptAt ?? item.scheduledAt : item.updatedAt;
      const label = item.spec.title || item.spec.text || item.spec.video || "(no text)";
      console.log(
        `${item.id.slice(0, 8)}  ${item.status.padEnd(13)} ${item.spec.type.padEnd(7)} ` +
          `${when}  ${truncate(label, 48)}`,
      );
      if (item.result?.shareLink) console.log(`          -> ${item.result.shareLink}`);
      if (item.lastError) console.log(`          !  ${truncate(item.lastError, 100)}`);
    }
    return 0;
  }

  if (sub === "remove") {
    if (!args[0]) throw new ValidationError("Usage: wte queue remove <id>");
    const removed = store.remove(args[0]);
    if (!removed) throw new ValidationError(`No queued post matching "${args[0]}".`);
    console.log(`Removed ${removed.id.slice(0, 8)}.`);
    return 0;
  }

  if (sub === "resolve") {
    const item = store.get(args[0] ?? "");
    if (!item) throw new ValidationError(`No queued post matching "${args[0] ?? ""}".`);
    if (item.status !== STATUS.NEEDS_REVIEW) {
      throw new ValidationError(`${item.id.slice(0, 8)} is "${item.status}", not needs_review.`);
    }
    if (flags.published) {
      store.update(item.id, { status: STATUS.PUBLISHED, lastError: null });
      console.log(`Marked ${item.id.slice(0, 8)} as published.`);
      return 0;
    }
    if (flags.retry) {
      store.update(item.id, {
        status: STATUS.PENDING,
        lastError: null,
        nextAttemptAt: new Date().toISOString(),
      });
      console.log(`Requeued ${item.id.slice(0, 8)}.`);
      return 0;
    }
    throw new ValidationError("Pass --published (it went live) or --retry (it did not).");
  }

  throw new ValidationError("Usage: wte queue <add|list|remove|resolve>");
}

async function cmdRun(flags, argv) {
  const store = new Store();
  const dryRun = Boolean(flags["dry-run"]);

  if (!store.acquireLock()) {
    throw new ValidationError(
      `Another worker is already running against ${getStateDir()}. ` +
        "Stop it first, or point WTE_STATE_DIR somewhere else.",
    );
  }

  const client = dryRun ? {} : new SquareClient({ apiKey: resolveApiKey(argv) });
  const log = (msg) => console.log(msg);

  try {
    if (flags.once) {
      const summary = await runOnce(store, client, { dryRun, log });
      if (flags.json) print(summary, flags);
      else {
        console.log(
          `Done: ${summary.published} published, ${summary.retrying} retrying, ` +
            `${summary.failed} failed, ${summary.skipped} skipped.`,
        );
      }
      return summary.failed > 0 ? 1 : 0;
    }

    const controller = new AbortController();
    const stop = () => controller.abort();
    process.once("SIGINT", stop);
    process.once("SIGTERM", stop);

    const intervalMs = Math.max(5, Number(flags.interval ?? 60)) * 1000;
    await runLoop(store, client, { intervalMs, dryRun, log, signal: controller.signal });
    return 0;
  } finally {
    store.releaseLock();
  }
}

async function cmdLimits(flags) {
  const store = new Store();
  const day = utcDayKey();
  const used = store.usageFor(day);
  const payload = {
    day,
    posts: { used: used.posts, limit: DAILY_POST_LIMIT, remaining: DAILY_POST_LIMIT - used.posts },
    uploads: {
      used: used.uploads,
      limit: DAILY_UPLOAD_LIMIT,
      remaining: DAILY_UPLOAD_LIMIT - used.uploads,
    },
    pending: store.list({ status: STATUS.PENDING }).length,
  };

  if (flags.json) {
    print(payload, flags);
    return 0;
  }

  console.log(`Usage for ${day} (UTC)`);
  console.log(`  Posts:   ${payload.posts.used}/${DAILY_POST_LIMIT} (${payload.posts.remaining} left)`);
  console.log(`  Uploads: ${payload.uploads.used}/${DAILY_UPLOAD_LIMIT} (${payload.uploads.remaining} left)`);
  console.log(`  Queued:  ${payload.pending} pending`);
  console.log(`\nCounts are tracked locally in ${getStateDir()} and reset at UTC midnight.`);
  return 0;
}

async function cmdBrief(flags) {
  const symbols = flags.symbols
    ? String(flags.symbols).split(",").map((s) => s.trim().toUpperCase()).filter(Boolean)
    : undefined;

  const brief = await collectBrief({
    symbols,
    newsHours: flags.hours ? Number(flags.hours) : 24,
  });

  console.log(flags.json ? JSON.stringify(brief, null, 2) : formatBrief(brief));

  // A brief with no prices is not a brief; fail loudly so a scheduled caller
  // does not go on to write a post out of thin air.
  return brief.spot.length ? 0 : 1;
}

/**
 * The whole daily job: collect data, write the post, verify it, publish.
 * This is what a cron entry should call.
 */
async function cmdAuto(flags, argv) {
  const dryRun = Boolean(flags["dry-run"]);
  const store = new Store();
  const log = (msg) => console.log(msg);

  log("Collecting market data...");
  const brief = await collectBrief({ newsHours: flags.hours ? Number(flags.hours) : 24 });

  if (!brief.spot.length) {
    throw new ValidationError(
      "No spot prices in the brief — refusing to write a post with no data behind it. " +
        `Sources that failed: ${brief.unavailable.map((u) => u.field).join(", ")}.`,
    );
  }
  log(`  ${brief.spot.length} pairs, ${brief.news.length} headlines, ${brief.levels.length} level sets`);

  if (!dryRun) {
    const budget = store.checkBudget(0);
    if (!budget.ok) throw new ValidationError(`Refusing to publish: ${budget.reason}.`);
  }

  const format = flags.format ?? "positioning";
  const { composePost } = await import("./compose.mjs");
  const { text, attempts, verification } = await composePost(brief, {
    format,
    effort: flags.effort ?? "high",
    onProgress: (msg) => log(`  ${msg}`),
  });

  log(`\n--- draft (${verification.words} words, ${attempts} attempt${attempts === 1 ? "" : "s"}) ---`);
  log(text);
  log("--- end draft ---\n");

  if (dryRun) {
    log("Dry run — nothing was published.");
    return 0;
  }

  const client = new SquareClient({ apiKey: resolveApiKey(argv) });
  const outcome = await publishSpec(client, normalizePost({ type: POST_TYPE.TEXT, text }), {
    onProgress: (msg) => log(`  ${msg}`),
  });

  store.recordUsage({ posts: 1, uploads: outcome.uploadsUsed });

  // Log what the post committed to, so the scoreboard has something to judge.
  const claim = extractClaim(text, brief);
  const publishedAt = new Date().toISOString();
  store.recordClaim({
    ...claim,
    postId: outcome.result?.id ?? `unlinked-${Date.now()}`,
    shareLink: outcome.result?.shareLink ?? null,
    format,
    publishedAt,
  });
  store.recordHistory({ format, asset: claim.asset, bias: claim.bias, hook: text.split("\n")[0].slice(0, 120), publishedAt });

  console.log("\nPublished.");
  console.log(`  ID:   ${outcome.result?.id ?? "unavailable"}`);
  console.log(`  Link: ${outcome.result?.shareLink ?? "unavailable"}`);
  console.log(`  Logged claim: ${claim.asset ?? "no asset"} / ${claim.bias ?? "no bias"}`);
  if (outcome.missingPostId) {
    console.log("  Note: gateway timed out before returning a link. The post is live — do not re-post.");
  }
  return 0;
}

/** Settles matured calls and prints the scoreboard. */
/**
 * Asks the wiring questions no unit test covers.
 *
 * Exits non-zero on a failed check so it can gate a publishing session in a
 * shell without anyone having to read the output.
 */
async function cmdDoctor(flags) {
  const report = await runDoctor();
  if (flags.json) {
    print(report, flags);
    return report.worst === "fail" ? 1 : 0;
  }
  console.log(formatDoctor(report));
  return report.worst === "fail" ? 1 : 0;
}

async function cmdScore(flags) {
  const store = new Store();
  const hours = flags.hours ? Number(flags.hours) : 24;

  const settled = await scoreDueClaims(store, { hours, log: (m) => console.log(m) });
  if (settled) console.log(`Settled ${settled} call(s).`);

  const board = formatScoreboard(store.listClaims(), { days: flags.days ? Number(flags.days) : 7 });
  console.log(`\n${board}`);

  const pending = store.listClaims({ scored: false }).length;
  if (pending) console.log(`\n(${pending} call(s) still too recent to judge.)`);
  return 0;
}

/**
 * The full daily run: analyst picks the angle, writer drafts, checker and
 * critic gate it, then it publishes. This is what cron should call.
 */
async function cmdTeam(flags, argv) {
  const dryRun = Boolean(flags["dry-run"]);
  const format = flags.format ?? "positioning";
  const store = new Store();
  const log = (m) => console.log(m);

  log("Collecting market data...");
  const brief = await collectBrief({ newsHours: flags.hours ? Number(flags.hours) : 24 });
  if (!brief.spot.length) {
    throw new ValidationError(
      "No spot prices in the brief — refusing to write with no data behind it. " +
        `Failed: ${brief.unavailable.map((u) => u.field).join(", ")}.`,
    );
  }
  log(`  ${brief.spot.length} pairs, ${brief.news.length} headlines`);

  // The alt screen is optional context; a failure there should not lose the slot.
  let screenResult = null;
  if (!flags["no-screen"]) {
    try {
      screenResult = await screen(ALT_UNIVERSE, {
        onProgress: (p) => process.stderr.write(`\rscreening ${p}   `),
      });
      process.stderr.write("\r");
      log(`  screened ${screenResult.rows.length} alt pairs`);
    } catch (err) {
      log(`  alt screen unavailable (${err.message}); continuing on majors only`);
    }
  }

  if (!dryRun) {
    const budget = store.checkBudget(0);
    if (!budget.ok) throw new ValidationError(`Refusing to publish: ${budget.reason}.`);
  }

  const recentPosts = store.recentPosts(4);
  if (recentPosts.length) log(`  ${recentPosts.length} recent post(s) in the anti-repetition window`);

  // Without Anthropic credentials a dry run can still prove the data half by
  // showing exactly what the analyst would be handed.
  if (dryRun && !process.env.ANTHROPIC_API_KEY) {
    const captured = [];
    try {
      const { promptCapturingClient, runTeam } = await import("./team.mjs");
      await runTeam({ brief, screenResult, format, recentPosts, log, client: promptCapturingClient(captured) });
    } catch (err) {
      if (!err.promptPreview) throw err;
    }
    const [first] = captured;
    log("\nNo ANTHROPIC_API_KEY set — showing the analyst prompt instead of calling the model.\n");
    log("=== SYSTEM ===");
    log(first.system);
    log("\n=== USER ===");
    log(first.user);
    log("\n(Set ANTHROPIC_API_KEY to run the writer and critic too.)");
    return 0;
  }

  const { runTeam } = await import("./team.mjs");
  const result = await runTeam({ brief, screenResult, format, recentPosts, log });

  if (result.skipped) {
    log(`\nNothing published: ${result.reason}`);
    return 0;
  }

  log(`\n--- draft (${result.rounds} round${result.rounds === 1 ? "" : "s"}) ---`);
  log(result.text);
  log("--- end draft ---\n");

  if (dryRun) {
    log("Dry run — nothing was published.");
    return 0;
  }

  const client = new SquareClient({ apiKey: resolveApiKey(argv) });
  const outcome = await publishSpec(client, normalizePost({ type: POST_TYPE.TEXT, text: result.text }), {
    onProgress: (m) => log(`  ${m}`),
  });
  store.recordUsage({ posts: 1, uploads: outcome.uploadsUsed });

  const claim = extractClaim(result.text, brief);
  store.recordClaim({
    ...claim,
    postId: outcome.result?.id ?? `unlinked-${Date.now()}`,
    shareLink: outcome.result?.shareLink ?? null,
    format,
    angle: result.angle.thesis,
    hook: result.text.split("\n")[0].slice(0, 120),
    publishedAt: new Date().toISOString(),
  });
  store.recordHistory({
    format,
    asset: claim.asset,
    bias: claim.bias,
    angle: result.angle.thesis,
    hook: result.text.split("\n")[0].slice(0, 120),
  });

  console.log("\nPublished.");
  console.log(`  ID:   ${outcome.result?.id ?? "unavailable"}`);
  console.log(`  Link: ${outcome.result?.shareLink ?? "unavailable"}`);
  if (outcome.missingPostId) {
    console.log("  Note: gateway timed out before returning a link. The post is live — do not re-post.");
  }
  return 0;
}

/**
 * Verifies a draft against a freshly fetched brief.
 *
 * The gate a human — or a chat session standing in for the model — needs
 * before publishing by hand. It refetches deliberately: figures drift within
 * minutes, and a draft checked against a stale snapshot is not checked.
 */
async function cmdCheck([file], flags) {
  if (!file) throw new ValidationError("Usage: wte check <draft.txt>");

  const text = fs.readFileSync(file, "utf8");

  // The screen is a second fetch over 26 more pairs, so it is opt-in: a post
  // about the majors should not pay for it, and a post about the wider board
  // is unverifiable without it.
  // Funding history is fetched only for the instruments a draft actually cites.
  // The default pair covers the majors; a post about an alt's funding needs the
  // instrument named, exactly as an alt price figure needs --screen.
  const fundingInstIds = ["BTC-USDT-SWAP", "ETH-USDT-SWAP"];
  if (flags.funding) {
    for (const id of String(flags.funding).split(",").map((s) => s.trim()).filter(Boolean)) {
      const instId = id.includes("-") ? id.toUpperCase() : `${id.toUpperCase()}-USDT-SWAP`;
      if (!fundingInstIds.includes(instId)) fundingInstIds.push(instId);
    }
  }

  // Intraday figures need an intraday fetch. Daily candles cannot vouch for an
  // hourly table, and a post arguing from candle shape must have that evidence
  // checked like any other.
  const hourlySymbols = flags.hourly
    ? String(flags.hourly).split(",").map((s) => s.trim()).filter(Boolean).map(normalizeSymbol)
    : [];

  // Screening all 26 pairs takes over a minute, and on a fast-moving asset the
  // draft's figures drift past the 0.5% tolerance while the check is still
  // fetching — the gate failing on its own latency rather than on the writing.
  // Naming the symbols a post actually cites makes the check near-instant.
  const screenSymbols =
    typeof flags.screen === "string" && flags.screen !== "true"
      ? String(flags.screen).split(",").map((x) => x.trim()).filter(Boolean).map(normalizeSymbol)
      : ALT_UNIVERSE;

  const stageSymbols = flags.stage
    ? String(flags.stage).split(",").map((x) => x.trim()).filter(Boolean)
    : [];

  const [brief, screenResult, candleSets, stages] = await Promise.all([
    collectBrief({ newsHours: 24, fundingInstIds }),
    flags.screen
      ? screen(screenSymbols, { onProgress: (p) => process.stderr.write(`\rscreening ${p}   `) })
      : Promise.resolve(null),
    Promise.all(
      // Both resolutions: an intraday argument is almost always framed against
      // the daily series, and fetching one without the other leaves half the
      // post unverifiable.
      hourlySymbols.flatMap((sym) => [
        fetchKlines(sym, {
          interval: String(flags.interval ?? "1h"),
          // A long-horizon argument needs a long window in evidence. The default
          // covers an intraday table; --limit stretches it to whatever span the
          // post actually claims to have measured.
          limit: Math.min(1000, Math.max(1, Number(flags.limit ?? 200))),
        }).catch(() => []),
        fetchKlines(sym, { interval: "1d", limit: 120 }).catch(() => []),
      ]),
    ),
    Promise.all(stageSymbols.map((sym) => stageOf(sym).catch(() => null))),
  ]);
  // Kept as separate series so each window's own high, low and total move stay
  // attached to the window that produced them.
  const candles = candleSets.filter((s) => s.length);
  const stageRows = (stages ?? []).filter(Boolean);
  if (flags.screen) process.stderr.write("\r");

  if (!brief.spot.length) {
    throw new ValidationError("Could not fetch market data, so the draft cannot be checked.");
  }
  if (flags.screen && !screenResult?.rows.length) {
    throw new ValidationError("Could not screen the altcoin universe, so the draft cannot be checked.");
  }

  const format = flags.format ?? "positioning";
  const [, slotMax] = getFormat(format).words;

  // Long-form articles are a different shape from slot posts, and checking one
  // against a 240-word ceiling produces a failure on every single article. A
  // gate that always fails on a line you have decided to ignore is a gate you
  // stop reading, which is how a genuine failure gets published.
  const maxWords = flags["max-words"]
    ? Number(flags["max-words"])
    : flags.article
      ? ARTICLE_MAX_WORDS
      : slotMax + 20;
  if (!Number.isFinite(maxWords) || maxWords < 1) {
    throw new ValidationError("--max-words needs a positive number.");
  }

  const result = verifyPost(text, brief, {
    maxWords,
    minWords: 40,
    // Only a post that states no market view may skip the bias requirement.
    requireBias: !flags["no-call"],
    // Several snapshots at once: an audit quotes the claims it is testing from
    // one file and its own measurements from another, and conflating the two
    // would be exactly the error the audit exists to expose.
    study: flags.study
      ? String(flags.study).split(",").map((f) => JSON.parse(fs.readFileSync(f.trim(), "utf8")))
      : undefined,
    screen: screenResult ?? undefined,
    candles: candles.length ? candles : undefined,
    stages: stageRows.length ? stageRows : undefined,
  });

  if (flags.json) {
    print({ ...result, checkedAt: brief.generatedAt, screenedAt: screenResult?.screenedAt }, flags);
    return result.ok ? 0 : 1;
  }

  if (result.ok) {
    const against = screenResult
      ? `${brief.spot.length} majors + ${screenResult.rows.length} alt pairs`
      : `${brief.spot.length} majors`;
    console.log(
      `PASS — ${result.words} words, ${result.numbersChecked} figures traced to data fetched just now (${against}).`,
    );
    return 0;
  }
  console.log(`FAIL — ${result.words} words`);
  for (const p of result.problems) console.log(`  ✗ ${p}`);

  // A post about the wider board fails every alt figure at once against a
  // majors-only brief, which reads like a dozen fabrications rather than a
  // missing data source. Only say so when the draft actually cites a coin the
  // brief does not cover — on a majors post a failed figure means drift, and
  // pointing at --screen would send the reader down the wrong path.
  const majors = new Set(brief.spot.map((s) => s.symbol.replace(/USDT$/, "")));
  const offBrief = [...new Set([...text.matchAll(/\$([A-Z]{2,10})\b/g)].map((m) => m[1]))].filter(
    (t) => !majors.has(t),
  );
  if (!flags.screen && offBrief.length && result.problems.some((p) => p.startsWith("figure "))) {
    console.log(
      `\n${offBrief.join(", ")} ${offBrief.length === 1 ? "is" : "are"} outside the majors brief — re-run with --screen to trace those figures.`,
    );
  }
  return 1;
}

/** Screens the altcoin universe and surfaces the statistical outliers. */
async function cmdScreen(flags) {
  const symbols = flags.symbols
    ? String(flags.symbols).split(",").map((s) => s.trim().toUpperCase()).filter(Boolean)
    : ALT_UNIVERSE;

  const result = await screen(symbols, {
    onProgress: (p) => process.stderr.write(`\rscreening ${p}   `),
  });
  process.stderr.write("\r");

  const outliers = findOutliers(result.rows);
  if (flags.json) {
    console.log(JSON.stringify({ ...result, outliers }, null, 2));
    return result.rows.length ? 0 : 1;
  }
  console.log(formatScreen(result, outliers));
  return result.rows.length ? 0 : 1;
}

/**
 * Reports which stage of a move one or more assets are in.
 *
 * Separate from `screen`, which ranks a fixed universe on momentum. This asks a
 * different question — how far through a move an asset already is — and takes
 * arbitrary symbols, because the assets worth asking about are usually the ones
 * that just appeared on a screen rather than the ones in a fixed list.
 */
/**
 * One hourly scan. Prints the ranked table and records anything that fires.
 *
 * Logging happens even for a manual run: an alert we saw and did not act on is
 * exactly as informative, later, as one we did.
 */
async function cmdScan(flags) {
  const minZ = flags["min-z"] ? Number(flags["min-z"]) : DEFAULT_MIN_Z;
  const result = await scanIntraday({
    minVolume: flags["min-volume"] ? Number(flags["min-volume"]) : undefined,
    limit: flags.pairs ? Number(flags.pairs) : undefined,
    onProgress: (done, total) => process.stderr.write(`\rscanning ${done}/${total}   `),
  });
  process.stderr.write("\r");

  // The one scanner that never filtered removals, until IOTX printed z 172 on a
  // margin-delisting notice and led the board.
  const { fetchDelistings } = await import("./listings.mjs");
  const delistings = await fetchDelistings().catch(() => new Map());

  const fresh = new AlertLog().record(alertsFrom(result.rows, { minZ, delistings }), {
    cooldownHours: flags.cooldown ? Number(flags.cooldown) : undefined,
  });

  if (flags.json) {
    print({ ...result, alerts: fresh }, flags);
    return 0;
  }
  console.log(formatIntraday(result, { minZ, delistings, top: flags.top ? Number(flags.top) : undefined }));
  if (fresh.length) console.log(`\nNew since last scan: ${fresh.map((a) => a.symbol).join(", ")}`);
  return 0;
}

/**
 * The scan on a loop.
 *
 * The detector was never the problem. BICO cleared every threshold in pulse.mjs
 * on the day it moved and nothing happened, because `wte pulse` is a command
 * somebody has to remember to type. A signal nobody is listening for is not a
 * signal, so this is the half that was missing.
 */
async function cmdWatch(flags) {
  const minZ = flags["min-z"] ? Number(flags["min-z"]) : DEFAULT_MIN_Z;
  const everyMin = Math.max(1, Number(flags.every ?? 15));
  const log = new AlertLog();
  const controller = new AbortController();
  const stop = () => controller.abort();
  process.on("SIGINT", stop);
  process.on("SIGTERM", stop);

  console.log(
    `Watching every ${everyMin}m at volZ>=${minZ}, cooldown ${flags.cooldown ?? DEFAULT_COOLDOWN_HOURS}h. Ctrl-C to stop.`,
  );

  while (!controller.signal.aborted) {
    try {
      const result = await scanIntraday({
        minVolume: flags["min-volume"] ? Number(flags["min-volume"]) : undefined,
        limit: flags.pairs ? Number(flags.pairs) : undefined,
      });
      const fresh = log.record(alertsFrom(result.rows, { minZ }), {
        cooldownHours: flags.cooldown ? Number(flags.cooldown) : undefined,
      });
      const stamp = new Date().toISOString().slice(11, 16);
      if (fresh.length) {
        for (const a of fresh) {
          console.log(
            `${stamp}  ALERT  ${a.symbol.replace(/USDT$/, "").padEnd(10)} volZ ${a.volumeZScore.toFixed(1)}` +
              `  1h ${a.change1hPct >= 0 ? "+" : ""}${a.change1hPct.toFixed(2)}%  at ${a.price}`,
          );
        }
      } else {
        console.log(`${stamp}  ${result.rows.length} pairs, nothing above ${minZ} sigma`);
      }
    } catch (err) {
      // A failed scan is a missed hour, not a dead watcher.
      console.error(`${new Date().toISOString().slice(11, 16)}  scan failed: ${err.message}`);
    }
    if (flags.once) break;
    await new Promise((resolve) => {
      const timer = setTimeout(resolve, everyMin * 60_000);
      controller.signal.addEventListener("abort", () => { clearTimeout(timer); resolve(); }, { once: true });
    });
  }
  return 0;
}

/** The daily gainer sweep the big accounts run by hand. */
async function cmdSides(flags) {
  const result = await scanSides({
    minScore: flags["min-score"] ? Number(flags["min-score"]) : undefined,
    perSide: flags["per-side"] ? Number(flags["per-side"]) : undefined,
    minVolume: flags["min-volume"] ? Number(flags["min-volume"]) : undefined,
    onProgress: (d, t) => process.stderr.write(`\rscanning ${d}/${t}   `),
  });
  process.stderr.write("\r");
  if (flags.json) { print(result, flags); return 0; }
  console.log(formatSides(result));
  return 0;
}

async function cmdPbbe(flags) {
  const result = await pbbeScan({
    zWindow: flags["z-window"] === "7" ? 7 : 30,
    maxFromBase: flags["max-from-base"] ? Number(flags["max-from-base"]) : undefined,
    minVolumeZ: flags["min-volume-z"] ? Number(flags["min-volume-z"]) : undefined,
    minTurnover: flags["min-volume"] ? Number(flags["min-volume"]) : undefined,
    maxCandidates: flags["max-candidates"] ? Number(flags["max-candidates"]) : undefined,
    onProgress: (d, t) => process.stderr.write(`\rscanning ${d}/${t}   `),
  });
  process.stderr.write("\r");

  if (flags.json) {
    print(result, flags);
    return 0;
  }
  console.log(flags.md ? markdownReport(result) : formatScan(result));
  return 0;
}

async function cmdMovers(flags) {
  const minScore = flags["min-score"] ? Number(flags["min-score"]) : 3;
  const result = await sweep({
    minVolume: flags["min-volume"] ? Number(flags["min-volume"]) : undefined,
    minScore,
    onProgress: (d, t) => process.stderr.write(`\rsweeping ${d}/${t}   `),
  });
  process.stderr.write("\r");

  if (flags.json) {
    print(result, flags);
    return 0;
  }
  console.log(formatSweep(result, { minScore }));

  // A qualified name is only useful with a plan attached, so --cards closes
  // the loop the hand-run workflow closes by opening TradingView.
  if (flags.cards && result.qualified.length) {
    const { analyzeAsset } = await import("./analysis.mjs");
    for (const row of result.qualified.slice(0, 3)) {
      const [a, tiers] = await Promise.all([
        analyzeAsset(row.symbol),
        fetchPositionTiers(`${row.asset}-USDT`).catch(() => []),
      ]);
      const card = buildCard({ symbol: row.symbol, price: a.price, atrPct: a.atrPct, tiers });
      console.log("\n" + formatCard(card, { note: `Passed: ${row.passed.join(", ")}` }));
    }
  }
  return 0;
}

/** The whole plan on one screen, with every level derived from the asset's own ATR. */
async function cmdCard([sym], flags) {
  if (!sym) throw new ValidationError("Name a symbol, e.g. `wte card BTC`.");
  const symbol = normalizeSymbol(sym);
  const family = `${symbol.replace(/USDT$/, "")}-USDT`;

  const { analyzeAsset } = await import("./analysis.mjs");
  const [a, tiers] = await Promise.all([
    analyzeAsset(symbol),
    fetchPositionTiers(family).catch(() => []),
  ]);

  const card = buildCard({
    symbol,
    price: a.price,
    atrPct: a.atrPct,
    tiers,
    side: flags.short ? "short" : "long",
    stopAtr: flags["stop-atr"] ? Number(flags["stop-atr"]) : undefined,
    riskPct: flags.risk ? Number(flags.risk) : undefined,
    accountUsd: flags.account ? Number(flags.account) : undefined,
  });

  if (flags.json) {
    print(card, flags);
    return 0;
  }
  console.log(formatCard(card));
  return 0;
}

/**
 * Liquidation levels: the exact arithmetic, and the modelled clusters, kept apart.
 */
async function cmdLiq([sym], flags) {
  if (!sym) throw new ValidationError("Name a symbol, e.g. `wte liq BTC`.");
  const symbol = normalizeSymbol(sym);
  const family = `${symbol.replace(/USDT$/, "")}-USDT`;
  const hours = Math.max(24, Number(flags.hours ?? 96));

  const [tiers, candles] = await Promise.all([
    fetchPositionTiers(family),
    fetchKlines(symbol, { interval: "1h", limit: hours + 1 }),
  ]);
  const price = candles.at(-1).close;
  const bands = bandsFor(price, tiers);
  const clusters = clusterMap(candles.slice(0, -1), tiers, { price });

  if (flags.json) {
    print({ symbol, price, tiers: tiers.length, bands, clusters }, flags);
    return 0;
  }
  console.log(formatLiquidation({ symbol, price, bands, clusters }));
  return 0;
}

/** Taker imbalance, and whether the price it produced agrees with it. */
async function cmdFlow([sym], flags) {
  if (!sym) throw new ValidationError("Name a symbol, e.g. `wte flow BTC`.");
  const symbol = normalizeSymbol(sym);
  const minutes = Math.max(1, Number(flags.minutes ?? 60));
  const [flow, candles] = await Promise.all([
    takerFlow(symbol, { minutes }),
    fetchKlines(symbol, { interval: "1h", limit: 3 }).catch(() => []),
  ]);
  // The move the flow actually produced, over roughly the same window.
  const live = candles.at(-1);
  const changePct = live?.open ? (live.close / live.open - 1) * 100 : NaN;

  if (flags.json) {
    print({ ...flow, changePct }, flags);
    return 0;
  }
  console.log(formatFlow(flow, changePct));
  return 0;
}

/** The US market, and how tightly BTC is actually tied to it. */
async function cmdMacro(flags) {
  const { fetchKlines } = await import("./analysis.mjs");
  const [macro, daily] = await Promise.all([
    fetchMacro(),
    fetchKlines("BTCUSDT", { interval: "1d", limit: 400 }).catch(() => []),
  ]);
  if (!macro) throw new ValidationError("Could not reach the macro series.");

  // Binance stamps a daily candle at 00:00 UTC; the date is what joins it to a
  // US session close, not the timestamp.
  const btcRows = daily.map((c) => ({
    date: new Date(c.openTime).toISOString().slice(0, 10),
    close: c.close,
  }));
  const correlations = {};
  for (const m of Object.values(macro)) {
    correlations[m.label] = correlationOnDates(btcRows, m.rows);
  }

  if (flags.json) {
    print({ macro, correlations }, flags);
    return 0;
  }
  console.log(formatMacro(macro, { correlations }));
  return 0;
}

/** On-chain valuation, never as a bare number. */
async function cmdOnchain(flags) {
  const { analyzeAsset } = await import("./analysis.mjs");
  const [onchain, a] = await Promise.all([
    fetchOnchain(),
    analyzeAsset("BTCUSDT").catch(() => null),
  ]);
  if (flags.json) {
    print(onchain, flags);
    return 0;
  }
  console.log(formatOnchain(onchain, { price: a?.price }));
  return 0;
}

/** The board an alert lands on: breadth, concentration, positioning, crowd. */
async function cmdContext(flags) {
  const ctx = await marketContext();
  if (flags.json) {
    print(ctx, flags);
    return 0;
  }
  console.log(formatContext(ctx));
  return 0;
}

/** Scores the alerts we actually raised, which is the only test that is not a backtest. */
async function cmdAlerts(flags) {
  const result = await scoreAlerts({ limit: flags.limit ? Number(flags.limit) : undefined });
  if (flags.json) {
    print(result, flags);
    return 0;
  }
  console.log(formatAlertScore(result));
  return 0;
}

async function cmdStage(args, flags) {
  const symbols = args
    .flatMap((a) => String(a).split(","))
    .map((s) => s.trim())
    .filter(Boolean);

  if (!symbols.length) {
    throw new ValidationError("Usage: wte stage <SYMBOL> [SYMBOL...] [--days <n>]");
  }

  const days = flags.days ? Number(flags.days) : DEFAULT_DAYS;
  if (!Number.isFinite(days) || days < 8) {
    throw new ValidationError(`--days must be a number of at least 8 (got "${flags.days}").`);
  }

  const rows = [];
  const failed = [];
  for (const symbol of symbols) {
    try {
      rows.push(await stageOf(symbol, { days }));
    } catch (err) {
      failed.push({ symbol, reason: err.message });
    }
  }

  if (flags.json) {
    print({ rows, failed, days }, flags);
    return rows.length ? 0 : 1;
  }

  if (rows.length) console.log(formatStage(rows, { days }));
  for (const f of failed) console.error(`  ✗ ${f.symbol}: ${f.reason}`);
  return rows.length ? 0 : 1;
}

/**
 * Builds the static research site from the drafts that were actually published.
 *
 * Square posts cannot be crawled or cited, so the same text is mirrored to
 * pages the account owns. Reading the published draft rather than a separate
 * copy is what stops the two from drifting apart.
 */
async function cmdSite(flags) {
  const root = process.cwd();
  const manifestPath = path.join(root, "site", "manifest.json");
  if (!fs.existsSync(manifestPath)) {
    throw new ValidationError(`No manifest at ${manifestPath}.`);
  }

  const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
  const drafts = {};
  for (const a of manifest.articles) {
    const file = path.join(root, "drafts", a.draft);
    if (!fs.existsSync(file)) throw new ValidationError(`Draft not found: ${file}`);
    drafts[a.draft] = fs.readFileSync(file, "utf8");
  }

  const files = buildSite(manifest, drafts);
  const out = path.resolve(root, flags.out ?? "site/dist");
  fs.rmSync(out, { recursive: true, force: true });

  for (const f of files) {
    const dest = path.join(out, f.path);
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    fs.writeFileSync(dest, f.content);
  }

  if (flags.json) {
    print({ out, files: files.length }, flags);
    return 0;
  }
  console.log(`Built ${files.length} files into ${out}`);
  for (const f of files) console.log(`  ${f.path}`);
  return 0;
}

/**
 * Locates a headless Chromium for cover rendering.
 *
 * Square requires a raster cover on every article. Hand-making one per post is
 * exactly the daily friction this command exists to remove, so the card is
 * generated from the title unless one is supplied.
 */
function findChrome() {
  const candidates = [
    process.env.CHROME_PATH,
    "/opt/pw-browsers/chromium-1194/chrome-linux/chrome",
    "/usr/bin/chromium",
    "/usr/bin/google-chrome",
  ].filter(Boolean);
  return candidates.find((p) => fs.existsSync(p)) ?? null;
}

/** Renders the site's own SVG card to a PNG Square will accept. */
function generateCover(site, title) {
  const chrome = findChrome();
  if (!chrome) {
    throw new ValidationError(
      "No cover supplied and no headless Chromium found to generate one. " +
        "Pass --cover <image.png>, or set CHROME_PATH.",
    );
  }

  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "wte-cover-"));
  const svg = renderCoverSvg(site, { title, assets: [] });
  const html = path.join(dir, "cover.html");
  const png = path.join(dir, "cover.png");
  fs.writeFileSync(
    html,
    `<!doctype html><meta charset="utf-8"><style>html,body{margin:0;width:1200px;height:630px;overflow:hidden}</style>${svg}`,
  );

  execFileSync(chrome, [
    "--headless=new", "--no-sandbox", "--disable-gpu", "--hide-scrollbars",
    "--force-device-scale-factor=1", "--window-size=1200,630",
    `--screenshot=${png}`, html,
  ], { stdio: "ignore" });

  if (!fs.existsSync(png)) throw new ValidationError("Cover generation produced no image.");
  return png;
}

/**
 * Draft to live in one command.
 *
 * Publishing used to be five steps, and the one that got skipped was always
 * updating the site manifest — which left the web archive quietly behind the
 * feed. Ordering matters here: Square first, because that is the irreversible
 * step, then the repository, so a git failure never leaves a post published
 * with no record of it.
 */
async function cmdShip([file], flags, argv) {
  if (!file) throw new ValidationError("Usage: wte ship <draft.txt> --title <title> [--cover <image>]");
  if (!flags.title) throw new ValidationError("An article needs --title.");

  const root = process.cwd();
  const draftPath = path.resolve(root, file);
  if (!fs.existsSync(draftPath)) throw new ValidationError(`Draft not found: ${draftPath}`);

  const text = fs.readFileSync(draftPath, "utf8");
  const draftName = path.basename(draftPath);
  const slug = flags.slug ?? slugFromDraft(draftName);

  const manifestPath = path.join(root, "site", "manifest.json");
  const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));

  const entry = {
    slug,
    draft: draftName,
    title: String(flags.title),
    description: flags.description ? String(flags.description) : descriptionFromText(text),
    assets: flags.assets ? String(flags.assets).split(",").map((a) => a.trim().toUpperCase()) : assetsFromText(text),
    topics: flags.topics ? String(flags.topics).split(",").map((t) => t.trim()) : [],
  };

  // Validate the manifest change before publishing: a duplicate slug should
  // stop the run while it is still reversible, not after the post is live.
  addArticle(manifest, { ...entry, published: new Date().toISOString() });

  const cover = flags.cover ?? generateCover(manifest.site, entry.title);
  if (!flags.cover) console.log(`  Cover generated from the title`);

  const spec = normalizePost({
    type: POST_TYPE.ARTICLE,
    text,
    title: entry.title,
    cover,
  });

  if (flags["dry-run"]) {
    console.log("Dry run — nothing published, nothing committed.");
    console.log(JSON.stringify({ entry, words: text.trim().split(/\s+/).length }, null, 2));
    return 0;
  }

  const store = new Store();
  const budget = store.checkBudget(uploadCount(spec));
  if (!budget.ok) throw new ValidationError(`Refusing to publish: ${budget.reason}.`);

  const outcome = await publishSpec(new SquareClient({ apiKey: resolveApiKey(argv) }), spec, {
    onProgress: (msg) => console.log(`  ${msg}`),
  });
  store.recordUsage({ posts: 1, uploads: outcome.uploadsUsed });

  const squareId = outcome.result?.id ?? null;
  console.log(`\nPublished to Square.`);
  console.log(`  ID:   ${squareId ?? "unavailable"}`);
  console.log(`  Link: ${outcome.result?.shareLink ?? "unavailable"}`);

  const next = addArticle(manifest, { ...entry, squareId, published: new Date().toISOString() });
  fs.writeFileSync(manifestPath, `${JSON.stringify(next, null, 2)}\n`);
  console.log(`  Site: /${slug}/ added to the manifest`);

  /**
   * Log what the article committed to, exactly as the slot-post path does.
   *
   * This was missing, and the cost was invisible until someone asked for a
   * scoreboard: every article published through `ship` cleared the gate,
   * reached Square, reached the site — and never entered the track record. The
   * channel's whole differentiator is scoring its own calls in public, and it
   * was quietly scoring none of them.
   *
   * A brief is fetched here rather than reused because ship does not take one:
   * the claim needs the price at publication to be scoreable at all, and a
   * claim without it is a row the scoreboard has to skip. If the fetch fails
   * the post still stands — losing the record is bad, refusing to record the
   * publication that already happened is worse.
   */
  try {
    const brief = await collectBrief({ newsHours: 24 });
    const claim = extractClaim(text, brief);
    const publishedAt = new Date().toISOString();
    store.recordClaim({
      ...claim,
      postId: squareId ?? `unlinked-${Date.now()}`,
      shareLink: outcome.result?.shareLink ?? null,
      format: "article",
      publishedAt,
    });
    store.recordHistory({
      format: "article",
      asset: claim.asset,
      bias: claim.bias,
      angle: entry.title,
      hook: text.split("\n")[0].slice(0, 120),
      publishedAt,
    });
    console.log(`  Call: ${claim.asset ?? "no asset"} / ${claim.bias ?? "no bias"} logged for scoring`);
  } catch (err) {
    console.error(`  Call: NOT logged (${err.message.trim()}) — score this one by hand.`);
  }

  if (flags["no-push"]) {
    console.log("\n--no-push set: commit and push yourself to deploy.");
    return 0;
  }

  // Stage only what this command touched, so an unrelated work-in-progress
  // file is never swept into a deploy.
  const git = (...args) => execFileSync("git", args, { cwd: root, encoding: "utf8" });
  let branch;
  let sha;
  try {
    git("add", "--", path.relative(root, draftPath), "site/manifest.json");
    git("commit", "-m", `Publish: ${entry.title}\n\nSquare post ${squareId ?? "(id unavailable)"}.`);
    branch = git("rev-parse", "--abbrev-ref", "HEAD").trim();
    sha = git("rev-parse", "HEAD").trim();
    git("push", "-u", "origin", branch);
    console.log(`  Git:  pushed to ${branch}`);
  } catch (err) {
    console.error(`\nPublished, but git failed: ${err.message.trim()}`);
    console.error("The post is live. Commit and push when convenient; nothing is lost.");
    return 1;
  }

  await confirmDeployed(sha);
  return 0;
}

/**
 * Waits for the build the push already started.
 *
 * The push is the deploy — www.maix8.study follows this branch — so there is
 * nothing to trigger. What this adds is knowing it went green, because
 * publishing to Square and walking away from a failed build is how the site
 * fell days behind the feed, and from the shell the two look identical.
 *
 * A missing token costs the confirmation, not the deploy. It is not an error.
 */
async function confirmDeployed(sha) {
  const config = deployConfigFromEnv();
  if (!config) {
    console.log("  Site: pushed — Vercel builds it automatically. No VERCEL_TOKEN, so not waiting to confirm.");
    return;
  }

  try {
    console.log("  Site: waiting for the build Vercel started");
    const final = await waitForCommitDeploy(config, sha, {
      onState: (s) => console.log(`        ${s.readyState.toLowerCase()}`),
    });

    if (final.readyState === "READY") console.log("  Site: live at https://maix8.study/");
    else if (final.readyState === "TIMEOUT") console.log("  Site: still building — it will finish on its own");
    else if (final.readyState === "NOT_FOUND") {
      console.error("  Site: Vercel never started a build for this commit — check the Git integration");
    } else console.error(`  Site: build ${final.readyState.toLowerCase()} — check the Vercel dashboard`);
  } catch (err) {
    // The post and the commit are already safe, and the build runs whether or
    // not this check succeeds, so a failure here is about visibility only.
    console.error(`  Site: could not confirm the build — ${err.message}`);
    console.error("        The post is live and the commit is pushed; the build is running regardless.");
  }
}

/**
 * Rebuilds the current commit without publishing anything.
 *
 * For changes that alter the rendered site but carry no post — a template edit,
 * a refreshed lesson snapshot — where there is no push to ride on.
 */
async function cmdDeploy(flags) {
  const config = deployConfigFromEnv();
  if (!config) {
    throw new ValidationError(
      "No VERCEL_TOKEN in the environment. Create one at vercel.com/account/tokens " +
        "and export it before running this. A plain `git push` also deploys.",
    );
  }

  const git = (...args) => execFileSync("git", args, { cwd: process.cwd(), encoding: "utf8" }).trim();
  const ref = flags.ref ? String(flags.ref) : git("rev-parse", "--abbrev-ref", "HEAD");
  const sha = flags.sha ? String(flags.sha) : git("rev-parse", "HEAD");

  console.log(`Deploying ${ref} @ ${sha.slice(0, 7)}`);
  const created = await createDeploy(config, { ref, sha });
  console.log(`  queued ${created.id}`);
  const final = await waitForDeploy(config, created.id, {
    onState: (s) => console.log(`  ${s.readyState.toLowerCase()}`),
  });

  if (flags.json) {
    print(final, flags);
    return final.readyState === "READY" ? 0 : 1;
  }

  if (final.readyState === "READY") {
    console.log("\nLive at https://maix8.study/");
    return 0;
  }
  console.error(`\nDeploy ${final.readyState.toLowerCase()}.`);
  return 1;
}

/** Prints the daily schedule and ready-to-paste crontab lines. */
async function cmdSlots(flags) {
  if (flags.json) {
    console.log(JSON.stringify(FORMATS, null, 2));
    return 0;
  }

  console.log("Daily slots (UTC; Vietnam = UTC+7)\n");
  for (const [name, f] of Object.entries(FORMATS)) {
    console.log(`  ${name.padEnd(12)} ${f.slot.padEnd(10)} ${f.label} (${f.words[0]}-${f.words[1]} words)`);
  }
  console.log("\nCrontab:\n");
  for (const line of crontabLines(process.cwd(), process.execPath)) console.log(`  ${line}`);
  console.log(`\n  0 9 * * 1 cd ${process.cwd()} && ${process.execPath} bin/wte.mjs score >> wte.log 2>&1`);
  return 0;
}

/**
 * Scans the whole venue for the day's actual event.
 *
 * The fixed 26-pair screen is the right tool for research and the wrong one for
 * relevance: the highest-reach posts on the large Square accounts were about a
 * pair that screen has never covered. This looks where the move is.
 */
async function cmdPulse(flags) {
  const result = await pulse({
    minVolume: flags["min-volume"] ? Number(flags["min-volume"]) : undefined,
    limit: flags.top ? Number(flags.top) : undefined,
  });
  if (flags.json) {
    print(result, flags);
    return 0;
  }
  console.log(formatPulse(result));
  return 0;
}

/** Turns CLI flags into a validated post spec. */
function specFromFlags(type, flags) {
  if (!type) {
    throw new ValidationError(`Specify a post type: ${Object.values(POST_TYPE).join(", ")}.`);
  }

  const input = {
    type,
    text: flags.text,
    title: flags.title,
    images: flags.images,
    cover: flags.cover,
    video: flags.video,
    durationSeconds: flags.duration,
  };

  // A duration we can read off the file is one less thing to get wrong.
  if (type === POST_TYPE.VIDEO && !input.durationSeconds && flags.video) {
    input.durationSeconds = probeDurationSeconds(flags.video);
  }

  return normalizePost(input);
}

function resolveSchedule(flags) {
  if (flags.at && flags.in) throw new ValidationError("Use either --at or --in, not both.");
  if (flags.at) {
    const when = new Date(flags.at);
    if (Number.isNaN(when.getTime())) {
      throw new ValidationError(`Could not parse --at "${flags.at}". Use an ISO timestamp.`);
    }
    return when.toISOString();
  }
  if (flags.in) return new Date(Date.now() + parseDuration(flags.in)).toISOString();
  return new Date().toISOString();
}

export function parseDuration(value) {
  const match = /^(\d+(?:\.\d+)?)\s*(s|m|h|d)$/i.exec(String(value).trim());
  if (!match) {
    throw new ValidationError(`Could not parse duration "${value}". Use forms like 30s, 45m, 2h, 3d.`);
  }
  const scale = { s: 1000, m: 60_000, h: 3_600_000, d: 86_400_000 }[match[2].toLowerCase()];
  return Number(match[1]) * scale;
}

/**
 * Minimal flag parser: `--flag value` for anything that takes an argument,
 * `--flag` alone for booleans.
 */
export function parseFlags(argv) {
  const flags = { _: [] };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (!arg.startsWith("--")) {
      flags._.push(arg);
      continue;
    }
    const name = arg.slice(2);
    const next = argv[i + 1];
    if (next === undefined || next.startsWith("--")) {
      flags[name] = true;
    } else {
      flags[name] = next;
      i++;
    }
  }
  return flags;
}

function readStdin() {
  return new Promise((resolve) => {
    if (process.stdin.isTTY) {
      resolve("");
      return;
    }
    let data = "";
    process.stdin.setEncoding("utf8");
    process.stdin.on("data", (chunk) => (data += chunk));
    process.stdin.on("end", () => resolve(data));
  });
}

function print(payload, flags) {
  console.log(flags.json ? JSON.stringify(payload, null, 2) : payload);
}

function truncate(value, max) {
  const s = String(value).replace(/\s+/g, " ");
  return s.length > max ? `${s.slice(0, max - 1)}…` : s;
}
