/**
 * Exports the public track record, so the site can be checked rather than trusted.
 *
 * A trader deciding whether to act on anything published here has three fair
 * questions, and until now none of them could be answered from the website:
 *
 *   what have you called, and were you right
 *   what is the strategy behind the calls actually worth
 *   where are the numbers you used
 *
 * The first two live in local state — the claim store the publisher writes to,
 * and research/self-backtest.json — and neither has ever been served. So this
 * flattens both into site/record.json for the build to render, and copies every
 * research snapshot into the site so each figure in every post can be traced to
 * the file that produced it.
 *
 * Two rules for what goes in.
 *
 * Losing calls are included with the same prominence as winning ones. A record
 * that reports only its hits is an advertisement, and the scoreboard already
 * has the failures — exporting a filtered version would be the one dishonesty
 * this whole project exists to avoid.
 *
 * Unscoreable calls are counted separately rather than dropped. Posts that made
 * no directional claim, and calls whose asset could not be resolved, are stated
 * as such so the denominator is visible.
 */

import { copyFileSync, existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { Store } from "../src/store.mjs";
import { tally } from "../src/scoreboard.mjs";

const OUT = "site/record.json";
const DATA_DIR = "site/data";

const store = new Store();
const claims = store.listClaims();

const scored = claims.filter((c) => c.score && c.asset);
const unscoreable = claims.filter((c) => !c.asset);
const pending = claims.filter((c) => c.asset && !c.score);

const t = tally(scored);

/** Every scored call, newest first, wins and losses alike. */
const calls = scored
  .slice()
  .sort((a, b) => String(b.publishedAt).localeCompare(String(a.publishedAt)))
  .map((c) => ({
    asset: c.asset,
    bias: c.bias,
    publishedAt: c.publishedAt,
    correct: c.score.biasCorrect,
    movePct: c.score.movePct,
    typicalMovePct: c.score.typicalMovePct ?? null,
    hours: c.score.hours,
    priceRecovered: c.score.priceRecovered ?? false,
    shareLink: c.shareLink ?? null,
  }));

/** The strategy's own walk-forward result, if it has been run. */
const backtest = existsSync("research/self-backtest.json")
  ? (() => {
    const S = JSON.parse(readFileSync("research/self-backtest.json", "utf8"));
    return {
      measuredAt: S.measuredAt,
      pairs: S.pairs,
      rebalances: S.rebalances,
      lookbackDays: S.lookbackDays,
      rules: S.rules,
      funnel: S.funnel,
      results: Object.fromEntries(Object.entries(S.results).map(([k, v]) => [k, v && {
        trades: v.trades, meanNetR: v.meanNetR, winSharePct: v.winSharePct, tStat: v.tStat,
      }])),
      beatsDoingNothing: S.versusAlwaysShort?.algorithmBeatsIt ?? null,
    };
  })()
  : null;

/** The daily column's ledger, so open positions are visible, not just closed ones. */
const planFiles = existsSync("data/plans")
  ? readdirSync("data/plans").filter((f) => f.endsWith(".json")).sort()
  : [];
const ledger = planFiles.map((f) => {
  const p = JSON.parse(readFileSync(`data/plans/${f}`, "utf8"));
  return {
    day: p.day,
    measuredAt: p.measuredAt,
    positions: p.taken.map((x) => ({
      symbol: x.symbol, direction: x.direction,
      entry: x.entry, stop: x.stop, target: x.target,
    })),
  };
});

/**
 * Research snapshots, copied so every quoted figure has a file behind it.
 *
 * The posts all end with "every figure traces to research/<name>.json". That
 * sentence was only true for someone with the repository. Now it is true for
 * anyone with the URL.
 */
mkdirSync(DATA_DIR, { recursive: true });
const snapshots = readdirSync("research").filter((f) => f.endsWith(".json")).sort();
for (const f of snapshots) copyFileSync(`research/${f}`, `${DATA_DIR}/${f}`);
writeFileSync(`${DATA_DIR}/index.json`, `${JSON.stringify({
  generatedAt: new Date().toISOString(),
  note: "Every figure published on this site traces to one of these snapshots.",
  snapshots: snapshots.map((f) => ({ file: f, url: `/data/${f}` })),
}, null, 2)}\n`);

const record = {
  generatedAt: new Date().toISOString(),
  summary: {
    scored: t.total,
    biasCorrect: t.bias ? t.bias.hits : null,
    biasTotal: t.bias ? t.bias.total : null,
    biasPct: t.bias ? t.bias.pct : null,
    supportHeld: t.support ? `${t.support.hits}/${t.support.total}` : null,
    pending: pending.length,
    unscoreable: unscoreable.length,
    publishedTotal: claims.length,
  },
  backtest,
  calls,
  ledger,
  snapshots: snapshots.length,
};
writeFileSync(OUT, `${JSON.stringify(record, null, 2)}\n`);

console.log(`${OUT}`);
console.log(`  scored ${t.total} · bias ${t.bias ? `${t.bias.hits}/${t.bias.total} (${t.bias.pct.toFixed(0)}%)` : "none"}`
  + ` · pending ${pending.length} · unscoreable ${unscoreable.length} of ${claims.length} published`);
console.log(`  ${snapshots.length} research snapshots copied to ${DATA_DIR}/`);
console.log(`  ledger: ${ledger.length} edition(s), ${ledger.reduce((s, x) => s + x.positions.length, 0)} position(s)`);
if (backtest) {
  console.log(`  walk-forward: algorithm ${backtest.results.algorithm.meanNetR.toFixed(4)}R`
    + ` vs always short ${backtest.results.alwaysShort.meanNetR.toFixed(4)}R`
    + ` · beats it: ${backtest.beatsDoingNothing}`);
}
