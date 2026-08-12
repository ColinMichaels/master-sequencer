import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { SharedDspKernel } from "../../src/dsp/shared-dsp-core.js";

export const loadSharedDspGoldenFixtures = async () => JSON.parse(await readFile(new URL("../fixtures/shared-dsp-golden-v2.json", import.meta.url), "utf8"));

export const generateFixtureInput = (fixture) => {
  const { frames, sampleRate, generator } = fixture;
  const left = new Float32Array(frames);
  const right = new Float32Array(frames);
  if (generator.type === "stereo-impulse") {
    left[0] = generator.left;
    right[0] = generator.right;
  } else if (generator.type === "dual-tone") {
    for (let frame = 0; frame < frames; frame += 1) {
      left[frame] = generator.amplitude * Math.sin((2 * Math.PI * generator.leftHz * frame) / sampleRate);
      right[frame] = generator.amplitude * Math.sin((2 * Math.PI * generator.rightHz * frame) / sampleRate);
    }
  } else if (generator.type === "peak-train") {
    for (let frame = 0; frame < frames; frame += 1) {
      left[frame] = ((frame % 11) - 5) / 5;
      right[frame] = ((frame % 7) - 3) / 3;
    }
  } else if (generator.type === "non-finite") {
    for (let frame = 0; frame < frames; frame += 1) {
      left[frame] = frame === 7 ? Number.NaN : frame === 31 ? Number.POSITIVE_INFINITY : Math.sin(frame / 5) * 0.4;
      right[frame] = frame === 13 ? Number.NEGATIVE_INFINITY : Math.cos(frame / 7) * 0.35;
    }
  } else {
    throw new Error(`Unknown shared DSP fixture generator: ${generator.type}`);
  }
  return [left, right];
};

export const renderFixtureWithKernel = (fixture, inputChannels, blockSize) => {
  const kernel = new SharedDspKernel({ sampleRate: fixture.sampleRate, settings: fixture.settings });
  const outputChannels = inputChannels.map(() => new Float32Array(fixture.frames));
  for (let start = 0; start < fixture.frames; start += blockSize) {
    const end = Math.min(fixture.frames, start + blockSize);
    kernel.process(inputChannels.map((channel) => channel.subarray(start, end)), outputChannels.map((channel) => channel.subarray(start, end)), end - start);
  }
  return outputChannels;
};

export const hashFloatChannels = (channels) => {
  const hash = createHash("sha256");
  const header = Buffer.alloc(8);
  header.writeUInt32LE(channels.length, 0);
  header.writeUInt32LE(channels[0]?.length || 0, 4);
  hash.update(header);
  const sample = Buffer.alloc(4);
  for (const channel of channels) {
    for (const value of channel) {
      sample.writeFloatLE(value, 0);
      hash.update(sample);
    }
  }
  return hash.digest("hex");
};
