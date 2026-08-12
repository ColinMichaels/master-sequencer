import { createHash } from "node:crypto";
import { access, chmod, copyFile, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { generateFixtureInput, loadSharedDspGoldenFixtures } from "../tests/helpers/shared-dsp-golden.mjs";
import { validateNativeAudioHardwareProbe, validateNativeShadowStreamReport, validateNativeSilentStreamReport } from "../src/lib/native-audio-engine-contract.js";

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const packagePath = path.join(repositoryRoot, "native", "SharedDspEngine");
const xcodeRoot = "/Applications/Xcode.app/Contents/Developer";
const xcodeSwift = path.join(xcodeRoot, "Toolchains", "XcodeDefault.xctoolchain", "usr", "bin", "swift");
const xcodeSdk = path.join(xcodeRoot, "Platforms", "MacOSX.platform", "Developer", "SDKs", "MacOSX.sdk");
const scratchPath = process.env.PROJECT_SEQUENCER_SWIFT_SCRATCH || path.join(tmpdir(), "project-sequencer-native-dsp-swift");
const cacheRoot = process.env.PROJECT_SEQUENCER_SWIFT_CACHE || path.join(tmpdir(), "project-sequencer-native-dsp-cache");
const stageRequested = process.argv.includes("--stage");
const stagingRoot = path.join(repositoryRoot, "desktop-resources", "staged");
const stagedDirectory = path.join(stagingRoot, "native");
const stagedManifestPath = path.join(stagingRoot, "native-audio-runtime-manifest.json");

if (stageRequested) {
  await rm(stagedDirectory, { recursive: true, force: true });
  await rm(stagedManifestPath, { force: true });
}

await access(xcodeSwift).catch(() => {
  throw new Error("A complete Xcode Swift toolchain is required for native DSP verification.");
});
await mkdir(cacheRoot, { recursive: true });

const environment = {
  ...process.env,
  SDKROOT: xcodeSdk,
  DEVELOPER_DIR: xcodeRoot,
  CLANG_MODULE_CACHE_PATH: path.join(cacheRoot, "clang"),
  SWIFTPM_MODULECACHE_OVERRIDE: path.join(cacheRoot, "swiftpm"),
};
const commonArguments = [
  "--disable-sandbox",
  "--package-path", packagePath,
  "--scratch-path", scratchPath,
  "--cache-path", path.join(cacheRoot, "packages"),
  "--config-path", path.join(cacheRoot, "config"),
  "--security-path", path.join(cacheRoot, "security"),
  "--sdk", xcodeSdk,
];

const runSwift = (subcommand, extraArguments = []) => {
  const result = spawnSync(xcodeSwift, [subcommand, ...commonArguments, ...extraArguments], { cwd: repositoryRoot, env: environment, encoding: "utf8" });
  if (result.status !== 0) throw new Error([result.stdout, result.stderr].filter(Boolean).join("\n") || `Swift ${subcommand} failed.`);
  return result.stdout.trim();
};

runSwift("build");
const binaryPath = runSwift("build", ["--show-bin-path"]);
const selfTest = spawnSync(path.join(binaryPath, "shared-dsp-self-test"), [], { encoding: "utf8" });
if (selfTest.status !== 0) throw new Error(selfTest.stderr || selfTest.stdout || "Native DSP self-test failed.");

const runnerPath = path.join(binaryPath, "shared-dsp-golden-runner");
const fixtureSet = await loadSharedDspGoldenFixtures();
let comparisons = 0;
for (const fixture of fixtureSet.fixtures) {
  const channels = generateFixtureInput(fixture);
  const channelsBase64 = channels.map((channel) => {
    const bytes = Buffer.alloc(channel.length * 4);
    for (let index = 0; index < channel.length; index += 1) bytes.writeFloatLE(channel[index], index * 4);
    return bytes.toString("base64");
  });
  for (const blockSize of fixtureSet.blockSizes) {
    const request = JSON.stringify({ contractVersion: fixtureSet.contractVersion, sampleRate: fixture.sampleRate, blockSize, settings: fixture.settings, channelsBase64 });
    const result = spawnSync(runnerPath, [], { input: request, maxBuffer: 8 * 1024 * 1024 });
    if (result.status !== 0) throw new Error(result.stderr?.toString() || `Native runner failed for ${fixture.id}.`);
    const digest = createHash("sha256").update(result.stdout).digest("hex");
    if (digest !== fixture.expectedSha256) throw new Error(`Native parity failed for ${fixture.id} at ${blockSize} frames: ${digest}`);
    comparisons += 1;
  }
}

let hardwareProbe = null;
let realtimeTrials = null;
let shadowTrials = null;
let staging = null;
const stagingEntries = {};
if (process.argv.includes("--devices")) {
  const probePath = path.join(binaryPath, "shared-dsp-device-probe");
  const fingerprint = createHash("sha256").update(await readFile(probePath)).digest("hex");
  const probe = spawnSync(probePath, [], {
    encoding: "utf8",
    env: { ...process.env, PROJECT_SEQUENCER_ENGINE_FINGERPRINT: fingerprint },
  });
  if (probe.status !== 0) throw new Error(probe.stderr || "Native audio device probe failed.");
  hardwareProbe = validateNativeAudioHardwareProbe(JSON.parse(probe.stdout));
  if (hardwareProbe.handshake.implementationFingerprint !== fingerprint) throw new Error("Native audio probe fingerprint does not match its compiled binary.");

  if (stageRequested) {
    const stagedProbePath = path.join(stagedDirectory, "shared-dsp-device-probe");
    await mkdir(stagedDirectory, { recursive: true });
    await copyFile(probePath, stagedProbePath);
    await chmod(stagedProbePath, 0o755);
    stagingEntries.deviceProbe = {
      path: "native/shared-dsp-device-probe",
      sha256: fingerprint,
      capability: "query-only-default-output-probe",
      engineVersion: hardwareProbe.handshake.engineVersion,
    };
  }
}

if (process.argv.includes("--realtime")) {
  const streamPath = path.join(binaryPath, "shared-dsp-silent-stream");
  const fingerprint = createHash("sha256").update(await readFile(streamPath)).digest("hex");
  realtimeTrials = [];
  for (let trial = 1; trial <= 3; trial += 1) {
    const stream = spawnSync(streamPath, ["--duration-ms", "750", "--simulate-device-change-ms", "250"], {
      encoding: "utf8",
      timeout: 15_000,
      env: { ...process.env, PROJECT_SEQUENCER_ENGINE_FINGERPRINT: fingerprint },
    });
    if (stream.status !== 0) throw new Error(stream.stderr || `Native silent-stream trial ${trial} failed.`);
    const report = validateNativeSilentStreamReport(JSON.parse(stream.stdout));
    if (!report.available) throw new Error("Native silent-stream verification requires a current default output device.");
    if (report.handshake.implementationFingerprint !== fingerprint) throw new Error("Native silent-stream fingerprint does not match its compiled binary.");
    if (report.stream.frameMismatches || report.stream.deadlineMisses || report.stream.timingGapXruns || report.stream.renderErrors || report.stream.processorOverloads) {
      throw new Error(`Native silent-stream trial ${trial} reported callback, timing, or overload failures.`);
    }
    realtimeTrials.push({
      trial,
      sampleRate: report.stream.sampleRate,
      channels: report.stream.channels,
      callbacks: report.stream.callbacks,
      renderedFrames: report.stream.renderedFrames,
      recoveries: report.lifecycle.recoveries,
      longestCallbackMs: report.stream.longestCallbackMs,
      lockFreeTelemetry: report.stream.lockFreeTelemetry,
      frameMismatches: report.stream.frameMismatches,
      deadlineMisses: report.stream.deadlineMisses,
      timingGapXruns: report.stream.timingGapXruns,
      renderErrors: report.stream.renderErrors,
      processorOverloads: report.stream.processorOverloads,
    });
  }
  if (stageRequested) {
    const stagedStreamPath = path.join(stagedDirectory, "shared-dsp-silent-stream");
    await mkdir(stagedDirectory, { recursive: true });
    await copyFile(streamPath, stagedStreamPath);
    await chmod(stagedStreamPath, 0o755);
    stagingEntries.silentStream = {
      path: "native/shared-dsp-silent-stream",
      sha256: fingerprint,
      capability: "silence-and-muted-shadow-realtime-output-lab",
      engineVersion: "0.4.0",
      silenceTrials: realtimeTrials.length,
    };
  }
}

if (process.argv.includes("--shadow")) {
  const streamPath = path.join(binaryPath, "shared-dsp-silent-stream");
  const fingerprint = createHash("sha256").update(await readFile(streamPath)).digest("hex");
  shadowTrials = [];
  for (let trial = 1; trial <= 3; trial += 1) {
    const stream = spawnSync(streamPath, ["--shadow", "--duration-ms", "750", "--simulate-device-change-ms", "250"], {
      encoding: "utf8",
      timeout: 15_000,
      env: { ...process.env, PROJECT_SEQUENCER_ENGINE_FINGERPRINT: fingerprint },
    });
    if (stream.status !== 0) throw new Error(stream.stderr || `Native muted-shadow trial ${trial} failed.`);
    const report = validateNativeShadowStreamReport(JSON.parse(stream.stdout));
    if (!report.available) throw new Error("Native muted-shadow verification requires a current default output device.");
    if (report.handshake.implementationFingerprint !== fingerprint) throw new Error("Native muted-shadow fingerprint does not match its compiled binary.");
    if (report.stream.frameMismatches || report.stream.deadlineMisses || report.stream.timingGapXruns || report.stream.renderErrors || report.stream.processorOverloads) {
      throw new Error(`Native muted-shadow trial ${trial} reported callback, timing, or overload failures.`);
    }
    shadowTrials.push({
      trial,
      sampleRate: report.stream.sampleRate,
      channels: report.stream.channels,
      callbacks: report.stream.callbacks,
      renderedFrames: report.stream.renderedFrames,
      recoveries: report.lifecycle.recoveries,
      longestCallbackMs: report.stream.longestCallbackMs,
      checksumMatch: report.shadow.checksumMatch,
      goldenSha256: report.shadow.actualSha256,
      shadowCallbacks: report.shadow.processedCallbacks,
      shadowFrames: report.shadow.processedFrames,
      shadowFailures: report.shadow.failures,
      hardwareOutput: report.isolation.audioContent,
      frameMismatches: report.stream.frameMismatches,
      deadlineMisses: report.stream.deadlineMisses,
      timingGapXruns: report.stream.timingGapXruns,
      renderErrors: report.stream.renderErrors,
      processorOverloads: report.stream.processorOverloads,
    });
  }
  if (stageRequested) {
    const stagedStreamPath = path.join(stagedDirectory, "shared-dsp-silent-stream");
    await mkdir(stagedDirectory, { recursive: true });
    await copyFile(streamPath, stagedStreamPath);
    await chmod(stagedStreamPath, 0o755);
    stagingEntries.silentStream = {
      ...stagingEntries.silentStream,
      path: "native/shared-dsp-silent-stream",
      sha256: fingerprint,
      capability: "silence-and-muted-shadow-realtime-output-lab",
      engineVersion: "0.4.0",
      shadowTrials: shadowTrials.length,
    };
  }
}

if (stageRequested) {
  if (!stagingEntries.deviceProbe || !stagingEntries.silentStream?.silenceTrials || !stagingEntries.silentStream?.shadowTrials) throw new Error("Native audio staging requires --devices, --realtime, and --shadow verification gates.");
  const manifest = {
    schemaVersion: 3,
    stagedAt: new Date().toISOString(),
    protocolVersion: hardwareProbe.handshake.protocolVersion,
    dspContractVersion: hardwareProbe.handshake.dspContractVersion,
    binaries: stagingEntries,
  };
  await writeFile(stagedManifestPath, `${JSON.stringify(manifest, null, 2)}\n`, { mode: 0o644 });
  staging = { manifest: "native-audio-runtime-manifest.json", binaries: Object.fromEntries(Object.entries(stagingEntries).map(([key, value]) => [key, value.path])) };
}

process.stdout.write(`${JSON.stringify({
  contractVersion: fixtureSet.contractVersion,
  implementation: "swift",
  fixtures: fixtureSet.fixtures.length,
  blockSizes: fixtureSet.blockSizes,
  comparisons,
  selfTest: selfTest.stdout.trim(),
  ...(hardwareProbe ? { hardwareProbe } : {}),
  ...(realtimeTrials ? { realtimeTrials } : {}),
  ...(shadowTrials ? { shadowTrials } : {}),
  ...(staging ? { staging } : {}),
}, null, 2)}\n`);
