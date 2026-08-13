import { SHARED_DSP_CONTRACT_VERSION } from "../dsp/shared-dsp-core.js";

export const NATIVE_AUDIO_ENGINE_PROTOCOL_VERSION = 1;
export const NATIVE_SHADOW_GOLDEN_SHA256 = "74d25b2c630082715417bc8f213357752cfc56f439d6f930ac2dd7fdbde9b995";
export const NATIVE_AUDIO_BUFFER_SIZES = Object.freeze([32, 64, 128, 256, 512, 1_024, 2_048, 4_096]);
export const NATIVE_AUDIO_SAMPLE_RATES = Object.freeze([44_100, 48_000, 88_200, 96_000, 176_400, 192_000]);

const finiteNumber = (value, fallback, minimum, maximum) => {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? Math.min(maximum, Math.max(minimum, numeric)) : fallback;
};

const integerInRange = (value, fallback, minimum, maximum) => Math.round(finiteNumber(value, fallback, minimum, maximum));

const allowedValue = (value, allowed, fallback) => allowed.includes(Number(value)) ? Number(value) : fallback;

const cleanIdentifier = (value, fallback = "default") => {
  const identifier = typeof value === "string" ? value.trim() : "";
  return identifier && identifier.length <= 256 ? identifier : fallback;
};

export const normalizeNativeAudioDeviceConfiguration = (configuration = {}) => ({
  inputDeviceId: cleanIdentifier(configuration.inputDeviceId),
  outputDeviceId: cleanIdentifier(configuration.outputDeviceId),
  sampleRate: allowedValue(configuration.sampleRate, NATIVE_AUDIO_SAMPLE_RATES, 48_000),
  bufferFrames: allowedValue(configuration.bufferFrames, NATIVE_AUDIO_BUFFER_SIZES, 256),
  inputChannels: integerInRange(configuration.inputChannels, 0, 0, 32),
  outputChannels: integerInRange(configuration.outputChannels, 2, 1, 32),
  exclusiveMode: Boolean(configuration.exclusiveMode),
  fallbackToDefaultDevice: configuration.fallbackToDefaultDevice !== false,
});

export const createNativeAudioLatencyReport = (values = {}) => {
  const sampleRate = allowedValue(values.sampleRate, NATIVE_AUDIO_SAMPLE_RATES, 48_000);
  const bufferFrames = allowedValue(values.bufferFrames, NATIVE_AUDIO_BUFFER_SIZES, 256);
  const inputHardwareFrames = integerInRange(values.inputHardwareFrames, 0, 0, 1_000_000);
  const outputHardwareFrames = integerInRange(values.outputHardwareFrames, 0, 0, 1_000_000);
  const dspFrames = integerInRange(values.dspFrames, 0, 0, 1_000_000);
  const pluginFrames = integerInRange(values.pluginFrames, 0, 0, 1_000_000);
  const safetyFrames = integerInRange(values.safetyFrames, 0, 0, 1_000_000);
  const inputPathFrames = inputHardwareFrames + bufferFrames;
  const outputPathFrames = bufferFrames + outputHardwareFrames + dspFrames + pluginFrames + safetyFrames;
  const roundTripFrames = inputPathFrames + outputPathFrames;
  const milliseconds = (frames) => Number((frames * 1_000 / sampleRate).toFixed(3));
  return {
    sampleRate,
    bufferFrames,
    inputHardwareFrames,
    outputHardwareFrames,
    dspFrames,
    pluginFrames,
    safetyFrames,
    inputPathFrames,
    outputPathFrames,
    roundTripFrames,
    inputPathMs: milliseconds(inputPathFrames),
    outputPathMs: milliseconds(outputPathFrames),
    roundTripMs: milliseconds(roundTripFrames),
  };
};

export const validateNativeAudioEngineHandshake = (handshake) => {
  if (!handshake || typeof handshake !== "object") throw new Error("Native audio engine handshake is missing.");
  if (handshake.protocolVersion !== NATIVE_AUDIO_ENGINE_PROTOCOL_VERSION) throw new Error(`Native audio engine protocol ${handshake.protocolVersion ?? "unknown"} is incompatible.`);
  if (handshake.dspContractVersion !== SHARED_DSP_CONTRACT_VERSION) throw new Error(`Native DSP contract ${handshake.dspContractVersion ?? "unknown"} is incompatible.`);
  const engineVersion = cleanIdentifier(handshake.engineVersion, "");
  const engineInstanceId = cleanIdentifier(handshake.engineInstanceId, "");
  const implementationFingerprint = cleanIdentifier(handshake.implementationFingerprint, "");
  if (!/^\d+\.\d+\.\d+(?:[-+][0-9A-Za-z.-]+)?$/.test(engineVersion)) throw new Error("Native audio engine version is invalid.");
  if (!/^[0-9A-Za-z-]{8,128}$/.test(engineInstanceId)) throw new Error("Native audio engine instance ID is invalid.");
  if (!/^[0-9a-f]{16,128}$/i.test(implementationFingerprint)) throw new Error("Native audio engine fingerprint is invalid.");
  const capabilities = handshake.capabilities && typeof handshake.capabilities === "object" ? handshake.capabilities : {};
  return {
    protocolVersion: NATIVE_AUDIO_ENGINE_PROTOCOL_VERSION,
    dspContractVersion: SHARED_DSP_CONTRACT_VERSION,
    engineVersion,
    engineInstanceId,
    implementationFingerprint,
    capabilities: {
      offlineRender: Boolean(capabilities.offlineRender),
      realTimeOutput: Boolean(capabilities.realTimeOutput),
      deviceNotifications: Boolean(capabilities.deviceNotifications),
      maximumChannels: integerInRange(capabilities.maximumChannels, 2, 1, 32),
      supportedSampleRates: [...new Set((capabilities.supportedSampleRates || []).map(Number).filter((rate) => NATIVE_AUDIO_SAMPLE_RATES.includes(rate)))].sort((left, right) => left - right),
    },
  };
};

export const validateNativeAudioHardwareProbe = (report) => {
  if (!report || typeof report !== "object" || report.schemaVersion !== 1) throw new Error("Native audio hardware report is invalid.");
  const capturedAt = typeof report.capturedAt === "string" && Number.isFinite(Date.parse(report.capturedAt)) ? new Date(report.capturedAt).toISOString() : "";
  if (!capturedAt) throw new Error("Native audio hardware capture time is invalid.");
  const handshake = validateNativeAudioEngineHandshake(report.handshake);
  if (handshake.capabilities.realTimeOutput) throw new Error("A query-only hardware probe cannot claim real-time output.");
  const output = report.defaultOutput;
  if (output == null) {
    if (report.reasonCode !== "no-output-device") throw new Error("Native output unavailability reason is invalid.");
    return { schemaVersion: 1, capturedAt, handshake, defaultOutput: null, reasonCode: "no-output-device" };
  }
  if (!output || typeof output !== "object") throw new Error("Native default output report is missing.");
  const label = cleanIdentifier(output.label, "");
  if (!label || label.startsWith("/") || /^[A-Za-z]:[\\/]/.test(label)) throw new Error("Native output label is invalid.");
  const sampleRate = finiteNumber(output.sampleRate, 0, 8_000, 384_000);
  const channels = integerInRange(output.channels, 0, 1, 32);
  const presentationLatencySeconds = finiteNumber(output.presentationLatencySeconds, -1, 0, 10);
  const presentationLatencyFrames = integerInRange(output.presentationLatencyFrames, -1, 0, 3_840_000);
  if (!sampleRate || !channels || presentationLatencySeconds < 0 || presentationLatencyFrames < 0) throw new Error("Native output format or latency is invalid.");
  if (Math.abs(presentationLatencyFrames - Math.round(presentationLatencySeconds * sampleRate)) > 1) throw new Error("Native output latency frames do not match its sample rate and seconds.");
  if (output.accessMode !== "query-only") throw new Error("Native hardware probe must remain query-only.");
  return {
    schemaVersion: 1,
    capturedAt,
    handshake,
    defaultOutput: {
      label,
      sampleRate,
      channels,
      presentationLatencySeconds,
      presentationLatencyFrames,
      interleaved: Boolean(output.interleaved),
      accessMode: "query-only",
    },
    reasonCode: null,
  };
};

const cleanNonnegativeInteger = (value, label, maximum = Number.MAX_SAFE_INTEGER) => {
  if (!Number.isSafeInteger(value) || value < 0 || value > maximum) throw new Error(`Native silent-stream ${label} is invalid.`);
  return value;
};

const cleanNonnegativeNumber = (value, label, maximum) => {
  if (!Number.isFinite(value) || value < 0 || value > maximum) throw new Error(`Native silent-stream ${label} is invalid.`);
  return Number(value);
};

export const validateNativeSilentStreamReport = (report) => {
  if (!report || typeof report !== "object" || report.schemaVersion !== 1) throw new Error("Native silent-stream report is invalid.");
  const serialized = JSON.stringify(report);
  if (/(?:\/Users\/|\/private\/|\/var\/folders\/|[A-Za-z]:[\\/])/.test(serialized)) throw new Error("Native silent-stream report contains a local path.");
  const capturedAt = typeof report.capturedAt === "string" && Number.isFinite(Date.parse(report.capturedAt)) ? new Date(report.capturedAt).toISOString() : "";
  if (!capturedAt) throw new Error("Native silent-stream capture time is invalid.");
  if (report.mode !== "silent-output-lab") throw new Error("Native silent-stream mode is invalid.");
  const handshake = validateNativeAudioEngineHandshake(report.handshake);
  if (!handshake.capabilities.realTimeOutput || !handshake.capabilities.deviceNotifications) throw new Error("Native silent-stream capabilities are incomplete.");
  const isolation = report.isolation;
  if (!isolation || isolation.audioContent !== "silence-only" || isolation.inputAccess !== false || isolation.sourceMediaAccess !== false || isolation.productionPlaybackConnected !== false) {
    throw new Error("Native silent-stream isolation boundary is invalid.");
  }
  const lifecycle = report.lifecycle;
  if (!lifecycle || lifecycle.finalState !== "stopped") throw new Error("Native silent-stream lifecycle did not stop cleanly.");
  const normalizedLifecycle = {
    startRequests: cleanNonnegativeInteger(lifecycle.startRequests, "start-request count", 100),
    starts: cleanNonnegativeInteger(lifecycle.starts, "start count", 100),
    stopRequests: cleanNonnegativeInteger(lifecycle.stopRequests, "stop-request count", 100),
    stops: cleanNonnegativeInteger(lifecycle.stops, "stop count", 100),
    recoveryRequests: cleanNonnegativeInteger(lifecycle.recoveryRequests, "recovery-request count", 100),
    recoveries: cleanNonnegativeInteger(lifecycle.recoveries, "recovery count", 100),
    invalidTransitions: cleanNonnegativeInteger(lifecycle.invalidTransitions, "invalid-transition count", 100),
    finalState: "stopped",
  };
  if (normalizedLifecycle.invalidTransitions !== 0 || normalizedLifecycle.startRequests !== normalizedLifecycle.starts || normalizedLifecycle.stopRequests !== normalizedLifecycle.stops || normalizedLifecycle.recoveryRequests !== normalizedLifecycle.recoveries) {
    throw new Error("Native silent-stream lifecycle ownership is inconsistent.");
  }
  const recovery = report.recovery;
  if (!recovery || typeof recovery.defaultDeviceListener !== "boolean" || typeof recovery.processorOverloadListener !== "boolean" || typeof recovery.simulatedDeviceChange !== "boolean") {
    throw new Error("Native silent-stream recovery evidence is invalid.");
  }
  const normalizedRecovery = {
    defaultDeviceListener: recovery.defaultDeviceListener,
    processorOverloadListener: recovery.processorOverloadListener,
    sampleRateListener: recovery.sampleRateListener === true,
    simulatedDeviceChange: recovery.simulatedDeviceChange,
    deviceChangesObserved: cleanNonnegativeInteger(recovery.deviceChangesObserved, "device-change count", 100),
    sampleRateChangesObserved: cleanNonnegativeInteger(recovery.sampleRateChangesObserved ?? 0, "sample-rate-change count", 100),
  };

  if (report.available === false) {
    if (report.reasonCode !== "no-output-device" || report.stream != null) throw new Error("Native silent-stream unavailable state is invalid.");
    if (normalizedRecovery.defaultDeviceListener || normalizedRecovery.processorOverloadListener || normalizedRecovery.sampleRateListener || normalizedRecovery.simulatedDeviceChange || normalizedRecovery.deviceChangesObserved !== 0 || normalizedRecovery.sampleRateChangesObserved !== 0 || Object.values(normalizedLifecycle).some((value) => typeof value === "number" && value !== 0)) throw new Error("Native silent-stream unavailable lifecycle is invalid.");
    return { schemaVersion: 1, capturedAt, mode: "silent-output-lab", available: false, reasonCode: "no-output-device", handshake, isolation: { ...isolation }, lifecycle: normalizedLifecycle, recovery: normalizedRecovery, stream: null };
  }
  if (!normalizedRecovery.defaultDeviceListener || !normalizedRecovery.processorOverloadListener) throw new Error("Native silent-stream recovery listeners were not active.");
  if (normalizedRecovery.simulatedDeviceChange && (normalizedRecovery.deviceChangesObserved < 1 || normalizedLifecycle.recoveries < 1)) throw new Error("Native silent-stream simulated recovery did not complete.");
  if (report.available !== true || report.reasonCode != null) throw new Error("Native silent-stream availability is invalid.");
  const stream = report.stream;
  if (!stream || typeof stream !== "object") throw new Error("Native silent-stream metrics are missing.");
  const sampleRate = cleanNonnegativeNumber(stream.sampleRate, "sample rate", 384_000);
  const channels = cleanNonnegativeInteger(stream.channels, "channel count", 32);
  const maximumFramesPerSlice = cleanNonnegativeInteger(stream.maximumFramesPerSlice, "maximum frame count", 1_000_000);
  const requestedDurationMs = cleanNonnegativeNumber(stream.requestedDurationMs, "requested duration", 10_000);
  const observedDurationMs = cleanNonnegativeNumber(stream.observedDurationMs, "observed duration", 30_000);
  const callbacks = cleanNonnegativeInteger(stream.callbacks, "callback count");
  const renderedFrames = cleanNonnegativeInteger(stream.renderedFrames, "rendered-frame count");
  if (sampleRate < 8_000 || channels < 1 || maximumFramesPerSlice < 1 || requestedDurationMs < 100 || observedDurationMs < 50 || callbacks < 1 || renderedFrames < callbacks) throw new Error("Native silent-stream did not produce credible callback evidence.");
  if (stream.lockFreeTelemetry !== true) throw new Error("Native silent-stream telemetry is not lock-free on this architecture.");
  return {
    schemaVersion: 1,
    capturedAt,
    mode: "silent-output-lab",
    available: true,
    reasonCode: null,
    handshake,
    isolation: { audioContent: "silence-only", inputAccess: false, sourceMediaAccess: false, productionPlaybackConnected: false },
    lifecycle: normalizedLifecycle,
    recovery: normalizedRecovery,
    stream: {
      sampleRate,
      channels,
      maximumFramesPerSlice,
      requestedDurationMs,
      observedDurationMs,
      callbacks,
      renderedFrames,
      frameMismatches: cleanNonnegativeInteger(stream.frameMismatches, "frame-mismatch count"),
      deadlineMisses: cleanNonnegativeInteger(stream.deadlineMisses, "deadline-miss count"),
      timingGapXruns: cleanNonnegativeInteger(stream.timingGapXruns, "timing-gap xrun count"),
      renderErrors: cleanNonnegativeInteger(stream.renderErrors, "render-error count"),
      processorOverloads: cleanNonnegativeInteger(stream.processorOverloads, "processor-overload count"),
      longestCallbackMs: cleanNonnegativeNumber(stream.longestCallbackMs, "longest callback", 10_000),
      lockFreeTelemetry: stream.lockFreeTelemetry === true,
    },
  };
};

export const validateNativeShadowStreamReport = (report) => {
  const mode = report?.mode;
  if (!report || !["muted-shadow-output-lab", "muted-shadow-stress-lab", "muted-shadow-hardware-transition-lab"].includes(mode)) throw new Error("Native muted-shadow mode is invalid.");
  const streamReport = validateNativeSilentStreamReport({ ...report, mode: "silent-output-lab" });
  if (report.isolation?.shadowInput !== "generated-golden-only") throw new Error("Native muted-shadow input isolation is invalid.");
  if (!streamReport.available) {
    if (report.shadow != null) throw new Error("Native muted-shadow unavailable state is invalid.");
    return { ...streamReport, mode, isolation: { ...streamReport.isolation, shadowInput: "generated-golden-only" }, shadow: null };
  }

  const shadow = report.shadow;
  if (!shadow || typeof shadow !== "object") throw new Error("Native muted-shadow evidence is missing.");
  const expectedSha256 = typeof shadow.expectedSha256 === "string" ? shadow.expectedSha256.toLowerCase() : "";
  const actualSha256 = typeof shadow.actualSha256 === "string" ? shadow.actualSha256.toLowerCase() : "";
  const processedCallbacks = cleanNonnegativeInteger(shadow.processedCallbacks, "shadow callback count");
  const processedFrames = cleanNonnegativeInteger(shadow.processedFrames, "shadow frame count");
  const kernelProcessedFrames = cleanNonnegativeInteger(shadow.kernelProcessedFrames, "kernel frame count");
  const capturedFrames = cleanNonnegativeInteger(shadow.capturedFrames, "captured golden frame count", 1_000_000);
  const recoveredSamples = cleanNonnegativeInteger(shadow.recoveredSamples, "recovered shadow sample count");
  const failures = cleanNonnegativeInteger(shadow.failures, "shadow failure count");
  if (shadow.fixtureId !== "dual-tone-gain" || shadow.fixtureSampleRate !== 48_000 || shadow.fixtureFrames !== 4_096 || shadow.generatedInput !== true || shadow.checksumAlgorithm !== "sha256-float32le-v1") {
    throw new Error("Native muted-shadow golden authority is invalid.");
  }
  if (expectedSha256 !== NATIVE_SHADOW_GOLDEN_SHA256 || actualSha256 !== expectedSha256 || shadow.checksumMatch !== true) throw new Error("Native muted-shadow checksum does not match the reviewed golden.");
  if (processedCallbacks !== streamReport.stream.callbacks || processedFrames !== streamReport.stream.renderedFrames || kernelProcessedFrames !== processedFrames || capturedFrames !== 4_096 || processedFrames < capturedFrames || recoveredSamples !== 0 || failures !== 0) {
    throw new Error("Native muted-shadow processing evidence is inconsistent.");
  }
  if (shadow.hardwareOutputZeroFilledAfterShadow !== true) throw new Error("Native muted-shadow hardware output was not proven muted.");
  const handoff = shadow.parameterHandoff;
  if (!handoff || handoff.mailbox !== "atomic-u64-generation-float32" || handoff.lockFree !== true || handoff.coherent !== true) throw new Error("Native muted-shadow parameter mailbox is invalid.");
  const publishedUpdates = cleanNonnegativeInteger(handoff.publishedUpdates, "parameter publish count", 1_000_000);
  const appliedUpdates = cleanNonnegativeInteger(handoff.appliedUpdates, "parameter apply count", 1_000_000);
  const lastPublishedGeneration = cleanNonnegativeInteger(handoff.lastPublishedGeneration, "published parameter generation", 0xffff_ffff);
  const lastAppliedGeneration = cleanNonnegativeInteger(handoff.lastAppliedGeneration, "applied parameter generation", 0xffff_ffff);
  const lastPublishedOutputGainDb = Number(handoff.lastPublishedOutputGainDb);
  const lastAppliedOutputGainDb = Number(handoff.lastAppliedOutputGainDb);
  if (publishedUpdates < 1 || publishedUpdates !== appliedUpdates || lastPublishedGeneration < 1 || lastPublishedGeneration !== lastAppliedGeneration || !Number.isFinite(lastPublishedOutputGainDb) || lastPublishedOutputGainDb < -48 || lastPublishedOutputGainDb > 12 || Math.abs(lastPublishedOutputGainDb - lastAppliedOutputGainDb) > 0.000_001) {
    throw new Error("Native muted-shadow parameter handoff is incoherent.");
  }
  return {
    ...streamReport,
    mode,
    isolation: { ...streamReport.isolation, shadowInput: "generated-golden-only" },
    shadow: {
      fixtureId: "dual-tone-gain",
      fixtureSampleRate: 48_000,
      fixtureFrames: 4_096,
      generatedInput: true,
      checksumAlgorithm: "sha256-float32le-v1",
      expectedSha256,
      actualSha256,
      checksumMatch: true,
      processedCallbacks,
      processedFrames,
      kernelProcessedFrames,
      capturedFrames,
      recoveredSamples,
      failures,
      hardwareOutputZeroFilledAfterShadow: true,
      parameterHandoff: {
        mailbox: "atomic-u64-generation-float32",
        lockFree: true,
        publishedUpdates,
        appliedUpdates,
        lastPublishedGeneration,
        lastAppliedGeneration,
        lastPublishedOutputGainDb,
        lastAppliedOutputGainDb,
        coherent: true,
      },
    },
  };
};

export const validateNativeStressStreamReport = (report) => {
  if (!report || report.mode !== "muted-shadow-stress-lab") throw new Error("Native muted-shadow stress mode is invalid.");
  const normalized = validateNativeShadowStreamReport(report);
  const stress = report.stress;
  if (!stress || stress.systemAudioConfigurationChanged !== false) throw new Error("Native muted-shadow stress isolation is invalid.");
  const targetDurationMs = cleanNonnegativeNumber(stress.targetDurationMs, "stress target duration", 60_000);
  const parameterChangesRequested = cleanNonnegativeInteger(stress.parameterChangesRequested, "stress parameter request count", 100);
  const parameterChangesCompleted = cleanNonnegativeInteger(stress.parameterChangesCompleted, "stress parameter completion count", 100);
  const simulatedRecoveryAtMs = cleanNonnegativeNumber(stress.simulatedRecoveryAtMs, "stress recovery time", 60_000);
  if (targetDurationMs < 9_000 || parameterChangesRequested !== 2 || simulatedRecoveryAtMs < 50 || simulatedRecoveryAtMs >= targetDurationMs) throw new Error("Native muted-shadow stress evidence is invalid.");
  if (!normalized.available) {
    if (parameterChangesCompleted !== 0) throw new Error("Native muted-shadow unavailable stress state is invalid.");
    return { ...normalized, stress: { targetDurationMs, parameterChangesRequested, parameterChangesCompleted, simulatedRecoveryAtMs, systemAudioConfigurationChanged: false } };
  }
  const handoff = normalized.shadow.parameterHandoff;
  if (parameterChangesCompleted !== 2 || handoff.publishedUpdates !== 3 || handoff.appliedUpdates !== 3 || handoff.lastPublishedGeneration !== 3 || handoff.lastAppliedGeneration !== 3 || Math.abs(handoff.lastAppliedOutputGainDb + 0.75) > 0.000_001) {
    throw new Error("Native muted-shadow stress parameter sequence is incomplete.");
  }
  if (normalized.stream.requestedDurationMs !== targetDurationMs || normalized.stream.observedDurationMs < targetDurationMs || normalized.stream.callbacks < 500 || normalized.shadow.processedFrames < 250_000) {
    throw new Error("Native muted-shadow stress duration is insufficient.");
  }
  return {
    ...normalized,
    stress: { targetDurationMs, parameterChangesRequested, parameterChangesCompleted, simulatedRecoveryAtMs, systemAudioConfigurationChanged: false },
  };
};

export const validateNativeHardwareTransitionReport = (report) => {
  if (!report || report.mode !== "muted-shadow-hardware-transition-lab") throw new Error("Native hardware-transition mode is invalid.");
  const normalized = validateNativeShadowStreamReport(report);
  if (!normalized.available) throw new Error("Native hardware-transition verification requires an output device.");
  if (report.stress != null) throw new Error("Native hardware-transition report cannot claim stress evidence.");
  if (normalized.recovery.simulatedDeviceChange || !normalized.recovery.sampleRateListener) throw new Error("Native hardware-transition listeners are incomplete.");

  const evidence = report.hardwareTransitions;
  if (!evidence || evidence.authorization !== "explicit-cli" || evidence.baselineDefaultOutputRestored !== true || evidence.baselineSampleRateRestored !== true) {
    throw new Error("Native hardware-transition restoration evidence is invalid.");
  }
  const output = evidence.controlledDefaultOutput;
  if (!output || output.available !== true || !["built-in", "virtual", "aggregate", "usb", "bluetooth", "display-port", "other"].includes(output.targetKind)
      || output.switchAttempted !== true || output.switchObserved !== true || output.restorationAttempted !== true || output.restorationObserved !== true) {
    throw new Error("Native controlled default-output transition is incomplete.");
  }
  const sampleRate = evidence.sampleRate;
  if (!sampleRate || sampleRate.available !== true || !NATIVE_AUDIO_SAMPLE_RATES.includes(sampleRate.originalHz) || !NATIVE_AUDIO_SAMPLE_RATES.includes(sampleRate.targetHz)
      || sampleRate.originalHz === sampleRate.targetHz || sampleRate.changeAttempted !== true || sampleRate.changeObserved !== true
      || sampleRate.restorationAttempted !== true || sampleRate.restorationObserved !== true) {
    throw new Error("Native sample-rate transition is incomplete.");
  }
  const physical = evidence.physicalDeviceLoss;
  const removablePhysicalOutputsAvailable = cleanNonnegativeInteger(physical?.removablePhysicalOutputsAvailable, "removable physical output count", 100);
  if (!physical || typeof physical.removalAttempted !== "boolean" || typeof physical.lossObserved !== "boolean" || typeof physical.reconnectionObserved !== "boolean") {
    throw new Error("Native physical-device-loss evidence is invalid.");
  }
  if (!physical.removalAttempted) {
    const expectedReason = removablePhysicalOutputsAvailable === 0 ? "no-removable-physical-output" : "manual-removal-required";
    if (physical.lossObserved || physical.reconnectionObserved || physical.reasonCode !== expectedReason) throw new Error("Native physical-device-loss limitation is inconsistent.");
  } else if (!physical.lossObserved || !physical.reconnectionObserved || physical.reasonCode !== "observed") {
    throw new Error("Native physical-device loss and reconnection were not both observed.");
  }
  if (normalized.recovery.deviceChangesObserved < 2 || normalized.recovery.sampleRateChangesObserved < 2 || normalized.lifecycle.recoveries < 4) {
    throw new Error("Native hardware-transition recovery coverage is incomplete.");
  }
  return {
    ...normalized,
    hardwareTransitions: {
      authorization: "explicit-cli",
      controlledDefaultOutput: { ...output },
      sampleRate: { ...sampleRate },
      physicalDeviceLoss: { ...physical, removablePhysicalOutputsAvailable },
      baselineDefaultOutputRestored: true,
      baselineSampleRateRestored: true,
    },
  };
};

const TRANSITIONS = Object.freeze({
  stopped: new Set(["starting"]),
  starting: new Set(["running", "failed", "stopped"]),
  running: new Set(["degraded", "recovering", "failed", "stopped"]),
  degraded: new Set(["running", "recovering", "failed", "stopped"]),
  recovering: new Set(["running", "failed", "stopped"]),
  failed: new Set(["starting", "stopped"]),
});

const RECOVERY_REASON_CODES = new Set(["device-removed", "device-unavailable", "sample-rate-changed", "stream-stopped", "callback-failed", "unknown"]);

export const createNativeAudioEngineTelemetry = ({ now = () => new Date().toISOString(), maximumEvents = 100 } = {}) => {
  let state = "stopped";
  const events = [];
  const eventLimit = integerInRange(maximumEvents, 100, 1, 1_000);
  const counters = {
    callbacks: 0,
    xruns: 0,
    frameMismatches: 0,
    deadlineMisses: 0,
    deviceLosses: 0,
    recoveries: 0,
    failures: 0,
    recoveredSamples: 0,
    longestCallbackMs: 0,
  };

  const appendEvent = (type, detail = {}) => {
    events.push({ type, at: now(), ...detail });
    if (events.length > eventLimit) events.splice(0, events.length - eventLimit);
  };

  const transition = (nextState, type, detail) => {
    if (!TRANSITIONS[state]?.has(nextState)) throw new Error(`Native engine cannot transition from ${state} to ${nextState}.`);
    state = nextState;
    appendEvent(type, detail);
  };

  return {
    start: () => transition("starting", "start-requested"),
    running: () => transition("running", state === "recovering" ? "recovered" : "stream-running"),
    recordCallback: ({ expectedFrames, renderedFrames, callbackDurationMs, deadlineMs, recoveredSamples = 0 }) => {
      if (!["running", "degraded"].includes(state)) throw new Error("Native engine callbacks require a running stream.");
      const expected = integerInRange(expectedFrames, 0, 0, 1_000_000);
      const rendered = integerInRange(renderedFrames, 0, 0, 1_000_000);
      const duration = finiteNumber(callbackDurationMs, 0, 0, 60_000);
      const deadline = finiteNumber(deadlineMs, 0, 0, 60_000);
      const frameMismatch = expected !== rendered;
      const deadlineMiss = deadline > 0 && duration > deadline;
      counters.callbacks += 1;
      counters.frameMismatches += frameMismatch ? 1 : 0;
      counters.deadlineMisses += deadlineMiss ? 1 : 0;
      counters.xruns += frameMismatch || deadlineMiss ? 1 : 0;
      counters.recoveredSamples += integerInRange(recoveredSamples, 0, 0, 1_000_000);
      counters.longestCallbackMs = Math.max(counters.longestCallbackMs, duration);
      if ((frameMismatch || deadlineMiss) && state === "running") transition("degraded", "xrun", { frameMismatch, deadlineMiss });
      return { frameMismatch, deadlineMiss };
    },
    stable: () => {
      if (state === "degraded") transition("running", "stream-stable");
    },
    deviceLost: (reasonCode = "unknown") => {
      const reason = RECOVERY_REASON_CODES.has(reasonCode) ? reasonCode : "unknown";
      counters.deviceLosses += 1;
      transition("recovering", "device-lost", { reasonCode: reason });
    },
    recovered: () => {
      counters.recoveries += 1;
      transition("running", "device-recovered");
    },
    fail: (reasonCode = "unknown") => {
      counters.failures += 1;
      transition("failed", "engine-failed", { reasonCode: RECOVERY_REASON_CODES.has(reasonCode) ? reasonCode : "unknown" });
    },
    stop: () => transition("stopped", "stream-stopped"),
    snapshot: () => ({
      protocolVersion: NATIVE_AUDIO_ENGINE_PROTOCOL_VERSION,
      dspContractVersion: SHARED_DSP_CONTRACT_VERSION,
      state,
      counters: { ...counters, longestCallbackMs: Number(counters.longestCallbackMs.toFixed(3)) },
      events: events.map((event) => ({ ...event })),
    }),
  };
};
