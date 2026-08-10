import assert from "node:assert/strict";
import test from "node:test";
import { clampWaveformPointCount, createWaveformService, summarizeWaveform } from "../server/waveform.mjs";

test("waveform point requests stay within the safe rendering range", () => {
  assert.equal(clampWaveformPointCount("12"), 240);
  assert.equal(clampWaveformPointCount("720"), 720);
  assert.equal(clampWaveformPointCount("99999"), 1600);
  assert.equal(clampWaveformPointCount("not-a-number"), 900);
});

test("waveform samples become normalized peak buckets", () => {
  const summary = summarizeWaveform(Float32Array.from([
    ...Array(80).fill(-0.5),
    ...Array(80).fill(1),
    ...Array(80).fill(0.75),
  ]), 240);
  assert.equal(summary.sampleCount, 240);
  assert.equal(summary.peak, 1);
  assert.equal(summary.points[0], 0.5);
  assert.equal(summary.points[79], 0.5);
  assert.equal(summary.points[80], 1);
  assert.equal(summary.points[160], 0.75);
  assert.equal(Math.max(...summary.points), 1);
});

test("silent waveform summaries preserve a stable zero line", () => {
  const summary = summarizeWaveform(new Float32Array(0), 240);
  assert.equal(summary.points.length, 240);
  assert.equal(summary.points.every((point) => point === 0), true);
});

test("waveform service caches analysis without exposing source paths", async () => {
  let calls = 0;
  const service = createWaveformService({
    loadWaveform: async () => {
      calls += 1;
      return { points: [0, 1, 0.5], sampleCount: 3, peak: 0.8 };
    },
  });
  const file = { key: "library::song.wav", absolutePath: "/private/music/song.wav", mtimeMs: 10, duration: 12.5 };
  const first = await service.get(file, 240);
  const second = await service.get(file, 240);
  assert.equal(calls, 1);
  assert.deepEqual(second, first);
  assert.equal(first.absolutePath, undefined);
  assert.equal(JSON.stringify(first).includes("/private/music"), false);
});
