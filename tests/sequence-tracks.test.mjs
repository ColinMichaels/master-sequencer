import assert from "node:assert/strict";
import test from "node:test";
import { renameTrackTitle, sequenceTrackStatus, sequenceTracks, setSequenceTrackStatus, setTrackSequenced } from "../src/lib/sequence-tracks.js";

test("removing a track from the sequence preserves its complete record", () => {
  const track = {
    id: "track-two",
    title: "Track Two",
    candidates: [{ id: "candidate", lyricRefs: { distrokid: { rootId: "root", relativePath: "lyrics.txt" } } }],
    visualAssets: [{ rootId: "root", relativePath: "art.png" }],
    notes: "Keep this decision",
  };
  const album = { orderApproved: true, tracks: [{ id: "track-one" }, track, { id: "track-three" }] };

  assert.equal(setTrackSequenced(album, track.id, false), true);
  assert.deepEqual(sequenceTracks(album).map((item) => item.id), ["track-one", "track-three"]);
  assert.equal(album.tracks[1], track);
  assert.equal(track.candidates[0].lyricRefs.distrokid.relativePath, "lyrics.txt");
  assert.equal(track.visualAssets[0].relativePath, "art.png");
  assert.equal(track.notes, "Keep this decision");
  assert.equal(album.orderApproved, false);
});

test("restoring a track returns it to its stored sequence position", () => {
  const album = { orderApproved: false, tracks: [{ id: "one" }, { id: "two", inSequence: false }, { id: "three" }] };
  assert.equal(setTrackSequenced(album, "two", true), true);
  assert.deepEqual(sequenceTracks(album).map((track) => track.id), ["one", "two", "three"]);
  assert.equal("inSequence" in album.tracks[1], false);
});

test("sequence helpers ignore unknown track ids without changing the album", () => {
  const album = { orderApproved: true, tracks: [{ id: "one" }] };
  assert.equal(setTrackSequenced(album, "missing", false), false);
  assert.equal(album.orderApproved, true);
});

test("sequence status distinguishes a temporary audition from the selected master-sheet candidate", () => {
  const track = { decisionStatus: "undecided", auditionCandidateId: "candidate-a", masterCandidateId: "candidate-b" };
  assert.equal(sequenceTrackStatus(track), "undecided");
  track.masterCandidateId = "candidate-a";
  assert.equal(sequenceTrackStatus(track), "master-sheet");
});

test("sequence status changes preserve the audition source and only update the deliberate decision", () => {
  const track = { decisionStatus: "undecided", auditionCandidateId: "candidate-a", masterCandidateId: "" };

  assert.equal(setSequenceTrackStatus(track, "master-sheet"), true);
  assert.equal(track.auditionCandidateId, "candidate-a");
  assert.equal(track.masterCandidateId, "candidate-a");
  assert.equal(sequenceTrackStatus(track), "master-sheet");

  assert.equal(setSequenceTrackStatus(track, "undecided"), true);
  assert.equal(track.auditionCandidateId, "candidate-a");
  assert.equal(track.masterCandidateId, "");
  assert.equal(sequenceTrackStatus(track), "undecided");

  assert.equal(setSequenceTrackStatus(track, "provisional"), true);
  assert.equal(track.decisionStatus, "provisional");
  assert.equal(sequenceTrackStatus(track), "provisional");
});

test("sequence status cannot promote a track without an audition candidate", () => {
  const track = { decisionStatus: "missing", auditionCandidateId: "", masterCandidateId: "" };
  assert.equal(setSequenceTrackStatus(track, "master-sheet"), false);
  assert.equal(sequenceTrackStatus(track), "missing");
});

test("renaming a track changes only its display title and preserves its permanent record", () => {
  const candidate = { id: "candidate-a", sourceRef: { rootId: "root", relativePath: "source.wav" } };
  const track = { id: "track-a", title: "Old Title", decisionStatus: "approved", auditionCandidateId: "candidate-a", masterCandidateId: "candidate-a", notes: "Keep", candidates: [candidate] };
  const album = { orderApproved: true, tracks: [track] };

  assert.equal(renameTrackTitle(album, track.id, "  New   Song Title  "), true);
  assert.equal(track.title, "New Song Title");
  assert.equal(track.id, "track-a");
  assert.equal(track.candidates[0], candidate);
  assert.equal(track.notes, "Keep");
  assert.equal(track.masterCandidateId, "candidate-a");
  assert.equal(album.orderApproved, true);
});

test("track renaming rejects blank, unchanged, unknown, and protected titles", () => {
  const protectedTrack = { id: "protected", title: "[SIGNAL SOURCE WITHHELD]", privacy: "protected", candidates: [] };
  const album = { tracks: [{ id: "standard", title: "Song", candidates: [] }, protectedTrack] };

  assert.equal(renameTrackTitle(album, "standard", "   "), false);
  assert.equal(renameTrackTitle(album, "standard", "Song"), false);
  assert.equal(renameTrackTitle(album, "unknown", "New title"), false);
  assert.equal(renameTrackTitle(album, "protected", "Reveal"), false);
  assert.equal(protectedTrack.title, "[SIGNAL SOURCE WITHHELD]");
});
