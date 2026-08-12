import assert from "node:assert/strict";
import test from "node:test";
import { buildAdvancedMasteringFilters, buildMasterBusFilters, buildPreviewEntries, buildRenderGraph } from "../server/audio-renderer.mjs";
import { calculateProgramTimeline, normalizeMasterBus, normalizeMastering, programDuration } from "../src/lib/mastering.js";
import { ADVANCED_PROCESSOR_TYPES, createAdvancedProcessor, createDefaultAdvancedMastering, normalizeAdvancedMastering } from "../src/lib/advanced-mastering.js";

test("mastering settings clamp trims and ending lengths to the source", () => {
  const settings = normalizeMastering({ trimStart: 8, trimEnd: 6, fadeIn: 99, endMode: "fade", endDuration: 99, gapAfter: 2 }, 10);
  assert.equal(settings.trimStart, 8);
  assert.equal(settings.trimEnd, 8.1);
  assert.ok(settings.fadeIn <= settings.duration);
  assert.ok(settings.endDuration <= settings.duration);
  assert.equal(settings.gapAfter, 2);
  assert.equal(settings.gainDb, 0);
});

test("track gain remains neutral by default and clamps to the supported range", () => {
  assert.equal(normalizeMastering({ gainDb: -6 }, 10).gainDb, -6);
  assert.equal(normalizeMastering({ gainDb: -99 }, 10).gainDb, -24);
  assert.equal(normalizeMastering({ gainDb: 99 }, 10).gainDb, 12);
});

test("MASTER bus normalization creates fresh neutral settings and bounds imported values", () => {
  const neutral = normalizeMasterBus();
  const anotherNeutral = normalizeMasterBus();
  assert.deepEqual(neutral, {
    bypass: false,
    eq: {
      enabled: false,
      lowShelf: { frequencyHz: 120, gainDb: 0 },
      midBand: { frequencyHz: 1000, gainDb: 0, q: 1 },
      highShelf: { frequencyHz: 8000, gainDb: 0 },
    },
    compressor: {
      enabled: false,
      thresholdDb: -18,
      ratio: 2,
      attackMs: 30,
      releaseMs: 250,
      knee: 2.82843,
      makeupGainDb: 0,
      mix: 1,
      link: "maximum",
      detection: "rms",
    },
    outputGainDb: 0,
    limiter: { enabled: false, ceilingDbfs: -1, attackMs: 5, releaseMs: 50 },
  });
  assert.notEqual(neutral.eq, anotherNeutral.eq);

  const bounded = normalizeMasterBus({
    bypass: "yes",
    eq: { enabled: true, lowShelf: { frequencyHz: 1, gainDb: 99 }, midBand: { q: 0 }, highShelf: { frequencyHz: 99_000 } },
    compressor: { thresholdDb: -99, ratio: 99, link: "independent", detection: "magic" },
    outputGainDb: 99,
    limiter: { ceilingDbfs: -99 },
  });
  assert.equal(bounded.bypass, false);
  assert.equal(bounded.eq.enabled, true);
  assert.deepEqual(bounded.eq.lowShelf, { frequencyHz: 20, gainDb: 12 });
  assert.equal(bounded.eq.midBand.q, 0.1);
  assert.equal(bounded.eq.highShelf.frequencyHz, 20_000);
  assert.equal(bounded.compressor.thresholdDb, -60);
  assert.equal(bounded.compressor.ratio, 20);
  assert.equal(bounded.compressor.link, "maximum");
  assert.equal(bounded.compressor.detection, "rms");
  assert.equal(bounded.outputGainDb, 12);
  assert.equal(bounded.limiter.ceilingDbfs, -9);
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
  assert.match(graph.filterComplex, /acrossfade=d=3:c1=qsin:c2=qsin/);
  assert.match(graph.filterComplex, /afade=t=out/);
  assert.match(graph.filterComplex, /anullsrc=.*duration=1/);
  assert.equal(graph.outputLabel, "joined1");
});

test("track gain is applied to each segment before tracks enter a transition", () => {
  const graph = buildRenderGraph([
    { sourceDuration: 10, mastering: { gainDb: -6, endMode: "crossfade", endDuration: 2 } },
    { sourceDuration: 10, mastering: { gainDb: 3 } },
  ]);
  assert.match(graph.filterComplex, /\[0:a\][^;]*volume=-6dB\[t0\]/);
  assert.match(graph.filterComplex, /\[1:a\][^;]*volume=3dB\[t1\]/);
  assert.ok(graph.filterComplex.indexOf("volume=-6dB") < graph.filterComplex.indexOf("acrossfade"));
  assert.ok(graph.filterComplex.indexOf("volume=3dB") < graph.filterComplex.indexOf("acrossfade"));
});

test("MASTER processing follows the assembled program in EQ, compressor, output, limiter order", () => {
  const graph = buildRenderGraph([
    { sourceDuration: 10, mastering: { endMode: "crossfade", endDuration: 2 } },
    { sourceDuration: 10, mastering: {} },
  ], {
    masterBus: {
      eq: {
        enabled: true,
        lowShelf: { frequencyHz: 100, gainDb: 1.5 },
        midBand: { frequencyHz: 1200, gainDb: -2, q: 1.25 },
        highShelf: { frequencyHz: 9000, gainDb: 0.75 },
      },
      compressor: {
        enabled: true,
        thresholdDb: -18,
        ratio: 3,
        attackMs: 20,
        releaseMs: 180,
        knee: 3,
        makeupGainDb: 2,
        mix: 0.8,
        link: "maximum",
        detection: "rms",
      },
      outputGainDb: -1.5,
      limiter: { enabled: true, ceilingDbfs: -1, attackMs: 5, releaseMs: 50 },
    },
  });
  assert.equal(graph.outputLabel, "mastered");
  assert.match(graph.filterComplex, /\[joined0\]lowshelf=f=100:g=1\.5:p=2,equalizer=f=1200:t=q:w=1\.25:g=-2,highshelf=f=9000:g=0\.75:p=2,acompressor=threshold=0\.125893:ratio=3:attack=20:release=180:knee=3:makeup=1\.258925:mix=0\.8:link=maximum:detection=rms,volume=-1\.5dB,alimiter=limit=0\.891251:attack=5:release=50:level=false:latency=true\[mastered\]/);
  assert.ok(graph.filterComplex.indexOf("acrossfade") < graph.filterComplex.indexOf("lowshelf"));
});

test("neutral and bypassed MASTER buses remain literal render no-ops", () => {
  assert.deepEqual(buildMasterBusFilters().filters, []);
  const bypassed = buildMasterBusFilters({
    bypass: true,
    eq: { enabled: true, lowShelf: { gainDb: 6 } },
    compressor: { enabled: true },
    outputGainDb: 4,
    limiter: { enabled: true },
  });
  assert.deepEqual(bypassed.filters, []);
  const graph = buildRenderGraph([{ sourceDuration: 10, mastering: {} }], { masterBus: { bypass: true, outputGainDb: 6 } });
  assert.equal(graph.outputLabel, "t0");
  assert.doesNotMatch(graph.filterComplex, /mastered|acompressor|alimiter|lowshelf|highshelf|equalizer/);
});

test("Premium rack filters follow the movable patch order and support repeated equipment", () => {
  const firstEq = createAdvancedProcessor(ADVANCED_PROCESSOR_TYPES.eq, "eq-1");
  firstEq.parameters.lowShelf.gainDb = 2;
  firstEq.parameters.lowMidBand.gainDb = -1.5;
  firstEq.parameters.highMidBand.gainDb = 1.25;
  firstEq.parameters.outputGainDb = -0.5;
  const limiter = createAdvancedProcessor(ADVANCED_PROCESSOR_TYPES.limiter, "limit-1");
  limiter.parameters.ceilingDbfs = -1.2;
  limiter.parameters.oversample = 4;
  const secondEq = createAdvancedProcessor(ADVANCED_PROCESSOR_TYPES.eq, "eq-2");
  secondEq.parameters.highShelf.gainDb = -1;
  const rack = { ...createDefaultAdvancedMastering(), nodes: [limiter, firstEq, secondEq] };
  const processed = buildAdvancedMasteringFilters(rack);
  assert.deepEqual(processed.settings.nodes.map((node) => node.id), ["limit-1", "eq-1", "eq-2"]);
  assert.match(processed.filters.join(","), /^aresample=192000,alimiter=.*aresample=48000,lowshelf=f=120:g=2:p=2,equalizer=f=400:t=q:w=1:g=-1\.5,equalizer=f=1600:t=q:w=1:g=1\.25,volume=-0\.5dB,highshelf=f=8000:g=-1:p=2$/);

  const graph = buildRenderGraph([{ sourceDuration: 10, mastering: {} }], { masteringPath: "advanced", advancedMastering: rack });
  assert.equal(graph.masteringPath, "advanced");
  assert.equal(graph.outputLabel, "mastered");
  assert.ok(graph.filterComplex.indexOf("alimiter") < graph.filterComplex.indexOf("lowshelf"));
  assert.ok(graph.filterComplex.indexOf("lowshelf") < graph.filterComplex.indexOf("highshelf"));
});

test("Premium sidechain and stereo-link controls produce real print filters", () => {
  const compressor = createAdvancedProcessor(ADVANCED_PROCESSOR_TYPES.compressor, "compressor-1");
  compressor.parameters.sidechainEnabled = true;
  compressor.parameters.sidechainFilterHz = 180;
  const limiter = createAdvancedProcessor(ADVANCED_PROCESSOR_TYPES.limiter, "limiter-1");
  limiter.parameters.oversample = 2;
  limiter.parameters.stereoLinkPercent = 40;
  const processed = buildAdvancedMasteringFilters({ ...createDefaultAdvancedMastering(), nodes: [compressor, limiter] });

  assert.match(processed.filters.join(","), /asplit=2\[plugin_0_program\]\[plugin_0_detector\].*highpass=f=180:p=2.*sidechaincompress=threshold=/);
  assert.match(processed.filters.join(","), /asplit=2\[plugin_1_linked_in\]\[plugin_1_independent_in\].*channelsplit=channel_layout=stereo.*amix=inputs=2:normalize=0/);
});

test("repeated independent limiter instances receive collision-free FFmpeg labels", () => {
  const first = createAdvancedProcessor(ADVANCED_PROCESSOR_TYPES.limiter, "limiter-first");
  const second = createAdvancedProcessor(ADVANCED_PROCESSOR_TYPES.limiter, "limiter-second");
  first.parameters.stereoLinkPercent = 25;
  second.parameters.stereoLinkPercent = 75;
  const graph = buildRenderGraph([{ sourceDuration: 1, mastering: {} }], { masteringPath: "advanced", advancedMastering: { ...createDefaultAdvancedMastering(), nodes: [first, second] } });
  assert.match(graph.filterComplex, /plugin_0_linked_in/);
  assert.match(graph.filterComplex, /plugin_1_linked_in/);
  assert.doesNotMatch(graph.filterComplex, /\[linked_in\]|\[left_limited\]/);
});

test("legacy Premium controls gain complete faceplate parameters without losing the existing mid-band setting", () => {
  const legacyEq = createAdvancedProcessor(ADVANCED_PROCESSOR_TYPES.eq, "legacy-eq");
  legacyEq.parameters = {
    enabled: true,
    lowShelf: { frequencyHz: 120, gainDb: 1 },
    midBand: { frequencyHz: 9_400, gainDb: -2, q: 1.4 },
    highShelf: { frequencyHz: 8_000, gainDb: 0.5 },
  };
  const legacyLimiter = createAdvancedProcessor(ADVANCED_PROCESSOR_TYPES.limiter, "legacy-limiter");
  legacyLimiter.parameters = { enabled: true, ceilingDbfs: -1, attackMs: 5, releaseMs: 50, oversample: 1 };
  const normalized = normalizeAdvancedMastering({ nodes: [legacyEq, legacyLimiter] });

  assert.deepEqual(normalized.nodes[0].parameters.lowMidBand, { frequencyHz: 400, gainDb: 0, q: 1 });
  assert.deepEqual(normalized.nodes[0].parameters.highMidBand, { frequencyHz: 9_400, gainDb: -2, q: 1.4 });
  assert.equal(normalized.nodes[0].parameters.outputGainDb, 0);
  assert.equal(normalized.nodes[1].parameters.oversample, 1);
  assert.equal(normalized.nodes[1].parameters.stereoLinkPercent, 100);
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
