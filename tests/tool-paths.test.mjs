import assert from "node:assert/strict";
import test from "node:test";
import { ffmpegExecutable, ffprobeExecutable } from "../server/tool-paths.mjs";

test("media tools use normal PATH commands by default", () => {
  const previousFfmpeg = process.env.PROJECT_SEQUENCER_FFMPEG_PATH;
  const previousFfprobe = process.env.PROJECT_SEQUENCER_FFPROBE_PATH;
  delete process.env.PROJECT_SEQUENCER_FFMPEG_PATH;
  delete process.env.PROJECT_SEQUENCER_FFPROBE_PATH;
  try {
    assert.equal(ffmpegExecutable(), "ffmpeg");
    assert.equal(ffprobeExecutable(), "ffprobe");
  } finally {
    if (previousFfmpeg === undefined) delete process.env.PROJECT_SEQUENCER_FFMPEG_PATH;
    else process.env.PROJECT_SEQUENCER_FFMPEG_PATH = previousFfmpeg;
    if (previousFfprobe === undefined) delete process.env.PROJECT_SEQUENCER_FFPROBE_PATH;
    else process.env.PROJECT_SEQUENCER_FFPROBE_PATH = previousFfprobe;
  }
});

test("native shell can provide absolute media-tool paths", () => {
  const previousFfmpeg = process.env.PROJECT_SEQUENCER_FFMPEG_PATH;
  const previousFfprobe = process.env.PROJECT_SEQUENCER_FFPROBE_PATH;
  process.env.PROJECT_SEQUENCER_FFMPEG_PATH = " /native/bin/ffmpeg ";
  process.env.PROJECT_SEQUENCER_FFPROBE_PATH = " /native/bin/ffprobe ";
  try {
    assert.equal(ffmpegExecutable(), "/native/bin/ffmpeg");
    assert.equal(ffprobeExecutable(), "/native/bin/ffprobe");
  } finally {
    if (previousFfmpeg === undefined) delete process.env.PROJECT_SEQUENCER_FFMPEG_PATH;
    else process.env.PROJECT_SEQUENCER_FFMPEG_PATH = previousFfmpeg;
    if (previousFfprobe === undefined) delete process.env.PROJECT_SEQUENCER_FFPROBE_PATH;
    else process.env.PROJECT_SEQUENCER_FFPROBE_PATH = previousFfprobe;
  }
});
