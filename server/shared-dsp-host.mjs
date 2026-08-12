import { SharedDspKernel, SHARED_DSP_CONTRACT_VERSION, normalizeSharedDspSettings } from "../src/dsp/shared-dsp-core.js";

export class SharedDspHostPrototype {
  constructor(options = {}) {
    this.contractVersion = SHARED_DSP_CONTRACT_VERSION;
    this.kernel = new SharedDspKernel(options);
  }

  configure(settings) {
    this.kernel.setSettings(normalizeSharedDspSettings(settings));
  }

  processBlock(inputChannels) {
    const outputChannels = inputChannels.map((channel) => new Float32Array(channel.length));
    const metrics = this.kernel.process(inputChannels, outputChannels, outputChannels[0]?.length || 0);
    return { outputChannels, metrics: { ...metrics }, contractVersion: this.contractVersion };
  }
}
