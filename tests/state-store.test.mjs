import assert from "node:assert/strict";
import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { createStateStore, validateState } from "../server/state-store.mjs";

const seed = {
  schemaVersion: 1,
  activeAlbumId: "album",
  settings: { revealPrivateFilenames: false },
  albums: [{ id: "album", title: "Album", tracks: [{ id: "track", title: "Track", candidates: [] }] }],
};

test("state validation rejects duplicate track ids", () => {
  const invalid = structuredClone(seed);
  invalid.albums[0].tracks.push({ id: "track", title: "Duplicate", candidates: [] });
  assert.throws(() => validateState(invalid), /Duplicate track id/);
});

test("state store initializes from seed and writes atomically", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "project-sequencer-state-"));
  const seedPath = path.join(root, "seed.json");
  const statePath = path.join(root, "state.json");
  await writeFile(seedPath, JSON.stringify(seed));
  const store = createStateStore({ seedPath, statePath });
  await store.initialize();
  const initial = await store.read();
  assert.equal(initial.activeAlbumId, "album");
  initial.albums[0].title = "Updated Album";
  await store.write(initial);
  assert.equal((await store.read()).albums[0].title, "Updated Album");
});

test("state store serializes overlapping writes so the latest state wins", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "project-sequencer-state-queue-"));
  const seedPath = path.join(root, "seed.json");
  const statePath = path.join(root, "state.json");
  await writeFile(seedPath, JSON.stringify(seed));
  const store = createStateStore({ seedPath, statePath });
  await store.initialize();
  const first = structuredClone(seed);
  const second = structuredClone(seed);
  const third = structuredClone(seed);
  first.albums[0].title = "First";
  second.albums[0].title = "Second";
  third.albums[0].title = "Third";
  await Promise.all([store.write(first), store.write(second), store.write(third)]);
  assert.equal((await store.read()).albums[0].title, "Third");
});

test("state validation accepts visual assets and typed candidate lyric references", () => {
  const next = structuredClone(seed);
  const album = next.albums[0];
  album.visualAssets = [{ rootId: "library", relativePath: "Album Art/cover.png" }];
  album.tracks[0].visualAssets = [{ rootId: "library", relativePath: "Track Art/storyboard.jpg" }];
  album.tracks[0].candidates.push({
    id: "candidate",
    sourceRef: { rootId: "library", relativePath: "Audio/song.wav" },
    lyricRefs: {
      sunoPrompt: { rootId: "library", relativePath: "Songs/song.md" },
      distrokid: { rootId: "library", relativePath: "Songs/song-clean.txt" },
    },
  });
  assert.equal(validateState(next), next);
});

test("state validation rejects ambiguous, duplicate, and stale candidate references", () => {
  const duplicate = structuredClone(seed);
  duplicate.albums[0].tracks[0].candidates = [
    { id: "candidate", sourceRef: { rootId: "library", relativePath: "Audio/one.wav" } },
    { id: "candidate", sourceRef: { rootId: "library", relativePath: "Audio/two.wav" } },
  ];
  assert.throws(() => validateState(duplicate), /Duplicate candidate id/);

  const ambiguous = structuredClone(seed);
  ambiguous.albums[0].tracks[0].candidates = [{
    id: "candidate",
    sourceRef: { privateSourceId: "private", rootId: "library", relativePath: "Audio/one.wav" },
  }];
  assert.throws(() => validateState(ambiguous), /exactly one indexed source/);

  const stale = structuredClone(seed);
  stale.albums[0].tracks[0].masterCandidateId = "missing-candidate";
  assert.throws(() => validateState(stale), /master candidate does not exist/);
});

test("state validation keeps the baseline order unique and attached to real tracks", () => {
  const repeated = structuredClone(seed);
  repeated.albums[0].baselineTrackOrder = ["track", "track"];
  assert.throws(() => validateState(repeated), /baseline order repeats track/);

  const unknown = structuredClone(seed);
  unknown.albums[0].baselineTrackOrder = ["unknown"];
  assert.throws(() => validateState(unknown), /baseline order references an unknown track/);
});

test("state validation rejects unsafe project-asset paths", () => {
  const invalid = structuredClone(seed);
  invalid.albums[0].visualAssets = [{ rootId: "library", relativePath: "../secret.png" }];
  assert.throws(() => validateState(invalid), /safe relative path/i);
});

test("state validation accepts a removed-from-sequence track and rejects invalid flags", () => {
  const valid = structuredClone(seed);
  valid.albums[0].tracks[0].inSequence = false;
  assert.equal(validateState(valid), valid);

  const invalid = structuredClone(seed);
  invalid.albums[0].tracks[0].inSequence = "no";
  assert.throws(() => validateState(invalid), /inSequence must be a boolean/);
});

test("state validation accepts mastering settings and rejects invalid endings", () => {
  const valid = structuredClone(seed);
  valid.albums[0].tracks[0].mastering = { trimStart: 1.25, trimEnd: 20, fadeIn: 0.5, endMode: "crossfade", endDuration: 3, gapAfter: 0 };
  assert.equal(validateState(valid), valid);

  const invalid = structuredClone(seed);
  invalid.albums[0].tracks[0].mastering = { endMode: "vanish" };
  assert.throws(() => validateState(invalid), /unsupported ending mode/);
});

test("state validation accepts appearance preferences and rejects unsupported choices", () => {
  const valid = structuredClone(seed);
  valid.settings.appearance = { mode: "system", colorTheme: "ocean", fontTheme: "editorial", textScale: 1.2 };
  assert.equal(validateState(valid), valid);

  const invalid = structuredClone(seed);
  invalid.settings.appearance = { mode: "ultraviolet" };
  assert.throws(() => validateState(invalid), /Unsupported appearance mode/);
});
