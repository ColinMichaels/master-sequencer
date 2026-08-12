export const MASTER_METER_FLOOR_DB = -72;
export const MASTER_SPECTRUM_FLOOR_DB = -90;

const clamp = (value, minimum, maximum) => Math.min(maximum, Math.max(minimum, value));

export const amplitudeToDecibels = (amplitude, floor = MASTER_METER_FLOOR_DB) => {
  const absolute = Math.abs(Number(amplitude));
  if (!Number.isFinite(absolute) || absolute <= 0) return floor;
  return clamp(20 * Math.log10(absolute), floor, 6);
};

export const calculateSignalLevel = (samples, floor = MASTER_METER_FLOOR_DB) => {
  if (!samples?.length) return { rmsDb: floor, peakDb: floor };
  let sumSquares = 0;
  let peak = 0;
  for (let index = 0; index < samples.length; index += 1) {
    const sample = Number(samples[index]) || 0;
    sumSquares += sample * sample;
    peak = Math.max(peak, Math.abs(sample));
  }
  return {
    rmsDb: amplitudeToDecibels(Math.sqrt(sumSquares / samples.length), floor),
    peakDb: amplitudeToDecibels(peak, floor),
  };
};

export const calculateStereoCorrelation = (leftSamples, rightSamples) => {
  if (!leftSamples?.length || !rightSamples?.length) return 0;
  const length = Math.min(leftSamples.length, rightSamples.length);
  let leftEnergy = 0;
  let rightEnergy = 0;
  let crossEnergy = 0;
  for (let index = 0; index < length; index += 1) {
    const left = Number(leftSamples[index]) || 0;
    const right = Number(rightSamples[index]) || 0;
    leftEnergy += left * left;
    rightEnergy += right * right;
    crossEnergy += left * right;
  }
  const denominator = Math.sqrt(leftEnergy * rightEnergy);
  if (denominator <= Number.EPSILON) return 0;
  return clamp(crossEnergy / denominator, -1, 1);
};

export const sampleVectorscope = (leftSamples, rightSamples, { points = 96 } = {}) => {
  if (!leftSamples?.length || !rightSamples?.length || points <= 0) return [];
  const length = Math.min(leftSamples.length, rightSamples.length);
  const stride = Math.max(1, Math.floor(length / points));
  const output = [];
  for (let index = 0; index < length && output.length < points; index += stride) {
    const left = clamp(Number(leftSamples[index]) || 0, -1, 1);
    const right = clamp(Number(rightSamples[index]) || 0, -1, 1);
    output.push({
      x: clamp((left - right) * 0.5, -1, 1),
      y: clamp((left + right) * 0.5, -1, 1),
    });
  }
  return output;
};

export const sampleLogSpectrum = (
  magnitudes,
  sampleRate,
  fftSize,
  { bands = 64, minimumHz = 20, maximumHz = 20_000, floor = MASTER_SPECTRUM_FLOOR_DB } = {},
) => {
  if (!magnitudes?.length || !Number.isFinite(sampleRate) || !Number.isFinite(fftSize) || fftSize <= 0 || bands <= 0) return [];
  const nyquist = sampleRate / 2;
  const upperFrequency = Math.min(maximumHz, nyquist);
  const lowerFrequency = Math.min(minimumHz, upperFrequency);
  const binWidth = sampleRate / fftSize;
  const frequencyAt = (position) => lowerFrequency * ((upperFrequency / lowerFrequency) ** position);

  return Array.from({ length: bands }, (_, index) => {
    const position = bands === 1 ? 0.5 : index / (bands - 1);
    const frequency = frequencyAt(position);
    const lowerEdge = frequencyAt(Math.max(0, position - 0.5 / Math.max(1, bands - 1)));
    const upperEdge = frequencyAt(Math.min(1, position + 0.5 / Math.max(1, bands - 1)));
    const firstBin = clamp(Math.floor(lowerEdge / binWidth), 0, magnitudes.length - 1);
    const lastBin = clamp(Math.ceil(upperEdge / binWidth), firstBin, magnitudes.length - 1);
    let decibels = floor;
    for (let bin = firstBin; bin <= lastBin; bin += 1) {
      if (Number.isFinite(magnitudes[bin])) decibels = Math.max(decibels, magnitudes[bin]);
    }
    return { frequency, decibels: clamp(decibels, floor, 0) };
  });
};

export const meterPosition = (decibels, minimum = -60, maximum = 0) => (
  clamp((Number(decibels) - minimum) / (maximum - minimum), 0, 1)
);
