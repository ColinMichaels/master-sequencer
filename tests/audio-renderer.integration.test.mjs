import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdtemp, readdir, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { renderAudio } from "../server/audio-renderer.mjs";
import { generateSineWave, measurePeakDb, probeAudio } from "./helpers/audio-fixtures.mjs";
import { ADVANCED_PROCESSOR_TYPES, createAdvancedProcessor, createDefaultAdvancedMastering } from "../src/lib/advanced-mastering.js";

const checksum = async (filePath) => createHash("sha256").update(await readFile(filePath)).digest("hex");

test("a generated short FFmpeg print preserves sources and keeps audio, cue, and manifest consistent", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "project-sequencer-ffmpeg-"));
  const sourceRoot = path.join(root, "sources");
  const firstPath = path.join(root, "first.wav");
  const secondPath = path.join(root, "second.wav");
  await generateSineWave(firstPath, { duration: 0.8, frequency: 330 });
  await generateSineWave(secondPath, { duration: 0.7, frequency: 550 });
  const before = await Promise.all([checksum(firstPath), checksum(secondPath)]);
  const files = new Map([
    ["fixture::first.wav", { key: "fixture::first.wav", absolutePath: firstPath, duration: 0.8 }],
    ["fixture::second.wav", { key: "fixture::second.wav", absolutePath: secondPath, duration: 0.7 }],
  ]);
  const album = {
    id: "fixture-album",
    artist: "Fixture Artist",
    title: "Fixture Album",
    masterBus: {
      eq: {
        enabled: true,
        lowShelf: { frequencyHz: 120, gainDb: 1 },
        midBand: { frequencyHz: 1000, gainDb: -0.5, q: 1 },
        highShelf: { frequencyHz: 8000, gainDb: 0.5 },
      },
      compressor: {
        enabled: true,
        thresholdDb: -24,
        ratio: 2,
        attackMs: 10,
        releaseMs: 100,
        knee: 2.5,
        makeupGainDb: 1,
        mix: 0.75,
        link: "maximum",
        detection: "rms",
      },
      outputGainDb: -1,
      limiter: { enabled: true, ceilingDbfs: -1, attackMs: 5, releaseMs: 50 },
    },
    tracks: [
      {
        id: "first",
        title: "First Tone",
        auditionCandidateId: "first-source",
        candidates: [{ id: "first-source", sourceRef: { rootId: "fixture", relativePath: "first.wav" } }],
        mastering: { gainDb: -3, endMode: "crossfade", endDuration: 0.15 },
      },
      {
        id: "second",
        title: "Second Tone",
        auditionCandidateId: "second-source",
        candidates: [{ id: "second-source", sourceRef: { rootId: "fixture", relativePath: "second.wav" } }],
        mastering: { gainDb: -1, endMode: "fade", endDuration: 0.1 },
      },
    ],
  };
  const progress = [];

  const result = await renderAudio({
    album,
    scope: "album",
    format: "wav",
    deliveryProfileId: "archive-wav",
    getLibraryFile: (key) => files.get(key),
    outputRoot: sourceRoot,
    timeoutMs: 20_000,
    onProgress: (value) => progress.push(value),
  });

  const probe = await probeAudio(result.audioPath);
  const stream = probe.streams[0];
  assert.equal(stream.codec_name, "pcm_s24le");
  assert.equal(stream.sample_rate, "48000");
  assert.equal(stream.channels, 2);
  assert.ok(Math.abs(Number(probe.format.duration) - 1.35) < 0.04, `expected about 1.35s, received ${probe.format.duration}s`);
  assert.deepEqual(await Promise.all([checksum(firstPath), checksum(secondPath)]), before);
  assert.equal(progress.at(-1), 100);

  const cue = await readFile(result.cuePath, "utf8");
  const manifest = JSON.parse(await readFile(result.manifestPath, "utf8"));
  assert.match(cue, /1\. 00:00\.000\s+First Tone/);
  assert.match(cue, /2\. 00:00\.650\s+Second Tone/);
  assert.match(cue, /MASTER bus: EQ on · compressor on · output -1 dB · limiter -1 dBFS/);
  assert.match(cue, /gain -3 dB/);
  assert.equal(manifest.schemaVersion, 5);
  assert.deepEqual(manifest.audioSettings, { format: "wav", sampleRate: 48_000, bitDepth: 24, bitrateKbps: null });
  assert.equal(manifest.masteringPath, "basic");
  assert.equal(manifest.renderId, result.id);
  assert.equal(manifest.audioFile, result.audioName);
  assert.equal(manifest.delivery.profileId, "archive-wav");
  assert.equal(manifest.delivery.masterApproved, false);
  assert.equal(manifest.tracks.length, 2);
  assert.equal(manifest.tracks[0].gainDb, -3);
  assert.equal(manifest.tracks[1].outputStart, 0.65);
  assert.equal(manifest.masterBus.eq.enabled, true);
  assert.equal(manifest.masterBus.compressor.enabled, true);
  assert.equal(manifest.masterBus.limiter.enabled, true);
  assert.equal(path.dirname(result.audioPath), result.outputDirectory);
});

test("a numbered-track print creates DistroKid-ready files with trims, fades, metadata, and MASTER processing", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "project-sequencer-numbered-tracks-"));
  const firstPath = path.join(root, "first.wav");
  const secondPath = path.join(root, "second.wav");
  await generateSineWave(firstPath, { duration: 0.8, frequency: 330 });
  await generateSineWave(secondPath, { duration: 0.7, frequency: 550 });
  const before = await Promise.all([checksum(firstPath), checksum(secondPath)]);
  const files = new Map([
    ["fixture::first.wav", { absolutePath: firstPath, duration: 0.8 }],
    ["fixture::second.wav", { absolutePath: secondPath, duration: 0.7 }],
  ]);
  const album = {
    id: "numbered-track-album",
    artist: "Fixture Artist",
    title: "Numbered Track Fixture",
    masterBus: { outputGainDb: -3, limiter: { enabled: true, ceilingDbfs: -1 } },
    tracks: [
      {
        id: "first",
        title: "Signal / Return",
        auditionCandidateId: "first-source",
        candidates: [{ id: "first-source", sourceRef: { rootId: "fixture", relativePath: "first.wav" } }],
        mastering: { trimStart: 0.1, trimEnd: 0.7, fadeIn: 0.05, gainDb: -2, endMode: "crossfade", endDuration: 0.2 },
      },
      {
        id: "second",
        title: "Moon's Echo",
        auditionCandidateId: "second-source",
        candidates: [{ id: "second-source", sourceRef: { rootId: "fixture", relativePath: "second.wav" } }],
        mastering: { trimStart: 0.05, trimEnd: 0.65, fadeIn: 0.04, endMode: "fade", endDuration: 0.1 },
      },
    ],
  };

  const result = await renderAudio({
    album,
    scope: "tracks",
    format: "wav",
    deliveryProfileId: "distribution-wav",
    getLibraryFile: (key) => files.get(key),
    outputRoot: path.join(root, "exports"),
    timeoutMs: 20_000,
  });

  assert.equal(result.audioName, "2 numbered WAV track files");
  assert.deepEqual(result.audioFiles.map((file) => file.audioName), ["01 - Signal - Return.wav", "02 - Moon's Echo.wav"]);
  assert.deepEqual(await Promise.all([checksum(firstPath), checksum(secondPath)]), before);
  const probes = await Promise.all(result.audioFiles.map((file) => probeAudio(file.audioPath)));
  assert.ok(probes.every((probe) => probe.streams[0].codec_name === "pcm_s24le" && probe.streams[0].sample_rate === "48000"));
  assert.ok(probes.every((probe) => Math.abs(Number(probe.format.duration) - 0.5) < 0.04));
  assert.deepEqual(
    probes.map((probe) => [probe.format.tags.artist, probe.format.tags.album, probe.format.tags.title, probe.format.tags.track]),
    [["Fixture Artist", "Numbered Track Fixture", "Signal / Return", "1/2"], ["Fixture Artist", "Numbered Track Fixture", "Moon's Echo", "2/2"]],
  );
  const manifest = JSON.parse(await readFile(result.manifestPath, "utf8"));
  const cue = await readFile(result.cuePath, "utf8");
  assert.equal(manifest.schemaVersion, 5);
  assert.equal(manifest.scope, "tracks");
  assert.deepEqual(manifest.audioSettings, { format: "wav", sampleRate: 48_000, bitDepth: 24, bitrateKbps: null });
  assert.equal(manifest.delivery.profileId, "distribution-wav");
  assert.equal(manifest.masterBus.outputGainDb, -3);
  assert.deepEqual(manifest.audioFiles.map((file) => [file.trackNumber, file.title, file.fileName]), [
    [1, "Signal / Return", "01 - Signal - Return.wav"],
    [2, "Moon's Echo", "02 - Moon's Echo.wav"],
  ]);
  assert.equal(manifest.tracks[0].trimStart, 0.1);
  assert.equal(manifest.tracks[0].fadeIn, 0.05);
  assert.equal(manifest.tracks[0].endMode, "crossfade");
  assert.equal(manifest.tracks[1].endMode, "fade");
  assert.match(cue, /DELIVERY FILES/);
  assert.match(cue, /01 - Signal - Return\.wav/);
  assert.match(result.warnings[0], /Crossfades were divided at their midpoint/);
});

test("a numbered-track print fails closed instead of silently omitting a sequenced song", async () => {
  const album = {
    id: "missing-numbered-track",
    artist: "Fixture Artist",
    title: "Incomplete Fixture",
    tracks: [
      { id: "available", title: "Available", auditionCandidateId: "available-a", candidates: [{ id: "available-a", sourceRef: { rootId: "fixture", relativePath: "available.wav" } }] },
      { id: "missing", title: "Missing Song", auditionCandidateId: "missing-a", candidates: [{ id: "missing-a", sourceRef: { rootId: "fixture", relativePath: "missing.wav" } }] },
    ],
  };
  await assert.rejects(() => renderAudio({
    album,
    scope: "tracks",
    format: "wav",
    getLibraryFile: (key) => key.endsWith("available.wav") ? { absolutePath: "/unused/available.wav", duration: 1 } : null,
    outputRoot: "/unused/exports",
  }), /Every sequenced track needs an indexed audition source.*Missing Song/);
});

test("selected-track exports print WAV, AIFF, FLAC, MP3, and M4A at chosen quality settings", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "project-sequencer-export-formats-"));
  const sourcePath = path.join(root, "source.wav");
  await generateSineWave(sourcePath, { duration: 0.25, frequency: 510 });
  const sourceChecksum = await checksum(sourcePath);
  const album = {
    id: "format-fixture",
    artist: "Fixture Artist",
    title: "Format Fixture",
    tracks: [{
      id: "source",
      title: "Format Source",
      auditionCandidateId: "source-a",
      candidates: [{ id: "source-a", sourceRef: { rootId: "fixture", relativePath: "source.wav" } }],
      mastering: { fadeIn: 0.02, endMode: "fade", endDuration: 0.03 },
    }],
  };
  const cases = [
    { format: "wav", sampleRate: 44_100, bitDepth: 16, codec: "pcm_s16le" },
    { format: "aiff", sampleRate: 96_000, bitDepth: 24, codec: "pcm_s24be" },
    { format: "flac", sampleRate: 88_200, bitDepth: 24, codec: "flac" },
    { format: "mp3", sampleRate: 44_100, bitrateKbps: 192, codec: "mp3" },
    { format: "m4a", sampleRate: 96_000, bitrateKbps: 256, codec: "aac" },
  ];

  for (const exportCase of cases) {
    const result = await renderAudio({
      album,
      scope: "track",
      trackId: "source",
      ...exportCase,
      getLibraryFile: () => ({ absolutePath: sourcePath, duration: 0.25 }),
      outputRoot: path.join(root, "exports"),
      timeoutMs: 20_000,
    });
    const probe = await probeAudio(result.audioPath);
    const manifest = JSON.parse(await readFile(result.manifestPath, "utf8"));
    assert.equal(path.extname(result.audioPath), `.${exportCase.format}`);
    assert.equal(probe.streams[0].codec_name, exportCase.codec);
    assert.equal(probe.streams[0].sample_rate, String(exportCase.sampleRate));
    assert.equal(manifest.schemaVersion, 5);
    assert.deepEqual(manifest.audioSettings, result.audioSettings);
    assert.equal(manifest.audioSettings.bitDepth, exportCase.bitDepth || null);
    assert.equal(manifest.audioSettings.bitrateKbps, exportCase.bitrateKbps || null);
  }
  assert.equal(await checksum(sourcePath), sourceChecksum);
});

test("an individual track print applies track gain and the album MASTER bus", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "project-sequencer-track-master-"));
  const sourcePath = path.join(root, "source.wav");
  const outputRoot = path.join(root, "exports");
  await generateSineWave(sourcePath, { duration: 0.5, frequency: 440 });
  const sourceChecksum = await checksum(sourcePath);
  const sourcePeak = await measurePeakDb(sourcePath);
  const album = {
    id: "track-master-album",
    artist: "Fixture Artist",
    title: "Track MASTER Fixture",
    masterBus: { outputGainDb: -6 },
    tracks: [{
      id: "source",
      title: "Processed Source",
      auditionCandidateId: "source-a",
      candidates: [{ id: "source-a", sourceRef: { rootId: "fixture", relativePath: "source.wav" } }],
      mastering: { gainDb: -3 },
    }],
  };

  const result = await renderAudio({
    album,
    scope: "track",
    trackId: "source",
    format: "wav",
    getLibraryFile: () => ({ absolutePath: sourcePath, duration: 0.5 }),
    outputRoot,
  });

  const outputPeak = await measurePeakDb(result.audioPath);
  assert.ok(Math.abs((outputPeak - sourcePeak) - (-9)) < 0.3, `expected about -9 dB combined gain, received ${outputPeak - sourcePeak} dB`);
  assert.equal(await checksum(sourcePath), sourceChecksum);
  const manifest = JSON.parse(await readFile(result.manifestPath, "utf8"));
  assert.equal(manifest.scope, "track");
  assert.equal(manifest.tracks[0].gainDb, -3);
  assert.equal(manifest.masterBus.outputGainDb, -6);
});

test("a short Premium rack print follows the patched order with oversampling and preserves its source", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "project-sequencer-premium-print-"));
  const sourcePath = path.join(root, "source.wav");
  await generateSineWave(sourcePath, { duration: 0.45, frequency: 720 });
  const sourceChecksum = await checksum(sourcePath);
  const limiter = createAdvancedProcessor(ADVANCED_PROCESSOR_TYPES.limiter, "limit-first");
  limiter.parameters.ceilingDbfs = -1.1;
  limiter.parameters.oversample = 8;
  const output = createAdvancedProcessor(ADVANCED_PROCESSOR_TYPES.output, "output-second");
  output.parameters.outputGainDb = -2;
  const compressor = createAdvancedProcessor(ADVANCED_PROCESSOR_TYPES.compressor, "compressor-third");
  compressor.parameters.thresholdDb = -22;
  compressor.parameters.sidechainEnabled = true;
  compressor.parameters.sidechainFilterHz = 180;
  limiter.parameters.stereoLinkPercent = 60;
  const advancedMastering = { ...createDefaultAdvancedMastering(), nodes: [limiter, output, compressor] };
  const album = {
    id: "premium-print",
    artist: "Fixture Artist",
    title: "Premium Rack Fixture",
    masteringPath: "advanced",
    advancedMastering,
    tracks: [{ id: "source", title: "Premium Source", auditionCandidateId: "source-a", candidates: [{ id: "source-a", sourceRef: { rootId: "fixture", relativePath: "source.wav" } }] }],
  };
  const result = await renderAudio({ album, scope: "track", trackId: "source", format: "wav", getLibraryFile: () => ({ absolutePath: sourcePath, duration: 0.45 }), outputRoot: path.join(root, "exports") });
  const probe = await probeAudio(result.audioPath);
  assert.equal(probe.streams[0].codec_name, "pcm_s24le");
  assert.equal(probe.streams[0].sample_rate, "48000");
  assert.equal(await checksum(sourcePath), sourceChecksum);
  const manifest = JSON.parse(await readFile(result.manifestPath, "utf8"));
  const cue = await readFile(result.cuePath, "utf8");
  assert.equal(manifest.masteringPath, "advanced");
  assert.equal(manifest.masteringPrintPlan.pathLabel, "Premium MASTER rack");
  assert.deepEqual(manifest.masteringPrintPlan.processors.map((processor) => processor.id), ["limit-first", "output-second", "compressor-third"]);
  assert.deepEqual(manifest.advancedMastering.nodes.map((node) => node.id), ["limit-first", "output-second", "compressor-third"]);
  assert.equal(manifest.advancedMastering.nodes[0].parameters.oversample, 8);
  assert.equal(manifest.advancedMastering.nodes[0].parameters.stereoLinkPercent, 60);
  assert.equal(manifest.advancedMastering.nodes[2].parameters.sidechainFilterHz, 180);
  assert.match(cue, /MASTER path: Track edits \+ level → Precision Limiter -1\.1 dBFS → Master Output -2 dB → Bus Compressor/);
});

test("a Premium Master Output rack stage changes the printed level by the configured amount", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "project-sequencer-premium-output-"));
  const sourcePath = path.join(root, "source.wav");
  await generateSineWave(sourcePath, { duration: 0.4, frequency: 620 });
  const sourcePeak = await measurePeakDb(sourcePath);
  const sourceChecksum = await checksum(sourcePath);
  const output = createAdvancedProcessor(ADVANCED_PROCESSOR_TYPES.output, "master-output");
  output.parameters.outputGainDb = -6;
  const album = {
    id: "premium-output",
    artist: "Fixture Artist",
    title: "Premium Output Fixture",
    masteringPath: "advanced",
    advancedMastering: { ...createDefaultAdvancedMastering(), nodes: [output] },
    tracks: [{ id: "source", title: "Premium Output Source", auditionCandidateId: "source-a", candidates: [{ id: "source-a", sourceRef: { rootId: "fixture", relativePath: "source.wav" } }] }],
  };
  const result = await renderAudio({ album, scope: "track", trackId: "source", format: "wav", getLibraryFile: () => ({ absolutePath: sourcePath, duration: 0.4 }), outputRoot: path.join(root, "exports") });
  const outputPeak = await measurePeakDb(result.audioPath);
  assert.ok(Math.abs((outputPeak - sourcePeak) - (-6)) < 0.3, `expected about -6 dB Premium output gain, received ${outputPeak - sourcePeak} dB`);
  assert.equal(await checksum(sourcePath), sourceChecksum);
});

test("a short print executes the complete spatial and creative built-in plug-in rack", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "project-sequencer-spatial-plugins-"));
  const sourcePath = path.join(root, "source.wav");
  await generateSineWave(sourcePath, { duration: 0.35, frequency: 480 });
  const sourceChecksum = await checksum(sourcePath);
  const make = (type, id, patch) => {
    const node = createAdvancedProcessor(type, id);
    Object.assign(node.parameters, patch);
    return node;
  };
  const nodes = [
    make(ADVANCED_PROCESSOR_TYPES.eq, "side-eq", { channelMode: "side", outputGainDb: -0.2 }),
    make(ADVANCED_PROCESSOR_TYPES.compressor, "mid-comp", { channelMode: "mid", thresholdDb: -24, ratio: 1.5, mix: 0.35 }),
    make(ADVANCED_PROCESSOR_TYPES.stereoField, "field", { widthDb: 1, depthDb: -0.5, monoBelowHz: 100, spaceDb: 0.5, balance: 0.05 }),
    make(ADVANCED_PROCESSOR_TYPES.harmonicColor, "color", { driveDb: 3, mix: 0.15 }),
    make(ADVANCED_PROCESSOR_TYPES.phaseAlignment, "phase", { target: "side", shift: 0.25, delaySamples: 2, mix: 0.4 }),
    make(ADVANCED_PROCESSOR_TYPES.hfSmoother, "smooth", { thresholdDb: -24, ratio: 1.5, mix: 0.4 }),
    make(ADVANCED_PROCESSOR_TYPES.ambience, "space", { wetPercent: 1, decaySeconds: 0.25, preDelayMs: 5 }),
    make(ADVANCED_PROCESSOR_TYPES.transientShaper, "impact", { attackDb: 0.5, sustainDb: -0.25 }),
    make(ADVANCED_PROCESSOR_TYPES.creativePhaser, "motion", { mix: 0.08, depth: 0.15, rateHz: 0.2 }),
    make(ADVANCED_PROCESSOR_TYPES.limiter, "final-limit", { ceilingDbfs: -1, oversample: 2 }),
  ];
  const album = {
    id: "spatial-plugins",
    artist: "Fixture Artist",
    title: "Spatial Plug-ins Fixture",
    masteringPath: "advanced",
    advancedMastering: { ...createDefaultAdvancedMastering(), nodes },
    tracks: [{ id: "source", title: "Spatial Source", auditionCandidateId: "source-a", candidates: [{ id: "source-a", sourceRef: { rootId: "fixture", relativePath: "source.wav" } }] }],
  };
  const result = await renderAudio({ album, scope: "track", trackId: "source", format: "wav", getLibraryFile: () => ({ absolutePath: sourcePath, duration: 0.35 }), outputRoot: path.join(root, "exports"), timeoutMs: 30_000 });
  const probe = await probeAudio(result.audioPath);
  assert.equal(probe.streams[0].codec_name, "pcm_s24le");
  assert.equal(probe.streams[0].channels, 2);
  assert.equal(await checksum(sourcePath), sourceChecksum);
  const manifest = JSON.parse(await readFile(result.manifestPath, "utf8"));
  assert.deepEqual(manifest.advancedMastering.nodes.map((node) => node.pluginRef.format), Array(nodes.length).fill("builtin"));
});

test("cancelling a real FFmpeg print removes its partial derivative directory", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "project-sequencer-ffmpeg-cancel-"));
  const sourcePath = path.join(root, "source.wav");
  const outputRoot = path.join(root, "exports");
  await generateSineWave(sourcePath, { duration: 2, frequency: 440 });
  const controller = new AbortController();
  const album = {
    id: "cancel-album",
    artist: "Fixture Artist",
    title: "Cancellation Fixture",
    tracks: [{
      id: "source",
      title: "Source",
      auditionCandidateId: "source-a",
      candidates: [{ id: "source-a", sourceRef: { rootId: "fixture", relativePath: "source.wav" } }],
    }],
  };

  await assert.rejects(() => renderAudio({
    album,
    scope: "track",
    trackId: "source",
    format: "wav",
    getLibraryFile: () => ({ absolutePath: sourcePath, duration: 2 }),
    outputRoot,
    signal: controller.signal,
    onProgress: (progress) => { if (progress >= 10) controller.abort(); },
  }), /cancelled/i);
  const remaining = await readdir(outputRoot, { recursive: true });
  assert.equal(remaining.some((name) => /\.(?:part\.)?(?:wav|mp3|json|txt)$/.test(name)), false);
});

test("comparison previews create labeled loudness-matched derivatives without changing candidates", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "project-sequencer-comparison-"));
  const sourcePath = path.join(root, "quiet.wav");
  await generateSineWave(sourcePath, { duration: 0.6, frequency: 260 });
  const before = await checksum(sourcePath);
  const album = {
    id: "comparison-album",
    artist: "Fixture Artist",
    title: "Comparison Fixture",
    tracks: [{
      id: "song",
      title: "Song",
      auditionCandidateId: "source-a",
      masterCandidateId: "source-a",
      candidates: [{ id: "source-a", sourceRef: { rootId: "fixture", relativePath: "quiet.wav" } }],
    }],
  };
  const result = await renderAudio({
    album,
    scope: "comparison",
    trackId: "song",
    candidateId: "source-a",
    format: "mp3",
    getLibraryFile: () => ({ absolutePath: sourcePath, duration: 0.6 }),
    outputRoot: path.join(root, "exports"),
  });
  const probe = await probeAudio(result.audioPath);
  assert.equal(probe.streams[0].codec_name, "mp3");
  assert.equal(result.derivativeLabel, "Loudness-matched preview derivative");
  assert.equal(result.cuePath, "");
  assert.equal(await checksum(sourcePath), before);
  assert.equal(album.tracks[0].masterCandidateId, "source-a");
});
