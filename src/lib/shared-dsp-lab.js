export const SHARED_DSP_LAB_STORAGE_KEY = "project-sequencer-shared-dsp-lab-v2";

const buildAllowsLab = (environment) => environment?.VITE_SHARED_DSP_LAB === true || environment?.VITE_SHARED_DSP_LAB === "true";

export const sharedDspLabEnabled = ({ environment = import.meta.env, storage = globalThis.localStorage } = {}) => {
  if (!buildAllowsLab(environment)) return false;
  try {
    return storage?.getItem(SHARED_DSP_LAB_STORAGE_KEY) === "enabled";
  } catch {
    return false;
  }
};

export const setSharedDspLabOptIn = (enabled, { storage = globalThis.localStorage } = {}) => {
  if (!storage) return false;
  try {
    if (enabled) storage.setItem(SHARED_DSP_LAB_STORAGE_KEY, "enabled");
    else storage.removeItem(SHARED_DSP_LAB_STORAGE_KEY);
    return true;
  } catch {
    return false;
  }
};
