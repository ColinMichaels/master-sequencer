export const DEFAULT_APPEARANCE = Object.freeze({
  mode: "dark",
  colorTheme: "signal",
  fontTheme: "condensed",
  textScale: 1,
});

export const APPEARANCE_MODES = Object.freeze([
  { id: "dark", label: "Dark", description: "Low-light studio view" },
  { id: "light", label: "Light", description: "Bright daylight view" },
  { id: "system", label: "System", description: "Follow this Mac" },
]);

export const COLOR_THEMES = Object.freeze([
  { id: "signal", label: "Signal", description: "Original lime, gold, and orange" },
  { id: "ocean", label: "Ocean", description: "Cyan, blue, and coral" },
  { id: "ember", label: "Ember", description: "Amber, cream, and red" },
  { id: "violet", label: "Violet", description: "Purple, gold, and rose" },
]);

export const FONT_THEMES = Object.freeze([
  { id: "condensed", label: "Condensed", description: "Original production-board pairing", sample: "Sequence 01" },
  { id: "modern", label: "Modern", description: "Clean, open, and neutral", sample: "Sequence 01" },
  { id: "editorial", label: "Editorial", description: "Album-notes character with a serif lead", sample: "Sequence 01" },
  { id: "mono", label: "Studio Mono", description: "Technical cue-sheet pairing", sample: "Sequence 01" },
]);

export const TEXT_SCALES = Object.freeze([0.9, 1, 1.1, 1.2]);

const valueSet = (options) => new Set(options.map((option) => option.id));
const MODE_IDS = valueSet(APPEARANCE_MODES);
const COLOR_IDS = valueSet(COLOR_THEMES);
const FONT_IDS = valueSet(FONT_THEMES);

export const normalizeAppearance = (appearance = {}) => ({
  mode: MODE_IDS.has(appearance?.mode) ? appearance.mode : DEFAULT_APPEARANCE.mode,
  colorTheme: COLOR_IDS.has(appearance?.colorTheme) ? appearance.colorTheme : DEFAULT_APPEARANCE.colorTheme,
  fontTheme: FONT_IDS.has(appearance?.fontTheme) ? appearance.fontTheme : DEFAULT_APPEARANCE.fontTheme,
  textScale: TEXT_SCALES.includes(appearance?.textScale) ? appearance.textScale : DEFAULT_APPEARANCE.textScale,
});

export const mergeAppearance = (current, patch) => normalizeAppearance({
  ...normalizeAppearance(current),
  ...patch,
});

export const resolveAppearanceMode = (mode, prefersDark = true) => (
  mode === "system" ? (prefersDark ? "dark" : "light") : mode
);

export const adjustTextScale = (textScale, direction) => {
  const normalized = normalizeAppearance({ textScale }).textScale;
  const currentIndex = TEXT_SCALES.indexOf(normalized);
  const nextIndex = Math.max(0, Math.min(TEXT_SCALES.length - 1, currentIndex + Math.sign(direction)));
  return TEXT_SCALES[nextIndex];
};

export const textScaleLabel = (textScale) => `${Math.round(normalizeAppearance({ textScale }).textScale * 100)}%`;
