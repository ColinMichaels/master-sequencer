import { expect, test } from "@playwright/test";
import { FIRST_RUN_GUIDE_STORAGE_KEY, FIRST_RUN_GUIDE_STORAGE_VALUE } from "../src/lib/first-run.js";

test("hosted Assets reports the truthful local-only visual-library boundary", async ({ page }) => {
  await page.addInitScript(({ key, value }) => localStorage.setItem(key, value), { key: FIRST_RUN_GUIDE_STORAGE_KEY, value: FIRST_RUN_GUIDE_STORAGE_VALUE });
  await page.goto("/");
  await page.getByRole("button", { name: "Assets" }).click();
  await page.getByRole("button", { name: /Video & Graphics Library/ }).click();
  await expect(page.getByRole("heading", { name: "Local visual library" })).toBeVisible();
  await expect(page.getByText(/Open this project in the local Project Sequencer app/)).toBeVisible();
  await expect(page.getByText("No device media is uploaded or simulated in hosted mode.")).toBeVisible();
});
