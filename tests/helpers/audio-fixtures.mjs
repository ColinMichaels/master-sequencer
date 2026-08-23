import { execFile } from "node:child_process";
import path from "node:path";
import { promisify } from "node:util";

const run = promisify(execFile);

export const generateSineWave = async (filePath, { duration = 0.8, frequency = 440 } = {}) => {
  const mp3 = path.extname(filePath).toLowerCase() === ".mp3";
  await run("ffmpeg", [
    "-hide_banner",
    "-loglevel", "error",
    "-y",
    "-f", "lavfi",
    "-i", `sine=frequency=${frequency}:sample_rate=48000:duration=${duration}`,
    "-ac", "2",
    "-c:a", mp3 ? "libmp3lame" : "pcm_s16le",
    ...(mp3 ? ["-b:a", "128k"] : []),
    filePath,
  ]);
  return filePath;
};

export const generateTestVideo = async (filePath, { duration = 2, width = 640, height = 360 } = {}) => {
  await run("ffmpeg", [
    "-hide_banner",
    "-loglevel", "error",
    "-y",
    "-f", "lavfi",
    "-i", `testsrc2=size=${width}x${height}:rate=24:duration=${duration}`,
    "-f", "lavfi",
    "-i", `sine=frequency=520:sample_rate=48000:duration=${duration}`,
    "-shortest",
    "-c:v", "libx264",
    "-pix_fmt", "yuv420p",
    "-c:a", "aac",
    "-movflags", "+faststart",
    filePath,
  ]);
  return filePath;
};

export const generateTestImage = async (filePath, { width = 360, height = 360 } = {}) => {
  await run("ffmpeg", [
    "-hide_banner",
    "-loglevel", "error",
    "-y",
    "-f", "lavfi",
    "-i", `color=c=0x374519:size=${width}x${height}`,
    "-frames:v", "1",
    "-update", "1",
    filePath,
  ]);
  return filePath;
};

export const probeAudio = async (filePath) => {
  const { stdout } = await run("ffprobe", [
    "-v", "error",
    "-select_streams", "a:0",
    "-show_entries", "stream=codec_name,sample_rate,channels,bits_per_raw_sample,bits_per_sample,bit_rate:format=duration,bit_rate:format_tags=artist,album,title,track",
    "-of", "json",
    filePath,
  ]);
  return JSON.parse(stdout);
};

export const measurePeakDb = async (filePath) => {
  const { stderr } = await run("ffmpeg", [
    "-hide_banner",
    "-nostats",
    "-i", filePath,
    "-af", "volumedetect",
    "-f", "null",
    "-",
  ]);
  const match = stderr.match(/max_volume:\s*(-?\d+(?:\.\d+)?) dB/);
  if (!match) throw new Error(`Could not measure peak volume for ${path.basename(filePath)}.`);
  return Number(match[1]);
};
