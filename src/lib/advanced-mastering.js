import { MASTERING_LIMITS, normalizeMasterBus } from "./mastering.js";

export const ADVANCED_RACK_VERSION = 2;
export const ADVANCED_RACK_MAX_PROCESSORS = 16;
export const MASTERING_PLUGIN_NODE_VERSION = 2;

export const MASTERING_PLUGIN_FORMATS = Object.freeze({
  builtin: "builtin",
  vst3: "vst3",
  audioUnit: "audio-unit",
});

export const ADVANCED_PROCESSOR_TYPES = Object.freeze({
  eq: "sequencer.program-eq",
  compressor: "sequencer.bus-compressor",
  output: "sequencer.master-output",
  limiter: "sequencer.precision-limiter",
  stereoField: "sequencer.stereo-field",
  harmonicColor: "sequencer.harmonic-color",
  phaseAlignment: "sequencer.phase-alignment",
  hfSmoother: "sequencer.hf-smoother",
  ambience: "sequencer.mastering-ambience",
  transientShaper: "sequencer.transient-shaper",
  creativePhaser: "sequencer.creative-phaser",
});

// Catalog availability describes whether the current installation can offer a
// plug-in. Rack nodes below describe individual user instances and preserve
// their own identity/state. Keeping those concerns separate lets a future
// native scanner resolve owned VST3/AU products without changing project data.
const builtin = (definition) => Object.freeze({
  ...definition,
  pluginFormat: MASTERING_PLUGIN_FORMATS.builtin,
  vendor: "Project Sequencer",
  included: true,
  available: true,
  hostRequirement: "web-audio+ffmpeg",
});

export const ADVANCED_PROCESSOR_CATALOG = Object.freeze([
  builtin({ typeId: ADVANCED_PROCESSOR_TYPES.eq, name: "Program Equalizer", shortName: "EQ", rackUnits: 2, accent: "copper", category: "Tone", description: "Four-band mastering equalizer with Stereo, Mid, or Side operation." }),
  builtin({ typeId: ADVANCED_PROCESSOR_TYPES.compressor, name: "Bus Compressor", shortName: "COMP", rackUnits: 2, accent: "navy", category: "Dynamics", description: "Stereo mastering compression with parallel and sidechain-filter controls." }),
  builtin({ typeId: ADVANCED_PROCESSOR_TYPES.stereoField, name: "Stereo Field Matrix", shortName: "FIELD", rackUnits: 2, accent: "cyan", category: "Spatial", description: "Mid/Side width, depth, low-frequency focus, balance, and space shaping." }),
  builtin({ typeId: ADVANCED_PROCESSOR_TYPES.harmonicColor, name: "Harmonic Color", shortName: "COLOR", rackUnits: 2, accent: "amber", category: "Color", description: "Oversampled even/odd harmonic generation with dry/wet and channel targeting." }),
  builtin({ typeId: ADVANCED_PROCESSOR_TYPES.phaseAlignment, name: "Phase Alignment", shortName: "PHASE", rackUnits: 1, accent: "violet", category: "Repair", description: "Static all-pass rotation, polarity, and sample delay without modulation." }),
  builtin({ typeId: ADVANCED_PROCESSOR_TYPES.hfSmoother, name: "HF Smoother", shortName: "HF", rackUnits: 1, accent: "ice", category: "Dynamics", description: "Frequency-selective high-band compression for brittle or aggressive masters." }),
  builtin({ typeId: ADVANCED_PROCESSOR_TYPES.ambience, name: "Mastering Ambience", shortName: "SPACE", rackUnits: 2, accent: "teal", category: "Spatial", description: "Restrained deterministic convolution room, chamber, and plate ambience." }),
  builtin({ typeId: ADVANCED_PROCESSOR_TYPES.transientShaper, name: "Transient Sculptor", shortName: "IMPACT", rackUnits: 1, accent: "lime", category: "Dynamics", description: "Mastering-range attack and sustain shaping with stereo-linked detection." }),
  builtin({ typeId: ADVANCED_PROCESSOR_TYPES.creativePhaser, name: "Creative Phaser", shortName: "PHASER", rackUnits: 1, accent: "magenta", category: "Creative", description: "Deliberate moving phase effect, constrained and clearly separated from repair." }),
  builtin({ typeId: ADVANCED_PROCESSOR_TYPES.output, name: "Master Output", shortName: "OUT", rackUnits: 1, accent: "graphite", category: "Utility", description: "Calibrated final line-stage trim." }),
  builtin({ typeId: ADVANCED_PROCESSOR_TYPES.limiter, name: "Precision Limiter", shortName: "LIMIT", rackUnits: 2, accent: "aluminum", category: "Dynamics", description: "Oversampled final peak control with adjustable stereo linking." }),
]);

const TYPE_IDS = new Set(ADVANCED_PROCESSOR_CATALOG.map((definition) => definition.typeId));
const asObject = (value) => value && typeof value === "object" && !Array.isArray(value) ? value : {};
const safeId = (value, fallback) => typeof value === "string" && /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(value) && value.length <= 120 ? value : fallback;
const safeName = (value, fallback) => typeof value === "string" && value.trim() ? value.trim().slice(0, 80) : fallback;
const finiteNumber = (value, fallback) => Number.isFinite(Number(value)) ? Number(value) : fallback;
const range = (minimum, maximum) => Object.freeze({ minimum, maximum });
const clamp = (value, limits) => Math.min(limits.maximum, Math.max(limits.minimum, finiteNumber(value, limits.minimum)));
const normalizeBoolean = (value, fallback) => typeof value === "boolean" ? value : fallback;
const normalizeEnum = (value, choices, fallback) => choices.includes(value) ? value : fallback;

export const ADVANCED_PROCESSOR_LIMITS = Object.freeze({
  widthDb: range(-6, 6),
  depthDb: range(-3, 3),
  monoBelowHz: range(20, 500),
  spaceDb: range(-6, 6),
  spaceFrequencyHz: range(80, 800),
  balance: range(-1, 1),
  colorDriveDb: range(0, 18),
  harmonicAmount: range(0, 1),
  colorFrequencyHz: range(100, 12_000),
  colorMix: range(0, 1),
  phaseDelaySamples: range(0, 96),
  phaseShift: range(-1, 1),
  hfFrequencyHz: range(2_000, 16_000),
  hfRatio: range(1, 10),
  ambiencePreDelayMs: range(0, 80),
  ambienceDecaySeconds: range(0.2, 3),
  ambienceDampingHz: range(2_000, 20_000),
  ambienceLowCutHz: range(20, 1_000),
  ambienceWidthPercent: range(0, 150),
  ambienceWetPercent: range(0, 5),
  transientDb: range(-5, 5),
  transientFocusHz: range(20, 2_000),
  phaserRateHz: range(0.01, 2),
  phaserDepth: range(0, 1),
  phaserCenterHz: range(80, 8_000),
  phaserFeedback: range(-0.8, 0.8),
  phaserMix: range(0, 0.5),
  phaserStereoDegrees: range(0, 180),
});

const ADVANCED_EQ_DEFAULTS = Object.freeze({
  lowMidBand: Object.freeze({ frequencyHz: 400, gainDb: 0, q: 1 }),
  highMidBand: Object.freeze({ frequencyHz: 1_600, gainDb: 0, q: 1 }),
  outputGainDb: 0,
});

const normalizeChannelMode = (value, fallback = "stereo") => normalizeEnum(value, ["stereo", "mid", "side"], fallback);

export const processorDefinition = (typeId) => ADVANCED_PROCESSOR_CATALOG.find((definition) => definition.typeId === typeId);
export const availablePluginDefinitions = () => ADVANCED_PROCESSOR_CATALOG.filter((definition) => definition.available);
export const isExternalProcessor = (node) => [MASTERING_PLUGIN_FORMATS.vst3, MASTERING_PLUGIN_FORMATS.audioUnit].includes(node?.pluginRef?.format);

const builtinPluginRef = (typeId) => ({
  format: MASTERING_PLUGIN_FORMATS.builtin,
  pluginId: typeId,
  vendor: "Project Sequencer",
  included: true,
});

export const processorDefaultParameters = (typeId) => {
  const bus = normalizeMasterBus();
  if (typeId === ADVANCED_PROCESSOR_TYPES.eq) return {
    enabled: true,
    channelMode: "stereo",
    lowShelf: bus.eq.lowShelf,
    lowMidBand: { ...ADVANCED_EQ_DEFAULTS.lowMidBand },
    highMidBand: { ...ADVANCED_EQ_DEFAULTS.highMidBand },
    highShelf: bus.eq.highShelf,
    outputGainDb: ADVANCED_EQ_DEFAULTS.outputGainDb,
  };
  if (typeId === ADVANCED_PROCESSOR_TYPES.compressor) return { ...bus.compressor, enabled: true, channelMode: "stereo", sidechainEnabled: false, sidechainFilterHz: 120 };
  if (typeId === ADVANCED_PROCESSOR_TYPES.output) return { outputGainDb: bus.outputGainDb };
  if (typeId === ADVANCED_PROCESSOR_TYPES.limiter) return { ...bus.limiter, enabled: true, oversample: 4, stereoLinkPercent: 100 };
  if (typeId === ADVANCED_PROCESSOR_TYPES.stereoField) return { widthDb: 0, depthDb: 0, monoBelowHz: 120, spaceDb: 0, spaceFrequencyHz: 300, balance: 0 };
  if (typeId === ADVANCED_PROCESSOR_TYPES.harmonicColor) return { channelMode: "stereo", driveDb: 0, evenAmount: 0.2, oddAmount: 0.15, colorFrequencyHz: 1_500, mix: 0, oversample: 4, outputGainDb: 0 };
  if (typeId === ADVANCED_PROCESSOR_TYPES.phaseAlignment) return { target: "right", polarityInvert: false, delaySamples: 0, centerFrequencyHz: 1_000, q: 0.707, shift: 0, mix: 1 };
  if (typeId === ADVANCED_PROCESSOR_TYPES.hfSmoother) return { frequencyHz: 6_500, thresholdDb: -12, ratio: 2, attackMs: 5, releaseMs: 120, mix: 1, outputGainDb: 0 };
  if (typeId === ADVANCED_PROCESSOR_TYPES.ambience) return { model: "room", preDelayMs: 12, decaySeconds: 0.8, dampingHz: 9_000, lowCutHz: 120, widthPercent: 100, wetPercent: 0 };
  if (typeId === ADVANCED_PROCESSOR_TYPES.transientShaper) return { mode: "full", attackDb: 0, sustainDb: 0, focusFrequencyHz: 120, stereoLink: true, outputGainDb: 0 };
  if (typeId === ADVANCED_PROCESSOR_TYPES.creativePhaser) return { rateHz: 0.2, depth: 0.2, centerFrequencyHz: 800, feedback: 0.1, mix: 0, stereoOffsetDegrees: 45 };
  return {};
};

const normalizeEq = (value) => {
  const source = asObject(value);
  const legacy = normalizeMasterBus({ eq: { ...source, enabled: true } }).eq;
  const legacyMid = legacy.midBand;
  const lowMidSource = Object.keys(asObject(source.lowMidBand)).length
    ? asObject(source.lowMidBand)
    : legacyMid.frequencyHz <= MASTERING_LIMITS.lowMidBandFrequencyHz.maximum ? legacyMid : ADVANCED_EQ_DEFAULTS.lowMidBand;
  const highMidSource = Object.keys(asObject(source.highMidBand)).length
    ? asObject(source.highMidBand)
    : legacyMid.frequencyHz > MASTERING_LIMITS.lowMidBandFrequencyHz.maximum ? legacyMid : ADVANCED_EQ_DEFAULTS.highMidBand;
  const normalizeMidBand = (band, defaults, frequencyLimits) => ({
    frequencyHz: clamp(band.frequencyHz ?? defaults.frequencyHz, frequencyLimits),
    gainDb: clamp(band.gainDb ?? defaults.gainDb, MASTERING_LIMITS.eqGainDb),
    q: clamp(band.q ?? defaults.q, MASTERING_LIMITS.midBandQ),
  });
  return {
    enabled: true,
    channelMode: normalizeChannelMode(source.channelMode),
    lowShelf: legacy.lowShelf,
    lowMidBand: normalizeMidBand(lowMidSource, ADVANCED_EQ_DEFAULTS.lowMidBand, MASTERING_LIMITS.lowMidBandFrequencyHz),
    highMidBand: normalizeMidBand(highMidSource, ADVANCED_EQ_DEFAULTS.highMidBand, MASTERING_LIMITS.highMidBandFrequencyHz),
    highShelf: legacy.highShelf,
    outputGainDb: clamp(source.outputGainDb ?? ADVANCED_EQ_DEFAULTS.outputGainDb, MASTERING_LIMITS.eqOutputGainDb),
  };
};

const normalizeCompressor = (value) => {
  const source = asObject(value);
  const normalized = normalizeMasterBus({ compressor: { ...source, enabled: true } }).compressor;
  return {
    ...normalized,
    enabled: true,
    channelMode: normalizeChannelMode(source.channelMode),
    sidechainEnabled: normalizeBoolean(source.sidechainEnabled, false),
    sidechainFilterHz: clamp(source.sidechainFilterHz ?? 120, MASTERING_LIMITS.compressorSidechainFilterHz),
  };
};

const normalizeOutput = (value) => ({ outputGainDb: clamp(asObject(value).outputGainDb ?? 0, MASTERING_LIMITS.outputGainDb) });

const normalizeLimiter = (value) => {
  const source = asObject(value);
  const normalized = normalizeMasterBus({ limiter: { ...source, enabled: true } }).limiter;
  return {
    ...normalized,
    enabled: true,
    oversample: [1, 2, 4, 8].includes(Number(source.oversample)) ? Number(source.oversample) : 4,
    stereoLinkPercent: clamp(source.stereoLinkPercent ?? 100, MASTERING_LIMITS.limiterStereoLinkPercent),
  };
};

const normalizeStereoField = (value) => {
  const source = asObject(value);
  return {
    widthDb: clamp(source.widthDb ?? 0, ADVANCED_PROCESSOR_LIMITS.widthDb),
    depthDb: clamp(source.depthDb ?? 0, ADVANCED_PROCESSOR_LIMITS.depthDb),
    monoBelowHz: clamp(source.monoBelowHz ?? 120, ADVANCED_PROCESSOR_LIMITS.monoBelowHz),
    spaceDb: clamp(source.spaceDb ?? 0, ADVANCED_PROCESSOR_LIMITS.spaceDb),
    spaceFrequencyHz: clamp(source.spaceFrequencyHz ?? 300, ADVANCED_PROCESSOR_LIMITS.spaceFrequencyHz),
    balance: clamp(source.balance ?? 0, ADVANCED_PROCESSOR_LIMITS.balance),
  };
};

const normalizeHarmonicColor = (value) => {
  const source = asObject(value);
  return {
    channelMode: normalizeChannelMode(source.channelMode),
    driveDb: clamp(source.driveDb ?? 0, ADVANCED_PROCESSOR_LIMITS.colorDriveDb),
    evenAmount: clamp(source.evenAmount ?? 0.2, ADVANCED_PROCESSOR_LIMITS.harmonicAmount),
    oddAmount: clamp(source.oddAmount ?? 0.15, ADVANCED_PROCESSOR_LIMITS.harmonicAmount),
    colorFrequencyHz: clamp(source.colorFrequencyHz ?? 1_500, ADVANCED_PROCESSOR_LIMITS.colorFrequencyHz),
    mix: clamp(source.mix ?? 0, ADVANCED_PROCESSOR_LIMITS.colorMix),
    oversample: [1, 2, 4].includes(Number(source.oversample)) ? Number(source.oversample) : 4,
    outputGainDb: clamp(source.outputGainDb ?? 0, MASTERING_LIMITS.outputGainDb),
  };
};

const normalizePhaseAlignment = (value) => {
  const source = asObject(value);
  return {
    target: normalizeEnum(source.target, ["left", "right", "mid", "side"], "right"),
    polarityInvert: normalizeBoolean(source.polarityInvert, false),
    delaySamples: clamp(source.delaySamples ?? 0, ADVANCED_PROCESSOR_LIMITS.phaseDelaySamples),
    centerFrequencyHz: clamp(source.centerFrequencyHz ?? 1_000, MASTERING_LIMITS.highShelfFrequencyHz),
    q: clamp(source.q ?? 0.707, MASTERING_LIMITS.midBandQ),
    shift: clamp(source.shift ?? 0, ADVANCED_PROCESSOR_LIMITS.phaseShift),
    mix: clamp(source.mix ?? 1, ADVANCED_PROCESSOR_LIMITS.colorMix),
  };
};

const normalizeHfSmoother = (value) => {
  const source = asObject(value);
  return {
    frequencyHz: clamp(source.frequencyHz ?? 6_500, ADVANCED_PROCESSOR_LIMITS.hfFrequencyHz),
    thresholdDb: clamp(source.thresholdDb ?? -12, MASTERING_LIMITS.compressorThresholdDb),
    ratio: clamp(source.ratio ?? 2, ADVANCED_PROCESSOR_LIMITS.hfRatio),
    attackMs: clamp(source.attackMs ?? 5, MASTERING_LIMITS.compressorAttackMs),
    releaseMs: clamp(source.releaseMs ?? 120, MASTERING_LIMITS.compressorReleaseMs),
    mix: clamp(source.mix ?? 1, ADVANCED_PROCESSOR_LIMITS.colorMix),
    outputGainDb: clamp(source.outputGainDb ?? 0, MASTERING_LIMITS.outputGainDb),
  };
};

const normalizeAmbience = (value) => {
  const source = asObject(value);
  return {
    model: normalizeEnum(source.model, ["room", "chamber", "plate"], "room"),
    preDelayMs: clamp(source.preDelayMs ?? 12, ADVANCED_PROCESSOR_LIMITS.ambiencePreDelayMs),
    decaySeconds: clamp(source.decaySeconds ?? 0.8, ADVANCED_PROCESSOR_LIMITS.ambienceDecaySeconds),
    dampingHz: clamp(source.dampingHz ?? 9_000, ADVANCED_PROCESSOR_LIMITS.ambienceDampingHz),
    lowCutHz: clamp(source.lowCutHz ?? 120, ADVANCED_PROCESSOR_LIMITS.ambienceLowCutHz),
    widthPercent: clamp(source.widthPercent ?? 100, ADVANCED_PROCESSOR_LIMITS.ambienceWidthPercent),
    wetPercent: clamp(source.wetPercent ?? 0, ADVANCED_PROCESSOR_LIMITS.ambienceWetPercent),
  };
};

const normalizeTransientShaper = (value) => {
  const source = asObject(value);
  return {
    mode: normalizeEnum(source.mode, ["full", "focused"], "full"),
    attackDb: clamp(source.attackDb ?? 0, ADVANCED_PROCESSOR_LIMITS.transientDb),
    sustainDb: clamp(source.sustainDb ?? 0, ADVANCED_PROCESSOR_LIMITS.transientDb),
    focusFrequencyHz: clamp(source.focusFrequencyHz ?? 120, ADVANCED_PROCESSOR_LIMITS.transientFocusHz),
    stereoLink: normalizeBoolean(source.stereoLink, true),
    outputGainDb: clamp(source.outputGainDb ?? 0, MASTERING_LIMITS.outputGainDb),
  };
};

const normalizeCreativePhaser = (value) => {
  const source = asObject(value);
  return {
    rateHz: clamp(source.rateHz ?? 0.2, ADVANCED_PROCESSOR_LIMITS.phaserRateHz),
    depth: clamp(source.depth ?? 0.2, ADVANCED_PROCESSOR_LIMITS.phaserDepth),
    centerFrequencyHz: clamp(source.centerFrequencyHz ?? 800, ADVANCED_PROCESSOR_LIMITS.phaserCenterHz),
    feedback: clamp(source.feedback ?? 0.1, ADVANCED_PROCESSOR_LIMITS.phaserFeedback),
    mix: clamp(source.mix ?? 0, ADVANCED_PROCESSOR_LIMITS.phaserMix),
    stereoOffsetDegrees: clamp(source.stereoOffsetDegrees ?? 45, ADVANCED_PROCESSOR_LIMITS.phaserStereoDegrees),
  };
};

export const normalizeProcessorParameters = (typeId, value) => {
  if (typeId === ADVANCED_PROCESSOR_TYPES.eq) return normalizeEq(value);
  if (typeId === ADVANCED_PROCESSOR_TYPES.compressor) return normalizeCompressor(value);
  if (typeId === ADVANCED_PROCESSOR_TYPES.output) return normalizeOutput(value);
  if (typeId === ADVANCED_PROCESSOR_TYPES.limiter) return normalizeLimiter(value);
  if (typeId === ADVANCED_PROCESSOR_TYPES.stereoField) return normalizeStereoField(value);
  if (typeId === ADVANCED_PROCESSOR_TYPES.harmonicColor) return normalizeHarmonicColor(value);
  if (typeId === ADVANCED_PROCESSOR_TYPES.phaseAlignment) return normalizePhaseAlignment(value);
  if (typeId === ADVANCED_PROCESSOR_TYPES.hfSmoother) return normalizeHfSmoother(value);
  if (typeId === ADVANCED_PROCESSOR_TYPES.ambience) return normalizeAmbience(value);
  if (typeId === ADVANCED_PROCESSOR_TYPES.transientShaper) return normalizeTransientShaper(value);
  if (typeId === ADVANCED_PROCESSOR_TYPES.creativePhaser) return normalizeCreativePhaser(value);
  return {};
};

export const createAdvancedProcessor = (typeId, id) => {
  const definition = processorDefinition(typeId);
  if (!definition) throw new Error("Choose an available mastering plug-in.");
  return {
    id: safeId(id, `${definition.shortName.toLowerCase()}-${Date.now().toString(36)}`),
    typeId,
    definitionVersion: MASTERING_PLUGIN_NODE_VERSION,
    pluginRef: builtinPluginRef(typeId),
    name: definition.name,
    bypass: false,
    parameters: processorDefaultParameters(typeId),
  };
};

export const createExternalPluginProcessor = ({ format, pluginId, vendor = "Unknown vendor", name = "External plug-in" }, id) => {
  if (![MASTERING_PLUGIN_FORMATS.vst3, MASTERING_PLUGIN_FORMATS.audioUnit].includes(format) || typeof pluginId !== "string" || !pluginId.trim()) throw new Error("External plug-ins need a VST3 or Audio Unit identity.");
  const safePluginId = pluginId.trim().slice(0, 240);
  return {
    id: safeId(id, `external-${Date.now().toString(36)}`),
    typeId: `external.${format}.${safePluginId}`,
    definitionVersion: MASTERING_PLUGIN_NODE_VERSION,
    pluginRef: { format, pluginId: safePluginId, vendor: safeName(vendor, "Unknown vendor"), included: false },
    name: safeName(name, "External plug-in"),
    bypass: true,
    unavailable: true,
    parameters: {},
    opaqueState: "",
  };
};

export const buildSerialConnections = (nodes = []) => {
  const points = ["input", ...nodes.map((node) => node.id), "output"];
  return points.slice(0, -1).map((from, index) => ({ from, to: points[index + 1] }));
};

const DEFAULT_NODE_TYPES = [
  ADVANCED_PROCESSOR_TYPES.eq,
  ADVANCED_PROCESSOR_TYPES.compressor,
  ADVANCED_PROCESSOR_TYPES.output,
  ADVANCED_PROCESSOR_TYPES.limiter,
];

export const createDefaultAdvancedMastering = () => {
  const nodes = DEFAULT_NODE_TYPES.map((typeId, index) => createAdvancedProcessor(typeId, `rack-${index + 1}`));
  return { graphVersion: ADVANCED_RACK_VERSION, bypass: false, nodes, connections: buildSerialConnections(nodes) };
};

// Missing external binaries are not discarded: the project keeps their stable
// identity and bounded state, but forces the unresolved instance unavailable so
// neither live audition nor an authoritative print can silently substitute DSP.
const normalizeExternalNode = (node, index) => {
  const pluginRef = asObject(node.pluginRef);
  if (![MASTERING_PLUGIN_FORMATS.vst3, MASTERING_PLUGIN_FORMATS.audioUnit].includes(pluginRef.format) || typeof pluginRef.pluginId !== "string" || !pluginRef.pluginId.trim()) return null;
  return {
    id: safeId(node.id, `external-${index + 1}`),
    typeId: typeof node.typeId === "string" ? node.typeId.slice(0, 300) : `external.${pluginRef.format}.${pluginRef.pluginId}`,
    definitionVersion: MASTERING_PLUGIN_NODE_VERSION,
    pluginRef: { format: pluginRef.format, pluginId: pluginRef.pluginId.trim().slice(0, 240), vendor: safeName(pluginRef.vendor, "Unknown vendor"), included: false },
    name: safeName(node.name, "External plug-in"),
    bypass: typeof node.bypass === "boolean" ? node.bypass : true,
    unavailable: true,
    parameters: asObject(node.parameters),
    opaqueState: typeof node.opaqueState === "string" ? node.opaqueState.slice(0, 2_000_000) : "",
  };
};

export const normalizeAdvancedMastering = (value = {}) => {
  const rack = asObject(value);
  const seen = new Set();
  const nodes = (Array.isArray(rack.nodes) ? rack.nodes : createDefaultAdvancedMastering().nodes)
    .slice(0, ADVANCED_RACK_MAX_PROCESSORS)
    .flatMap((candidate, index) => {
      const node = asObject(candidate);
      const external = !TYPE_IDS.has(node.typeId) ? normalizeExternalNode(node, index) : null;
      if (!TYPE_IDS.has(node.typeId) && !external) return [];
      const definition = processorDefinition(node.typeId);
      const normalized = external || {
        id: safeId(node.id, `rack-${index + 1}`),
        typeId: node.typeId,
        definitionVersion: MASTERING_PLUGIN_NODE_VERSION,
        pluginRef: builtinPluginRef(node.typeId),
        name: safeName(node.name, definition.name),
        bypass: typeof node.bypass === "boolean" ? node.bypass : false,
        parameters: normalizeProcessorParameters(node.typeId, node.parameters),
      };
      let id = normalized.id;
      while (seen.has(id)) id = `${id}-${index + 1}`;
      seen.add(id);
      return [{ ...normalized, id }];
    });
  return {
    graphVersion: ADVANCED_RACK_VERSION,
    bypass: typeof rack.bypass === "boolean" ? rack.bypass : false,
    nodes,
    connections: buildSerialConnections(nodes),
  };
};

export const normalizeMasteringPath = (value) => value === "advanced" ? "advanced" : "basic";

export const activeAdvancedProcessors = (rack = {}) => {
  const settings = normalizeAdvancedMastering(rack);
  if (settings.bypass) return [];
  return settings.nodes.filter((node) => !node.bypass && !node.unavailable).map((node) => processorDefinition(node.typeId)?.shortName || node.name).filter(Boolean);
};

export const masteringPathSummary = ({ masteringPath, masterBus, advancedMastering } = {}) => {
  if (normalizeMasteringPath(masteringPath) === "advanced") {
    const rack = normalizeAdvancedMastering(advancedMastering);
    return rack.bypass ? "Premium rack bypassed" : `${activeAdvancedProcessors(rack).length} Premium plug-in${activeAdvancedProcessors(rack).length === 1 ? "" : "s"}`;
  }
  return normalizeMasterBus(masterBus).bypass ? "Basic chain bypassed" : "Basic chain";
};
