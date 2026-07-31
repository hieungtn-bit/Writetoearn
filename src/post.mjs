import fs from "node:fs";
import { CONTENT_TYPE, MAX_IMAGES_PER_POST } from "./config.mjs";
import { ValidationError } from "./errors.mjs";

export const POST_TYPE = {
  TEXT: "text",
  IMAGE: "image",
  ARTICLE: "article",
  VIDEO: "video",
};

/**
 * Normalises loose user input into a post spec and rejects anything the API
 * would reject. Running this before we upload a single byte means a malformed
 * post costs no quota.
 *
 * @returns {{type: string, text?: string, title?: string, images: string[],
 *   cover?: string, video?: string, durationSeconds?: number}}
 */
export function normalizePost(input = {}) {
  const type = input.type;
  if (!Object.values(POST_TYPE).includes(type)) {
    throw new ValidationError(
      `Unknown post type "${type}". Expected one of: ${Object.values(POST_TYPE).join(", ")}.`,
    );
  }

  const text = typeof input.text === "string" ? input.text.trim() : "";
  const title = typeof input.title === "string" ? input.title.trim() : "";
  const images = toList(input.images);
  const cover = input.cover ? String(input.cover).trim() : "";
  const video = input.video ? String(input.video).trim() : "";

  if (type !== POST_TYPE.VIDEO && !text) {
    throw new ValidationError(`A ${type} post needs --text.`);
  }
  if (type === POST_TYPE.ARTICLE && !title) {
    throw new ValidationError("An article needs --title.");
  }
  if (type !== POST_TYPE.ARTICLE && title) {
    throw new ValidationError("--title is only valid on article posts.");
  }

  if (images.length && video) {
    throw new ValidationError("Images and video cannot be attached to the same post.");
  }
  if (images.length > MAX_IMAGES_PER_POST) {
    throw new ValidationError(
      `A post accepts at most ${MAX_IMAGES_PER_POST} images (got ${images.length}).`,
    );
  }
  if (type === POST_TYPE.IMAGE && images.length === 0) {
    throw new ValidationError("An image post needs at least one path in --images.");
  }
  if (type === POST_TYPE.ARTICLE && images.length) {
    throw new ValidationError("Articles take a single --cover, not --images.");
  }
  if (cover && type !== POST_TYPE.ARTICLE) {
    throw new ValidationError("--cover is only valid on article posts.");
  }

  const spec = { type, text, images, title: title || undefined };

  if (type === POST_TYPE.ARTICLE) {
    if (!cover) throw new ValidationError("An article needs a --cover image.");
    spec.cover = cover;
  }

  if (type === POST_TYPE.VIDEO) {
    if (!video) throw new ValidationError("A video post needs --video.");
    const duration = Number(input.durationSeconds);
    if (!Number.isFinite(duration) || duration <= 0) {
      throw new ValidationError("Video duration must be a positive number of seconds.");
    }
    spec.video = video;
    spec.durationSeconds = duration;
  }

  return spec;
}

/** Every local file the spec depends on, so we can check them all up front. */
export function mediaPaths(spec) {
  return [...(spec.images ?? []), spec.cover, spec.video].filter(Boolean);
}

export function assertMediaReadable(spec, { existsSync = fs.existsSync } = {}) {
  const missing = mediaPaths(spec).filter((p) => !existsSync(p));
  if (missing.length) {
    throw new ValidationError(`Media file(s) not found: ${missing.join(", ")}`);
  }
}

/** How many uploads this post will consume, for quota accounting. */
export function uploadCount(spec) {
  if (spec.type === POST_TYPE.VIDEO) return 2; // the video plus its generated cover
  if (spec.type === POST_TYPE.ARTICLE) return spec.cover ? 1 : 0;
  return spec.images?.length ?? 0;
}

/**
 * Assembles the /content/add body. `uploaded` carries the results of the media
 * step: hosted image URLs, a cover URL, and the video's fileTicket.
 */
export function buildPublishBody(spec, uploaded = {}) {
  if (spec.type === POST_TYPE.VIDEO) {
    const body = {
      contentType: CONTENT_TYPE.VIDEO,
      fileTicket: uploaded.fileTicket,
      cover: uploaded.cover,
      videoTimeSeconds: spec.durationSeconds,
      isPublish: true,
    };
    if (spec.text) body.bodyTextOnly = spec.text;
    return body;
  }

  if (spec.type === POST_TYPE.ARTICLE) {
    return {
      contentType: CONTENT_TYPE.ARTICLE,
      bodyTextOnly: spec.text,
      title: spec.title,
      cover: uploaded.cover,
    };
  }

  const body = {
    contentType: CONTENT_TYPE.SHORT,
    bodyTextOnly: spec.text,
  };
  if (uploaded.imageList?.length) body.imageList = uploaded.imageList;
  return body;
}

function toList(value) {
  if (!value) return [];
  if (Array.isArray(value)) return value.map((v) => String(v).trim()).filter(Boolean);
  return String(value)
    .split(",")
    .map((v) => v.trim())
    .filter(Boolean);
}
