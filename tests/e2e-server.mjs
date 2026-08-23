import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { e2eProjectState } from "./fixtures/e2e-project.mjs";
import { generateSineWave, generateTestImage, generateTestVideo } from "./helpers/audio-fixtures.mjs";

const runtime = await mkdtemp(path.join(tmpdir(), "project-sequencer-e2e-"));
const audioRoot = path.join(runtime, "audio");
const visualRoot = path.join(runtime, "visual");
const dataRoot = path.join(runtime, "data");
const configRoot = path.join(runtime, "config");
await Promise.all([mkdir(audioRoot), mkdir(visualRoot), mkdir(dataRoot), mkdir(configRoot)]);
await Promise.all([
  generateSineWave(path.join(audioRoot, "Alpha Tone.wav"), { duration: 1.1, frequency: 330 }),
  generateSineWave(path.join(audioRoot, "Alternate Mix.mp3"), { duration: 1.2, frequency: 440 }),
  generateSineWave(path.join(audioRoot, "Hidden Coda.wav"), { duration: 1.0, frequency: 550 }),
  generateSineWave(path.join(audioRoot, "Loose Sketch.mp3"), { duration: 0.9, frequency: 660 }),
  generateTestVideo(path.join(visualRoot, "Alpha Tone - Full Master.mp4")),
  generateTestImage(path.join(visualRoot, "Fixture Campaign Feed Square.png")),
]);

const baseConfigPath = path.join(configRoot, "base.json");
const localConfigPath = path.join(configRoot, "local.json");
const seedPath = path.join(dataRoot, "seed.json");
const statePath = path.join(dataRoot, "state.json");
await writeFile(baseConfigPath, JSON.stringify({
  host: "127.0.0.1",
  port: 4197,
  audioRoots: [{ id: "test-root", label: "Generated fixtures", path: audioRoot }],
  audioFiles: [],
  visualRoots: [{ id: "fixture-visuals", label: "Fixture Visuals", path: visualRoot, mediaTypes: ["video", "image"] }],
  privateSourceAliases: [{ id: "fixture-private-a", rootId: "test-root", relativePath: "Hidden Coda.wav" }],
  ignoreDirectories: [],
  metadataConcurrency: 2,
  renderTimeoutMs: 20_000,
  watchAudioRoots: false,
  includeHiddenDirectories: false,
}));
await writeFile(localConfigPath, "{}\n");
await writeFile(seedPath, `${JSON.stringify(e2eProjectState, null, 2)}\n`);
await writeFile(statePath, `${JSON.stringify(e2eProjectState, null, 2)}\n`);

process.env.PROJECT_SEQUENCER_CONFIG_PATH = baseConfigPath;
process.env.PROJECT_SEQUENCER_LOCAL_CONFIG_PATH = localConfigPath;
process.env.PROJECT_SEQUENCER_DATA_ROOT = dataRoot;
process.env.PROJECT_SEQUENCER_STATE_PATH = statePath;
process.env.PROJECT_SEQUENCER_SEED_PATH = seedPath;
process.env.PROJECT_SEQUENCER_RECOVERY_PATH = path.join(dataRoot, "state.last-known-good.json");
process.env.PROJECT_SEQUENCER_AUDIO_CACHE_PATH = path.join(dataRoot, "audio-cache.json");
process.env.PROJECT_SEQUENCER_VISUAL_CACHE_PATH = path.join(dataRoot, "visual-cache.json");
process.env.PROJECT_SEQUENCER_VISUAL_METADATA_PATH = path.join(dataRoot, "visual-metadata.json");
process.env.PROJECT_SEQUENCER_EXPORTS_PATH = path.join(runtime, "exports");
process.env.PROJECT_SEQUENCER_PORT = "4197";

await import("../server/index.mjs");
