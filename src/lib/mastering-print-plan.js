import {
  ADVANCED_PROCESSOR_TYPES,
  normalizeAdvancedMastering,
  normalizeMasteringPath,
  processorDefinition,
} from "./advanced-mastering.js";
import { normalizeMasterBus } from "./mastering.js";

const formatDb = (value) => `${value > 0 ? "+" : ""}${Number(value.toFixed(2))} dB`;

const advancedProcessorLabel = (node) => {
  const name = processorDefinition(node.typeId)?.name || node.name || node.typeId;
  if (node.typeId === ADVANCED_PROCESSOR_TYPES.output) return `${name} ${formatDb(node.parameters.outputGainDb)}`;
  if (node.typeId === ADVANCED_PROCESSOR_TYPES.limiter) return `${name} ${Number(node.parameters.ceilingDbfs.toFixed(2))} dBFS`;
  return name;
};

export const createMasteringPrintPlan = ({ masterBus, masteringPath, advancedMastering } = {}) => {
  const path = normalizeMasteringPath(masteringPath);
  if (path === "basic") {
    const settings = normalizeMasterBus(masterBus);
    const processors = settings.bypass ? [] : [
      settings.eq.enabled && { id: "basic-eq", label: "MASTER EQ", typeId: "basic.eq" },
      settings.compressor.enabled && { id: "basic-compressor", label: "MASTER Compressor", typeId: "basic.compressor" },
      { id: "basic-output", label: `MASTER Output ${formatDb(settings.outputGainDb)}`, typeId: "basic.output" },
      settings.limiter.enabled && { id: "basic-limiter", label: `MASTER Limiter ${Number(settings.limiter.ceilingDbfs.toFixed(2))} dBFS`, typeId: "basic.limiter" },
    ].filter(Boolean);
    const signalPath = settings.bypass
      ? ["Track edits + level", "Basic MASTER bypass"]
      : ["Track edits + level", ...processors.map((processor) => processor.label)];
    return {
      path,
      pathLabel: "Basic MASTER chain",
      bypassed: settings.bypass,
      canRender: true,
      processors,
      inactiveProcessors: [],
      unresolvedProcessors: [],
      signalPath,
      summary: signalPath.join(" → "),
    };
  }

  const settings = normalizeAdvancedMastering(advancedMastering);
  const activeNodes = settings.bypass ? [] : settings.nodes.filter((node) => !node.bypass && !node.unavailable);
  const unresolvedNodes = settings.bypass ? [] : settings.nodes.filter((node) => !node.bypass && node.unavailable);
  const inactiveNodes = settings.nodes.filter((node) => node.bypass || node.unavailable);
  const processors = activeNodes.map((node) => ({ id: node.id, typeId: node.typeId, label: advancedProcessorLabel(node) }));
  const unresolvedProcessors = unresolvedNodes.map((node) => node.name || node.typeId);
  const inactiveProcessors = inactiveNodes.map((node) => ({
    id: node.id,
    label: node.name || node.typeId,
    reason: node.unavailable ? "unavailable" : "bypassed",
  }));
  const signalPath = settings.bypass
    ? ["Track edits + level", "Premium rack bypass"]
    : processors.length
      ? ["Track edits + level", ...processors.map((processor) => processor.label)]
      : ["Track edits + level", "Premium rack direct output"];
  return {
    path,
    pathLabel: "Premium MASTER rack",
    bypassed: settings.bypass,
    canRender: unresolvedProcessors.length === 0,
    processors,
    inactiveProcessors,
    unresolvedProcessors,
    signalPath,
    summary: signalPath.join(" → "),
  };
};

export const assertMasteringPrintPlan = (plan) => {
  if (plan?.canRender !== false) return plan;
  const names = plan.unresolvedProcessors.join(", ");
  throw new Error(`The active Premium rack contains processing that this renderer cannot print: ${names}. Bypass or remove ${plan.unresolvedProcessors.length === 1 ? "it" : "those processors"}, or resolve them in a supported native host before exporting.`);
};
