import assert from "node:assert/strict";
import test from "node:test";
import {
  createVisualAssetReference,
  DEFAULT_VISUAL_LIBRARY_COLUMN_IDS,
  filterVisualItems,
  loadVisualLibraryColumnIds,
  normalizeVisualLibraryColumnIds,
  saveVisualLibraryColumnIds,
  summarizeVisualItems,
  VISUAL_LIBRARY_COLUMN_STORAGE_KEY,
  visualItemIsRelated,
} from "../src/lib/visual-library.js";

const album = { id: "album-a", title: "Signal Home", tracks: [{ id: "track-a", title: "Alpha Tone" }] };
const items = [
  { id: "1", key: "visual::r::alpha.mp4", rootId: "r", relativePath: "Alpha Tone/full-master.mp4", name: "full-master.mp4", extension: "mp4", mediaType: "video", aspect: "16:9", size: 10, duration: 4, firstIndexedAt: "2026-08-21T00:00:00.000Z", createdAt: "2026-08-18T00:00:00.000Z", modifiedAt: "2026-08-20T00:00:00.000Z", metadata: { displayTitle: "Alpha master", format: "youtube-master", platform: "YouTube", readiness: "Ready to post", collection: "Masters", albumId: "", trackId: "", tags: ["launch"] } },
  { id: "2", key: "visual::r::proof.png", rootId: "r", relativePath: "proof.png", name: "proof.png", extension: "png", mediaType: "image", aspect: "1:1", size: 4, duration: 0, firstIndexedAt: "2026-08-20T00:00:00.000Z", createdAt: "2026-08-19T00:00:00.000Z", modifiedAt: "2026-08-21T00:00:00.000Z", metadata: { displayTitle: "Review proof", format: "review-proof", platform: "Review", readiness: "Review", collection: "Proofs", albumId: "album-b", trackId: "", subjects: ["Pax"] } },
];

test("visual filtering searches metadata and favors active album or track relationships", () => {
  assert.equal(visualItemIsRelated(items[0], album, "track-a"), true);
  assert.equal(visualItemIsRelated(items[1], album, "track-a"), false);
  const focused = filterVisualItems(items, { scope: "project", format: "all", mediaType: "all", aspect: "all", trackId: "track-a", platform: "all", readiness: "all", query: "", sort: "recommended" }, album);
  assert.deepEqual(focused.map((item) => item.id), ["1"]);
  const searched = filterVisualItems(items, { scope: "all", format: "all", mediaType: "all", aspect: "all", trackId: "", platform: "all", readiness: "all", query: "pax proof", sort: "newest" }, album);
  assert.deepEqual(searched.map((item) => item.id), ["2"]);
});

test("visual filtering applies every major facet and deterministic sort", () => {
  const base = { scope: "all", format: "all", mediaType: "all", aspect: "all", trackId: "", platform: "all", readiness: "all", query: "", sort: "recommended" };
  assert.deepEqual(filterVisualItems(items, { ...base, format: "feed-square" }, album).map((item) => item.id), []);
  assert.deepEqual(filterVisualItems(items, { ...base, format: "review-proof" }, album).map((item) => item.id), ["2"]);
  assert.deepEqual(filterVisualItems(items, { ...base, mediaType: "image" }, album).map((item) => item.id), ["2"]);
  assert.deepEqual(filterVisualItems(items, { ...base, aspect: "16:9" }, album).map((item) => item.id), ["1"]);
  assert.deepEqual(filterVisualItems(items, { ...base, platform: "YouTube" }, album).map((item) => item.id), ["1"]);
  assert.deepEqual(filterVisualItems(items, { ...base, readiness: "Review" }, album).map((item) => item.id), ["2"]);
  assert.deepEqual(filterVisualItems(items, { ...base, trackId: "track-a" }, album).map((item) => item.id), ["1"]);
  assert.deepEqual(filterVisualItems(items, { ...base, sort: "newest" }, album).map((item) => item.id), ["2", "1"]);
  assert.deepEqual(filterVisualItems(items, { ...base, sort: "added" }, album).map((item) => item.id), ["1", "2"]);
  assert.deepEqual(filterVisualItems(items, { ...base, sort: "created" }, album).map((item) => item.id), ["2", "1"]);
  assert.deepEqual(filterVisualItems(items, { ...base, sort: "duration" }, album).map((item) => item.id), ["1", "2"]);
  assert.deepEqual(filterVisualItems(items, { ...base, sort: "size" }, album).map((item) => item.id), ["1", "2"]);
  assert.deepEqual(filterVisualItems(items, { ...base, sort: "title" }, album).map((item) => item.id), ["1", "2"]);
});

test("visual date sorts place missing or malformed timestamps last", () => {
  const base = { scope: "all", format: "all", mediaType: "all", aspect: "all", trackId: "", platform: "all", readiness: "all", query: "", sort: "recommended" };
  const unknownDates = { ...items[0], id: "3", name: "unknown.mp4", firstIndexedAt: "not-a-date", createdAt: "", modifiedAt: "invalid", metadata: { ...items[0].metadata, displayTitle: "Unknown dates" } };
  const datedItems = [...items, unknownDates];
  assert.deepEqual(filterVisualItems(datedItems, { ...base, sort: "newest" }, album).map((item) => item.id), ["2", "1", "3"]);
  assert.deepEqual(filterVisualItems(datedItems, { ...base, sort: "added" }, album).map((item) => item.id), ["1", "2", "3"]);
  assert.deepEqual(filterVisualItems(datedItems, { ...base, sort: "created" }, album).map((item) => item.id), ["2", "1", "3"]);
});

test("visual library column preferences preserve required columns and device-local choices", () => {
  const values = new Map();
  const storage = {
    getItem: (key) => values.get(key) || null,
    setItem: (key, value) => values.set(key, value),
  };
  assert.deepEqual(loadVisualLibraryColumnIds(storage), DEFAULT_VISUAL_LIBRARY_COLUMN_IDS);
  assert.deepEqual(normalizeVisualLibraryColumnIds(["codec", "not-a-column"]), ["preview", "title", "codec"]);
  assert.deepEqual(saveVisualLibraryColumnIds(["title", "codec"], storage), ["preview", "title", "codec"]);
  assert.equal(values.has(VISUAL_LIBRARY_COLUMN_STORAGE_KEY), true);
  assert.deepEqual(loadVisualLibraryColumnIds(storage), ["preview", "title", "codec"]);
  assert.deepEqual(loadVisualLibraryColumnIds({ getItem: () => { throw new Error("blocked"); } }), DEFAULT_VISUAL_LIBRARY_COLUMN_IDS);
  assert.deepEqual(saveVisualLibraryColumnIds(["codec"], { setItem: () => { throw new Error("blocked"); } }), ["preview", "title", "codec"]);
});

test("visual catalog summaries collect platforms and format counts in one pass", () => {
  const summary = summarizeVisualItems([
    ...items,
    { ...items[0], id: "3", metadata: { ...items[0].metadata, platform: "Vimeo" } },
    { ...items[0], id: "4", metadata: { ...items[0].metadata, platform: "YouTube", format: "" } },
  ]);
  assert.deepEqual(summary.platforms, ["Review", "Vimeo", "YouTube"]);
  assert.deepEqual([...summary.formatCounts], [["youtube-master", 2], ["review-proof", 1]]);
  assert.deepEqual(summarizeVisualItems(), { platforms: [], formatCounts: new Map() });
});

test("indexed visuals attach through the existing portable root-relative reference shape", () => {
  assert.deepEqual(createVisualAssetReference(items[0]), {
    id: "1",
    visualMediaKey: "visual::r::alpha.mp4",
    rootId: "r",
    relativePath: "Alpha Tone/full-master.mp4",
    name: "full-master.mp4",
    extension: "mp4",
    kind: "visual",
  });
});
