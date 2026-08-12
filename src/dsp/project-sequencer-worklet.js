import { SharedDspKernel, SHARED_DSP_PROCESSOR_NAME } from "./shared-dsp-core.js";

const WorkletBase = globalThis.AudioWorkletProcessor || class {
  constructor() {
    this.port = { onmessage: null, postMessage: () => {} };
  }
};

export class ProjectSequencerSharedDspProcessor extends WorkletBase {
  constructor(options = {}) {
    super();
    this.kernel = new SharedDspKernel({
      sampleRate: globalThis.sampleRate || 48_000,
      settings: options.processorOptions?.settings,
    });
    this.meterCountdown = Math.max(128, Math.round((globalThis.sampleRate || 48_000) / 20));
    this.port.onmessage = ({ data }) => {
      if (data?.type === "settings") this.kernel.setSettings(data.settings);
      if (data?.type === "reset") this.kernel.reset();
    };
  }

  process(inputs, outputs) {
    const input = inputs[0] || [];
    const output = outputs[0] || [];
    const frameCount = output[0]?.length || 0;
    const metrics = this.kernel.process(input, output, frameCount);
    this.meterCountdown -= frameCount;
    if (this.meterCountdown <= 0) {
      this.port.postMessage({ type: "meters", metrics: { ...metrics } });
      this.meterCountdown += Math.max(128, Math.round((globalThis.sampleRate || 48_000) / 20));
    }
    return true;
  }
}

if (typeof globalThis.registerProcessor === "function") {
  globalThis.registerProcessor(SHARED_DSP_PROCESSOR_NAME, ProjectSequencerSharedDspProcessor);
}
