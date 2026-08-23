export const DEFAULT_APPEARANCE = Object.freeze({
  mode: "dark",
  colorTheme: "signal",
  fontTheme: "modern",
  textScale: 1,
  studioMaterial: "walnut",
  studioLight: "amber",
  studioAtmosphere: "balanced",
});

export const APPEARANCE_MODES = Object.freeze([
  { id: "dark", label: "Dark", description: "Low-light studio view" },
  { id: "light", label: "Light", description: "Bright daylight view" },
  { id: "system", label: "System", description: "Follow this Mac" },
]);

export const COLOR_THEMES = Object.freeze([
  { id: "signal", label: "Signal", description: "Original lime, gold, and orange" },
  { id: "studio", label: "Analog Studio", description: "Smoked walnut, brass, and warm signal light" },
  { id: "dusty-studio", label: "Dusty Studio", description: "Near-black room with faded amber light" },
  { id: "grunge", label: "Grunge", description: "Blackened concrete, chalk dust, and worn edges" },
  { id: "ocean", label: "Ocean", description: "Cyan, blue, and coral" },
  { id: "ember", label: "Ember", description: "Amber, cream, and red" },
  { id: "violet", label: "Violet", description: "Purple, gold, and rose" },
]);

export const FONT_THEMES = Object.freeze([
  { id: "condensed", label: "Condensed", description: "Original production-board pairing", sample: "Sequence 01" },
  { id: "modern", label: "Modern", description: "Clean, open, and neutral", sample: "Sequence 01" },
  { id: "editorial", label: "Editorial", description: "Album-notes character with a serif lead", sample: "Sequence 01" },
  { id: "mono", label: "Studio Mono", description: "Technical cue-sheet pairing", sample: "Sequence 01" },
  { id: "space-age", label: "Space Age", description: "Geometric sci-fi headings with clean controls", sample: "Orbit 07" },
  { id: "groove", label: "Groove", description: "Warm vinyl-era display character", sample: "Side B" },
  { id: "rounded", label: "Rounded", description: "Friendly curves for an easygoing studio", sample: "Play All" },
]);

export const TEXT_SCALES = Object.freeze([0.9, 1, 1.1, 1.2]);

export const STUDIO_MATERIALS = Object.freeze([
  { id: "walnut", label: "Walnut", description: "Deep brown console" },
  { id: "mahogany", label: "Mahogany", description: "Richer red wood" },
  { id: "black-oak", label: "Black Oak", description: "Charcoal studio rack" },
]);

export const STUDIO_LIGHTS = Object.freeze([
  { id: "amber", label: "Amber", description: "Classic meter glow" },
  { id: "valve", label: "Valve", description: "Burnished tube orange" },
  { id: "vu-green", label: "VU Green", description: "Vintage console signal" },
]);

export const STUDIO_ATMOSPHERES = Object.freeze([
  { id: "clear", label: "Clear", description: "Minimal room haze" },
  { id: "balanced", label: "Balanced", description: "Soft light in the air" },
  { id: "smoky", label: "Smoky", description: "Deeper shafts and shadow" },
]);

export const DEFAULT_STUDIO_APPEARANCE = Object.freeze({
  studioMaterial: DEFAULT_APPEARANCE.studioMaterial,
  studioLight: DEFAULT_APPEARANCE.studioLight,
  studioAtmosphere: DEFAULT_APPEARANCE.studioAtmosphere,
});

const valueSet = (options) => new Set(options.map((option) => option.id));
const MODE_IDS = valueSet(APPEARANCE_MODES);
const COLOR_IDS = valueSet(COLOR_THEMES);
const FONT_IDS = valueSet(FONT_THEMES);
const STUDIO_MATERIAL_IDS = valueSet(STUDIO_MATERIALS);
const STUDIO_LIGHT_IDS = valueSet(STUDIO_LIGHTS);
const STUDIO_ATMOSPHERE_IDS = valueSet(STUDIO_ATMOSPHERES);

export const normalizeAppearance = (appearance = {}) => ({
  mode: MODE_IDS.has(appearance?.mode) ? appearance.mode : DEFAULT_APPEARANCE.mode,
  colorTheme: COLOR_IDS.has(appearance?.colorTheme) ? appearance.colorTheme : DEFAULT_APPEARANCE.colorTheme,
  fontTheme: FONT_IDS.has(appearance?.fontTheme) ? appearance.fontTheme : DEFAULT_APPEARANCE.fontTheme,
  textScale: TEXT_SCALES.includes(appearance?.textScale) ? appearance.textScale : DEFAULT_APPEARANCE.textScale,
  studioMaterial: STUDIO_MATERIAL_IDS.has(appearance?.studioMaterial) ? appearance.studioMaterial : DEFAULT_APPEARANCE.studioMaterial,
  studioLight: STUDIO_LIGHT_IDS.has(appearance?.studioLight) ? appearance.studioLight : DEFAULT_APPEARANCE.studioLight,
  studioAtmosphere: STUDIO_ATMOSPHERE_IDS.has(appearance?.studioAtmosphere) ? appearance.studioAtmosphere : DEFAULT_APPEARANCE.studioAtmosphere,
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
