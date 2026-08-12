import assert from "node:assert/strict";
import test from "node:test";
import {
  createNativeAudioEngineTelemetry,
  createNativeAudioLatencyReport,
  normalizeNativeAudioDeviceConfiguration,
  validateNativeAudioEngineHandshake,
  validateNativeAudioHardwareProbe,
} from "../src/lib/native-audio-engine-contract.js";

test("native device requests normalize to bounded explicit configurations", () => {
  assert.deepEqual(normalizeNativeAudioDeviceConfiguration({
    inputDeviceId: " studio-input ",
    outputDeviceId: "studio-output",
    sampleRate: 12_345,
    bufferFrames: 999,
    inputChannels: -2,
    outputChannels: 99,
    exclusiveMode: true,
    fallbackToDefaultDevice: false,
  }), {
    inputDeviceId: "studio-input",
    outputDeviceId: "studio-output",
    sampleRate: 48_000,
    bufferFrames: 256,
    inputChannels: 0,
    outputChannels: 32,
    exclusiveMode: true,
    fallbackToDefaultDevice: false,
  });
});

test("latency reports preserve frame authority and derive readable milliseconds", () => {
  assert.deepEqual(createNativeAudioLatencyReport({
    sampleRate: 48_000,
    bufferFrames: 128,
    inputHardwareFrames: 32,
    outputHardwareFrames: 48,
    dspFrames: 64,
    pluginFrames: 96,
    safetyFrames: 16,
  }), {
    sampleRate: 48_000,
    bufferFrames: 128,
    inputHardwareFrames: 32,
    outputHardwareFrames: 48,
    dspFrames: 64,
    pluginFrames: 96,
    safetyFrames: 16,
    inputPathFrames: 160,
    outputPathFrames: 352,
    roundTripFrames: 512,
    inputPathMs: 3.333,
    outputPathMs: 7.333,
    roundTripMs: 10.667,
  });
});

test("native handshake rejects protocol drift and exposes only bounded capabilities", () => {
  const handshake = validateNativeAudioEngineHandshake({
    protocolVersion: 1,
    dspContractVersion: 2,
    engineVersion: "0.1.0",
    engineInstanceId: "engine-abcd1234",
    implementationFingerprint: "1234567890abcdef1234567890abcdef",
    capabilities: { offlineRender: true, realTimeOutput: false, deviceNotifications: false, maximumChannels: 200, supportedSampleRates: [48_000, 12_345, 96_000, 48_000] },
  });
  assert.equal(handshake.capabilities.maximumChannels, 32);
  assert.deepEqual(handshake.capabilities.supportedSampleRates, [48_000, 96_000]);
  assert.throws(() => validateNativeAudioEngineHandshake({ ...handshake, dspContractVersion: 1 }), /incompatible/);
});

test("native telemetry records dropouts, explicit device recovery, and no local paths", () => {
  let tick = 0;
  const telemetry = createNativeAudioEngineTelemetry({ now: () => `tick-${++tick}`, maximumEvents: 5 });
  telemetry.start();
  telemetry.running();
  assert.deepEqual(telemetry.recordCallback({ expectedFrames: 128, renderedFrames: 127, callbackDurationMs: 3.2, deadlineMs: 2.7, recoveredSamples: 2 }), { frameMismatch: true, deadlineMiss: true });
  telemetry.stable();
  telemetry.deviceLost("device-removed");
  telemetry.recovered();
  telemetry.recordCallback({ expectedFrames: 128, renderedFrames: 128, callbackDurationMs: 1.2, deadlineMs: 2.7 });
  const snapshot = telemetry.snapshot();
  assert.equal(snapshot.state, "running");
  assert.equal(snapshot.counters.xruns, 1);
  assert.equal(snapshot.counters.frameMismatches, 1);
  assert.equal(snapshot.counters.deadlineMisses, 1);
  assert.equal(snapshot.counters.deviceLosses, 1);
  assert.equal(snapshot.counters.recoveries, 1);
  assert.equal(snapshot.counters.recoveredSamples, 2);
  assert.ok(snapshot.events.length <= 5);
  assert.equal(JSON.stringify(snapshot).includes("/Users/"), false);
});

test("query-only native hardware reports bind latency to a compatible engine handshake", () => {
  const report = validateNativeAudioHardwareProbe({
    schemaVersion: 1,
    capturedAt: "2026-08-12T12:00:00.000Z",
    handshake: {
      protocolVersion: 1,
      dspContractVersion: 2,
      engineVersion: "0.2.0",
      engineInstanceId: "engine-abcd1234",
      implementationFingerprint: "1234567890abcdef1234567890abcdef",
      capabilities: { offlineRender: true, realTimeOutput: false, deviceNotifications: false, maximumChannels: 2, supportedSampleRates: [48_000] },
    },
    defaultOutput: {
      label: "System Default Output",
      sampleRate: 48_000,
      channels: 2,
      presentationLatencySeconds: 0.01,
      presentationLatencyFrames: 480,
      interleaved: false,
      accessMode: "query-only",
    },
  });
  assert.equal(report.defaultOutput.presentationLatencyFrames, 480);
  assert.equal(report.handshake.capabilities.realTimeOutput, false);
  assert.throws(() => validateNativeAudioHardwareProbe({ ...report, defaultOutput: { ...report.defaultOutput, label: "/Users/private/device" } }), /label/);
  assert.throws(() => validateNativeAudioHardwareProbe({ ...report, defaultOutput: { ...report.defaultOutput, presentationLatencyFrames: 400 } }), /do not match/);
});

test("query-only native hardware reports can represent no current output device", () => {
  const report = validateNativeAudioHardwareProbe({
    schemaVersion: 1,
    capturedAt: "2026-08-12T12:00:00.000Z",
    handshake: {
      protocolVersion: 1,
      dspContractVersion: 2,
      engineVersion: "0.2.0",
      engineInstanceId: "engine-abcd1234",
      implementationFingerprint: "1234567890abcdef1234567890abcdef",
      capabilities: { offlineRender: true, realTimeOutput: false, deviceNotifications: false, maximumChannels: 2, supportedSampleRates: [] },
    },
    defaultOutput: null,
    reasonCode: "no-output-device",
  });
  assert.equal(report.defaultOutput, null);
  assert.equal(report.reasonCode, "no-output-device");
  assert.throws(() => validateNativeAudioHardwareProbe({ ...report, reasonCode: "unknown" }), /reason/);
});
