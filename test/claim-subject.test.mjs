import test from "node:test";
import assert from "node:assert/strict";
import { BIAS, extractClaim } from "../src/scoreboard.mjs";

const brief = { levels: [], spot: [] };

test("the bias belongs to the asset it is stated about, not the loudest one", () => {
  // The post that caused this: BNB is mentioned constantly, and the bias
  // sentence is about the alt group and BTC. It was logged as a BNB short.
  const text = [
    "$BNB has zero overhead. $BNB sits at the top of its range. $BNB volume is falling.",
    "Bias: selective short across the alt group, and stand aside on BTC because the grid says so.",
  ].join("\n\n");
  const claim = extractClaim(text, brief);
  assert.equal(claim.ambiguous, true, "two biases in one sentence cannot be scored as one call");
  assert.equal(claim.asset, null, "and must not be pinned to the most-mentioned asset");
  assert.match(claim.ambiguityReason, /2 biases/);
});

test("a bias sentence naming one asset is scored against that asset", () => {
  const text = [
    "$ICP looks clean. $ICP volume is expanding. $ICP has no overhead. $ETH does not.",
    "Bias: selective short on $ETH.",
  ].join("\n\n");
  const claim = extractClaim(text, brief);
  assert.equal(claim.ambiguous, false);
  assert.equal(claim.asset, "ETHUSDT", "named in the bias sentence, despite ICP dominating the post");
  assert.equal(claim.bias, BIAS.SHORT);
});

test("a bias sentence naming nothing falls back to the post's subject", () => {
  const text = "$SUI is the subject here. $SUI again.\n\nBias: WAIT. Not financial advice.";
  const claim = extractClaim(text, brief);
  assert.equal(claim.ambiguous, false);
  assert.equal(claim.asset, "SUIUSDT");
  assert.equal(claim.bias, BIAS.WAIT);
});

test("a bias sentence naming two assets is ambiguous rather than guessed", () => {
  const text = "$ENA and $ICP both matter.\n\nBias: WAIT on $ENA and $ICP alike.";
  const claim = extractClaim(text, brief);
  assert.equal(claim.ambiguous, true);
  assert.equal(claim.asset, null);
  assert.match(claim.ambiguityReason, /ENA, ICP/);
});

test("bare majors count as named, since posts write them without a cashtag", () => {
  const text = "$ICP is the subject. $ICP again. $ICP once more.\n\nBias: stand aside on BTC.";
  const claim = extractClaim(text, brief);
  assert.equal(claim.asset, "BTCUSDT");
  assert.equal(claim.bias, BIAS.WAIT);
});

test("levels and price attach to the resolved asset, not the dominant one", () => {
  const withLevels = {
    levels: [{ symbol: "ETHUSDT", support: 1800, resistance: 2000, spot: 1900 }],
    spot: [{ symbol: "ETHUSDT", price: 1900 }],
  };
  const text = "$ICP $ICP $ICP.\n\nBias: selective short on $ETH.";
  const claim = extractClaim(text, withLevels);
  assert.equal(claim.asset, "ETHUSDT");
  assert.equal(claim.support, 1800);
  assert.equal(claim.priceAtPost, 1900);
});
