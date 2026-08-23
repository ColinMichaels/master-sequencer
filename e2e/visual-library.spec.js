import assert from "node:assert/strict";
import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";
import { e2eProjectState } from "../tests/fixtures/e2e-project.mjs";
import { FIRST_RUN_GUIDE_STORAGE_KEY, FIRST_RUN_GUIDE_STORAGE_VALUE } from "../src/lib/first-run.js";

const origin = "http://127.0.0.1:4197";
test.setTimeout(60_000);

test.beforeEach(async ({ request, page }) => {
  await page.addInitScript(({ key, value }) => localStorage.setItem(key, value), { key: FIRST_RUN_GUIDE_STORAGE_KEY, value: FIRST_RUN_GUIDE_STORAGE_VALUE });
  const response = await request.put("/api/state", { data: structuredClone(e2eProjectState), headers: { Origin: origin } });
  expect(response.ok()).toBeTruthy();
});

const openVisualLibrary = async (page) => {
  await page.getByRole("button", { name: "Assets" }).click();
  await page.getByRole("button", { name: /Video & Graphics Library/ }).click();
  await expect(page.getByRole("heading", { name: "Video & Graphics Library" })).toBeVisible();
};

const expectNoHighImpactAccessibilityViolations = async (page) => {
  const results = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"]).analyze();
  expect(results.violations.filter((violation) => ["critical", "serious"].includes(violation.impact)).map((violation) => ({
    id: violation.id,
    targets: violation.nodes.map((node) => node.target.join(" ")),
  }))).toEqual([]);
};

test("visual library filters, previews, edits, rescans, attaches, streams ranges, and fits mobile", async ({ page, request }) => {
  const consoleErrors = [];
  page.on("console", (message) => { if (message.type() === "error") consoleErrors.push(message.text()); });
  await page.goto("/");
  await openVisualLibrary(page);
  await expectNoHighImpactAccessibilityViolations(page);

  await expect(page.getByText(/1 of 2 items · Project focus/)).toBeVisible();
  await page.getByRole("button", { name: "All Media", exact: true }).click();
  await expect(page.getByText(/2 of 2 items · All Media/)).toBeVisible();

  const mediaResults = page.getByRole("listbox", { name: "Media Library" });
  const mediaOptions = mediaResults.getByRole("option");
  await expect(mediaOptions).toHaveCount(2);
  await expect(mediaResults).toHaveAttribute("aria-busy", "false");
  expect(await mediaOptions.first().evaluate((option) => getComputedStyle(option).contentVisibility)).toBe("auto");
  await expect(mediaResults.locator('[role="option"][tabindex="0"]')).toHaveCount(1);
  await mediaOptions.first().focus();
  await mediaOptions.first().press("ArrowDown");
  await expect(mediaOptions.nth(1)).toBeFocused();
  await expect(mediaOptions.nth(1)).toHaveAttribute("aria-selected", "true");
  await mediaOptions.nth(1).press("Home");
  await expect(mediaOptions.first()).toBeFocused();
  await expect(mediaOptions.first()).toHaveAttribute("aria-selected", "true");
  await mediaOptions.first().press("End");
  await expect(mediaOptions.nth(1)).toBeFocused();
  await mediaOptions.nth(1).press("PageUp");
  await expect(mediaOptions.first()).toBeFocused();
  await mediaOptions.first().press("PageDown");
  await expect(mediaOptions.nth(1)).toBeFocused();
  await mediaOptions.nth(1).press("Home");
  await mediaOptions.first().press("Space");
  await mediaOptions.first().press("Enter");
  await expect(mediaOptions.first()).toHaveAttribute("aria-selected", "true");
  await expect(page.locator(".transport-playback-toggle")).toHaveAttribute("aria-label", /Play/);
  expect(await mediaOptions.first().evaluate((option) => {
    const bounds = option.getBoundingClientRect();
    const center = document.elementFromPoint(bounds.left + (bounds.width / 2), bounds.top + (bounds.height / 2));
    return bounds.top >= 0 && bounds.bottom <= window.innerHeight && Boolean(center && (center === option || option.contains(center)));
  })).toBe(true);

  const tableHead = page.locator(".visual-library-table-head");
  await expect(tableHead.getByText("Added", { exact: true })).toBeVisible();
  await expect(tableHead.getByText("Modified", { exact: true })).toBeVisible();
  await expect(page.locator(".visual-library-row-date time[datetime]")).toHaveCount(4);
  await page.locator(".visual-library-column-picker summary").click();
  const columnPicker = page.getByRole("group", { name: "Visible media library columns" });
  await columnPicker.getByLabel("Created").check();
  await columnPicker.getByLabel("Codec").check();
  await columnPicker.getByLabel("Platform").uncheck();
  await expect(tableHead.getByText("Created", { exact: true })).toBeVisible();
  await expect(tableHead.getByText("Codec", { exact: true })).toBeVisible();
  await expect(tableHead.getByText("Platform", { exact: true })).toHaveCount(0);
  await page.locator(".visual-library-column-picker summary").click();

  await page.getByRole("button", { name: /^Feed squares 1:1/ }).click();
  await expect(page.getByText(/1 of 2 items · All Media/)).toBeVisible();
  await expect(page.locator(".selected-visual-preview img")).toBeVisible();
  await page.getByRole("button", { name: /^All media/ }).click();
  const filterPanel = page.locator(".visual-library-filters");
  await filterPanel.getByLabel("Platform").selectOption({ label: "YouTube" });
  await expect(page.locator(".selected-visual-preview video")).toBeVisible();
  await filterPanel.getByLabel("Platform").selectOption("all");
  await filterPanel.getByLabel("Readiness").selectOption({ label: "Alternate" });
  await expect(page.locator(".selected-visual-preview img")).toBeVisible();
  await filterPanel.getByLabel("Readiness").selectOption("all");
  await filterPanel.getByLabel("Media / aspect").selectOption("video|all");
  await expect(page.locator(".selected-visual-preview video")).toBeVisible();
  await filterPanel.getByLabel("Media / aspect").selectOption("all|1:1");
  await expect(page.locator(".selected-visual-preview img")).toBeVisible();
  await filterPanel.getByLabel("Media / aspect").selectOption("all|all");
  await filterPanel.getByLabel("Sort").selectOption("title");

  const search = page.getByPlaceholder("Search titles, tracks, formats, subjects, or filenames");
  await search.fill("campaign square");
  await expect(search).toBeFocused();
  await expect(mediaResults).toHaveAttribute("aria-busy", "false");
  await expect(page.getByText(/1 of 2 items/)).toBeVisible();
  await expect(page.locator(".selected-visual-preview img")).toBeVisible();
  await search.fill("");

  const videoRow = page.locator(".visual-library-row").filter({ hasText: "Alpha Tone" });
  await videoRow.click();
  const video = page.locator(".selected-visual-preview video");
  await expect(video).toBeVisible();
  await expect.poll(() => video.evaluate((element) => element.readyState)).toBeGreaterThanOrEqual(1);
  await video.evaluate(async (element) => { element.muted = true; await element.play(); });
  await expect.poll(() => video.evaluate((element) => element.paused)).toBe(false);
  const firstFrame = await video.screenshot();
  await video.evaluate(async (element) => {
    element.currentTime = Math.min(1.4, Math.max(0.2, element.duration - 0.2));
    await new Promise((resolve) => element.addEventListener("seeked", resolve, { once: true }));
  });
  const secondFrame = await video.screenshot();
  assert.equal(firstFrame.equals(secondFrame), false, "seeking should produce a visibly different video frame");
  await video.evaluate((element) => element.pause());
  await expect.poll(() => video.evaluate((element) => element.paused)).toBe(true);

  const inventory = await request.get("/api/visual-library");
  const { items } = await inventory.json();
  const videoItem = items.find((item) => item.mediaType === "video");
  const range = await request.get(`/api/media?visualKey=${encodeURIComponent(videoItem.key)}`, { headers: { Range: "bytes=0-63" } });
  expect(range.status()).toBe(206);
  expect(range.headers()["content-type"]).toBe("video/mp4");
  expect(range.headers()["content-range"]).toMatch(/^bytes 0-63\//);

  await page.locator(".visual-metadata-editor summary").click();
  await page.getByLabel("Display title").fill("Fixture Visual Master");
  await page.getByLabel("Album relationship").selectOption("fixture-album");
  await page.locator(".visual-metadata-editor").getByLabel("Song / track").selectOption("alpha");
  await page.getByLabel("Members / subjects").fill("Fixture Artist, Director");
  await page.getByLabel("Tags").fill("launch, master");
  await page.getByLabel("Notes").fill("Browser persistence proof.");
  await page.getByRole("button", { name: "Save Metadata" }).click();
  await expect(page.getByText("Metadata saved for Fixture Visual Master.")).toBeVisible();
  await page.getByRole("button", { name: "Attach to Album" }).click();
  await expect(page.getByText(/attached to Fixture Album/)).toBeVisible();
  await page.getByRole("button", { name: "Attach to Track" }).click();
  await expect(page.getByText(/attached to Alpha Tone/)).toBeVisible();

  await page.reload();
  await openVisualLibrary(page);
  await expect(page.getByRole("heading", { name: "Fixture Visual Master" })).toBeVisible();
  await expect(page.locator(".visual-library-table-head").getByText("Created", { exact: true })).toBeVisible();
  await expect(page.locator(".visual-library-table-head").getByText("Codec", { exact: true })).toBeVisible();
  await expect(page.locator(".visual-library-table-head").getByText("Platform", { exact: true })).toHaveCount(0);
  await page.getByRole("button", { name: /Rescan/ }).click();
  await expect(page.getByText(/Visual library refreshed: 2 indexed items/)).toBeVisible();
  await expect(page.getByRole("heading", { name: "Fixture Visual Master" })).toBeVisible();

  await page.getByRole("button", { name: /Project Assets/ }).click();
  await expect(page.getByText("Alpha Tone - Full Master.mp4").first()).toBeVisible();
  await page.getByRole("button", { name: /Video & Graphics Library/ }).click();
  await search.fill("native space behavior");
  await search.press("ArrowLeft");
  await search.press("Space");
  await expect(search).toHaveValue("native space behavio r");

  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByRole("button", { name: "Filters" }).click();
  await expect(page.locator("#visual-library-filters")).toHaveClass(/is-open/);
  const overflow = await page.evaluate(() => ({ viewport: document.documentElement.clientWidth, page: document.documentElement.scrollWidth }));
  expect(overflow.page).toBeLessThanOrEqual(overflow.viewport + 1);
  await expectNoHighImpactAccessibilityViolations(page);
  const relevantConsoleErrors = consoleErrors.filter((message) => !/WebSocket|\[vite\]|Vite server|24678/.test(message));
  expect(relevantConsoleErrors).toEqual([]);
});
