import {
  POST_TYPE,
  assertMediaReadable,
  buildPublishBody,
  uploadCount,
} from "./post.mjs";
import { extractVideoCover } from "./media.mjs";
import { PUBLISH_STATUS_NO_ID } from "./client.mjs";

/**
 * Runs one post end to end: validate, upload media, publish.
 *
 * @param {import("./client.mjs").SquareClient} client
 * @param {object} spec A spec already through normalizePost().
 * @param {object} [opts]
 * @param {boolean} [opts.dryRun] Build the request but send nothing.
 * @param {() => void} [opts.onBeforePublish] Fires in the last moment before
 *   the irreversible call, so callers can checkpoint state to disk.
 * @param {(msg: string) => void} [opts.onProgress]
 */
export async function publishSpec(client, spec, { dryRun = false, onBeforePublish, onProgress } = {}) {
  const log = onProgress ?? (() => {});
  assertMediaReadable(spec);

  if (dryRun) {
    return {
      dryRun: true,
      uploadsUsed: 0,
      body: buildPublishBody(spec, previewUploads(spec)),
      result: null,
    };
  }

  const uploaded = {};
  let uploadsUsed = 0;
  let cleanupCover = null;

  try {
    if (spec.type === POST_TYPE.VIDEO) {
      uploaded.fileTicket = await client.uploadVideo(spec.video);
      uploadsUsed++;

      log("extracting cover frame");
      const cover = extractVideoCover(spec.video);
      cleanupCover = cover.cleanup;
      uploaded.cover = await client.uploadImage(cover.coverPath);
      uploadsUsed++;
    } else if (spec.type === POST_TYPE.ARTICLE) {
      uploaded.cover = await client.uploadImage(spec.cover);
      uploadsUsed++;
    } else if (spec.images?.length) {
      uploaded.imageList = [];
      for (const imgPath of spec.images) {
        uploaded.imageList.push(await client.uploadImage(imgPath));
        uploadsUsed++;
      }
    }

    const body = buildPublishBody(spec, uploaded);

    // Past this line a retry can duplicate the post, so the caller gets its
    // chance to record "in flight" first.
    onBeforePublish?.();

    log("publishing");
    const result = await client.publish(body);

    return {
      dryRun: false,
      uploadsUsed,
      body,
      result,
      /** True when the gateway timed out but the post is believed live. */
      missingPostId: result?.publishStatus === PUBLISH_STATUS_NO_ID,
    };
  } catch (err) {
    // Uploads already accepted still count against the daily allowance even
    // though the post never went out, so the caller must be able to bill them.
    err.uploadsUsed = uploadsUsed;
    throw err;
  } finally {
    cleanupCover?.();
  }
}

/** Placeholder media values so a dry run can show the real body shape. */
function previewUploads(spec) {
  if (spec.type === POST_TYPE.VIDEO) {
    return { fileTicket: "<video-file-ticket>", cover: "<cover-url>" };
  }
  if (spec.type === POST_TYPE.ARTICLE) return { cover: "<cover-url>" };
  return { imageList: (spec.images ?? []).map((_, i) => `<image-url-${i + 1}>`) };
}

export { uploadCount };
