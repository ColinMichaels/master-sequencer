import { slugify } from "./format.js";
import { normalizeMasterBus } from "./mastering.js";

export const MASTERING_PRESET_TYPES = Object.freeze(["eq", "compressor", "output", "limiter", "master"]);

export const createMasteringPresetLibrary = () => ({
  eq: [],
  compressor: [],
  output: [],
  limiter: [],
  master: [],
});

const isPresetType = (type) => MASTERING_PRESET_TYPES.includes(type);

export const masteringPresetLibrary = (value) => {
  const source = value && typeof value === "object" && !Array.isArray(value) ? value : {};
  return Object.fromEntries(MASTERING_PRESET_TYPES.map((type) => [type, Array.isArray(source[type]) ? source[type] : []]));
};

const settingsForType = (type, masterBus) => {
  const bus = normalizeMasterBus(masterBus);
  // Component presets deliberately snapshot one stage; only MASTER presets own the complete bus.
  if (type === "master") return bus;
  if (type === "output") return { outputGainDb: bus.outputGainDb };
  return structuredClone(bus[type]);
};

const uniquePresetId = (presets, name) => {
  const base = slugify(name) || "preset";
  let id = base;
  let suffix = 2;
  while (presets.some((preset) => preset.id === id)) id = `${base}-${suffix++}`;
  return id;
};

const ensureLibrary = (state) => {
  state.masteringPresets = masteringPresetLibrary(state.masteringPresets);
  return state.masteringPresets;
};

export const saveMasteringPreset = (state, type, name, masterBus) => {
  if (!state || !isPresetType(type)) return "";
  const normalizedName = typeof name === "string" ? name.trim().slice(0, 80) : "";
  if (!normalizedName) return "";
  const presets = ensureLibrary(state)[type];
  const existingIndex = presets.findIndex((preset) => preset.name.localeCompare(normalizedName, undefined, { sensitivity: "accent" }) === 0);
  const id = existingIndex >= 0 ? presets[existingIndex].id : uniquePresetId(presets, normalizedName);
  const nextPreset = { id, name: normalizedName, settings: settingsForType(type, masterBus) };
  if (existingIndex >= 0) presets.splice(existingIndex, 1, nextPreset);
  else presets.push(nextPreset);
  return id;
};

export const deleteMasteringPreset = (state, type, presetId) => {
  if (!state || !isPresetType(type) || !presetId) return false;
  const presets = ensureLibrary(state)[type];
  const next = presets.filter((preset) => preset.id !== presetId);
  if (next.length === presets.length) return false;
  state.masteringPresets[type] = next;
  return true;
};

export const applyPresetSettings = (masterBus, type, settings) => {
  const bus = normalizeMasterBus(masterBus);
  if (type === "master") return normalizeMasterBus(settings);
  if (type === "eq") return normalizeMasterBus({ ...bus, eq: settings });
  if (type === "compressor") return normalizeMasterBus({ ...bus, compressor: settings });
  if (type === "output") return normalizeMasterBus({ ...bus, outputGainDb: settings?.outputGainDb });
  if (type === "limiter") return normalizeMasterBus({ ...bus, limiter: settings });
  return bus;
};

export const loadMasteringPreset = (state, albumId, type, presetId) => {
  if (!state || !isPresetType(type) || !presetId) return false;
  const album = state.albums?.find((item) => item.id === albumId);
  const preset = masteringPresetLibrary(state.masteringPresets)[type].find((item) => item.id === presetId);
  if (!album || !preset) return false;
  album.masterBus = applyPresetSettings(album.masterBus, type, preset.settings);
  return true;
};
