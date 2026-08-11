import { normalizeMasterBus } from "./mastering.js";

const clamp = (value, minimum, maximum) => Math.min(maximum, Math.max(minimum, value));

export const decibelsToGain = (decibels) => 10 ** (Number(decibels || 0) / 20);

const setParam = (param, value) => {
  if (param) param.value = value;
};

const configureAnalyser = (analyser, { fftSize, smoothingTimeConstant = 0 }) => {
  analyser.fftSize = fftSize;
  analyser.smoothingTimeConstant = smoothingTimeConstant;
  analyser.minDecibels = -96;
  analyser.maxDecibels = 0;
};

export const activeMasteringProcessors = (masterBus = {}) => {
  const settings = normalizeMasterBus(masterBus);
  if (settings.bypass) return [];
  return [
    settings.eq.enabled && "EQ",
    settings.compressor.enabled && "compressor",
    Math.abs(settings.outputGainDb) > 0.0001 && "output",
    settings.limiter.enabled && "limiter",
  ].filter(Boolean);
};

export const playbackBypassesMastering = (entry) => !entry?.track || Boolean(entry.renderedPreview) || Boolean(entry.referenceTrack);

export const masterMonitorRouting = ({ entry, masterBus, meteringAvailable } = {}) => {
  if (entry?.referenceTrack) return "reference";
  if (entry?.renderedPreview) return "mastering";
  if (!entry?.track || meteringAvailable === false || normalizeMasterBus(masterBus).bypass) return "raw";
  return "mastering";
};

export const comparisonPlaybackStart = ({ baseStart = 0, elapsed = 0, duration = 0 }) => {
  const safeBaseStart = Math.max(0, Number(baseStart) || 0);
  const requestedStart = safeBaseStart + Math.max(0, Number(elapsed) || 0);
  const latestStart = Math.max(safeBaseStart, (Number(duration) || 0) - 0.2);
  return requestedStart <= latestStart ? requestedStart : safeBaseStart;
};

export const applyLiveMasteringSettings = (graph, masterBus = {}, options = {}) => {
  const settings = normalizeMasterBus(masterBus);
  const sourceBypassed = Boolean(options.sourceBypassed);
  const masterBypassed = sourceBypassed || settings.bypass;
  const trackGainDb = Number.isFinite(Number(options.trackGainDb)) ? Number(options.trackGainDb) : 0;

  setParam(graph.directGain?.gain, sourceBypassed ? 1 : 0);
  setParam(graph.trackGain?.gain, decibelsToGain(trackGainDb));
  setParam(graph.bypassGain?.gain, !sourceBypassed && masterBypassed ? 1 : 0);
  setParam(graph.processedGain?.gain, !sourceBypassed && !masterBypassed ? 1 : 0);

  graph.lowShelf.type = "lowshelf";
  setParam(graph.lowShelf.frequency, settings.eq.lowShelf.frequencyHz);
  setParam(graph.lowShelf.gain, settings.eq.enabled ? settings.eq.lowShelf.gainDb : 0);

  graph.midBand.type = "peaking";
  setParam(graph.midBand.frequency, settings.eq.midBand.frequencyHz);
  setParam(graph.midBand.Q, settings.eq.midBand.q);
  setParam(graph.midBand.gain, settings.eq.enabled ? settings.eq.midBand.gainDb : 0);

  graph.highShelf.type = "highshelf";
  setParam(graph.highShelf.frequency, settings.eq.highShelf.frequencyHz);
  setParam(graph.highShelf.gain, settings.eq.enabled ? settings.eq.highShelf.gainDb : 0);

  const compressorMix = settings.compressor.enabled ? settings.compressor.mix : 0;
  setParam(graph.compressorDry.gain, 1 - compressorMix);
  setParam(graph.compressorWet.gain, compressorMix);
  setParam(graph.compressor.threshold, settings.compressor.thresholdDb);
  setParam(graph.compressor.ratio, settings.compressor.ratio);
  setParam(graph.compressor.knee, settings.compressor.knee);
  setParam(graph.compressor.attack, clamp(settings.compressor.attackMs / 1_000, 0, 1));
  setParam(graph.compressor.release, clamp(settings.compressor.releaseMs / 1_000, 0, 1));
  setParam(graph.makeupGain.gain, decibelsToGain(settings.compressor.makeupGainDb));

  setParam(graph.outputGain.gain, decibelsToGain(settings.outputGainDb));

  setParam(graph.limiter.threshold, settings.limiter.enabled ? settings.limiter.ceilingDbfs : 0);
  setParam(graph.limiter.knee, 0);
  setParam(graph.limiter.ratio, settings.limiter.enabled ? 20 : 1);
  setParam(graph.limiter.attack, clamp(settings.limiter.attackMs / 1_000, 0, 1));
  setParam(graph.limiter.release, clamp(settings.limiter.releaseMs / 1_000, 0, 1));

  return { settings, sourceBypassed, masterBypassed, trackGainDb };
};

export const createLiveMasteringGraph = (audio, AudioContextClass) => {
  if (!audio || !AudioContextClass) return null;
  const context = new AudioContextClass();
  const source = context.createMediaElementSource(audio);
  const directGain = context.createGain();
  const trackGain = context.createGain();
  const bypassGain = context.createGain();
  const lowShelf = context.createBiquadFilter();
  const midBand = context.createBiquadFilter();
  const highShelf = context.createBiquadFilter();
  const compressorDry = context.createGain();
  const compressor = context.createDynamicsCompressor();
  const makeupGain = context.createGain();
  const compressorWet = context.createGain();
  const compressorSum = context.createGain();
  const outputGain = context.createGain();
  const limiter = context.createDynamicsCompressor();
  const processedGain = context.createGain();
  const masterOutput = context.createGain();
  const frequencyAnalyser = context.createAnalyser();
  const channelSplitter = context.createChannelSplitter(2);
  const leftAnalyser = context.createAnalyser();
  const rightAnalyser = context.createAnalyser();
  const channelMerger = context.createChannelMerger(2);

  configureAnalyser(frequencyAnalyser, { fftSize: 2_048, smoothingTimeConstant: 0.76 });
  configureAnalyser(leftAnalyser, { fftSize: 2_048 });
  configureAnalyser(rightAnalyser, { fftSize: 2_048 });

  source.connect(directGain).connect(masterOutput);
  source.connect(trackGain);
  trackGain.connect(bypassGain).connect(masterOutput);
  trackGain.connect(lowShelf).connect(midBand).connect(highShelf);
  highShelf.connect(compressorDry).connect(compressorSum);
  highShelf.connect(compressor).connect(makeupGain).connect(compressorWet).connect(compressorSum);
  compressorSum.connect(outputGain).connect(limiter).connect(processedGain).connect(masterOutput);
  masterOutput.connect(frequencyAnalyser).connect(channelSplitter);
  channelSplitter.connect(leftAnalyser, 0, 0);
  channelSplitter.connect(rightAnalyser, 1, 0);
  leftAnalyser.connect(channelMerger, 0, 0);
  rightAnalyser.connect(channelMerger, 0, 1);
  channelMerger.connect(context.destination);

  return {
    context,
    source,
    directGain,
    trackGain,
    bypassGain,
    lowShelf,
    midBand,
    highShelf,
    compressorDry,
    compressor,
    makeupGain,
    compressorWet,
    compressorSum,
    outputGain,
    limiter,
    processedGain,
    masterOutput,
    frequencyAnalyser,
    channelSplitter,
    leftAnalyser,
    rightAnalyser,
    channelMerger,
  };
};
