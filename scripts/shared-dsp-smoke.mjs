import { SharedDspHostPrototype } from "../server/shared-dsp-host.mjs";

const sampleRate = 48_000;
const length = 4_800;
const left = new Float32Array(length);
const right = new Float32Array(length);
for (let index = 0; index < length; index += 1) {
  left[index] = 0.7 * Math.sin((2 * Math.PI * 997 * index) / sampleRate);
  right[index] = 0.7 * Math.sin((2 * Math.PI * 503 * index) / sampleRate);
}

const host = new SharedDspHostPrototype({
  sampleRate,
  settings: { inputGainDb: 6, ceilingDbfs: -1, peakGuardEnabled: true, smoothingMs: 0 },
});
const result = host.processBlock([left, right]);
process.stdout.write(`${JSON.stringify({
  contractVersion: result.contractVersion,
  channels: result.outputChannels.length,
  frames: result.outputChannels[0].length,
  metrics: result.metrics,
}, null, 2)}\n`);
