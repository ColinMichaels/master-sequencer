export const shouldShowFirstRunGuide = ({ roots = [], library = [] } = {}) => (
  roots.length === 0 && library.length === 0
);

export const FIRST_RUN_GUIDE_STORAGE_KEY = "project-sequencer:first-run-guide:v1";
export const FIRST_RUN_GUIDE_STORAGE_VALUE = "seen";

const browserStorage = (storage) => {
  if (storage) return storage;
  if (typeof window === "undefined") return null;
  return window.localStorage;
};

export const hasSeenFirstRunGuide = (storage) => {
  try {
    return browserStorage(storage)?.getItem(FIRST_RUN_GUIDE_STORAGE_KEY) === FIRST_RUN_GUIDE_STORAGE_VALUE;
  } catch {
    return false;
  }
};

export const markFirstRunGuideSeen = (storage) => {
  try {
    const target = browserStorage(storage);
    if (!target) return false;
    target.setItem(FIRST_RUN_GUIDE_STORAGE_KEY, FIRST_RUN_GUIDE_STORAGE_VALUE);
    return true;
  } catch {
    return false;
  }
};
