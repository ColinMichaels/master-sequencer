import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";
import { FIRST_RUN_GUIDE_STORAGE_KEY, FIRST_RUN_GUIDE_STORAGE_VALUE } from "../src/lib/first-run.js";
import { e2eProjectState } from "../tests/fixtures/e2e-project.mjs";

const origin = "http://127.0.0.1:4197";
const wcagTags = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"];
const blockedImpacts = new Set(["critical", "serious"]);
const primaryViews = ["Sequence", "Mastering", "Track Review", "Album Decisions", "Assets", "Audio Library", "Settings"];
const phoneViewport = { width: 390, height: 844 };
const dialogSurfaces = [
  {
    name: "Quick Settings",
    modal: false,
    open: async (page) => page.getByRole("button", { name: "Open settings menu" }).click(),
  },
  {
    name: "Album Statistics",
    modal: false,
    phone: false,
    open: async (page) => page.getByRole("button", { name: "Tracks: 2. Show album statistics" }).click(),
  },
  {
    name: "Project Sequencer Help & Instructions",
    modal: true,
    open: async (page) => {
      await page.getByRole("button", { name: "Open settings menu" }).click();
      await page.getByRole("dialog", { name: "Quick Settings" }).getByRole("button", { name: "Help & app instructions" }).click();
    },
  },
  {
    name: "Keyboard Shortcuts",
    modal: true,
    open: async (page) => {
      await page.getByRole("button", { name: "Open settings menu" }).click();
      await page.getByRole("dialog", { name: "Quick Settings" }).getByRole("button", { name: "Keyboard shortcuts" }).click();
    },
  },
  {
    name: "Command Search",
    modal: true,
    open: async (page) => {
      await page.getByRole("button", { name: "Open settings menu" }).click();
      await page.getByRole("dialog", { name: "Quick Settings" }).getByRole("button", { name: "Command search" }).click();
    },
  },
  {
    name: "Add Album",
    modal: true,
    open: async (page) => page.getByRole("button", { name: "Add Album", exact: true }).click(),
  },
  {
    name: "Add Tracks",
    modal: true,
    open: async (page) => page.getByRole("button", { name: "Add Tracks", exact: true }).click(),
  },
  {
    name: "Manage Candidates — Alpha Tone",
    modal: true,
    open: async (page) => page.getByRole("button", { name: "Manage candidates for Alpha Tone" }).click(),
  },
  {
    name: "Saved Projects",
    modal: true,
    open: async (page) => page.getByRole("button", { name: /Open saved projects for/ }).click(),
  },
  {
    name: "Start a Fresh Project",
    modal: true,
    open: async (page) => page.getByRole("button", { name: "New Project", exact: true }).click(),
  },
  {
    name: "Print / Export Audio",
    modal: true,
    open: async (page) => {
      await page.getByRole("button", { name: "Mastering", exact: true }).click();
      await page.getByRole("button", { name: "Print / Export Audio", exact: true }).click();
    },
  },
];

const summarizeViolation = (violation) => ({
  id: violation.id,
  impact: violation.impact,
  help: violation.help,
  targets: violation.nodes.map((node) => node.target.join(" ")),
});

const expectNoHighImpactViolations = async (page, surface) => {
  const results = await new AxeBuilder({ page }).withTags(wcagTags).analyze();
  const violations = results.violations
    .filter((violation) => blockedImpacts.has(violation.impact))
    .map(summarizeViolation);

  expect(violations, `${surface} has serious or critical WCAG A/AA violations:\n${JSON.stringify(violations, null, 2)}`).toEqual([]);
};

const expectNoHorizontalPageOverflow = async (page, surface) => {
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  expect(overflow, `${surface} overflowed the ${phoneViewport.width}px viewport`).toBeLessThanOrEqual(1);
};

const useMaximumTextScale = async (page) => {
  await page.getByRole("button", { name: "Open settings menu" }).click();
  const quickSettings = page.getByRole("dialog", { name: "Quick Settings" });
  const increaseTextSize = quickSettings.getByRole("button", { name: "Increase text size" });
  await increaseTextSize.click();
  await increaseTextSize.click();
  await expect(quickSettings.getByLabel("Text size 120%")).toHaveText("120%");
  await quickSettings.getByRole("button", { name: "Dismiss quick settings" }).click();
  await expect.poll(() => page.evaluate(() => document.documentElement.style.getPropertyValue("--text-scale"))).toBe("1.2");
};

test.beforeEach(async ({ request, page }) => {
  await page.addInitScript(({ key, value }) => localStorage.setItem(key, value), {
    key: FIRST_RUN_GUIDE_STORAGE_KEY,
    value: FIRST_RUN_GUIDE_STORAGE_VALUE,
  });
  const response = await request.put("/api/state", {
    data: structuredClone(e2eProjectState),
    headers: { Origin: origin },
  });
  expect(response.ok()).toBeTruthy();
  await page.goto("/");
  await expect(page.getByRole("table", { name: "Fixture Album track order" })).toBeVisible();
});

for (const view of primaryViews) {
  test(`${view} has no serious or critical automated WCAG A/AA violations`, async ({ page }) => {
    const viewButton = page.getByRole("button", { name: view, exact: true });
    if (view !== "Sequence") await viewButton.click();
    await expect(viewButton).toHaveAttribute("aria-current", "page");
    await expectNoHighImpactViolations(page, view);
  });

  test(`${view} remains accessible at phone width and 120% text`, async ({ page }) => {
    await page.setViewportSize(phoneViewport);
    const viewButton = page.getByRole("button", { name: view, exact: true });
    if (view !== "Sequence") await viewButton.click();
    await expect(viewButton).toHaveAttribute("aria-current", "page");
    await expectNoHorizontalPageOverflow(page, `${view} mobile workspace`);
    await expectNoHighImpactViolations(page, `${view} mobile workspace`);
    await useMaximumTextScale(page);
    await expectNoHorizontalPageOverflow(page, `${view} mobile workspace at 120% text`);
    await expectNoHighImpactViolations(page, `${view} mobile workspace at 120% text`);
  });
}

test("Analog Studio customization remains accessible at phone width and 120% text", async ({ page }) => {
  await page.setViewportSize(phoneViewport);
  await page.getByRole("button", { name: "Settings", exact: true }).click();
  const appearance = page.locator("#appearance-settings");
  await appearance.getByRole("button", { name: /Analog Studio Smoked walnut, brass, and warm signal light/ }).click();
  const customizer = appearance.getByRole("group", { name: "Studio character" });
  await expect(customizer).toBeVisible();
  await customizer.getByRole("button", { name: /Black Oak Charcoal studio rack/ }).click();
  await customizer.getByRole("button", { name: /Valve Burnished tube orange/ }).click();
  await customizer.getByRole("button", { name: /Clear Minimal room haze/ }).click();
  await useMaximumTextScale(page);
  await expectNoHorizontalPageOverflow(page, "Analog Studio customizer at 120% text");
  await expectNoHighImpactViolations(page, "Analog Studio customizer at 120% text");
});

test("Grunge remains accessible at phone width and 120% text", async ({ page }) => {
  await page.setViewportSize(phoneViewport);
  await page.getByRole("button", { name: "Settings", exact: true }).click();
  const appearance = page.locator("#appearance-settings");
  await appearance.getByRole("button", { name: /Grunge Blackened concrete, chalk dust, and worn edges/ }).click();
  await useMaximumTextScale(page);
  await expectNoHorizontalPageOverflow(page, "Grunge at 120% text");
  await expectNoHighImpactViolations(page, "Grunge at 120% text");
});

test("Saved filters disclosure remains accessible at phone width and 120% text", async ({ page }) => {
  await page.setViewportSize(phoneViewport);
  await page.getByRole("button", { name: "Audio Library", exact: true }).click();
  const disclosure = page.getByRole("button", { name: /^Saved filters/ });
  await disclosure.click();
  await expect(disclosure).toHaveAttribute("aria-expanded", "true");
  await expect(page.locator("#saved-filter-panel")).toBeVisible();
  await expectNoHorizontalPageOverflow(page, "Saved filters mobile disclosure");
  await expectNoHighImpactViolations(page, "Saved filters mobile disclosure");
  await useMaximumTextScale(page);
  await expectNoHorizontalPageOverflow(page, "Saved filters mobile disclosure at 120% text");
  await expectNoHighImpactViolations(page, "Saved filters mobile disclosure at 120% text");
});

test("Album Decision expert disclosures remain accessible at phone width and 120% text", async ({ page }) => {
  await page.setViewportSize(phoneViewport);
  await page.getByRole("button", { name: "Album Decisions", exact: true }).click();
  await expect(page.locator(".readiness-inspector")).toBeVisible();
  for (const name of [/^Sequence Versions/, /^Transition Tools/, /^Matched Candidate Previews/, /^Album Templates/]) {
    const disclosure = page.getByRole("button", { name });
    await disclosure.click();
    await expect(disclosure).toHaveAttribute("aria-expanded", "true");
  }
  await expectNoHorizontalPageOverflow(page, "Album Decision mobile expert disclosures");
  await expectNoHighImpactViolations(page, "Album Decision mobile expert disclosures");
  await useMaximumTextScale(page);
  await expectNoHorizontalPageOverflow(page, "Album Decision mobile expert disclosures at 120% text");
  await expectNoHighImpactViolations(page, "Album Decision mobile expert disclosures at 120% text");
});

test("Mastering optional disclosures and ending controls remain accessible at phone width and 120% text", async ({ page }) => {
  await page.setViewportSize(phoneViewport);
  await page.getByRole("button", { name: "Mastering", exact: true }).click();
  for (const name of [/^Optional Technical Analysis/, /^Render History/]) {
    const disclosure = page.getByRole("button", { name });
    await disclosure.click();
    await expect(disclosure).toHaveAttribute("aria-expanded", "true");
  }
  await page.locator(".ending-mode-grid label").filter({ hasText: "Crossfade" }).click();
  await expect(page.getByRole("spinbutton", { name: "Crossfade length" })).toBeVisible();
  await expect(page.getByRole("spinbutton", { name: "Silence after" })).toHaveCount(0);
  await expectNoHorizontalPageOverflow(page, "Mastering mobile disclosures and ending controls");
  await expectNoHighImpactViolations(page, "Mastering mobile disclosures and ending controls");
  await useMaximumTextScale(page);
  await expectNoHorizontalPageOverflow(page, "Mastering mobile disclosures and ending controls at 120% text");
  await expectNoHighImpactViolations(page, "Mastering mobile disclosures and ending controls at 120% text");
});

test("contextual action menus remain accessible at phone width and 120% text", async ({ page }) => {
  await page.setViewportSize(phoneViewport);
  await page.getByRole("button", { name: "Audio Library", exact: true }).click();
  await page.locator(".audio-row").filter({ hasText: "Alpha Tone.wav" }).click();
  await page.getByRole("button", { name: "Actions for Alpha Tone.wav" }).click();
  await expect(page.getByRole("menu", { name: "Actions for Alpha Tone.wav" })).toBeVisible();
  await expectNoHorizontalPageOverflow(page, "Audio Library contextual actions");
  await expectNoHighImpactViolations(page, "Audio Library contextual actions");
  await page.keyboard.press("Escape");
  await useMaximumTextScale(page);

  await page.getByRole("button", { name: "Mastering", exact: true }).click();
  await page.getByRole("button", { name: "Actions for Alpha Tone" }).click();
  await expect(page.getByRole("menu", { name: "Actions for Alpha Tone" })).toBeVisible();
  await expectNoHorizontalPageOverflow(page, "Mastering contextual actions at 120% text");
  await expectNoHighImpactViolations(page, "Mastering contextual actions at 120% text");
});

test("reduced-motion preference removes nonessential animation and transition time", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.getByRole("button", { name: "Mastering", exact: true }).click();
  await page.getByRole("button", { name: /PREMIUM Analog Rack/ }).click();

  const motionState = await page.evaluate(() => {
    const durationMs = (value) => Math.max(...value.split(",").map((part) => {
      const duration = Number.parseFloat(part);
      return part.trim().endsWith("ms") ? duration : duration * 1000;
    }));
    const offenders = [...document.querySelectorAll("*")].flatMap((element) => {
      const style = getComputedStyle(element);
      const animationMs = style.animationName === "none" ? 0 : durationMs(style.animationDuration);
      const transitionMs = style.transitionProperty === "none" ? 0 : durationMs(style.transitionDuration);
      return animationMs > 0.01 || transitionMs > 0.01
        ? [{ tag: element.tagName, className: element.className?.toString().slice(0, 100), animationMs, transitionMs }]
        : [];
    });
    return {
      preferenceActive: matchMedia("(prefers-reduced-motion: reduce)").matches,
      scrollBehavior: getComputedStyle(document.documentElement).scrollBehavior,
      offenders: offenders.slice(0, 20),
    };
  });

  expect(motionState.preferenceActive).toBeTruthy();
  expect(motionState.scrollBehavior).toBe("auto");
  expect(motionState.offenders).toEqual([]);
  await expectNoHighImpactViolations(page, "Mastering with reduced motion");
});

for (const surface of dialogSurfaces) {
  const layout = surface.phone === false ? "desktop layout" : "phone layout";
  test(`${surface.name} remains accessible in the ${layout}`, async ({ page }) => {
    await surface.open(page);
    const dialog = page.getByRole("dialog", { name: surface.name });
    await expect(dialog).toBeVisible();
    await expect(dialog).toHaveAttribute("aria-modal", String(surface.modal));
    if (surface.modal) {
      await expect.poll(() => dialog.evaluate((element) => element.contains(document.activeElement))).toBeTruthy();
    }
    if (surface.phone !== false) {
      await page.setViewportSize(phoneViewport);
      const dialogBounds = await dialog.boundingBox();
      expect(dialogBounds).not.toBeNull();
      expect(dialogBounds.x).toBeGreaterThanOrEqual(0);
      expect(dialogBounds.x + dialogBounds.width).toBeLessThanOrEqual(phoneViewport.width);
      await expectNoHorizontalPageOverflow(page, `${surface.name} mobile dialog`);
    }
    await expectNoHighImpactViolations(page, `${surface.name} ${layout}`);
  });
}
