import assert from "node:assert/strict";
import test from "node:test";
import { createHostedDemoApi, hostedDemoLibrary } from "../src/lib/hosted-demo.js";

const memoryStorage = () => {
  const values = new Map();
  return {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, value),
  };
};

test("hosted tester starts with the released Dreadnauts Album 1 and persists project changes in browser storage", async () => {
  const storage = memoryStorage();
  const first = createHostedDemoApi({ storage });
  const boot = await first.bootstrap();
  assert.equal(first.hostedDemo, true);
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
  const second = createHostedDemoApi({ storage });
  assert.equal((await second.bootstrap()).state.albums[0].title, "Saved in Browser");
});

test("hosted tester supports separate browser-local projects and rejects local server capabilities", async () => {
  const storage = memoryStorage();
  const api = createHostedDemoApi({ storage });
  const created = await api.createProject({ name: "Second Project", artistName: "Tester", firstAlbumTitle: "New Album", era: "future" });
  assert.equal(created.state.albums[0].title, "New Album");
  assert.equal(created.projects.length, 2);
  await assert.rejects(api.registerSource({ path: "/device/audio" }), /local Project Sequencer server/);
  await assert.rejects(api.startRenderJob({}), /browser-session access/);
});

test("hosted waveform and analysis remain compact and contain no source paths", async () => {
  const api = createHostedDemoApi({ storage: memoryStorage() });
  const key = hostedDemoLibrary[0].key;
  const waveform = await api.waveform(key, 620);
  const analysis = await api.technicalAnalysis(key);
  assert.equal(waveform.points.length, 620);
  assert.equal(waveform.duration, hostedDemoLibrary[0].duration);
  assert.equal(typeof analysis.measurements.integratedLoudness, "number");
  assert.equal(JSON.stringify({ waveform, analysis }).includes("absolutePath"), false);
});

test("hosted tester indexes selected device files and folders only for the current API session", async () => {
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
  const api = createHostedDemoApi({
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

  const freshSession = createHostedDemoApi({ storage: memoryStorage() });
  assert.equal((await freshSession.bootstrap()).library.length, 9);
});

test("hosted tester handles picker cancellation and selections without supported audio", async () => {
  const cancelled = createHostedDemoApi({ storage: memoryStorage(), sourcePicker: async () => ({ cancelled: true, entries: [] }) });
  assert.equal((await cancelled.chooseSources("files")).cancelled, true);

  const unsupported = createHostedDemoApi({
    storage: memoryStorage(),
    sourcePicker: async () => ({ cancelled: false, label: "Documents", entries: [{ file: { name: "notes.txt" }, relativePath: "notes.txt" }] }),
  });
  await assert.rejects(unsupported.chooseSources("folder"), /No supported audio files/);
});
