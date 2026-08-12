import assert from "node:assert/strict";
import test from "node:test";
import { activeMasteringProcessors, applyLiveMasteringSettings, comparisonPlaybackStart, compressorGainReductionDb, compressorSidechainMix, createLiveMasteringGraph, decibelsToGain, equalizerLiveImpact, limiterStereoMatrix, masterMonitorMatrix, masterMonitorRouting, playbackBypassesMastering, setMasterMonitorMode } from "../src/lib/live-mastering.js";
import { ADVANCED_PROCESSOR_TYPES, createAdvancedProcessor, createDefaultAdvancedMastering } from "../src/lib/advanced-mastering.js";

const parameter = () => ({ value: 0 });
const filter = () => ({ type: "", frequency: parameter(), gain: parameter(), Q: parameter() });
const gain = () => ({ gain: parameter() });
const compressor = () => ({ threshold: parameter(), ratio: parameter(), knee: parameter(), attack: parameter(), release: parameter() });
const delay = () => ({ delayTime: parameter() });
const premiumSlot = () => ({
  eqEncodeLeftToLeft: gain(), eqEncodeLeftToRight: gain(), eqEncodeRightToLeft: gain(), eqEncodeRightToRight: gain(),
  lowShelf: filter(), lowMidBand: filter(), highMidBand: filter(), highShelf: filter(), lowShelfRight: filter(), lowMidBandRight: filter(), highMidBandRight: filter(), highShelfRight: filter(),
  eqDecodeLeftToLeft: gain(), eqDecodeLeftToRight: gain(), eqDecodeRightToLeft: gain(), eqDecodeRightToRight: gain(), eqOutputGain: gain(),
  compressorEncodeLeftToLeft: gain(), compressorEncodeLeftToRight: gain(), compressorEncodeRightToLeft: gain(), compressorEncodeRightToRight: gain(), compressorProcessedLeft: gain(), compressorProcessedRight: gain(), compressorOriginalLeft: gain(), compressorOriginalRight: gain(), compressorDecodeLeftToLeft: gain(), compressorDecodeLeftToRight: gain(), compressorDecodeRightToLeft: gain(), compressorDecodeRightToRight: gain(),
  compressorDry: gain(), compressorFullRange: gain(), compressorSidechainFilter: filter(), compressorSidechainGain: gain(), compressorLowBandFilter: filter(), compressorLowBandGain: gain(), compressor: compressor(), makeupGain: gain(), compressorWet: gain(), outputGain: gain(), limiter: compressor(), limiterLeft: compressor(), limiterRight: compressor(), limiterIndependentGain: gain(), limiterLinkedGain: gain(),
  fieldLeftToLeft: gain(), fieldLeftToRight: gain(), fieldRightToLeft: gain(), fieldRightToRight: gain(),
  colorDry: gain(), colorWet: gain(), colorDrive: gain(), colorFilter: filter(), colorShaper: {}, colorOutput: gain(),
  phaseEncodeLeftToLeft: gain(), phaseEncodeLeftToRight: gain(), phaseEncodeRightToLeft: gain(), phaseEncodeRightToRight: gain(), phaseDecodeLeftToLeft: gain(), phaseDecodeLeftToRight: gain(), phaseDecodeRightToLeft: gain(), phaseDecodeRightToRight: gain(), phaseLeftDry: gain(), phaseLeftWet: gain(), phaseRightDry: gain(), phaseRightWet: gain(), phaseLeftDelay: delay(), phaseRightDelay: delay(), phaseLeftAllpass: filter(), phaseRightAllpass: filter(), phaseLeftPolarity: gain(), phaseRightPolarity: gain(),
  hfDry: gain(), hfProcessed: gain(), hfLow: filter(), hfHigh: filter(), hfCompressor: compressor(), hfOutput: gain(),
  ambienceDry: gain(), ambienceWet: gain(), ambienceDelay: delay(), ambienceLowCut: filter(), ambienceDamping: filter(), ambienceConvolver: {},
  transientBase: gain(), transientAttackFilter: filter(), transientSustainFilter: filter(), transientAttackGain: gain(), transientSustainGain: gain(), transientOutput: gain(),
  phaserDry: gain(), phaserWet: gain(), phaserLfo: { frequency: parameter() }, phaserModulation: gain(), phaserFeedback: gain(), phaserFilters: [filter(), filter(), filter(), filter()],
});
const settingsGraph = () => ({
  directGain: gain(),
  trackGain: gain(),
  bypassGain: gain(),
  processedGain: gain(),
  advancedProcessedGain: gain(),
  lowShelf: filter(),
  midBand: filter(),
  highShelf: filter(),
  compressorDry: gain(),
  compressor: compressor(),
  makeupGain: gain(),
  compressorWet: gain(),
  outputGain: gain(),
  limiter: compressor(),
});

const enabledMaster = {
  eq: {
    enabled: true,
    lowShelf: { frequencyHz: 90, gainDb: 2 },
    midBand: { frequencyHz: 1_800, gainDb: -1.5, q: 1.4 },
    highShelf: { frequencyHz: 10_000, gainDb: 1 },
  },
  compressor: {
    enabled: true,
    thresholdDb: -24,
    ratio: 3,
    attackMs: 25,
    releaseMs: 300,
    knee: 4,
    makeupGainDb: 2,
    mix: 0.75,
    detection: "rms",
    link: "maximum",
  },
  outputGainDb: -1,
  limiter: { enabled: true, ceilingDbfs: -1.2, attackMs: 4, releaseMs: 80 },
};

test("live MASTER settings drive the audible Web Audio path", () => {
  const graph = settingsGraph();
  const result = applyLiveMasteringSettings(graph, enabledMaster, { trackGainDb: -3 });

  assert.equal(result.masterBypassed, false);
  assert.equal(graph.directGain.gain.value, 0);
  assert.equal(graph.bypassGain.gain.value, 0);
  assert.equal(graph.processedGain.gain.value, 1);
  assert.equal(graph.trackGain.gain.value, decibelsToGain(-3));
  assert.deepEqual([graph.lowShelf.type, graph.lowShelf.frequency.value, graph.lowShelf.gain.value], ["lowshelf", 90, 2]);
  assert.deepEqual([graph.midBand.type, graph.midBand.frequency.value, graph.midBand.Q.value, graph.midBand.gain.value], ["peaking", 1_800, 1.4, -1.5]);
  assert.deepEqual([graph.highShelf.type, graph.highShelf.frequency.value, graph.highShelf.gain.value], ["highshelf", 10_000, 1]);
  assert.equal(graph.compressorDry.gain.value, 0.25);
  assert.equal(graph.compressorWet.gain.value, 0.75);
  assert.deepEqual([graph.compressor.threshold.value, graph.compressor.ratio.value, graph.compressor.attack.value, graph.compressor.release.value], [-24, 3, 0.025, 0.3]);
  assert.equal(graph.makeupGain.gain.value, decibelsToGain(2));
  assert.equal(graph.outputGain.gain.value, decibelsToGain(-1));
  assert.deepEqual([graph.limiter.threshold.value, graph.limiter.ratio.value, graph.limiter.attack.value, graph.limiter.release.value], [-1.2, 20, 0.004, 0.08]);
  assert.deepEqual(activeMasteringProcessors(enabledMaster), ["EQ", "compressor", "output", "limiter"]);
});

test("raw library and rendered previews bypass live processing to prevent altered or double-processed auditions", () => {
  const graph = settingsGraph();
  const result = applyLiveMasteringSettings(graph, enabledMaster, { sourceBypassed: true, trackGainDb: -12 });

  assert.equal(result.sourceBypassed, true);
  assert.equal(graph.directGain.gain.value, 1);
  assert.equal(graph.bypassGain.gain.value, 0);
  assert.equal(graph.processedGain.gain.value, 0);
  assert.equal(graph.trackGain.gain.value, decibelsToGain(-12));
});

test("Premium live processing assigns each rack position and meter in movable serial order", () => {
  const graph = settingsGraph();
  graph.processorSlots = [premiumSlot(), premiumSlot(), premiumSlot(), premiumSlot(), premiumSlot()];
  const limiter = createAdvancedProcessor(ADVANCED_PROCESSOR_TYPES.limiter, "limit-1");
  limiter.parameters.ceilingDbfs = -1.4;
  const eq = createAdvancedProcessor(ADVANCED_PROCESSOR_TYPES.eq, "eq-1");
  eq.parameters.lowMidBand.gainDb = -1.5;
  eq.parameters.highMidBand.gainDb = 1.25;
  eq.parameters.highShelf.gainDb = 2.5;
  eq.parameters.outputGainDb = -0.5;
  const output = createAdvancedProcessor(ADVANCED_PROCESSOR_TYPES.output, "out-1");
  output.parameters.outputGainDb = -2;
  const compressorUnit = createAdvancedProcessor(ADVANCED_PROCESSOR_TYPES.compressor, "compressor-1");
  compressorUnit.parameters.sidechainEnabled = true;
  compressorUnit.parameters.sidechainFilterHz = 250;
  const secondLimiter = createAdvancedProcessor(ADVANCED_PROCESSOR_TYPES.limiter, "limit-2");
  secondLimiter.parameters.ceilingDbfs = -2.2;
  limiter.parameters.stereoLinkPercent = 25;
  const rack = { ...createDefaultAdvancedMastering(), nodes: [limiter, eq, output, compressorUnit, secondLimiter] };

  const result = applyLiveMasteringSettings(graph, enabledMaster, { masteringPath: "advanced", advancedMastering: rack });
  assert.equal(graph.processedGain.gain.value, 0);
  assert.equal(graph.advancedProcessedGain.gain.value, 1);
  assert.equal(graph.processorSlots[0].limiter.threshold.value, -1.4);
  assert.equal(graph.processorSlots[1].lowMidBand.gain.value, -1.5);
  assert.equal(graph.processorSlots[1].highMidBand.gain.value, 1.25);
  assert.equal(graph.processorSlots[1].highShelf.gain.value, 2.5);
  assert.equal(graph.processorSlots[1].eqOutputGain.gain.value, decibelsToGain(-0.5));
  assert.equal(graph.processorSlots[2].outputGain.gain.value, decibelsToGain(-2));
  assert.equal(graph.processorSlots[3].compressorSidechainFilter.type, "highpass");
  assert.equal(graph.processorSlots[3].compressorSidechainFilter.frequency.value, 250);
  assert.equal(graph.processorSlots[3].compressorSidechainGain.gain.value, 1);
  assert.equal(graph.processorSlots[3].compressorLowBandFilter.type, "lowpass");
  assert.equal(graph.processorSlots[3].compressorLowBandFilter.frequency.value, 250);
  assert.equal(graph.processorSlots[3].compressorLowBandGain.gain.value, 1);
  assert.ok(graph.processorSlots[0].limiterIndependentGain.gain.value > graph.processorSlots[0].limiterLinkedGain.gain.value);
  assert.equal(graph.processorSlots[4].limiter.threshold.value, -2.2);
  assert.equal(result.metering.limiter, graph.processorSlots[0].limiter);
  assert.equal(result.metering.processorMeters["processor:limit-1:limiter"], graph.processorSlots[0].limiter);
  assert.equal(result.metering.processorMeters["processor:limit-2:limiter"], graph.processorSlots[4].limiter);
  assert.deepEqual(activeMasteringProcessors(enabledMaster, "advanced", rack), ["LIMIT", "EQ", "OUT", "COMP", "LIMIT"]);
});

test("Premium sidechain and limiter link controls map to real unity-safe gain structures", () => {
  assert.deepEqual(compressorSidechainMix({ enabled: false, frequencyHz: 500 }), { fullRange: 1, highPass: 0, lowBand: 0 });
  assert.deepEqual(compressorSidechainMix({ enabled: true, frequencyHz: 500 }), { fullRange: 0, highPass: 1, lowBand: 1 });
  assert.deepEqual(limiterStereoMatrix(0), { independent: 1, linked: 0 });
  assert.deepEqual(limiterStereoMatrix(40), { independent: 0.6, linked: 0.4 });
  assert.deepEqual(limiterStereoMatrix(100), { independent: 0, linked: 1 });
});

test("Premium Mid/Side EQ and compression isolate the selected encoded channel during live audition", () => {
  const graph = settingsGraph();
  graph.processorSlots = [premiumSlot(), premiumSlot()];
  const eq = createAdvancedProcessor(ADVANCED_PROCESSOR_TYPES.eq, "eq-side");
  eq.parameters.channelMode = "side";
  eq.parameters.lowMidBand.gainDb = -2.25;
  const compressorUnit = createAdvancedProcessor(ADVANCED_PROCESSOR_TYPES.compressor, "compressor-mid");
  compressorUnit.parameters.channelMode = "mid";
  const rack = { ...createDefaultAdvancedMastering(), nodes: [eq, compressorUnit] };

  applyLiveMasteringSettings(graph, enabledMaster, { masteringPath: "advanced", advancedMastering: rack });

  assert.deepEqual([
    graph.processorSlots[0].eqEncodeLeftToLeft.gain.value,
    graph.processorSlots[0].eqEncodeLeftToRight.gain.value,
    graph.processorSlots[0].eqEncodeRightToLeft.gain.value,
    graph.processorSlots[0].eqEncodeRightToRight.gain.value,
  ], [0.5, 0.5, 0.5, -0.5]);
  assert.equal(graph.processorSlots[0].lowMidBand.gain.value, 0);
  assert.equal(graph.processorSlots[0].lowMidBandRight.gain.value, -2.25);
  assert.deepEqual([
    graph.processorSlots[0].eqDecodeLeftToLeft.gain.value,
    graph.processorSlots[0].eqDecodeLeftToRight.gain.value,
    graph.processorSlots[0].eqDecodeRightToLeft.gain.value,
    graph.processorSlots[0].eqDecodeRightToRight.gain.value,
  ], [1, 1, 1, -1]);
  assert.deepEqual([
    graph.processorSlots[1].compressorProcessedLeft.gain.value,
    graph.processorSlots[1].compressorProcessedRight.gain.value,
    graph.processorSlots[1].compressorOriginalLeft.gain.value,
    graph.processorSlots[1].compressorOriginalRight.gain.value,
  ], [1, 0, 0, 1]);
  assert.deepEqual([
    graph.processorSlots[1].compressorDecodeLeftToLeft.gain.value,
    graph.processorSlots[1].compressorDecodeLeftToRight.gain.value,
    graph.processorSlots[1].compressorDecodeRightToLeft.gain.value,
    graph.processorSlots[1].compressorDecodeRightToRight.gain.value,
  ], [1, 1, 1, -1]);
});

test("stereo monitor modes use explicit audition-only matrices", () => {
  assert.deepEqual(masterMonitorMatrix("stereo"), { leftToLeft: 1, leftToRight: 0, rightToLeft: 0, rightToRight: 1 });
  assert.deepEqual(masterMonitorMatrix("mono"), { leftToLeft: 0.5, leftToRight: 0.5, rightToLeft: 0.5, rightToRight: 0.5 });
  assert.deepEqual(masterMonitorMatrix("side"), { leftToLeft: 0.5, leftToRight: 0.5, rightToLeft: -0.5, rightToRight: -0.5 });
  const graph = { context: {}, monitorLeftToLeft: gain(), monitorLeftToRight: gain(), monitorRightToLeft: gain(), monitorRightToRight: gain() };
  assert.equal(setMasterMonitorMode(graph, "side"), "side");
  assert.deepEqual([graph.monitorLeftToLeft.gain.value, graph.monitorLeftToRight.gain.value, graph.monitorRightToLeft.gain.value, graph.monitorRightToRight.gain.value], [0.5, 0.5, -0.5, -0.5]);
});

test("live MASTER controls schedule short ramps while audio is running to avoid zipper noise", () => {
  const graph = settingsGraph();
  const scheduled = [];
  graph.context = { state: "running", currentTime: 4.25 };
  graph.outputGain.gain = {
    value: 1,
    cancelScheduledValues: (time) => scheduled.push(["cancel", time]),
    setTargetAtTime: (value, time, constant) => scheduled.push(["target", value, time, constant]),
  };

  applyLiveMasteringSettings(graph, enabledMaster);

  assert.deepEqual(scheduled[0], ["cancel", 4.25]);
  assert.deepEqual(scheduled[1], ["target", decibelsToGain(-1), 4.25, 0.012]);
});

test("reference playback is explicitly classified for the clean direct output", () => {
  assert.equal(playbackBypassesMastering({ track: { id: "current" }, referenceTrack: true }), true);
  assert.equal(playbackBypassesMastering({ track: { id: "current" } }), false);
});

test("live compressor reduction converts the Web Audio reduction value to a positive decibel reading", () => {
  assert.equal(compressorGainReductionDb(0), 0);
  assert.equal(compressorGainReductionDb(-6.25), 6.25);
  assert.equal(compressorGainReductionDb(-40), 40);
  assert.equal(compressorGainReductionDb(2), 0);
  assert.equal(compressorGainReductionDb(undefined), 0);
});

test("live EQ impact weights the configured response by active spectrum energy", () => {
  const activeSpectrum = new Float32Array(1_024).fill(-30);
  const active = equalizerLiveImpact({ frequencyData: activeSpectrum, sampleRate: 48_000, eq: enabledMaster.eq });
  const silent = equalizerLiveImpact({ frequencyData: new Float32Array(1_024).fill(-96), sampleRate: 48_000, eq: enabledMaster.eq });

  assert.equal(active.values.length, 81);
  assert.equal(active.activity.length, 81);
  assert.ok(active.impactDb > 0);
  assert.ok(active.activity.some((value) => value > 0));
  assert.ok(active.values.some((value) => Math.abs(value) > 0));
  assert.equal(silent.impactDb, 0);
  assert.ok(silent.activity.every((value) => value === 0));
  assert.ok(silent.values.every((value) => value === 0));
});

test("header monitor routing distinguishes mastering, clean references, and raw audio", () => {
  assert.equal(masterMonitorRouting({ masterBus: enabledMaster, meteringAvailable: true }), "mastering");
  assert.equal(masterMonitorRouting({ masterBus: { ...enabledMaster, bypass: true }, meteringAvailable: true }), "raw");
  assert.equal(masterMonitorRouting({ masterBus: {}, meteringAvailable: true }), "raw");
  assert.equal(masterMonitorRouting({ entry: { track: { id: "current" } }, masterBus: enabledMaster, meteringAvailable: true }), "mastering");
  assert.equal(masterMonitorRouting({ entry: { track: { id: "current" }, referenceTrack: true }, masterBus: enabledMaster, meteringAvailable: true }), "reference");
  assert.equal(masterMonitorRouting({ entry: { renderedPreview: true }, masterBus: enabledMaster, meteringAvailable: false }), "mastering");
  assert.equal(masterMonitorRouting({ entry: { file: { key: "library" } }, masterBus: enabledMaster, meteringAvailable: true }), "raw");
  assert.equal(masterMonitorRouting({ entry: { track: { id: "current" } }, masterBus: { ...enabledMaster, bypass: true }, meteringAvailable: true }), "raw");
  assert.equal(masterMonitorRouting({ entry: { track: { id: "current" } }, masterBus: enabledMaster, meteringAvailable: false }), "raw");
});

test("A/B switching keeps elapsed time when possible and restarts when the target is shorter", () => {
  assert.equal(comparisonPlaybackStart({ baseStart: 2, elapsed: 10, duration: 30 }), 12);
  assert.equal(comparisonPlaybackStart({ baseStart: 2, elapsed: 28, duration: 20 }), 2);
});

test("the live graph connects one media source to direct, bypass, and processed destinations", () => {
  class FakeNode {
    constructor(kind) {
      this.kind = kind;
      this.connections = [];
      this.gain = parameter();
      this.frequency = parameter();
      this.Q = parameter();
      this.threshold = parameter();
      this.ratio = parameter();
      this.knee = parameter();
      this.attack = parameter();
      this.release = parameter();
      this.delayTime = parameter();
    }
    connect(node, output = 0, input = 0) { this.connections.push({ node, output, input }); return node; }
    disconnect() { this.connections = []; }
  }
  class FakeAudioContext {
    constructor() { this.destination = new FakeNode("destination"); this.sampleRate = 48_000; }
    createMediaElementSource() { return new FakeNode("source"); }
    createGain() { return new FakeNode("gain"); }
    createBiquadFilter() { return new FakeNode("filter"); }
    createDynamicsCompressor() { return new FakeNode("compressor"); }
    createWaveShaper() { return new FakeNode("waveshaper"); }
    createDelay() { return new FakeNode("delay"); }
    createConvolver() { return new FakeNode("convolver"); }
    createOscillator() { const node = new FakeNode("oscillator"); node.start = () => { node.started = true; }; return node; }
    createBuffer(channels, length) { return { getChannelData: () => new Float32Array(length) }; }
    createAnalyser() { return new FakeNode("analyser"); }
    createChannelSplitter() { return new FakeNode("splitter"); }
    createChannelMerger() { return new FakeNode("merger"); }
  }

  const graph = createLiveMasteringGraph({}, FakeAudioContext);
  assert.equal(graph.source.connections.length, 2);
  assert.equal(graph.directGain.connections[0].node, graph.masterOutput);
  assert.equal(graph.trackGain.connections.length, 3);
  assert.equal(graph.bypassGain.connections[0].node, graph.masterOutput);
  assert.equal(graph.trackGain.connections[1].node, graph.eqInputAnalyser);
  assert.equal(graph.trackGain.connections[2].node, graph.advancedInput);
  assert.equal(graph.eqInputAnalyser.connections[0].node, graph.lowShelf);
  assert.equal(graph.processedGain.connections[0].node, graph.masterOutput);
  assert.equal(graph.advancedProcessedGain.connections[0].node, graph.masterOutput);
  assert.equal(graph.masterOutput.connections[0].node, graph.frequencyAnalyser);
  assert.equal(graph.frequencyAnalyser.connections[0].node, graph.channelSplitter);
  assert.deepEqual(graph.channelSplitter.connections.map(({ node, output }) => [node, output]), [[graph.leftAnalyser, 0], [graph.rightAnalyser, 1]]);
  assert.deepEqual(graph.leftAnalyser.connections.map(({ node, input }) => [node, input]), [[graph.monitorLeftToLeft, 0], [graph.monitorLeftToRight, 0]]);
  assert.deepEqual(graph.rightAnalyser.connections.map(({ node, input }) => [node, input]), [[graph.monitorRightToLeft, 0], [graph.monitorRightToRight, 0]]);
  assert.deepEqual(graph.channelMerger.connections, [{ node: graph.context.destination, output: 0, input: 0 }]);
  assert.equal(graph.frequencyAnalyser.fftSize, 2_048);
  assert.equal(graph.frequencyAnalyser.smoothingTimeConstant, 0.76);
  assert.equal(graph.eqInputAnalyser.fftSize, 2_048);
  assert.equal(graph.eqInputAnalyser.smoothingTimeConstant, 0.76);
  assert.equal(graph.leftAnalyser.fftSize, 1_024);
  assert.equal(graph.rightAnalyser.fftSize, 1_024);

  const premiumRack = createDefaultAdvancedMastering();
  applyLiveMasteringSettings(graph, enabledMaster, { masteringPath: "advanced", advancedMastering: premiumRack });
  assert.equal(graph.rackSlotCount, 4);
  assert.equal(graph.advancedInput.connections[0].node, graph.processorSlots[0].input);
  assert.equal(graph.processorSlots[0].input.connections[0].node, graph.processorSlots[0].eqEncodeSplitter);
  assert.deepEqual(graph.processorSlots[0].eqProcessSplitter.connections.map(({ node, output }) => [node, output]), [[graph.processorSlots[0].lowShelf, 0], [graph.processorSlots[0].lowShelfRight, 1]]);
  assert.equal(graph.processorSlots[0].lowShelf.connections[0].node, graph.processorSlots[0].lowMidBand);
  assert.equal(graph.processorSlots[0].lowMidBand.connections[0].node, graph.processorSlots[0].highMidBand);
  assert.equal(graph.processorSlots[0].highMidBand.connections[0].node, graph.processorSlots[0].highShelf);
  assert.equal(graph.processorSlots[0].highShelf.connections[0].node, graph.processorSlots[0].eqProcessMerger);
  assert.equal(graph.processorSlots[0].highShelfRight.connections[0].node, graph.processorSlots[0].eqProcessMerger);
  assert.equal(graph.processorSlots[0].eqDecodeMerger.connections[0].node, graph.processorSlots[0].eqOutputGain);
  assert.equal(graph.processorSlots[0].compressorDecodeMerger.connections[0].node, graph.processorSlots[0].outputGain);
  assert.equal(graph.processorSlots[3].output.connections[0].node, graph.advancedProcessedGain);
  assert.equal(graph.processorSlots[4].output.connections.length, 0);

  applyLiveMasteringSettings(graph, enabledMaster, { masteringPath: "basic" });
  assert.equal(graph.rackSlotCount, 0);
  assert.equal(graph.advancedInput.connections[0].node, graph.advancedProcessedGain);
  assert.equal(graph.processorSlots[0].output.connections.length, 0);
});
