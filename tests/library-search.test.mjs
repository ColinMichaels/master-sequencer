import assert from "node:assert/strict";
import test from "node:test";
import { createLibrarySearchIndex, saveLibraryFilter } from "../src/lib/library-search.js";

test("library search index narrows large catalogs without rescanning every field", () => {
  const index = createLibrarySearchIndex([
    { key: "a", name: "Alpha Master.wav", relativePath: "Album/Alpha Master.wav", extension: "wav" },
    { key: "b", name: "Beta Sketch.mp3", relativePath: "Ideas/Beta Sketch.mp3", extension: "mp3" },
  ]);
  assert.deepEqual([...index.search("alpha master")], ["a"]);
  assert.deepEqual([...index.search("sketch")], ["b"]);
  assert.deepEqual([...index.search("missing")], []);
});

test("saved library filters preserve explicit search and facet choices", () => {
  const settings = {};
  const id = saveLibraryFilter(settings, { name: "Unassigned WAV", query: "master", format: "wav", rootId: "masters", usageFilter: "unassigned" });
  assert.equal(id, "unassigned-wav");
  assert.deepEqual(settings.librarySavedFilters[0], { id, name: "Unassigned WAV", query: "master", format: "wav", rootId: "masters", usageFilter: "unassigned" });
});
