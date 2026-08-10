import assert from "node:assert/strict";
import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { createStateStore, migrateState, validateState } from "../server/state-store.mjs";
import { normalizeMasterBus } from "../src/lib/mastering.js";

const seed = {
  schemaVersion: 5,
  albumTemplates: [],
  activeAlbumId: "album",
  settings: { project: { artistName: "Test Artist", setupComplete: true }, revealPrivateFilenames: false },
  albums: [{ id: "album", title: "Album", masterBus: normalizeMasterBus(), tracks: [{ id: "track", title: "Track", candidates: [] }] }],
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

test("saved projects preserve the old project when creating and loading a fresh one", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "project-sequencer-projects-"));
  const seedPath = path.join(root, "seed.json");
  const statePath = path.join(root, "state.json");
  const projectsIndexPath = path.join(root, "project-index.json");
  const projectsRoot = path.join(root, "projects");
  await writeFile(seedPath, JSON.stringify(seed));
  const store = createStateStore({ seedPath, statePath, projectsIndexPath, projectsRoot });
  await store.initialize();

  const originalId = store.activeProjectId();
  const original = structuredClone(await store.read());
  original.albums[0].title = "Saved Old Album";
  await store.write(original);

  const created = await store.createProject({ name: "Fresh Sessions", artistName: "New Artist", firstAlbumTitle: "Clean Slate", era: "current" });
  assert.notEqual(created.activeProjectId, originalId);
  assert.equal(created.projects.length, 2);
  assert.equal(created.state.settings.project.artistName, "New Artist");
  assert.equal(created.state.albums[0].title, "Clean Slate");
  assert.equal(created.state.albums[0].tracks.length, 0);

  const loaded = await store.loadProject(originalId);
  assert.equal(loaded.activeProjectId, originalId);
  assert.equal(loaded.state.albums[0].title, "Saved Old Album");
  assert.equal(JSON.parse(await readFile(path.join(projectsRoot, `${originalId}.json`), "utf8")).albums[0].title, "Saved Old Album");
});

test("a malformed saved-project index is preserved instead of silently replaced", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "project-sequencer-project-index-"));
  const seedPath = path.join(root, "seed.json");
  const statePath = path.join(root, "state.json");
  const projectsIndexPath = path.join(root, "project-index.json");
  await writeFile(seedPath, JSON.stringify(seed));
  await writeFile(statePath, JSON.stringify(seed));
  await writeFile(projectsIndexPath, "{ broken project index");
  const store = createStateStore({ seedPath, statePath, projectsIndexPath, projectsRoot: path.join(root, "projects") });
  await assert.rejects(() => store.initialize());
  assert.equal(await readFile(projectsIndexPath, "utf8"), "{ broken project index");
});

test("version 1 project state migrates to the current schema without changing album authority", () => {
  const legacy = structuredClone(seed);
  legacy.schemaVersion = 1;
  delete legacy.settings.project;
  const migrated = migrateState(legacy);
  assert.equal(migrated.schemaVersion, 5);
  assert.deepEqual(migrated.albumTemplates, []);
  assert.deepEqual(migrated.settings.librarySavedFilters, []);
  assert.equal(migrated.activeAlbumId, legacy.activeAlbumId);
  assert.deepEqual(migrated.albums[0].tracks, legacy.albums[0].tracks);
  assert.deepEqual(migrated.albums[0].masterBus, normalizeMasterBus());
  assert.deepEqual(migrated.albums[0].delivery, { profileId: "", masterApproved: false, readyToPublish: false });
  assert.deepEqual(migrated.albums[0].sequenceVersions, []);
  assert.deepEqual(migrated.albums[0].transitionNotebook, []);
  assert.deepEqual(migrated.settings.project, { artistName: "Untitled Artist", setupComplete: true });
});

test("version 2 project state inherits its artist without interrupting an existing project", () => {
  const legacy = structuredClone(seed);
  legacy.schemaVersion = 2;
  legacy.albums[0].artist = "Legacy Ensemble";
  delete legacy.settings.project;
  const migrated = migrateState(legacy);
  assert.equal(migrated.schemaVersion, 5);
  assert.deepEqual(migrated.albumTemplates, []);
  assert.deepEqual(migrated.settings.librarySavedFilters, []);
  assert.deepEqual(migrated.settings.project, { artistName: "Legacy Ensemble", setupComplete: true });
  assert.deepEqual(migrated.albums[0].tracks, legacy.albums[0].tracks);
  assert.deepEqual(migrated.albums[0].masterBus, normalizeMasterBus());
  assert.deepEqual(migrated.albums[0].delivery, { profileId: "", masterApproved: false, readyToPublish: false });
});

test("version 3 project state gains a neutral MASTER bus without changing track authority", () => {
  const legacy = structuredClone(seed);
  legacy.schemaVersion = 3;
  delete legacy.albums[0].masterBus;
  legacy.albums[0].tracks[0].masterCandidateId = "";
  legacy.albums[0].tracks[0].auditionCandidateId = "";
  const migrated = migrateState(legacy);
  assert.equal(migrated.schemaVersion, 5);
  assert.deepEqual(migrated.albumTemplates, []);
  assert.deepEqual(migrated.settings.librarySavedFilters, []);
  assert.deepEqual(migrated.albums[0].masterBus, normalizeMasterBus());
  assert.deepEqual(migrated.albums[0].delivery, { profileId: "", masterApproved: false, readyToPublish: false });
  assert.deepEqual(migrated.albums[0].sequenceVersions, []);
  assert.deepEqual(migrated.albums[0].transitionNotebook, []);
  assert.equal(migrated.albums[0].tracks[0].masterCandidateId, "");
  assert.equal(migrated.albums[0].tracks[0].auditionCandidateId, "");
});

test("version 4 project state gains neutral saved library filters", () => {
  const legacy = structuredClone(seed);
  legacy.schemaVersion = 4;
  delete legacy.settings.librarySavedFilters;
  const migrated = migrateState(legacy);
  assert.equal(migrated.schemaVersion, 5);
  assert.deepEqual(migrated.settings.librarySavedFilters, []);
  assert.deepEqual(migrated.albums[0].masterBus, normalizeMasterBus());
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
  valid.albums[0].tracks[0].mastering = { trimStart: 1.25, trimEnd: 20, fadeIn: 0.5, endMode: "crossfade", endDuration: 3, gapAfter: 0, gainDb: -4.5 };
  assert.equal(validateState(valid), valid);

  const invalid = structuredClone(seed);
  invalid.albums[0].tracks[0].mastering = { endMode: "vanish" };
  assert.throws(() => validateState(invalid), /unsupported ending mode/);

  const excessiveGain = structuredClone(seed);
  excessiveGain.albums[0].tracks[0].mastering = { gainDb: 12.1 };
  assert.throws(() => validateState(excessiveGain), /gainDb must be between -24 and 12/);
});

test("state validation accepts a complete MASTER bus and rejects unsafe DSP values", () => {
  const valid = structuredClone(seed);
  valid.albums[0].masterBus.eq.enabled = true;
  valid.albums[0].masterBus.eq.midBand = { frequencyHz: 2400, gainDb: -1.5, q: 0.8 };
  valid.albums[0].masterBus.compressor = {
    ...valid.albums[0].masterBus.compressor,
    enabled: true,
    thresholdDb: -16,
    ratio: 1.8,
  };
  assert.equal(validateState(valid), valid);

  const invalidRatio = structuredClone(seed);
  invalidRatio.albums[0].masterBus.compressor.ratio = 21;
  assert.throws(() => validateState(invalidRatio), /compressor ratio must be between 1 and 20/);

  const invalidLink = structuredClone(seed);
  invalidLink.albums[0].masterBus.compressor.link = "independent";
  assert.throws(() => validateState(invalidLink), /compressor link must be average or maximum/);

  const missingBus = structuredClone(seed);
  delete missingBus.albums[0].masterBus;
  assert.throws(() => validateState(missingBus), /MASTER bus must be an object/);
});

test("state validation accepts appearance preferences and rejects unsupported choices", () => {
  const valid = structuredClone(seed);
  valid.settings.appearance = { mode: "system", colorTheme: "ocean", fontTheme: "editorial", textScale: 1.2 };
  assert.equal(validateState(valid), valid);

  const invalid = structuredClone(seed);
  invalid.settings.appearance = { mode: "ultraviolet" };
  assert.throws(() => validateState(invalid), /Unsupported appearance mode/);
});

test("state validation requires a portable project artist and setup status", () => {
  const missingArtist = structuredClone(seed);
  missingArtist.settings.project.artistName = "   ";
  assert.throws(() => validateState(missingArtist), /Project artist name/);

  const invalidSetup = structuredClone(seed);
  invalidSetup.settings.project.setupComplete = "yes";
  assert.throws(() => validateState(invalidSetup), /Project setup status/);
});

test("state validation keeps delivery profile, master approval, and publish readiness separate", () => {
  const valid = structuredClone(seed);
  valid.albums[0].delivery = { profileId: "archive-wav", masterApproved: false, readyToPublish: true };
  assert.equal(validateState(valid), valid);
  const invalid = structuredClone(valid);
  invalid.albums[0].delivery.profileId = "automatic-publisher";
  assert.throws(() => validateState(invalid), /unsupported delivery profile/);
});

test("state validation accepts unique saved library filters and rejects malformed entries", () => {
  const valid = structuredClone(seed);
  valid.settings.librarySavedFilters = [{ id: "wav", name: "WAV", query: "master", format: "wav", rootId: "all", usageFilter: "all" }];
  assert.equal(validateState(valid), valid);
  const invalid = structuredClone(valid);
  invalid.settings.librarySavedFilters.push({ ...invalid.settings.librarySavedFilters[0] });
  assert.throws(() => validateState(invalid), /Duplicate saved library filter/);
});
