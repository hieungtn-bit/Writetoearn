/**
 * A trade card: the whole plan on one screen.
 *
 * Taken from how the large Square accounts format a post — direction, entry,
 * stop, targets, risk — because that shape is scannable in three seconds and
 * ours is not. A reader deciding whether to act does not want a paragraph.
 *
 * What is *not* taken is the arithmetic behind it. Those accounts publish a
 * fixed rule ("5x-10x leverage max") that cannot know how volatile the asset is
 * today, and targets picked to look generous. Here every level comes from the
 * asset's own ATR, and the leverage ceiling is solved from the real maintenance
 * margin so that liquidation sits *beyond* the stop rather than inside it —
 * which is the single mistake that turns a planned 1% loss into a total one.
 *
 * A card is a plan, not a call. It says "if you take this, here is what it
 * costs and where it dies", and the bias belongs to whoever reads it.
 */

import { mmrFor, liquidationPrice } from "./liquidation.mjs";

/** Stop distance in ATR multiples. Wide enough that ordinary noise does not reach it. */
export const DEFAULT_STOP_ATR = 1.5;

/**
 * The largest leverage whose liquidation still sits beyond the stop.
 *
 * For a long stopped at a fraction d below entry, liquidation must be lower:
 *   E(1 - 1/L)/(1 - mmr) < E(1 - d)   ->   L < 1 / (1 - (1 - d)(1 - mmr))
 *
 * Below this the stop is hit first, which is the intended outcome. Above it the
 * position is liquidated before the stop can work, and the risk that was sized
 * to 1% becomes the whole margin.
 */
export function maxLeverageForStop(stopDistancePct, mmr, side = "long") {
  const d = stopDistancePct / 100;
  if (!(d > 0)) return NaN;
  const denom = side === "long" ? 1 - (1 - d) * (1 - mmr) : (1 + d) * (1 + mmr) - 1;
  return denom > 0 ? 1 / denom : NaN;
}

/**
 * Builds the plan.
 *
 * Targets are placed in R multiples rather than at round numbers, so the
 * reward is stated in units of the risk actually being taken. A "target" that
 * is not expressed against its stop is decoration.
 */
export function buildCard({
  symbol,
  price,
  atrPct,
  tiers = [],
  side = "long",
  stopAtr = DEFAULT_STOP_ATR,
  targetsR = [1, 2, 3],
  riskPct = 1,
  accountUsd = 1000,
}) {
  if (!(price > 0) || !(atrPct > 0)) return null;

  const stopDistancePct = atrPct * stopAtr;
  const dir = side === "long" ? -1 : 1;
  const stop = price * (1 + (dir * stopDistancePct) / 100);
  const targets = targetsR.map((r) => ({
    r,
    price: price * (1 - (dir * r * stopDistancePct) / 100),
  }));

  const mmr = mmrFor(tiers, 100);
  const maxLeverage = maxLeverageForStop(stopDistancePct, mmr, side);
  // Position size that loses exactly riskPct of the account at the stop.
  const positionUsd = (accountUsd * (riskPct / 100)) / (stopDistancePct / 100);

  return {
    symbol,
    side,
    price,
    atrPct,
    stopAtr,
    stop,
    stopDistancePct,
    targets,
    riskPct,
    accountUsd,
    positionUsd,
    maxLeverage,
    /** Where a position at the ceiling would actually be liquidated. */
    liquidationAtMax: Number.isFinite(maxLeverage)
      ? liquidationPrice(price, maxLeverage, mmr, side)
      : NaN,
  };
}

const n = (v) => (v >= 1000 ? Math.round(v).toLocaleString("en-US") : Number(v.toPrecision(5)).toString());
const f2 = (v) => (Number.isFinite(v) ? v.toFixed(2) : "—");

/**
 * The card as a post.
 *
 * Every number here traces to price and ATR, so it survives `wte check`. The
 * closing line is deliberately not a prediction — the card describes the cost
 * of a trade, and claiming to know its outcome is the part worth refusing.
 */
export function formatCard(card, { note } = {}) {
  if (!card) return "Not enough data to build a plan.";
  const arrow = card.side === "long" ? "LONG" : "SHORT";
  const lines = [
    `$${card.symbol.replace(/USDT$/, "")} — ${arrow} plan`,
    "",
    `  entry        ${n(card.price)}`,
    `  stop         ${n(card.stop)}   ${f2(card.stopDistancePct)}%  (${card.stopAtr} x ATR ${f2(card.atrPct)}%)`,
  ];
  for (const t of card.targets) {
    lines.push(`  target ${t.r}R     ${n(t.price)}   ${f2((Math.abs(t.price - card.price) / card.price) * 100)}%`);
  }
  lines.push(
    "",
    `  risk         ${f2(card.riskPct)}% of the account`,
    `  size         $${Math.round(card.positionUsd).toLocaleString()} per $${card.accountUsd.toLocaleString()}`,
    // At exactly this leverage liquidation lands on the stop, which is why
    // quoting both prices reads as a tautology. What matters is the direction:
    // one step higher and the exchange closes the trade before the plan does.
    `  max leverage ${f2(card.maxLeverage)}x  — at this leverage liquidation sits on the stop ` +
      `(${n(card.stop)}). Any higher and the exchange closes you first, and the ` +
      `${f2(card.riskPct)}% risk becomes the whole margin.`,
  );
  if (note) lines.push("", note);
  return lines.join("\n");
}
