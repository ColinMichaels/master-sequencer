const STORAGE_KEY = "project-sequencer.interface-preferences.v1";
const PANEL_ID_PATTERN = /^[a-z0-9][a-z0-9-]{0,79}$/;

const emptyPreferences = () => ({ pinnedPanels: [] });

const normalizePreferences = (value) => {
  const pinnedPanels = Array.isArray(value?.pinnedPanels)
    ? [...new Set(value.pinnedPanels.filter((panelId) => typeof panelId === "string" && PANEL_ID_PATTERN.test(panelId)))]
    : [];
  return { pinnedPanels };
};

export const readInterfacePreferences = ({ storage = globalThis.localStorage } = {}) => {
  try {
    const stored = storage?.getItem(STORAGE_KEY);
    return stored ? normalizePreferences(JSON.parse(stored)) : emptyPreferences();
  } catch {
    return emptyPreferences();
  }
};

export const isExpertPanelPinned = (panelId, options) => PANEL_ID_PATTERN.test(panelId)
  && readInterfacePreferences(options).pinnedPanels.includes(panelId);

export const setExpertPanelPinned = (panelId, pinned, { storage = globalThis.localStorage } = {}) => {
  const current = readInterfacePreferences({ storage });
  if (!PANEL_ID_PATTERN.test(panelId)) return current;
  const next = normalizePreferences({
    pinnedPanels: pinned
      ? [...current.pinnedPanels, panelId]
      : current.pinnedPanels.filter((currentId) => currentId !== panelId),
  });
  try {
    storage?.setItem(STORAGE_KEY, JSON.stringify(next));
  } catch {
    // Interface preferences are optional. The disclosure still works in memory.
  }
  return next;
};

export const INTERFACE_PREFERENCES_STORAGE_KEY = STORAGE_KEY;
