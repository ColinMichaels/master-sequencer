import assert from "node:assert/strict";
import test from "node:test";
import {
  MASTER_METER_FLOOR_DB,
  amplitudeToDecibels,
  calculateSignalLevel,
  meterPosition,
  sampleLogSpectrum,
} from "../src/lib/master-metering.js";

test("digital master metering reports RMS and sample peak in dBFS", () => {
  const cycle = Float32Array.from({ length: 1_024 }, (_, index) => Math.sin((index / 1_024) * Math.PI * 2));
  const level = calculateSignalLevel(cycle);

  assert.ok(Math.abs(level.rmsDb - -3.0103) < 0.01);
  assert.ok(Math.abs(level.peakDb) < 0.001);
  assert.equal(amplitudeToDecibels(0), MASTER_METER_FLOOR_DB);
  assert.equal(meterPosition(-60), 0);
  assert.equal(meterPosition(-18), 0.7);
  assert.equal(meterPosition(0), 1);
});

test("frequency analysis samples logarithmic bands and keeps the strongest FFT bin", () => {
  const sampleRate = 48_000;
  const fftSize = 2_048;
  const magnitudes = new Float32Array(fftSize / 2).fill(-90);
  magnitudes[Math.round(1_000 / (sampleRate / fftSize))] = -4;

  const spectrum = sampleLogSpectrum(magnitudes, sampleRate, fftSize, { bands: 96 });
  const strongest = spectrum.reduce((current, band) => band.decibels > current.decibels ? band : current);

  assert.equal(spectrum.length, 96);
  assert.equal(strongest.decibels, -4);
  assert.ok(strongest.frequency > 900 && strongest.frequency < 1_100);
  assert.ok(spectrum[0].frequency >= 20);
  assert.ok(spectrum.at(-1).frequency <= 20_000);
});
