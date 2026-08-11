import assert from "node:assert/strict";
import test from "node:test";
import { FIRST_RUN_GUIDE_STORAGE_KEY, FIRST_RUN_GUIDE_STORAGE_VALUE, hasSeenFirstRunGuide, markFirstRunGuideSeen, shouldShowFirstRunGuide } from "../src/lib/first-run.js";

test("first-run guide appears only with no configured sources and no indexed audio", () => {
  assert.equal(shouldShowFirstRunGuide(), true);
  assert.equal(shouldShowFirstRunGuide({ roots: [], library: [] }), true);
  assert.equal(shouldShowFirstRunGuide({ roots: [{ id: "masters" }], library: [] }), false);
  assert.equal(shouldShowFirstRunGuide({ roots: [], library: [{ key: "masters::song.wav" }] }), false);
});

test("first-run guide visibility is stored once per browser without entering project state", () => {
  const values = new Map();
  const storage = {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, value),
  };

  assert.equal(hasSeenFirstRunGuide(storage), false);
  assert.equal(markFirstRunGuideSeen(storage), true);
  assert.equal(values.get(FIRST_RUN_GUIDE_STORAGE_KEY), FIRST_RUN_GUIDE_STORAGE_VALUE);
  assert.equal(hasSeenFirstRunGuide(storage), true);
});

test("unavailable browser storage fails open so new visitors still receive help", () => {
  const blockedStorage = {
    getItem: () => { throw new Error("blocked"); },
    setItem: () => { throw new Error("blocked"); },
  };

  assert.equal(hasSeenFirstRunGuide(blockedStorage), false);
  assert.equal(markFirstRunGuideSeen(blockedStorage), false);
});
