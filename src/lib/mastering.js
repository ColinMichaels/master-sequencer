export const END_MODES = new Set(["natural", "cut", "fade", "crossfade"]);

const finiteNumber = (value, fallback) => {
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};

const clamp = (value, minimum, maximum) => Math.min(maximum, Math.max(minimum, value));

export const normalizeMastering = (settings = {}, sourceDuration = 0, { hasNext = true } = {}) => {
  const safeDuration = Math.max(0.1, finiteNumber(sourceDuration, 0.1));
  const trimStart = clamp(finiteNumber(settings.trimStart, 0), 0, Math.max(0, safeDuration - 0.1));
  const requestedEnd = settings.trimEnd === null || settings.trimEnd === undefined || settings.trimEnd === ""
    ? safeDuration
    : finiteNumber(settings.trimEnd, safeDuration);
  const trimEnd = clamp(requestedEnd, trimStart + 0.1, safeDuration);
  const duration = trimEnd - trimStart;
  const fadeIn = clamp(finiteNumber(settings.fadeIn, 0), 0, Math.max(0, duration - 0.05));
  const requestedMode = END_MODES.has(settings.endMode) ? settings.endMode : "natural";
  const endMode = requestedMode === "crossfade" && !hasNext ? "fade" : requestedMode;
  const endDuration = clamp(finiteNumber(settings.endDuration, 3), 0.05, Math.max(0.05, duration - 0.01));
  const gapAfter = endMode === "crossfade" ? 0 : clamp(finiteNumber(settings.gapAfter, 0), 0, 30);

  return { trimStart, trimEnd, duration, fadeIn, endMode, endDuration, gapAfter };
};

export const calculateProgramTimeline = (entries) => {
  const normalizedSettings = entries.map((entry, index) => normalizeMastering(entry.mastering, entry.sourceDuration, { hasNext: index < entries.length - 1 }));
  let cursor = 0;
  return entries.map((entry, index) => {
    const settings = normalizedSettings[index];
    const nextDuration = normalizedSettings[index + 1]?.duration || 0;
    const overlap = settings.endMode === "crossfade" && index < entries.length - 1
      ? Math.min(settings.endDuration, settings.duration - 0.05, Math.max(0, nextDuration - 0.05))
      : 0;
    const result = { ...entry, settings, outputStart: cursor, outputEnd: cursor + settings.duration, overlap };
    cursor += settings.duration - overlap + settings.gapAfter;
    return result;
  });
};

export const programDuration = (entries) => {
  const timeline = calculateProgramTimeline(entries);
  if (!timeline.length) return 0;
  const last = timeline[timeline.length - 1];
  return last.outputEnd;
};

export const masteringSummary = (settings = {}) => {
  const mode = END_MODES.has(settings.endMode) ? settings.endMode : "natural";
  if (mode === "crossfade") return `${finiteNumber(settings.endDuration, 3).toFixed(1)}s crossfade`;
  if (mode === "fade") return `${finiteNumber(settings.endDuration, 3).toFixed(1)}s fade out`;
  if (mode === "cut") return "Hard cut";
  return finiteNumber(settings.gapAfter, 0) > 0 ? `Natural · ${finiteNumber(settings.gapAfter, 0).toFixed(1)}s gap` : "Natural ending";
};
