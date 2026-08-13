import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { EventEmitter } from "node:events";
import { PassThrough } from "node:stream";
import test from "node:test";
import { createNativeAudioLabService } from "../server/native-audio-lab-service.mjs";

const binary = Buffer.from("compiled-native-lab");
const fingerprint = createHash("sha256").update(binary).digest("hex");

const audibleReport = () => ({
  schemaVersion: 1,
  capturedAt: "2026-08-12T12:00:03.000Z",
  mode: "generated-tone-audible-lab",
  available: true,
  reasonCode: null,
  handshake: { protocolVersion: 1, dspContractVersion: 2, engineVersion: "0.7.0", engineInstanceId: "engine-abcd1234", implementationFingerprint: fingerprint, capabilities: { offlineRender: true, realTimeOutput: true, deviceNotifications: true, maximumChannels: 2, supportedSampleRates: [48_000] } },
  isolation: { audioContent: "generated-fixture-preview", inputAccess: false, sourceMediaAccess: false, productionPlaybackConnected: false, shadowInput: "generated-golden-only" },
  lifecycle: { startRequests: 1, starts: 1, stopRequests: 1, stops: 1, recoveryRequests: 0, recoveries: 0, invalidTransitions: 0, finalState: "stopped" },
  recovery: { defaultDeviceListener: true, processorOverloadListener: true, sampleRateListener: true, simulatedDeviceChange: false, deviceChangesObserved: 0, sampleRateChangesObserved: 0 },
  stream: { sampleRate: 48_000, channels: 2, maximumFramesPerSlice: 512, requestedDurationMs: 3_000, observedDurationMs: 3_014.25, callbacks: 281, renderedFrames: 143_872, frameMismatches: 0, deadlineMisses: 0, timingGapXruns: 0, renderErrors: 0, processorOverloads: 0, longestCallbackMs: 0.01234, lockFreeTelemetry: true },
  shadow: { fixtureId: "dual-tone-gain", fixtureSampleRate: 48_000, fixtureFrames: 4_096, generatedInput: true, checksumAlgorithm: "sha256-float32le-v1", expectedSha256: "74d25b2c630082715417bc8f213357752cfc56f439d6f930ac2dd7fdbde9b995", actualSha256: "74d25b2c630082715417bc8f213357752cfc56f439d6f930ac2dd7fdbde9b995", checksumMatch: true, processedCallbacks: 281, processedFrames: 143_872, kernelProcessedFrames: 143_872, capturedFrames: 4_096, recoveredSamples: 0, failures: 0, hardwareOutputZeroFilledAfterShadow: false, parameterHandoff: { mailbox: "atomic-u64-generation-float32", lockFree: true, publishedUpdates: 1, appliedUpdates: 1, lastPublishedGeneration: 1, lastAppliedGeneration: 1, lastPublishedOutputGainDb: -0.75, lastAppliedOutputGainDb: -0.75, coherent: true } },
  stress: null,
  hardwareTransitions: null,
  preview: { authorization: "explicit-cli-double-opt-in", source: "generated-golden-only", hardwareOutput: "attenuated-generated-fixture", gainDb: -30, requestedDurationMs: 3_000, maximumDurationMs: 5_000, fadeMs: 20 },
});

const fakeChild = () => {
  const child = new EventEmitter();
  child.stdout = new PassThrough();
  child.stderr = new PassThrough();
  child.kill = (signal) => {
    queueMicrotask(() => child.emit("close", null, signal));
    return true;
  };
  return child;
};

test("native audio lab stays optional and publishes no executable path", () => {
  const service = createNativeAudioLabService();
  assert.equal(service.configured, false);
  assert.equal(service.status().state, "idle");
  assert.equal(service.status().modes.audible.requiresAcknowledgement, true);
  assert.equal(JSON.stringify(service.status()).includes("executablePath"), false);
});

test("native audio lab requires explicit audible acknowledgement and runs only the generated preview flags", async () => {
  const privatePath = "/private/tmp/private-native-engine";
  const child = fakeChild();
  const service = createNativeAudioLabService({
    executablePath: privatePath,
    readBinary: async (receivedPath) => {
      assert.equal(receivedPath, privatePath);
      return binary;
    },
    createRunId: () => "run-audible",
    spawnProcess: ({ executablePath, args, fingerprint: receivedFingerprint }) => {
      assert.equal(executablePath, privatePath);
      assert.equal(receivedFingerprint, fingerprint);
      assert.deepEqual(args, ["--audible-preview", "--allow-audible-output", "--duration-ms", "3000"]);
      queueMicrotask(() => {
        child.stdout.write(JSON.stringify(audibleReport()));
        child.emit("close", 0, null);
      });
      return child;
    },
  });
  await assert.rejects(() => service.start({ mode: "audible" }), (error) => error.statusCode === 400);
  const started = await service.start({ mode: "audible", acknowledged: true });
  assert.equal(started.running, true);
  await new Promise((resolve) => setImmediate(resolve));
  const completed = service.status();
  assert.equal(completed.running, false);
  assert.equal(completed.lastRun.outcome, "passed");
  assert.equal(completed.lastRun.goldenMatched, true);
  assert.equal(completed.lastRun.output, "generated-tone-minus-30-db");
  assert.equal(completed.lastRun.projectMediaAccessed, false);
  const serialized = JSON.stringify(completed);
  assert.equal(serialized.includes(privatePath), false);
  assert.equal(serialized.includes(fingerprint), false);
  assert.equal(serialized.includes("engine-abcd1234"), false);
});

test("native audio lab stop is an emergency process stop with a sanitized terminal state", async () => {
  const child = fakeChild();
  const service = createNativeAudioLabService({
    executablePath: "/native-lab",
    readBinary: async () => binary,
    createRunId: () => "run-stop",
    spawnProcess: ({ args }) => {
      assert.deepEqual(args, ["--shadow", "--duration-ms", "750", "--simulate-device-change-ms", "250"]);
      return child;
    },
  });
  await service.start({ mode: "muted" });
  await assert.rejects(() => service.start({ mode: "muted" }), (error) => error.statusCode === 409);
  assert.equal(service.stop().running, true);
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(service.status().lastRun.outcome, "stopped");
  assert.equal(service.status().lastRun.reasonCode, "user-stopped");
});

test("native audio lab fails closed on a malformed or fingerprint-drifted child report", async () => {
  const child = fakeChild();
  const report = audibleReport();
  report.handshake.implementationFingerprint = "0".repeat(64);
  const service = createNativeAudioLabService({
    executablePath: "/native-lab",
    readBinary: async () => binary,
    spawnProcess: () => {
      queueMicrotask(() => {
        child.stdout.write(JSON.stringify(report));
        child.emit("close", 0, null);
      });
      return child;
    },
  });
  await service.start({ mode: "audible", acknowledged: true });
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(service.status().lastRun.outcome, "failed");
  assert.equal(service.status().lastRun.reasonCode, "invalid-engine-report");
});

test("native audio lab terminates an owned child when post-launch setup fails", async () => {
  let killedWith = null;
  const child = new EventEmitter();
  child.stdout = { setEncoding: () => { throw new Error("stream setup failed"); } };
  child.stderr = new EventEmitter();
  child.kill = (signal) => { killedWith = signal; };
  const service = createNativeAudioLabService({
    executablePath: "/private/native-engine",
    readBinary: async () => Buffer.from("engine"),
    spawnProcess: () => child,
  });

  await assert.rejects(() => service.start({ mode: "muted" }), /could not start/);
  assert.equal(killedWith, "SIGTERM");
  assert.equal(service.status().state, "idle");
  assert.equal(service.status().running, false);
});
