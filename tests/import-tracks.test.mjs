import assert from "node:assert/strict";
import test from "node:test";
import { assignFileToAlbum, buildImportedTracks, moveCandidateToTrack } from "../src/lib/import-tracks.js";

const file = (key, name, relativePath = name) => ({ key, name, relativePath, rootId: "library", extension: "wav" });

test("selected source files become ordered tracks with path references", () => {
  const result = buildImportedTracks([], [file("library::one.wav", "01 One (Alt Mix).wav"), file("library::two.wav", "02 Two.wav")]);
  assert.equal(result.skipped, 0);
  assert.equal(result.candidateCount, 0);
  assert.deepEqual(result.candidateAssignments, []);
  assert.deepEqual(result.tracks.map((track) => track.title), ["One", "Two"]);
  assert.deepEqual(result.tracks[0].candidates[0].sourceRef, { rootId: "library", relativePath: "01 One (Alt Mix).wav" });
  assert.equal(result.tracks[0].auditionCandidateId, "one-source-1");
});

test("existing source paths are skipped and matching titles become candidate assignments", () => {
  const existing = [{ id: "song", title: "Song", candidates: [{ sourceRef: { rootId: "library", relativePath: "used.wav" } }] }];
  const result = buildImportedTracks(existing, [file("library::used.wav", "used.wav"), file("library::new-a.wav", "Song.wav", "new-a.wav"), file("library::new-b.wav", "Song.wav", "new-b.wav")]);
  assert.equal(result.skipped, 1);
  assert.equal(result.candidateCount, 2);
  assert.deepEqual(result.tracks, []);
  assert.deepEqual(result.candidateAssignments.map(({ trackId, file: assignment }) => [trackId, assignment.key]), [
    ["song", "library::new-a.wav"],
    ["song", "library::new-b.wav"],
  ]);
});

test("same-title files in one import become candidates under one new track", () => {
  const result = buildImportedTracks([], [file("library::master.wav", "01 Signal (Master).wav"), file("library::demo.wav", "Signal (Demo).wav")]);

  assert.equal(result.tracks.length, 1);
  assert.equal(result.candidateCount, 1);
  assert.equal(result.tracks[0].title, "Signal");
  assert.equal(result.tracks[0].candidates.length, 2);
  assert.deepEqual(result.tracks[0].candidates.map((candidate) => candidate.sourceRef.relativePath), ["01 Signal (Master).wav", "Signal (Demo).wav"]);
  assert.equal(result.tracks[0].auditionCandidateId, "signal-source-1");
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

test("moving a candidate preserves its metadata and both track records while repairing source decisions", () => {
  const moved = { id: "alternate", label: "Alternate Mix", sourceRef: { rootId: "library", relativePath: "alternate.wav" }, flags: ["Needs review"], notes: "Keep this note" };
  const fallback = { id: "primary", label: "Primary Mix", sourceRef: { rootId: "library", relativePath: "primary.wav" }, flags: [], notes: "" };
  const album = {
    status: "working",
    tracks: [
      { id: "source", title: "Separate Import", decisionStatus: "approved", auditionCandidateId: "alternate", masterCandidateId: "alternate", humanApproved: true, candidates: [moved, fallback] },
      { id: "target", title: "Album Track", decisionStatus: "missing", auditionCandidateId: "", masterCandidateId: "", humanApproved: false, candidates: [] },
    ],
  };

  const result = moveCandidateToTrack(album, { sourceTrackId: "source", candidateId: "alternate", targetTrackId: "target", makeActive: true });

  assert.equal(result.action, "candidate-moved");
  assert.equal(album.tracks.length, 2);
  assert.deepEqual(album.tracks[0].candidates.map((candidate) => candidate.id), ["primary"]);
  assert.equal(album.tracks[0].auditionCandidateId, "primary");
  assert.equal(album.tracks[0].masterCandidateId, "");
  assert.equal(album.tracks[0].humanApproved, false);
  assert.equal(album.tracks[0].decisionStatus, "undecided");
  assert.deepEqual(album.tracks[1].candidates[0], moved);
  assert.equal(album.tracks[1].auditionCandidateId, "alternate");
  assert.equal(album.tracks[1].decisionStatus, "undecided");
});

test("moving the final candidate leaves a safe missing placeholder and rejects target duplicates", () => {
  const album = {
    status: "working",
    tracks: [
      { id: "source", title: "Separate Import", privacy: "protected", decisionStatus: "undecided", auditionCandidateId: "source-a", masterCandidateId: "", humanApproved: false, candidates: [{ id: "source-a", label: "Import", sourceRef: { rootId: "library", relativePath: "same.wav" }, flags: [], notes: "" }] },
      { id: "target", title: "Album Track", decisionStatus: "undecided", auditionCandidateId: "target-a", masterCandidateId: "", humanApproved: false, candidates: [{ id: "target-a", label: "Existing", sourceRef: { rootId: "library", relativePath: "other.wav" }, flags: [], notes: "" }] },
    ],
  };

  assert.equal(moveCandidateToTrack(album, { sourceTrackId: "source", candidateId: "source-a", targetTrackId: "target", makeActive: false }).action, "candidate-moved");
  assert.equal(album.tracks[0].decisionStatus, "missing");
  assert.equal(album.tracks[0].auditionCandidateId, "");
  assert.equal(album.tracks[0].candidates.length, 0);
  assert.equal(album.tracks[1].auditionCandidateId, "target-a");
  assert.equal(album.tracks[1].privacy, "protected");

  album.tracks[0].candidates.push({ id: "duplicate", label: "Duplicate", sourceRef: { rootId: "library", relativePath: "same.wav" }, flags: [], notes: "" });
  album.tracks[0].auditionCandidateId = "duplicate";
  const before = structuredClone(album);
  assert.equal(moveCandidateToTrack(album, { sourceTrackId: "source", candidateId: "duplicate", targetTrackId: "target", makeActive: true }).action, "duplicate");
  assert.deepEqual(album, before);
});
