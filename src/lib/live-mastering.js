import { normalizeMasterBus } from "./mastering.js";

const clamp = (value, minimum, maximum) => Math.min(maximum, Math.max(minimum, value));

export const MAX_LIVE_COMPRESSOR_REDUCTION_DB = 24;
export const MAX_LIVE_LIMITER_REDUCTION_DB = 12;

const EQ_LIVE_POINT_COUNT = 81;

export const compressorGainReductionDb = (reduction) => {
  const value = Number(reduction);
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, -value);
};

export const equalizerResponseDbAtFrequency = (eq, frequency) => {
  const safeFrequency = Math.max(1, Number(frequency) || 1);
  const lowWeight = 1 / (1 + (safeFrequency / eq.lowShelf.frequencyHz) ** 4);
  const highWeight = 1 / (1 + (eq.highShelf.frequencyHz / safeFrequency) ** 4);
  const octaves = Math.log2(safeFrequency / eq.midBand.frequencyHz);
  const midWidth = 1.25 / Math.sqrt(eq.midBand.q);
  const midWeight = Math.exp(-0.5 * (octaves / midWidth) ** 2);
  return eq.lowShelf.gainDb * lowWeight + eq.midBand.gainDb * midWeight + eq.highShelf.gainDb * highWeight;
};

export const equalizerLiveImpact = ({ frequencyData, sampleRate, eq, pointCount = EQ_LIVE_POINT_COUNT } = {}) => {
  const safePointCount = Math.max(2, Math.round(Number(pointCount) || EQ_LIVE_POINT_COUNT));
  const silent = {
    values: Array.from({ length: safePointCount }, () => 0),
    activity: Array.from({ length: safePointCount }, () => 0),
    impactDb: 0,
  };
  if (!frequencyData?.length || !Number.isFinite(Number(sampleRate)) || Number(sampleRate) <= 0 || !eq) return silent;

  let activeWeight = 0;
  let weightedImpact = 0;
  const nyquist = Number(sampleRate) / 2;
  const activityValues = [];
  const values = Array.from({ length: safePointCount }, (_, index) => {
    const frequency = 20 * (1_000 ** (index / (safePointCount - 1)));
    const bin = clamp(Math.round((frequency / nyquist) * (frequencyData.length - 1)), 0, frequencyData.length - 1);
    const levelDb = Number(frequencyData[bin]);
    const activity = Number.isFinite(levelDb) ? clamp((levelDb + 72) / 54, 0, 1) : 0;
    const responseDb = equalizerResponseDbAtFrequency(eq, frequency);
    activityValues.push(activity);
    activeWeight += activity;
    weightedImpact += Math.abs(responseDb) * activity;
    return responseDb * activity;
  });

  return { values, activity: activityValues, impactDb: activeWeight > 0 ? weightedImpact / activeWeight : 0 };
};

export const decibelsToGain = (decibels) => 10 ** (Number(decibels || 0) / 20);

const setParam = (param, value, context, timeConstant = 0.012) => {
  if (!param) return;
  const now = Number(context?.currentTime);
  if (context?.state === "running" && Number.isFinite(now) && typeof param.cancelScheduledValues === "function" && typeof param.setTargetAtTime === "function") {
    param.cancelScheduledValues(now);
    param.setTargetAtTime(value, now, timeConstant);
    return;
  }
  param.value = value;
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
  if (!entry && meteringAvailable !== false && activeMasteringProcessors(masterBus).length) return "mastering";
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
  const updateParam = (param, value, timeConstant) => setParam(param, value, graph.context, timeConstant);

  updateParam(graph.directGain?.gain, sourceBypassed ? 1 : 0, 0.006);
  updateParam(graph.trackGain?.gain, decibelsToGain(trackGainDb));
  updateParam(graph.bypassGain?.gain, !sourceBypassed && masterBypassed ? 1 : 0, 0.006);
  updateParam(graph.processedGain?.gain, !sourceBypassed && !masterBypassed ? 1 : 0, 0.006);

  graph.lowShelf.type = "lowshelf";
  updateParam(graph.lowShelf.frequency, settings.eq.lowShelf.frequencyHz);
  updateParam(graph.lowShelf.gain, settings.eq.enabled ? settings.eq.lowShelf.gainDb : 0);

  graph.midBand.type = "peaking";
  updateParam(graph.midBand.frequency, settings.eq.midBand.frequencyHz);
  updateParam(graph.midBand.Q, settings.eq.midBand.q);
  updateParam(graph.midBand.gain, settings.eq.enabled ? settings.eq.midBand.gainDb : 0);

  graph.highShelf.type = "highshelf";
  updateParam(graph.highShelf.frequency, settings.eq.highShelf.frequencyHz);
  updateParam(graph.highShelf.gain, settings.eq.enabled ? settings.eq.highShelf.gainDb : 0);

  const compressorMix = settings.compressor.enabled ? settings.compressor.mix : 0;
  updateParam(graph.compressorDry.gain, 1 - compressorMix, 0.006);
  updateParam(graph.compressorWet.gain, compressorMix, 0.006);
  updateParam(graph.compressor.threshold, settings.compressor.thresholdDb);
  updateParam(graph.compressor.ratio, settings.compressor.ratio);
  updateParam(graph.compressor.knee, settings.compressor.knee);
  updateParam(graph.compressor.attack, clamp(settings.compressor.attackMs / 1_000, 0, 1));
  updateParam(graph.compressor.release, clamp(settings.compressor.releaseMs / 1_000, 0, 1));
  updateParam(graph.makeupGain.gain, decibelsToGain(settings.compressor.makeupGainDb));

  updateParam(graph.outputGain.gain, decibelsToGain(settings.outputGainDb));

  updateParam(graph.limiter.threshold, settings.limiter.enabled ? settings.limiter.ceilingDbfs : 0);
  updateParam(graph.limiter.knee, 0);
  updateParam(graph.limiter.ratio, settings.limiter.enabled ? 20 : 1);
  updateParam(graph.limiter.attack, clamp(settings.limiter.attackMs / 1_000, 0, 1));
  updateParam(graph.limiter.release, clamp(settings.limiter.releaseMs / 1_000, 0, 1));

  return { settings, sourceBypassed, masterBypassed, trackGainDb };
};

export const createLiveMasteringGraph = (audio, AudioContextClass) => {
  if (!audio || !AudioContextClass) return null;
  const context = new AudioContextClass();
  const source = context.createMediaElementSource(audio);
  const directGain = context.createGain();
  const trackGain = context.createGain();
  const bypassGain = context.createGain();
  const eqInputAnalyser = context.createAnalyser();
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
  configureAnalyser(eqInputAnalyser, { fftSize: 2_048, smoothingTimeConstant: 0.76 });
  // Level meters need less temporal history than the frequency display. A
  // smaller window keeps both the header and full meter responsive with half
  // the per-frame sample work while the spectrum retains its 2,048-point FFT.
  configureAnalyser(leftAnalyser, { fftSize: 1_024 });
  configureAnalyser(rightAnalyser, { fftSize: 1_024 });

  source.connect(directGain).connect(masterOutput);
  source.connect(trackGain);
  trackGain.connect(bypassGain).connect(masterOutput);
  trackGain.connect(eqInputAnalyser).connect(lowShelf).connect(midBand).connect(highShelf);
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
    eqInputAnalyser,
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
