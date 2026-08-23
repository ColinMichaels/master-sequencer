import assert from "node:assert/strict";
import { mkdtemp, mkdir, readFile, stat, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import {
  VISUAL_IMAGE_EXTENSIONS,
  VISUAL_MEDIA_EXTENSIONS,
  VISUAL_VIDEO_EXTENSIONS,
  scanVisualMediaLibrary,
  visualMediaKey,
} from "../server/visual-media-library.mjs";
import { createVisualMetadataStore } from "../server/visual-metadata-store.mjs";

test("visual-media extension allowlists cover the supported image and video formats", () => {
  assert.deepEqual([...VISUAL_VIDEO_EXTENSIONS].sort(), [".m4v", ".mov", ".mp4", ".webm"]);
  assert.deepEqual([...VISUAL_IMAGE_EXTENSIONS].sort(), [".jpeg", ".jpg", ".png", ".webp"]);
  assert.equal(VISUAL_MEDIA_EXTENSIONS.has(".gif"), false);
  assert.equal(VISUAL_MEDIA_EXTENSIONS.has(".svg"), false);
});

test("visual scanning stays inside configured roots, skips symlinks, and reuses cached probe metadata", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "project-sequencer-visual-"));
  const outside = await mkdtemp(path.join(tmpdir(), "project-sequencer-visual-outside-"));
  const media = path.join(root, "Campaign");
  await mkdir(media);
  const videoPath = path.join(media, "album-master-16x9.mp4");
  const imagePath = path.join(media, "feed-square.png");
  const outsidePath = path.join(outside, "escaped.jpg");
  await writeFile(videoPath, "unchanged-video-source-bytes");
  await writeFile(imagePath, "unchanged-image-source-bytes");
  await writeFile(outsidePath, "outside-source");
  await symlink(outside, path.join(root, "linked-outside"));
  await mkdir(path.join(root, "node_modules"));
  await writeFile(path.join(root, "node_modules", "ignored.webp"), "ignored");
  await writeFile(path.join(root, ".hidden.jpg"), "hidden");
  const before = await Promise.all([stat(videoPath), stat(imagePath)]);
  const bytesBefore = await Promise.all([readFile(videoPath), readFile(imagePath)]);
  let probes = 0;
  const probe = async (file) => {
    probes += 1;
    return file.mediaType === "video"
      ? { width: 1920, height: 1080, duration: 4.5, codec: "h264", container: "mov,mp4", bitrate: 4_200_000, frameRate: 29.97, pixelFormat: "yuv420p", audioCodec: "aac", audioChannels: 2, audioSampleRate: 48_000, probeError: "" }
      : { width: 1080, height: 1080, duration: 0, codec: "png", container: "png_pipe", probeError: `failed at ${file.absolutePath}` };
  };
  const options = {
    roots: [{ id: "campaign", label: "Campaign", path: root, mediaTypes: ["video", "image"] }],
    ignoreDirectories: ["node_modules"],
    cachePath: path.join(root, "visual-cache.json"),
    metadataConcurrency: 2,
    probe,
  };
  const first = await scanVisualMediaLibrary(options);
  assert.equal(first.files.length, 2);
  assert.equal(first.scan.probedMetadata, 2);
  assert.equal(first.scan.reusedMetadata, 0);
  assert.equal(probes, 2);
  assert.equal(first.files.find((file) => file.mediaType === "video").aspect, "16:9");
  assert.equal(first.files.find((file) => file.mediaType === "video").frameRate, 29.97);
  assert.equal(first.files.find((file) => file.mediaType === "video").audioCodec, "aac");
  assert.equal(first.files.every((file) => typeof file.firstIndexedAt === "string"), true);
  assert.equal(first.files.every((file) => file.birthtimeMs > 0), true);
  assert.equal(first.files.find((file) => file.mediaType === "image").aspect, "1:1");
  assert.equal(first.files.find((file) => file.mediaType === "image").probeError, "Metadata probe failed.");
  assert.equal(first.files.some((file) => file.absolutePath === outsidePath), false);
  assert.equal(first.files.some((file) => file.relativePath.includes("node_modules")), false);
  assert.equal(first.files.some((file) => file.relativePath.includes("hidden")), false);
  assert.equal(first.files[0].key.startsWith("visual::campaign::"), true);

  const second = await scanVisualMediaLibrary(options);
  assert.equal(second.scan.reusedMetadata, 2);
  assert.equal(JSON.stringify(JSON.parse(await readFile(options.cachePath, "utf8"))).includes(root), false);
  assert.equal(second.scan.probedMetadata, 0);
  assert.equal(probes, 2);
  assert.deepEqual(second.files.map((file) => file.firstIndexedAt).sort(), first.files.map((file) => file.firstIndexedAt).sort());
  assert.deepEqual(second.files.map((file) => file.id).sort(), first.files.map((file) => file.id).sort());
  const after = await Promise.all([stat(videoPath), stat(imagePath)]);
  const bytesAfter = await Promise.all([readFile(videoPath), readFile(imagePath)]);
  assert.deepEqual(bytesAfter, bytesBefore);
  assert.deepEqual(after.map((entry) => entry.mtimeMs), before.map((entry) => entry.mtimeMs));

  const videoFirstIndexedAt = first.files.find((file) => file.mediaType === "video").firstIndexedAt;
  await writeFile(videoPath, "changed-fixture-bytes");
  const third = await scanVisualMediaLibrary(options);
  assert.equal(third.scan.probedMetadata, 1);
  assert.equal(third.scan.reusedMetadata, 1);
  assert.equal(third.files.find((file) => file.mediaType === "video").firstIndexedAt, videoFirstIndexedAt);
});

test("visual metadata is separate from the rebuildable index and survives store reloads", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "project-sequencer-visual-metadata-"));
  const metadataPath = path.join(root, "metadata.json");
  const id = "0123456789abcdef";
  const store = createVisualMetadataStore({ metadataPath });
  await store.initialize();
  await store.update(id, {
    displayTitle: "Campaign master",
    albumId: "album-a",
    trackId: "track-a",
    tags: ["Zion", "Zion", "Launch"],
    notes: "Approved visual relationship.",
    absolutePath: "/must/not/be/stored",
  });
  const reopened = createVisualMetadataStore({ metadataPath });
  await reopened.initialize();
  assert.deepEqual(reopened.get(id).tags, ["Zion", "Launch"]);
  assert.equal(reopened.get(id).trackId, "track-a");
  assert.equal(JSON.stringify(reopened.get(id)).includes("/must/not/be/stored"), false);
});

test("a malformed rebuildable visual cache is replaced atomically", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "project-sequencer-visual-cache-"));
  const cachePath = path.join(root, "visual-cache.json");
  await writeFile(path.join(root, "fixture.png"), "fixture-image");
  await writeFile(cachePath, "{ malformed cache");
  const result = await scanVisualMediaLibrary({
    roots: [{ id: "cache", label: "Cache", path: root, mediaTypes: ["image"] }],
    cachePath,
    probe: async () => ({ width: 100, height: 100, duration: 0, codec: "png", container: "png_pipe", probeError: "" }),
  });
  assert.equal(result.files.length, 1);
  assert.equal(result.scan.probedMetadata, 1);
  const repairedCache = await readFile(cachePath, "utf8");
  assert.doesNotThrow(() => JSON.parse(repairedCache));
  await assert.rejects(stat(`${cachePath}.tmp`), { code: "ENOENT" });
});

test("visualMediaKey normalizes separators without accepting an arbitrary path parameter", () => {
  assert.equal(visualMediaKey({ rootId: "media", relativePath: "Clips\\One.mov" }), "visual::media::Clips/One.mov");
});
