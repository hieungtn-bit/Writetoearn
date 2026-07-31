import fs from "node:fs";
import os from "node:os";
import path from "node:path";

/**
 * Endpoints and header names below are taken from Binance's official
 * square-post skill (github.com/binance/binance-skills-hub). /content/add is
 * served from v1 while the media endpoints are on v2.
 */
export const BASE_URL_V1 = "https://www.binance.com/bapi/composite/v1/public/pgc/openApi";
export const BASE_URL_V2 = "https://www.binance.com/bapi/composite/v2/public/pgc/openApi";

export const API_KEY_HEADER = "X-Square-OpenAPI-Key";
export const CLIENT_TYPE = "binanceSkill";

export const SUCCESS_CODE = "000000";

/** Documented account ceilings, enforced locally so we fail before the API does. */
export const DAILY_POST_LIMIT = 100;
export const DAILY_UPLOAD_LIMIT = 400;

export const MAX_IMAGES_PER_POST = 4;

/** contentType values accepted by /content/add. */
export const CONTENT_TYPE = {
  SHORT: 1,
  ARTICLE: 2,
  VIDEO: 3,
};

const KEY_CONFIG_DIR = path.join(os.homedir(), ".config", "binance-square");
const KEY_CONFIG_FILE = path.join(KEY_CONFIG_DIR, "openapi-key");

/**
 * Key file location is shared with the official Binance skill on purpose: a key
 * saved with either tool works with the other.
 */
export function getKeyFilePath() {
  return KEY_CONFIG_FILE;
}

export function getStateDir() {
  return process.env.WTE_STATE_DIR
    ? path.resolve(process.env.WTE_STATE_DIR)
    : path.resolve(process.cwd(), ".wte");
}

export function maskApiKey(apiKey) {
  if (!apiKey) return "";
  if (apiKey.length <= 9) return `${apiKey.slice(0, 2)}...`;
  return `${apiKey.slice(0, 5)}...${apiKey.slice(-4)}`;
}

export function readSavedApiKey() {
  const keyFile = getKeyFilePath();
  if (!fs.existsSync(keyFile)) return "";
  return fs.readFileSync(keyFile, "utf8").trim();
}

export function saveApiKey(apiKey) {
  const key = String(apiKey ?? "").trim();
  if (!key) throw new Error("Missing Square OpenAPI key");

  const keyFile = getKeyFilePath();
  fs.mkdirSync(path.dirname(keyFile), { recursive: true, mode: 0o700 });
  fs.writeFileSync(keyFile, `${key}\n`, { mode: 0o600 });
  fs.chmodSync(keyFile, 0o600);
  return keyFile;
}

/**
 * Resolves the key from the environment, then from disk.
 *
 * Keys are deliberately not accepted as CLI arguments — argv is visible to
 * other processes via /proc and lands in shell history.
 */
export function resolveApiKey(argv = []) {
  if (argv.includes("--key")) {
    throw new Error(
      "Do not pass the API key with --key; argv is world-readable. " +
        "Set BINANCE_SQUARE_OPENAPI_KEY or run `wte auth save`.",
    );
  }

  const envKey = process.env.BINANCE_SQUARE_OPENAPI_KEY;
  if (envKey?.trim()) return envKey.trim();

  const savedKey = readSavedApiKey();
  if (savedKey) return savedKey;

  throw new Error(
    `No Square OpenAPI key found. Create one at ` +
      `https://www.binance.com/square/creator-center/home then either set ` +
      `BINANCE_SQUARE_OPENAPI_KEY or run \`wte auth save\` ` +
      `(saves to ${getKeyFilePath()}).`,
  );
}
