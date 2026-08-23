import assert from "node:assert/strict";
import test from "node:test";
import {
  INTERFACE_PREFERENCES_STORAGE_KEY,
  isExpertPanelPinned,
  readInterfacePreferences,
  setExpertPanelPinned,
} from "../src/lib/interface-preferences.js";

const memoryStorage = () => {
  const values = new Map();
  return {
    values,
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, value),
  };
};

test("expert panel pins persist as device interface preferences", () => {
  const storage = memoryStorage();
  assert.deepEqual(readInterfacePreferences({ storage }), { pinnedPanels: [] });
  assert.equal(isExpertPanelPinned("mastering-technical-analysis", { storage }), false);

  setExpertPanelPinned("mastering-technical-analysis", true, { storage });
  setExpertPanelPinned("decisions-sequence-versions", true, { storage });

  assert.equal(isExpertPanelPinned("mastering-technical-analysis", { storage }), true);
  assert.deepEqual(JSON.parse(storage.values.get(INTERFACE_PREFERENCES_STORAGE_KEY)), {
    pinnedPanels: ["mastering-technical-analysis", "decisions-sequence-versions"],
  });

  setExpertPanelPinned("mastering-technical-analysis", false, { storage });
  assert.deepEqual(readInterfacePreferences({ storage }), { pinnedPanels: ["decisions-sequence-versions"] });
});

test("interface preferences discard malformed and unsafe panel identifiers", () => {
  const storage = memoryStorage();
  storage.setItem(INTERFACE_PREFERENCES_STORAGE_KEY, JSON.stringify({
    pinnedPanels: ["library-saved-filters", "library-saved-filters", "../../project-state", 12],
    project: { albums: ["must not be read"] },
  }));

  assert.deepEqual(readInterfacePreferences({ storage }), { pinnedPanels: ["library-saved-filters"] });
  assert.deepEqual(setExpertPanelPinned("../../project-state", true, { storage }), { pinnedPanels: ["library-saved-filters"] });
});

test("blocked or malformed device storage never blocks disclosure controls", () => {
  const blockedStorage = {
    getItem: () => { throw new Error("blocked"); },
    setItem: () => { throw new Error("blocked"); },
  };
  const malformedStorage = {
    getItem: () => "not-json",
    setItem: () => {},
  };

  assert.deepEqual(readInterfacePreferences({ storage: blockedStorage }), { pinnedPanels: [] });
  assert.deepEqual(readInterfacePreferences({ storage: malformedStorage }), { pinnedPanels: [] });
  assert.deepEqual(setExpertPanelPinned("mastering-render-history", true, { storage: blockedStorage }), { pinnedPanels: ["mastering-render-history"] });
});
