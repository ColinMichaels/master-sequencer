export const AFTER_TRACK_MODES = Object.freeze({
  AUTO_NEXT: "auto-next",
  CUE_NEXT: "cue-next",
  RESET_CURRENT: "reset-current",
  LOOP_CURRENT: "loop-current",
});

export const AFTER_TRACK_OPTIONS = Object.freeze([
  { value: AFTER_TRACK_MODES.AUTO_NEXT, label: "Auto next · seamless" },
  { value: AFTER_TRACK_MODES.CUE_NEXT, label: "Cue next · pause" },
  { value: AFTER_TRACK_MODES.RESET_CURRENT, label: "Reset current · pause" },
  { value: AFTER_TRACK_MODES.LOOP_CURRENT, label: "Loop current" },
]);

export const AFTER_TRACK_STORAGE_KEY = "project-sequencer:after-track-mode:v1";

const VALID_AFTER_TRACK_MODES = new Set(AFTER_TRACK_OPTIONS.map(({ value }) => value));

export const normalizeAfterTrackMode = (value) => (
  VALID_AFTER_TRACK_MODES.has(value) ? value : AFTER_TRACK_MODES.AUTO_NEXT
);

const browserStorage = (storage) => {
  if (storage) return storage;
  if (typeof window === "undefined") return null;
  return window.localStorage;
};

export const readAfterTrackMode = (storage) => {
  try {
    return normalizeAfterTrackMode(browserStorage(storage)?.getItem(AFTER_TRACK_STORAGE_KEY));
  } catch {
    return AFTER_TRACK_MODES.AUTO_NEXT;
  }
};

export const writeAfterTrackMode = (value, storage) => {
  const normalized = normalizeAfterTrackMode(value);
  try {
    const target = browserStorage(storage);
    if (!target) return normalized;
    target.setItem(AFTER_TRACK_STORAGE_KEY, normalized);
  } catch {
    // Playback remains usable when browser storage is unavailable.
  }
  return normalized;
};
