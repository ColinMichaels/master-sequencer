import { SHARED_DSP_PROCESSOR_NAME, normalizeSharedDspSettings } from "../dsp/shared-dsp-core.js";

export const sharedDspSettingsFromMasterBus = ({ masterBus, trackGainDb = 0 } = {}) => normalizeSharedDspSettings({
  bypass: masterBus?.enabled === false,
  inputGainDb: trackGainDb,
  outputGainDb: masterBus?.output?.gainDb ?? 0,
  ceilingDbfs: masterBus?.limiter?.ceilingDbfs ?? -1,
  peakGuardEnabled: masterBus?.limiter?.enabled !== false,
});

export const createSharedDspPrototypeNode = async (audioContext, settings) => {
  await audioContext.audioWorklet.addModule(new URL("../dsp/project-sequencer-worklet.js", import.meta.url));
  return new AudioWorkletNode(audioContext, SHARED_DSP_PROCESSOR_NAME, {
    numberOfInputs: 1,
    numberOfOutputs: 1,
    outputChannelCount: [2],
    processorOptions: { settings: normalizeSharedDspSettings(settings) },
  });
};

export const updateSharedDspPrototypeNode = (node, settings) => {
  node.port.postMessage({ type: "settings", settings: normalizeSharedDspSettings(settings) });
};
