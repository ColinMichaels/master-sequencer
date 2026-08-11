import assert from "node:assert/strict";
import test from "node:test";
import { activeMasteringProcessors, applyLiveMasteringSettings, comparisonPlaybackStart, compressorGainReductionDb, createLiveMasteringGraph, decibelsToGain, equalizerLiveImpact, masterMonitorRouting, playbackBypassesMastering } from "../src/lib/live-mastering.js";

const parameter = () => ({ value: 0 });
const filter = () => ({ type: "", frequency: parameter(), gain: parameter(), Q: parameter() });
const gain = () => ({ gain: parameter() });
const compressor = () => ({ threshold: parameter(), ratio: parameter(), knee: parameter(), attack: parameter(), release: parameter() });
const settingsGraph = () => ({
  directGain: gain(),
  trackGain: gain(),
  bypassGain: gain(),
  processedGain: gain(),
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
    }
    connect(node, output = 0, input = 0) { this.connections.push({ node, output, input }); return node; }
  }
  class FakeAudioContext {
    constructor() { this.destination = new FakeNode("destination"); this.sampleRate = 48_000; }
    createMediaElementSource() { return new FakeNode("source"); }
    createGain() { return new FakeNode("gain"); }
    createBiquadFilter() { return new FakeNode("filter"); }
    createDynamicsCompressor() { return new FakeNode("compressor"); }
    createAnalyser() { return new FakeNode("analyser"); }
    createChannelSplitter() { return new FakeNode("splitter"); }
    createChannelMerger() { return new FakeNode("merger"); }
  }

  const graph = createLiveMasteringGraph({}, FakeAudioContext);
  assert.equal(graph.source.connections.length, 2);
  assert.equal(graph.directGain.connections[0].node, graph.masterOutput);
  assert.equal(graph.trackGain.connections.length, 2);
  assert.equal(graph.bypassGain.connections[0].node, graph.masterOutput);
  assert.equal(graph.trackGain.connections[1].node, graph.eqInputAnalyser);
  assert.equal(graph.eqInputAnalyser.connections[0].node, graph.lowShelf);
  assert.equal(graph.processedGain.connections[0].node, graph.masterOutput);
  assert.equal(graph.masterOutput.connections[0].node, graph.frequencyAnalyser);
  assert.equal(graph.frequencyAnalyser.connections[0].node, graph.channelSplitter);
  assert.deepEqual(graph.channelSplitter.connections.map(({ node, output }) => [node, output]), [[graph.leftAnalyser, 0], [graph.rightAnalyser, 1]]);
  assert.deepEqual(graph.channelMerger.connections, [{ node: graph.context.destination, output: 0, input: 0 }]);
  assert.equal(graph.frequencyAnalyser.fftSize, 2_048);
  assert.equal(graph.frequencyAnalyser.smoothingTimeConstant, 0.76);
  assert.equal(graph.eqInputAnalyser.fftSize, 2_048);
  assert.equal(graph.eqInputAnalyser.smoothingTimeConstant, 0.76);
});
