import assert from "node:assert/strict";
import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { createStateStore, migrateState, validateState } from "../server/state-store.mjs";

const seed = {
  schemaVersion: 2,
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

test("version 1 project state migrates to the current schema without changing album authority", () => {
  const legacy = structuredClone(seed);
  legacy.schemaVersion = 1;
  const migrated = migrateState(legacy);
  assert.equal(migrated.schemaVersion, 2);
  assert.equal(migrated.activeAlbumId, legacy.activeAlbumId);
  assert.deepEqual(migrated.albums, legacy.albums);
});

test("future project-state versions are rejected without guessing", () => {
  const future = structuredClone(seed);
  future.schemaVersion = 99;
  assert.throws(() => migrateState(future), /newer than this application supports/);
});

test("state store preserves an invalid current record and requires explicit recovery", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "project-sequencer-state-recovery-"));
  const seedPath = path.join(root, "seed.json");
  const statePath = path.join(root, "state.json");
  const recoveryPath = path.join(root, "state.last-known-good.json");
  await writeFile(seedPath, JSON.stringify(seed));
  await writeFile(recoveryPath, JSON.stringify({ ...seed, albums: [{ ...seed.albums[0], title: "Recovered Album" }] }));
  await writeFile(statePath, "{ definitely not project json");

  const store = createStateStore({ seedPath, statePath, recoveryPath });
  await store.initialize();
  assert.equal(store.recoveryStatus().required, true);
  assert.equal(store.recoveryStatus().source, "last-known-good");
  assert.equal((await store.read()).albums[0].title, "Recovered Album");
  assert.equal(await readFile(statePath, "utf8"), "{ definitely not project json");
  await assert.rejects(() => store.write(seed), /Restore the recovery snapshot/);

  const restored = await store.restoreRecovery();
  assert.equal(restored.recovery.required, false);
  assert.equal(JSON.parse(await readFile(statePath, "utf8")).albums[0].title, "Recovered Album");
});

test("state store falls back to the portable seed when no valid recovery snapshot exists", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "project-sequencer-state-seed-recovery-"));
  const seedPath = path.join(root, "seed.json");
  const statePath = path.join(root, "state.json");
  const recoveryPath = path.join(root, "state.last-known-good.json");
  await writeFile(seedPath, JSON.stringify(seed));
  await writeFile(statePath, JSON.stringify({ schemaVersion: 99, albums: [] }));

  const store = createStateStore({ seedPath, statePath, recoveryPath });
  await store.initialize();
  assert.equal(store.recoveryStatus().source, "portable-seed");
  assert.equal((await store.read()).activeAlbumId, seed.activeAlbumId);
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
