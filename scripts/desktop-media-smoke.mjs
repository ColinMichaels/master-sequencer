import { spawn, spawnSync } from "node:child_process";
import { mkdir, rename, rm, writeFile } from "node:fs/promises";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createDefaultAdvancedMastering } from "../src/lib/advanced-mastering.js";
import { normalizeMasterBus } from "../src/lib/mastering.js";
import { createMasteringPresetLibrary } from "../src/lib/mastering-presets.js";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const packaged = process.argv.includes("--packaged");
const executable = packaged && process.platform === "darwin"
  ? path.join(projectRoot, "release", "mac-arm64", "Project Sequencer.app", "Contents", "MacOS", "Project Sequencer")
  : path.join(projectRoot, "node_modules", ".bin", process.platform === "win32" ? "electron.cmd" : "electron");
const executableArguments = packaged ? [] : [path.join(projectRoot, "desktop", "main.mjs")];
const fixtureRoot = mkdtempSync(path.join(tmpdir(), "project-sequencer-media-smoke-"));
const userRoot = path.join(fixtureRoot, "app-data");
const mediaRoot = path.join(fixtureRoot, "media");
const offlineMediaRoot = path.join(fixtureRoot, "media-offline");
const seedPath = path.join(fixtureRoot, "seed-state.json");
const audioPath = path.join(mediaRoot, "Desktop Smoke.wav");

const state = {
  schemaVersion: 7,
  albumTemplates: [],
  masteringPresets: createMasteringPresetLibrary(),
  activeAlbumId: "desktop-smoke-album",
  settings: {
    project: { artistName: "Desktop Smoke Artist", setupComplete: true },
    revealPrivateFilenames: false,
    appearance: { mode: "dark", colorTheme: "signal", fontTheme: "condensed", textScale: 1 },
  },
  albums: [{
    id: "desktop-smoke-album",
    artist: "Desktop Smoke Artist",
    title: "Desktop Smoke Album",
    era: "current",
    releaseDate: "",
    status: "working",
    orderApproved: false,
    masterBus: normalizeMasterBus(),
    masteringPath: "basic",
    advancedMastering: createDefaultAdvancedMastering(),
    baselineTrackOrder: ["desktop-smoke-track"],
    visualAssets: [],
    tracks: [{
      id: "desktop-smoke-track",
      title: "Desktop Smoke Track",
      decisionStatus: "undecided",
      masterCandidateId: "",
      auditionCandidateId: "desktop-smoke-candidate",
      notes: "",
      visualAssets: [],
      candidates: [{
        id: "desktop-smoke-candidate",
        label: "Generated fixture",
        sourceRef: { rootId: "environment-1", relativePath: "Desktop Smoke.wav" },
        flags: [],
        notes: "",
      }],
    }],
  }],
};

const launch = (plan) => new Promise((resolve, reject) => {
  const child = spawn(executable, executableArguments, {
    cwd: projectRoot,
    env: {
      ...process.env,
      PROJECT_SEQUENCER_AUDIO_PATHS: mediaRoot,
      PROJECT_SEQUENCER_DESKTOP_SMOKE: "1",
      PROJECT_SEQUENCER_DESKTOP_SMOKE_PLAN: plan,
      PROJECT_SEQUENCER_DESKTOP_USER_ROOT: userRoot,
      PROJECT_SEQUENCER_SEED_PATH: seedPath,
    },
    stdio: "inherit",
  });
  const timeout = setTimeout(() => child.kill("SIGTERM"), 60_000);
  child.once("error", (error) => {
    clearTimeout(timeout);
    reject(error);
  });
  child.once("exit", (code, signal) => {
    clearTimeout(timeout);
    if (signal) reject(new Error(`Desktop media smoke ${plan} stopped by ${signal}.`));
    else if (code) reject(new Error(`Desktop media smoke ${plan} exited with ${code}.`));
    else resolve();
  });
});

try {
  await Promise.all([mkdir(userRoot, { recursive: true }), mkdir(mediaRoot, { recursive: true })]);
  await writeFile(seedPath, `${JSON.stringify(state, null, 2)}\n`);
  const ffmpeg = process.env.PROJECT_SEQUENCER_FFMPEG_PATH?.trim() || "ffmpeg";
  const generated = spawnSync(ffmpeg, [
    "-nostdin", "-hide_banner", "-loglevel", "error", "-y",
    "-f", "lavfi", "-i", "sine=frequency=997:sample_rate=48000:duration=0.6",
    "-ac", "2", "-c:a", "pcm_s24le", audioPath,
  ], { stdio: "inherit" });
  if (generated.status !== 0) throw new Error(`FFmpeg fixture generation failed with ${generated.status}.`);

  await launch("media-initial");
  await rename(mediaRoot, offlineMediaRoot);
  await launch("media-offline");
  await rename(offlineMediaRoot, mediaRoot);
  await launch("media-reconnect");
  process.stdout.write(`Desktop media lifecycle smoke passed (${packaged ? "packaged" : "development"}).\n`);
} finally {
  await rm(fixtureRoot, { recursive: true, force: true });
}
