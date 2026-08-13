import assert from "node:assert/strict";
import test from "node:test";
import { SharedDspHostPrototype } from "../server/shared-dsp-host.mjs";
import { SharedDspKernel, decibelsToGain, normalizeSharedDspSettings } from "../src/dsp/shared-dsp-core.js";
import { createSharedDspPrototypeNode, sharedDspSettingsFromMasterBus } from "../src/lib/shared-dsp-prototype.js";
import { SHARED_DSP_LAB_STORAGE_KEY, setSharedDspLabOptIn, sharedDspLabEnabled } from "../src/lib/shared-dsp-lab.js";

const processInChunks = (samples, chunkSize, settings) => {
  const kernel = new SharedDspKernel({ sampleRate: 48_000, settings });
  const result = new Float32Array(samples.length);
  for (let start = 0; start < samples.length; start += chunkSize) {
    const input = samples.subarray(start, Math.min(samples.length, start + chunkSize));
    const output = result.subarray(start, start + input.length);
    kernel.process([input], [output], input.length);
  }
  return result;
};

test("shared DSP settings are bounded at the contract boundary", () => {
  assert.deepEqual(normalizeSharedDspSettings({ inputGainDb: 200, outputGainDb: -100, ceilingDbfs: 4, smoothingMs: 900 }), {
    bypass: false,
    inputGainDb: 24,
    outputGainDb: -48,
    ceilingDbfs: 0,
    peakGuardEnabled: true,
    smoothingMs: 250,
    dcBlockEnabled: false,
    dcBlockFrequencyHz: 12,
  });
});

test("current MASTER settings map into the prototype without becoming render authority", () => {
  assert.deepEqual(sharedDspSettingsFromMasterBus({
    trackGainDb: 2,
    masterBus: {
      enabled: true,
      output: { gainDb: -1.5 },
      limiter: { enabled: true, ceilingDbfs: -0.8 },
    },
  }), {
    bypass: false,
    inputGainDb: 2,
    outputGainDb: -1.5,
    ceilingDbfs: -0.8,
    peakGuardEnabled: true,
    smoothingMs: 12,
    dcBlockEnabled: false,
    dcBlockFrequencyHz: 12,
  });
});

test("bypass copies samples exactly", () => {
  const input = Float32Array.from([-1, -0.25, 0, 0.5, 1]);
  const output = new Float32Array(input.length);
  const kernel = new SharedDspKernel({ settings: { bypass: true, inputGainDb: 12 } });
  kernel.process([input], [output]);
  assert.deepEqual(output, input);
});

test("processing is deterministic across render block sizes", () => {
  const input = Float32Array.from({ length: 2_048 }, (_, index) => Math.sin(index / 17) * 0.25);
  const settings = { inputGainDb: 3.5, outputGainDb: -0.5, peakGuardEnabled: false, smoothingMs: 17 };
  assert.deepEqual(processInChunks(input, 128, settings), processInChunks(input, 511, settings));
});

test("running gain changes approach their target instead of stepping", () => {
  const kernel = new SharedDspKernel({ sampleRate: 48_000, settings: { peakGuardEnabled: false } });
  kernel.setSettings({ outputGainDb: 6, smoothingMs: 20 });
  const input = Float32Array.from({ length: 2_048 }, () => 0.25);
  const output = new Float32Array(input.length);
  kernel.process([input], [output]);
  assert.ok(output[0] > 0.25);
  assert.ok(output[0] < output.at(-1));
  assert.ok(output.at(-1) < 0.25 * decibelsToGain(6));
});

test("prototype peak guard observes its sample ceiling", () => {
  const input = Float32Array.from([0.9, -0.9]);
  const output = new Float32Array(input.length);
  const kernel = new SharedDspKernel({ settings: { inputGainDb: 12, ceilingDbfs: -1, smoothingMs: 0 } });
  const metrics = kernel.process([input], [output]);
  const ceiling = decibelsToGain(-1);
  assert.ok(Math.abs(output[0]) <= ceiling);
  assert.ok(Math.abs(output[1]) <= ceiling);
  assert.ok(metrics.gainReductionDb > 0);
});

test("Node host uses the same contract and stereo kernel", () => {
  const host = new SharedDspHostPrototype({ settings: { outputGainDb: -6, peakGuardEnabled: false, smoothingMs: 0 } });
  const result = host.processBlock([Float32Array.from([1, 0.5]), Float32Array.from([-1, -0.5])]);
  assert.equal(result.contractVersion, 2);
  assert.equal(result.outputChannels.length, 2);
  assert.ok(Math.abs(result.outputChannels[0][0] - decibelsToGain(-6)) < 1e-6);
  assert.equal(result.outputChannels[1][0], -result.outputChannels[0][0]);
});

test("AudioWorklet adapter registers and processes through the shared kernel", async () => {
  let registeredName = "";
  let registeredProcessor = null;
  class FakeAudioWorkletProcessor {
    constructor() {
      this.port = { onmessage: null, postMessage: () => {} };
    }
  }
  globalThis.AudioWorkletProcessor = FakeAudioWorkletProcessor;
  globalThis.sampleRate = 48_000;
  globalThis.registerProcessor = (name, processor) => {
    registeredName = name;
    registeredProcessor = processor;
  };
  try {
    const workletUrl = new URL(`../src/dsp/project-sequencer-worklet.js?test=${Date.now()}`, import.meta.url);
    const { ProjectSequencerSharedDspProcessor } = await import(workletUrl);
    assert.equal(registeredName, "project-sequencer-shared-dsp-v2");
    assert.equal(registeredProcessor, ProjectSequencerSharedDspProcessor);
    const processor = new ProjectSequencerSharedDspProcessor({
      processorOptions: { settings: { outputGainDb: -6, peakGuardEnabled: false, smoothingMs: 0 } },
    });
    const input = Float32Array.from([1, 0.5, -1, -0.5]);
    const output = new Float32Array(input.length);
    assert.equal(processor.process([[input]], [[output]]), true);
    assert.ok(Math.abs(output[0] - decibelsToGain(-6)) < 1e-6);
    assert.equal(output[2], -output[0]);
  } finally {
    delete globalThis.AudioWorkletProcessor;
    delete globalThis.sampleRate;
    delete globalThis.registerProcessor;
  }
});

test("DC blocker removes steady offset without allocating per processing block", () => {
  const input = Float32Array.from({ length: 8_000 }, () => 0.25);
  const output = new Float32Array(input.length);
  const kernel = new SharedDspKernel({ sampleRate: 48_000, settings: { dcBlockEnabled: true, dcBlockFrequencyHz: 20, peakGuardEnabled: false, smoothingMs: 0 } });
  kernel.process([input], [output]);
  assert.equal(output[0], 0.25);
  assert.ok(Math.abs(output.at(-1)) < 0.00001);
});

test("sample-rate changes reset DC history and update the processing contract", () => {
  const kernel = new SharedDspKernel({ sampleRate: 44_100, settings: { dcBlockEnabled: true, peakGuardEnabled: false } });
  const output = new Float32Array(4);
  kernel.process([Float32Array.from([1, 0, 0, 0])], [output]);
  kernel.setSampleRate(96_000);
  const afterChange = new Float32Array(1);
  kernel.process([Float32Array.from([0])], [afterChange]);
  assert.equal(afterChange[0], 0);
  assert.equal(kernel.sampleRate, 96_000);
});

test("non-finite input is silenced and counted without contaminating output", () => {
  const input = Float32Array.from([0.25, Number.NaN, Number.POSITIVE_INFINITY, -0.25]);
  const output = new Float32Array(input.length);
  const kernel = new SharedDspKernel({ settings: { peakGuardEnabled: false, smoothingMs: 0 } });
  const metrics = kernel.process([input], [output]);
  assert.deepEqual(output, Float32Array.from([0.25, 0, 0, -0.25]));
  assert.equal(metrics.recoveredSamples, 2);
});

test("shared DSP browser creation requires build permission and a device-local opt-in", async () => {
  const values = new Map();
  const storage = {
    getItem: (key) => values.get(key) || null,
    setItem: (key, value) => values.set(key, value),
    removeItem: (key) => values.delete(key),
  };
  assert.equal(sharedDspLabEnabled({ environment: {}, storage }), false);
  assert.equal(sharedDspLabEnabled({ environment: { VITE_SHARED_DSP_LAB: "true" }, storage }), false);
  assert.equal(setSharedDspLabOptIn(true, { storage }), true);
  assert.equal(values.get(SHARED_DSP_LAB_STORAGE_KEY), "enabled");
  assert.equal(sharedDspLabEnabled({ environment: { VITE_SHARED_DSP_LAB: "true" }, storage }), true);
  await assert.rejects(createSharedDspPrototypeNode({}, {}, { labEnabled: false }), /disabled/);
});
