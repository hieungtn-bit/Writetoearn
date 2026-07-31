import test from "node:test";
import assert from "node:assert/strict";
import { buildPublishBody, normalizePost, uploadCount } from "../src/post.mjs";
import { CONTENT_TYPE } from "../src/config.mjs";

test("a text post becomes a contentType 1 body", () => {
  const spec = normalizePost({ type: "text", text: "  gm  " });
  assert.equal(spec.text, "gm");
  assert.deepEqual(buildPublishBody(spec), {
    contentType: CONTENT_TYPE.SHORT,
    bodyTextOnly: "gm",
  });
});

test("a title promotes a post to an article and requires a cover", () => {
  const spec = normalizePost({
    type: "article",
    text: "body",
    title: "My title",
    cover: "cover.png",
  });
  assert.deepEqual(buildPublishBody(spec, { cover: "https://cdn/x.png" }), {
    contentType: CONTENT_TYPE.ARTICLE,
    bodyTextOnly: "body",
    title: "My title",
    cover: "https://cdn/x.png",
  });
});

test("articles reject --images in favour of a single cover", () => {
  assert.throws(
    () => normalizePost({ type: "article", text: "b", title: "t", images: "a.png" }),
    /single --cover/,
  );
});

test("image posts accept a comma-separated list and cap at four", () => {
  const spec = normalizePost({ type: "image", text: "hi", images: "a.png, b.png" });
  assert.deepEqual(spec.images, ["a.png", "b.png"]);
  assert.throws(
    () => normalizePost({ type: "image", text: "hi", images: "a,b,c,d,e" }),
    /at most 4 images/,
  );
});

test("images and video cannot share a post", () => {
  assert.throws(
    () => normalizePost({ type: "video", video: "v.mp4", durationSeconds: 5, images: "a.png" }),
    /cannot be attached to the same post/,
  );
});

test("video posts need a positive duration", () => {
  assert.throws(
    () => normalizePost({ type: "video", video: "v.mp4", durationSeconds: 0 }),
    /positive number of seconds/,
  );
});

test("video bodies carry the file ticket, cover and duration", () => {
  const spec = normalizePost({ type: "video", video: "v.mp4", durationSeconds: 12, text: "watch" });
  assert.deepEqual(buildPublishBody(spec, { fileTicket: "T1", cover: "https://cdn/c.png" }), {
    contentType: CONTENT_TYPE.VIDEO,
    fileTicket: "T1",
    cover: "https://cdn/c.png",
    videoTimeSeconds: 12,
    isPublish: true,
    bodyTextOnly: "watch",
  });
});

test("a video post costs two uploads: the video and its generated cover", () => {
  assert.equal(uploadCount(normalizePost({ type: "video", video: "v.mp4", durationSeconds: 3 })), 2);
  assert.equal(uploadCount(normalizePost({ type: "text", text: "x" })), 0);
  assert.equal(uploadCount(normalizePost({ type: "image", text: "x", images: "a.png,b.png" })), 2);
});

test("text is required everywhere except video posts", () => {
  assert.throws(() => normalizePost({ type: "text", text: "   " }), /needs --text/);
  assert.doesNotThrow(() => normalizePost({ type: "video", video: "v.mp4", durationSeconds: 1 }));
});
