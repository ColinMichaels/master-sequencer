export const SHARED_DSP_CONTRACT_VERSION = 2;
export const SHARED_DSP_PROCESSOR_NAME = "project-sequencer-shared-dsp-v2";

const MAX_PROCESSING_CHANNELS = 32;

const numberInRange = (value, fallback, minimum, maximum) => {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? Math.min(maximum, Math.max(minimum, numeric)) : fallback;
};

export const decibelsToGain = (decibels) => 10 ** (decibels / 20);

export const normalizeSharedDspSettings = (settings = {}) => ({
  bypass: Boolean(settings.bypass),
  inputGainDb: numberInRange(settings.inputGainDb, 0, -48, 24),
  outputGainDb: numberInRange(settings.outputGainDb, 0, -48, 12),
  ceilingDbfs: numberInRange(settings.ceilingDbfs, -1, -12, 0),
  peakGuardEnabled: settings.peakGuardEnabled !== false,
  smoothingMs: numberInRange(settings.smoothingMs, 12, 0, 250),
  dcBlockEnabled: Boolean(settings.dcBlockEnabled),
  dcBlockFrequencyHz: numberInRange(settings.dcBlockFrequencyHz, 12, 2, 40),
});

export class SharedDspKernel {
  constructor({ sampleRate = 48_000, settings } = {}) {
    this.sampleRate = numberInRange(sampleRate, 48_000, 8_000, 384_000);
    this.settings = normalizeSharedDspSettings(settings);
    this.currentGain = decibelsToGain(this.settings.inputGainDb + this.settings.outputGainDb);
    this.targetGain = this.currentGain;
    this.smoothingCoefficient = 0;
    this.previousDcInput = new Float64Array(MAX_PROCESSING_CHANNELS);
    this.previousDcOutput = new Float64Array(MAX_PROCESSING_CHANNELS);
    this.metrics = { inputPeak: 0, outputPeak: 0, gainReductionDb: 0, processedFrames: 0, recoveredSamples: 0 };
    this.updateDerivedValues();
  }

  updateDerivedValues() {
    this.targetGain = decibelsToGain(this.settings.inputGainDb + this.settings.outputGainDb);
    const smoothingSeconds = this.settings.smoothingMs / 1_000;
    this.smoothingCoefficient = smoothingSeconds > 0
      ? Math.exp(-1 / (this.sampleRate * smoothingSeconds))
      : 0;
    this.ceilingGain = decibelsToGain(this.settings.ceilingDbfs);
    this.dcBlockCoefficient = Math.exp((-2 * Math.PI * this.settings.dcBlockFrequencyHz) / this.sampleRate);
  }

  setSettings(settings) {
    this.settings = normalizeSharedDspSettings({ ...this.settings, ...settings });
    this.updateDerivedValues();
  }

  setSampleRate(sampleRate) {
    const nextSampleRate = numberInRange(sampleRate, 48_000, 8_000, 384_000);
    if (nextSampleRate === this.sampleRate) return;
    this.sampleRate = nextSampleRate;
    this.previousDcInput.fill(0);
    this.previousDcOutput.fill(0);
    this.updateDerivedValues();
  }

  reset() {
    this.currentGain = this.targetGain;
    this.metrics.inputPeak = 0;
    this.metrics.outputPeak = 0;
    this.metrics.gainReductionDb = 0;
    this.metrics.processedFrames = 0;
    this.metrics.recoveredSamples = 0;
    this.previousDcInput.fill(0);
    this.previousDcOutput.fill(0);
  }

  process(inputChannels, outputChannels, frameCount = outputChannels?.[0]?.length || inputChannels?.[0]?.length || 0) {
    let inputPeak = 0;
    let outputPeak = 0;
    let maximumReductionDb = 0;
    const channelCount = outputChannels?.length || 0;
    const bypass = this.settings.bypass;
    const guard = this.settings.peakGuardEnabled;
    const ceiling = this.ceilingGain;
    const coefficient = this.smoothingCoefficient;
    const targetGain = this.targetGain;
    const dcBlock = !bypass && this.settings.dcBlockEnabled;
    const dcCoefficient = this.dcBlockCoefficient;
    let recoveredSamples = 0;

    for (let frame = 0; frame < frameCount; frame += 1) {
      if (!bypass) this.currentGain = targetGain + coefficient * (this.currentGain - targetGain);
      for (let channel = 0; channel < channelCount; channel += 1) {
        const input = inputChannels?.[channel];
        const rawSample = input?.[frame];
        const sample = Number.isFinite(rawSample) ? rawSample : 0;
        if (rawSample !== undefined && !Number.isFinite(rawSample)) recoveredSamples += 1;
        const absoluteInput = Math.abs(sample);
        if (absoluteInput > inputPeak) inputPeak = absoluteInput;

        let processed = bypass ? sample : sample * this.currentGain;
        if (dcBlock && channel < MAX_PROCESSING_CHANNELS) {
          const filtered = processed - this.previousDcInput[channel] + dcCoefficient * this.previousDcOutput[channel];
          this.previousDcInput[channel] = processed;
          this.previousDcOutput[channel] = filtered;
          processed = filtered;
        }
        const beforeGuard = Math.abs(processed);
        if (!bypass && guard && beforeGuard > ceiling) {
          processed = Math.sign(processed) * ceiling;
          const reductionDb = 20 * Math.log10(beforeGuard / ceiling);
          if (reductionDb > maximumReductionDb) maximumReductionDb = reductionDb;
        }
        outputChannels[channel][frame] = processed;
        const absoluteOutput = Math.abs(processed);
        if (absoluteOutput > outputPeak) outputPeak = absoluteOutput;
      }
    }

    this.metrics.inputPeak = inputPeak;
    this.metrics.outputPeak = outputPeak;
    this.metrics.gainReductionDb = maximumReductionDb;
    this.metrics.processedFrames += frameCount;
    this.metrics.recoveredSamples += recoveredSamples;
    return this.metrics;
  }
}
