import assert from "node:assert/strict";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { createTechnicalAnalysisService, parseTechnicalAnalysis } from "../server/technical-analysis.mjs";
import { generateSineWave } from "./helpers/audio-fixtures.mjs";

test("technical analysis parsing returns compact mastering measurements", () => {
  const output = `I: -14.2 LUFS\nLRA: 4.1 LU\nPeak: -1.2 dBFS\nDC offset: 0.000120\nsilence_start: 0\nsilence_end: 0.42`;
  assert.deepEqual(parseTechnicalAnalysis(output), {
    integratedLoudness: -14.2,
    loudnessRange: 4.1,
    truePeak: -1.2,
    dcOffset: 0.00012,
    silenceBoundaries: [{ start: 0, end: 0.42 }],
  });
});

test("technical analysis reads an indexed fixture and caches only rebuildable measurements", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "project-sequencer-analysis-"));
  const sourcePath = path.join(root, "tone.wav");
  await generateSineWave(sourcePath, { duration: 0.6, frequency: 440 });
  const file = { key: "fixture::tone.wav", absolutePath: sourcePath, size: 100, mtimeMs: 1 };
  const service = createTechnicalAnalysisService();
  const first = await service.get(file);
  const second = await service.get(file);
  assert.equal(Number.isFinite(first.measurements.integratedLoudness), true);
  assert.equal(Number.isFinite(first.measurements.truePeak), true);
  assert.equal(Number.isFinite(first.measurements.dcOffset), true);
  assert.equal(second.cached, true);
  assert.equal("absolutePath" in second, false);
});
