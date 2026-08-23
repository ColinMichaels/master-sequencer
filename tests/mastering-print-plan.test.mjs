import assert from "node:assert/strict";
import test from "node:test";
import { ADVANCED_PROCESSOR_TYPES, createAdvancedProcessor, createDefaultAdvancedMastering, createExternalPluginProcessor } from "../src/lib/advanced-mastering.js";
import { assertMasteringPrintPlan, createMasteringPrintPlan } from "../src/lib/mastering-print-plan.js";

test("Basic print plans include track level, enabled effects, output level, and limiter ceiling", () => {
  const plan = createMasteringPrintPlan({
    masteringPath: "basic",
    masterBus: { eq: { enabled: true }, compressor: { enabled: true }, outputGainDb: -2.5, limiter: { enabled: true, ceilingDbfs: -1 } },
  });
  assert.equal(plan.canRender, true);
  assert.equal(plan.pathLabel, "Basic MASTER chain");
  assert.deepEqual(plan.processors.map((processor) => processor.label), ["MASTER EQ", "MASTER Compressor", "MASTER Output -2.5 dB", "MASTER Limiter -1 dBFS"]);
  assert.equal(plan.summary, "Track edits + level → MASTER EQ → MASTER Compressor → MASTER Output -2.5 dB → MASTER Limiter -1 dBFS");
});

test("Premium print plans preserve rack order and expose output and limiter levels", () => {
  const limiter = createAdvancedProcessor(ADVANCED_PROCESSOR_TYPES.limiter, "limiter-first");
  limiter.parameters.ceilingDbfs = -1.2;
  const output = createAdvancedProcessor(ADVANCED_PROCESSOR_TYPES.output, "output-second");
  output.parameters.outputGainDb = -3;
  const plan = createMasteringPrintPlan({ masteringPath: "advanced", advancedMastering: { ...createDefaultAdvancedMastering(), nodes: [limiter, output] } });
  assert.deepEqual(plan.processors.map((processor) => processor.label), ["Precision Limiter -1.2 dBFS", "Master Output -3 dB"]);
  assert.equal(plan.summary, "Track edits + level → Precision Limiter -1.2 dBFS → Master Output -3 dB");
});

test("an active unavailable external processor fails closed instead of disappearing from a print", () => {
  const external = createExternalPluginProcessor({ format: "vst3", pluginId: "com.example.master", name: "Example Master" }, "example-master");
  external.bypass = false;
  const plan = createMasteringPrintPlan({ masteringPath: "advanced", advancedMastering: { nodes: [external] } });
  assert.equal(plan.canRender, false);
  assert.deepEqual(plan.unresolvedProcessors, ["Example Master"]);
  assert.throws(() => assertMasteringPrintPlan(plan), /cannot print: Example Master/i);
});
