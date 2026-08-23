const STORAGE_KEY = "project-sequencer.audio-library-preferences.v1";
const DEFAULT_PROJECT_KEY = "default";
const PROJECT_KEY_PATTERN = /^[a-z0-9][a-z0-9._-]{0,119}$/i;
const COLUMN_ID_PATTERN = /^[a-z][a-z0-9-]{0,39}$/;
const QUERY_LIMIT = 240;

const projectKey = (projectId) => PROJECT_KEY_PATTERN.test(projectId || "") ? projectId : DEFAULT_PROJECT_KEY;

const emptyPreferences = () => ({ queries: {}, columnWidths: {} });

const normalizePreferences = (value) => {
  const queries = {};
  if (value?.queries && typeof value.queries === "object") {
    for (const [key, query] of Object.entries(value.queries)) {
      if (PROJECT_KEY_PATTERN.test(key) && typeof query === "string") queries[key] = query.slice(0, QUERY_LIMIT);
    }
  }
  const columnWidths = {};
  if (value?.columnWidths && typeof value.columnWidths === "object") {
    for (const [columnId, width] of Object.entries(value.columnWidths)) {
      const numericWidth = Math.round(Number(width));
      if (COLUMN_ID_PATTERN.test(columnId) && Number.isFinite(numericWidth) && numericWidth >= 48 && numericWidth <= 720) columnWidths[columnId] = numericWidth;
    }
  }
  return { queries, columnWidths };
};

export const readAudioLibraryPreferences = ({ storage = globalThis.localStorage } = {}) => {
  try {
    const stored = storage?.getItem(STORAGE_KEY);
    return stored ? normalizePreferences(JSON.parse(stored)) : emptyPreferences();
  } catch {
    return emptyPreferences();
  }
};

const writePreferences = (preferences, storage) => {
  const next = normalizePreferences(preferences);
  try {
    storage?.setItem(STORAGE_KEY, JSON.stringify(next));
  } catch {
    // Working search and resize state still remain available for this mount.
  }
  return next;
};

export const loadAudioLibraryQuery = (projectId, options) => readAudioLibraryPreferences(options).queries[projectKey(projectId)] || "";

export const saveAudioLibraryQuery = (projectId, query, { storage = globalThis.localStorage } = {}) => {
  const current = readAudioLibraryPreferences({ storage });
  const key = projectKey(projectId);
  const nextQueries = { ...current.queries };
  const normalizedQuery = typeof query === "string" ? query.slice(0, QUERY_LIMIT) : "";
  if (normalizedQuery) nextQueries[key] = normalizedQuery;
  else delete nextQueries[key];
  return writePreferences({ ...current, queries: nextQueries }, storage);
};

export const loadAudioLibraryColumnWidths = (options) => readAudioLibraryPreferences(options).columnWidths;

export const saveAudioLibraryColumnWidths = (columnWidths, { storage = globalThis.localStorage } = {}) => {
  const current = readAudioLibraryPreferences({ storage });
  return writePreferences({ ...current, columnWidths }, storage);
};

export const AUDIO_LIBRARY_PREFERENCES_STORAGE_KEY = STORAGE_KEY;
