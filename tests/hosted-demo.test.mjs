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
  assert.equal(first.mediaUrl(boot.library[0].key), "/demo-audio/funky-space-reggae-vibes");
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
  await assert.rejects(api.chooseSources("files"), /local Project Sequencer server/);
  await assert.rejects(api.startRenderJob({}), /hosted tester never receives/);
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
