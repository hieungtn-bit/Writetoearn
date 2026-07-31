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
