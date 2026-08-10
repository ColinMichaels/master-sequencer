import assert from "node:assert/strict";
import test from "node:test";
import {
  adjustTextScale,
  DEFAULT_APPEARANCE,
  mergeAppearance,
  normalizeAppearance,
  resolveAppearanceMode,
  textScaleLabel,
} from "../src/lib/appearance.js";

test("appearance normalization preserves supported settings and fills older project records", () => {
  assert.deepEqual(normalizeAppearance(), DEFAULT_APPEARANCE);
  assert.deepEqual(normalizeAppearance({ mode: "light", colorTheme: "ocean", fontTheme: "mono", textScale: 1.2 }), {
    mode: "light",
    colorTheme: "ocean",
    fontTheme: "mono",
    textScale: 1.2,
  });
  assert.deepEqual(normalizeAppearance({ mode: "unknown", colorTheme: "laser", fontTheme: "comic", textScale: 4 }), DEFAULT_APPEARANCE);
});

test("system mode resolves from the current operating-system preference", () => {
  assert.equal(resolveAppearanceMode("system", true), "dark");
  assert.equal(resolveAppearanceMode("system", false), "light");
  assert.equal(resolveAppearanceMode("light", true), "light");
});

test("appearance patches merge against the latest saved choices", () => {
  const light = mergeAppearance(undefined, { mode: "light" });
  const ocean = mergeAppearance(light, { colorTheme: "ocean" });
  const editorial = mergeAppearance(ocean, { fontTheme: "editorial", textScale: 1.1 });
  assert.deepEqual(editorial, { mode: "light", colorTheme: "ocean", fontTheme: "editorial", textScale: 1.1 });
});

test("text-size helpers step within the supported readable range", () => {
  assert.equal(adjustTextScale(1, 1), 1.1);
  assert.equal(adjustTextScale(0.9, -1), 0.9);
  assert.equal(adjustTextScale(1.2, 1), 1.2);
  assert.equal(textScaleLabel(1.1), "110%");
});
