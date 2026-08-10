import assert from "node:assert/strict";
import test from "node:test";
import { shouldShowFirstRunGuide } from "../src/lib/first-run.js";

test("first-run guide appears only with no configured sources and no indexed audio", () => {
  assert.equal(shouldShowFirstRunGuide(), true);
  assert.equal(shouldShowFirstRunGuide({ roots: [], library: [] }), true);
  assert.equal(shouldShowFirstRunGuide({ roots: [{ id: "masters" }], library: [] }), false);
  assert.equal(shouldShowFirstRunGuide({ roots: [], library: [{ key: "masters::song.wav" }] }), false);
});
