export const END_MODES = new Set(["natural", "cut", "fade", "crossfade"]);

const range = (minimum, maximum) => Object.freeze({ minimum, maximum });

export const MASTERING_LIMITS = Object.freeze({
  trackGainDb: range(-24, 12),
  eqGainDb: range(-12, 12),
  lowShelfFrequencyHz: range(20, 500),
  midBandFrequencyHz: range(80, 18_000),
  midBandQ: range(0.1, 10),
  highShelfFrequencyHz: range(1_000, 20_000),
  compressorThresholdDb: range(-60, 0),
  compressorRatio: range(1, 20),
  compressorAttackMs: range(0.01, 2_000),
  compressorReleaseMs: range(0.01, 9_000),
  compressorKnee: range(1, 8),
  compressorMakeupGainDb: range(0, 24),
  compressorMix: range(0, 1),
  outputGainDb: range(-24, 12),
  limiterCeilingDbfs: range(-9, 0),
  limiterAttackMs: range(0.1, 80),
  limiterReleaseMs: range(1, 8_000),
});

export const MASTER_BUS_DEFAULTS = Object.freeze({
  bypass: false,
  eq: Object.freeze({
    enabled: false,
    lowShelf: Object.freeze({ frequencyHz: 120, gainDb: 0 }),
    midBand: Object.freeze({ frequencyHz: 1_000, gainDb: 0, q: 1 }),
    highShelf: Object.freeze({ frequencyHz: 8_000, gainDb: 0 }),
  }),
  compressor: Object.freeze({
    enabled: false,
    thresholdDb: -18,
    ratio: 2,
    attackMs: 30,
    releaseMs: 250,
    knee: 2.82843,
    makeupGainDb: 0,
    mix: 1,
    link: "maximum",
    detection: "rms",
  }),
  outputGainDb: 0,
  limiter: Object.freeze({
    enabled: false,
    ceilingDbfs: -1,
    attackMs: 5,
    releaseMs: 50,
  }),
});

const finiteNumber = (value, fallback) => {
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};

const clamp = (value, minimum, maximum) => Math.min(maximum, Math.max(minimum, value));

const asObject = (value) => value && typeof value === "object" && !Array.isArray(value) ? value : {};

const normalizeWithin = (value, fallback, limits) => clamp(finiteNumber(value, fallback), limits.minimum, limits.maximum);

const normalizeBoolean = (value, fallback) => typeof value === "boolean" ? value : fallback;

export const normalizeMasterBus = (settings = {}) => {
  const bus = asObject(settings);
  const eq = asObject(bus.eq);
  const lowShelf = asObject(eq.lowShelf);
  const midBand = asObject(eq.midBand);
  const highShelf = asObject(eq.highShelf);
  const compressor = asObject(bus.compressor);
  const limiter = asObject(bus.limiter);

  return {
    bypass: normalizeBoolean(bus.bypass, MASTER_BUS_DEFAULTS.bypass),
    eq: {
      enabled: normalizeBoolean(eq.enabled, MASTER_BUS_DEFAULTS.eq.enabled),
      lowShelf: {
        frequencyHz: normalizeWithin(lowShelf.frequencyHz, MASTER_BUS_DEFAULTS.eq.lowShelf.frequencyHz, MASTERING_LIMITS.lowShelfFrequencyHz),
        gainDb: normalizeWithin(lowShelf.gainDb, MASTER_BUS_DEFAULTS.eq.lowShelf.gainDb, MASTERING_LIMITS.eqGainDb),
      },
      midBand: {
        frequencyHz: normalizeWithin(midBand.frequencyHz, MASTER_BUS_DEFAULTS.eq.midBand.frequencyHz, MASTERING_LIMITS.midBandFrequencyHz),
        gainDb: normalizeWithin(midBand.gainDb, MASTER_BUS_DEFAULTS.eq.midBand.gainDb, MASTERING_LIMITS.eqGainDb),
        q: normalizeWithin(midBand.q, MASTER_BUS_DEFAULTS.eq.midBand.q, MASTERING_LIMITS.midBandQ),
      },
      highShelf: {
        frequencyHz: normalizeWithin(highShelf.frequencyHz, MASTER_BUS_DEFAULTS.eq.highShelf.frequencyHz, MASTERING_LIMITS.highShelfFrequencyHz),
        gainDb: normalizeWithin(highShelf.gainDb, MASTER_BUS_DEFAULTS.eq.highShelf.gainDb, MASTERING_LIMITS.eqGainDb),
      },
    },
    compressor: {
      enabled: normalizeBoolean(compressor.enabled, MASTER_BUS_DEFAULTS.compressor.enabled),
      thresholdDb: normalizeWithin(compressor.thresholdDb, MASTER_BUS_DEFAULTS.compressor.thresholdDb, MASTERING_LIMITS.compressorThresholdDb),
      ratio: normalizeWithin(compressor.ratio, MASTER_BUS_DEFAULTS.compressor.ratio, MASTERING_LIMITS.compressorRatio),
      attackMs: normalizeWithin(compressor.attackMs, MASTER_BUS_DEFAULTS.compressor.attackMs, MASTERING_LIMITS.compressorAttackMs),
      releaseMs: normalizeWithin(compressor.releaseMs, MASTER_BUS_DEFAULTS.compressor.releaseMs, MASTERING_LIMITS.compressorReleaseMs),
      knee: normalizeWithin(compressor.knee, MASTER_BUS_DEFAULTS.compressor.knee, MASTERING_LIMITS.compressorKnee),
      makeupGainDb: normalizeWithin(compressor.makeupGainDb, MASTER_BUS_DEFAULTS.compressor.makeupGainDb, MASTERING_LIMITS.compressorMakeupGainDb),
      mix: normalizeWithin(compressor.mix, MASTER_BUS_DEFAULTS.compressor.mix, MASTERING_LIMITS.compressorMix),
      link: ["average", "maximum"].includes(compressor.link) ? compressor.link : MASTER_BUS_DEFAULTS.compressor.link,
      detection: ["peak", "rms"].includes(compressor.detection) ? compressor.detection : MASTER_BUS_DEFAULTS.compressor.detection,
    },
    outputGainDb: normalizeWithin(bus.outputGainDb, MASTER_BUS_DEFAULTS.outputGainDb, MASTERING_LIMITS.outputGainDb),
    limiter: {
      enabled: normalizeBoolean(limiter.enabled, MASTER_BUS_DEFAULTS.limiter.enabled),
      ceilingDbfs: normalizeWithin(limiter.ceilingDbfs, MASTER_BUS_DEFAULTS.limiter.ceilingDbfs, MASTERING_LIMITS.limiterCeilingDbfs),
      attackMs: normalizeWithin(limiter.attackMs, MASTER_BUS_DEFAULTS.limiter.attackMs, MASTERING_LIMITS.limiterAttackMs),
      releaseMs: normalizeWithin(limiter.releaseMs, MASTER_BUS_DEFAULTS.limiter.releaseMs, MASTERING_LIMITS.limiterReleaseMs),
    },
  };
};

export const normalizeMastering = (settings = {}, sourceDuration = 0, { hasNext = true } = {}) => {
  const safeDuration = Math.max(0.1, finiteNumber(sourceDuration, 0.1));
  const trimStart = clamp(finiteNumber(settings.trimStart, 0), 0, Math.max(0, safeDuration - 0.1));
  const requestedEnd = settings.trimEnd === null || settings.trimEnd === undefined || settings.trimEnd === ""
    ? safeDuration
    : finiteNumber(settings.trimEnd, safeDuration);
  const trimEnd = clamp(requestedEnd, trimStart + 0.1, safeDuration);
  const duration = trimEnd - trimStart;
  const fadeIn = clamp(finiteNumber(settings.fadeIn, 0), 0, Math.max(0, duration - 0.05));
  const requestedMode = END_MODES.has(settings.endMode) ? settings.endMode : "natural";
  const endMode = requestedMode === "crossfade" && !hasNext ? "fade" : requestedMode;
  const endDuration = clamp(finiteNumber(settings.endDuration, 3), 0.05, Math.max(0.05, duration - 0.01));
  const gapAfter = endMode === "crossfade" ? 0 : clamp(finiteNumber(settings.gapAfter, 0), 0, 30);
  const gainDb = normalizeWithin(settings.gainDb, 0, MASTERING_LIMITS.trackGainDb);

  return { trimStart, trimEnd, duration, fadeIn, endMode, endDuration, gapAfter, gainDb };
};

export const calculateProgramTimeline = (entries) => {
  const normalizedSettings = entries.map((entry, index) => normalizeMastering(entry.mastering, entry.sourceDuration, { hasNext: index < entries.length - 1 }));
  let cursor = 0;
  return entries.map((entry, index) => {
    const settings = normalizedSettings[index];
    const nextDuration = normalizedSettings[index + 1]?.duration || 0;
    const overlap = settings.endMode === "crossfade" && index < entries.length - 1
      ? Math.min(settings.endDuration, settings.duration - 0.05, Math.max(0, nextDuration - 0.05))
      : 0;
    const result = { ...entry, settings, outputStart: cursor, outputEnd: cursor + settings.duration, overlap };
    cursor += settings.duration - overlap + settings.gapAfter;
    return result;
  });
};

export const programDuration = (entries) => {
  const timeline = calculateProgramTimeline(entries);
  if (!timeline.length) return 0;
  const last = timeline[timeline.length - 1];
  return last.outputEnd;
};

export const masteringSummary = (settings = {}) => {
  const mode = END_MODES.has(settings.endMode) ? settings.endMode : "natural";
  if (mode === "crossfade") return `${finiteNumber(settings.endDuration, 3).toFixed(1)}s crossfade`;
  if (mode === "fade") return `${finiteNumber(settings.endDuration, 3).toFixed(1)}s fade out`;
  if (mode === "cut") return "Hard cut";
  return finiteNumber(settings.gapAfter, 0) > 0 ? `Natural · ${finiteNumber(settings.gapAfter, 0).toFixed(1)}s gap` : "Natural ending";
};
