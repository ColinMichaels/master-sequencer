import { spawn } from "node:child_process";

const lastNumber = (text, pattern) => {
  const matches = [...text.matchAll(pattern)];
  const value = Number(matches.at(-1)?.[1]);
  return Number.isFinite(value) ? value : null;
};

export const parseTechnicalAnalysis = (output) => {
  const silenceStarts = [...output.matchAll(/silence_start:\s*([\d.]+)/g)].map((match) => Number(match[1]));
  const silenceEnds = [...output.matchAll(/silence_end:\s*([\d.]+)/g)].map((match) => Number(match[1]));
  const silenceBoundaries = silenceStarts.map((start, index) => ({
    start,
    end: Number.isFinite(silenceEnds[index]) ? silenceEnds[index] : null,
  }));
  return {
    integratedLoudness: lastNumber(output, /\bI:\s*(-?[\d.]+)\s+LUFS/g),
    loudnessRange: lastNumber(output, /\bLRA:\s*([\d.]+)\s+LU/g),
    truePeak: lastNumber(output, /\bPeak:\s*(-?[\d.]+)\s+dBFS/g),
    dcOffset: lastNumber(output, /DC offset:\s*(-?[\d.]+)/g),
    silenceBoundaries,
  };
};

const analyzeFile = (file, { timeoutMs = 120_000 } = {}) => new Promise((resolve, reject) => {
  const child = spawn("ffmpeg", [
    "-hide_banner", "-nostats", "-i", file.absolutePath,
    "-af", "ebur128=peak=true:framelog=verbose,astats=metadata=1:reset=0,silencedetect=noise=-50dB:d=0.1",
    "-f", "null", "-",
  ], { stdio: ["ignore", "ignore", "pipe"] });
  let output = "";
  let timedOut = false;
  const timeout = setTimeout(() => { timedOut = true; child.kill("SIGKILL"); }, timeoutMs);
  timeout.unref?.();
  child.stderr.setEncoding("utf8");
  child.stderr.on("data", (chunk) => { output = `${output}${chunk}`.slice(-250_000); });
  child.on("error", (error) => { clearTimeout(timeout); reject(new Error(`Technical analysis could not start: ${error.message}`)); });
  child.on("close", (code) => {
    clearTimeout(timeout);
    if (timedOut) reject(new Error("Technical analysis exceeded its safety time limit."));
    else if (code !== 0) reject(new Error("FFmpeg could not analyze this indexed source."));
    else resolve(parseTechnicalAnalysis(output));
  });
});

export const createTechnicalAnalysisService = ({ analyze = analyzeFile } = {}) => {
  const cache = new Map();
  const pending = new Map();
  const fingerprint = (file) => `${file.key}:${file.size}:${file.mtimeMs}`;
  return {
    async get(file) {
      const key = fingerprint(file);
      if (cache.has(key)) return { ...cache.get(key), cached: true };
      if (pending.has(key)) return pending.get(key);
      const operation = analyze(file).then((measurements) => {
        const result = { key: file.key, measurements, analyzedAt: new Date().toISOString(), cached: false };
        cache.set(key, result);
        return result;
      }).finally(() => pending.delete(key));
      pending.set(key, operation);
      return operation;
    },
    clear() {
      cache.clear();
    },
  };
};
