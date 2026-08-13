import { normalizeMasterBus } from "./mastering.js";
import { ADVANCED_PROCESSOR_TYPES, ADVANCED_RACK_MAX_PROCESSORS, activeAdvancedProcessors, normalizeAdvancedMastering, normalizeMasteringPath } from "./advanced-mastering.js";
import { liveEnvelopeGainAt } from "./live-sequence.js";

const clamp = (value, minimum, maximum) => Math.min(maximum, Math.max(minimum, value));

export const MAX_LIVE_COMPRESSOR_REDUCTION_DB = 24;
export const MAX_LIVE_LIMITER_REDUCTION_DB = 12;
export const MASTER_MONITOR_MODES = Object.freeze(["stereo", "mono", "mid", "side"]);

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
  const midBands = eq.lowMidBand && eq.highMidBand ? [eq.lowMidBand, eq.highMidBand] : [eq.midBand];
  const midResponse = midBands.reduce((total, band) => {
    const octaves = Math.log2(safeFrequency / band.frequencyHz);
    const midWidth = 1.25 / Math.sqrt(band.q);
    return total + band.gainDb * Math.exp(-0.5 * (octaves / midWidth) ** 2);
  }, 0);
  return eq.lowShelf.gainDb * lowWeight + midResponse + eq.highShelf.gainDb * highWeight + (eq.outputGainDb ?? 0);
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

// The low band bypasses detector compression when the sidechain filter is in,
// then recombines with the compressed high band so bass energy is preserved.
export const compressorSidechainMix = ({ enabled = false } = {}) => {
  if (!enabled) return { fullRange: 1, highPass: 0, lowBand: 0 };
  return { fullRange: 0, highPass: 1, lowBand: 1 };
};

export const limiterStereoMatrix = (linkPercent = 100) => {
  // Equal-power is inappropriate here because the two branches carry the same
  // program; linear weights preserve unity when linked and independent paths sum.
  const link = clamp((Number(linkPercent) || 0) / 100, 0, 1);
  const independent = 1 - link;
  const linked = link;
  return { independent, linked };
};

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

export const normalizeMasterMonitorMode = (value) => MASTER_MONITOR_MODES.includes(value) ? value : "stereo";

export const masterMonitorMatrix = (mode = "stereo") => {
  const normalized = normalizeMasterMonitorMode(mode);
  if (normalized === "stereo") return { leftToLeft: 1, leftToRight: 0, rightToLeft: 0, rightToRight: 1 };
  if (normalized === "side") return { leftToLeft: 0.5, leftToRight: 0.5, rightToLeft: -0.5, rightToRight: -0.5 };
  return { leftToLeft: 0.5, leftToRight: 0.5, rightToLeft: 0.5, rightToRight: 0.5 };
};

export const setMasterMonitorMode = (graph, mode = "stereo") => {
  const normalized = normalizeMasterMonitorMode(mode);
  const matrix = masterMonitorMatrix(normalized);
  const update = (param, value) => setParam(param, value, graph?.context, 0.006);
  update(graph?.monitorLeftToLeft?.gain, matrix.leftToLeft);
  update(graph?.monitorLeftToRight?.gain, matrix.leftToRight);
  update(graph?.monitorRightToLeft?.gain, matrix.rightToLeft);
  update(graph?.monitorRightToRight?.gain, matrix.rightToRight);
  if (graph) graph.monitorMode = normalized;
  return normalized;
};

export const activeMasteringProcessors = (masterBus = {}, masteringPath = "basic", advancedMastering = {}) => {
  if (normalizeMasteringPath(masteringPath) === "advanced") return activeAdvancedProcessors(advancedMastering);
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

export const masterMonitorRouting = ({ entry, masterBus, masteringPath, advancedMastering, meteringAvailable } = {}) => {
  if (entry?.referenceTrack) return "reference";
  if (entry?.renderedPreview) return "mastering";
  if (!entry && meteringAvailable !== false && activeMasteringProcessors(masterBus, masteringPath, advancedMastering).length) return "mastering";
  const pathBypassed = normalizeMasteringPath(masteringPath) === "advanced" ? normalizeAdvancedMastering(advancedMastering).bypass : normalizeMasterBus(masterBus).bypass;
  if (!entry?.track || meteringAvailable === false || pathBypassed) return "raw";
  return "mastering";
};

export const comparisonPlaybackStart = ({ baseStart = 0, elapsed = 0, duration = 0 }) => {
  const safeBaseStart = Math.max(0, Number(baseStart) || 0);
  const requestedStart = safeBaseStart + Math.max(0, Number(elapsed) || 0);
  const latestStart = Math.max(safeBaseStart, (Number(duration) || 0) - 0.2);
  return requestedStart <= latestStart ? requestedStart : safeBaseStart;
};

export const applyLivePlaybackEnvelope = (graph, settings, sourceTime = 0, options = {}) => {
  const parameter = graph?.envelopeGain?.gain;
  const context = graph?.context;
  if (!parameter) return 1;
  const now = Number.isFinite(Number(context?.currentTime)) ? Number(context.currentTime) : 0;
  const start = Math.max(settings?.trimStart || 0, Number(sourceTime) || 0);
  const end = Math.max(start, settings?.trimEnd || start);
  const duration = end - start;
  const gainOptions = {
    crossfadeStart: Number.isFinite(options.crossfadeStart) ? options.crossfadeStart : null,
    crossfadeDuration: Math.max(0, Number(options.crossfadeDuration) || 0),
  };
  const initialGain = settings ? liveEnvelopeGainAt(settings, start, gainOptions) : 1;

  parameter.cancelScheduledValues?.(now);
  if (!settings || duration <= 0.01 || typeof parameter.setValueCurveAtTime !== "function") {
    if (typeof parameter.setValueAtTime === "function") parameter.setValueAtTime(initialGain, now);
    else parameter.value = initialGain;
    return initialGain;
  }

  const pointCount = clamp(Math.ceil(duration * 30), 32, 2_048);
  const curve = Float32Array.from({ length: pointCount }, (_, index) => {
    const time = start + (duration * index) / (pointCount - 1);
    return liveEnvelopeGainAt(settings, time, gainOptions);
  });
  parameter.setValueAtTime?.(curve[0], now);
  parameter.setValueCurveAtTime(curve, now, duration);
  return initialGain;
};

export const applyLiveMasteringSettings = (graph, masterBus = {}, options = {}) => {
  const settings = normalizeMasterBus(masterBus);
  const masteringPath = normalizeMasteringPath(options.masteringPath);
  const advancedMastering = normalizeAdvancedMastering(options.advancedMastering);
  const sourceBypassed = Boolean(options.sourceBypassed);
  const pathBypassed = masteringPath === "advanced" ? advancedMastering.bypass : settings.bypass;
  const masterBypassed = sourceBypassed || pathBypassed;
  const trackGainDb = Number.isFinite(Number(options.trackGainDb)) ? Number(options.trackGainDb) : 0;
  const updateParam = (param, value, timeConstant) => setParam(param, value, graph.context, timeConstant);

  const desiredSlotCount = masteringPath === "advanced" ? advancedMastering.nodes.length : 0;
  if (graph.advancedInput && Array.isArray(graph.processorSlots) && graph.rackSlotCount !== desiredSlotCount && typeof graph.advancedInput.disconnect === "function") {
    graph.advancedInput.disconnect();
    graph.processorSlots.forEach((slot) => { if (typeof slot.output.disconnect === "function") slot.output.disconnect(); });
    if (desiredSlotCount === 0) graph.advancedInput.connect(graph.advancedProcessedGain);
    else {
      graph.advancedInput.connect(graph.processorSlots[0].input);
      graph.processorSlots.slice(0, desiredSlotCount).forEach((slot, index) => slot.output.connect(index + 1 < desiredSlotCount ? graph.processorSlots[index + 1].input : graph.advancedProcessedGain));
    }
    graph.rackSlotCount = desiredSlotCount;
  }

  updateParam(graph.directGain?.gain, sourceBypassed ? 1 : 0, 0.006);
  updateParam(graph.trackGain?.gain, decibelsToGain(trackGainDb));
  updateParam(graph.bypassGain?.gain, !sourceBypassed && masterBypassed ? 1 : 0, 0.006);
  updateParam(graph.processedGain?.gain, !sourceBypassed && !masterBypassed && masteringPath === "basic" ? 1 : 0, 0.006);
  updateParam(graph.advancedProcessedGain?.gain, !sourceBypassed && !masterBypassed && masteringPath === "advanced" ? 1 : 0, 0.006);

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

  let advancedCompressor = null;
  let advancedLimiter = null;
  const processorMeters = {};
  if (Array.isArray(graph.processorSlots)) {
    graph.processorSlots.forEach((slot, index) => {
      const node = advancedMastering.nodes[index];
      const active = masteringPath === "advanced" && node && !node.bypass && !node.unavailable;
      const eq = active && node.typeId === ADVANCED_PROCESSOR_TYPES.eq ? node.parameters : null;
      const compressorSettings = active && node.typeId === ADVANCED_PROCESSOR_TYPES.compressor ? node.parameters : null;
      const outputSettings = active && node.typeId === ADVANCED_PROCESSOR_TYPES.output ? node.parameters : null;
      const limiterSettings = active && node.typeId === ADVANCED_PROCESSOR_TYPES.limiter ? node.parameters : null;
      const fieldSettings = active && node.typeId === ADVANCED_PROCESSOR_TYPES.stereoField ? node.parameters : null;
      const colorSettings = active && node.typeId === ADVANCED_PROCESSOR_TYPES.harmonicColor ? node.parameters : null;
      const phaseSettings = active && node.typeId === ADVANCED_PROCESSOR_TYPES.phaseAlignment ? node.parameters : null;
      const hfSettings = active && node.typeId === ADVANCED_PROCESSOR_TYPES.hfSmoother ? node.parameters : null;
      const ambienceSettings = active && node.typeId === ADVANCED_PROCESSOR_TYPES.ambience ? node.parameters : null;
      const transientSettings = active && node.typeId === ADVANCED_PROCESSOR_TYPES.transientShaper ? node.parameters : null;
      const phaserSettings = active && node.typeId === ADVANCED_PROCESSOR_TYPES.creativePhaser ? node.parameters : null;

      // Mid/Side modes use a real encode -> selected-channel process -> decode
      // path. The unselected component stays flat rather than merely receiving
      // a different UI label, matching the authoritative FFmpeg render graph.
      const eqMidSide = eq && eq.channelMode !== "stereo";
      const eqEncode = eqMidSide ? { ll: 0.5, lr: 0.5, rl: 0.5, rr: -0.5 } : { ll: 1, lr: 0, rl: 0, rr: 1 };
      const eqDecode = eqMidSide ? { ll: 1, lr: 1, rl: 1, rr: -1 } : { ll: 1, lr: 0, rl: 0, rr: 1 };
      updateParam(slot.eqEncodeLeftToLeft.gain, eqEncode.ll, 0.006);
      updateParam(slot.eqEncodeLeftToRight.gain, eqEncode.lr, 0.006);
      updateParam(slot.eqEncodeRightToLeft.gain, eqEncode.rl, 0.006);
      updateParam(slot.eqEncodeRightToRight.gain, eqEncode.rr, 0.006);
      updateParam(slot.eqDecodeLeftToLeft.gain, eqDecode.ll, 0.006);
      updateParam(slot.eqDecodeLeftToRight.gain, eqDecode.lr, 0.006);
      updateParam(slot.eqDecodeRightToLeft.gain, eqDecode.rl, 0.006);
      updateParam(slot.eqDecodeRightToRight.gain, eqDecode.rr, 0.006);
      const eqLeftActive = Boolean(eq && ["stereo", "mid"].includes(eq.channelMode));
      const eqRightActive = Boolean(eq && ["stereo", "side"].includes(eq.channelMode));

      slot.lowShelf.type = "lowshelf";
      updateParam(slot.lowShelf.frequency, eq?.lowShelf.frequencyHz ?? 120);
      updateParam(slot.lowShelf.gain, eqLeftActive ? eq.lowShelf.gainDb : 0);
      slot.lowMidBand.type = "peaking";
      updateParam(slot.lowMidBand.frequency, eq?.lowMidBand.frequencyHz ?? 400);
      updateParam(slot.lowMidBand.Q, eq?.lowMidBand.q ?? 1);
      updateParam(slot.lowMidBand.gain, eqLeftActive ? eq.lowMidBand.gainDb : 0);
      slot.highMidBand.type = "peaking";
      updateParam(slot.highMidBand.frequency, eq?.highMidBand.frequencyHz ?? 1_600);
      updateParam(slot.highMidBand.Q, eq?.highMidBand.q ?? 1);
      updateParam(slot.highMidBand.gain, eqLeftActive ? eq.highMidBand.gainDb : 0);
      slot.highShelf.type = "highshelf";
      updateParam(slot.highShelf.frequency, eq?.highShelf.frequencyHz ?? 8_000);
      updateParam(slot.highShelf.gain, eqLeftActive ? eq.highShelf.gainDb : 0);
      for (const [filter, type, frequency, q, gain] of [
        [slot.lowShelfRight, "lowshelf", eq?.lowShelf.frequencyHz ?? 120, 0.707, eqRightActive ? eq.lowShelf.gainDb : 0],
        [slot.lowMidBandRight, "peaking", eq?.lowMidBand.frequencyHz ?? 400, eq?.lowMidBand.q ?? 1, eqRightActive ? eq.lowMidBand.gainDb : 0],
        [slot.highMidBandRight, "peaking", eq?.highMidBand.frequencyHz ?? 1_600, eq?.highMidBand.q ?? 1, eqRightActive ? eq.highMidBand.gainDb : 0],
        [slot.highShelfRight, "highshelf", eq?.highShelf.frequencyHz ?? 8_000, 0.707, eqRightActive ? eq.highShelf.gainDb : 0],
      ]) {
        filter.type = type;
        updateParam(filter.frequency, frequency);
        updateParam(filter.Q, q);
        updateParam(filter.gain, gain);
      }
      updateParam(slot.eqOutputGain.gain, decibelsToGain(eq?.outputGainDb ?? 0));

      // The processed-channel gains sit before the compressor, so an unselected
      // Mid or Side component cannot drive its linked detector. Original gains
      // restore that untouched component immediately before decoding to L/R.
      const compressorMidSide = compressorSettings && compressorSettings.channelMode !== "stereo";
      const compressorEncode = compressorMidSide ? { ll: 0.5, lr: 0.5, rl: 0.5, rr: -0.5 } : { ll: 1, lr: 0, rl: 0, rr: 1 };
      const compressorDecode = compressorMidSide ? { ll: 1, lr: 1, rl: 1, rr: -1 } : { ll: 1, lr: 0, rl: 0, rr: 1 };
      updateParam(slot.compressorEncodeLeftToLeft.gain, compressorEncode.ll, 0.006);
      updateParam(slot.compressorEncodeLeftToRight.gain, compressorEncode.lr, 0.006);
      updateParam(slot.compressorEncodeRightToLeft.gain, compressorEncode.rl, 0.006);
      updateParam(slot.compressorEncodeRightToRight.gain, compressorEncode.rr, 0.006);
      updateParam(slot.compressorDecodeLeftToLeft.gain, compressorDecode.ll, 0.006);
      updateParam(slot.compressorDecodeLeftToRight.gain, compressorDecode.lr, 0.006);
      updateParam(slot.compressorDecodeRightToLeft.gain, compressorDecode.rl, 0.006);
      updateParam(slot.compressorDecodeRightToRight.gain, compressorDecode.rr, 0.006);
      const processedLeft = !compressorSettings || ["stereo", "mid"].includes(compressorSettings.channelMode);
      const processedRight = !compressorSettings || ["stereo", "side"].includes(compressorSettings.channelMode);
      updateParam(slot.compressorProcessedLeft.gain, processedLeft ? 1 : 0, 0.006);
      updateParam(slot.compressorProcessedRight.gain, processedRight ? 1 : 0, 0.006);
      updateParam(slot.compressorOriginalLeft.gain, processedLeft ? 0 : 1, 0.006);
      updateParam(slot.compressorOriginalRight.gain, processedRight ? 0 : 1, 0.006);

      const mix = compressorSettings?.mix ?? 0;
      const sidechain = compressorSidechainMix({ enabled: compressorSettings?.sidechainEnabled, frequencyHz: compressorSettings?.sidechainFilterHz });
      updateParam(slot.compressorDry.gain, 1 - mix, 0.006);
      updateParam(slot.compressorFullRange.gain, sidechain.fullRange, 0.006);
      slot.compressorSidechainFilter.type = "highpass";
      updateParam(slot.compressorSidechainFilter.frequency, compressorSettings?.sidechainFilterHz ?? 120);
      updateParam(slot.compressorSidechainFilter.Q, 0.707);
      updateParam(slot.compressorSidechainGain.gain, sidechain.highPass, 0.006);
      slot.compressorLowBandFilter.type = "lowpass";
      updateParam(slot.compressorLowBandFilter.frequency, compressorSettings?.sidechainFilterHz ?? 120);
      updateParam(slot.compressorLowBandFilter.Q, 0.707);
      updateParam(slot.compressorLowBandGain.gain, sidechain.lowBand, 0.006);
      updateParam(slot.compressorWet.gain, mix, 0.006);
      updateParam(slot.compressor.threshold, compressorSettings?.thresholdDb ?? 0);
      updateParam(slot.compressor.ratio, compressorSettings?.ratio ?? 1);
      updateParam(slot.compressor.knee, compressorSettings?.knee ?? 0);
      updateParam(slot.compressor.attack, clamp((compressorSettings?.attackMs ?? 1) / 1_000, 0, 1));
      updateParam(slot.compressor.release, clamp((compressorSettings?.releaseMs ?? 1) / 1_000, 0, 1));
      updateParam(slot.makeupGain.gain, decibelsToGain(compressorSettings?.makeupGainDb ?? 0));
      updateParam(slot.outputGain.gain, decibelsToGain(outputSettings?.outputGainDb ?? 0));
      updateParam(slot.limiter.threshold, limiterSettings?.ceilingDbfs ?? 0);
      updateParam(slot.limiter.knee, 0);
      updateParam(slot.limiter.ratio, limiterSettings ? 20 : 1);
      updateParam(slot.limiter.attack, clamp((limiterSettings?.attackMs ?? 1) / 1_000, 0, 1));
      updateParam(slot.limiter.release, clamp((limiterSettings?.releaseMs ?? 1) / 1_000, 0, 1));
      for (const channelLimiter of [slot.limiterLeft, slot.limiterRight]) {
        updateParam(channelLimiter.threshold, limiterSettings?.ceilingDbfs ?? 0);
        updateParam(channelLimiter.knee, 0);
        updateParam(channelLimiter.ratio, limiterSettings ? 20 : 1);
        updateParam(channelLimiter.attack, clamp((limiterSettings?.attackMs ?? 1) / 1_000, 0, 1));
        updateParam(channelLimiter.release, clamp((limiterSettings?.releaseMs ?? 1) / 1_000, 0, 1));
      }
      const stereoMatrix = limiterStereoMatrix(limiterSettings?.stereoLinkPercent ?? 100);
      updateParam(slot.limiterIndependentGain.gain, stereoMatrix.independent, 0.006);
      updateParam(slot.limiterLinkedGain.gain, stereoMatrix.linked, 0.006);

      const mid = decibelsToGain(fieldSettings?.depthDb ?? 0);
      const side = decibelsToGain(fieldSettings?.widthDb ?? 0);
      const balance = fieldSettings?.balance ?? 0;
      const leftBalance = balance > 0 ? 1 - balance : 1;
      const rightBalance = balance < 0 ? 1 + balance : 1;
      updateParam(slot.fieldLeftToLeft.gain, ((mid + side) / 2) * leftBalance, 0.006);
      updateParam(slot.fieldRightToLeft.gain, ((mid - side) / 2) * leftBalance, 0.006);
      updateParam(slot.fieldLeftToRight.gain, ((mid - side) / 2) * rightBalance, 0.006);
      updateParam(slot.fieldRightToRight.gain, ((mid + side) / 2) * rightBalance, 0.006);

      const colorMix = colorSettings?.mix ?? 0;
      updateParam(slot.colorDry.gain, 1 - colorMix, 0.006);
      updateParam(slot.colorWet.gain, colorMix, 0.006);
      updateParam(slot.colorDrive.gain, decibelsToGain(colorSettings?.driveDb ?? 0));
      slot.colorFilter.type = "highshelf";
      updateParam(slot.colorFilter.frequency, colorSettings?.colorFrequencyHz ?? 1_500);
      updateParam(slot.colorFilter.gain, (colorSettings?.driveDb ?? 0) * 0.3);
      slot.colorShaper.curve = harmonicColorCurve(colorSettings);
      slot.colorShaper.oversample = colorSettings?.oversample === 4 ? "4x" : colorSettings?.oversample === 2 ? "2x" : "none";
      updateParam(slot.colorOutput.gain, decibelsToGain(colorSettings?.outputGainDb ?? 0));

      const useMidSidePhase = ["mid", "side"].includes(phaseSettings?.target);
      const encode = useMidSidePhase ? { ll: 0.5, lr: 0.5, rl: 0.5, rr: -0.5 } : { ll: 1, lr: 0, rl: 0, rr: 1 };
      const decode = useMidSidePhase ? { ll: 1, lr: 1, rl: 1, rr: -1 } : { ll: 1, lr: 0, rl: 0, rr: 1 };
      updateParam(slot.phaseEncodeLeftToLeft.gain, encode.ll, 0.006);
      updateParam(slot.phaseEncodeLeftToRight.gain, encode.lr, 0.006);
      updateParam(slot.phaseEncodeRightToLeft.gain, encode.rl, 0.006);
      updateParam(slot.phaseEncodeRightToRight.gain, encode.rr, 0.006);
      updateParam(slot.phaseDecodeLeftToLeft.gain, decode.ll, 0.006);
      updateParam(slot.phaseDecodeLeftToRight.gain, decode.lr, 0.006);
      updateParam(slot.phaseDecodeRightToLeft.gain, decode.rl, 0.006);
      updateParam(slot.phaseDecodeRightToRight.gain, decode.rr, 0.006);
      const targetLeft = phaseSettings && ["left", "mid"].includes(phaseSettings.target);
      const targetRight = phaseSettings && ["right", "side"].includes(phaseSettings.target);
      const phaseMix = phaseSettings?.mix ?? 0;
      updateParam(slot.phaseLeftDry.gain, targetLeft ? 1 - phaseMix : 1, 0.006);
      updateParam(slot.phaseRightDry.gain, targetRight ? 1 - phaseMix : 1, 0.006);
      updateParam(slot.phaseLeftWet.gain, targetLeft ? phaseMix : 0, 0.006);
      updateParam(slot.phaseRightWet.gain, targetRight ? phaseMix : 0, 0.006);
      for (const [delay, allpass, polarity] of [[slot.phaseLeftDelay, slot.phaseLeftAllpass, slot.phaseLeftPolarity], [slot.phaseRightDelay, slot.phaseRightAllpass, slot.phaseRightPolarity]]) {
        updateParam(delay.delayTime, (phaseSettings?.delaySamples ?? 0) / (graph.context?.sampleRate || 48_000));
        allpass.type = "allpass";
        updateParam(allpass.frequency, phaseSettings?.centerFrequencyHz ?? 1_000);
        updateParam(allpass.Q, phaseSettings?.q ?? 0.707);
        updateParam(polarity.gain, phaseSettings?.polarityInvert ? -1 : 1, 0.006);
      }

      const hfMix = hfSettings?.mix ?? 0;
      updateParam(slot.hfDry.gain, 1 - hfMix, 0.006);
      updateParam(slot.hfProcessed.gain, hfMix, 0.006);
      slot.hfLow.type = "lowpass";
      slot.hfHigh.type = "highpass";
      updateParam(slot.hfLow.frequency, hfSettings?.frequencyHz ?? 6_500);
      updateParam(slot.hfHigh.frequency, hfSettings?.frequencyHz ?? 6_500);
      updateParam(slot.hfCompressor.threshold, hfSettings?.thresholdDb ?? 0);
      updateParam(slot.hfCompressor.ratio, hfSettings?.ratio ?? 1);
      updateParam(slot.hfCompressor.knee, hfSettings ? 3 : 0);
      updateParam(slot.hfCompressor.attack, (hfSettings?.attackMs ?? 1) / 1_000);
      updateParam(slot.hfCompressor.release, (hfSettings?.releaseMs ?? 1) / 1_000);
      updateParam(slot.hfOutput.gain, decibelsToGain(hfSettings?.outputGainDb ?? 0));

      const ambienceWet = (ambienceSettings?.wetPercent ?? 0) / 100;
      updateParam(slot.ambienceDry.gain, 1 - ambienceWet, 0.006);
      updateParam(slot.ambienceWet.gain, ambienceWet, 0.006);
      updateParam(slot.ambienceDelay.delayTime, (ambienceSettings?.preDelayMs ?? 0) / 1_000);
      slot.ambienceLowCut.type = "highpass";
      slot.ambienceDamping.type = "lowpass";
      updateParam(slot.ambienceLowCut.frequency, ambienceSettings?.lowCutHz ?? 120);
      updateParam(slot.ambienceDamping.frequency, ambienceSettings?.dampingHz ?? 9_000);
      if (ambienceSettings) setAmbienceImpulse(slot, graph.context, ambienceSettings);

      updateParam(slot.transientBase.gain, 1, 0.006);
      slot.transientAttackFilter.type = "highpass";
      slot.transientSustainFilter.type = "lowpass";
      const transientFocus = transientSettings?.mode === "focused" ? transientSettings.focusFrequencyHz : 80;
      updateParam(slot.transientAttackFilter.frequency, transientFocus);
      updateParam(slot.transientSustainFilter.frequency, Math.max(400, transientFocus * 4));
      updateParam(slot.transientAttackGain.gain, transientSettings ? decibelsToGain(transientSettings.attackDb) - 1 : 0, 0.006);
      updateParam(slot.transientSustainGain.gain, transientSettings ? decibelsToGain(transientSettings.sustainDb) - 1 : 0, 0.006);
      updateParam(slot.transientOutput.gain, decibelsToGain(transientSettings?.outputGainDb ?? 0));

      const phaserMix = phaserSettings?.mix ?? 0;
      updateParam(slot.phaserDry.gain, 1 - phaserMix, 0.006);
      updateParam(slot.phaserWet.gain, phaserMix, 0.006);
      updateParam(slot.phaserLfo.frequency, phaserSettings?.rateHz ?? 0.2);
      updateParam(slot.phaserModulation.gain, (phaserSettings?.centerFrequencyHz ?? 800) * (phaserSettings?.depth ?? 0));
      updateParam(slot.phaserFeedback.gain, phaserSettings?.feedback ?? 0, 0.006);
      for (const filter of slot.phaserFilters) {
        filter.type = "allpass";
        updateParam(filter.frequency, phaserSettings?.centerFrequencyHz ?? 800);
        updateParam(filter.Q, 0.8);
      }
      if (compressorSettings && !advancedCompressor) advancedCompressor = slot.compressor;
      if (limiterSettings && !advancedLimiter) advancedLimiter = slot.limiter;
      if (node?.typeId === ADVANCED_PROCESSOR_TYPES.compressor) processorMeters[`processor:${node.id}:compressor`] = slot.compressor;
      if (node?.typeId === ADVANCED_PROCESSOR_TYPES.limiter) processorMeters[`processor:${node.id}:limiter`] = slot.limiter;
    });
  }

  return { settings, masteringPath, advancedMastering, sourceBypassed, masterBypassed, trackGainDb, metering: { compressor: advancedCompressor || graph.compressor, limiter: advancedLimiter || graph.limiter, processorMeters } };
};

const harmonicColorCurve = (settings) => {
  const points = 2_048;
  const curve = new Float32Array(points);
  const drive = decibelsToGain(settings?.driveDb ?? 0);
  const even = settings?.evenAmount ?? 0;
  const odd = settings?.oddAmount ?? 0;
  for (let index = 0; index < points; index += 1) {
    const input = (index / (points - 1)) * 2 - 1;
    const driven = input * drive;
    const oddShape = Math.tanh(driven * (1 + odd * 4));
    const evenShape = (1 - Math.exp(-Math.abs(driven) * (1 + even * 4))) * Math.sign(driven || 1);
    curve[index] = Math.max(-1, Math.min(1, oddShape * (1 - even * 0.45) + evenShape * even * 0.45));
  }
  return curve;
};

const setAmbienceImpulse = (slot, context, settings) => {
  if (!context?.createBuffer || !slot.ambienceConvolver) return;
  const signature = [settings.model, settings.decaySeconds, settings.widthPercent].join(":");
  if (slot.ambienceSignature === signature) return;
  const sampleRate = context.sampleRate || 48_000;
  const length = Math.max(1, Math.round(sampleRate * settings.decaySeconds));
  const buffer = context.createBuffer(2, length, sampleRate);
  const modelFactor = settings.model === "plate" ? 1.8 : settings.model === "chamber" ? 1.35 : 1;
  for (let channel = 0; channel < 2; channel += 1) {
    const values = buffer.getChannelData(channel);
    let seed = 0x6d2b79f5 ^ (channel * 0x9e3779b9) ^ Math.round(settings.widthPercent * 97);
    for (let index = 0; index < length; index += 1) {
      seed ^= seed << 13; seed ^= seed >>> 17; seed ^= seed << 5;
      const noise = ((seed >>> 0) / 0xffffffff) * 2 - 1;
      const time = index / sampleRate;
      values[index] = index === 0 ? 1 : noise * 0.12 * modelFactor * Math.exp((-6 * time) / settings.decaySeconds);
    }
  }
  slot.ambienceConvolver.buffer = buffer;
  slot.ambienceSignature = signature;
};

const createProcessorSlot = (context) => {
  const input = context.createGain();
  const eqEncodeSplitter = context.createChannelSplitter(2);
  const eqEncodeLeftToLeft = context.createGain();
  const eqEncodeLeftToRight = context.createGain();
  const eqEncodeRightToLeft = context.createGain();
  const eqEncodeRightToRight = context.createGain();
  const eqEncodeMerger = context.createChannelMerger(2);
  const eqProcessSplitter = context.createChannelSplitter(2);
  const lowShelf = context.createBiquadFilter();
  const lowMidBand = context.createBiquadFilter();
  const highMidBand = context.createBiquadFilter();
  const highShelf = context.createBiquadFilter();
  const lowShelfRight = context.createBiquadFilter();
  const lowMidBandRight = context.createBiquadFilter();
  const highMidBandRight = context.createBiquadFilter();
  const highShelfRight = context.createBiquadFilter();
  const eqProcessMerger = context.createChannelMerger(2);
  const eqDecodeSplitter = context.createChannelSplitter(2);
  const eqDecodeLeftToLeft = context.createGain();
  const eqDecodeLeftToRight = context.createGain();
  const eqDecodeRightToLeft = context.createGain();
  const eqDecodeRightToRight = context.createGain();
  const eqDecodeMerger = context.createChannelMerger(2);
  const eqOutputGain = context.createGain();
  const compressorEncodeSplitter = context.createChannelSplitter(2);
  const compressorEncodeLeftToLeft = context.createGain();
  const compressorEncodeLeftToRight = context.createGain();
  const compressorEncodeRightToLeft = context.createGain();
  const compressorEncodeRightToRight = context.createGain();
  const compressorEncodeMerger = context.createChannelMerger(2);
  const compressorOriginalSplitter = context.createChannelSplitter(2);
  const compressorProcessedLeft = context.createGain();
  const compressorProcessedRight = context.createGain();
  const compressorProcessMerger = context.createChannelMerger(2);
  const compressorDry = context.createGain();
  const compressorFullRange = context.createGain();
  const compressorSidechainFilter = context.createBiquadFilter();
  const compressorSidechainGain = context.createGain();
  const compressorDetectorSum = context.createGain();
  const compressorLowBandFilter = context.createBiquadFilter();
  const compressorLowBandGain = context.createGain();
  const compressor = context.createDynamicsCompressor();
  const makeupGain = context.createGain();
  const compressorWet = context.createGain();
  const compressorSum = context.createGain();
  const compressorProcessedSplitter = context.createChannelSplitter(2);
  const compressorOriginalLeft = context.createGain();
  const compressorOriginalRight = context.createGain();
  const compressorSelectedMerger = context.createChannelMerger(2);
  const compressorDecodeSplitter = context.createChannelSplitter(2);
  const compressorDecodeLeftToLeft = context.createGain();
  const compressorDecodeLeftToRight = context.createGain();
  const compressorDecodeRightToLeft = context.createGain();
  const compressorDecodeRightToRight = context.createGain();
  const compressorDecodeMerger = context.createChannelMerger(2);
  const outputGain = context.createGain();
  const limiter = context.createDynamicsCompressor();
  const limiterLinkedGain = context.createGain();
  const limiterSplitter = context.createChannelSplitter(2);
  const limiterLeft = context.createDynamicsCompressor();
  const limiterRight = context.createDynamicsCompressor();
  const limiterMerger = context.createChannelMerger(2);
  const limiterIndependentGain = context.createGain();
  const limiterSum = context.createGain();

  const fieldSplitter = context.createChannelSplitter(2);
  const fieldLeftToLeft = context.createGain();
  const fieldLeftToRight = context.createGain();
  const fieldRightToLeft = context.createGain();
  const fieldRightToRight = context.createGain();
  const fieldMerger = context.createChannelMerger(2);

  const colorDry = context.createGain();
  const colorDrive = context.createGain();
  const colorFilter = context.createBiquadFilter();
  const colorShaper = context.createWaveShaper();
  const colorWet = context.createGain();
  const colorSum = context.createGain();
  const colorOutput = context.createGain();

  const phaseEncodeSplitter = context.createChannelSplitter(2);
  const phaseEncodeLeftToLeft = context.createGain();
  const phaseEncodeLeftToRight = context.createGain();
  const phaseEncodeRightToLeft = context.createGain();
  const phaseEncodeRightToRight = context.createGain();
  const phaseEncodeMerger = context.createChannelMerger(2);
  const phaseProcessSplitter = context.createChannelSplitter(2);
  const phaseLeftDry = context.createGain();
  const phaseLeftDelay = context.createDelay(0.01);
  const phaseLeftAllpass = context.createBiquadFilter();
  const phaseLeftPolarity = context.createGain();
  const phaseLeftWet = context.createGain();
  const phaseLeftSum = context.createGain();
  const phaseRightDry = context.createGain();
  const phaseRightDelay = context.createDelay(0.01);
  const phaseRightAllpass = context.createBiquadFilter();
  const phaseRightPolarity = context.createGain();
  const phaseRightWet = context.createGain();
  const phaseRightSum = context.createGain();
  const phaseProcessMerger = context.createChannelMerger(2);
  const phaseDecodeSplitter = context.createChannelSplitter(2);
  const phaseDecodeLeftToLeft = context.createGain();
  const phaseDecodeLeftToRight = context.createGain();
  const phaseDecodeRightToLeft = context.createGain();
  const phaseDecodeRightToRight = context.createGain();
  const phaseDecodeMerger = context.createChannelMerger(2);

  const hfDry = context.createGain();
  const hfLow = context.createBiquadFilter();
  const hfHigh = context.createBiquadFilter();
  const hfCompressor = context.createDynamicsCompressor();
  const hfBandSum = context.createGain();
  const hfProcessed = context.createGain();
  const hfSum = context.createGain();
  const hfOutput = context.createGain();

  const ambienceDry = context.createGain();
  const ambienceDelay = context.createDelay(0.1);
  const ambienceLowCut = context.createBiquadFilter();
  const ambienceDamping = context.createBiquadFilter();
  const ambienceConvolver = context.createConvolver();
  const ambienceWet = context.createGain();
  const ambienceSum = context.createGain();

  const transientBase = context.createGain();
  const transientAttackFilter = context.createBiquadFilter();
  const transientAttackGain = context.createGain();
  const transientSustainFilter = context.createBiquadFilter();
  const transientSustainGain = context.createGain();
  const transientSum = context.createGain();
  const transientOutput = context.createGain();

  const phaserDry = context.createGain();
  const phaserFilters = Array.from({ length: 4 }, () => context.createBiquadFilter());
  const phaserWet = context.createGain();
  const phaserFeedback = context.createGain();
  const phaserSum = context.createGain();
  const phaserLfo = context.createOscillator();
  const phaserModulation = context.createGain();
  const output = context.createGain();
  eqEncodeLeftToLeft.gain.value = 1; eqEncodeLeftToRight.gain.value = 0; eqEncodeRightToLeft.gain.value = 0; eqEncodeRightToRight.gain.value = 1;
  eqDecodeLeftToLeft.gain.value = 1; eqDecodeLeftToRight.gain.value = 0; eqDecodeRightToLeft.gain.value = 0; eqDecodeRightToRight.gain.value = 1;
  compressorEncodeLeftToLeft.gain.value = 1; compressorEncodeLeftToRight.gain.value = 0; compressorEncodeRightToLeft.gain.value = 0; compressorEncodeRightToRight.gain.value = 1;
  compressorProcessedLeft.gain.value = 1; compressorProcessedRight.gain.value = 1; compressorOriginalLeft.gain.value = 0; compressorOriginalRight.gain.value = 0;
  compressorDecodeLeftToLeft.gain.value = 1; compressorDecodeLeftToRight.gain.value = 0; compressorDecodeRightToLeft.gain.value = 0; compressorDecodeRightToRight.gain.value = 1;
  fieldLeftToLeft.gain.value = 1; fieldLeftToRight.gain.value = 0; fieldRightToLeft.gain.value = 0; fieldRightToRight.gain.value = 1;
  colorDry.gain.value = 1; colorWet.gain.value = 0;
  phaseEncodeLeftToLeft.gain.value = 1; phaseEncodeLeftToRight.gain.value = 0; phaseEncodeRightToLeft.gain.value = 0; phaseEncodeRightToRight.gain.value = 1;
  phaseLeftDry.gain.value = 1; phaseLeftWet.gain.value = 0; phaseRightDry.gain.value = 1; phaseRightWet.gain.value = 0;
  phaseDecodeLeftToLeft.gain.value = 1; phaseDecodeLeftToRight.gain.value = 0; phaseDecodeRightToLeft.gain.value = 0; phaseDecodeRightToRight.gain.value = 1;
  hfDry.gain.value = 1; hfProcessed.gain.value = 0;
  ambienceDry.gain.value = 1; ambienceWet.gain.value = 0;
  transientBase.gain.value = 1; transientAttackGain.gain.value = 0; transientSustainGain.gain.value = 0;
  phaserDry.gain.value = 1; phaserWet.gain.value = 0; phaserFeedback.gain.value = 0; phaserModulation.gain.value = 0;
  // Every slot contains the complete built-in graph. Rack edits only reconnect
  // slot boundaries, avoiding media-source recreation or transport interruption.
  input.connect(eqEncodeSplitter);
  eqEncodeSplitter.connect(eqEncodeLeftToLeft, 0, 0); eqEncodeLeftToLeft.connect(eqEncodeMerger, 0, 0);
  eqEncodeSplitter.connect(eqEncodeLeftToRight, 0, 0); eqEncodeLeftToRight.connect(eqEncodeMerger, 0, 1);
  eqEncodeSplitter.connect(eqEncodeRightToLeft, 1, 0); eqEncodeRightToLeft.connect(eqEncodeMerger, 0, 0);
  eqEncodeSplitter.connect(eqEncodeRightToRight, 1, 0); eqEncodeRightToRight.connect(eqEncodeMerger, 0, 1);
  eqEncodeMerger.connect(eqProcessSplitter);
  eqProcessSplitter.connect(lowShelf, 0, 0); lowShelf.connect(lowMidBand).connect(highMidBand).connect(highShelf).connect(eqProcessMerger, 0, 0);
  eqProcessSplitter.connect(lowShelfRight, 1, 0); lowShelfRight.connect(lowMidBandRight).connect(highMidBandRight).connect(highShelfRight).connect(eqProcessMerger, 0, 1);
  eqProcessMerger.connect(eqDecodeSplitter);
  eqDecodeSplitter.connect(eqDecodeLeftToLeft, 0, 0); eqDecodeLeftToLeft.connect(eqDecodeMerger, 0, 0);
  eqDecodeSplitter.connect(eqDecodeLeftToRight, 0, 0); eqDecodeLeftToRight.connect(eqDecodeMerger, 0, 1);
  eqDecodeSplitter.connect(eqDecodeRightToLeft, 1, 0); eqDecodeRightToLeft.connect(eqDecodeMerger, 0, 0);
  eqDecodeSplitter.connect(eqDecodeRightToRight, 1, 0); eqDecodeRightToRight.connect(eqDecodeMerger, 0, 1);
  eqDecodeMerger.connect(eqOutputGain).connect(compressorEncodeSplitter);

  compressorEncodeSplitter.connect(compressorEncodeLeftToLeft, 0, 0); compressorEncodeLeftToLeft.connect(compressorEncodeMerger, 0, 0);
  compressorEncodeSplitter.connect(compressorEncodeLeftToRight, 0, 0); compressorEncodeLeftToRight.connect(compressorEncodeMerger, 0, 1);
  compressorEncodeSplitter.connect(compressorEncodeRightToLeft, 1, 0); compressorEncodeRightToLeft.connect(compressorEncodeMerger, 0, 0);
  compressorEncodeSplitter.connect(compressorEncodeRightToRight, 1, 0); compressorEncodeRightToRight.connect(compressorEncodeMerger, 0, 1);
  compressorEncodeMerger.connect(compressorOriginalSplitter);
  compressorOriginalSplitter.connect(compressorProcessedLeft, 0, 0); compressorProcessedLeft.connect(compressorProcessMerger, 0, 0);
  compressorOriginalSplitter.connect(compressorProcessedRight, 1, 0); compressorProcessedRight.connect(compressorProcessMerger, 0, 1);
  compressorProcessMerger.connect(compressorDry).connect(compressorSum);
  compressorProcessMerger.connect(compressorFullRange).connect(compressorDetectorSum);
  compressorProcessMerger.connect(compressorSidechainFilter).connect(compressorSidechainGain).connect(compressorDetectorSum);
  compressorDetectorSum.connect(compressor).connect(makeupGain).connect(compressorWet).connect(compressorSum);
  compressorProcessMerger.connect(compressorLowBandFilter).connect(compressorLowBandGain).connect(makeupGain);
  compressorSum.connect(compressorProcessedSplitter);
  compressorProcessedSplitter.connect(compressorSelectedMerger, 0, 0);
  compressorProcessedSplitter.connect(compressorSelectedMerger, 1, 1);
  compressorOriginalSplitter.connect(compressorOriginalLeft, 0, 0); compressorOriginalLeft.connect(compressorSelectedMerger, 0, 0);
  compressorOriginalSplitter.connect(compressorOriginalRight, 1, 0); compressorOriginalRight.connect(compressorSelectedMerger, 0, 1);
  compressorSelectedMerger.connect(compressorDecodeSplitter);
  compressorDecodeSplitter.connect(compressorDecodeLeftToLeft, 0, 0); compressorDecodeLeftToLeft.connect(compressorDecodeMerger, 0, 0);
  compressorDecodeSplitter.connect(compressorDecodeLeftToRight, 0, 0); compressorDecodeLeftToRight.connect(compressorDecodeMerger, 0, 1);
  compressorDecodeSplitter.connect(compressorDecodeRightToLeft, 1, 0); compressorDecodeRightToLeft.connect(compressorDecodeMerger, 0, 0);
  compressorDecodeSplitter.connect(compressorDecodeRightToRight, 1, 0); compressorDecodeRightToRight.connect(compressorDecodeMerger, 0, 1);
  compressorDecodeMerger.connect(outputGain);
  outputGain.connect(limiter).connect(limiterLinkedGain).connect(limiterSum);
  outputGain.connect(limiterSplitter);
  limiterSplitter.connect(limiterLeft, 0, 0);
  limiterSplitter.connect(limiterRight, 1, 0);
  limiterLeft.connect(limiterMerger, 0, 0);
  limiterRight.connect(limiterMerger, 0, 1);
  limiterMerger.connect(limiterIndependentGain).connect(limiterSum);

  limiterSum.connect(fieldSplitter);
  fieldSplitter.connect(fieldLeftToLeft, 0, 0); fieldLeftToLeft.connect(fieldMerger, 0, 0);
  fieldSplitter.connect(fieldLeftToRight, 0, 0); fieldLeftToRight.connect(fieldMerger, 0, 1);
  fieldSplitter.connect(fieldRightToLeft, 1, 0); fieldRightToLeft.connect(fieldMerger, 0, 0);
  fieldSplitter.connect(fieldRightToRight, 1, 0); fieldRightToRight.connect(fieldMerger, 0, 1);

  fieldMerger.connect(colorDry).connect(colorSum);
  fieldMerger.connect(colorDrive).connect(colorFilter).connect(colorShaper).connect(colorWet).connect(colorSum);
  colorSum.connect(colorOutput).connect(phaseEncodeSplitter);

  phaseEncodeSplitter.connect(phaseEncodeLeftToLeft, 0, 0); phaseEncodeLeftToLeft.connect(phaseEncodeMerger, 0, 0);
  phaseEncodeSplitter.connect(phaseEncodeLeftToRight, 0, 0); phaseEncodeLeftToRight.connect(phaseEncodeMerger, 0, 1);
  phaseEncodeSplitter.connect(phaseEncodeRightToLeft, 1, 0); phaseEncodeRightToLeft.connect(phaseEncodeMerger, 0, 0);
  phaseEncodeSplitter.connect(phaseEncodeRightToRight, 1, 0); phaseEncodeRightToRight.connect(phaseEncodeMerger, 0, 1);
  phaseEncodeMerger.connect(phaseProcessSplitter);
  phaseProcessSplitter.connect(phaseLeftDry, 0, 0); phaseLeftDry.connect(phaseLeftSum);
  phaseProcessSplitter.connect(phaseLeftDelay, 0, 0); phaseLeftDelay.connect(phaseLeftAllpass).connect(phaseLeftPolarity).connect(phaseLeftWet).connect(phaseLeftSum);
  phaseProcessSplitter.connect(phaseRightDry, 1, 0); phaseRightDry.connect(phaseRightSum);
  phaseProcessSplitter.connect(phaseRightDelay, 1, 0); phaseRightDelay.connect(phaseRightAllpass).connect(phaseRightPolarity).connect(phaseRightWet).connect(phaseRightSum);
  phaseLeftSum.connect(phaseProcessMerger, 0, 0); phaseRightSum.connect(phaseProcessMerger, 0, 1);
  phaseProcessMerger.connect(phaseDecodeSplitter);
  phaseDecodeSplitter.connect(phaseDecodeLeftToLeft, 0, 0); phaseDecodeLeftToLeft.connect(phaseDecodeMerger, 0, 0);
  phaseDecodeSplitter.connect(phaseDecodeLeftToRight, 0, 0); phaseDecodeLeftToRight.connect(phaseDecodeMerger, 0, 1);
  phaseDecodeSplitter.connect(phaseDecodeRightToLeft, 1, 0); phaseDecodeRightToLeft.connect(phaseDecodeMerger, 0, 0);
  phaseDecodeSplitter.connect(phaseDecodeRightToRight, 1, 0); phaseDecodeRightToRight.connect(phaseDecodeMerger, 0, 1);

  phaseDecodeMerger.connect(hfDry).connect(hfSum);
  phaseDecodeMerger.connect(hfLow).connect(hfBandSum);
  phaseDecodeMerger.connect(hfHigh).connect(hfCompressor).connect(hfBandSum).connect(hfProcessed).connect(hfSum);
  hfSum.connect(hfOutput);

  hfOutput.connect(ambienceDry).connect(ambienceSum);
  hfOutput.connect(ambienceDelay).connect(ambienceLowCut).connect(ambienceDamping).connect(ambienceConvolver).connect(ambienceWet).connect(ambienceSum);

  ambienceSum.connect(transientBase).connect(transientSum);
  ambienceSum.connect(transientAttackFilter).connect(transientAttackGain).connect(transientSum);
  ambienceSum.connect(transientSustainFilter).connect(transientSustainGain).connect(transientSum);
  transientSum.connect(transientOutput);

  transientOutput.connect(phaserDry).connect(phaserSum);
  phaserFilters.reduce((previous, filter) => previous.connect(filter), transientOutput).connect(phaserWet).connect(phaserSum);
  phaserFilters.at(-1).connect(phaserFeedback).connect(phaserFilters[0]);
  phaserLfo.connect(phaserModulation);
  phaserFilters.forEach((filter) => phaserModulation.connect(filter.frequency));
  phaserLfo.start();
  phaserSum.connect(output);

  return {
    input,
    eqEncodeSplitter, eqEncodeLeftToLeft, eqEncodeLeftToRight, eqEncodeRightToLeft, eqEncodeRightToRight, eqEncodeMerger, eqProcessSplitter,
    lowShelf, lowMidBand, highMidBand, highShelf, lowShelfRight, lowMidBandRight, highMidBandRight, highShelfRight, eqProcessMerger,
    eqDecodeSplitter, eqDecodeLeftToLeft, eqDecodeLeftToRight, eqDecodeRightToLeft, eqDecodeRightToRight, eqDecodeMerger, eqOutputGain,
    compressorEncodeSplitter, compressorEncodeLeftToLeft, compressorEncodeLeftToRight, compressorEncodeRightToLeft, compressorEncodeRightToRight, compressorEncodeMerger,
    compressorOriginalSplitter, compressorProcessedLeft, compressorProcessedRight, compressorProcessMerger,
    compressorDry, compressorFullRange, compressorSidechainFilter, compressorSidechainGain, compressorDetectorSum, compressorLowBandFilter, compressorLowBandGain, compressor, makeupGain, compressorWet, compressorSum, compressorProcessedSplitter, compressorOriginalLeft, compressorOriginalRight, compressorSelectedMerger,
    compressorDecodeSplitter, compressorDecodeLeftToLeft, compressorDecodeLeftToRight, compressorDecodeRightToLeft, compressorDecodeRightToRight, compressorDecodeMerger,
    outputGain, limiter, limiterLinkedGain, limiterSplitter, limiterLeft, limiterRight, limiterMerger, limiterIndependentGain, limiterSum,
    fieldSplitter, fieldLeftToLeft, fieldLeftToRight, fieldRightToLeft, fieldRightToRight, fieldMerger,
    colorDry, colorDrive, colorFilter, colorShaper, colorWet, colorSum, colorOutput,
    phaseEncodeSplitter, phaseEncodeLeftToLeft, phaseEncodeLeftToRight, phaseEncodeRightToLeft, phaseEncodeRightToRight, phaseEncodeMerger, phaseProcessSplitter, phaseLeftDry, phaseLeftDelay, phaseLeftAllpass, phaseLeftPolarity, phaseLeftWet, phaseLeftSum, phaseRightDry, phaseRightDelay, phaseRightAllpass, phaseRightPolarity, phaseRightWet, phaseRightSum, phaseProcessMerger, phaseDecodeSplitter, phaseDecodeLeftToLeft, phaseDecodeLeftToRight, phaseDecodeRightToLeft, phaseDecodeRightToRight, phaseDecodeMerger,
    hfDry, hfLow, hfHigh, hfCompressor, hfBandSum, hfProcessed, hfSum, hfOutput,
    ambienceDry, ambienceDelay, ambienceLowCut, ambienceDamping, ambienceConvolver, ambienceWet, ambienceSum, ambienceSignature: "",
    transientBase, transientAttackFilter, transientAttackGain, transientSustainFilter, transientSustainGain, transientSum, transientOutput,
    phaserDry, phaserFilters, phaserWet, phaserFeedback, phaserSum, phaserLfo, phaserModulation, output,
  };
};

export const createLiveMasteringGraph = (audio, AudioContextClass) => {
  if (!audio || !AudioContextClass) return null;
  const context = new AudioContextClass();
  const source = context.createMediaElementSource(audio);
  const envelopeGain = context.createGain();
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
  const advancedInput = context.createGain();
  const advancedProcessedGain = context.createGain();
  const masterOutput = context.createGain();
  const frequencyAnalyser = context.createAnalyser();
  const channelSplitter = context.createChannelSplitter(2);
  const leftAnalyser = context.createAnalyser();
  const rightAnalyser = context.createAnalyser();
  const monitorLeftToLeft = context.createGain();
  const monitorLeftToRight = context.createGain();
  const monitorRightToLeft = context.createGain();
  const monitorRightToRight = context.createGain();
  const channelMerger = context.createChannelMerger(2);
  const processorSlots = Array.from({ length: ADVANCED_RACK_MAX_PROCESSORS }, () => createProcessorSlot(context));

  configureAnalyser(frequencyAnalyser, { fftSize: 2_048, smoothingTimeConstant: 0.76 });
  configureAnalyser(eqInputAnalyser, { fftSize: 2_048, smoothingTimeConstant: 0.76 });
  // Level meters need less temporal history than the frequency display. A
  // smaller window keeps both the header and full meter responsive with half
  // the per-frame sample work while the spectrum retains its 2,048-point FFT.
  configureAnalyser(leftAnalyser, { fftSize: 1_024 });
  configureAnalyser(rightAnalyser, { fftSize: 1_024 });

  source.connect(envelopeGain);
  envelopeGain.connect(directGain).connect(masterOutput);
  envelopeGain.connect(trackGain);
  trackGain.connect(bypassGain).connect(masterOutput);
  trackGain.connect(eqInputAnalyser).connect(lowShelf).connect(midBand).connect(highShelf);
  highShelf.connect(compressorDry).connect(compressorSum);
  highShelf.connect(compressor).connect(makeupGain).connect(compressorWet).connect(compressorSum);
  compressorSum.connect(outputGain).connect(limiter).connect(processedGain).connect(masterOutput);
  trackGain.connect(advancedInput);
  advancedInput.connect(advancedProcessedGain).connect(masterOutput);
  masterOutput.connect(frequencyAnalyser).connect(channelSplitter);
  channelSplitter.connect(leftAnalyser, 0, 0);
  channelSplitter.connect(rightAnalyser, 1, 0);
  leftAnalyser.connect(monitorLeftToLeft).connect(channelMerger, 0, 0);
  leftAnalyser.connect(monitorLeftToRight).connect(channelMerger, 0, 1);
  rightAnalyser.connect(monitorRightToLeft).connect(channelMerger, 0, 0);
  rightAnalyser.connect(monitorRightToRight).connect(channelMerger, 0, 1);
  channelMerger.connect(context.destination);

  const monitorGraph = { context, monitorLeftToLeft, monitorLeftToRight, monitorRightToLeft, monitorRightToRight };
  setMasterMonitorMode(monitorGraph, "stereo");

  return {
    context,
    source,
    envelopeGain,
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
    advancedInput,
    advancedProcessedGain,
    processorSlots,
    rackSlotCount: 0,
    masterOutput,
    frequencyAnalyser,
    channelSplitter,
    leftAnalyser,
    rightAnalyser,
    monitorLeftToLeft,
    monitorLeftToRight,
    monitorRightToLeft,
    monitorRightToRight,
    monitorMode: monitorGraph.monitorMode,
    channelMerger,
  };
};
