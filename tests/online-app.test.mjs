import assert from "node:assert/strict";
import test from "node:test";
import { createOnlineAppApi, onlineAppLibrary } from "../src/lib/online-app.js";

const memoryStorage = () => {
  const values = new Map();
  return {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, value),
  };
};

test("online app starts with the released Dreadnauts Album 1 and persists project changes in browser storage", async () => {
  const storage = memoryStorage();
  const first = createOnlineAppApi({ storage });
  const boot = await first.bootstrap();
  assert.equal(first.onlineApp, true);
  assert.equal(boot.library.length, 9);
  assert.equal(boot.state.settings.project.artistName, "The Dreadnauts");
  assert.equal(boot.state.albums[0].title, "Cosmic Reggae Sessions");
  assert.equal(boot.state.albums[0].tracks.at(-1).title, "Return to Earth");
  assert.match(first.mediaUrl(boot.library[0].key), /^https:\/\/audio-ssl\.itunes\.apple\.com\/itunes-assets\/AudioPreview/);
  assert.equal(new Set(boot.library.map((file) => first.mediaUrl(file.key))).size, 9);
  assert.equal(boot.library[0].extension, "m4a");
  assert.equal(boot.library[0].duration, 30);
  assert.deepEqual(boot.supportedFormats, ["m4a"]);
  assert.equal(boot.state.settings.project.setupComplete, true);
  assert.equal(JSON.stringify(boot).includes("/Users/"), false);

  boot.state.albums[0].title = "Saved in Browser";
  await first.saveState(boot.state);
  const second = createOnlineAppApi({ storage });
  assert.equal((await second.bootstrap()).state.albums[0].title, "Saved in Browser");
});

test("online app migrates existing browser projects without losing their saved decisions", async () => {
  const sourceStorage = memoryStorage();
  const sourceApi = createOnlineAppApi({ storage: sourceStorage });
  const sourceBoot = await sourceApi.bootstrap();
  await sourceApi.saveState(sourceBoot.state);
  const legacyWorkspace = JSON.parse(sourceStorage.getItem("project-sequencer-online-v1"));
  legacyWorkspace.projects[0].name = "The Dreadnauts — Album 1 Demo";
  legacyWorkspace.projects[0].state.masteringPresets.master[0].name = "Tester Finish";
  legacyWorkspace.projects[0].state.masteringPresets.master[0].id = "tester-finish";
  legacyWorkspace.projects[0].state.albums[0].tracks[0].candidates[0].flags.push("Hosted playback only");

  const migratedStorage = memoryStorage();
  migratedStorage.setItem("project-sequencer-hosted-tester-v3", JSON.stringify(legacyWorkspace));
  const migrated = await createOnlineAppApi({ storage: migratedStorage }).bootstrap();

  assert.equal(migrated.projects[0].name, "The Dreadnauts — Album 1");
  assert.equal(migrated.state.masteringPresets.master[0].name, "Release Finish");
  assert.equal(migrated.state.albums[0].tracks[0].candidates[0].flags.includes("Hosted playback only"), false);
  assert.ok(migratedStorage.getItem("project-sequencer-online-v1"));
});

test("online app supports separate browser-local projects and rejects local server capabilities", async () => {
  const storage = memoryStorage();
  const api = createOnlineAppApi({ storage });
  const created = await api.createProject({ name: "Second Project", artistName: "Artist", firstAlbumTitle: "New Album", era: "future" });
  assert.equal(created.state.albums[0].title, "New Album");
  assert.equal(created.projects.length, 2);
  await assert.rejects(api.registerSource({ path: "/device/audio" }), /local Project Sequencer server/);
  await assert.rejects(api.startRenderJob({}), /browser-session access/);
});

test("online waveform and analysis remain compact and contain no source paths", async () => {
  const api = createOnlineAppApi({ storage: memoryStorage() });
  const key = onlineAppLibrary[0].key;
  const waveform = await api.waveform(key, 620);
  const analysis = await api.technicalAnalysis(key);
  assert.equal(waveform.points.length, 620);
  assert.equal(waveform.duration, onlineAppLibrary[0].duration);
  assert.equal(typeof analysis.measurements.integratedLoudness, "number");
  assert.equal(JSON.stringify({ waveform, analysis }).includes("absolutePath"), false);
});

test("online app indexes selected device files and folders only for the current API session", async () => {
  const selections = {
    files: {
      cancelled: false,
      label: "Selected audio files",
      entries: [
        { file: { name: "Fresh Mix.wav", size: 576_000, lastModified: 1_786_329_600_000 }, relativePath: "Fresh Mix.wav" },
        { file: { name: "notes.txt", size: 12, lastModified: 1_786_329_600_001 }, relativePath: "notes.txt" },
      ],
    },
    folder: {
      cancelled: false,
      label: "Album Drafts",
      entries: [{ file: { name: "Deep Cut.flac", size: 960_000, lastModified: 1_786_329_600_002 }, relativePath: "Disc 1/Deep Cut.flac" }],
    },
  };
  const api = createOnlineAppApi({
    storage: memoryStorage(),
    sourcePicker: async (kind) => selections[kind],
    mediaUrlFactory: (file) => `blob:session/${encodeURIComponent(file.name)}`,
    metadataReader: async ({ file }) => ({ duration: file.name.endsWith(".wav") ? 12 : 20, probeError: "" }),
  });

  const pickedFiles = await api.chooseSources("files");
  assert.equal(pickedFiles.cancelled, false);
  assert.equal(pickedFiles.library.length, 10);
  assert.equal(pickedFiles.pickedKeys.length, 1);
  assert.equal(pickedFiles.library.at(-1).name, "Fresh Mix.wav");
  assert.equal(pickedFiles.library.at(-1).duration, 12);
  assert.equal(api.mediaUrl(pickedFiles.pickedKeys[0]), "blob:session/Fresh%20Mix.wav");

  const pickedFolder = await api.chooseSources("folder");
  assert.equal(pickedFolder.library.length, 11);
  assert.equal(pickedFolder.roots.at(-1).label, "Album Drafts");
  assert.equal(pickedFolder.library.at(-1).relativePath, "Disc 1/Deep Cut.flac");
  assert.match(pickedFolder.roots.at(-1).path, /current browser session only/);
  assert.equal(JSON.stringify(pickedFolder).includes("/Users/"), false);

  const freshSession = createOnlineAppApi({ storage: memoryStorage() });
  assert.equal((await freshSession.bootstrap()).library.length, 9);
});

test("online app handles picker cancellation and selections without supported audio", async () => {
  const cancelled = createOnlineAppApi({ storage: memoryStorage(), sourcePicker: async () => ({ cancelled: true, entries: [] }) });
  assert.equal((await cancelled.chooseSources("files")).cancelled, true);

  const unsupported = createOnlineAppApi({
    storage: memoryStorage(),
    sourcePicker: async () => ({ cancelled: false, label: "Documents", entries: [{ file: { name: "notes.txt" }, relativePath: "notes.txt" }] }),
  });
  await assert.rejects(unsupported.chooseSources("folder"), /No supported audio files/);
});
