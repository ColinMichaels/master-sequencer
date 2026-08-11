import { expect, test } from "@playwright/test";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

const createWaveFile = ({ seconds = 2, sampleRate = 8_000, frequency = 440 } = {}) => {
  const sampleCount = Math.round(seconds * sampleRate);
  const dataSize = sampleCount * 2;
  const buffer = Buffer.alloc(44 + dataSize);
  buffer.write("RIFF", 0);
  buffer.writeUInt32LE(36 + dataSize, 4);
  buffer.write("WAVE", 8);
  buffer.write("fmt ", 12);
  buffer.writeUInt32LE(16, 16);
  buffer.writeUInt16LE(1, 20);
  buffer.writeUInt16LE(1, 22);
  buffer.writeUInt32LE(sampleRate, 24);
  buffer.writeUInt32LE(sampleRate * 2, 28);
  buffer.writeUInt16LE(2, 32);
  buffer.writeUInt16LE(16, 34);
  buffer.write("data", 36);
  buffer.writeUInt32LE(dataSize, 40);
  for (let index = 0; index < sampleCount; index += 1) {
    const sample = Math.sin(index * Math.PI * 2 * frequency / sampleRate) * 12_000;
    buffer.writeInt16LE(Math.round(sample), 44 + index * 2);
  }
  return buffer;
};

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    delete globalThis.showOpenFilePicker;
    delete globalThis.showDirectoryPicker;
  });
  await page.goto("/");
  await expect(page.getByRole("dialog", { name: "Welcome to Project Sequencer" })).toBeVisible();
  await page.getByRole("button", { name: "Explore the Workspace" }).click();
  await page.getByRole("button", { name: "Audio Library" }).click();
  await expect(page.getByRole("heading", { name: "Audio Library" })).toBeVisible();
});

test("selected device audio joins the session library and plays without upload", async ({ page }) => {
  await expect(page.getByRole("button", { name: "Add Files" })).toBeEnabled();
  await expect(page.getByRole("button", { name: "Add Folder" })).toBeEnabled();
  await page.getByPlaceholder("Search files").fill("does-not-match");
  await expect(page.getByText("0 of 9 discovered files")).toBeVisible();

  const chooserPromise = page.waitForEvent("filechooser");
  await page.getByRole("button", { name: "Add Files" }).click();
  const chooser = await chooserPromise;
  await chooser.setFiles({ name: "Reference Tone.wav", mimeType: "audio/wav", buffer: createWaveFile() });

  await expect(page.getByRole("dialog", { name: "Review Tracks" })).toHaveCount(0);
  await expect(page.getByRole("status").filter({ hasText: "1 audio file added and shown below" })).toBeVisible();
  await expect(page.getByPlaceholder("Search files")).toHaveValue("");
  await expect(page.getByRole("row", { name: /Reference Tone\.wav/ })).toBeVisible();
  await expect(page.getByText("1 device file in this session · never uploaded")).toBeVisible();
  await page.getByRole("button", { name: "Preview Reference Tone.wav" }).click();
  await expect.poll(() => page.locator("audio").evaluate((audio) => audio.currentTime)).toBeGreaterThan(0);
  const playback = await page.locator("audio").evaluate((audio) => ({ currentTime: audio.currentTime, source: audio.currentSrc }));
  expect(playback.currentTime).toBeGreaterThan(0);
  expect(playback.source).toMatch(/^blob:/);
});

test("folder selection indexes nested supported audio and ignores other files", async ({ page }, testInfo) => {
  const folderPath = testInfo.outputPath("Album Drafts");
  const nestedPath = path.join(folderPath, "Disc 1");
  await mkdir(nestedPath, { recursive: true });
  await writeFile(path.join(nestedPath, "Nested Mix.wav"), createWaveFile({ seconds: 1, frequency: 330 }));
  await writeFile(path.join(folderPath, "Session Notes.txt"), "not audio");
  const chooserPromise = page.waitForEvent("filechooser");
  await page.getByRole("button", { name: "Add Folder" }).click();
  const chooser = await chooserPromise;
  await chooser.setFiles(folderPath);

  await expect(page.getByRole("dialog", { name: "Review Tracks" })).toHaveCount(0);
  await expect(page.getByRole("status").filter({ hasText: "1 audio file added and shown below" })).toBeVisible();
  await expect(page.getByRole("row", { name: /Nested Mix\.wav/ })).toBeVisible();
  await expect(page.getByText("Session Notes.txt", { exact: true })).toHaveCount(0);
});
