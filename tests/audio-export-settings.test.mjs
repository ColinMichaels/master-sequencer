import assert from "node:assert/strict";
import test from "node:test";
import { audioExportSummary, resolveAudioExportSettings } from "../src/lib/audio-export-settings.js";

test("audio export settings provide format-specific defaults and summaries", () => {
  assert.deepEqual(resolveAudioExportSettings({ format: "wav" }).settings, {
    format: "wav",
    sampleRate: 48_000,
    bitDepth: 24,
    bitrateKbps: null,
  });
  assert.equal(audioExportSummary({ format: "aiff", sampleRate: 96_000, bitDepth: 32 }), "AIFF · 32-bit · 96 kHz");
  assert.equal(audioExportSummary({ format: "mp3", sampleRate: 44_100, bitrateKbps: 192 }), "MP3 · 192 kbps · 44.1 kHz");
});

test("audio export settings reject unsupported format, rate, bit depth, and bitrate combinations", () => {
  assert.match(resolveAudioExportSettings({ format: "ogg" }).issues[0], /WAV, AIFF, FLAC, MP3, or M4A/);
  assert.match(resolveAudioExportSettings({ format: "mp3", sampleRate: 96_000 }).issues[0], /44.1 kHz, 48 kHz/);
  assert.match(resolveAudioExportSettings({ format: "flac", bitDepth: 32 }).issues[0], /16, 24 bit/);
  assert.match(resolveAudioExportSettings({ format: "m4a", bitrateKbps: 111 }).issues[0], /128, 192, 256, 320 kbps/);
});
