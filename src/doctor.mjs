/**
 * Self-check for the parts of this system that fail without saying anything.
 *
 * Every serious fault found in this codebase has been silent. `ship` published
 * articles and recorded no claim, so the track record stayed empty and nothing
 * complained. The scoreboard scored every levelless WAIT as correct, so it
 * reported 100% and looked like success. The settlement window reached back
 * eight days, so older calls became unscoreable and simply vanished from the
 * tally. A render step and a publish step were once joined with a newline
 * instead of `&&`, and the post went out anyway.
 *
 * None of those were caught by a test, because each one is a property of how
 * the pieces are wired rather than of any single function. This is the check
 * that asks the wiring questions directly, and it is meant to be run before a
 * publishing session rather than after a mystery.
 *
 * A check that can only pass is worth nothing, which is the whole lesson here:
 * the scoreboard check below deliberately proves a call *can* be marked wrong.
 */

import fs from "node:fs";
import path from "node:path";
import { BIAS_PATTERNS } from "./verify.mjs";
import { BIAS, scoreClaim } from "./scoreboard.mjs";
import { Store } from "./store.mjs";
import { PALETTE, deltaE } from "./palette.mjs";
import { pct } from "./format.mjs";
import { isEnglish, nonEnglishLines } from "./lang.mjs";
import { renderSignalsPage } from "./site.mjs";

const ok = (name, detail = "") => ({ name, status: "ok", detail });
const warn = (name, detail) => ({ name, status: "warn", detail });
const fail = (name, detail) => ({ name, status: "fail", detail });

/**
 * Can the scoreboard ever mark a call wrong?
 *
 * Run against a synthetic pair that sits still for sixty hours and then moves
 * twenty percent. A WAIT published at that moment has to score false. When this
 * check regressed, the board reported a perfect record and there was no other
 * signal that anything was broken.
 */
async function checkScoreboardCanFail() {
  const publishedAt = Date.parse("2026-01-02T00:00:00Z");
  const hour = 3_600_000;
  const candles = [];
  for (let i = -80; i < 24; i++) {
    const close = i < 0 ? 100 : 100 + (i + 1) * 0.8;
    candles.push([publishedAt + i * hour, close, close * 1.001, close * 0.999, close, 0, 0, 0, 0, 0, 0]);
  }
  const fetchImpl = async () => ({ ok: true, json: async () => candles });

  const score = await scoreClaim(
    {
      asset: "DOCTORUSDT", bias: BIAS.WAIT, priceAtPost: 100,
      publishedAt: new Date(publishedAt).toISOString(), support: null, resistance: null,
    },
    { hours: 24, fetchImpl },
  );

  if (!score) return fail("scoreboard can fail a call", "a large move left the call unscoreable");
  if (score.biasCorrect !== false) {
    return fail(
      "scoreboard can fail a call",
      `a WAIT through a ${score.movePct.toFixed(1)}% move scored ${score.biasCorrect} — the board cannot report a miss`,
    );
  }
  return ok("scoreboard can fail a call", `a ${score.movePct.toFixed(1)}% move scores as a miss`);
}

/**
 * Does every published article carry a claim?
 *
 * The manifest is the record of what went out; the claim store is the record of
 * what was promised. A gap between them means posts are reaching readers and
 * never reaching the track record — exactly what `ship` did for its whole life.
 */
function checkEveryArticleHasClaim(root, store) {
  const manifestPath = path.join(root, "site", "manifest.json");
  if (!fs.existsSync(manifestPath)) return warn("published articles are all logged", "no manifest");
  const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
  const articles = manifest.articles ?? manifest;

  const claimIds = new Set(store.listClaims().map((c) => String(c.postId)));
  const claimedSlugs = new Set(
    store.listClaims().map((c) => String(c.postId).replace(/^backfill-/, "")),
  );
  const unlogged = articles.filter(
    (a) => !claimIds.has(String(a.squareId)) && !claimedSlugs.has(a.slug),
  );

  /**
   * An article with no stated bias is correctly absent from the record.
   *
   * A post that says "this is a subtraction, not a market view" has nothing to
   * score, and counting it as a gap would train the reader of this report to
   * ignore the line. Only a post that made a call and never entered the board
   * is a real omission.
   */
  const statesABias = (a) => {
    const file = path.join(root, "drafts", a.draft);
    if (!fs.existsSync(file)) return false;
    const text = fs.readFileSync(file, "utf8");
    return BIAS_PATTERNS.LONG.test(text) || BIAS_PATTERNS.SHORT.test(text)
      || BIAS_PATTERNS.WAIT.test(text);
  };

  const missing = unlogged.filter(statesABias);
  const deliberate = unlogged.length - missing.length;
  const suffix = deliberate ? `; ${deliberate} correctly unlogged (no bias stated)` : "";

  if (!missing.length) {
    return ok("published articles are all logged", `${articles.length} article(s)${suffix}`);
  }
  return warn(
    "published articles are all logged",
    `${missing.length} of ${articles.length} made a call and never entered the board: `
      + `${missing.slice(0, 3).map((a) => a.slug).join(", ")}${missing.length > 3 ? "…" : ""}${suffix}`,
  );
}

/** Claims past their settlement window that were never judged. */
function checkNoStaleClaims(store, { hours = 24 } = {}) {
  const pending = store.listClaims({ scored: false });
  const overdue = pending.filter(
    (c) => Date.parse(c.publishedAt) + hours * 3_600_000 < Date.now() - 6 * 3_600_000,
  );
  if (!overdue.length) return ok("no calls stuck unsettled", `${pending.length} still within the window`);
  return warn(
    "no calls stuck unsettled",
    `${overdue.length} call(s) past the deadline and unjudged — run \`wte score\``,
  );
}

/**
 * Does every bias the gate admits also parse in the scoreboard?
 *
 * These lists were once written out twice and had already drifted: the gate
 * accepted a lower-case bias the scoreboard would not match, so a post could
 * publish and then be unscoreable. They share a module now, and this check is
 * what keeps that true.
 */
function checkBiasVocabularyShared() {
  const samples = {
    [BIAS.WAIT]: ["Bias: WAIT.", "Quan điểm: CHỜ."],
    [BIAS.LONG]: ["Bias: selective long.", "Quan điểm: long chọn lọc."],
    [BIAS.SHORT]: ["Bias: selective short.", "Quan điểm: short chọn lọc."],
  };
  const broken = [];
  for (const [expected, texts] of Object.entries(samples)) {
    for (const text of texts) {
      const seen = BIAS_PATTERNS.LONG.test(text) ? BIAS.LONG
        : BIAS_PATTERNS.SHORT.test(text) ? BIAS.SHORT
          : BIAS_PATTERNS.WAIT.test(text) ? BIAS.WAIT : null;
      if (seen !== expected) broken.push(`${JSON.stringify(text)} read as ${seen}`);
    }
  }
  if (broken.length) return fail("bias vocabulary is shared", broken.join("; "));
  return ok("bias vocabulary is shared", "both languages, all three biases");
}

/** The card palette, re-derived rather than remembered. */
function checkPaletteSeparable() {
  const marks = [PALETTE.primary, PALETTE.secondary, PALETTE.muted];
  let worst = { d: Infinity, label: "" };
  for (const vision of ["normal", "protan", "deutan", "tritan"]) {
    for (let i = 0; i < marks.length; i++) {
      for (let j = i + 1; j < marks.length; j++) {
        const d = deltaE(marks[i], marks[j], vision);
        if (d < worst.d) worst = { d, label: `${marks[i]}/${marks[j]} under ${vision}` };
      }
    }
  }
  if (worst.d < 8) return fail("card palette stays separable", `${worst.label} is ${worst.d.toFixed(1)}`);
  return ok("card palette stays separable", `worst pair ${worst.d.toFixed(1)} (${worst.label})`);
}

/** Rounding that the gate would reject on its way back in. */
function checkFormatterSurvivesGate() {
  const TOLERANCE = 0.005;
  for (const v of [0.004, 0.5, 3.56, 6.25, 9.99, 47.3, 92.5]) {
    const printed = Number(pct(v));
    const scale = Math.max(Math.abs(v), Math.abs(printed), 1);
    if (Math.abs(printed - v) / scale > TOLERANCE) {
      return fail("formatter rounds within the gate", `${v} printed as ${pct(v)}`);
    }
  }
  return ok("formatter rounds within the gate", "small values keep their digits");
}

/** Drafts the site claims to serve that are not on disk. */
function checkDraftsPresent(root) {
  const manifestPath = path.join(root, "site", "manifest.json");
  if (!fs.existsSync(manifestPath)) return warn("every article's draft is on disk", "no manifest");
  const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
  const articles = manifest.articles ?? manifest;
  const missing = articles.filter((a) => !fs.existsSync(path.join(root, "drafts", a.draft)));
  if (!missing.length) return ok("every article's draft is on disk", `${articles.length} checked`);
  return fail(
    "every article's draft is on disk",
    `${missing.length} missing: ${missing.slice(0, 3).map((a) => a.draft).join(", ")}`,
  );
}

/**
 * Is everything this channel publishes in English?
 *
 * Split into two findings on purpose. The page furniture — the signal board's
 * own labels, filters and headings — is generated by this codebase and must be
 * English now, so it fails. The article archive is the published record: it
 * cannot be silently rewritten, so it reports instead of failing, and the count
 * stands there until someone decides what to do about it.
 */
function checkPublishedLanguage(root) {
  const drafts = path.join(root, "drafts");
  if (!fs.existsSync(drafts)) return warn("everything published is English", "no drafts directory");

  const offenders = fs.readdirSync(drafts)
    .filter((f) => f.endsWith(".txt"))
    .filter((f) => !isEnglish(fs.readFileSync(path.join(drafts, f), "utf8")));

  if (!offenders.length) return ok("everything published is English", "every draft checked");
  return warn(
    "everything published is English",
    `${offenders.length} draft(s) are not, e.g. ${offenders.slice(0, 3).join(", ")}`
    + " — already published, so the gate blocks new ones rather than rewriting these",
  );
}

/** The board's own labels, which this codebase generates and can fix outright. */
function checkBoardLanguage() {
  const html = renderSignalsPage(
    { name: "MAIX8 Research", tagline: "", baseUrl: "https://maix8.study", locale: "en" },
    { scannedAt: "2026-01-01T00:00:00.000Z", method: { recentWindowDays: 180 }, tally: {}, signals: [] },
  );
  const hits = nonEnglishLines(html);
  if (!hits.length) return ok("the signal board speaks English", "labels, filters and headings");
  return fail("the signal board speaks English", `line ${hits[0].line}: ${hits[0].text.slice(0, 60)}`);
}

/** Runs every check. Returns the rows plus a worst-status summary. */
export async function runDoctor({ root = process.cwd(), store = new Store() } = {}) {
  const checks = [
    await checkScoreboardCanFail(),
    checkBiasVocabularyShared(),
    checkEveryArticleHasClaim(root, store),
    checkNoStaleClaims(store),
    checkPaletteSeparable(),
    checkFormatterSurvivesGate(),
    checkDraftsPresent(root),
    checkBoardLanguage(),
    checkPublishedLanguage(root),
  ];
  const worst = checks.some((c) => c.status === "fail")
    ? "fail"
    : checks.some((c) => c.status === "warn") ? "warn" : "ok";
  return { checks, worst };
}

export function formatDoctor({ checks, worst }) {
  const mark = { ok: "✅", warn: "⚠️ ", fail: "❌" };
  const lines = ["🩺 SELF-CHECK", ""];
  for (const c of checks) {
    lines.push(`${mark[c.status]} ${c.name}${c.detail ? ` — ${c.detail}` : ""}`);
  }
  lines.push("");
  lines.push(
    worst === "ok" ? "Everything the wiring can answer for is wired."
      : worst === "warn" ? "Nothing is broken, but something is drifting."
        : "A check failed. Do not publish until it is green.",
  );
  return lines.join("\n");
}
