import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import { mkdir, rename, rm, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { calculateProgramTimeline, normalizeMasterBus, normalizeMastering } from "../src/lib/mastering.js";
import { sourceKey } from "./audio-library.mjs";

const AUDIO_FORMATS = new Set(["wav", "mp3"]);
const RENDER_SCOPES = new Set(["album", "track", "preview", "comparison"]);
const PREVIEW_PARTS = new Set(["start", "end", "transition"]);

const slugify = (value) => value
  .toLowerCase()
  .replace(/[^a-z0-9]+/g, "-")
  .replace(/^-|-$/g, "") || "audio";

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
  const child = spawn("ffmpeg", [...argumentsList.slice(0, -1), "-progress", "pipe:3", "-nostats", argumentsList.at(-1)], { stdio: ["ignore", "ignore", "pipe", "pipe"] });
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

const segmentFilter = (entry, index, hasNext, forceFadeForCrossfade = false) => {
  const settings = normalizeMastering(entry.mastering, entry.sourceDuration, { hasNext });
  const filters = [
    `atrim=start=${seconds(settings.trimStart)}:end=${seconds(settings.trimEnd)}`,
    "asetpts=PTS-STARTPTS",
    "aresample=48000",
    "aformat=sample_fmts=fltp:sample_rates=48000:channel_layouts=stereo",
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

export const buildRenderGraph = (entries, { singleTrack = false, masterBus = {} } = {}) => {
  if (!entries.length) throw new Error("No playable audio is available to render.");
  const filters = [];
  const normalized = entries.map((entry, index) => {
    const segment = segmentFilter(entry, index, !singleTrack && index < entries.length - 1, singleTrack);
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
      filters.push(`anullsrc=r=48000:cl=stereo,atrim=duration=${seconds(currentEntry.settings.gapAfter)}[gap${index}]`);
      filters.push(`[${current}][gap${index}][t${index + 1}]concat=n=3:v=0:a=1[${output}]`);
    } else {
      filters.push(`[${current}][t${index + 1}]concat=n=2:v=0:a=1[${output}]`);
    }
    current = output;
  }
  const master = buildMasterBusFilters(masterBus);
  if (master.filters.length) {
    filters.push(`[${current}]${master.filters.join(",")}[mastered]`);
    current = "mastered";
  }
  return { filterComplex: filters.join(";"), outputLabel: current, normalized, masterBus: master.settings };
};

const formatCueTime = (time) => {
  const minutes = Math.floor(time / 60);
  const remainder = time - minutes * 60;
  return `${minutes.toString().padStart(2, "0")}:${remainder.toFixed(3).padStart(6, "0")}`;
};

const createCueSheet = ({ album, timeline, masterBus, audioName, format, createdAt, warnings }) => {
  const lines = [
    `${album.artist} — ${album.title}`,
    `Rendered: ${createdAt}`,
    `Audio: ${audioName}`,
    `Format: ${format === "wav" ? "WAV · 24-bit PCM · 48 kHz" : "MP3 · 320 kbps · 48 kHz"}`,
    `MASTER bus: ${masterBus.bypass ? "bypassed" : `EQ ${masterBus.eq.enabled ? "on" : "off"} · compressor ${masterBus.compressor.enabled ? "on" : "off"} · output ${formatDb(masterBus.outputGainDb)} · limiter ${masterBus.limiter.enabled ? `${masterBus.limiter.ceilingDbfs} dBFS` : "off"}`}`,
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

export const renderAudio = async ({ album, scope, trackId, candidateId = "", format, previewPart = "end", getLibraryFile, outputRoot, signal, timeoutMs, onProgress = () => {} }) => {
  throwIfCancelled(signal);
  if (!album?.id || !Array.isArray(album.tracks)) throw new Error("Choose a valid album to render.");
  if (!RENDER_SCOPES.has(scope)) throw new Error("Choose a valid render scope.");
  if (!AUDIO_FORMATS.has(format)) throw new Error("Choose WAV or MP3 output.");
  if (scope === "preview" && !PREVIEW_PARTS.has(previewPart)) throw new Error("Choose a valid preview type.");

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

  const selectedIndex = playable.findIndex((entry) => entry.track.id === trackId);
  let entries;
  if (scope === "album") entries = playable;
  else if (scope === "preview") entries = buildPreviewEntries(playable, selectedIndex, previewPart);
  else if (scope === "comparison") entries = [comparisonEntry];
  else {
    if (selectedIndex < 0) throw new Error("The selected track has no playable audition source.");
    entries = [playable[selectedIndex]];
  }

  const previewDerivative = ["preview", "comparison"].includes(scope);
  const renderFormat = previewDerivative ? "mp3" : format;
  const singleTrack = entries.length === 1;
  const graph = buildRenderGraph(entries, { singleTrack, masterBus: album.masterBus });
  const timeline = calculateProgramTimeline(entries);
  const expectedDuration = timeline.at(-1)?.outputEnd || 0;
  const createdAt = new Date().toISOString();
  const id = randomUUID();
  const day = createdAt.slice(0, 10);
  const time = createdAt.slice(11, 19).replaceAll(":", "");
  const previewName = previewPart === "start" ? "start" : previewPart === "transition" ? "transition" : "ending";
  const scopeName = scope === "album" ? "album-program" : scope === "track" ? slugify(entries[0].track.title) : scope === "comparison" ? "matched-comparison-preview" : `${previewName}-preview`;
  const directory = previewDerivative
    ? path.join(outputRoot, ".previews", id)
    : path.join(outputRoot, day, `${slugify(album.title)}-${scopeName}-${time}-${id.slice(0, 6)}`);
  onProgress(5, "preparing");
  await mkdir(directory, { recursive: true });
  const audioName = `${slugify(album.artist)}-${slugify(album.title)}-${scopeName}.${renderFormat}`;
  const audioPath = path.join(directory, audioName);
  const temporaryPath = path.join(directory, `${path.basename(audioName, `.${renderFormat}`)}.part.${renderFormat}`);

  try {
    const argumentsList = ["-hide_banner", "-loglevel", "error", "-y"];
    entries.forEach((entry) => argumentsList.push("-i", entry.file.absolutePath));
    const filterComplex = scope === "comparison"
      ? `${graph.filterComplex};[${graph.outputLabel}]loudnorm=I=-18:TP=-2:LRA=11[matched]`
      : graph.filterComplex;
    const outputLabel = scope === "comparison" ? "matched" : graph.outputLabel;
    argumentsList.push("-filter_complex", filterComplex, "-map", `[${outputLabel}]`, "-vn");
    if (renderFormat === "wav") argumentsList.push("-c:a", "pcm_s24le", "-ar", "48000");
    else argumentsList.push("-c:a", "libmp3lame", "-b:a", previewDerivative ? "192k" : "320k", "-ar", "48000", "-id3v2_version", "3");
    argumentsList.push("-metadata", `artist=${album.artist}`, "-metadata", `album=${album.title}`, "-metadata", `title=${scope === "album" ? `${album.title} — Album Program` : entries[0].track.title}`, temporaryPath);
    onProgress(10, "rendering");
    await runFfmpeg(argumentsList, { signal, timeoutMs, expectedDuration, onProgress });
    throwIfCancelled(signal);
    await rename(temporaryPath, audioPath);
    onProgress(92, "documenting");

    const warnings = missing.length && scope === "album" ? [`Skipped missing audio: ${missing.join(", ")}.`] : [];
    let cuePath = "";
    let manifestPath = "";
    if (!previewDerivative) {
      cuePath = path.join(directory, `${path.basename(audioName, `.${renderFormat}`)}-cue-sheet.txt`);
      manifestPath = path.join(directory, `${path.basename(audioName, `.${renderFormat}`)}-render-manifest.json`);
      await writeFile(cuePath, createCueSheet({ album, timeline, masterBus: graph.masterBus, audioName, format: renderFormat, createdAt, warnings }));
      await writeFile(manifestPath, `${JSON.stringify({
        schemaVersion: 2,
        renderId: id,
        createdAt,
        album: { id: album.id, artist: album.artist, title: album.title },
        scope,
        format: renderFormat,
        audioFile: audioName,
        warnings,
        masterBus: graph.masterBus,
        tracks: timeline.map((entry) => ({
          id: entry.track.id,
          title: entry.track.title,
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
    const fileStat = await stat(audioPath);
    onProgress(100, "completed");
    return { id, scope, format: renderFormat, audioPath, cuePath, manifestPath, outputDirectory: directory, audioName, size: fileStat.size, warnings, createdAt, derivativeLabel: scope === "comparison" ? "Loudness-matched preview derivative" : "" };
  } catch (error) {
    await rm(directory, { recursive: true, force: true });
    throw error;
  }
};
