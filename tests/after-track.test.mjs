import assert from "node:assert/strict";
import test from "node:test";
import {
  AFTER_TRACK_MODES,
  AFTER_TRACK_STORAGE_KEY,
  normalizeAfterTrackMode,
  readAfterTrackMode,
  writeAfterTrackMode,
} from "../src/lib/after-track.js";

test("after-track mode defaults to seamless auto-next and rejects unknown values", () => {
  assert.equal(normalizeAfterTrackMode(), AFTER_TRACK_MODES.AUTO_NEXT);
  assert.equal(normalizeAfterTrackMode("unknown"), AFTER_TRACK_MODES.AUTO_NEXT);
  assert.equal(normalizeAfterTrackMode(AFTER_TRACK_MODES.CUE_NEXT), AFTER_TRACK_MODES.CUE_NEXT);
  assert.equal(normalizeAfterTrackMode(AFTER_TRACK_MODES.RESET_CURRENT), AFTER_TRACK_MODES.RESET_CURRENT);
  assert.equal(normalizeAfterTrackMode(AFTER_TRACK_MODES.LOOP_CURRENT), AFTER_TRACK_MODES.LOOP_CURRENT);
});

test("after-track preference persists outside project sequencing state", () => {
  const values = new Map();
  const storage = {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, value),
  };

  assert.equal(readAfterTrackMode(storage), AFTER_TRACK_MODES.AUTO_NEXT);
  assert.equal(writeAfterTrackMode(AFTER_TRACK_MODES.CUE_NEXT, storage), AFTER_TRACK_MODES.CUE_NEXT);
  assert.equal(values.get(AFTER_TRACK_STORAGE_KEY), AFTER_TRACK_MODES.CUE_NEXT);
  assert.equal(readAfterTrackMode(storage), AFTER_TRACK_MODES.CUE_NEXT);
});

test("blocked after-track storage falls back without interrupting playback", () => {
  const blockedStorage = {
    getItem: () => { throw new Error("blocked"); },
    setItem: () => { throw new Error("blocked"); },
  };

  assert.equal(readAfterTrackMode(blockedStorage), AFTER_TRACK_MODES.AUTO_NEXT);
  assert.equal(writeAfterTrackMode(AFTER_TRACK_MODES.LOOP_CURRENT, blockedStorage), AFTER_TRACK_MODES.LOOP_CURRENT);
});
