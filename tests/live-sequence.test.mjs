import assert from "node:assert/strict";
import test from "node:test";
import { buildLiveSequenceEntries, liveEnvelopeGainAt, liveTransitionSourceTime } from "../src/lib/live-sequence.js";

const files = new Map([
  ["one", { key: "one", duration: 20 }],
  ["two", { key: "two", duration: 12 }],
]);
const fileForTrack = (track) => files.get(track.id);

test("live sequence entries carry trims, gaps, and playable-track crossfade timing", () => {
  const entries = buildLiveSequenceEntries({
    title: "Timing",
    tracks: [
      { id: "one", title: "One", mastering: { trimStart: 2, trimEnd: 18, fadeIn: 1, endMode: "crossfade", endDuration: 3 } },
      { id: "missing", title: "Missing", mastering: {}, candidates: [] },
      { id: "two", title: "Two", mastering: { trimStart: 1, trimEnd: 10, endMode: "fade", endDuration: 2, gapAfter: 1 } },
    ],
  }, fileForTrack);

  assert.equal(entries.length, 2);
  assert.deepEqual([entries[0].startAt, entries[0].endAt, entries[0].overlap], [2, 18, 3]);
  assert.equal(entries[0].nextTrackTitle, "Two");
  assert.equal(liveTransitionSourceTime(entries[0]), 15);
  assert.equal(entries[1].settings.gapAfter, 1);
});

test("live envelopes combine opening fades, closing fades, and incoming crossfades", () => {
  const settings = { trimStart: 2, trimEnd: 12, duration: 10, fadeIn: 2, endMode: "fade", endDuration: 2, gapAfter: 0, gainDb: 0 };
  assert.equal(liveEnvelopeGainAt(settings, 2), 0);
  assert.ok(liveEnvelopeGainAt(settings, 3) > 0.7 && liveEnvelopeGainAt(settings, 3) < 0.71);
  assert.equal(liveEnvelopeGainAt(settings, 5), 1);
  assert.ok(liveEnvelopeGainAt(settings, 11) > 0.7 && liveEnvelopeGainAt(settings, 11) < 0.71);
  assert.ok(liveEnvelopeGainAt(settings, 2.5, { crossfadeStart: 2, crossfadeDuration: 2 }) < liveEnvelopeGainAt(settings, 2.5));
  assert.ok(liveEnvelopeGainAt(settings, 12) < 0.000001);
});
