import assert from "node:assert/strict";
import test from "node:test";
import {
  adjustTextScale,
  COLOR_THEMES,
  DEFAULT_APPEARANCE,
  DEFAULT_STUDIO_APPEARANCE,
  FONT_THEMES,
  mergeAppearance,
  normalizeAppearance,
  resolveAppearanceMode,
  textScaleLabel,
} from "../src/lib/appearance.js";

test("appearance normalization preserves supported settings and fills older project records", () => {
  assert.deepEqual(normalizeAppearance(), DEFAULT_APPEARANCE);
  assert.equal(DEFAULT_APPEARANCE.fontTheme, "modern");
  assert.equal(COLOR_THEMES.some((theme) => theme.id === "studio" && theme.label === "Analog Studio"), true);
  assert.equal(COLOR_THEMES.some((theme) => theme.id === "dusty-studio" && theme.label === "Dusty Studio"), true);
  assert.equal(COLOR_THEMES.some((theme) => theme.id === "grunge" && theme.label === "Grunge"), true);
  assert.deepEqual(FONT_THEMES.slice(-3).map((theme) => theme.id), ["space-age", "groove", "rounded"]);
  assert.deepEqual(normalizeAppearance({ mode: "light", colorTheme: "ocean", fontTheme: "mono", textScale: 1.2 }), {
    mode: "light",
    colorTheme: "ocean",
    fontTheme: "mono",
    textScale: 1.2,
    ...DEFAULT_STUDIO_APPEARANCE,
  });
  assert.deepEqual(normalizeAppearance({ mode: "unknown", colorTheme: "laser", fontTheme: "comic", textScale: 4 }), DEFAULT_APPEARANCE);
});

test("analog studio remains portable and preserves its custom room character", () => {
  assert.deepEqual(normalizeAppearance({ mode: "light", colorTheme: "studio", fontTheme: "groove", textScale: 1.1, studioMaterial: "mahogany", studioLight: "vu-green", studioAtmosphere: "smoky" }), {
    mode: "light",
    colorTheme: "studio",
    fontTheme: "groove",
    textScale: 1.1,
    studioMaterial: "mahogany",
    studioLight: "vu-green",
    studioAtmosphere: "smoky",
  });

  assert.deepEqual(normalizeAppearance({ studioMaterial: "plastic", studioLight: "neon", studioAtmosphere: "fog-bank" }), DEFAULT_APPEARANCE);
});

test("dusty studio is portable and shares the studio character controls", () => {
  assert.deepEqual(normalizeAppearance({ colorTheme: "dusty-studio", studioMaterial: "black-oak", studioLight: "valve", studioAtmosphere: "clear" }), {
    ...DEFAULT_APPEARANCE,
    colorTheme: "dusty-studio",
    studioMaterial: "black-oak",
    studioLight: "valve",
    studioAtmosphere: "clear",
  });
});

test("grunge is a portable independent color theme", () => {
  assert.equal(normalizeAppearance({ colorTheme: "grunge" }).colorTheme, "grunge");
});

test("fun font themes remain portable appearance choices", () => {
  for (const fontTheme of ["space-age", "groove", "rounded"]) {
    assert.equal(normalizeAppearance({ fontTheme }).fontTheme, fontTheme);
  }
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
  const customizedStudio = mergeAppearance(editorial, { colorTheme: "studio", studioMaterial: "black-oak", studioLight: "valve", studioAtmosphere: "clear" });
  assert.deepEqual(customizedStudio, {
    mode: "light",
    colorTheme: "studio",
    fontTheme: "editorial",
    textScale: 1.1,
    studioMaterial: "black-oak",
    studioLight: "valve",
    studioAtmosphere: "clear",
  });
});

test("text-size helpers step within the supported readable range", () => {
  assert.equal(adjustTextScale(1, 1), 1.1);
  assert.equal(adjustTextScale(0.9, -1), 0.9);
  assert.equal(adjustTextScale(1.2, 1), 1.2);
  assert.equal(textScaleLabel(1.1), "110%");
});
