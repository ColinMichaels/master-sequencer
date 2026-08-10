import assert from "node:assert/strict";
import test from "node:test";
import { buildPreviewEntries, buildRenderGraph } from "../server/audio-renderer.mjs";
import { calculateProgramTimeline, normalizeMastering, programDuration } from "../src/lib/mastering.js";

test("mastering settings clamp trims and ending lengths to the source", () => {
  const settings = normalizeMastering({ trimStart: 8, trimEnd: 6, fadeIn: 99, endMode: "fade", endDuration: 99, gapAfter: 2 }, 10);
  assert.equal(settings.trimStart, 8);
  assert.equal(settings.trimEnd, 8.1);
  assert.ok(settings.fadeIn <= settings.duration);
  assert.ok(settings.endDuration <= settings.duration);
  assert.equal(settings.gapAfter, 2);
});

test("a final crossfade becomes a fade instead of referencing a missing next track", () => {
  const settings = normalizeMastering({ endMode: "crossfade", endDuration: 4 }, 30, { hasNext: false });
  assert.equal(settings.endMode, "fade");
  assert.equal(settings.endDuration, 4);
});

test("program timeline accounts for crossfade overlap and deliberate gaps", () => {
  const entries = [
    { id: "one", sourceDuration: 20, mastering: { endMode: "crossfade", endDuration: 4 } },
    { id: "two", sourceDuration: 10, mastering: { endMode: "natural", gapAfter: 2 } },
    { id: "three", sourceDuration: 8, mastering: {} },
  ];
  const timeline = calculateProgramTimeline(entries);
  assert.equal(timeline[0].outputStart, 0);
  assert.equal(timeline[1].outputStart, 16);
  assert.equal(timeline[2].outputStart, 28);
  assert.equal(programDuration(entries), 36);
});

test("FFmpeg graph builds trims, fades, crossfades, gaps, and one final output", () => {
  const entries = [
    { sourceDuration: 20, mastering: { trimStart: 1, trimEnd: 19, fadeIn: 0.5, endMode: "crossfade", endDuration: 3 } },
    { sourceDuration: 12, mastering: { endMode: "fade", endDuration: 2, gapAfter: 1 } },
    { sourceDuration: 8, mastering: { endMode: "cut" } },
  ];
  const graph = buildRenderGraph(entries);
  assert.match(graph.filterComplex, /atrim=start=1:end=19/);
  assert.match(graph.filterComplex, /afade=t=in/);
  assert.match(graph.filterComplex, /acrossfade=d=3/);
  assert.match(graph.filterComplex, /afade=t=out/);
  assert.match(graph.filterComplex, /anullsrc=.*duration=1/);
  assert.equal(graph.outputLabel, "joined1");
});

test("transition previews keep the edited tail and play through the complete next track", () => {
  const entries = [
    { track: { title: "One" }, sourceDuration: 100, mastering: { trimStart: 2, trimEnd: 90, endMode: "crossfade", endDuration: 4 } },
    { track: { title: "Two" }, sourceDuration: 60, mastering: { trimStart: 3, trimEnd: 55, fadeIn: 1, endMode: "natural" } },
  ];
  const preview = buildPreviewEntries(entries, 0, "transition");
  assert.equal(preview.length, 2);
  assert.equal(preview[0].mastering.trimStart, 75);
  assert.equal(preview[0].mastering.trimEnd, 90);
  assert.equal(preview[0].mastering.fadeIn, 0);
  assert.equal(preview[1], entries[1]);
  const graph = buildRenderGraph(preview);
  assert.match(graph.filterComplex, /atrim=start=75:end=90/);
  assert.match(graph.filterComplex, /atrim=start=3:end=55/);
  assert.match(graph.filterComplex, /acrossfade=d=4/);
});

test("transition previews require a playable next track", () => {
  const entries = [{ track: { title: "Final" }, sourceDuration: 30, mastering: {} }];
  assert.throws(() => buildPreviewEntries(entries, 0, "transition"), /playable next track/i);
});
