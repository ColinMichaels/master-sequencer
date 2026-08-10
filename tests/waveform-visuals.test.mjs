import assert from "node:assert/strict";
import test from "node:test";
import { transitionCurve, waveformPath } from "../src/lib/waveform.js";

test("waveform paths normalize compact peak data into a closed shape", () => {
  const path = waveformPath([0, 0.5, 1, 2, -1]);
  assert.match(path, /^M /);
  assert.match(path, / Z$/);
  assert.doesNotMatch(path, /NaN|Infinity/);
  assert.equal(waveformPath([]), "");
});

test("transition graphics expose the renderer's ending curves", () => {
  assert.equal(transitionCurve("natural").curveLabel, "Full level");
  assert.match(transitionCurve("cut").primaryPath, /V 44/);
  assert.equal(transitionCurve("fade").curveLabel, "Linear fade");
  assert.equal(transitionCurve("crossfade").curveLabel, "Equal-power qsin");
  assert.ok(transitionCurve("crossfade").secondaryPath);
});
