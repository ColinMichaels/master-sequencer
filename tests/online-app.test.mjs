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
  await assert.rejects(api.registerSource({ path: "/device/audio" }), /not available in the browser/);
  await assert.rejects(api.startRenderJob({}), /browser-granted access/);
});

test("online app removes only a saved project record and switches away from an active removal", async () => {
  const storage = memoryStorage();
  const api = createOnlineAppApi({ storage });
  const initial = await api.bootstrap();
  const originalId = initial.activeProjectId;
  const created = await api.createProject({ name: "Temporary Project", artistName: "Artist", firstAlbumTitle: "Temporary Album", era: "future" });
  const removed = await api.deleteProject(created.activeProjectId);
  assert.equal(removed.activeProjectId, originalId);
  assert.equal(removed.projects.length, 1);
  assert.equal(removed.state.albums[0].title, "Cosmic Reggae Sessions");
  await assert.rejects(api.deleteProject(originalId), /final saved project cannot be removed/i);

  const keepOpen = await api.createProject({ name: "Keep Open", artistName: "Artist", firstAlbumTitle: "Open Album", era: "current" });
  const removedInactive = await api.deleteProject(originalId);
  assert.equal(removedInactive.activeProjectId, keepOpen.activeProjectId);
  assert.equal(removedInactive.projects.length, 1);
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

test("online app probes selected audio in parallel and keeps files whose metadata cannot be read", async () => {
  let activeReaders = 0;
  let maximumReaders = 0;
  const files = ["One.wav", "Two.wav", "Unreadable.wav"].map((name) => ({ file: { name, size: 32_000, lastModified: 1 }, relativePath: name }));
  const api = createOnlineAppApi({
    storage: memoryStorage(),
    sourcePicker: async () => ({ cancelled: false, label: "Parallel selection", entries: files }),
    mediaUrlFactory: (file) => `blob:session/${file.name}`,
    metadataReader: async ({ file }) => {
      activeReaders += 1;
      maximumReaders = Math.max(maximumReaders, activeReaders);
      await new Promise((resolve) => setTimeout(resolve, 10));
      activeReaders -= 1;
      if (file.name === "Unreadable.wav") throw new Error("Metadata unavailable");
      return { duration: 2, probeError: "" };
    },
  });

  const result = await api.chooseSources("files");
  assert.equal(maximumReaders, 3);
  assert.equal(result.pickedKeys.length, 3);
  assert.equal(result.library.length, onlineAppLibrary.length + 3);
  assert.equal(result.library.find((file) => file.name === "Unreadable.wav").duration, 0);
  assert.match(result.library.find((file) => file.name === "Unreadable.wav").probeError, /Metadata unavailable/);
});

test("online app restores a persisted browser folder without prompting and requires a user action when permission expires", async () => {
  const records = new Map();
  const mediaRegistry = {
    list: async () => [...records.values()],
    save: async (record) => {
      records.set(record.id, record);
      return record;
    },
    delete: async (id) => records.delete(id),
  };
  const file = { name: "Remembered Mix.wav", size: 384_000, lastModified: 1_786_329_600_000 };
  let permission = "granted";
  let queryCount = 0;
  let requestCount = 0;
  const fileHandle = { kind: "file", name: file.name, getFile: async () => file };
  const handle = {
    kind: "directory",
    name: "Remembered folder",
    getFile: async () => file,
    values: async function* values() {
      yield fileHandle;
    },
    queryPermission: async () => {
      queryCount += 1;
      return permission;
    },
    requestPermission: async () => {
      requestCount += 1;
      permission = "granted";
      return permission;
    },
  };
  const options = {
    storage: memoryStorage(),
    mediaRegistry,
    mediaUrlFactory: (picked) => `blob:device/${encodeURIComponent(picked.name)}`,
    metadataReader: async () => ({ duration: 8, probeError: "" }),
  };
  const first = createOnlineAppApi({
    ...options,
    sourcePicker: async () => ({
      cancelled: false,
      persistent: true,
      kind: "folder",
      label: "Remembered folder",
      handle,
      entries: [{ file, relativePath: file.name }],
    }),
  });
  const selected = await first.chooseSources("folder");
  const persistentRoot = selected.roots.at(-1);
  assert.equal(persistentRoot.kind, "browser-persistent");
  assert.match(persistentRoot.path, /Permission retained/);
  assert.equal(records.size, 1);

  const restored = await createOnlineAppApi(options).bootstrap();
  assert.equal(restored.library.length, onlineAppLibrary.length + 1);
  assert.equal(restored.roots.at(-1).id, persistentRoot.id);
  assert.equal(restored.roots.at(-1).connected, true);
  assert.equal(requestCount, 0, "bootstrap must never open a browser permission prompt");
  assert.ok(queryCount > 0);

  permission = "prompt";
  const needsPermissionApi = createOnlineAppApi(options);
  const needsPermission = await needsPermissionApi.bootstrap();
  assert.equal(needsPermission.library.length, onlineAppLibrary.length);
  assert.equal(needsPermission.roots.at(-1).connectionState, "permission-required");
  assert.equal(requestCount, 0, "permission remains user-initiated");

  const reconnected = await needsPermissionApi.reconnectSource(persistentRoot.id);
  assert.equal(requestCount, 1);
  assert.equal(reconnected.library.length, onlineAppLibrary.length + 1);
  assert.equal(reconnected.roots.at(-1).connectionState, "reconnected");
  assert.equal(JSON.stringify(reconnected).includes("/Users/"), false);

  await needsPermissionApi.removeSource(persistentRoot.id);
  assert.equal(records.size, 0);
});
