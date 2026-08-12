import { MASTERING_LIMITS, normalizeMasterBus } from "./mastering.js";

export const ADVANCED_RACK_VERSION = 1;
export const ADVANCED_RACK_MAX_PROCESSORS = 12;

export const ADVANCED_PROCESSOR_TYPES = Object.freeze({
  eq: "sequencer.program-eq",
  compressor: "sequencer.bus-compressor",
  output: "sequencer.master-output",
  limiter: "sequencer.precision-limiter",
});

export const ADVANCED_PROCESSOR_CATALOG = Object.freeze([
  Object.freeze({ typeId: ADVANCED_PROCESSOR_TYPES.eq, name: "Program Equalizer", shortName: "EQ", rackUnits: 2, accent: "copper" }),
  Object.freeze({ typeId: ADVANCED_PROCESSOR_TYPES.compressor, name: "Bus Compressor", shortName: "COMP", rackUnits: 2, accent: "navy" }),
  Object.freeze({ typeId: ADVANCED_PROCESSOR_TYPES.output, name: "Master Output", shortName: "OUT", rackUnits: 1, accent: "graphite" }),
  Object.freeze({ typeId: ADVANCED_PROCESSOR_TYPES.limiter, name: "Precision Limiter", shortName: "LIMIT", rackUnits: 2, accent: "aluminum" }),
]);

const TYPE_IDS = new Set(ADVANCED_PROCESSOR_CATALOG.map((definition) => definition.typeId));
const asObject = (value) => value && typeof value === "object" && !Array.isArray(value) ? value : {};
const safeId = (value, fallback) => typeof value === "string" && /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(value) && value.length <= 120 ? value : fallback;
const safeName = (value, fallback) => typeof value === "string" && value.trim() ? value.trim().slice(0, 80) : fallback;
const finiteNumber = (value, fallback) => Number.isFinite(Number(value)) ? Number(value) : fallback;
const clamp = (value, limits) => Math.min(limits.maximum, Math.max(limits.minimum, finiteNumber(value, limits.minimum)));
const normalizeBoolean = (value, fallback) => typeof value === "boolean" ? value : fallback;

const ADVANCED_EQ_DEFAULTS = Object.freeze({
  lowMidBand: Object.freeze({ frequencyHz: 400, gainDb: 0, q: 1 }),
  highMidBand: Object.freeze({ frequencyHz: 1_600, gainDb: 0, q: 1 }),
  outputGainDb: 0,
});

export const processorDefinition = (typeId) => ADVANCED_PROCESSOR_CATALOG.find((definition) => definition.typeId === typeId);

export const processorDefaultParameters = (typeId) => {
  const bus = normalizeMasterBus();
  if (typeId === ADVANCED_PROCESSOR_TYPES.eq) return {
    enabled: true,
    lowShelf: bus.eq.lowShelf,
    lowMidBand: { ...ADVANCED_EQ_DEFAULTS.lowMidBand },
    highMidBand: { ...ADVANCED_EQ_DEFAULTS.highMidBand },
    highShelf: bus.eq.highShelf,
    outputGainDb: ADVANCED_EQ_DEFAULTS.outputGainDb,
  };
  if (typeId === ADVANCED_PROCESSOR_TYPES.compressor) return { ...bus.compressor, enabled: true, sidechainEnabled: false, sidechainFilterHz: 120 };
  if (typeId === ADVANCED_PROCESSOR_TYPES.output) return { outputGainDb: bus.outputGainDb };
  if (typeId === ADVANCED_PROCESSOR_TYPES.limiter) return { ...bus.limiter, enabled: true, oversample: 4, stereoLinkPercent: 100 };
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
    oversample: [2, 4, 8].includes(Number(source.oversample)) ? Number(source.oversample) : 4,
    stereoLinkPercent: clamp(source.stereoLinkPercent ?? 100, MASTERING_LIMITS.limiterStereoLinkPercent),
  };
};

export const normalizeProcessorParameters = (typeId, value) => {
  if (typeId === ADVANCED_PROCESSOR_TYPES.eq) return normalizeEq(value);
  if (typeId === ADVANCED_PROCESSOR_TYPES.compressor) return normalizeCompressor(value);
  if (typeId === ADVANCED_PROCESSOR_TYPES.output) return normalizeOutput(value);
  if (typeId === ADVANCED_PROCESSOR_TYPES.limiter) return normalizeLimiter(value);
  return {};
};

export const createAdvancedProcessor = (typeId, id) => {
  const definition = processorDefinition(typeId);
  if (!definition) throw new Error("Choose a supported mastering processor.");
  return {
    id: safeId(id, `${definition.shortName.toLowerCase()}-${Date.now().toString(36)}`),
    typeId,
    definitionVersion: 1,
    name: definition.name,
    bypass: false,
    parameters: processorDefaultParameters(typeId),
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

export const normalizeAdvancedMastering = (value = {}) => {
  const rack = asObject(value);
  const seen = new Set();
  const nodes = (Array.isArray(rack.nodes) ? rack.nodes : createDefaultAdvancedMastering().nodes)
    .slice(0, ADVANCED_RACK_MAX_PROCESSORS)
    .flatMap((candidate, index) => {
      const node = asObject(candidate);
      if (!TYPE_IDS.has(node.typeId)) return [];
      let id = safeId(node.id, `rack-${index + 1}`);
      while (seen.has(id)) id = `${id}-${index + 1}`;
      seen.add(id);
      const definition = processorDefinition(node.typeId);
      return [{
        id,
        typeId: node.typeId,
        definitionVersion: 1,
        name: safeName(node.name, definition.name),
        bypass: typeof node.bypass === "boolean" ? node.bypass : false,
        parameters: normalizeProcessorParameters(node.typeId, node.parameters),
      }];
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
  return settings.nodes.filter((node) => !node.bypass).map((node) => processorDefinition(node.typeId)?.shortName).filter(Boolean);
};

export const masteringPathSummary = ({ masteringPath, masterBus, advancedMastering } = {}) => {
  if (normalizeMasteringPath(masteringPath) === "advanced") {
    const rack = normalizeAdvancedMastering(advancedMastering);
    return rack.bypass ? "Premium rack bypassed" : `${activeAdvancedProcessors(rack).length} Premium processor${activeAdvancedProcessors(rack).length === 1 ? "" : "s"}`;
  }
  return normalizeMasterBus(masterBus).bypass ? "Basic chain bypassed" : "Basic chain";
};
