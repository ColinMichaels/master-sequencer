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
  await expect(page.locator(".layout-preview")).toHaveCount(0);
  const bootstrap = await (await request.get("/api/bootstrap")).json();
  expect(bootstrap.state.schemaVersion).toBe(5);
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

test("collapsed albums keep compact actions while header totals stay text-only", async ({ page }) => {
  await expect(page.locator(".header-summary svg")).toHaveCount(0);
  await page.getByRole("button", { name: "Hide albums panel" }).click();

  const compactRail = page.locator(".album-rail-compact");
  await expect(compactRail).toBeVisible();
  await expect(compactRail.getByRole("button", { name: /Open saved projects for/ })).toBeVisible();
  await expect(compactRail.getByRole("button", { name: "Open album Fixture Album" })).toHaveAttribute("aria-current", "true");
  await expect(compactRail.getByRole("button", { name: "Add Album" })).toBeVisible();
  await expect(compactRail.getByRole("button", { name: "New Project" })).toBeVisible();

  await compactRail.getByRole("button", { name: "Add Album" }).click();
  await expect(page.getByRole("dialog", { name: "Add Album" })).toBeVisible();
  await page.keyboard.press("Escape");
  await page.setViewportSize({ width: 390, height: 844 });
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  expect(overflow).toBeLessThanOrEqual(1);
  await page.getByRole("button", { name: "Show albums panel" }).click();
  await expect(compactRail).toBeHidden();
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

test("project setup owns the artist used by new albums", async ({ page, request }) => {
  const freshProject = structuredClone(e2eProjectState);
  freshProject.settings.project.setupComplete = false;
  await request.put("/api/state", { data: freshProject, headers: { Origin: origin } });
  await page.reload();

  const setup = page.getByRole("dialog", { name: "Start a New Project" });
  await expect(setup).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(setup).toBeVisible();
  await setup.getByLabel("Artist name").fill("Open Orbit Ensemble");
  await setup.getByRole("button", { name: "Start Project" }).click();
  await expect(setup).toBeHidden();

  await page.getByRole("button", { name: "Settings", exact: true }).click();
  await expect(page.getByLabel("Artist name")).toHaveValue("Open Orbit Ensemble");

  await page.getByRole("button", { name: "Add Album" }).click();
  await page.getByLabel("Album title").fill("Second Light");
  await page.getByRole("button", { name: "Add Album", exact: true }).last().click();
  await expect(page.locator(".status-strip [role='status']")).toContainText("Saved locally");

  const bootstrap = await (await request.get("/api/bootstrap")).json();
  expect(bootstrap.state.settings.project).toEqual({ artistName: "Open Orbit Ensemble", setupComplete: true });
  expect(bootstrap.state.albums.every((album) => album.artist === "Open Orbit Ensemble")).toBeTruthy();
});

test("a fresh project saves the old project, can load it again, and albums can be deleted", async ({ page }) => {
  await page.getByRole("button", { name: "New Project", exact: true }).click();
  const fresh = page.getByRole("dialog", { name: "Start a Fresh Project" });
  await fresh.getByLabel("Project name").fill("Fresh Project QA");
  await fresh.getByLabel("Artist name").fill("Fresh Artist");
  await fresh.getByLabel("First album title").fill("Clean Slate");
  await fresh.getByLabel("Album era").selectOption("current");
  await fresh.getByRole("button", { name: "Start Fresh Project" }).click();

  await expect(page.getByRole("heading", { name: /Clean Slate.*Working Sequence/ })).toBeVisible();
  await expect(page.getByText("This album is ready for its first track.")).toBeVisible();
  await expect(page.locator(".status-strip [role='status']")).toContainText("New project created");

  await page.getByRole("button", { name: /Current project Fresh Project QA/ }).click();
  const saved = page.getByRole("dialog", { name: "Saved Projects" });
  const oldProject = saved.locator(".saved-project-list li").filter({ hasText: "Fixture Artist — Fixture Album" });
  await expect(oldProject).toContainText("1 album");
  await oldProject.getByRole("button", { name: "Load Project" }).click();
  await expect(page.getByRole("heading", { name: /Fixture Album.*Working Sequence/ })).toBeVisible();
  await expect(page.getByText("Alpha Tone", { exact: true }).first()).toBeVisible();

  await page.getByRole("button", { name: "Add Album" }).click();
  await page.getByLabel("Album title").fill("Delete Me");
  await page.getByRole("button", { name: "Add Album", exact: true }).last().click();
  await page.getByRole("button", { name: "Delete Delete Me" }).click();
  const deleteDialog = page.getByRole("dialog", { name: "Delete Album" });
  await expect(deleteDialog).toContainText("Indexed audio, artwork, lyric files, and rendered exports stay exactly where they are");
  await deleteDialog.getByRole("button", { name: "Delete Album" }).click();
  await expect(page.getByRole("heading", { name: /Fixture Album.*Working Sequence/ })).toBeVisible();
  await expect(page.getByText("Delete Me", { exact: true })).toHaveCount(0);
  await expect(page.locator(".status-strip [role='status']")).toContainText("Saved locally");
});

test("an unconfigured installation explains the complete album workflow", async ({ page, request }) => {
  const freshProject = structuredClone(e2eProjectState);
  freshProject.settings.project.setupComplete = false;
  await request.put("/api/state", { data: freshProject, headers: { Origin: origin } });
  await page.route("**/api/bootstrap", async (route) => {
    const response = await route.fetch();
    const payload = await response.json();
    await route.fulfill({ response, json: { ...payload, library: [], roots: [], supportedFormats: [] } });
  });
  await page.reload();

  const guide = page.getByRole("dialog", { name: "Welcome to Project Sequencer" });
  await expect(guide).toBeVisible();
  await expect(guide.getByRole("heading", { name: "Audition every version. Build one final album." })).toBeVisible();
  await expect(guide.getByText("24-bit / 48 kHz WAV", { exact: false })).toBeVisible();
  await expect(guide.getByText(/shared EQ, compression, output gain, and limiting/)).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(guide).toBeVisible();

  await guide.getByLabel("Artist name").fill("Open Orbit Ensemble");
  await guide.getByRole("button", { name: "Start Project" }).click();
  await expect(guide.getByRole("button", { name: "Choose Audio Files" })).toBeEnabled();
  await guide.getByRole("button", { name: "Create a New Album" }).click();
  await expect(guide).toBeHidden();
  await expect(page.getByRole("dialog", { name: "Add Album" })).toBeVisible();

  await page.getByRole("button", { name: "Close dialog" }).click();
  await page.setViewportSize({ width: 390, height: 844 });
  await page.reload();
  await expect(page.getByRole("dialog", { name: "Welcome to Project Sequencer" })).toBeVisible();
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  expect(overflow).toBeLessThanOrEqual(1);
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

test("the transport waveform stays inside its desktop and phone footer", async ({ page }) => {
  const transportBounds = async () => page.evaluate(() => {
    const bar = document.querySelector(".transport-bar").getBoundingClientRect();
    const player = document.querySelector(".transport-player").getBoundingClientRect();
    return { bar: { top: bar.top, bottom: bar.bottom }, player: { top: player.top, bottom: player.bottom } };
  });

  let bounds = await transportBounds();
  expect(bounds.player.top).toBeGreaterThanOrEqual(bounds.bar.top);
  expect(bounds.player.bottom).toBeLessThanOrEqual(bounds.bar.bottom);

  await page.setViewportSize({ width: 390, height: 844 });
  bounds = await transportBounds();
  expect(bounds.player.top).toBeGreaterThanOrEqual(bounds.bar.top);
  expect(bounds.player.bottom).toBeLessThanOrEqual(bounds.bar.bottom);
});

test("space always toggles transport playback without hijacking text entry", async ({ page }) => {
  const transportToggle = page.locator(".transport-playback-toggle");
  await transportToggle.click();
  await expect(transportToggle).toHaveAttribute("aria-label", "Pause playback");

  await page.keyboard.press("Space");
  await expect(transportToggle).toHaveAttribute("aria-label", "Resume playback");
  await expect(page.locator(".transport-copy small")).toHaveText("Playback paused. Press Space to resume.");
  await page.keyboard.press("Space");
  await expect(transportToggle).toHaveAttribute("aria-label", "Pause playback");
  await expect(page.locator(".transport-copy small")).toHaveText("Playback resumed. Press Space to pause.");

  await page.keyboard.press("Space");
  await expect(transportToggle).toHaveAttribute("aria-label", "Resume playback");
  await page.getByRole("button", { name: "Audio Library", exact: true }).click();
  const search = page.getByPlaceholder("Search files");
  await search.click();
  await page.keyboard.type("alpha tone");
  await expect(search).toHaveValue("alpha tone");
  await expect(transportToggle).toHaveAttribute("aria-label", "Resume playback");
});

test("the sequence row follows the main player track and playback state", async ({ page }) => {
  const alphaRow = page.locator(".sequence-track").filter({ hasText: "Alpha Tone" });
  const rowPlayButton = alphaRow.getByRole("button", { name: "Play sequence from Alpha Tone" });

  await rowPlayButton.click();
  await expect(alphaRow).toHaveClass(/is-playing/);
  await expect(alphaRow.getByRole("button", { name: "Pause Alpha Tone" })).toHaveAttribute("aria-pressed", "true");
  await expect(page.locator(".transport-playback-toggle")).toHaveAttribute("aria-label", "Pause playback");

  await alphaRow.getByRole("button", { name: "Pause Alpha Tone" }).click();
  await expect(alphaRow).not.toHaveClass(/is-playing/);
  await expect(alphaRow.getByRole("button", { name: "Resume Alpha Tone" })).toHaveAttribute("aria-pressed", "false");
  await expect(page.locator(".transport-playback-toggle")).toHaveAttribute("aria-label", "Resume playback");

  await alphaRow.getByRole("button", { name: "Resume Alpha Tone" }).click();
  await expect(alphaRow).toHaveClass(/is-playing/);
  await expect(alphaRow.getByRole("button", { name: "Pause Alpha Tone" })).toHaveAttribute("aria-pressed", "true");
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
  const commitNumber = async (name, value) => {
    const input = page.getByRole("spinbutton", { name });
    await input.fill(String(value));
    await input.press("Enter");
  };

  await commitNumber(/Track gain/, -3.5);
  await page.locator(".master-module--eq .manual-control-bank > summary").click();
  await page.getByLabel("Enable MASTER EQ").check();
  await page.getByRole("slider", { name: "Low shelf gain graphical control" }).fill("1.5");
  await expect(page.getByRole("spinbutton", { name: "Low shelf gain" })).toHaveValue("1.5");
  await page.locator(".master-module--compressor .manual-control-bank > summary").click();
  await page.getByLabel("Enable MASTER compressor").check();
  await page.getByRole("slider", { name: "Threshold graphical control" }).fill("-22");
  await expect(page.getByRole("spinbutton", { name: "Threshold" })).toHaveValue("-22");
  await commitNumber(/Ratio/, 2.5);
  await expect(page.getByRole("slider", { name: "Ratio graphical control" })).toHaveAttribute("aria-valuetext", "2.5:1");
  await page.locator(".master-module--output .manual-control-bank > summary").click();
  await commitNumber(/MASTER output gain/, -1);
  await page.locator(".master-module--limiter .manual-control-bank > summary").click();
  await page.getByLabel("Enable MASTER limiter").check();
  await page.getByRole("slider", { name: "Ceiling graphical control" }).fill("-1");
  await expect(page.getByRole("spinbutton", { name: "Ceiling" })).toHaveValue("-1");
  await page.getByLabel("Reference audio track").selectOption("test-root::Alternate Mix.mp3");
  await page.getByRole("button", { name: /B Clean reference/ }).click();
  await expect(page.locator(".transport-copy")).toContainText("Reference · Alternate Mix.mp3");
  await expect(page.locator(".transport-waveform-meta strong")).toHaveText("B · clean reference · MASTER bypassed");
  await expect(page.locator(".reference-ab-status")).toContainText("mastering effects are bypassed");
  await expect(page.getByRole("button", { name: /A Current master/ })).toHaveAttribute("aria-keyshortcuts", "ArrowLeft");
  await expect(page.getByRole("button", { name: /B Clean reference/ })).toHaveAttribute("aria-keyshortcuts", "ArrowRight");
  await page.keyboard.press("ArrowLeft");
  await expect(page.locator(".transport-copy")).toContainText("Alpha Tone");
  await expect(page.locator(".transport-waveform-meta strong")).toContainText("A · current master · MASTER live");
  await page.keyboard.press("ArrowRight");
  await expect(page.locator(".transport-waveform-meta strong")).toHaveText("B · clean reference · MASTER bypassed");
  await page.getByRole("spinbutton", { name: /Track gain/ }).focus();
  await page.keyboard.press("ArrowLeft");
  await expect(page.locator(".transport-waveform-meta strong")).toHaveText("B · clean reference · MASTER bypassed");
  await page.getByLabel("Print requirements").selectOption("archive-wav");
  await page.getByLabel("Ready to publish").check();
  await page.getByRole("button", { name: "Analyze Source" }).click();
  await expect(page.locator(".technical-analysis dl")).toContainText("LUFS");
  await page.getByRole("button", { name: "Preview chapter 1: Alpha Tone" }).click();
  await expect(page.locator(".transport-copy")).toContainText("Alpha Tone");
  await expect(page.locator(".transport-waveform-meta strong")).toHaveText("MASTER live · EQ / compressor / output / limiter");
  const outputMeter = page.getByTestId("master-output-meter");
  await expect(outputMeter).toBeVisible();
  await expect(outputMeter).toHaveClass(/is-active/);
  await expect.poll(async () => Number(await outputMeter.locator('[data-meter-channel="left"]').getAttribute("data-meter-rms")), { timeout: 2_000 }).toBeGreaterThan(-60);
  await expect.poll(async () => Number(await outputMeter.locator(".master-spectrum-panel").getAttribute("data-spectrum-peak")), { timeout: 2_000 }).toBeGreaterThan(-80);
  await expect(page.locator(".status-strip [role='status']")).toContainText("Saved locally");

  const bootstrap = await (await request.get("/api/bootstrap")).json();
  expect(bootstrap.state.albums[0].delivery).toEqual({ profileId: "archive-wav", masterApproved: false, readyToPublish: true });
  expect(bootstrap.state.albums[0].tracks[0].mastering.gainDb).toBe(-3.5);
  expect(bootstrap.state.albums[0].masterBus.eq.lowShelf.gainDb).toBe(1.5);
  expect(bootstrap.state.albums[0].masterBus.compressor.thresholdDb).toBe(-22);
  expect(bootstrap.state.albums[0].masterBus.compressor.ratio).toBe(2.5);
  expect(bootstrap.state.albums[0].masterBus.outputGainDb).toBe(-1);
  expect(bootstrap.state.albums[0].masterBus.limiter.ceilingDbfs).toBe(-1);
  expect(bootstrap.state.albums[0].masteringReferenceSourceRef).toEqual({ rootId: "test-root", relativePath: "Alternate Mix.mp3" });

  const renderResponse = await request.post("/api/renders", {
    data: { album: bootstrap.state.albums[0], scope: "track", trackId: "alpha", format: "wav", deliveryProfileId: "archive-wav" },
    headers: { Origin: origin },
  });
  expect(renderResponse.status()).toBe(202);
  const render = await renderResponse.json();
  let renderedJob;
  await expect.poll(async () => {
    renderedJob = (await (await request.get(`/api/render-jobs/${render.job.id}`)).json()).job;
    return renderedJob.status;
  }).toBe("completed");
  const manifest = await (await request.get(renderedJob.result.manifestUrl)).json();
  expect(manifest.tracks[0].gainDb).toBe(-3.5);
  expect(manifest.masterBus.eq.lowShelf.gainDb).toBe(1.5);
  expect(manifest.masterBus.compressor.thresholdDb).toBe(-22);
  expect(manifest.masterBus.limiter.ceilingDbfs).toBe(-1);

  await page.getByRole("button", { name: "Print / Export Audio" }).click();
  await expect(page.getByText("Archive WAV", { exact: true })).toBeVisible();
  await expect(page.getByRole("radio", { name: /MP3 for Review/ })).toBeDisabled();
  await page.getByRole("button", { name: "Cancel", exact: true }).click();
});

test("component and full MASTER presets save, recall, delete, undo, and persist", async ({ page, request }) => {
  await page.getByRole("button", { name: "Mastering", exact: true }).click();
  const commitNumber = async (name, value) => {
    const input = page.getByRole("spinbutton", { name });
    await input.fill(String(value));
    await input.press("Enter");
  };

  const eqModule = page.locator(".master-module--eq");
  await expect(eqModule.getByRole("spinbutton", { name: "Low shelf gain" })).not.toBeVisible();
  await eqModule.locator(".manual-control-bank > summary").click();
  await expect(eqModule.getByRole("spinbutton", { name: "Low shelf gain" })).toBeVisible();
  const eqToggle = page.getByLabel("Enable MASTER EQ");
  await expect(eqToggle.locator("..")).toHaveAttribute("data-tooltip", "Enable MASTER EQ");
  await expect(eqModule.locator("header")).not.toContainText("Enable MASTER EQ");
  await page.getByLabel("Enable MASTER EQ").check();
  await expect(eqToggle.locator("..")).toHaveAttribute("data-tooltip", "Disable MASTER EQ");
  await commitNumber("Low shelf gain", 2.5);
  const eqPresets = page.getByRole("region", { name: "EQ presets" });
  expect(await eqPresets.evaluate((element) => element.parentElement?.tagName)).toBe("HEADER");
  await expect(eqPresets.locator("summary")).not.toContainText("Manage");
  await expect(eqPresets.getByLabel("EQ preset search or name", { exact: true })).not.toBeVisible();
  await eqPresets.locator("summary").click();
  await eqPresets.getByLabel("EQ preset search or name", { exact: true }).press("Escape");
  await expect(eqPresets.getByLabel("EQ preset search or name", { exact: true })).not.toBeVisible();
  await eqPresets.locator("summary").click();
  await eqPresets.getByLabel("EQ preset search or name", { exact: true }).fill("Warm Lift");
  await eqPresets.getByRole("button", { name: "Save current" }).click();
  await expect(eqPresets.getByLabel("EQ preset", { exact: true })).toContainText("Warm Lift");
  await expect(eqPresets.getByLabel("EQ preset", { exact: true })).toHaveValue("warm-lift");
  await eqPresets.getByLabel("EQ preset search or name", { exact: true }).fill("No match");
  await expect(eqPresets.getByLabel("EQ preset", { exact: true })).toContainText("No matching EQ presets");
  await eqPresets.getByLabel("EQ preset search or name", { exact: true }).fill("Warm");
  await expect(eqPresets.getByLabel("EQ preset", { exact: true })).toContainText("Warm Lift");

  await commitNumber("Low shelf gain", -3);
  await eqPresets.getByLabel("EQ preset", { exact: true }).selectOption("warm-lift");
  await eqPresets.getByRole("button", { name: "Load" }).click();
  await expect(page.getByRole("spinbutton", { name: "Low shelf gain" })).toHaveValue("2.5");
  await expect(eqPresets.getByLabel("EQ preset search or name", { exact: true })).not.toBeVisible();

  await page.getByLabel("Enable MASTER compressor").check();
  await page.locator(".master-module--compressor .manual-control-bank > summary").click();
  await commitNumber("Threshold", -24);
  await page.locator(".master-module--output .manual-control-bank > summary").click();
  await commitNumber("MASTER output gain", -1.5);
  await page.getByLabel("Enable MASTER limiter").check();
  await page.locator(".master-module--limiter .manual-control-bank > summary").click();
  await commitNumber("Ceiling", -1.2);
  const masterPresets = page.getByRole("region", { name: "MASTER chain presets" });
  await masterPresets.locator("summary").click();
  await masterPresets.getByLabel("MASTER chain preset search or name", { exact: true }).fill("Streaming Chain");
  await masterPresets.getByRole("button", { name: "Save current" }).click();
  await expect(masterPresets.getByLabel("MASTER chain preset", { exact: true })).toContainText("Streaming Chain");

  await page.getByRole("button", { name: "Reset MASTER" }).click();
  await expect(page.getByLabel("Enable MASTER EQ")).not.toBeChecked();
  await expect(page.getByRole("spinbutton", { name: "MASTER output gain" })).toHaveValue("0");
  await masterPresets.getByLabel("MASTER chain preset", { exact: true }).selectOption("streaming-chain");
  await masterPresets.getByRole("button", { name: "Load" }).click();
  await expect(page.getByLabel("Enable MASTER EQ")).toBeChecked();
  await expect(page.getByLabel("Enable MASTER compressor")).toBeChecked();
  await expect(page.getByLabel("Enable MASTER limiter")).toBeChecked();
  await expect(page.getByRole("spinbutton", { name: "MASTER output gain" })).toHaveValue("-1.5");

  await eqPresets.locator("summary").click();
  await eqPresets.getByRole("button", { name: "Delete" }).click();
  await expect(eqPresets.getByRole("button", { name: "Confirm delete" })).toBeVisible();
  await eqPresets.getByRole("button", { name: "Confirm delete" }).click();
  await expect(eqPresets.getByLabel("EQ preset", { exact: true })).not.toContainText("Warm Lift");
  await page.getByRole("button", { name: "Undo Delete eq mastering preset" }).click();
  await expect(eqPresets.getByLabel("EQ preset", { exact: true })).toContainText("Warm Lift");
  await expect(page.locator(".status-strip [role='status']")).toContainText("Saved locally");

  await page.reload();
  await page.getByRole("button", { name: "Mastering", exact: true }).click();
  await page.getByRole("region", { name: "EQ presets" }).locator("summary").click();
  await page.getByRole("region", { name: "MASTER chain presets" }).locator("summary").click();
  await expect(page.getByLabel("EQ preset", { exact: true })).toContainText("Warm Lift");
  await expect(page.getByLabel("MASTER chain preset", { exact: true })).toContainText("Streaming Chain");
  const bootstrap = await (await request.get("/api/bootstrap")).json();
  expect(bootstrap.state.masteringPresets.eq[0].settings.lowShelf.gainDb).toBe(2.5);
  expect(bootstrap.state.masteringPresets.master[0].settings.outputGainDb).toBe(-1.5);
  expect(bootstrap.state.albums[0].masterBus.compressor.thresholdDb).toBe(-24);
});

test("incremental search, saved filters, undo, and portable checksums stay local and non-destructive", async ({ page, request }) => {
  const titles = page.locator(".sequence-track .track-title strong");
  await page.getByRole("button", { name: "Move Alpha Tone down" }).click();
  await page.getByRole("button", { name: "Undo Project edit" }).click();
  await expect(titles).toHaveText(["Alpha Tone", "[SIGNAL SOURCE WITHHELD]"]);
  await page.getByRole("button", { name: "Redo Project edit" }).click();
  await expect(titles).toHaveText(["[SIGNAL SOURCE WITHHELD]", "Alpha Tone"]);

  await page.getByRole("button", { name: "Audio Library" }).click();
  await page.getByPlaceholder("Search files").fill("alternate");
  await page.getByLabel("Filter by format").selectOption("mp3");
  await page.getByLabel("Saved filter name").fill("Alternate MP3");
  await page.locator(".saved-filter-bar").getByRole("button", { name: "Save Current" }).click();
  const savedFilterSelect = page.locator(".saved-filter-bar > label select");
  await expect(savedFilterSelect.locator("option")).toHaveCount(2);
  await page.getByPlaceholder("Search files").fill("");
  await page.getByLabel("Filter by format").selectOption("all");
  await savedFilterSelect.selectOption({ label: "Alternate MP3" });
  await expect(page.getByPlaceholder("Search files")).toHaveValue("alternate");
  await expect(page.getByLabel("Filter by format")).toHaveValue("mp3");

  const rescan = await (await request.post("/api/rescan", { headers: { Origin: origin } })).json();
  expect(rescan.scan.mode).toBe("incremental");
  expect(rescan.scan.reusedMetadata).toBe(4);
  expect(rescan.roots[0].connectionState).toBe("connected");

  await expect(page.locator(".status-strip [role='status']")).toContainText("Saved locally");
  const bundle = await (await request.get("/api/project-bundle")).json();
  expect(bundle.mediaIncluded).toBe(false);
  expect(bundle.kind).toContain("json-checksum-bundle");
  expect(bundle.sources.filter((source) => source.status === "verified").every((source) => /^[a-f0-9]{64}$/.test(source.sha256))).toBe(true);
  expect(JSON.stringify(bundle)).not.toContain("/private/tmp/");
  expect(bundle.project.settings.librarySavedFilters[0].name).toBe("Alternate MP3");
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
