import assert from "node:assert/strict";
import test from "node:test";
import { formatDuration, titleFromFilename } from "../src/lib/format.js";

test("duration formatting handles track and album runtimes", () => {
  assert.equal(formatDuration(309.479979), "5:09");
  assert.equal(formatDuration(3909), "1:05:09");
  assert.equal(formatDuration(0), "—:—");
});

test("filename titles remove numbering and simple version suffixes", () => {
  assert.equal(titleFromFilename("01 Return Address (Alt Mix).wav"), "Return Address");
  assert.equal(titleFromFilename("01-funky-space_reggae-vibes.mp3"), "funky space reggae vibes");
});
