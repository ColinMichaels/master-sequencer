import assert from "node:assert/strict";
import test from "node:test";
import { sequenceTracks, setTrackSequenced } from "../src/lib/sequence-tracks.js";

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
