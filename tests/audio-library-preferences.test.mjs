import assert from "node:assert/strict";
import test from "node:test";
import {
  loadAudioLibraryColumnWidths,
  loadAudioLibraryQuery,
  readAudioLibraryPreferences,
  saveAudioLibraryColumnWidths,
  saveAudioLibraryQuery,
} from "../src/lib/audio-library-preferences.js";

const memoryStorage = () => {
  const values = new Map();
  return {
    getItem: (key) => values.get(key) || null,
    setItem: (key, value) => values.set(key, value),
  };
};

test("audio library working queries remain device-only and isolated by project", () => {
  const storage = memoryStorage();
  saveAudioLibraryQuery("project-a", "alpha tone", { storage });
  saveAudioLibraryQuery("project-b", "alternate", { storage });
  assert.equal(loadAudioLibraryQuery("project-a", { storage }), "alpha tone");
  assert.equal(loadAudioLibraryQuery("project-b", { storage }), "alternate");
  saveAudioLibraryQuery("project-a", "", { storage });
  assert.equal(loadAudioLibraryQuery("project-a", { storage }), "");
});

test("audio library column widths are bounded and malformed storage fails closed", () => {
  const storage = memoryStorage();
  saveAudioLibraryColumnWidths({ file: 260.4, path: 900, "bad column": 150, album: 144 }, { storage });
  assert.deepEqual(loadAudioLibraryColumnWidths({ storage }), { file: 260, album: 144 });
  storage.setItem("project-sequencer.audio-library-preferences.v1", "not-json");
  assert.deepEqual(readAudioLibraryPreferences({ storage }), { queries: {}, columnWidths: {} });
});
