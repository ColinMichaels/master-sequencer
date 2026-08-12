import assert from "node:assert/strict";
import test from "node:test";
import {
  ADVANCED_PROCESSOR_CATALOG,
  ADVANCED_PROCESSOR_TYPES,
  MASTERING_PLUGIN_FORMATS,
  activeAdvancedProcessors,
  availablePluginDefinitions,
  createAdvancedProcessor,
  createExternalPluginProcessor,
  normalizeAdvancedMastering,
} from "../src/lib/advanced-mastering.js";

test("the mastering catalog exposes every built-in through one available plug-in boundary", () => {
  assert.equal(ADVANCED_PROCESSOR_CATALOG.length, 11);
  assert.deepEqual(availablePluginDefinitions(), ADVANCED_PROCESSOR_CATALOG);
  for (const definition of ADVANCED_PROCESSOR_CATALOG) {
    assert.equal(definition.pluginFormat, MASTERING_PLUGIN_FORMATS.builtin);
    assert.equal(definition.included, true);
    assert.equal(definition.available, true);
    const node = createAdvancedProcessor(definition.typeId, `test-${definition.shortName.toLowerCase()}`);
    assert.deepEqual(node.pluginRef, { format: "builtin", pluginId: definition.typeId, vendor: "Project Sequencer", included: true });
  }
});

test("unresolved VST3 and Audio Unit instances survive project normalization but cannot execute", () => {
  const external = createExternalPluginProcessor({ format: "vst3", pluginId: "com.example.master", vendor: "Example Audio", name: "Example Master" }, "owned-example");
  const field = createAdvancedProcessor(ADVANCED_PROCESSOR_TYPES.stereoField, "field-1");
  const rack = normalizeAdvancedMastering({ nodes: [external, field] });
  assert.equal(rack.nodes[0].pluginRef.format, "vst3");
  assert.equal(rack.nodes[0].unavailable, true);
  assert.equal(rack.nodes[0].bypass, true);
  assert.deepEqual(activeAdvancedProcessors(rack), ["FIELD"]);
});

test("new spatial and creative controls are bounded during project import", () => {
  const ambience = createAdvancedProcessor(ADVANCED_PROCESSOR_TYPES.ambience, "space-1");
  ambience.parameters.wetPercent = 80;
  ambience.parameters.decaySeconds = 99;
  const phaser = createAdvancedProcessor(ADVANCED_PROCESSOR_TYPES.creativePhaser, "phaser-1");
  phaser.parameters.mix = 1;
  const normalized = normalizeAdvancedMastering({ nodes: [ambience, phaser] });
  assert.equal(normalized.nodes[0].parameters.wetPercent, 5);
  assert.equal(normalized.nodes[0].parameters.decaySeconds, 3);
  assert.equal(normalized.nodes[1].parameters.mix, 0.5);
});
