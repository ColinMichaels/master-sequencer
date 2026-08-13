import { calculateProgramTimeline, normalizeMastering } from "./mastering.js";

const clamp = (value, minimum, maximum) => Math.min(maximum, Math.max(minimum, value));

export const buildLiveSequenceEntries = (album, fileForTrack, startIndex = 0) => {
  const candidates = (album?.tracks || []).slice(startIndex).map((track, offset) => ({
    file: fileForTrack(track),
    trackTitle: track.title,
    albumTitle: album.title,
    track,
    index: startIndex + offset,
  }));
  const playable = candidates.filter((entry) => entry.file);
  const timeline = calculateProgramTimeline(playable.map((entry) => ({
    ...entry,
    sourceDuration: entry.file.duration,
    mastering: entry.track.mastering,
  })));

  return timeline.map((entry, index) => ({
    file: entry.file,
    trackTitle: entry.trackTitle,
    albumTitle: entry.albumTitle,
    track: entry.track,
    index: entry.index,
    settings: entry.settings,
    startAt: entry.settings.trimStart,
    endAt: entry.settings.trimEnd,
    overlap: entry.overlap,
    nextTrackTitle: timeline[index + 1]?.trackTitle || "",
  }));
};

export const liveEnvelopeGainAt = (settings = {}, sourceTime = 0, { crossfadeStart = null, crossfadeDuration = 0 } = {}) => {
  const normalized = settings.duration
    ? settings
    : normalizeMastering(settings, Math.max(Number(settings.trimEnd) || 0.1, 0.1));
  const time = clamp(Number(sourceTime) || 0, normalized.trimStart, normalized.trimEnd);
  let gain = 1;

  if (normalized.fadeIn > 0 && time < normalized.trimStart + normalized.fadeIn) {
    const progress = clamp((time - normalized.trimStart) / normalized.fadeIn, 0, 1);
    gain *= Math.sin(progress * Math.PI * 0.5);
  }

  if (["fade", "crossfade"].includes(normalized.endMode) && normalized.endDuration > 0) {
    const fadeStart = normalized.trimEnd - normalized.endDuration;
    if (time >= fadeStart) {
      const progress = clamp((time - fadeStart) / normalized.endDuration, 0, 1);
      gain *= Math.cos(progress * Math.PI * 0.5);
    }
  }

  if (Number.isFinite(crossfadeStart) && crossfadeDuration > 0 && time < crossfadeStart + crossfadeDuration) {
    const progress = clamp((time - crossfadeStart) / crossfadeDuration, 0, 1);
    gain *= Math.sin(progress * Math.PI * 0.5);
  }

  return clamp(gain, 0, 1);
};

export const liveTransitionSourceTime = (entry) => Math.max(
  entry?.settings?.trimStart || 0,
  (entry?.settings?.trimEnd || 0) - (entry?.overlap || 0),
);
