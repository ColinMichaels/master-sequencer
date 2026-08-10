import assert from "node:assert/strict";
import test from "node:test";
import { renameAlbumRecord } from "../src/lib/albums.js";

const album = () => ({
  id: "stable-album-id",
  title: "Working Title",
  coverRef: { rootId: "library", relativePath: "art/cover.png" },
  tracks: [{ id: "track-1", title: "Track One", candidates: [{ id: "candidate-1", sourceRef: { rootId: "library", relativePath: "audio/track.wav" } }] }],
});

test("renaming an album changes only its display title", () => {
  const albums = [album()];
  const originalIdentity = structuredClone({ id: albums[0].id, coverRef: albums[0].coverRef, tracks: albums[0].tracks });
  assert.equal(renameAlbumRecord(albums, "stable-album-id", "  New Album Name  "), true);
  assert.equal(albums[0].title, "New Album Name");
  assert.deepEqual({ id: albums[0].id, coverRef: albums[0].coverRef, tracks: albums[0].tracks }, originalIdentity);
});

test("blank names and unknown album IDs leave album records unchanged", () => {
  const albums = [album()];
  const original = structuredClone(albums);
  assert.equal(renameAlbumRecord(albums, "stable-album-id", "   "), false);
  assert.equal(renameAlbumRecord(albums, "missing-album", "New Name"), false);
  assert.deepEqual(albums, original);
});
