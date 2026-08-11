import assert from "node:assert/strict";
import test from "node:test";
import { assignFileToAlbum, buildImportedTracks } from "../src/lib/import-tracks.js";

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

test("album drops add matching file titles as candidates and never duplicate a source", () => {
  const album = {
    status: "empty",
    orderApproved: true,
    baselineTrackOrder: ["intergalactic"],
    tracks: [{ id: "intergalactic", title: "Intergalactic Mind Traveler", decisionStatus: "missing", auditionCandidateId: "", candidates: [] }],
  };
  const previewName = "02 Intergalactic Mind Traveler — Apple Music Preview.m4a";
  const preview = file(`library::${previewName}`, previewName);

  const added = assignFileToAlbum(album, preview);
  assert.equal(added.action, "candidate");
  assert.equal(added.trackId, "intergalactic");
  assert.equal(album.tracks[0].candidates.length, 1);
  assert.equal(album.tracks[0].decisionStatus, "undecided");
  assert.equal(album.tracks[0].auditionCandidateId, added.candidateId);
  assert.equal(album.status, "working");

  const duplicate = assignFileToAlbum(album, preview);
  assert.equal(duplicate.action, "duplicate");
  assert.equal(album.tracks[0].candidates.length, 1);
});

test("album drops create a sequenced track when no normalized title matches", () => {
  const album = { status: "empty", orderApproved: true, baselineTrackOrder: [], tracks: [] };
  const result = assignFileToAlbum(album, file("library::loose.wav", "03 Loose Sketch.wav"));

  assert.equal(result.action, "track");
  assert.equal(result.trackTitle, "Loose Sketch");
  assert.deepEqual(album.baselineTrackOrder, [result.trackId]);
  assert.equal(album.orderApproved, false);
  assert.equal(album.status, "working");
  assert.equal(album.tracks[0].candidates.length, 1);
});
