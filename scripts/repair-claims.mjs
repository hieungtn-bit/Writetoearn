/**
 * Finds calls whose recorded entry price the asset never traded at, and voids
 * the numbers so they can be settled honestly.
 *
 * `--claim-asset` used to overwrite the symbol on a claim without moving the
 * price and levels with it, so three calls entered the record labelled XRP and
 * SUI while carrying BTC's spot and BTC's support. Scoring divided an XRP
 * close by a BTC entry, produced -100.00%, and the scoreboard printed that as
 * a correct short three times over. The override is fixed in src/cli.mjs; this
 * repairs what it already wrote.
 *
 * The test is deliberately not "was --claim-asset used" — that is not
 * recorded, and a rule that only catches the one cause I happen to know about
 * would miss the next one. Instead every claim is checked against the tape:
 * an entry price is credible only if the asset actually traded near it around
 * publication. Anything outside its own range by a wide margin is not a price
 * for that asset, whatever put it there.
 *
 * Repair means nulling priceAtPost, support and resistance, and clearing the
 * score. It does not mean deleting the call. The scorer recovers an entry from
 * the candles it already fetches, and a claim with no levels is judged on the
 * move alone — so the call still faces the record, just without invented
 * numbers standing in for it. Deleting them would quietly improve the board,
 * which is the opposite of the point.
 *
 *   node scripts/repair-claims.mjs           # report only
 *   node scripts/repair-claims.mjs --write   # apply
 */

import { Store } from "../src/store.mjs";
import { fetchKlines } from "../src/analysis.mjs";

const WRITE = process.argv.includes("--write");

/**
 * How far outside its own range a price has to sit before it is not a price.
 *
 * The window's own high and low already bound what the asset traded at, so any
 * multiple beyond that is wrong. Two is loose enough that a stale-by-hours
 * entry on a violent day survives, and tight enough that a BTC number pinned
 * to an XRP claim cannot.
 */
const TOLERANCE = 2;

const store = new Store();
const claims = store.listClaims();

const suspect = [];
for (const claim of claims) {
  if (!claim.asset || claim.priceAtPost == null) continue;
  if (!claim.asset.endsWith("USDT")) {
    /**
     * A malformed symbol is a different fault from a wrong price.
     *
     * "BTC" is unfetchable, so the call could never be settled — but the
     * price recorded beside it is BTC's, and it is correct. Voiding it would
     * discard a good number to fix a bad label. Normalising the symbol is the
     * whole repair here.
     */
    suspect.push({ claim, kind: "symbol", reason: `asset "${claim.asset}" is not an exchange pair` });
    continue;
  }

  let candles;
  try {
    candles = await fetchKlines(claim.asset, { interval: "1h", limit: 1000 });
  } catch (err) {
    console.log(`  skipped ${claim.asset} ${claim.postId}: ${err.message}`);
    continue;
  }
  if (!candles.length) continue;

  const publishedAt = new Date(claim.publishedAt).getTime();
  /** A day either side, so the comparison is to the tape around the call. */
  const near = candles.filter((c) => Math.abs(c.openTime - publishedAt) <= 86_400_000);
  const window = near.length ? near : candles;
  const low = Math.min(...window.map((c) => c.low));
  const high = Math.max(...window.map((c) => c.high));

  const p = claim.priceAtPost;
  if (p > high * TOLERANCE || p < low / TOLERANCE) {
    suspect.push({
      claim,
      kind: "price",
      reason: `entry ${p} is outside ${claim.asset}'s ${low.toPrecision(6)}-${high.toPrecision(6)} range at publication`,
      low, high,
    });
  }
}

if (!suspect.length) {
  console.log("Every recorded entry price is one its asset actually traded at.");
  process.exit(0);
}

console.log(`${suspect.length} call(s) carry a price their asset never traded at:\n`);
for (const s of suspect) {
  const c = s.claim;
  console.log(`  ${String(c.postId).slice(0, 12)}  ${c.asset.padEnd(9)} ${String(c.bias ?? "no bias").padEnd(17)} ${String(c.publishedAt).slice(0, 10)}`);
  console.log(`     ${s.reason}`);
  if (c.score) console.log(`     scored ${c.score.movePct.toFixed(2)}%, biasCorrect ${c.score.biasCorrect}`);
}

if (!WRITE) {
  console.log("\nReport only. Re-run with --write to void these numbers and reopen the calls.");
  process.exit(0);
}

for (const { claim, kind } of suspect) {
  const asset = claim.asset.endsWith("USDT") ? claim.asset : `${claim.asset}USDT`;
  // recordClaim clears the score on every write, which is what reopening a
  // call requires — the settlement is re-derived, never patched in place.
  store.recordClaim(kind === "symbol"
    ? { ...claim, asset, repairedAt: new Date().toISOString(), repairReason: "symbol was not an exchange pair" }
    : {
        ...claim, asset,
        priceAtPost: null, support: null, resistance: null,
        repairedAt: new Date().toISOString(),
        repairReason: "entry price did not belong to the claimed asset",
      });
}
const voided = suspect.filter((s_) => s_.kind === "price").length;
console.log(`\nVoided the numbers on ${voided} call(s), renamed ${suspect.length - voided}, and reopened all ${suspect.length}.`);
console.log("Run `wte score` to settle them.");
