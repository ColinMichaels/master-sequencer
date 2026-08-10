import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdtemp, readdir, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { renderAudio } from "../server/audio-renderer.mjs";
import { generateSineWave, probeAudio } from "./helpers/audio-fixtures.mjs";

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
    tracks: [
      {
        id: "first",
        title: "First Tone",
        auditionCandidateId: "first-source",
        candidates: [{ id: "first-source", sourceRef: { rootId: "fixture", relativePath: "first.wav" } }],
        mastering: { endMode: "crossfade", endDuration: 0.15 },
      },
      {
        id: "second",
        title: "Second Tone",
        auditionCandidateId: "second-source",
        candidates: [{ id: "second-source", sourceRef: { rootId: "fixture", relativePath: "second.wav" } }],
        mastering: { endMode: "fade", endDuration: 0.1 },
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
  assert.equal(manifest.renderId, result.id);
  assert.equal(manifest.audioFile, result.audioName);
  assert.equal(manifest.delivery.profileId, "archive-wav");
  assert.equal(manifest.delivery.masterApproved, false);
  assert.equal(manifest.tracks.length, 2);
  assert.equal(manifest.tracks[1].outputStart, 0.65);
  assert.equal(path.dirname(result.audioPath), result.outputDirectory);
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
