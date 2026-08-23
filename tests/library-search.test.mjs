import assert from "node:assert/strict";
import test from "node:test";
import { createLibrarySearchIndex, saveLibraryFilter } from "../src/lib/library-search.js";

test("library search index narrows large catalogs without rescanning every field", () => {
  const index = createLibrarySearchIndex([
    { key: "a", name: "Alpha Master.wav", relativePath: "Album/Alpha Master.wav", extension: "wav" },
    { key: "b", name: "Beta Sketch.mp3", relativePath: "Ideas/Beta Sketch.mp3", extension: "mp3" },
    { key: "c", name: "Alpha Rough Mix.wav", relativePath: "Archive/Alpha Rough Mix.wav", extension: "wav" },
  ]);
  assert.deepEqual([...index.search("alpha master")], ["a"]);
  assert.deepEqual([...index.search("master alpha")], ["a"]);
  assert.deepEqual([...index.search("alpa master")], ["a"]);
  assert.deepEqual([...index.search("alpha")], ["a", "c"]);
  assert.deepEqual([...index.search("sketch")], ["b"]);
  assert.deepEqual([...index.search("missing")], []);
});

test("library search ranks filename matches before album and track relationship matches", () => {
  const additionalTextByKey = new Map([
    ["a", "Fixture Album Alpha Tone"],
    ["b", "Fixture Album Alpha Tone"],
  ]);
  const index = createLibrarySearchIndex([
    { key: "a", name: "Alpha Tone.wav", relativePath: "Masters/Alpha Tone.wav", extension: "wav" },
    { key: "b", name: "Alternate Mix.mp3", relativePath: "Masters/Alternate Mix.mp3", extension: "mp3" },
  ], { additionalTextByKey });
  assert.deepEqual([...index.search("tone alpha")], ["a", "b"]);
  assert.deepEqual([...index.search("fixture alternate")], ["b"]);
});

test("saved library filters preserve explicit search and facet choices", () => {
  const settings = {};
  const id = saveLibraryFilter(settings, { name: "Unassigned WAV", query: "master", format: "wav", rootId: "masters", usageFilter: "unassigned" });
  assert.equal(id, "unassigned-wav");
  assert.deepEqual(settings.librarySavedFilters[0], { id, name: "Unassigned WAV", query: "master", format: "wav", rootId: "masters", usageFilter: "unassigned" });
});
