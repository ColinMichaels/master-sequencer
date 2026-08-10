import assert from "node:assert/strict";
import test from "node:test";
import {
  createMasteringPresetLibrary,
  deleteMasteringPreset,
  loadMasteringPreset,
  masteringPresetLibrary,
  saveMasteringPreset,
} from "../src/lib/mastering-presets.js";
import { normalizeMasterBus } from "../src/lib/mastering.js";

const stateFixture = () => ({
  albums: [{ id: "album", masterBus: normalizeMasterBus() }],
  masteringPresets: createMasteringPresetLibrary(),
});

test("component presets save, overwrite by name, load only their module, and delete", () => {
  const state = stateFixture();
  state.albums[0].masterBus.eq = {
    enabled: true,
    lowShelf: { frequencyHz: 80, gainDb: 2.5 },
    midBand: { frequencyHz: 1_400, gainDb: -1.5, q: 1.4 },
    highShelf: { frequencyHz: 10_000, gainDb: 1 },
  };
  state.albums[0].masterBus.outputGainDb = -2;
  const presetId = saveMasteringPreset(state, "eq", "Warm Focus", state.albums[0].masterBus);

  assert.equal(presetId, "warm-focus");
  assert.equal(state.masteringPresets.eq.length, 1);
  state.albums[0].masterBus.eq.lowShelf.gainDb = 3;
  saveMasteringPreset(state, "eq", "Warm Focus", state.albums[0].masterBus);
  assert.equal(state.masteringPresets.eq.length, 1);
  assert.equal(state.masteringPresets.eq[0].settings.lowShelf.gainDb, 3);

  state.albums[0].masterBus = normalizeMasterBus({ outputGainDb: -7 });
  assert.equal(loadMasteringPreset(state, "album", "eq", presetId), true);
  assert.equal(state.albums[0].masterBus.eq.enabled, true);
  assert.equal(state.albums[0].masterBus.eq.lowShelf.gainDb, 3);
  assert.equal(state.albums[0].masterBus.outputGainDb, -7);
  assert.equal(deleteMasteringPreset(state, "eq", presetId), true);
  assert.deepEqual(state.masteringPresets.eq, []);
});

test("a full MASTER preset recalls bypass and every component together", () => {
  const state = stateFixture();
  const master = normalizeMasterBus({
    bypass: false,
    eq: { enabled: true, lowShelf: { gainDb: 2 } },
    compressor: { enabled: true, thresholdDb: -24, ratio: 3, makeupGainDb: 1.5 },
    outputGainDb: -1.5,
    limiter: { enabled: true, ceilingDbfs: -1.2 },
  });
  const presetId = saveMasteringPreset(state, "master", "Streaming Chain", master);
  state.albums[0].masterBus = normalizeMasterBus({ bypass: true, outputGainDb: 8 });

  assert.equal(loadMasteringPreset(state, "album", "master", presetId), true);
  assert.deepEqual(state.albums[0].masterBus, master);
});

test("every component preset recalls only its own processing stage", () => {
  const source = normalizeMasterBus({
    eq: { enabled: true, lowShelf: { frequencyHz: 90, gainDb: 2 } },
    compressor: { enabled: true, thresholdDb: -26, ratio: 3.5, attackMs: 14, releaseMs: 180 },
    outputGainDb: -1.5,
    limiter: { enabled: true, ceilingDbfs: -1.2, attackMs: 4, releaseMs: 110 },
  });
  const baseline = normalizeMasterBus({ bypass: true, outputGainDb: -6 });

  for (const type of ["eq", "compressor", "output", "limiter"]) {
    const state = stateFixture();
    const presetId = saveMasteringPreset(state, type, `${type} stage`, source);
    state.albums[0].masterBus = structuredClone(baseline);
    assert.equal(loadMasteringPreset(state, "album", type, presetId), true);
    assert.equal(state.albums[0].masterBus.bypass, true);
    assert.deepEqual(state.albums[0].masterBus.eq, type === "eq" ? source.eq : baseline.eq);
    assert.deepEqual(state.albums[0].masterBus.compressor, type === "compressor" ? source.compressor : baseline.compressor);
    assert.equal(state.albums[0].masterBus.outputGainDb, type === "output" ? source.outputGainDb : baseline.outputGainDb);
    assert.deepEqual(state.albums[0].masterBus.limiter, type === "limiter" ? source.limiter : baseline.limiter);
  }
});

test("missing preset libraries remain backward compatible", () => {
  assert.deepEqual(masteringPresetLibrary(undefined), createMasteringPresetLibrary());
  const state = { albums: [{ id: "album", masterBus: normalizeMasterBus() }] };
  assert.equal(saveMasteringPreset(state, "output", "Quiet print", { outputGainDb: -4 }), "quiet-print");
  assert.deepEqual(state.masteringPresets.output[0].settings, { outputGainDb: -4 });
});
