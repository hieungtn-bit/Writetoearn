import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { ValidationError } from "./errors.mjs";

/**
 * Video posts need a cover frame and a duration. Both come from ffmpeg/ffprobe,
 * which are only required when a video is actually involved — text and image
 * posts run fine without them.
 */

function requireBinary(bin) {
  const probe = spawnSync(bin, ["-version"], { encoding: "utf8" });
  if (probe.error) {
    throw new ValidationError(
      `${bin} is required for video posts but was not found on PATH. ` +
        `Install ffmpeg (which ships both ffmpeg and ffprobe) and retry.`,
    );
  }
}

/** Reads a video's duration in seconds. */
export function probeDurationSeconds(videoPath) {
  requireBinary("ffprobe");
  const res = spawnSync(
    "ffprobe",
    [
      "-v", "error",
      "-show_entries", "format=duration",
      "-of", "default=noprint_wrappers=1:nokey=1",
      videoPath,
    ],
    { encoding: "utf8" },
  );
  if (res.status !== 0) {
    throw new ValidationError(`ffprobe could not read ${videoPath}: ${res.stderr?.trim()}`);
  }
  const seconds = Number.parseFloat(res.stdout.trim());
  if (!Number.isFinite(seconds) || seconds <= 0) {
    throw new ValidationError(`ffprobe returned no usable duration for ${videoPath}`);
  }
  return Math.round(seconds);
}

/**
 * Grabs the first frame as a PNG in a temp dir.
 * @returns {{coverPath: string, cleanup: () => void}}
 */
export function extractVideoCover(videoPath) {
  requireBinary("ffmpeg");
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "wte-cover-"));
  const coverPath = path.join(tempDir, `${path.parse(videoPath).name}-cover.png`);

  const res = spawnSync(
    "ffmpeg",
    ["-y", "-loglevel", "error", "-i", videoPath, "-frames:v", "1", "-q:v", "2", coverPath],
    { encoding: "utf8" },
  );

  const cleanup = () => {
    try {
      fs.rmSync(tempDir, { recursive: true, force: true });
    } catch {
      // Best effort: a leftover temp dir is not worth failing a publish over.
    }
  };

  if (res.status !== 0) {
    cleanup();
    throw new ValidationError(
      `ffmpeg could not extract a cover from ${videoPath}: ${res.stderr?.trim() || "unknown error"}`,
    );
  }
  if (!fs.existsSync(coverPath) || fs.statSync(coverPath).size === 0) {
    cleanup();
    throw new ValidationError(`ffmpeg produced an empty cover for ${videoPath}`);
  }

  return { coverPath, cleanup };
}
