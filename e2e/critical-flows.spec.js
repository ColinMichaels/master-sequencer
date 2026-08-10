import { expect, test } from "@playwright/test";
import { e2eProjectState } from "../tests/fixtures/e2e-project.mjs";

const origin = "http://127.0.0.1:4197";

test.beforeEach(async ({ request, page }) => {
  const response = await request.put("/api/state", {
    data: structuredClone(e2eProjectState),
    headers: { Origin: origin },
  });
  expect(response.ok()).toBeTruthy();
  await page.goto("/");
  await expect(page.getByRole("heading", { name: /Fixture Album.*Working Sequence/ })).toBeVisible();
});

test("bootstrap renders the project and protected sources remain masked", async ({ page, request }) => {
  const bootstrap = await (await request.get("/api/bootstrap")).json();
  expect(bootstrap.state.schemaVersion).toBe(4);
  expect(bootstrap.library).toHaveLength(4);
  expect(bootstrap.library.some((file) => file.name === "Hidden Coda.wav")).toBeFalsy();
  expect(bootstrap.library.some((file) => file.name === "[Private source file]")).toBeTruthy();

  await expect(page.getByLabel("Audition source for [SIGNAL SOURCE WITHHELD]").locator("option:checked")).toHaveText("Private candidate A");
  await expect(page.getByText("Hidden Coda.wav", { exact: true })).toHaveCount(0);
  await page.getByRole("button", { name: "Audio Library" }).click();
  await expect(page.getByRole("heading", { name: "Audio Library" })).toBeVisible();
  await expect(page.getByText("Hidden Coda.wav", { exact: true })).toHaveCount(0);
  await expect(page.getByText("[Private source file]", { exact: true }).first()).toBeVisible();
});

test("reordering persists and master selection stays separate from the audition source", async ({ page, request }) => {
  const titles = page.locator(".sequence-track .track-title strong");
  await expect(titles).toHaveText(["Alpha Tone", "[SIGNAL SOURCE WITHHELD]"]);
  await page.getByRole("button", { name: "Move Alpha Tone down" }).click();
  await expect(page.locator(".status-strip [role='status']")).toContainText("Saved locally");
  await page.reload();
  await expect(titles).toHaveText(["[SIGNAL SOURCE WITHHELD]", "Alpha Tone"]);

  await page.getByRole("button", { name: "Track Review" }).click();
  await page.getByRole("button", { name: /Alpha Tone/ }).click();
  await page.getByRole("radio", { name: "Alternate Mix", exact: true }).check();
  await expect(page.locator(".status-strip [role='status']")).toContainText("Saved locally");

  const bootstrap = await (await request.get("/api/bootstrap")).json();
  const alpha = bootstrap.state.albums[0].tracks.find((track) => track.id === "alpha");
  expect(alpha.masterCandidateId).toBe("alpha-b");
  expect(alpha.auditionCandidateId).toBe("alpha-a");
});

test("project import rejects future schemas and modal focus returns to its opener", async ({ page }) => {
  const addAlbum = page.getByRole("button", { name: "Add Album" });
  await addAlbum.click();
  const titleInput = page.getByLabel("Album title");
  await expect(titleInput).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(addAlbum).toBeFocused();

  await page.getByRole("button", { name: "Settings", exact: true }).click();
  const futureState = { ...structuredClone(e2eProjectState), schemaVersion: 99 };
  await page.locator('input[type="file"]').setInputFiles({
    name: "future-project.json",
    mimeType: "application/json",
    buffer: Buffer.from(JSON.stringify(futureState)),
  });
  await expect(page.getByRole("alert")).toContainText("newer than this application supports");
  await page.getByRole("button", { name: "Sequence", exact: true }).click();
  await expect(page.getByRole("heading", { name: /Fixture Album.*Working Sequence/ })).toBeVisible();
});

test("library filters are functional and primary workspaces do not overflow a phone viewport", async ({ page }) => {
  await page.getByRole("button", { name: "Audio Library" }).click();
  await expect(page.getByText("4 of 4 discovered files")).toBeVisible();
  const rows = page.locator(".audio-table-body .audio-row");
  await page.getByLabel("Filter by usage").selectOption("unassigned");
  await expect(rows).toHaveCount(1);
  await expect(rows.first()).toContainText("Loose Sketch.mp3");
  await page.getByPlaceholder("Search files").fill("alternate");
  await expect(rows).toHaveCount(0);
  await page.getByLabel("Filter by usage").selectOption("all");
  await expect(rows).toHaveCount(1);
  await expect(rows.first()).toContainText("Alternate Mix.mp3");

  await page.setViewportSize({ width: 390, height: 844 });
  for (const view of ["Sequence", "Track Review", "Album Decisions", "Mastering", "Assets", "Audio Library", "Settings"]) {
    await page.getByRole("button", { name: view, exact: true }).click();
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    expect(overflow, `${view} overflowed the 390px viewport`).toBeLessThanOrEqual(1);
  }
});

test("album decisions persist versions, transition notes, explicit approval, and safe templates", async ({ page, request }) => {
  await page.getByRole("button", { name: "Album Decisions" }).click();
  await page.getByLabel("Sequence version name").fill("Opening order");
  await page.getByRole("button", { name: "Save Current" }).click();
  await expect(page.locator(".version-list")).toContainText("Opening order");
  await page.locator(".version-list").getByRole("button", { name: "Duplicate" }).click();
  await expect(page.locator(".version-list li")).toHaveCount(2);

  await page.getByText("Listening notes").locator("textarea").fill("Hold the decay until the next downbeat.");
  await page.getByLabel("Marker label").fill("Downbeat");
  await page.getByLabel("Marker seconds").fill("0.42");
  await page.getByRole("button", { name: "Marker" }).click();
  await expect(page.locator(".transition-markers")).toContainText("0.42s");
  await page.getByLabel("Human approval for Alpha Tone").check();

  await page.getByLabel("Template name").fill("Two-track structure");
  await page.getByRole("button", { name: "Save Structure" }).click();
  const templateSelect = page.locator(".template-actions form").nth(1).locator("select");
  await expect(templateSelect.locator("option")).toHaveCount(2);
  await templateSelect.selectOption({ label: "Two-track structure" });
  await page.getByLabel("New album title").fill("Next Fixture");
  await page.getByRole("button", { name: "Create Empty Album" }).click();
  await expect(page.getByRole("heading", { name: /Next Fixture.*Album Decisions/ })).toBeVisible();
  await expect(page.locator(".status-strip [role='status']")).toContainText("Saved locally");

  const bootstrap = await (await request.get("/api/bootstrap")).json();
  const original = bootstrap.state.albums.find((album) => album.id === "fixture-album");
  const copy = bootstrap.state.albums.find((album) => album.title === "Next Fixture");
  expect(original.sequenceVersions).toHaveLength(2);
  expect(original.transitionNotebook[0].notes).toContain("next downbeat");
  expect(original.tracks[0].humanApproved).toBe(true);
  expect(copy.tracks.every((track) => track.candidates.length === 0 && !track.humanApproved)).toBe(true);
  expect(copy.orderApproved).toBe(false);
});

test("mastering analysis, chapter cues, and delivery authority remain explicit", async ({ page, request }) => {
  await page.getByRole("button", { name: "Mastering" }).click();
  await page.getByLabel("Print requirements").selectOption("archive-wav");
  await page.getByLabel("Ready to publish").check();
  await page.getByRole("button", { name: "Analyze Source" }).click();
  await expect(page.locator(".technical-analysis dl")).toContainText("LUFS");
  await page.getByRole("button", { name: "Preview chapter 1: Alpha Tone" }).click();
  await expect(page.locator(".transport-copy")).toContainText("Alpha Tone");
  await expect(page.locator(".status-strip [role='status']")).toContainText("Saved locally");

  const bootstrap = await (await request.get("/api/bootstrap")).json();
  expect(bootstrap.state.albums[0].delivery).toEqual({ profileId: "archive-wav", masterApproved: false, readyToPublish: true });

  await page.getByRole("button", { name: "Print / Export Audio" }).click();
  await expect(page.getByText("Archive WAV", { exact: true })).toBeVisible();
  await expect(page.getByRole("radio", { name: /MP3 for Review/ })).toBeDisabled();
  await page.getByRole("button", { name: "Cancel", exact: true }).click();
});

test("a real render job completes with documented range-readable output and appears in history", async ({ page, request }) => {
  const createResponse = await request.post("/api/renders", {
    data: { album: e2eProjectState.albums[0], scope: "track", trackId: "alpha", format: "wav", deliveryProfileId: "archive-wav" },
    headers: { Origin: origin },
  });
  expect(createResponse.status()).toBe(202);
  const created = await createResponse.json();
  let completedJob;
  await expect.poll(async () => {
    completedJob = (await (await request.get(`/api/render-jobs/${created.job.id}`)).json()).job;
    return completedJob.status;
  }).toBe("completed");

  expect(completedJob.progress).toBe(100);
  expect(completedJob.result.cueUrl).toBeTruthy();
  expect(completedJob.result.manifestUrl).toBeTruthy();
  const range = await request.get(completedJob.result.audioUrl, { headers: { Range: "bytes=0-31" } });
  expect(range.status()).toBe(206);
  expect((await range.body()).byteLength).toBe(32);
  const manifest = await (await request.get(completedJob.result.manifestUrl)).json();
  expect(manifest.renderId).toBe(completedJob.result.id);
  expect(manifest.delivery.profileId).toBe("archive-wav");
  expect(manifest.tracks).toHaveLength(1);

  await page.getByRole("button", { name: "Mastering" }).click();
  await expect(page.locator(".render-history")).toContainText(completedJob.result.audioName);
});
