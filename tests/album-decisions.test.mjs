import assert from "node:assert/strict";
import test from "node:test";
import {
  addTransitionMarker,
  compareSequenceVersions,
  createAlbumFromTemplate,
  ensureTransitionNote,
  readinessForAlbum,
  restoreSequenceVersion,
  saveAlbumTemplate,
  saveSequenceVersion,
  toggleComparisonCandidate,
} from "../src/lib/album-decisions.js";

const albumFixture = () => ({
  id: "album",
  artist: "Artist",
  title: "Record",
  era: "current",
  orderApproved: false,
  tracks: [
    { id: "one", title: "One", decisionStatus: "approved", auditionCandidateId: "one-a", masterCandidateId: "one-a", candidates: [{ id: "one-a", sourceRef: { rootId: "root", relativePath: "one.wav" }, lyricRefs: { distrokid: { rootId: "root", relativePath: "one.md" } } }], visualAssets: [], humanApproved: true },
    { id: "two", title: "Two", decisionStatus: "undecided", auditionCandidateId: "two-a", masterCandidateId: "", candidates: [{ id: "two-a", sourceRef: { rootId: "root", relativePath: "two.wav" } }, { id: "two-b", sourceRef: { rootId: "root", relativePath: "two-b.wav" } }], visualAssets: [] },
    { id: "three", title: "Three", decisionStatus: "missing", auditionCandidateId: "", masterCandidateId: "", candidates: [], visualAssets: [], inSequence: false },
  ],
  baselineTrackOrder: ["one", "two", "three"],
  visualAssets: [],
});

test("sequence versions snapshot, duplicate, compare, and restore order without changing track records", () => {
  const album = albumFixture();
  const first = saveSequenceVersion(album, "Opening order");
  [album.tracks[0], album.tracks[1]] = [album.tracks[1], album.tracks[0]];
  const second = saveSequenceVersion(album, "Alternate order", first);
  album.sequenceVersions.find((version) => version.id === second).trackOrder.reverse();
  const records = new Map(album.tracks.map((track) => [track.id, track]));
  const comparison = compareSequenceVersions(album, first, second);
  assert.equal(comparison.find((row) => row.trackId === "one").leftPosition, 1);
  assert.equal(restoreSequenceVersion(album, first), true);
  assert.deepEqual(album.tracks.slice(0, 2).map((track) => track.id), ["one", "two"]);
  assert.equal(album.tracks[0], records.get("one"));
  assert.equal(album.orderApproved, false);
});

test("transition notes keep pair markers and independent A/B settings", () => {
  const album = albumFixture();
  const entry = ensureTransitionNote(album, "one", "two");
  entry.notes = "Let the cymbal decay.";
  entry.variants.A.endMode = "crossfade";
  assert.ok(addTransitionMarker(entry, { label: "Vocal clear", seconds: 3.25 }));
  assert.equal(ensureTransitionNote(album, "one", "two"), entry);
  assert.equal(entry.markers[0].seconds, 3.25);
  assert.equal(entry.variants.B.endMode, "natural");
});

test("readiness gates remain separate and human approval is never inferred", () => {
  const album = albumFixture();
  album.orderApproved = true;
  const keys = new Set(["root::one.wav", "root::two.wav"]);
  const readiness = readinessForAlbum(album, keys, (reference) => `${reference.rootId}::${reference.relativePath}`);
  assert.deepEqual(readiness[0].gates, { playable: true, audition: true, master: true, disposition: true, lyrics: true, artwork: false, ordering: true, humanApproval: true });
  assert.equal(readiness[1].gates.master, false);
  assert.equal(readiness[1].gates.humanApproval, false);
});

test("comparison queues do not alter audition or master decisions", () => {
  const track = albumFixture().tracks[1];
  const before = [track.auditionCandidateId, track.masterCandidateId];
  assert.equal(toggleComparisonCandidate(track, "two-b"), true);
  assert.deepEqual(track.comparisonQueue, ["two-b"]);
  assert.deepEqual([track.auditionCandidateId, track.masterCandidateId], before);
});

test("album templates copy structure and mastering instructions without media or approvals", () => {
  const source = albumFixture();
  source.tracks[0].mastering = { endMode: "fade", endDuration: 2 };
  const state = { albums: [source], activeAlbumId: source.id, albumTemplates: [] };
  const templateId = saveAlbumTemplate(state, source, "LP skeleton");
  const albumId = createAlbumFromTemplate(state, templateId, "Next Record");
  const copy = state.albums.find((album) => album.id === albumId);
  assert.equal(copy.tracks[0].mastering.endMode, "fade");
  assert.deepEqual(copy.tracks[0].candidates, []);
  assert.equal(copy.tracks[0].humanApproved, false);
  assert.equal(copy.orderApproved, false);
  assert.equal(copy.masterBus.bypass, false);
  assert.equal(copy.masterBus.eq.enabled, false);
  assert.equal(copy.masterBus.compressor.enabled, false);
  assert.equal(copy.coverRef, undefined);
});
