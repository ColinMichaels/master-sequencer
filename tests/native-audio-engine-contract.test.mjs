import assert from "node:assert/strict";
import test from "node:test";
import {
  createNativeAudioEngineTelemetry,
  createNativeAudioLatencyReport,
  normalizeNativeAudioDeviceConfiguration,
  validateNativeAudioEngineHandshake,
  validateNativeAudioHardwareProbe,
  validateNativeHardwareTransitionReport,
  validateNativeShadowStreamReport,
  validateNativeSilentStreamReport,
  validateNativeStressStreamReport,
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

test("silent native stream reports prove stopped ownership, silence, callbacks, and recovery", () => {
  const report = validateNativeSilentStreamReport({
    schemaVersion: 1,
    capturedAt: "2026-08-12T12:00:00.000Z",
    mode: "silent-output-lab",
    available: true,
    reasonCode: null,
    handshake: {
      protocolVersion: 1,
      dspContractVersion: 2,
      engineVersion: "0.3.0",
      engineInstanceId: "engine-abcd1234",
      implementationFingerprint: "1234567890abcdef1234567890abcdef",
      capabilities: { offlineRender: true, realTimeOutput: true, deviceNotifications: true, maximumChannels: 2, supportedSampleRates: [48_000] },
    },
    isolation: { audioContent: "silence-only", inputAccess: false, sourceMediaAccess: false, productionPlaybackConnected: false },
    lifecycle: { startRequests: 2, starts: 2, stopRequests: 2, stops: 2, recoveryRequests: 1, recoveries: 1, invalidTransitions: 0, finalState: "stopped" },
    recovery: { defaultDeviceListener: true, processorOverloadListener: true, simulatedDeviceChange: true, deviceChangesObserved: 1 },
    stream: { sampleRate: 48_000, channels: 2, maximumFramesPerSlice: 512, requestedDurationMs: 750, observedDurationMs: 760, callbacks: 70, renderedFrames: 35_840, frameMismatches: 0, deadlineMisses: 0, timingGapXruns: 0, renderErrors: 0, processorOverloads: 0, longestCallbackMs: 0.04, lockFreeTelemetry: true },
  });
  assert.equal(report.stream.callbacks, 70);
  assert.equal(report.lifecycle.finalState, "stopped");
  assert.equal(report.isolation.productionPlaybackConnected, false);
});

test("silent native stream reports fail closed on production routing, paths, or incomplete recovery", () => {
  const base = {
    schemaVersion: 1,
    capturedAt: "2026-08-12T12:00:00.000Z",
    mode: "silent-output-lab",
    available: true,
    reasonCode: null,
    handshake: { protocolVersion: 1, dspContractVersion: 2, engineVersion: "0.3.0", engineInstanceId: "engine-abcd1234", implementationFingerprint: "1234567890abcdef1234567890abcdef", capabilities: { offlineRender: true, realTimeOutput: true, deviceNotifications: true, maximumChannels: 2, supportedSampleRates: [48_000] } },
    isolation: { audioContent: "silence-only", inputAccess: false, sourceMediaAccess: false, productionPlaybackConnected: false },
    lifecycle: { startRequests: 2, starts: 2, stopRequests: 2, stops: 2, recoveryRequests: 1, recoveries: 1, invalidTransitions: 0, finalState: "stopped" },
    recovery: { defaultDeviceListener: true, processorOverloadListener: true, simulatedDeviceChange: true, deviceChangesObserved: 1 },
    stream: { sampleRate: 48_000, channels: 2, maximumFramesPerSlice: 512, requestedDurationMs: 750, observedDurationMs: 760, callbacks: 70, renderedFrames: 35_840, frameMismatches: 0, deadlineMisses: 0, timingGapXruns: 0, renderErrors: 0, processorOverloads: 0, longestCallbackMs: 0.04, lockFreeTelemetry: true },
  };
  assert.throws(() => validateNativeSilentStreamReport({ ...base, isolation: { ...base.isolation, productionPlaybackConnected: true } }), /isolation/);
  assert.throws(() => validateNativeSilentStreamReport({ ...base, debug: "/Users/private/device" }), /local path/);
  assert.throws(() => validateNativeSilentStreamReport({ ...base, lifecycle: { ...base.lifecycle, recoveries: 0 } }), /ownership|recovery/);
});

test("silent native stream reports can safely represent a machine with no output", () => {
  const report = validateNativeSilentStreamReport({
    schemaVersion: 1,
    capturedAt: "2026-08-12T12:00:00.000Z",
    mode: "silent-output-lab",
    available: false,
    reasonCode: "no-output-device",
    handshake: { protocolVersion: 1, dspContractVersion: 2, engineVersion: "0.3.0", engineInstanceId: "engine-abcd1234", implementationFingerprint: "1234567890abcdef1234567890abcdef", capabilities: { offlineRender: true, realTimeOutput: true, deviceNotifications: true, maximumChannels: 2, supportedSampleRates: [] } },
    isolation: { audioContent: "silence-only", inputAccess: false, sourceMediaAccess: false, productionPlaybackConnected: false },
    lifecycle: { startRequests: 0, starts: 0, stopRequests: 0, stops: 0, recoveryRequests: 0, recoveries: 0, invalidTransitions: 0, finalState: "stopped" },
    recovery: { defaultDeviceListener: false, processorOverloadListener: false, simulatedDeviceChange: false, deviceChangesObserved: 0 },
    stream: null,
  });
  assert.equal(report.available, false);
  assert.equal(report.reasonCode, "no-output-device");
});

test("muted native shadow reports bind every callback to the reviewed generated golden while hardware stays silent", () => {
  const report = validateNativeShadowStreamReport({
    schemaVersion: 1,
    capturedAt: "2026-08-12T12:00:00.000Z",
    mode: "muted-shadow-output-lab",
    available: true,
    reasonCode: null,
    handshake: { protocolVersion: 1, dspContractVersion: 2, engineVersion: "0.4.0", engineInstanceId: "engine-abcd1234", implementationFingerprint: "1234567890abcdef1234567890abcdef", capabilities: { offlineRender: true, realTimeOutput: true, deviceNotifications: true, maximumChannels: 2, supportedSampleRates: [48_000] } },
    isolation: { audioContent: "silence-only", inputAccess: false, sourceMediaAccess: false, productionPlaybackConnected: false, shadowInput: "generated-golden-only" },
    lifecycle: { startRequests: 2, starts: 2, stopRequests: 2, stops: 2, recoveryRequests: 1, recoveries: 1, invalidTransitions: 0, finalState: "stopped" },
    recovery: { defaultDeviceListener: true, processorOverloadListener: true, simulatedDeviceChange: true, deviceChangesObserved: 1 },
    stream: { sampleRate: 48_000, channels: 2, maximumFramesPerSlice: 512, requestedDurationMs: 750, observedDurationMs: 760, callbacks: 70, renderedFrames: 35_840, frameMismatches: 0, deadlineMisses: 0, timingGapXruns: 0, renderErrors: 0, processorOverloads: 0, longestCallbackMs: 0.09, lockFreeTelemetry: true },
    shadow: { fixtureId: "dual-tone-gain", fixtureSampleRate: 48_000, fixtureFrames: 4_096, generatedInput: true, checksumAlgorithm: "sha256-float32le-v1", expectedSha256: "74d25b2c630082715417bc8f213357752cfc56f439d6f930ac2dd7fdbde9b995", actualSha256: "74d25b2c630082715417bc8f213357752cfc56f439d6f930ac2dd7fdbde9b995", checksumMatch: true, processedCallbacks: 70, processedFrames: 35_840, kernelProcessedFrames: 35_840, capturedFrames: 4_096, recoveredSamples: 0, failures: 0, hardwareOutputZeroFilledAfterShadow: true, parameterHandoff: { mailbox: "atomic-u64-generation-float32", lockFree: true, publishedUpdates: 1, appliedUpdates: 1, lastPublishedGeneration: 1, lastAppliedGeneration: 1, lastPublishedOutputGainDb: -0.75, lastAppliedOutputGainDb: -0.75, coherent: true } },
  });
  assert.equal(report.shadow.checksumMatch, true);
  assert.equal(report.shadow.processedFrames, report.stream.renderedFrames);
  assert.equal(report.isolation.audioContent, "silence-only");
});

test("muted native shadow reports reject checksum drift, missing callback work, and a non-muted hardware boundary", () => {
  const valid = {
    schemaVersion: 1,
    capturedAt: "2026-08-12T12:00:00.000Z",
    mode: "muted-shadow-output-lab",
    available: true,
    reasonCode: null,
    handshake: { protocolVersion: 1, dspContractVersion: 2, engineVersion: "0.4.0", engineInstanceId: "engine-abcd1234", implementationFingerprint: "1234567890abcdef1234567890abcdef", capabilities: { offlineRender: true, realTimeOutput: true, deviceNotifications: true, maximumChannels: 2, supportedSampleRates: [48_000] } },
    isolation: { audioContent: "silence-only", inputAccess: false, sourceMediaAccess: false, productionPlaybackConnected: false, shadowInput: "generated-golden-only" },
    lifecycle: { startRequests: 2, starts: 2, stopRequests: 2, stops: 2, recoveryRequests: 1, recoveries: 1, invalidTransitions: 0, finalState: "stopped" },
    recovery: { defaultDeviceListener: true, processorOverloadListener: true, simulatedDeviceChange: true, deviceChangesObserved: 1 },
    stream: { sampleRate: 48_000, channels: 2, maximumFramesPerSlice: 512, requestedDurationMs: 750, observedDurationMs: 760, callbacks: 70, renderedFrames: 35_840, frameMismatches: 0, deadlineMisses: 0, timingGapXruns: 0, renderErrors: 0, processorOverloads: 0, longestCallbackMs: 0.09, lockFreeTelemetry: true },
    shadow: { fixtureId: "dual-tone-gain", fixtureSampleRate: 48_000, fixtureFrames: 4_096, generatedInput: true, checksumAlgorithm: "sha256-float32le-v1", expectedSha256: "74d25b2c630082715417bc8f213357752cfc56f439d6f930ac2dd7fdbde9b995", actualSha256: "74d25b2c630082715417bc8f213357752cfc56f439d6f930ac2dd7fdbde9b995", checksumMatch: true, processedCallbacks: 70, processedFrames: 35_840, kernelProcessedFrames: 35_840, capturedFrames: 4_096, recoveredSamples: 0, failures: 0, hardwareOutputZeroFilledAfterShadow: true, parameterHandoff: { mailbox: "atomic-u64-generation-float32", lockFree: true, publishedUpdates: 1, appliedUpdates: 1, lastPublishedGeneration: 1, lastAppliedGeneration: 1, lastPublishedOutputGainDb: -0.75, lastAppliedOutputGainDb: -0.75, coherent: true } },
  };
  assert.throws(() => validateNativeShadowStreamReport({ ...valid, shadow: { ...valid.shadow, actualSha256: "0".repeat(64) } }), /checksum/);
  assert.throws(() => validateNativeShadowStreamReport({ ...valid, shadow: { ...valid.shadow, processedCallbacks: 69 } }), /inconsistent/);
  assert.throws(() => validateNativeShadowStreamReport({ ...valid, shadow: { ...valid.shadow, hardwareOutputZeroFilledAfterShadow: false } }), /hardware output/);
});

test("muted native shadow reports preserve a path-free no-output-device state", () => {
  const report = validateNativeShadowStreamReport({
    schemaVersion: 1,
    capturedAt: "2026-08-12T12:00:00.000Z",
    mode: "muted-shadow-output-lab",
    available: false,
    reasonCode: "no-output-device",
    handshake: { protocolVersion: 1, dspContractVersion: 2, engineVersion: "0.4.0", engineInstanceId: "engine-abcd1234", implementationFingerprint: "1234567890abcdef1234567890abcdef", capabilities: { offlineRender: true, realTimeOutput: true, deviceNotifications: true, maximumChannels: 2, supportedSampleRates: [] } },
    isolation: { audioContent: "silence-only", inputAccess: false, sourceMediaAccess: false, productionPlaybackConnected: false, shadowInput: "generated-golden-only" },
    lifecycle: { startRequests: 0, starts: 0, stopRequests: 0, stops: 0, recoveryRequests: 0, recoveries: 0, invalidTransitions: 0, finalState: "stopped" },
    recovery: { defaultDeviceListener: false, processorOverloadListener: false, simulatedDeviceChange: false, deviceChangesObserved: 0 },
    stream: null,
    shadow: null,
  });
  assert.equal(report.available, false);
  assert.equal(report.shadow, null);
  assert.equal(report.isolation.shadowInput, "generated-golden-only");
});

test("muted native stress reports require long callback coverage and a coherent three-generation parameter sequence", () => {
  const stressReport = {
    schemaVersion: 1,
    capturedAt: "2026-08-12T12:00:00.000Z",
    mode: "muted-shadow-stress-lab",
    available: true,
    reasonCode: null,
    handshake: { protocolVersion: 1, dspContractVersion: 2, engineVersion: "0.5.0", engineInstanceId: "engine-abcd1234", implementationFingerprint: "1234567890abcdef1234567890abcdef", capabilities: { offlineRender: true, realTimeOutput: true, deviceNotifications: true, maximumChannels: 2, supportedSampleRates: [48_000] } },
    isolation: { audioContent: "silence-only", inputAccess: false, sourceMediaAccess: false, productionPlaybackConnected: false, shadowInput: "generated-golden-only" },
    lifecycle: { startRequests: 2, starts: 2, stopRequests: 2, stops: 2, recoveryRequests: 1, recoveries: 1, invalidTransitions: 0, finalState: "stopped" },
    recovery: { defaultDeviceListener: true, processorOverloadListener: true, simulatedDeviceChange: true, deviceChangesObserved: 1 },
    stream: { sampleRate: 48_000, channels: 2, maximumFramesPerSlice: 512, requestedDurationMs: 10_000, observedDurationMs: 10_010, callbacks: 900, renderedFrames: 460_800, frameMismatches: 0, deadlineMisses: 0, timingGapXruns: 0, renderErrors: 0, processorOverloads: 0, longestCallbackMs: 1.8, lockFreeTelemetry: true },
    shadow: { fixtureId: "dual-tone-gain", fixtureSampleRate: 48_000, fixtureFrames: 4_096, generatedInput: true, checksumAlgorithm: "sha256-float32le-v1", expectedSha256: "74d25b2c630082715417bc8f213357752cfc56f439d6f930ac2dd7fdbde9b995", actualSha256: "74d25b2c630082715417bc8f213357752cfc56f439d6f930ac2dd7fdbde9b995", checksumMatch: true, processedCallbacks: 900, processedFrames: 460_800, kernelProcessedFrames: 460_800, capturedFrames: 4_096, recoveredSamples: 0, failures: 0, hardwareOutputZeroFilledAfterShadow: true, parameterHandoff: { mailbox: "atomic-u64-generation-float32", lockFree: true, publishedUpdates: 3, appliedUpdates: 3, lastPublishedGeneration: 3, lastAppliedGeneration: 3, lastPublishedOutputGainDb: -0.75, lastAppliedOutputGainDb: -0.75, coherent: true } },
    stress: { targetDurationMs: 10_000, parameterChangesRequested: 2, parameterChangesCompleted: 2, simulatedRecoveryAtMs: 5_000, systemAudioConfigurationChanged: false },
  };
  const report = validateNativeStressStreamReport(stressReport);
  assert.equal(report.shadow.parameterHandoff.lastAppliedGeneration, 3);
  assert.equal(report.stress.systemAudioConfigurationChanged, false);
  assert.throws(() => validateNativeStressStreamReport({ ...stressReport, shadow: { ...stressReport.shadow, parameterHandoff: { ...stressReport.shadow.parameterHandoff, appliedUpdates: 2 } } }), /handoff|sequence/);
  assert.throws(() => validateNativeStressStreamReport({ ...stressReport, stream: { ...stressReport.stream, callbacks: 400, renderedFrames: 204_800 }, shadow: { ...stressReport.shadow, processedCallbacks: 400, processedFrames: 204_800, kernelProcessedFrames: 204_800 } }), /duration/);
});

test("hardware transition reports require real default-output and sample-rate restoration without overstating physical loss", () => {
  const hardwareReport = {
    schemaVersion: 1,
    capturedAt: "2026-08-12T12:00:00.000Z",
    mode: "muted-shadow-hardware-transition-lab",
    available: true,
    reasonCode: null,
    handshake: { protocolVersion: 1, dspContractVersion: 2, engineVersion: "0.6.0", engineInstanceId: "engine-abcd1234", implementationFingerprint: "1234567890abcdef1234567890abcdef", capabilities: { offlineRender: true, realTimeOutput: true, deviceNotifications: true, maximumChannels: 2, supportedSampleRates: [48_000] } },
    isolation: { audioContent: "silence-only", inputAccess: false, sourceMediaAccess: false, productionPlaybackConnected: false, shadowInput: "generated-golden-only" },
    lifecycle: { startRequests: 5, starts: 5, stopRequests: 5, stops: 5, recoveryRequests: 4, recoveries: 4, invalidTransitions: 0, finalState: "stopped" },
    recovery: { defaultDeviceListener: true, processorOverloadListener: true, sampleRateListener: true, simulatedDeviceChange: false, deviceChangesObserved: 2, sampleRateChangesObserved: 2 },
    stream: { sampleRate: 48_000, channels: 2, maximumFramesPerSlice: 512, requestedDurationMs: 10_000, observedDurationMs: 10_010, callbacks: 680, renderedFrames: 348_160, frameMismatches: 0, deadlineMisses: 0, timingGapXruns: 0, renderErrors: 0, processorOverloads: 0, longestCallbackMs: 0.01, lockFreeTelemetry: true },
    shadow: { fixtureId: "dual-tone-gain", fixtureSampleRate: 48_000, fixtureFrames: 4_096, generatedInput: true, checksumAlgorithm: "sha256-float32le-v1", expectedSha256: "74d25b2c630082715417bc8f213357752cfc56f439d6f930ac2dd7fdbde9b995", actualSha256: "74d25b2c630082715417bc8f213357752cfc56f439d6f930ac2dd7fdbde9b995", checksumMatch: true, processedCallbacks: 680, processedFrames: 348_160, kernelProcessedFrames: 348_160, capturedFrames: 4_096, recoveredSamples: 0, failures: 0, hardwareOutputZeroFilledAfterShadow: true, parameterHandoff: { mailbox: "atomic-u64-generation-float32", lockFree: true, publishedUpdates: 1, appliedUpdates: 1, lastPublishedGeneration: 1, lastAppliedGeneration: 1, lastPublishedOutputGainDb: -0.75, lastAppliedOutputGainDb: -0.75, coherent: true } },
    stress: null,
    hardwareTransitions: {
      authorization: "explicit-cli",
      controlledDefaultOutput: { available: true, targetKind: "virtual", switchAttempted: true, switchObserved: true, restorationAttempted: true, restorationObserved: true },
      sampleRate: { available: true, originalHz: 48_000, targetHz: 44_100, changeAttempted: true, changeObserved: true, restorationAttempted: true, restorationObserved: true },
      physicalDeviceLoss: { removablePhysicalOutputsAvailable: 0, removalAttempted: false, lossObserved: false, reconnectionObserved: false, reasonCode: "no-removable-physical-output" },
      baselineDefaultOutputRestored: true,
      baselineSampleRateRestored: true,
    },
  };
  const report = validateNativeHardwareTransitionReport(hardwareReport);
  assert.equal(report.lifecycle.recoveries, 4);
  assert.equal(report.hardwareTransitions.baselineSampleRateRestored, true);
  assert.equal(report.hardwareTransitions.physicalDeviceLoss.reasonCode, "no-removable-physical-output");
  assert.throws(() => validateNativeHardwareTransitionReport({ ...hardwareReport, hardwareTransitions: { ...hardwareReport.hardwareTransitions, baselineSampleRateRestored: false } }), /restoration/);
  assert.throws(() => validateNativeHardwareTransitionReport({ ...hardwareReport, hardwareTransitions: { ...hardwareReport.hardwareTransitions, physicalDeviceLoss: { ...hardwareReport.hardwareTransitions.physicalDeviceLoss, lossObserved: true } } }), /physical-device-loss/);
});
