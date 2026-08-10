import assert from "node:assert/strict";
import test from "node:test";
import { addAlbum, addBlankTrack, addTracksFromFiles, deleteAlbum, deleteTrackRecord, projectArtistName, restoreBaselineOrder, selectAlbum, setTrackInSequence, updateAlbum, updateProjectIdentity } from "../src/lib/project-commands.js";
import { normalizeMasterBus } from "../src/lib/mastering.js";

const project = () => ({
  activeAlbumId: "one",
  settings: { project: { artistName: "Project Artist", setupComplete: true } },
  albums: [{ id: "one", artist: "Project Artist", title: "One", status: "working", orderApproved: true, baselineTrackOrder: ["a", "b"], tracks: [
    { id: "b", title: "B", candidates: [] },
    { id: "a", title: "A", candidates: [] },
  ] }],
});

test("project commands keep album selection and nested updates explicit", () => {
  const state = project();
  assert.equal(selectAlbum(state, "missing"), false);
  assert.equal(updateAlbum(state, "one", (album) => { album.title = "Updated"; }), true);
  assert.equal(state.albums[0].title, "Updated");
});

test("album and blank-track commands create unique stable ids", () => {
  const state = project();
  const first = addAlbum(state, { title: "One", era: "future" });
  assert.equal(first, "one-2");
  assert.equal(state.albums.at(-1).artist, "Project Artist");
  assert.deepEqual(state.albums.at(-1).masterBus, normalizeMasterBus());
  const album = state.albums[0];
  assert.equal(addBlankTrack(album, "A"), "a-2");
  assert.equal(album.tracks.at(-1).humanApproved, false);
  assert.equal(album.baselineTrackOrder.at(-1), "a-2");
  assert.equal(album.orderApproved, false);
});

test("album deletion selects a neighboring album and never removes the final album", () => {
  const state = project();
  addAlbum(state, { title: "Two", era: "future" });
  assert.equal(state.activeAlbumId, "two");
  assert.equal(deleteAlbum(state, "two"), true);
  assert.equal(state.activeAlbumId, "one");
  assert.deepEqual(state.albums.map((album) => album.id), ["one"]);
  assert.equal(deleteAlbum(state, "one"), false);
  assert.deepEqual(state.albums.map((album) => album.id), ["one"]);
});

test("project identity is authoritative for existing layouts and future albums", () => {
  const state = project();
  assert.equal(projectArtistName(state), "Project Artist");
  assert.equal(updateProjectIdentity(state, { artistName: "  New Ensemble  " }), true);
  assert.deepEqual(state.settings.project, { artistName: "New Ensemble", setupComplete: true });
  assert.equal(state.albums[0].artist, "New Ensemble");
  addAlbum(state, { title: "Next Record", era: "future" });
  assert.equal(state.albums.at(-1).artist, "New Ensemble");
});

test("deleting a track record removes stale version and transition references", () => {
  const album = project().albums[0];
  album.sequenceVersions = [{ id: "version", name: "Version", trackOrder: ["a", "b"] }];
  album.transitionNotebook = [{ id: "a--b", fromTrackId: "a", toTrackId: "b" }];
  assert.equal(deleteTrackRecord(album, "a"), true);
  assert.deepEqual(album.sequenceVersions[0].trackOrder, ["b"]);
  assert.deepEqual(album.transitionNotebook, []);
  assert.equal(album.orderApproved, false);
});

test("track import, sequence membership, and baseline restoration preserve records", () => {
  const state = project();
  const album = state.albums[0];
  const result = addTracksFromFiles(album, [{ key: "root::new.wav", rootId: "root", relativePath: "new.wav", name: "New.wav" }]);
  assert.equal(result.tracks.length, 1);
  setTrackInSequence(album, "a", false);
  assert.equal(album.tracks.find((track) => track.id === "a").inSequence, false);
  restoreBaselineOrder(album);
  assert.deepEqual(album.tracks.slice(0, 2).map((track) => track.id), ["a", "b"]);
});
