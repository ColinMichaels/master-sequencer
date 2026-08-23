import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import { mkdir, rename, rm, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { calculateProgramTimeline, normalizeMasterBus, normalizeMastering } from "../src/lib/mastering.js";
import { ADVANCED_PROCESSOR_TYPES, normalizeAdvancedMastering, normalizeMasteringPath } from "../src/lib/advanced-mastering.js";
import { assertMasteringPrintPlan, createMasteringPrintPlan } from "../src/lib/mastering-print-plan.js";
import { audioExportSummary, resolveAudioExportSettings } from "../src/lib/audio-export-settings.js";
import { validateDeliveryRequest } from "../src/lib/delivery-profiles.js";
import { sourceKey } from "./audio-library.mjs";
import { ffmpegExecutable } from "./tool-paths.mjs";

const RENDER_SCOPES = new Set(["album", "tracks", "track", "preview", "comparison"]);
const PREVIEW_PARTS = new Set(["start", "end", "transition"]);
const PCM_CODECS = {
  wav: { 16: "pcm_s16le", 24: "pcm_s24le", 32: "pcm_s32le" },
  aiff: { 16: "pcm_s16be", 24: "pcm_s24be", 32: "pcm_s32be" },
};

export const audioEncodingArguments = (audioSettings) => {
  const { format, sampleRate, bitDepth, bitrateKbps } = audioSettings;
  if (PCM_CODECS[format]) return ["-c:a", PCM_CODECS[format][bitDepth], "-ar", String(sampleRate)];
  if (format === "flac") return [
    "-c:a", "flac",
    "-sample_fmt", bitDepth === 16 ? "s16" : "s32",
    ...(bitDepth === 24 ? ["-bits_per_raw_sample", "24"] : []),
    "-ar", String(sampleRate),
  ];
  if (format === "mp3") return ["-c:a", "libmp3lame", "-b:a", `${bitrateKbps}k`, "-ar", String(sampleRate), "-id3v2_version", "3"];
  if (format === "m4a") return ["-c:a", "aac", "-b:a", `${bitrateKbps}k`, "-ar", String(sampleRate), "-movflags", "+faststart"];
  throw new Error("The selected audio format cannot be encoded.");
};

const slugify = (value) => value
  .toLowerCase()
  .replace(/[^a-z0-9]+/g, "-")
  .replace(/^-|-$/g, "") || "audio";

const CONTROL_CHARACTERS = /[\u0000-\u001f\u007f]/g;
const UNSAFE_FILENAME_CHARACTERS = /[\\/?%*:|"<>]/g;

export const numberedTrackFilename = ({ trackNumber, totalTracks, title, format }) => {
  const width = Math.max(2, String(Math.max(1, totalTracks)).length);
  const prefix = String(trackNumber).padStart(width, "0");
  const safeTitle = String(title || "Untitled Track")
    .normalize("NFKC")
    .replace(CONTROL_CHARACTERS, "")
    .replace(UNSAFE_FILENAME_CHARACTERS, " - ")
    .replace(/\s+/g, " ")
    .replace(/(?:\s+-\s+){2,}/g, " - ")
    .trim()
    .slice(0, 120)
    .replace(/(?:\s+-)+\s*$/g, "")
    .replace(/[. ]+$/g, "") || "Untitled Track";
  return `${prefix} - ${safeTitle}.${format}`;
};

const seconds = (value) => Number(value.toFixed(6)).toString();

const decibelsToAmplitude = (value) => seconds(10 ** (value / 20));

const formatDb = (value) => `${value > 0 ? "+" : ""}${Number(value.toFixed(2))} dB`;

export class RenderCancelledError extends Error {
  constructor(message = "Audio rendering was cancelled.") {
    super(message);
    this.name = "RenderCancelledError";
    this.code = "RENDER_CANCELLED";
  }
}

const throwIfCancelled = (signal) => {
  if (signal?.aborted) throw new RenderCancelledError();
};

export const runFfmpeg = (argumentsList, { signal, timeoutMs = 10 * 60_000, expectedDuration = 0, onProgress = () => {} } = {}) => new Promise((resolve, reject) => {
  throwIfCancelled(signal);
  const child = spawn(ffmpegExecutable(), [...argumentsList.slice(0, -1), "-progress", "pipe:3", "-nostats", argumentsList.at(-1)], { stdio: ["ignore", "ignore", "pipe", "pipe"] });
  let errors = "";
  let progressBuffer = "";
  let settled = false;
  let cancelled = false;
  let timedOut = false;
  let forceKillTimer;
  const finish = (callback) => {
    if (settled) return;
    settled = true;
    clearTimeout(timeout);
    clearTimeout(forceKillTimer);
    signal?.removeEventListener("abort", cancel);
    callback();
  };
  const stopChild = () => {
    if (child.exitCode === null && child.signalCode === null) {
      child.kill("SIGTERM");
      forceKillTimer = setTimeout(() => child.kill("SIGKILL"), 2_000);
      forceKillTimer.unref?.();
    }
  };
  const cancel = () => {
    cancelled = true;
    stopChild();
  };
  const timeout = setTimeout(() => {
    timedOut = true;
    stopChild();
  }, timeoutMs);
  timeout.unref?.();
  signal?.addEventListener("abort", cancel, { once: true });
  child.stderr.setEncoding("utf8");
  child.stderr.on("data", (chunk) => {
    errors = `${errors}${chunk}`.slice(-16_000);
  });
  child.stdio[3].setEncoding("utf8");
  child.stdio[3].on("data", (chunk) => {
    progressBuffer += chunk;
    const lines = progressBuffer.split("\n");
    progressBuffer = lines.pop() || "";
    for (const line of lines) {
      const [key, rawValue] = line.trim().split("=", 2);
      if (!expectedDuration || !["out_time_us", "out_time_ms"].includes(key)) continue;
      const elapsed = Number(rawValue) / 1_000_000;
      if (Number.isFinite(elapsed)) onProgress(Math.min(88, 10 + (elapsed / expectedDuration) * 78), "rendering");
    }
  });
  child.on("error", (error) => finish(() => reject(new Error(`FFmpeg could not start: ${error.message}`))));
  child.on("close", (code) => {
    finish(() => {
      if (cancelled) reject(new RenderCancelledError());
      else if (timedOut) reject(new Error(`FFmpeg render exceeded the ${Math.ceil(timeoutMs / 1_000)} second safety limit.`));
      else if (code === 0) resolve();
      else reject(new Error(`FFmpeg render failed${errors ? `: ${errors.trim().split("\n").slice(-4).join(" ")}` : "."}`));
    });
  });
});

const resolveTrackEntry = (track, getLibraryFile) => {
  const candidate = track.candidates.find((item) => item.id === track.auditionCandidateId);
  const file = candidate ? getLibraryFile(sourceKey(candidate.sourceRef)) : null;
  return file ? {
    track,
    candidate,
    file,
    sourceDuration: file.duration,
    mastering: track.mastering || {},
  } : null;
};

const resolveCandidateEntry = (track, candidateId, getLibraryFile) => {
  const candidate = track?.candidates.find((item) => item.id === candidateId);
  const file = candidate ? getLibraryFile(sourceKey(candidate.sourceRef)) : null;
  return file ? {
    track,
    candidate,
    file,
    sourceDuration: file.duration,
    mastering: { trimStart: 0, trimEnd: Math.min(file.duration, 30), endMode: "natural", gapAfter: 0 },
  } : null;
};

const segmentFilter = (entry, index, hasNext, forceFadeForCrossfade = false, sampleRate = 48_000) => {
  const settings = normalizeMastering(entry.mastering, entry.sourceDuration, { hasNext });
  const filters = [
    `atrim=start=${seconds(settings.trimStart)}:end=${seconds(settings.trimEnd)}`,
    "asetpts=PTS-STARTPTS",
    `aresample=${sampleRate}`,
    `aformat=sample_fmts=fltp:sample_rates=${sampleRate}:channel_layouts=stereo`,
  ];
  if (settings.fadeIn > 0) filters.push(`afade=t=in:st=0:d=${seconds(settings.fadeIn)}`);
  if (settings.endMode === "fade" || (forceFadeForCrossfade && settings.endMode === "crossfade")) {
    const fadeDuration = Math.min(settings.endDuration, settings.duration - 0.05);
    filters.push(`afade=t=out:st=${seconds(settings.duration - fadeDuration)}:d=${seconds(fadeDuration)}`);
  }
  if (settings.gainDb !== 0) filters.push(`volume=${seconds(settings.gainDb)}dB`);
  return { filter: `[${index}:a]${filters.join(",")}[t${index}]`, settings };
};

export const buildMasterBusFilters = (masterBus = {}) => {
  const settings = normalizeMasterBus(masterBus);
  const filters = [];
  if (settings.bypass) return { settings, filters };

  if (settings.eq.enabled) {
    if (settings.eq.lowShelf.gainDb !== 0) {
      filters.push(`lowshelf=f=${seconds(settings.eq.lowShelf.frequencyHz)}:g=${seconds(settings.eq.lowShelf.gainDb)}:p=2`);
    }
    if (settings.eq.midBand.gainDb !== 0) {
      filters.push(`equalizer=f=${seconds(settings.eq.midBand.frequencyHz)}:t=q:w=${seconds(settings.eq.midBand.q)}:g=${seconds(settings.eq.midBand.gainDb)}`);
    }
    if (settings.eq.highShelf.gainDb !== 0) {
      filters.push(`highshelf=f=${seconds(settings.eq.highShelf.frequencyHz)}:g=${seconds(settings.eq.highShelf.gainDb)}:p=2`);
    }
  }
  if (settings.compressor.enabled) {
    filters.push([
      `acompressor=threshold=${decibelsToAmplitude(settings.compressor.thresholdDb)}`,
      `ratio=${seconds(settings.compressor.ratio)}`,
      `attack=${seconds(settings.compressor.attackMs)}`,
      `release=${seconds(settings.compressor.releaseMs)}`,
      `knee=${seconds(settings.compressor.knee)}`,
      `makeup=${decibelsToAmplitude(settings.compressor.makeupGainDb)}`,
      `mix=${seconds(settings.compressor.mix)}`,
      `link=${settings.compressor.link}`,
      `detection=${settings.compressor.detection}`,
    ].join(":"));
  }
  if (settings.outputGainDb !== 0) filters.push(`volume=${seconds(settings.outputGainDb)}dB`);
  if (settings.limiter.enabled) {
    filters.push([
      `alimiter=limit=${decibelsToAmplitude(settings.limiter.ceilingDbfs)}`,
      `attack=${seconds(settings.limiter.attackMs)}`,
      `release=${seconds(settings.limiter.releaseMs)}`,
      "level=false",
      "latency=true",
    ].join(":"));
  }
  return { settings, filters };
};

// Mid/Side targeting is rendered as an explicit split and rejoin. This keeps
// the unselected component bit-for-bit on the bypass branch and prevents a
// nominal channel-mode setting from accidentally processing the full stereo bus.
const channelModeFilter = (mode, filter, tag) => {
  if (!filter) return "";
  if (mode === "stereo") return filter;
  const selected = mode === "side" ? "side" : "mid";
  const other = selected === "mid" ? "side" : "mid";
  return `stereotools=mode=lr>ms,channelsplit=channel_layout=stereo[${tag}_mid][${tag}_side];[${tag}_${selected}]${filter}[${tag}_${selected}_processed];[${tag}_${other}]anull[${tag}_${other}_processed];[${tag}_mid_processed][${tag}_side_processed]join=inputs=2:channel_layout=stereo,stereotools=mode=ms>lr`;
};

const targetChannelFilter = (target, filter, tag) => {
  if (!filter) return "";
  const midSide = target === "mid" || target === "side";
  const first = midSide ? "stereotools=mode=lr>ms," : "";
  const second = midSide ? ",stereotools=mode=ms>lr" : "";
  const selected = target === "left" || target === "mid" ? "left" : "right";
  const other = selected === "left" ? "right" : "left";
  return `${first}channelsplit=channel_layout=stereo[${tag}_left][${tag}_right];[${tag}_${selected}]${filter}[${tag}_${selected}_processed];[${tag}_${other}]anull[${tag}_${other}_processed];[${tag}_left_processed][${tag}_right_processed]join=inputs=2:channel_layout=stereo${second}`;
};

const parallelFilter = (filter, mix, tag) => {
  const wet = Math.max(0, Math.min(1, mix));
  if (!filter || wet <= 0) return "";
  if (wet >= 1) return filter;
  return `asplit=2[${tag}_dry][${tag}_wet];[${tag}_dry]volume=${seconds(1 - wet)}[${tag}_dry_out];[${tag}_wet]${filter},volume=${seconds(wet)}[${tag}_wet_out];[${tag}_dry_out][${tag}_wet_out]amix=inputs=2:normalize=0`;
};

const eqFilter = (parameters) => [
  parameters.lowShelf.gainDb !== 0 && `lowshelf=f=${seconds(parameters.lowShelf.frequencyHz)}:g=${seconds(parameters.lowShelf.gainDb)}:p=2`,
  parameters.lowMidBand.gainDb !== 0 && `equalizer=f=${seconds(parameters.lowMidBand.frequencyHz)}:t=q:w=${seconds(parameters.lowMidBand.q)}:g=${seconds(parameters.lowMidBand.gainDb)}`,
  parameters.highMidBand.gainDb !== 0 && `equalizer=f=${seconds(parameters.highMidBand.frequencyHz)}:t=q:w=${seconds(parameters.highMidBand.q)}:g=${seconds(parameters.highMidBand.gainDb)}`,
  parameters.highShelf.gainDb !== 0 && `highshelf=f=${seconds(parameters.highShelf.frequencyHz)}:g=${seconds(parameters.highShelf.gainDb)}:p=2`,
  parameters.outputGainDb !== 0 && `volume=${seconds(parameters.outputGainDb)}dB`,
].filter(Boolean).join(",");

const compressorFilter = (parameters) => [
  `acompressor=threshold=${decibelsToAmplitude(parameters.thresholdDb)}`,
  `ratio=${seconds(parameters.ratio)}`,
  `attack=${seconds(parameters.attackMs)}`,
  `release=${seconds(parameters.releaseMs)}`,
  `knee=${seconds(parameters.knee)}`,
  `makeup=${decibelsToAmplitude(parameters.makeupGainDb)}`,
  `mix=${seconds(parameters.mix)}`,
  `link=${parameters.link}`,
  `detection=${parameters.detection}`,
].join(":");

const ambienceImpulseExpression = (decaySeconds, offset = 0) => {
  const tones = [149, 211, 307, 431].map((frequency, index) => `sin(2*PI*${frequency + offset * (index + 1)}*t)`).join("+");
  return `if(eq(n,0),1,0.055*exp(-6*t/${seconds(decaySeconds)})*(${tones}))`;
};

export const buildAdvancedMasteringFilters = (advancedMastering = {}, sampleRate = 48_000) => {
  const settings = normalizeAdvancedMastering(advancedMastering);
  const filters = [];
  if (settings.bypass) return { settings, filters };
  assertMasteringPrintPlan(createMasteringPrintPlan({ masteringPath: "advanced", advancedMastering: settings }));
  for (const [index, node] of settings.nodes.entries()) {
    if (node.bypass || node.unavailable) continue;
    const parameters = node.parameters;
    const tag = `plugin_${index}`;
    if (node.typeId === ADVANCED_PROCESSOR_TYPES.eq) {
      const filter = channelModeFilter(parameters.channelMode, eqFilter(parameters), tag);
      if (filter) filters.push(filter);
    } else if (node.typeId === ADVANCED_PROCESSOR_TYPES.compressor) {
      const core = compressorFilter(parameters);
      if (parameters.sidechainEnabled && parameters.channelMode === "stereo") filters.push(`asplit=2[${tag}_program][${tag}_detector];[${tag}_detector]highpass=f=${seconds(parameters.sidechainFilterHz)}:p=2[${tag}_sc];[${tag}_program][${tag}_sc]sidechaincompress=${core.slice("acompressor=".length)}`);
      else filters.push(channelModeFilter(parameters.channelMode, core, tag));
    } else if (node.typeId === ADVANCED_PROCESSOR_TYPES.output) {
      if (parameters.outputGainDb !== 0) filters.push(`volume=${seconds(parameters.outputGainDb)}dB`);
    } else if (node.typeId === ADVANCED_PROCESSOR_TYPES.limiter) {
      if (parameters.oversample > 1) filters.push(`aresample=${Math.min(384_000, sampleRate * parameters.oversample)}`);
      const limiterFilter = [
        `alimiter=limit=${decibelsToAmplitude(parameters.ceilingDbfs)}`,
        `attack=${seconds(parameters.attackMs)}`,
        `release=${seconds(parameters.releaseMs)}`,
        "level=false",
        "latency=true",
      ].join(":");
      if (parameters.stereoLinkPercent >= 99.5) filters.push(limiterFilter);
      else if (parameters.stereoLinkPercent <= 0.5) filters.push(`channelsplit=channel_layout=stereo[${tag}_left][${tag}_right];[${tag}_left]${limiterFilter}[${tag}_left_limited];[${tag}_right]${limiterFilter}[${tag}_right_limited];[${tag}_left_limited][${tag}_right_limited]join=inputs=2:channel_layout=stereo`);
      else {
        const linkedMix = seconds(parameters.stereoLinkPercent / 100);
        const independentMix = seconds(1 - parameters.stereoLinkPercent / 100);
        filters.push(`asplit=2[${tag}_linked_in][${tag}_independent_in];[${tag}_linked_in]${limiterFilter},volume=${linkedMix}[${tag}_linked_limited];[${tag}_independent_in]channelsplit=channel_layout=stereo[${tag}_left][${tag}_right];[${tag}_left]${limiterFilter}[${tag}_left_limited];[${tag}_right]${limiterFilter}[${tag}_right_limited];[${tag}_left_limited][${tag}_right_limited]join=inputs=2:channel_layout=stereo,volume=${independentMix}[${tag}_independent_limited];[${tag}_linked_limited][${tag}_independent_limited]amix=inputs=2:normalize=0`);
      }
      if (parameters.oversample > 1) filters.push(`aresample=${sampleRate}`);
    } else if (node.typeId === ADVANCED_PROCESSOR_TYPES.stereoField) {
      const midGain = decibelsToAmplitude(parameters.depthDb);
      const sideGain = decibelsToAmplitude(parameters.widthDb);
      filters.push(`stereotools=mode=lr>ms,channelsplit=channel_layout=stereo[${tag}_mid][${tag}_side];[${tag}_mid]volume=${midGain}[${tag}_mid_out];[${tag}_side]asplit=2[${tag}_side_low][${tag}_side_high];[${tag}_side_low]lowpass=f=${seconds(parameters.monoBelowHz)}:p=2,volume=0[${tag}_side_low_out];[${tag}_side_high]highpass=f=${seconds(parameters.monoBelowHz)}:p=2,lowshelf=f=${seconds(parameters.spaceFrequencyHz)}:g=${seconds(parameters.spaceDb)}:p=2,volume=${sideGain}[${tag}_side_high_out];[${tag}_side_low_out][${tag}_side_high_out]amix=inputs=2:normalize=0[${tag}_side_out];[${tag}_mid_out][${tag}_side_out]join=inputs=2:channel_layout=stereo,stereotools=mode=ms>lr:balance_out=${seconds(parameters.balance)}`);
    } else if (node.typeId === ADVANCED_PROCESSOR_TYPES.harmonicColor) {
      if (parameters.mix > 0 && parameters.driveDb > 0) {
        const threshold = Math.max(0.08, decibelsToAmplitude(-parameters.driveDb));
        const clipType = parameters.evenAmount > parameters.oddAmount ? "exp" : "tanh";
        const color = `highshelf=f=${seconds(parameters.colorFrequencyHz)}:g=${seconds(parameters.driveDb * 0.3)}:p=2,volume=${seconds(parameters.driveDb)}dB,asoftclip=type=${clipType}:threshold=${threshold}:output=${decibelsToAmplitude(-parameters.driveDb)}:oversample=${parameters.oversample}${parameters.outputGainDb ? `,volume=${seconds(parameters.outputGainDb)}dB` : ""}`;
        filters.push(parallelFilter(channelModeFilter(parameters.channelMode, color, `${tag}_mode`), parameters.mix, tag));
      } else if (parameters.outputGainDb !== 0) filters.push(`volume=${seconds(parameters.outputGainDb)}dB`);
    } else if (node.typeId === ADVANCED_PROCESSOR_TYPES.phaseAlignment) {
      const phaseMix = Math.abs(parameters.shift) * parameters.mix;
      const core = [
        parameters.shift !== 0 && `allpass=f=${seconds(parameters.centerFrequencyHz)}:t=q:w=${seconds(parameters.q)}:mix=${seconds(Math.abs(parameters.shift))}`,
        parameters.delaySamples > 0 && `adelay=delays=${seconds(parameters.delaySamples)}S:all=1`,
        parameters.polarityInvert && "volume=-1",
      ].filter(Boolean).join(",");
      if (core) filters.push(targetChannelFilter(parameters.target, parallelFilter(core, Math.max(phaseMix, parameters.delaySamples > 0 || parameters.polarityInvert ? parameters.mix : 0), `${tag}_mix`), tag));
    } else if (node.typeId === ADVANCED_PROCESSOR_TYPES.hfSmoother) {
      if (parameters.mix > 0) filters.push(`asplit=3[${tag}_dry][${tag}_low][${tag}_high];[${tag}_dry]volume=${seconds(1 - parameters.mix)}[${tag}_dry_out];[${tag}_low]lowpass=f=${seconds(parameters.frequencyHz)}:p=2[${tag}_low_out];[${tag}_high]highpass=f=${seconds(parameters.frequencyHz)}:p=2,acompressor=threshold=${decibelsToAmplitude(parameters.thresholdDb)}:ratio=${seconds(parameters.ratio)}:attack=${seconds(parameters.attackMs)}:release=${seconds(parameters.releaseMs)}:knee=3:mix=1[${tag}_high_out];[${tag}_low_out][${tag}_high_out]amix=inputs=2:normalize=0,volume=${seconds(parameters.mix)}[${tag}_processed];[${tag}_dry_out][${tag}_processed]amix=inputs=2:normalize=0${parameters.outputGainDb ? `,volume=${seconds(parameters.outputGainDb)}dB` : ""}`);
      else if (parameters.outputGainDb !== 0) filters.push(`volume=${seconds(parameters.outputGainDb)}dB`);
    } else if (node.typeId === ADVANCED_PROCESSOR_TYPES.ambience) {
      const wet = parameters.wetPercent / 100;
      if (wet > 0) {
        const dry = 1 - wet;
        const irLeft = ambienceImpulseExpression(parameters.decaySeconds, parameters.model === "plate" ? 23 : 0);
        const irRight = ambienceImpulseExpression(parameters.decaySeconds, parameters.model === "chamber" ? 17 : 11);
        const rightDelay = Math.max(0, Math.round(parameters.preDelayMs + (parameters.widthPercent - 100) * 0.08));
        filters.push(`asplit=2[${tag}_dry][${tag}_program];aevalsrc=exprs='${irLeft}|${irRight}':s=${sampleRate}:d=${seconds(parameters.decaySeconds)}[${tag}_ir];[${tag}_dry]volume=${seconds(dry)}[${tag}_dry_out];[${tag}_program]adelay=delays=${seconds(parameters.preDelayMs)}|${seconds(rightDelay)},highpass=f=${seconds(parameters.lowCutHz)}:p=2,lowpass=f=${seconds(parameters.dampingHz)}:p=2[${tag}_prepared];[${tag}_prepared][${tag}_ir]afir=dry=0:wet=1:gtype=peak:irfmt=input:maxir=${seconds(parameters.decaySeconds)},volume=${seconds(wet)}[${tag}_wet_out];[${tag}_dry_out][${tag}_wet_out]amix=inputs=2:normalize=0`);
      }
    } else if (node.typeId === ADVANCED_PROCESSOR_TYPES.transientShaper) {
      if (parameters.attackDb !== 0 || parameters.sustainDb !== 0 || parameters.outputGainDb !== 0) {
        const attackDelta = decibelsToAmplitude(parameters.attackDb) - 1;
        const sustainDelta = decibelsToAmplitude(parameters.sustainDb) - 1;
        const focus = parameters.mode === "focused" ? parameters.focusFrequencyHz : 80;
        filters.push(`asplit=3[${tag}_base][${tag}_attack][${tag}_sustain];[${tag}_attack]highpass=f=${seconds(focus)}:p=2,agate=mode=upward:range=0.2:threshold=0.08:ratio=2:attack=0.5:release=45,volume=${seconds(attackDelta)}[${tag}_attack_out];[${tag}_sustain]lowpass=f=${seconds(Math.max(400, focus * 4))}:p=2,acompressor=threshold=0.1:ratio=1.5:attack=80:release=450:mix=1,volume=${seconds(sustainDelta)}[${tag}_sustain_out];[${tag}_base][${tag}_attack_out][${tag}_sustain_out]amix=inputs=3:normalize=0${parameters.outputGainDb ? `,volume=${seconds(parameters.outputGainDb)}dB` : ""}`);
      }
    } else if (node.typeId === ADVANCED_PROCESSOR_TYPES.creativePhaser) {
      if (parameters.mix > 0 && parameters.depth > 0) {
        const delay = Math.min(5, Math.max(0.1, parameters.depth * 5));
        const decay = Math.min(0.8, Math.abs(parameters.feedback));
        const phaser = `aphaser=in_gain=1:out_gain=1:delay=${seconds(delay)}:decay=${seconds(decay)}:speed=${seconds(Math.max(0.1, parameters.rateHz))}:type=sinusoidal`;
        filters.push(parallelFilter(phaser, parameters.mix, tag));
      }
    }
  }
  return { settings, filters };
};

export const buildRenderGraph = (entries, { singleTrack = false, masterBus = {}, masteringPath = "basic", advancedMastering = {}, sampleRate = 48_000 } = {}) => {
  if (!entries.length) throw new Error("No playable audio is available to render.");
  const filters = [];
  const normalized = entries.map((entry, index) => {
    const segment = segmentFilter(entry, index, !singleTrack && index < entries.length - 1, singleTrack, sampleRate);
    filters.push(segment.filter);
    return { ...entry, settings: segment.settings };
  });

  let current = "t0";
  for (let index = 0; index < normalized.length - 1; index += 1) {
    const currentEntry = normalized[index];
    const nextEntry = normalized[index + 1];
    const output = `joined${index}`;
    if (currentEntry.settings.endMode === "crossfade") {
      const overlap = Math.min(currentEntry.settings.endDuration, currentEntry.settings.duration - 0.05, nextEntry.settings.duration - 0.05);
      filters.push(`[${current}][t${index + 1}]acrossfade=d=${seconds(overlap)}:c1=qsin:c2=qsin[${output}]`);
    } else if (currentEntry.settings.gapAfter > 0) {
      filters.push(`anullsrc=r=${sampleRate}:cl=stereo,atrim=duration=${seconds(currentEntry.settings.gapAfter)}[gap${index}]`);
      filters.push(`[${current}][gap${index}][t${index + 1}]concat=n=3:v=0:a=1[${output}]`);
    } else {
      filters.push(`[${current}][t${index + 1}]concat=n=2:v=0:a=1[${output}]`);
    }
    current = output;
  }
  const activePath = normalizeMasteringPath(masteringPath);
  const masteringPrintPlan = assertMasteringPrintPlan(createMasteringPrintPlan({ masterBus, masteringPath: activePath, advancedMastering }));
  const master = activePath === "advanced" ? buildAdvancedMasteringFilters(advancedMastering, sampleRate) : buildMasterBusFilters(masterBus);
  if (master.filters.length) {
    filters.push(`[${current}]${master.filters.join(",")}[mastered]`);
    current = "mastered";
  }
  return { filterComplex: filters.join(";"), outputLabel: current, normalized, masteringPath: activePath, masterBus: normalizeMasterBus(masterBus), advancedMastering: normalizeAdvancedMastering(advancedMastering), masteringPrintPlan };
};

export const createIndividualTrackSegments = (timeline) => timeline.map((entry, index) => {
  const previous = timeline[index - 1];
  const next = timeline[index + 1];
  const programStart = !previous
    ? 0
    : previous.overlap > 0
      ? entry.outputStart + previous.overlap / 2
      : entry.outputStart;
  const programEnd = !next
    ? entry.outputEnd
    : entry.overlap > 0
      ? next.outputStart + entry.overlap / 2
      : next.outputStart;
  return {
    ...entry,
    trackNumber: index + 1,
    programStart,
    programEnd,
    fileDuration: Math.max(0.05, programEnd - programStart),
    startsInsideCrossfade: Boolean(previous?.overlap),
    endsInsideCrossfade: Boolean(entry.overlap),
  };
});

const buildIndividualTrackOutputGraph = (graph, segments) => {
  const branches = [];
  const inputs = segments.map((_, index) => `delivery_track_input_${index}`);
  if (segments.length === 1) branches.push(`[${graph.outputLabel}]anull[${inputs[0]}]`);
  else branches.push(`[${graph.outputLabel}]asplit=${segments.length}${inputs.map((label) => `[${label}]`).join("")}`);
  for (const [index, segment] of segments.entries()) {
    branches.push(`[${inputs[index]}]atrim=start=${seconds(segment.programStart)}:end=${seconds(segment.programEnd)},asetpts=PTS-STARTPTS[delivery_track_${index}]`);
  }
  return `${graph.filterComplex};${branches.join(";")}`;
};

const formatCueTime = (time) => {
  const minutes = Math.floor(time / 60);
  const remainder = time - minutes * 60;
  return `${minutes.toString().padStart(2, "0")}:${remainder.toFixed(3).padStart(6, "0")}`;
};

const createCueSheet = ({ album, timeline, masteringPath, masterBus, masteringPrintPlan, audioName, audioFiles = [], audioSettings, createdAt, warnings }) => {
  const masterSummary = masteringPath === "advanced"
    ? masteringPrintPlan.summary
    : masterBus.bypass ? "bypassed" : `EQ ${masterBus.eq.enabled ? "on" : "off"} · compressor ${masterBus.compressor.enabled ? "on" : "off"} · output ${formatDb(masterBus.outputGainDb)} · limiter ${masterBus.limiter.enabled ? `${masterBus.limiter.ceilingDbfs} dBFS` : "off"}`;
  const lines = [
    `${album.artist} — ${album.title}`,
    `Rendered: ${createdAt}`,
    `Audio: ${audioName}`,
    `Format: ${audioExportSummary(audioSettings)}`,
    `${masteringPath === "advanced" ? "MASTER path" : "MASTER bus"}: ${masterSummary}`,
    ...(masteringPath === "advanced" && masteringPrintPlan.inactiveProcessors.length
      ? [`Rack out of circuit: ${masteringPrintPlan.inactiveProcessors.map((processor) => `${processor.label} (${processor.reason})`).join(" · ")}`]
      : []),
    ...(audioFiles.length
      ? [
        "",
        "DELIVERY FILES",
        ...audioFiles.map((file) => `${String(file.trackNumber).padStart(2, "0")}. ${file.audioName} · program ${formatCueTime(file.programStart)} → ${formatCueTime(file.programEnd)}`),
      ]
      : []),
    "",
    "PROGRAM CUES",
  ];
  timeline.forEach((entry, index) => {
    lines.push(`${index + 1}. ${formatCueTime(entry.outputStart)}  ${entry.track.title}`);
    lines.push(`   Source ${formatCueTime(entry.settings.trimStart)} → ${formatCueTime(entry.settings.trimEnd)} · gain ${formatDb(entry.settings.gainDb)} · ${entry.settings.endMode}${entry.overlap ? ` ${entry.overlap.toFixed(3)}s` : ""}${entry.settings.gapAfter ? ` · gap ${entry.settings.gapAfter.toFixed(3)}s` : ""}`);
  });
  if (warnings.length) lines.push("", "WARNINGS", ...warnings.map((warning) => `- ${warning}`));
  return `${lines.join("\n")}\n`;
};

export const buildPreviewEntries = (entries, selectedIndex, previewPart) => {
  const selected = entries[selectedIndex];
  if (!selected) throw new Error("Choose a playable track to preview.");
  const settings = normalizeMastering(selected.mastering, selected.sourceDuration, { hasNext: selectedIndex < entries.length - 1 });
  if (previewPart === "start") {
    return [{
      ...selected,
      mastering: {
        ...selected.mastering,
        trimStart: settings.trimStart,
        trimEnd: Math.min(settings.trimEnd, settings.trimStart + 15),
        endMode: "natural",
        gapAfter: 0,
      },
    }];
  }
  const transitionPreview = previewPart === "transition";
  const previewStart = Math.max(settings.trimStart, settings.trimEnd - Math.max(transitionPreview ? 15 : 12, settings.endDuration + 4));
  const previewSelected = { ...selected, mastering: { ...selected.mastering, trimStart: previewStart, trimEnd: settings.trimEnd, fadeIn: 0 } };
  if (transitionPreview) {
    const next = entries[selectedIndex + 1];
    if (!next) throw new Error("Choose a track with a playable next track for a transition preview.");
    return [previewSelected, next];
  }
  if (settings.endMode !== "crossfade" || !entries[selectedIndex + 1]) return [previewSelected];
  const next = entries[selectedIndex + 1];
  const nextSettings = normalizeMastering(next.mastering, next.sourceDuration, { hasNext: selectedIndex + 1 < entries.length - 1 });
  const nextPreviewEnd = Math.min(nextSettings.trimEnd, nextSettings.trimStart + Math.max(12, settings.endDuration + 4));
  return [previewSelected, { ...next, mastering: { ...next.mastering, trimStart: nextSettings.trimStart, trimEnd: nextPreviewEnd, fadeIn: nextSettings.fadeIn } }];
};

export const renderAudio = async ({ album, scope, trackId, candidateId = "", format, sampleRate, bitDepth, bitrateKbps, previewPart = "end", deliveryProfileId = "", getLibraryFile, outputRoot, signal, timeoutMs, onProgress = () => {} }) => {
  throwIfCancelled(signal);
  if (!album?.id || !Array.isArray(album.tracks)) throw new Error("Choose a valid album to render.");
  if (!RENDER_SCOPES.has(scope)) throw new Error("Choose a valid render scope.");
  if (scope === "preview" && !PREVIEW_PARTS.has(previewPart)) throw new Error("Choose a valid preview type.");
  const previewDerivative = ["preview", "comparison"].includes(scope);
  const resolvedAudio = resolveAudioExportSettings(previewDerivative
    ? { format: "mp3", sampleRate: 48_000, bitrateKbps: 192 }
    : { format, sampleRate, bitDepth, bitrateKbps });
  if (!resolvedAudio.ok) throw new Error(resolvedAudio.issues.join(" "));
  const audioSettings = resolvedAudio.settings;
  const renderFormat = audioSettings.format;
  const delivery = validateDeliveryRequest({ profileId: deliveryProfileId, scope });
  if (!delivery.ok) throw new Error(delivery.issues.join(" "));

  const sequence = album.tracks.filter((track) => track.inSequence !== false);
  const missing = [];
  const playable = sequence.flatMap((track) => {
    const entry = resolveTrackEntry(track, getLibraryFile);
    if (!entry) missing.push(track.title);
    return entry ? [entry] : [];
  });
  const comparisonEntry = scope === "comparison"
    ? resolveCandidateEntry(album.tracks.find((track) => track.id === trackId), candidateId, getLibraryFile)
    : null;
  if (scope === "comparison" && !comparisonEntry) throw new Error("Choose an indexed comparison candidate.");
  if (!playable.length && scope !== "comparison") throw new Error("This album has no playable sequenced tracks.");
  if (scope === "tracks" && missing.length) throw new Error(`Every sequenced track needs an indexed audition source before separate tracks can be printed. Missing: ${missing.join(", ")}.`);

  const selectedIndex = playable.findIndex((entry) => entry.track.id === trackId);
  let entries;
  if (["album", "tracks"].includes(scope)) entries = playable;
  else if (scope === "preview") entries = buildPreviewEntries(playable, selectedIndex, previewPart);
  else if (scope === "comparison") entries = [comparisonEntry];
  else {
    if (selectedIndex < 0) throw new Error("The selected track has no playable audition source.");
    entries = [playable[selectedIndex]];
  }

  const singleTrack = scope !== "tracks" && entries.length === 1;
  const graph = buildRenderGraph(entries, { singleTrack, masterBus: album.masterBus, masteringPath: album.masteringPath, advancedMastering: album.advancedMastering, sampleRate: audioSettings.sampleRate });
  const timeline = calculateProgramTimeline(entries);
  const individualTrackSegments = scope === "tracks" ? createIndividualTrackSegments(timeline) : [];
  const expectedDuration = timeline.at(-1)?.outputEnd || 0;
  const createdAt = new Date().toISOString();
  const id = randomUUID();
  const day = createdAt.slice(0, 10);
  const time = createdAt.slice(11, 19).replaceAll(":", "");
  const previewName = previewPart === "start" ? "start" : previewPart === "transition" ? "transition" : "ending";
  const scopeName = scope === "album" ? "album-program" : scope === "tracks" ? "numbered-tracks" : scope === "track" ? slugify(entries[0].track.title) : scope === "comparison" ? "matched-comparison-preview" : `${previewName}-preview`;
  const directory = previewDerivative
    ? path.join(outputRoot, ".previews", id)
    : path.join(outputRoot, day, `${slugify(album.title)}-${scopeName}-${time}-${id.slice(0, 6)}`);
  onProgress(5, "preparing");
  await mkdir(directory, { recursive: true });
  const audioName = scope === "tracks"
    ? `${individualTrackSegments.length} numbered ${renderFormat.toUpperCase()} track files`
    : `${slugify(album.artist)}-${slugify(album.title)}-${scopeName}.${renderFormat}`;
  const individualAudioFiles = individualTrackSegments.map((segment) => {
    const fileName = numberedTrackFilename({ trackNumber: segment.trackNumber, totalTracks: individualTrackSegments.length, title: segment.track.title, format: renderFormat });
    return {
      trackId: segment.track.id,
      trackNumber: segment.trackNumber,
      title: segment.track.title,
      audioName: fileName,
      audioPath: path.join(directory, fileName),
      temporaryPath: path.join(directory, `${path.basename(fileName, `.${renderFormat}`)}.part.${renderFormat}`),
      programStart: segment.programStart,
      programEnd: segment.programEnd,
      duration: segment.fileDuration,
      startsInsideCrossfade: segment.startsInsideCrossfade,
      endsInsideCrossfade: segment.endsInsideCrossfade,
    };
  });
  const audioPath = scope === "tracks" ? individualAudioFiles[0].audioPath : path.join(directory, audioName);
  const temporaryPath = scope === "tracks" ? individualAudioFiles[0].temporaryPath : path.join(directory, `${path.basename(audioName, `.${renderFormat}`)}.part.${renderFormat}`);

  try {
    const argumentsList = ["-hide_banner", "-loglevel", "error", "-y"];
    entries.forEach((entry) => argumentsList.push("-i", entry.file.absolutePath));
    const filterComplex = scope === "tracks"
      ? buildIndividualTrackOutputGraph(graph, individualTrackSegments)
      : scope === "comparison"
      ? `${graph.filterComplex};[${graph.outputLabel}]loudnorm=I=-18:TP=-2:LRA=11[matched]`
      : graph.filterComplex;
    const outputLabel = scope === "comparison" ? "matched" : graph.outputLabel;
    argumentsList.push("-filter_complex", filterComplex);
    const appendAudioOutput = ({ label, title, trackNumber = 0, totalTracks = 0, filePath }) => {
      argumentsList.push("-map", `[${label}]`, "-vn");
      argumentsList.push(...audioEncodingArguments(audioSettings));
      argumentsList.push("-metadata", `artist=${album.artist}`, "-metadata", `album=${album.title}`, "-metadata", `title=${title}`);
      if (trackNumber > 0) argumentsList.push("-metadata", `track=${trackNumber}/${totalTracks}`);
      argumentsList.push(filePath);
    };
    if (scope === "tracks") {
      individualAudioFiles.forEach((file, index) => appendAudioOutput({
        label: `delivery_track_${index}`,
        title: file.title,
        trackNumber: file.trackNumber,
        totalTracks: individualAudioFiles.length,
        filePath: file.temporaryPath,
      }));
    } else {
      appendAudioOutput({
        label: outputLabel,
        title: scope === "album" ? `${album.title} — Album Program` : entries[0].track.title,
        filePath: temporaryPath,
      });
    }
    onProgress(10, "rendering");
    const renderExpectedDuration = scope === "tracks" ? Math.max(...individualAudioFiles.map((file) => file.duration)) : expectedDuration;
    await runFfmpeg(argumentsList, { signal, timeoutMs, expectedDuration: renderExpectedDuration, onProgress });
    throwIfCancelled(signal);
    if (scope === "tracks") await Promise.all(individualAudioFiles.map((file) => rename(file.temporaryPath, file.audioPath)));
    else await rename(temporaryPath, audioPath);
    onProgress(92, "documenting");

    const warnings = [
      ...(missing.length && scope === "album" ? [`Skipped missing audio: ${missing.join(", ")}.`] : []),
      ...(scope === "tracks" && timeline.some((entry) => entry.overlap > 0)
        ? ["Crossfades were divided at their midpoint so playing the numbered files gaplessly rebuilds the continuous mastered program."]
        : []),
    ];
    const completedAudioFiles = scope === "tracks"
      ? await Promise.all(individualAudioFiles.map(async (file) => ({ ...file, size: (await stat(file.audioPath)).size })))
      : [];
    let cuePath = "";
    let manifestPath = "";
    if (!previewDerivative) {
      const documentationBaseName = scope === "tracks" ? `${slugify(album.artist)}-${slugify(album.title)}-numbered-tracks` : path.basename(audioName, `.${renderFormat}`);
      cuePath = path.join(directory, `${documentationBaseName}-cue-sheet.txt`);
      manifestPath = path.join(directory, `${documentationBaseName}-render-manifest.json`);
      await writeFile(cuePath, createCueSheet({ album, timeline, masteringPath: graph.masteringPath, masterBus: graph.masterBus, masteringPrintPlan: graph.masteringPrintPlan, audioName, audioFiles: completedAudioFiles, audioSettings, createdAt, warnings }));
      await writeFile(manifestPath, `${JSON.stringify({
        schemaVersion: 5,
        renderId: id,
        createdAt,
        album: { id: album.id, artist: album.artist, title: album.title },
        scope,
        format: renderFormat,
        audioSettings,
        delivery: {
          profileId: delivery.profile?.id || "",
          profileName: delivery.profile?.name || "Unprofiled print",
          requirementsValidated: true,
          masterApproved: Boolean(album.delivery?.masterApproved),
          readyToPublish: Boolean(album.delivery?.readyToPublish),
        },
        audioFile: scope === "tracks" ? completedAudioFiles[0].audioName : audioName,
        ...(scope === "tracks" ? {
          displayName: audioName,
          audioFiles: completedAudioFiles.map((file) => ({
            trackId: file.trackId,
            trackNumber: file.trackNumber,
            title: file.title,
            fileName: file.audioName,
            size: file.size,
            programStart: file.programStart,
            programEnd: file.programEnd,
            duration: file.duration,
            startsInsideCrossfade: file.startsInsideCrossfade,
            endsInsideCrossfade: file.endsInsideCrossfade,
          })),
          boundaryPolicy: "crossfade-midpoint",
        } : {}),
        warnings,
        masterBus: graph.masterBus,
        masteringPath: graph.masteringPath,
        masteringPrintPlan: graph.masteringPrintPlan,
        advancedMastering: graph.advancedMastering,
        tracks: timeline.map((entry, index) => ({
          id: entry.track.id,
          title: entry.track.title,
          trackNumber: index + 1,
          ...(scope === "tracks" ? { audioFile: completedAudioFiles[index].audioName } : {}),
          candidateId: entry.candidate.id,
          sourceRef: entry.candidate.sourceRef,
          trimStart: entry.settings.trimStart,
          trimEnd: entry.settings.trimEnd,
          fadeIn: entry.settings.fadeIn,
          gainDb: entry.settings.gainDb,
          endMode: entry.settings.endMode,
          endDuration: entry.settings.endDuration,
          gapAfter: entry.settings.gapAfter,
          outputStart: entry.outputStart,
          outputEnd: entry.outputEnd,
        })),
      }, null, 2)}\n`);
    }
    throwIfCancelled(signal);
    const fileStat = scope === "tracks" ? { size: completedAudioFiles.reduce((total, file) => total + file.size, 0) } : await stat(audioPath);
    onProgress(100, "completed");
    return { id, scope, format: renderFormat, audioSettings, audioPath, audioFiles: completedAudioFiles, cuePath, manifestPath, outputDirectory: directory, audioName, size: fileStat.size, warnings, createdAt, derivativeLabel: scope === "comparison" ? "Loudness-matched preview derivative" : "", masteringPrintPlan: graph.masteringPrintPlan };
  } catch (error) {
    await rm(directory, { recursive: true, force: true });
    throw error;
  }
};
