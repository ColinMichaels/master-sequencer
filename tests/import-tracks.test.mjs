import assert from "node:assert/strict";
import test from "node:test";
import { buildImportedTracks } from "../src/lib/import-tracks.js";

const file = (key, name, relativePath = name) => ({ key, name, relativePath, rootId: "library", extension: "wav" });

test("selected source files become ordered tracks with path references", () => {
  const result = buildImportedTracks([], [file("library::one.wav", "01 One (Alt Mix).wav"), file("library::two.wav", "02 Two.wav")]);
  assert.equal(result.skipped, 0);
  assert.deepEqual(result.tracks.map((track) => track.title), ["One", "Two"]);
  assert.deepEqual(result.tracks[0].candidates[0].sourceRef, { rootId: "library", relativePath: "01 One (Alt Mix).wav" });
  assert.equal(result.tracks[0].auditionCandidateId, "one-source-1");
});

test("existing source paths are skipped and duplicate titles get unique ids", () => {
  const existing = [{ id: "song", title: "Song", candidates: [{ sourceRef: { rootId: "library", relativePath: "used.wav" } }] }];
  const result = buildImportedTracks(existing, [file("library::used.wav", "used.wav"), file("library::new-a.wav", "Song.wav", "new-a.wav"), file("library::new-b.wav", "Song.wav", "new-b.wav")]);
  assert.equal(result.skipped, 1);
  assert.deepEqual(result.tracks.map((track) => track.id), ["song-2", "song-3"]);
});
