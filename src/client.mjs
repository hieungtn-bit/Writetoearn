import fs from "node:fs";
import path from "node:path";
import {
  API_KEY_HEADER,
  BASE_URL_V1,
  BASE_URL_V2,
  CLIENT_TYPE,
  SUCCESS_CODE,
} from "./config.mjs";
import { SquareApiError, classify, FAILURE_KIND } from "./errors.mjs";

const DEFAULT_TIMEOUT_MS = 30_000;
const UPLOAD_TIMEOUT_MS = 300_000;
const POLL_INTERVAL_MS = 3000;
const MAX_POLL_RETRIES = 10;

const CONTENT_TYPE_MAP = {
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  png: "image/png",
  gif: "image/gif",
  webp: "image/webp",
  mp4: "video/mp4",
  mov: "video/quicktime",
  avi: "video/x-msvideo",
  webm: "video/webm",
};

export function getContentType(filePath) {
  const ext = path.extname(filePath).slice(1).toLowerCase();
  return CONTENT_TYPE_MAP[ext] || "application/octet-stream";
}

export function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Marker returned when /content/add times out at the gateway. Binance's own
 * client treats a 504 here as a successful publish whose id was lost, and so do
 * we — the post is live, only the receipt went missing.
 */
export const PUBLISH_STATUS_NO_ID = "success_without_post_id";

export class SquareClient {
  /**
   * @param {object} opts
   * @param {string} opts.apiKey
   * @param {typeof fetch} [opts.fetchImpl] Injected in tests.
   * @param {(ms: number) => Promise<void>} [opts.sleepImpl]
   * @param {(msg: string) => void} [opts.onProgress]
   */
  constructor({ apiKey, fetchImpl = globalThis.fetch, sleepImpl = sleep, onProgress } = {}) {
    if (!apiKey) throw new Error("SquareClient requires an apiKey");
    this.apiKey = apiKey;
    this.fetch = fetchImpl;
    this.sleep = sleepImpl;
    this.onProgress = onProgress ?? (() => {});
  }

  /**
   * One POST against the OpenAPI. Never retries on its own — retry policy
   * belongs to the caller, because /content/add is not safe to replay.
   */
  async request(endpoint, body, { baseUrl = BASE_URL_V2, timeoutMs = DEFAULT_TIMEOUT_MS } = {}) {
    let res;
    try {
      res = await this.fetch(`${baseUrl}${endpoint}`, {
        method: "POST",
        headers: {
          [API_KEY_HEADER]: this.apiKey,
          "Content-Type": "application/json",
          clienttype: CLIENT_TYPE,
        },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(timeoutMs),
      });
    } catch (cause) {
      throw new SquareApiError(`Network failure calling ${endpoint}: ${cause.message}`, {
        endpoint,
        kind: FAILURE_KIND.TRANSIENT,
      });
    }

    const raw = await res.text();

    if (endpoint === "/content/add" && res.status === 504) {
      return { id: null, shareLink: null, publishStatus: PUBLISH_STATUS_NO_ID };
    }

    let json;
    try {
      json = JSON.parse(raw);
    } catch {
      throw new SquareApiError(
        `Non-JSON response from ${endpoint}: ${res.status} ${res.statusText}`,
        { endpoint, httpStatus: res.status, kind: classify({ httpStatus: res.status }) },
      );
    }

    if (json.code !== SUCCESS_CODE) {
      throw new SquareApiError(`[${json.code}] ${json.message ?? "request rejected"}`, {
        endpoint,
        code: json.code,
        httpStatus: res.status,
      });
    }

    return json.data;
  }

  async putToPresignedUrl(presignedUrl, filePath, contentType) {
    const body = await fs.promises.readFile(filePath);
    let res;
    try {
      res = await this.fetch(presignedUrl, {
        method: "PUT",
        headers: { "Content-Type": contentType },
        body,
        signal: AbortSignal.timeout(UPLOAD_TIMEOUT_MS),
      });
    } catch (cause) {
      throw new SquareApiError(`Upload of ${path.basename(filePath)} failed: ${cause.message}`, {
        kind: FAILURE_KIND.TRANSIENT,
      });
    }
    if (!res.ok) {
      throw new SquareApiError(
        `Upload of ${path.basename(filePath)} rejected: ${res.status} ${res.statusText}`,
        { httpStatus: res.status },
      );
    }
  }

  /** Uploads one image and returns its hosted URL, ready for a post body. */
  async uploadImage(imgPath) {
    const imageName = path.basename(imgPath);
    this.onProgress(`uploading image ${imageName}`);

    const { presignedUrl, fileTicket } = await this.request("/image/presignedUrl", { imageName });
    await this.putToPresignedUrl(presignedUrl, imgPath, getContentType(imgPath));

    const status = await this.pollMediaStatus(fileTicket);
    this.onProgress(`image ready ${imageName}`);
    return status.imageUrl;
  }

  /** Uploads a video and returns the fileTicket that /content/add expects. */
  async uploadVideo(videoPath) {
    const fileName = path.basename(videoPath);
    const { size } = await fs.promises.stat(videoPath);
    this.onProgress(`uploading video ${fileName} (${(size / 1024 / 1024).toFixed(1)}MB)`);

    const { presignedUrl, fileTicket } = await this.request("/video/preSign", { fileName, size });
    await this.putToPresignedUrl(presignedUrl, videoPath, getContentType(videoPath));

    await this.pollMediaStatus(fileTicket);
    this.onProgress(`video ready ${fileName}`);
    return fileTicket;
  }

  /** Shared by images and video — both report through /image/imageStatus. */
  async pollMediaStatus(fileTicket) {
    for (let attempt = 1; attempt <= MAX_POLL_RETRIES; attempt++) {
      const data = await this.request("/image/imageStatus", { fileTicket });
      if (data.status === 1) return data;
      if (data.status === 2) {
        throw new SquareApiError(`Media processing failed: ${data.failedReason ?? "unknown"}`, {
          kind: FAILURE_KIND.CONTENT,
        });
      }
      this.onProgress(`processing (${attempt}/${MAX_POLL_RETRIES})`);
      await this.sleep(POLL_INTERVAL_MS);
    }
    throw new SquareApiError(`Media processing timed out after ${MAX_POLL_RETRIES} polls`, {
      kind: FAILURE_KIND.TRANSIENT,
    });
  }

  /** Publishes a fully-built body. Callers must not replay this on timeout. */
  async publish(body) {
    return this.request("/content/add", body, { baseUrl: BASE_URL_V1, timeoutMs: 60_000 });
  }
}
