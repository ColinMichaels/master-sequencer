import { SHARED_DSP_CONTRACT_VERSION } from "../dsp/shared-dsp-core.js";

export const NATIVE_AUDIO_ENGINE_PROTOCOL_VERSION = 1;
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
