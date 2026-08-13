import assert from "node:assert/strict";
import test from "node:test";
import { SharedDspHostPrototype } from "../server/shared-dsp-host.mjs";
import { SHARED_DSP_CONTRACT_VERSION, SHARED_DSP_PROCESSOR_NAME } from "../src/dsp/shared-dsp-core.js";
import { generateFixtureInput, hashFloatChannels, loadSharedDspGoldenFixtures, renderFixtureWithKernel } from "./helpers/shared-dsp-golden.mjs";

const fixtureSet = await loadSharedDspGoldenFixtures();

test("golden shared DSP fixtures match the versioned core across block sizes", () => {
  assert.equal(fixtureSet.contractVersion, SHARED_DSP_CONTRACT_VERSION);
  for (const fixture of fixtureSet.fixtures) {
    const input = generateFixtureInput(fixture);
    const canonical = renderFixtureWithKernel(fixture, input, fixture.frames);
    assert.equal(hashFloatChannels(canonical), fixture.expectedSha256, fixture.id);
    for (const blockSize of fixtureSet.blockSizes) {
      assert.deepEqual(renderFixtureWithKernel(fixture, input, blockSize), canonical, `${fixture.id} at ${blockSize} frames`);
    }
  }
});

test("Node/offline host is sample-identical to every golden fixture", () => {
  for (const fixture of fixtureSet.fixtures) {
    const input = generateFixtureInput(fixture);
    const host = new SharedDspHostPrototype({ sampleRate: fixture.sampleRate, settings: fixture.settings });
    const result = host.processBlock(input);
    assert.equal(result.contractVersion, fixtureSet.contractVersion);
    assert.equal(hashFloatChannels(result.outputChannels), fixture.expectedSha256, fixture.id);
  }
});

test("AudioWorklet adapter is sample-identical to every golden fixture and block size", async () => {
  let registeredName = "";
  let Processor;
  class FakeAudioWorkletProcessor {
    constructor() {
      this.port = { onmessage: null, postMessage: () => {} };
    }
  }
  globalThis.AudioWorkletProcessor = FakeAudioWorkletProcessor;
  globalThis.registerProcessor = (name, processor) => {
    registeredName = name;
    Processor = processor;
  };
  try {
    for (const fixture of fixtureSet.fixtures) {
      globalThis.sampleRate = fixture.sampleRate;
      await import(new URL(`../src/dsp/project-sequencer-worklet.js?fixture=${fixture.id}`, import.meta.url));
      assert.equal(registeredName, SHARED_DSP_PROCESSOR_NAME);
      for (const blockSize of fixtureSet.blockSizes) {
        const input = generateFixtureInput(fixture);
        const output = input.map(() => new Float32Array(fixture.frames));
        const processor = new Processor({ processorOptions: { settings: fixture.settings } });
        for (let start = 0; start < fixture.frames; start += blockSize) {
          const end = Math.min(fixture.frames, start + blockSize);
          assert.equal(processor.process([input.map((channel) => channel.subarray(start, end))], [output.map((channel) => channel.subarray(start, end))]), true);
        }
        assert.equal(hashFloatChannels(output), fixture.expectedSha256, `${fixture.id} at ${blockSize} frames`);
      }
    }
  } finally {
    delete globalThis.AudioWorkletProcessor;
    delete globalThis.registerProcessor;
    delete globalThis.sampleRate;
  }
});
