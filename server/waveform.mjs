import { spawn } from "node:child_process";

export const WAVEFORM_POINT_LIMITS = Object.freeze({ minimum: 240, maximum: 1600, fallback: 900 });

export const clampWaveformPointCount = (value) => {
  const parsed = Number.parseInt(value, 10);
  const requested = Number.isFinite(parsed) ? parsed : WAVEFORM_POINT_LIMITS.fallback;
  return Math.min(WAVEFORM_POINT_LIMITS.maximum, Math.max(WAVEFORM_POINT_LIMITS.minimum, requested));
};

export const summarizeWaveform = (samples, requestedPoints = WAVEFORM_POINT_LIMITS.fallback) => {
  const pointCount = clampWaveformPointCount(requestedPoints);
  if (!samples?.length) return { points: Array(pointCount).fill(0), sampleCount: 0, peak: 0 };

  const rawPeaks = new Array(pointCount).fill(0);
  let largestPeak = 0;
  for (let pointIndex = 0; pointIndex < pointCount; pointIndex += 1) {
    const start = Math.floor((pointIndex * samples.length) / pointCount);
    const end = Math.max(start + 1, Math.floor(((pointIndex + 1) * samples.length) / pointCount));
    let bucketPeak = 0;
    for (let sampleIndex = start; sampleIndex < Math.min(end, samples.length); sampleIndex += 1) {
      const sample = Number.isFinite(samples[sampleIndex]) ? Math.abs(samples[sampleIndex]) : 0;
      if (sample > bucketPeak) bucketPeak = sample;
    }
    rawPeaks[pointIndex] = bucketPeak;
    if (bucketPeak > largestPeak) largestPeak = bucketPeak;
  }

  const points = largestPeak > 0
    ? rawPeaks.map((peak) => Number((peak / largestPeak).toFixed(4)))
    : rawPeaks;
  return { points, sampleCount: samples.length, peak: Number(largestPeak.toFixed(6)) };
};

const samplesFromBuffer = (buffer) => {
  const sampleCount = Math.floor(buffer.length / 4);
  const samples = new Float32Array(sampleCount);
  for (let index = 0; index < sampleCount; index += 1) samples[index] = buffer.readFloatLE(index * 4);
  return samples;
};

export const extractWaveform = (filePath, requestedPoints, {
  ffmpegPath = "ffmpeg",
  sampleRate = 400,
  maxBytes = 32_000_000,
} = {}) => new Promise((resolve, reject) => {
  const child = spawn(ffmpegPath, [
    "-nostdin",
    "-hide_banner",
    "-loglevel", "error",
    "-i", filePath,
    "-map", "0:a:0",
    "-vn",
    "-ac", "1",
    "-ar", String(sampleRate),
    "-f", "f32le",
    "pipe:1",
  ], { stdio: ["ignore", "pipe", "pipe"] });

  const chunks = [];
  let byteCount = 0;
  let errors = "";
  let failure = null;
  let settled = false;
  const finish = (callback) => {
    if (settled) return;
    settled = true;
    callback();
  };

  child.stdout.on("data", (chunk) => {
    if (failure) return;
    byteCount += chunk.length;
    if (byteCount > maxBytes) {
      failure = new Error("Waveform analysis exceeded its safety limit.");
      child.kill("SIGKILL");
      return;
    }
    chunks.push(chunk);
  });
  child.stderr.setEncoding("utf8");
  child.stderr.on("data", (chunk) => {
    errors = `${errors}${chunk}`.slice(-8_000);
  });
  child.on("error", (error) => finish(() => reject(new Error(`FFmpeg could not analyze this waveform: ${error.message}`))));
  child.on("close", (code) => finish(() => {
    if (failure) {
      reject(failure);
      return;
    }
    if (code !== 0) {
      const detail = errors.trim().split("\n").slice(-3).join(" ");
      reject(new Error(`Waveform analysis failed${detail ? `: ${detail}` : "."}`));
      return;
    }
    resolve(summarizeWaveform(samplesFromBuffer(Buffer.concat(chunks)), requestedPoints));
  }));
});

export const createWaveformService = ({ loadWaveform = extractWaveform, maxEntries = 64 } = {}) => {
  const cache = new Map();
  return {
    async get(file, requestedPoints) {
      const pointCount = clampWaveformPointCount(requestedPoints);
      const cacheKey = `${file.key}::${file.mtimeMs || 0}::${pointCount}`;
      if (cache.has(cacheKey)) {
        const cached = cache.get(cacheKey);
        cache.delete(cacheKey);
        cache.set(cacheKey, cached);
        return cached;
      }

      const pending = loadWaveform(file.absolutePath, pointCount)
        .then((summary) => ({
          key: file.key,
          duration: file.duration,
          pointCount,
          sampleCount: summary.sampleCount,
          points: summary.points,
        }))
        .catch((error) => {
          cache.delete(cacheKey);
          throw error;
        });
      cache.set(cacheKey, pending);
      while (cache.size > Math.max(1, maxEntries)) cache.delete(cache.keys().next().value);
      return pending;
    },
  };
};
