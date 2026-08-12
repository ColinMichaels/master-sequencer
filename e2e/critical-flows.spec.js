import { expect, test } from "@playwright/test";
import { e2eProjectState } from "../tests/fixtures/e2e-project.mjs";
import { FIRST_RUN_GUIDE_STORAGE_KEY, FIRST_RUN_GUIDE_STORAGE_VALUE } from "../src/lib/first-run.js";

const origin = "http://127.0.0.1:4197";

const parseCssColor = (value) => {
  const hex = value.match(/^#([\da-f]{6})$/i)?.[1];
  if (hex) return [0, 2, 4].map((offset) => Number.parseInt(hex.slice(offset, offset + 2), 16));
  const rgb = value.match(/rgba?\(\s*([\d.]+)[,\s]+([\d.]+)[,\s]+([\d.]+)/i);
  if (rgb) return rgb.slice(1, 4).map(Number);
  const srgb = value.match(/color\(srgb\s+([\d.]+)\s+([\d.]+)\s+([\d.]+)/i);
  if (srgb) return srgb.slice(1, 4).map((channel) => Number(channel) * 255);
  throw new Error(`Unsupported CSS color: ${value}`);
};

const contrastRatio = (foreground, background) => {
  const luminance = (value) => {
    const channels = parseCssColor(value).map((channel) => {
      const normalized = channel / 255;
      return normalized <= 0.04045 ? normalized / 12.92 : ((normalized + 0.055) / 1.055) ** 2.4;
    });
    return (0.2126 * channels[0]) + (0.7152 * channels[1]) + (0.0722 * channels[2]);
  };
  const foregroundLuminance = luminance(foreground);
  const backgroundLuminance = luminance(background);
  return (Math.max(foregroundLuminance, backgroundLuminance) + 0.05) / (Math.min(foregroundLuminance, backgroundLuminance) + 0.05);
};

test.beforeEach(async ({ request, page }, testInfo) => {
  if (!testInfo.title.includes("first-time visitors")) {
    await page.addInitScript(({ key, value }) => localStorage.setItem(key, value), {
      key: FIRST_RUN_GUIDE_STORAGE_KEY,
      value: FIRST_RUN_GUIDE_STORAGE_VALUE,
    });
  }
  const response = await request.put("/api/state", {
    data: structuredClone(e2eProjectState),
    headers: { Origin: origin },
  });
  expect(response.ok()).toBeTruthy();
  await page.goto("/");
  await expect(page.getByRole("table", { name: "Fixture Album track order" })).toBeVisible();
});

test("first-time visitors see help once and can reopen app instructions from quick settings", async ({ page }) => {
  const welcomeGuide = page.getByRole("dialog", { name: "Welcome to Project Sequencer" });
  await expect(welcomeGuide).toBeVisible();
  await expect(welcomeGuide.getByRole("heading", { name: "From source files to final album" })).toBeVisible();
  await welcomeGuide.getByRole("button", { name: "Explore the Workspace" }).click();
  await expect(welcomeGuide).toBeHidden();

  await page.reload();
  await expect(welcomeGuide).toBeHidden();
  await page.getByRole("button", { name: "Open settings menu" }).click();
  const quickSettings = page.getByRole("dialog", { name: "Quick Settings" });
  await expect(quickSettings.getByRole("button", { name: "Help & app instructions" })).toBeVisible();
  await quickSettings.getByRole("button", { name: "Help & app instructions" }).click();
  const helpGuide = page.getByRole("dialog", { name: "Project Sequencer Help & Instructions" });
  await expect(helpGuide).toBeVisible();
  await expect(helpGuide.getByText("Your source audio stays untouched.")).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(helpGuide).toBeHidden();
});

test("bootstrap renders the project and protected sources remain masked", async ({ page, request }) => {
  await expect(page.locator(".layout-preview")).toHaveCount(0);
  const bootstrap = await (await request.get("/api/bootstrap")).json();
  expect(bootstrap.state.schemaVersion).toBe(6);
  expect(bootstrap.library).toHaveLength(4);
  expect(bootstrap.library.some((file) => file.name === "Hidden Coda.wav")).toBeFalsy();
  expect(bootstrap.library.some((file) => file.name === "[Private source file]")).toBeTruthy();

  await expect(page.getByLabel("Audition source for [SIGNAL SOURCE WITHHELD]").locator("option:checked")).toHaveText("Private candidate A");
  await expect(page.getByText("Hidden Coda.wav", { exact: true })).toHaveCount(0);
  await page.getByRole("button", { name: "Audio Library" }).click();
  await expect(page.getByRole("table", { name: "Audio files" })).toBeVisible();
  await expect(page.getByText("Hidden Coda.wav", { exact: true })).toHaveCount(0);
  await expect(page.getByText("[Private source file]", { exact: true }).first()).toBeVisible();
});

test("albums default to the compact rail while header stats use badge buttons", async ({ page }) => {
  const headerMeter = page.getByTestId("header-master-meter");
  await expect(headerMeter).toBeVisible();
  await expect(headerMeter).toHaveAttribute("data-meter-routing", "raw");
  await expect(headerMeter).toHaveAttribute("aria-label", /Raw direct audio/);
  await expect.poll(() => headerMeter.evaluate((element) => getComputedStyle(element).borderColor)).toBe("rgba(0, 0, 0, 0)");
  await expect(headerMeter).toHaveAttribute("data-meter-mode", "vu");
  await expect(headerMeter.getByRole("button", { name: "Show VU meter" })).toHaveAttribute("aria-pressed", "true");
  const meterBox = await headerMeter.boundingBox();
  const meterDisplayBox = await headerMeter.locator(".header-meter-display").boundingBox();
  const vuTrackBox = await headerMeter.locator(".header-vu-track").first().boundingBox();
  const statisticsBox = await page.locator(".header-summary-shell").boundingBox();
  expect(meterBox.width).toBeGreaterThanOrEqual(180);
  expect(meterDisplayBox.width).toBeGreaterThanOrEqual(140);
  expect(vuTrackBox.width).toBeGreaterThanOrEqual(110);
  expect(meterBox.x + meterBox.width).toBeLessThanOrEqual(statisticsBox.x);
  await headerMeter.getByRole("button", { name: "Show frequency analyzer" }).click();
  await expect(headerMeter).toHaveAttribute("data-meter-mode", "spectrum");
  await expect(headerMeter.locator(".header-spectrum")).toBeVisible();

  const headerStats = page.locator(".header-summary");
  await expect(headerStats.getByRole("button")).toHaveCount(4);
  await expect(headerStats.getByRole("button", { name: "Tracks: 2. Show album statistics" }).locator(".header-stat-badge")).toHaveText("2");
  await headerStats.getByRole("button", { name: "Missing sources: 0. Show album statistics" }).click();
  const statistics = page.getByRole("dialog", { name: "Album Statistics" });
  await expect(statistics).toBeVisible();
  await expect(statistics.getByRole("button")).toHaveCount(5);
  await statistics.getByRole("button", { name: "Missing sources: 0. Open Audio Library" }).click();
  await expect(page.getByRole("table", { name: "Audio files" })).toBeVisible();
  await expect(statistics).toBeHidden();
  await page.getByRole("button", { name: "Sequence", exact: true }).click();

  await headerStats.getByRole("button", { name: "Tracks: 2. Show album statistics" }).click();
  await expect(statistics).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(statistics).toBeHidden();
  await expect(headerStats.getByRole("button", { name: "Tracks: 2. Show album statistics" })).toBeFocused();

  const compactRail = page.locator(".album-rail-compact");
  await expect(compactRail).toBeVisible();
  await expect(page.getByRole("button", { name: "Show albums panel" })).toBeVisible();
  await expect(compactRail.getByRole("button", { name: /Open saved projects for/ })).toBeVisible();
  await expect(compactRail.getByRole("button", { name: "Open album Fixture Album" })).toHaveAttribute("aria-current", "true");
  await expect(compactRail.getByRole("button", { name: "Add Album" })).toBeVisible();
  await expect(compactRail.getByRole("button", { name: "New Project" })).toBeVisible();

  await compactRail.getByRole("button", { name: "Add Album" }).click();
  await expect(page.getByRole("dialog", { name: "Add Album" })).toBeVisible();
  await page.keyboard.press("Escape");
  await page.getByRole("button", { name: "Show albums panel" }).click();
  await expect(compactRail).toBeHidden();
  await expect(page.getByRole("button", { name: "Hide albums panel" })).toBeVisible();
  await page.setViewportSize({ width: 390, height: 844 });
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  expect(overflow).toBeLessThanOrEqual(1);
});

test("primary workspaces keep repeated tab headings visually compact", async ({ page }) => {
  const surfaces = [
    ["Sequence", ".workspace-heading > h2"],
    ["Track Review", ".review-track-rail > h2"],
    ["Album Decisions", ".decisions-heading > h2"],
    ["Mastering", ".mastering-heading > h2"],
    ["Assets", ".assets-heading > h2"],
    ["Audio Library", ".library-heading > h2"],
    ["Settings", ".settings-workspace > h2"],
  ];
  for (const [view, headingSelector] of surfaces) {
    await page.getByRole("button", { name: view, exact: true }).click();
    await expect(page.locator(headingSelector)).toHaveClass(/sr-only/);
  }
});

test("the header master meter opens Mastering without hijacking its view controls", async ({ page }) => {
  const navigation = page.getByRole("navigation", { name: "Project views" });
  const headerMeter = page.getByTestId("header-master-meter");
  const openMastering = headerMeter.getByRole("button", { name: "Open Mastering" });
  const spectrum = headerMeter.getByRole("button", { name: "Show frequency analyzer" });

  await expect(openMastering).toBeVisible();
  await spectrum.click();
  await expect(headerMeter).toHaveAttribute("data-meter-mode", "spectrum");
  await expect(navigation.getByRole("button", { name: "Sequence", exact: true })).toHaveAttribute("aria-current", "page");

  await openMastering.click();
  await expect(navigation.getByRole("button", { name: "Mastering", exact: true })).toHaveAttribute("aria-current", "page");
  await expect(page.getByRole("heading", { name: "Mastering" })).toBeAttached();
  await expect(page).toHaveTitle(/^Mastering \|/);

  await navigation.getByRole("button", { name: "Sequence", exact: true }).click();
  await openMastering.focus();
  await page.keyboard.press("Enter");
  await expect(navigation.getByRole("button", { name: "Mastering", exact: true })).toHaveAttribute("aria-current", "page");
});

test("Mastering keeps delivery compact and reveals secondary guidance on demand", async ({ page }) => {
  await page.getByRole("button", { name: "Mastering", exact: true }).click();
  const equipmentSelector = page.getByRole("region", { name: "Mastering equipment level" });
  await expect(equipmentSelector.getByText("Equipment", { exact: true })).toBeVisible();
  await expect(equipmentSelector.getByText("Mastering Equipment", { exact: true })).toHaveCount(0);
  await expect(equipmentSelector.getByText("Basic stays intact while Premium uses its own movable rack.", { exact: true })).toHaveCount(0);

  const deliveryControls = page.getByRole("group", { name: "Delivery and publication controls" });
  const deliverySelect = deliveryControls.getByLabel("Print requirements");
  const approvedMaster = deliveryControls.getByLabel("Approved master");
  const readyToPublish = deliveryControls.getByLabel("Ready to publish");
  const printButton = deliveryControls.getByRole("button", { name: "Print / Export Audio" });
  await expect(page.locator(".delivery-profile-panel")).toHaveCount(0);
  await expect(deliverySelect).toBeVisible();
  await expect(approvedMaster).toBeVisible();
  await expect(readyToPublish).toBeVisible();
  await expect(printButton).toBeVisible();
  const deliveryBox = await deliverySelect.boundingBox();
  const printBox = await printButton.boundingBox();
  expect(deliveryBox.x).toBeLessThan(printBox.x);

  const referencePanel = page.locator(".reference-ab-panel");
  await expect(referencePanel).not.toHaveAttribute("open", "");
  await expect(referencePanel.locator(".reference-ab-body")).toBeHidden();
  await referencePanel.locator("summary").focus();
  await page.keyboard.press("Enter");
  await expect(referencePanel).toHaveAttribute("open", "");
  await expect(referencePanel.getByLabel("Reference audio track")).toBeVisible();

  const masterBusHelp = page.getByRole("button", { name: "About Album Master Bus" });
  const masterBusTooltip = page.getByRole("tooltip");
  await expect(masterBusTooltip).toBeHidden();
  await masterBusHelp.focus();
  await expect(masterBusTooltip).toBeVisible();
  await expect(masterBusTooltip).toHaveText("Every preview and exported track passes through this shared chain.");
});

test("Premium mastering patches repeated equipment in the same saved order used by the audio path", async ({ page, request }) => {
  await page.getByRole("button", { name: "Mastering", exact: true }).click();
  await page.getByRole("button", { name: /PREMIUM Analog Rack/ }).click();

  const rack = page.getByRole("region", { name: "Advanced Mastering Rack" });
  const patchButtons = rack.locator(".premium-patch-bay li button");
  await expect(rack).toBeVisible();
  await expect(rack.locator(".premium-rack-unit")).toHaveCount(4);
  await expect(rack.getByText("Harbor Signal", { exact: true })).toHaveCount(1);
  await expect(rack.getByText("Northline Audio", { exact: true })).toHaveCount(1);
  await expect(rack.getByText("Resolute Works", { exact: true })).toHaveCount(1);
  await expect(rack.getByText("Ironvale Labs", { exact: true })).toHaveCount(1);
  await expect(rack.getByRole("meter", { name: /Gain reduction/ })).toHaveAttribute("aria-valuenow", "0.0");
  await expect(rack.locator(".premium-faceplate--eq")).toHaveCSS("background-image", /program-eq-faceplate-clean-v2\.png/);
  await expect(rack.locator(".premium-faceplate--compressor")).toHaveCSS("background-image", /bus-compressor-faceplate-photoreal-v3\.png/);
  await expect(rack.locator(".premium-faceplate--limiter")).toHaveCSS("background-image", /precision-limiter-faceplate-clean-v2\.png/);
  await expect(rack.locator(".premium-vu--mockup-dual")).toHaveCSS("background-image", "none");
  await expect.poll(() => rack.locator(".premium-vu--mockup-dual").evaluate((meter) => meter.style.getPropertyValue("--vu-needle-angle"))).toBe("14deg");
  await expect(rack.locator(".premium-meter-drawer")).not.toHaveAttribute("open", "");
  await expect(rack.locator(".premium-rack-unit").first()).not.toHaveAttribute("draggable", "true");
  await expect(rack.locator(".premium-rack-unit").first().locator(".premium-drag-handle")).toHaveAttribute("draggable", "true");
  const compressorThreshold = rack.getByRole("slider", { name: "Threshold graphical control", exact: true });
  const orderBeforeKnobMove = await patchButtons.allTextContents();
  await compressorThreshold.fill("-40");
  await expect(compressorThreshold).toHaveValue("-40");
  await expect(patchButtons).toHaveText(orderBeforeKnobMove);
  const lowFrequencyControl = rack.locator(".premium-mock-control--eq-low-frequency");
  const lowFrequency = rack.getByRole("slider", { name: "Low frequency graphical control", exact: true });
  await lowFrequency.focus();
  await expect(lowFrequencyControl.locator("output")).toHaveCSS("font-size", "18px");
  await lowFrequency.fill("0.75");
  const affectedFrequency = await lowFrequency.getAttribute("aria-valuenow");
  const affectedFrequencyText = await lowFrequency.getAttribute("aria-valuetext");
  expect(Number(affectedFrequency)).toBeGreaterThan(1);
  expect(affectedFrequencyText).toBe(`${Number(affectedFrequency).toFixed(0)} Hz`);
  await expect(lowFrequencyControl.locator("output")).toHaveText(affectedFrequencyText);
  const lowGainControl = rack.locator(".premium-mock-control--eq-low-gain");
  const lowGain = rack.getByRole("slider", { name: "Low boost / cut graphical control", exact: true });
  await lowGain.fill("0");
  await expect(lowGainControl).toHaveAttribute("data-knob-angle", "0");
  await lowFrequency.fill((Math.log(60 / 20) / Math.log(500 / 20)).toFixed(3));
  await expect(lowFrequencyControl).toHaveAttribute("data-knob-angle", "0");
  const compressorRatioControl = rack.locator(".premium-mock-control--comp-ratio");
  await rack.getByRole("slider", { name: "Ratio graphical control", exact: true }).fill((Math.log(4) / Math.log(20)).toFixed(3));
  await expect(compressorRatioControl).toHaveAttribute("data-knob-angle", "-45");
  const limiterStereoLinkControl = rack.locator(".premium-mock-control--limiter-stereo-link");
  await rack.getByRole("slider", { name: "Stereo link graphical control", exact: true }).fill("50");
  await expect(limiterStereoLinkControl).toHaveAttribute("data-knob-angle", "0");
  const eqInSwitch = rack.getByRole("checkbox", { name: "Program Equalizer IN switch", exact: true });
  const eqBypassSwitch = rack.getByRole("checkbox", { name: "Program Equalizer BYPASS switch", exact: true });
  const compressorInSwitch = rack.getByRole("checkbox", { name: "Bus Compressor IN switch", exact: true });
  const compressorBypassSwitch = rack.getByRole("checkbox", { name: "Bus Compressor BYPASS switch", exact: true });
  await expect(eqInSwitch).toBeChecked();
  await expect(eqBypassSwitch).not.toBeChecked();
  await expect(compressorInSwitch).toBeChecked();
  await expect(compressorBypassSwitch).not.toBeChecked();
  const compressorPower = rack.getByRole("button", { name: "Bus Compressor power", exact: true });
  await expect(compressorPower).toHaveAttribute("aria-pressed", "true");
  await compressorPower.click();
  await expect(compressorPower).toHaveAttribute("aria-pressed", "false");
  await expect(compressorBypassSwitch).toBeChecked();
  await compressorPower.click();
  await expect(compressorInSwitch).toBeChecked();
  const compressorSidechainSwitch = rack.getByRole("checkbox", { name: "Sidechain input switch", exact: true });
  await expect(compressorSidechainSwitch).not.toBeChecked();
  await compressorSidechainSwitch.click();
  await expect(compressorSidechainSwitch).toBeChecked();
  await rack.getByRole("slider", { name: "Sidechain filter graphical control", exact: true }).fill("0.7");
  await expect(rack.getByRole("checkbox", { name: "Master Output IN switch", exact: true })).toBeChecked();
  await expect(rack.getByRole("checkbox", { name: "Precision Limiter IN switch", exact: true })).toBeChecked();
  await expect(rack.getByRole("checkbox", { name: "Precision Limiter BYPASS switch", exact: true })).not.toBeChecked();
  await rack.getByRole("slider", { name: "Low-mid boost / cut graphical control", exact: true }).fill("2");
  await rack.getByRole("slider", { name: "High-mid boost / cut graphical control", exact: true }).fill("-1");
  await rack.getByRole("slider", { name: "EQ output graphical control", exact: true }).fill("1.5");
  await rack.getByRole("slider", { name: "Stereo link graphical control", exact: true }).fill("65");
  await expect(rack.getByRole("slider", { name: "Stereo link graphical control", exact: true })).toHaveAttribute("aria-valuetext", "65 %");
  const oversampling8x = rack.getByRole("button", { name: "8× oversampling", exact: true });
  await oversampling8x.click();
  await expect(oversampling8x).toHaveAttribute("aria-pressed", "true");
  await expect(rack.getByRole("meter", { name: /Limiter gain reduction/ })).toHaveAttribute("aria-valuenow", "0.0");
  await eqBypassSwitch.click();
  await expect(eqBypassSwitch).toBeChecked();
  await expect(eqInSwitch).not.toBeChecked();
  await expect(rack.locator(".premium-rack-unit").first()).toHaveAttribute("aria-label", /bypassed/);
  await eqInSwitch.click();
  await expect(eqInSwitch).toBeChecked();
  await expect(eqBypassSwitch).not.toBeChecked();
  await expect(patchButtons).toContainText(["01 · EQ", "02 · COMP", "03 · OUT", "04 · LIMIT"]);

  await rack.locator(".premium-rack-unit").first().locator(".premium-drag-handle").dragTo(rack.locator(".premium-rack-unit").nth(1));
  await expect(patchButtons).toContainText(["01 · COMP", "02 · EQ", "03 · OUT", "04 · LIMIT"]);
  await rack.getByRole("button", { name: "Move Program Equalizer up", exact: true }).click();
  await expect(patchButtons).toContainText(["01 · EQ", "02 · COMP", "03 · OUT", "04 · LIMIT"]);
  await rack.getByRole("button", { name: "Move Program Equalizer down", exact: true }).click();
  await expect(patchButtons).toContainText(["01 · COMP", "02 · EQ", "03 · OUT", "04 · LIMIT"]);
  await rack.getByRole("button", { name: "Duplicate Program Equalizer", exact: true }).click();
  await expect(rack.locator(".premium-rack-unit")).toHaveCount(5);
  await expect(rack.locator(".premium-rack-unit").getByText("Program Equalizer Copy", { exact: true })).toBeVisible();

  await compressorBypassSwitch.click();
  await expect(compressorBypassSwitch).toBeChecked();
  await expect(compressorInSwitch).not.toBeChecked();
  await expect(rack.getByRole("checkbox", { name: "Enable Bus Compressor", exact: true })).not.toBeChecked();
  await expect(rack.locator(".premium-rack-unit").first()).toHaveAttribute("aria-label", /bypassed/);
  await expect(compressorThreshold).toBeEnabled();
  await compressorThreshold.fill("-38");
  await expect(compressorThreshold).toHaveValue("-38");
  await rack.getByRole("slider", { name: "Output level graphical control", exact: true }).fill("-1.5");
  await rack.getByLabel("Equipment to add", { exact: true }).selectOption("sequencer.precision-limiter");
  const addToRack = rack.getByRole("button", { name: "Add to end of rack", exact: true });
  await expect(addToRack).toHaveAttribute("data-tooltip", "Add to end of rack");
  await expect(addToRack.locator(":scope > .icon")).toBeVisible();
  await expect(addToRack.locator(":scope > :not(.icon):not(.sr-only)")).toHaveCount(0);
  const addToRackBox = await addToRack.boundingBox();
  expect(addToRackBox.width).toBe(44);
  expect(addToRackBox.height).toBe(44);
  await addToRack.click();
  await expect(rack.locator(".premium-rack-unit")).toHaveCount(6);
  await expect(page.locator("[data-project-save-status]")).toContainText("Saved locally");

  const bootstrap = await (await request.get("/api/bootstrap")).json();
  const savedAlbum = bootstrap.state.albums[0];
  expect(savedAlbum.masteringPath).toBe("advanced");
  expect(savedAlbum.advancedMastering.nodes.map((node) => node.typeId)).toEqual([
    "sequencer.bus-compressor",
    "sequencer.program-eq",
    "sequencer.program-eq",
    "sequencer.master-output",
    "sequencer.precision-limiter",
    "sequencer.precision-limiter",
  ]);
  expect(savedAlbum.advancedMastering.nodes[0].bypass).toBe(true);
  expect(savedAlbum.advancedMastering.nodes[0].parameters.thresholdDb).toBe(-38);
  expect(savedAlbum.advancedMastering.nodes[0].parameters.sidechainEnabled).toBe(true);
  expect(savedAlbum.advancedMastering.nodes[0].parameters.sidechainFilterHz).toBeGreaterThan(180);
  expect(savedAlbum.advancedMastering.nodes[1].parameters.lowMidBand.gainDb).toBe(2);
  expect(savedAlbum.advancedMastering.nodes[1].parameters.highMidBand.gainDb).toBe(-1);
  expect(savedAlbum.advancedMastering.nodes[1].parameters.outputGainDb).toBe(1.5);
  expect(savedAlbum.advancedMastering.nodes[3].parameters.outputGainDb).toBe(-1.5);
  expect(savedAlbum.advancedMastering.nodes[4].parameters.oversample).toBe(8);
  expect(savedAlbum.advancedMastering.nodes[4].parameters.stereoLinkPercent).toBe(65);
  expect(savedAlbum.advancedMastering.connections).toEqual([
    { from: "input", to: savedAlbum.advancedMastering.nodes[0].id },
    ...savedAlbum.advancedMastering.nodes.slice(0, -1).map((node, index) => ({ from: node.id, to: savedAlbum.advancedMastering.nodes[index + 1].id })),
    { from: savedAlbum.advancedMastering.nodes.at(-1).id, to: "output" },
  ]);

  await page.reload();
  await page.getByRole("button", { name: "Mastering", exact: true }).click();
  await expect(page.getByRole("button", { name: /PREMIUM Analog Rack/ })).toHaveAttribute("aria-pressed", "true");
  await expect(page.locator(".premium-patch-bay li button")).toContainText(["01 · COMP", "02 · EQ", "03 · EQ", "04 · OUT", "05 · LIMIT", "06 · LIMIT"]);

  await page.setViewportSize({ width: 390, height: 844 });
  await expect(page.locator(".premium-patch-bay")).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(390);
});

test("long sequence lists scroll inside the workspace while controls stay visible", async ({ page, request }) => {
  const longProject = structuredClone(e2eProjectState);
  const album = longProject.albums[0];
  for (let index = 3; index <= 18; index += 1) {
    album.tracks.push({
      id: `scroll-track-${index}`,
      title: `Scroll Track ${index}`,
      decisionStatus: "undecided",
      masterCandidateId: "",
      auditionCandidateId: "",
      notes: "",
      visualAssets: [],
      candidates: [],
    });
  }
  album.baselineTrackOrder = album.tracks.map((track) => track.id);
  const response = await request.put("/api/state", { data: longProject, headers: { Origin: origin } });
  expect(response.ok()).toBeTruthy();
  await page.reload();

  const scrollRegion = page.locator(".sequence-scroll-region");
  const heading = page.locator(".workspace-heading");
  const tableHeading = page.locator(".sequence-table-head");
  const lastTrack = page.locator(".sequence-track").filter({ has: page.getByText("Scroll Track 18", { exact: true }) });
  const initialHeadingBox = await heading.boundingBox();
  const initialTableHeadingBox = await tableHeading.boundingBox();
  const scrollMetrics = await scrollRegion.evaluate((element) => ({
    clientHeight: element.clientHeight,
    scrollHeight: element.scrollHeight,
    overflowY: getComputedStyle(element).overflowY,
  }));

  expect(scrollMetrics.overflowY).toBe("auto");
  expect(scrollMetrics.scrollHeight).toBeGreaterThan(scrollMetrics.clientHeight);
  await scrollRegion.evaluate((element) => { element.scrollTop = element.scrollHeight; });
  await expect.poll(() => scrollRegion.evaluate((element) => element.scrollTop)).toBeGreaterThan(0);
  await expect(lastTrack).toBeVisible();
  const scrolledHeadingBox = await heading.boundingBox();
  const scrolledTableHeadingBox = await tableHeading.boundingBox();
  expect(Math.abs(scrolledHeadingBox.y - initialHeadingBox.y)).toBeLessThan(1);
  expect(Math.abs(scrolledTableHeadingBox.y - initialTableHeadingBox.y)).toBeLessThanOrEqual(1);
});

test("page title follows the active tab, album, track, and saved project", async ({ page }) => {
  await expect(page).toHaveTitle("Sequence | Fixture Album | Fixture Artist — Fixture Album");

  await page.getByRole("button", { name: "Mastering", exact: true }).click();
  await expect(page).toHaveTitle("Mastering | Fixture Album | Alpha Tone | Fixture Artist — Fixture Album");
  await page.getByRole("navigation", { name: "Fixture Album mastering tracks" }).getByRole("button", { name: /\[SIGNAL SOURCE WITHHELD\]/ }).click();
  await expect(page).toHaveTitle("Mastering | Fixture Album | [SIGNAL SOURCE WITHHELD] | Fixture Artist — Fixture Album");

  await page.getByRole("button", { name: "Settings", exact: true }).click();
  await expect(page).toHaveTitle("Settings | Fixture Album | Fixture Artist — Fixture Album");

  await page.getByRole("button", { name: "Add Album" }).click();
  await page.getByLabel("Album title").fill("Next Album");
  await page.getByRole("button", { name: "Add Album", exact: true }).last().click();
  await expect(page).toHaveTitle("Sequence | Next Album | Fixture Artist — Fixture Album");
});

test("number row and numeric keypad shortcuts switch primary views without hijacking editing or dialogs", async ({ page }) => {
  const navigation = page.getByRole("navigation", { name: "Project views" });
  const sequence = navigation.getByRole("button", { name: "Sequence", exact: true });
  const review = navigation.getByRole("button", { name: "Track Review", exact: true });
  const mastering = navigation.getByRole("button", { name: "Mastering", exact: true });
  const settings = navigation.getByRole("button", { name: "Settings", exact: true });

  await expect(sequence).toHaveAttribute("data-tooltip", "Sequence · 1");
  await expect(mastering).toHaveAttribute("data-tooltip", "Mastering · 2");
  await page.keyboard.press("2");
  await expect(mastering).toHaveAttribute("aria-current", "page");
  await page.keyboard.press("Numpad3");
  await expect(review).toHaveAttribute("aria-current", "page");
  await page.keyboard.press("Numpad7");
  await expect(settings).toHaveAttribute("aria-current", "page");

  const artistName = page.getByLabel("Artist name");
  await artistName.focus();
  await page.keyboard.press("Numpad1");
  await expect(artistName).toBeFocused();
  await expect(settings).toHaveAttribute("aria-current", "page");

  await page.getByRole("button", { name: "Add Album" }).click();
  const dialog = page.getByRole("dialog", { name: "Add Album" });
  await expect(dialog).toBeVisible();
  await page.keyboard.press("2");
  await expect(dialog).toBeVisible();
  await expect(mastering).not.toHaveAttribute("aria-current", "page");
});

test("quick display settings stay behind one far-right gear menu", async ({ page }) => {
  const header = page.locator(".app-header");
  const navigation = header.getByRole("navigation", { name: "Project views" });
  const settingsTrigger = header.getByRole("button", { name: "Open settings menu" });
  await expect(settingsTrigger).toBeVisible();
  await expect(header.getByRole("button", { name: "Decrease text size" })).toHaveCount(0);

  const navigationBox = await navigation.boundingBox();
  const statisticsBox = await header.locator(".header-summary-shell").boundingBox();
  const triggerBox = await settingsTrigger.boundingBox();
  expect(navigationBox.x).toBeLessThan(statisticsBox.x);
  expect(triggerBox.x).toBeGreaterThan(statisticsBox.x);

  await settingsTrigger.click();
  const menu = page.getByRole("dialog", { name: "Quick Settings" });
  await expect(menu).toBeVisible();
  await expect(menu.getByLabel("Text size 100%")).toHaveText("100%");
  await menu.getByRole("button", { name: "Increase text size" }).click();
  await expect(menu.getByLabel("Text size 110%")).toHaveText("110%");
  await expect.poll(() => page.evaluate(() => document.documentElement.style.getPropertyValue("--text-scale"))).toBe("1.1");
  await menu.getByRole("button", { name: "Use light mode" }).click();
  await expect.poll(() => page.evaluate(() => document.documentElement.dataset.mode)).toBe("light");

  await page.keyboard.press("Escape");
  await expect(menu).toBeHidden();
  await expect(settingsTrigger).toBeFocused();
  await page.setViewportSize({ width: 390, height: 844 });
  await settingsTrigger.click();
  const mobileMenu = page.getByRole("dialog", { name: "Quick Settings" });
  const mobileMenuBox = await mobileMenu.boundingBox();
  expect(mobileMenuBox.x).toBeGreaterThanOrEqual(0);
  expect(mobileMenuBox.x + mobileMenuBox.width).toBeLessThanOrEqual(390);
  expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)).toBeLessThanOrEqual(1);
  await mobileMenu.getByRole("button", { name: "Dismiss quick settings" }).click();
  await page.setViewportSize({ width: 1280, height: 720 });
  await settingsTrigger.click();
  await page.getByRole("dialog", { name: "Quick Settings" }).getByRole("button", { name: /Colors & fonts/ }).click();
  await expect(navigation.getByRole("button", { name: "Settings", exact: true })).toHaveAttribute("aria-current", "page");
  await expect(page.getByRole("heading", { name: "Screen Appearance" })).toBeVisible();
});

test("light and dark modes preserve readable surfaces and distinct interaction states across every workspace", async ({ page }) => {
  const viewNames = ["Sequence", "Mastering", "Track Review", "Album Decisions", "Assets", "Audio Library", "Settings"];
  const navigation = page.getByRole("navigation", { name: "Project views" });
  const settingsTrigger = page.getByRole("button", { name: "Open settings menu" });

  for (const mode of ["light", "dark"]) {
    await settingsTrigger.click();
    await page.getByRole("dialog", { name: "Quick Settings" }).getByRole("button", { name: `Use ${mode} mode` }).click();
    await expect.poll(() => page.evaluate(() => document.documentElement.dataset.mode)).toBe(mode);
    await page.keyboard.press("Escape");

    const palette = await page.evaluate(() => {
      const style = getComputedStyle(document.documentElement);
      return Object.fromEntries(["--ink", "--bone", "--bone-muted", "--lime", "--focus"].map((token) => [token, style.getPropertyValue(token).trim()]));
    });
    expect(contrastRatio(palette["--bone"], palette["--ink"])).toBeGreaterThanOrEqual(7);
    expect(contrastRatio(palette["--bone-muted"], palette["--ink"])).toBeGreaterThanOrEqual(4.5);
    expect(contrastRatio(palette["--lime"], palette["--ink"])).toBeGreaterThanOrEqual(4.5);
    expect(contrastRatio(palette["--focus"], palette["--ink"])).toBeGreaterThanOrEqual(4.5);

    for (const viewName of viewNames) {
      await navigation.getByRole("button", { name: viewName, exact: true }).click();
      await expect(page.locator(".content-shell main").first()).toBeVisible();
      expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)).toBeLessThanOrEqual(1);
    }

    await navigation.getByRole("button", { name: "Mastering", exact: true }).click();
    const masteringTier = page.locator(".mastering-tier-selector");
    await expect(masteringTier).toBeVisible();
    await page.getByRole("button", { name: /PREMIUM Analog Rack/ }).click();
    const tierSurfaces = await masteringTier.evaluate((element) => ({
      shell: getComputedStyle(element).backgroundColor,
      control: getComputedStyle(element.querySelector("button")).backgroundColor,
    }));
    expect(tierSurfaces.shell).not.toBe("rgb(9, 10, 9)");
    expect(tierSurfaces.control).not.toBe("rgb(17, 18, 16)");

    const premiumRack = page.locator(".premium-mastering-rack");
    await expect(premiumRack).toBeVisible();
    const rackBackground = await premiumRack.evaluate((element) => getComputedStyle(element).backgroundColor);
    expect(parseCssColor(rackBackground).reduce((sum, channel) => sum + channel, 0)).toBeLessThan(150);

    const activeTier = masteringTier.locator("button.is-active");
    await expect(activeTier).toHaveAttribute("aria-pressed", "true");
    await activeTier.focus();
    const focusState = await activeTier.evaluate((element) => {
      const style = getComputedStyle(element);
      return { outlineStyle: style.outlineStyle, outlineWidth: style.outlineWidth };
    });
    expect(focusState.outlineStyle).not.toBe("none");
    expect(Number.parseFloat(focusState.outlineWidth)).toBeGreaterThanOrEqual(1);

    const disabledButton = page.locator(".command-history button:disabled").first();
    await expect(disabledButton).toBeVisible();
    expect(Number(await disabledButton.evaluate((element) => getComputedStyle(element).opacity))).toBeLessThanOrEqual(0.42);
  }

  await navigation.getByRole("button", { name: "Sequence", exact: true }).click();
  const sequenceNav = navigation.getByRole("button", { name: "Sequence", exact: true });
  await sequenceNav.hover();
  const hoverBackground = await sequenceNav.evaluate((element) => getComputedStyle(element).backgroundColor);
  const box = await sequenceNav.boundingBox();
  await page.mouse.move(box.x + (box.width / 2), box.y + (box.height / 2));
  await page.mouse.down();
  const pressedBackground = await sequenceNav.evaluate((element) => getComputedStyle(element).backgroundColor);
  await page.mouse.up();
  expect(pressedBackground).not.toBe(hoverBackground);

  await page.setViewportSize({ width: 390, height: 844 });
  for (const mode of ["light", "dark"]) {
    await settingsTrigger.click();
    await page.getByRole("dialog", { name: "Quick Settings" }).getByRole("button", { name: `Use ${mode} mode` }).click();
    await page.keyboard.press("Escape");
    await navigation.getByRole("button", { name: "Mastering", exact: true }).click();
    await expect(page.locator(".premium-mastering-rack")).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)).toBeLessThanOrEqual(1);
  }
});

test("reordering persists and master selection stays separate from the audition source", async ({ page, request }) => {
  const titles = page.locator(".sequence-track .track-title strong");
  await expect(titles).toHaveText(["Alpha Tone", "[SIGNAL SOURCE WITHHELD]"]);
  await page.getByRole("button", { name: "Move Alpha Tone down" }).click();
  await expect(page.locator("[data-project-save-status]")).toContainText("Saved locally");
  await page.reload();
  await expect(titles).toHaveText(["[SIGNAL SOURCE WITHHELD]", "Alpha Tone"]);

  await page.getByRole("button", { name: "Track Review" }).click();
  await page.getByRole("button", { name: /Alpha Tone/ }).click();
  await page.getByRole("radio", { name: "Alternate Mix", exact: true }).check();
  await expect(page.locator("[data-project-save-status]")).toContainText("Saved locally");

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
  await expect(page.getByRole("table", { name: "Fixture Album track order" })).toBeVisible();
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
  await expect(page.locator("[data-project-save-status]")).toContainText("Saved locally");

  const bootstrap = await (await request.get("/api/bootstrap")).json();
  expect(bootstrap.state.settings.project).toEqual({ artistName: "Open Orbit Ensemble", setupComplete: true });
  expect(bootstrap.state.albums.every((album) => album.artist === "Open Orbit Ensemble")).toBeTruthy();
});

test("saved projects can be loaded and safely removed while album deletion remains non-destructive", async ({ page, request }) => {
  await page.getByRole("button", { name: "New Project", exact: true }).click();
  const fresh = page.getByRole("dialog", { name: "Start a Fresh Project" });
  await fresh.getByLabel("Project name").fill("Fresh Project QA");
  await fresh.getByLabel("Artist name").fill("Fresh Artist");
  await fresh.getByLabel("First album title").fill("Clean Slate");
  await fresh.getByLabel("Album era").selectOption("current");
  await fresh.getByRole("button", { name: "Start Fresh Project" }).click();

  await expect(page.getByRole("button", { name: "Open album Clean Slate" })).toHaveAttribute("aria-current", "true");
  await expect(page.getByText("This album is ready for its first track.")).toBeVisible();
  await expect(page.locator("[data-project-save-status]")).toContainText("New project created");

  await page.getByRole("button", { name: "Open saved projects for Fresh Project QA" }).click();
  const saved = page.getByRole("dialog", { name: "Saved Projects" });
  const oldProject = saved.locator(".saved-project-list li").filter({ hasText: "Fixture Artist — Fixture Album" });
  await expect(oldProject).toContainText("1 album");
  await oldProject.getByRole("button", { name: "Load Project" }).click();
  await expect(page.getByRole("table", { name: "Fixture Album track order" })).toBeVisible();
  await expect(page.getByText("Alpha Tone", { exact: true }).first()).toBeVisible();

  await page.getByRole("button", { name: "Open saved projects for Fixture Artist — Fixture Album" }).click();
  const reopenedSaved = page.getByRole("dialog", { name: "Saved Projects" });
  const freshProject = reopenedSaved.locator(".saved-project-list li").filter({ hasText: "Fresh Project QA" });
  await freshProject.getByRole("button", { name: "Remove project Fresh Project QA" }).click();
  const removeProjectDialog = page.getByRole("dialog", { name: "Remove Project" });
  await expect(removeProjectDialog).toContainText("Indexed audio, source folders, artwork, lyric files, and rendered exports stay exactly where they are");
  await removeProjectDialog.getByRole("button", { name: "Remove Project" }).click();
  await expect(page.getByRole("dialog", { name: "Saved Projects" })).toBeVisible();
  await expect(page.getByText("Fresh Project QA", { exact: true })).toHaveCount(0);
  await expect(page.getByRole("button", { name: /Remove project Fixture Artist.*Fixture Album/ })).toBeDisabled();
  expect((await (await request.get("/api/bootstrap")).json()).projects).toHaveLength(1);
  await page.getByRole("button", { name: "Close", exact: true }).click();
  await expect(page.locator("[data-project-save-status]")).toContainText(/source assets were not changed/i);

  await page.getByRole("button", { name: "Add Album" }).click();
  await page.getByLabel("Album title").fill("Delete Me");
  await page.getByRole("button", { name: "Add Album", exact: true }).last().click();
  await page.getByRole("button", { name: "Show albums panel" }).click();
  await page.getByRole("button", { name: "Delete Delete Me" }).click();
  const deleteDialog = page.getByRole("dialog", { name: "Delete Album" });
  await expect(deleteDialog).toContainText("Indexed audio, artwork, lyric files, and rendered exports stay exactly where they are");
  await deleteDialog.getByRole("button", { name: "Delete Album" }).click();
  await expect(page.getByRole("table", { name: "Fixture Album track order" })).toBeVisible();
  await expect(page.getByText("Delete Me", { exact: true })).toHaveCount(0);
  await expect(page.locator("[data-project-save-status]")).toContainText("Saved locally");
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

test("phone layout removes redundant counters and keeps sequence controls separated", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });

  const header = page.locator(".app-header");
  const albumRail = page.locator(".album-rail.is-collapsed");
  await expect(page.locator(".header-summary-shell")).toBeHidden();
  expect((await header.boundingBox()).height).toBeLessThanOrEqual(104);
  expect((await albumRail.boundingBox()).height).toBeLessThanOrEqual(52);
  await expect(albumRail.locator(".compact-album-button:visible")).toHaveCount(1);
  await expect(albumRail.locator(".compact-rail-actions")).toBeHidden();

  const activeNav = page.getByRole("navigation", { name: "Project views" }).getByRole("button", { name: "Sequence", exact: true });
  expect(await activeNav.evaluate((element) => getComputedStyle(element, "::after").display)).toBe("none");

  const firstTrack = page.locator(".sequence-track").first();
  const statusBox = await firstTrack.locator(".track-status").boundingBox();
  const playBox = await firstTrack.locator(".sequence-play-button").boundingBox();
  expect(statusBox.x + statusBox.width).toBeLessThanOrEqual(playBox.x);
  for (const moveButton of await firstTrack.locator(".track-move button").all()) {
    const box = await moveButton.boundingBox();
    expect(box.width).toBeGreaterThanOrEqual(36);
    expect(box.height).toBeGreaterThanOrEqual(36);
  }
  await expect(page.locator(".status-strip")).toHaveCount(0);
  await expect(page.locator(".transport-copy > :not(.sr-only)")).toHaveCount(1);
  await expect(page.locator(".transport-copy strong")).toBeVisible();
  const saveStatusAnnouncer = page.locator("[data-project-save-status]");
  await expect(saveStatusAnnouncer).toHaveClass("sr-only");
  const saveStatusBox = await saveStatusAnnouncer.boundingBox();
  expect(saveStatusBox.width).toBeLessThanOrEqual(1);
  expect(saveStatusBox.height).toBeLessThanOrEqual(1);
  const transportBox = await page.locator(".transport-bar").boundingBox();
  expect(Math.round(transportBox.y + transportBox.height)).toBe(844);
  expect(transportBox.height).toBeLessThanOrEqual(86);
  const transportWaveformBox = await page.locator(".transport-waveform").boundingBox();
  const transportPlaybackBox = await page.locator(".transport-playback-toggle").boundingBox();
  const transportActionBox = await page.locator(".transport-actions .transport-button").first().boundingBox();
  expect(Math.abs(transportWaveformBox.y - transportPlaybackBox.y)).toBeLessThanOrEqual(1);
  expect(Math.abs(transportWaveformBox.y - transportActionBox.y)).toBeLessThanOrEqual(1);

  await page.getByRole("button", { name: "Mastering", exact: true }).click();
  await expect(page.locator(".mastering-heading dl")).toBeHidden();
  await expect(page.locator(".master-signal-flow")).toBeHidden();
  await expect(page.locator(".mastering-track-list > header small")).toBeHidden();
  const waveformFadeHandles = page.locator(".waveform-fade-handle");
  await expect(waveformFadeHandles).toHaveCount(2);
  for (const fadeHandle of await waveformFadeHandles.all()) {
    await fadeHandle.scrollIntoViewIfNeeded();
    const fadeHandleBox = await fadeHandle.boundingBox();
    expect(fadeHandleBox.width).toBeGreaterThanOrEqual(30);
    expect(fadeHandleBox.height).toBeGreaterThanOrEqual(30);
  }
  expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)).toBeLessThanOrEqual(1);

  await page.getByRole("button", { name: "Assets", exact: true }).click();
  await expect(page.locator(".assets-heading dl")).toBeHidden();

  await page.getByRole("button", { name: "Audio Library", exact: true }).click();
  await expect(page.locator(".library-heading p")).toBeHidden();
  await expect(page.locator(".saved-filter-bar form")).toBeHidden();
  await expect(page.locator(".scan-summary")).toBeHidden();
  expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)).toBeLessThanOrEqual(1);
});

test("audio rows drag onto albums as new tracks or matching-title candidates", async ({ page, request }) => {
  await page.getByRole("button", { name: "Add Album" }).click();
  const albumDialog = page.getByRole("dialog", { name: "Add Album" });
  await albumDialog.getByLabel("Album title").fill("Drop Target");
  await albumDialog.getByRole("button", { name: "Add Album" }).click();

  await page.getByRole("button", { name: "Add First Tracks" }).click();
  const tracksDialog = page.getByRole("dialog", { name: "Add Tracks" });
  await tracksDialog.getByLabel("Blank track title").fill("Loose Sketch");
  await tracksDialog.getByRole("button", { name: "Add Blank" }).click();

  await page.getByRole("button", { name: "Audio Library" }).click();
  const dropTarget = page.locator('[data-drop-album-id="drop-target"]');
  const looseSketch = page.locator(".audio-row").filter({ hasText: "Loose Sketch.mp3" });
  await looseSketch.dragTo(dropTarget);
  await expect(page.locator("[data-project-save-status]")).toContainText("Saved locally");

  let bootstrap = await (await request.get("/api/bootstrap")).json();
  let targetAlbum = bootstrap.state.albums.find((album) => album.id === "drop-target");
  let matchingTrack = targetAlbum.tracks.find((track) => track.id === "loose-sketch");
  expect(matchingTrack.candidates).toHaveLength(1);
  expect(matchingTrack.decisionStatus).toBe("undecided");
  expect(matchingTrack.candidates[0].sourceRef.relativePath).toBe("Loose Sketch.mp3");

  await expect(page.locator(".album-rail")).toHaveClass(/is-collapsed/);
  const alphaTone = page.locator(".audio-row").filter({ hasText: "Alpha Tone.wav" });
  await alphaTone.dragTo(dropTarget);
  await expect(page.locator("[data-project-save-status]")).toContainText("Saved locally");

  bootstrap = await (await request.get("/api/bootstrap")).json();
  targetAlbum = bootstrap.state.albums.find((album) => album.id === "drop-target");
  matchingTrack = targetAlbum.tracks.find((track) => track.title === "Alpha Tone");
  expect(matchingTrack).toBeTruthy();
  expect(matchingTrack.candidates[0].sourceRef.relativePath).toBe("Alpha Tone.wav");
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

test("space exclusively owns transport playback and returns focus there from every control type", async ({ page }) => {
  const transportToggle = page.locator(".transport-playback-toggle");
  await transportToggle.click();
  await expect(transportToggle).toHaveAttribute("aria-label", "Pause playback");
  await expect(transportToggle).toHaveAttribute("aria-keyshortcuts", "Space");
  const headerMeter = page.getByTestId("header-master-meter");
  await expect(headerMeter).toHaveAttribute("data-meter-active", "true");
  await expect(headerMeter).toHaveAttribute("data-meter-routing", "mastering");
  await expect(headerMeter).toHaveAttribute("aria-label", /Mastering enabled/);
  await expect.poll(() => headerMeter.evaluate((element) => getComputedStyle(element).borderColor)).toBe("rgb(168, 201, 47)");
  await expect.poll(async () => Number(await headerMeter.locator('[data-meter-channel="left"]').getAttribute("data-meter-rms")), { timeout: 2_000 }).toBeGreaterThan(-60);

  await page.keyboard.press("Space");
  await expect(transportToggle).toHaveAttribute("aria-label", "Resume playback");
  await expect(transportToggle).toBeFocused();
  await expect(page.locator("[data-transport-status]")).toHaveText("Playback paused. Press Space to resume.");
  await page.keyboard.press("Space");
  await expect(transportToggle).toHaveAttribute("aria-label", "Pause playback");
  await expect(transportToggle).toBeFocused();
  await expect(page.locator("[data-transport-status]")).toHaveText("Playback resumed. Press Space to pause.");

  await page.keyboard.press("Space");
  await expect(transportToggle).toHaveAttribute("aria-label", "Resume playback");
  await page.getByRole("button", { name: "Audio Library", exact: true }).click();
  const search = page.getByPlaceholder("Search files");
  await search.fill("alpha tone");
  await search.focus();
  await expect(search).toHaveValue("alpha tone");
  await page.keyboard.press("Space");
  await expect(transportToggle).toHaveAttribute("aria-label", "Pause playback");
  await expect(search).toHaveValue("alpha tone");
  await expect(transportToggle).toBeFocused();

  const formatFilter = page.getByRole("combobox", { name: "Filter by format" });
  await formatFilter.focus();
  const formatBeforeSpace = await formatFilter.inputValue();
  await page.keyboard.press("Space");
  await expect(transportToggle).toHaveAttribute("aria-label", "Resume playback");
  await expect(formatFilter).toHaveValue(formatBeforeSpace);
  await expect(transportToggle).toBeFocused();

  await page.getByRole("button", { name: "Mastering", exact: true }).click();
  const approvedMaster = page.getByLabel("Approved master");
  const approvalBeforeSpace = await approvedMaster.isChecked();
  await approvedMaster.focus();
  await page.keyboard.press("Space");
  await expect(transportToggle).toHaveAttribute("aria-label", "Pause playback");
  expect(await approvedMaster.isChecked()).toBe(approvalBeforeSpace);
  await expect(transportToggle).toBeFocused();

  const printButton = page.getByRole("button", { name: "Print / Export Audio" });
  await printButton.focus();
  await page.keyboard.press("Space");
  await expect(transportToggle).toHaveAttribute("aria-label", "Resume playback");
  await expect(page.getByRole("dialog", { name: "Print / Export Audio" })).toHaveCount(0);
  await expect(transportToggle).toBeFocused();

  await page.getByRole("button", { name: /PREMIUM Analog Rack/ }).click();
  const threshold = page.getByRole("slider", { name: "Threshold graphical control", exact: true });
  const thresholdBeforeSpace = await threshold.inputValue();
  await threshold.focus();
  await page.keyboard.press("Space");
  await expect(transportToggle).toHaveAttribute("aria-label", "Pause playback");
  await expect(threshold).toHaveValue(thresholdBeforeSpace);
  await expect(transportToggle).toBeFocused();

  await page.getByRole("button", { name: "Add Album", exact: true }).click();
  const addAlbumDialog = page.getByRole("dialog", { name: "Add Album" });
  const albumTitle = addAlbumDialog.getByLabel("Album title");
  await albumTitle.fill("Space remains transport");
  await albumTitle.focus();
  await page.keyboard.press("Space");
  await expect(transportToggle).toHaveAttribute("aria-label", "Resume playback");
  await expect(albumTitle).toHaveValue("Space remains transport");
  await expect(addAlbumDialog).toBeVisible();
  await expect(transportToggle).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(addAlbumDialog).toBeHidden();
});

test("the sequence row follows the main player track and playback state", async ({ page }) => {
  const alphaRow = page.locator(".sequence-track").filter({ hasText: "Alpha Tone" });
  const protectedRow = page.locator(".sequence-track").filter({ hasText: "[SIGNAL SOURCE WITHHELD]" });
  const transportTitle = page.locator(".transport-copy strong");
  const transportBar = page.locator(".transport-bar");

  await alphaRow.locator(".track-title").click();
  await expect(transportBar).toHaveAttribute("aria-keyshortcuts", "ArrowUp ArrowDown");
  await expect(alphaRow).toHaveClass(/is-current/);
  await expect(alphaRow).toHaveClass(/is-playing/);
  await expect(alphaRow).toHaveAttribute("aria-label", /Playing.*pause/);
  await expect(alphaRow.getByRole("button", { name: "Pause Alpha Tone" })).toHaveAttribute("aria-pressed", "true");
  await expect(page.locator(".transport-playback-toggle")).toHaveAttribute("aria-label", "Pause playback");

  await page.keyboard.press("ArrowDown");
  await expect(transportTitle).toHaveText("[SIGNAL SOURCE WITHHELD]");
  await expect(protectedRow).toHaveClass(/is-current/);
  await expect(protectedRow).toHaveClass(/is-playing/);
  await page.keyboard.press("ArrowUp");
  await expect(transportTitle).toHaveText("Alpha Tone");
  await expect(alphaRow).toHaveClass(/is-current/);
  await expect(alphaRow).toHaveClass(/is-playing/);

  await alphaRow.locator(".track-status").click();
  await expect(alphaRow).not.toHaveClass(/is-playing/);
  await expect(alphaRow).toHaveAttribute("aria-label", /Paused.*resume/);
  await expect(alphaRow.getByRole("button", { name: "Resume Alpha Tone" })).toHaveAttribute("aria-pressed", "false");
  await expect(page.locator(".transport-playback-toggle")).toHaveAttribute("aria-label", "Resume playback");

  await page.keyboard.press("ArrowDown");
  await expect(transportTitle).toHaveText("[SIGNAL SOURCE WITHHELD]");
  await expect(protectedRow).toHaveClass(/is-current/);
  await expect(protectedRow).not.toHaveClass(/is-playing/);
  await expect(page.locator(".transport-playback-toggle")).toHaveAttribute("aria-label", "Resume playback");
  await page.keyboard.press("ArrowUp");
  await expect(transportTitle).toHaveText("Alpha Tone");
  await expect(alphaRow).toHaveClass(/is-current/);
  await expect(alphaRow).not.toHaveClass(/is-playing/);

  const auditionSource = alphaRow.getByLabel("Audition source for Alpha Tone");
  await auditionSource.focus();
  await page.keyboard.press("ArrowDown");
  await expect(auditionSource).toBeFocused();
  await expect(transportTitle).toHaveText("Alpha Tone");

  await page.getByRole("button", { name: "Add Album", exact: true }).click();
  const addAlbumDialog = page.getByRole("dialog", { name: "Add Album" });
  await addAlbumDialog.getByRole("button", { name: "Cancel" }).focus();
  await page.keyboard.press("ArrowDown");
  await expect(addAlbumDialog).toBeVisible();
  await expect(transportTitle).toHaveText("Alpha Tone");
  await page.keyboard.press("Escape");

  await alphaRow.focus();
  await page.keyboard.press("Enter");
  await expect(alphaRow).toHaveClass(/is-playing/);
  await expect(alphaRow.getByRole("button", { name: "Pause Alpha Tone" })).toHaveAttribute("aria-pressed", "true");

  await alphaRow.focus();
  await page.keyboard.press("Space");
  await expect(alphaRow).not.toHaveClass(/is-playing/);
  await expect(page.locator(".transport-playback-toggle")).toHaveAttribute("aria-label", "Resume playback");

  await alphaRow.getByLabel("Audition source for Alpha Tone").selectOption("alpha-b");
  await expect(page.locator(".transport-playback-toggle")).toHaveAttribute("aria-label", "Resume playback");
  await alphaRow.getByRole("button", { name: "Remove Alpha Tone from sequence" }).click();
  await expect(alphaRow).toHaveClass(/is-removal-armed/);
  await expect(page.locator(".transport-playback-toggle")).toHaveAttribute("aria-label", "Resume playback");

  await alphaRow.locator(".sequence-play-button").click();
  await expect(alphaRow).toHaveClass(/is-playing/);
});

test("mastering follows shared playback, seeks from its waveform, and reveals transition details at the markers", async ({ page }) => {
  await page.getByRole("button", { name: "Mastering", exact: true }).click();

  const trackList = page.getByRole("navigation", { name: "Fixture Album mastering tracks" });
  const alphaTrack = trackList.getByRole("button", { name: /Alpha Tone/ });
  const waveform = page.getByRole("group", { name: /Waveform for Alpha Tone/ });
  const transitionDetail = page.locator(".transport-transition");
  const startFadeHandle = page.getByRole("slider", { name: "Opening fade handle" });
  const endFadeHandle = page.getByRole("slider", { name: "Ending fade handle" });

  await expect(startFadeHandle).toHaveAttribute("aria-valuenow", "0");
  await expect(endFadeHandle).toHaveAttribute("aria-valuenow", "0");
  const startTrimBefore = await page.getByRole("spinbutton", { name: "Start at seconds" }).inputValue();
  const endTrimBefore = await page.getByRole("spinbutton", { name: "End at seconds" }).inputValue();
  await startFadeHandle.scrollIntoViewIfNeeded();
  const waveformBoxForFade = await waveform.boundingBox();
  const startFadeBox = await startFadeHandle.boundingBox();
  await page.mouse.move(startFadeBox.x + 5, startFadeBox.y + 5);
  await page.mouse.down();
  await page.mouse.move(waveformBoxForFade.x + waveformBoxForFade.width * 0.2, startFadeBox.y + 5, { steps: 4 });
  await page.mouse.up();
  await expect.poll(() => page.getByRole("spinbutton", { name: "Fade in seconds" }).inputValue()).toMatch(/^0\.[12]/);

  const endFadeBox = await endFadeHandle.boundingBox();
  await page.mouse.move(endFadeBox.x + endFadeBox.width - 5, endFadeBox.y + 5);
  await page.mouse.down();
  await page.mouse.move(waveformBoxForFade.x + waveformBoxForFade.width * 0.75, endFadeBox.y + 5, { steps: 4 });
  await page.mouse.up();
  await expect(page.getByRole("radio", { name: /Fade Out/ })).toBeChecked();
  await expect.poll(() => page.getByRole("spinbutton", { name: "Ending fade length seconds" }).inputValue()).toMatch(/^0\.[23]/);
  await expect(page.getByRole("spinbutton", { name: "Start at seconds" })).toHaveValue(startTrimBefore);
  await expect(page.getByRole("spinbutton", { name: "End at seconds" })).toHaveValue(endTrimBefore);

  await endFadeHandle.focus();
  await page.keyboard.press("Home");
  await expect(page.getByRole("radio", { name: "Natural" })).toBeChecked();
  await expect(endFadeHandle).toHaveAttribute("aria-valuenow", "0");
  await page.keyboard.press("ArrowRight");
  await expect(page.getByRole("radio", { name: /Fade Out/ })).toBeChecked();
  await expect(page.getByRole("spinbutton", { name: "Ending fade length seconds" })).toHaveValue("0.10");

  await startFadeHandle.focus();
  await page.keyboard.press("Home");
  await expect(page.getByRole("spinbutton", { name: "Fade in seconds" })).toHaveValue("0.00");
  await page.keyboard.press("ArrowRight");
  await expect(page.getByRole("spinbutton", { name: "Fade in seconds" })).toHaveValue("0.10");

  await expect(transitionDetail).toBeHidden();
  await page.locator(".transport-trim-line--start i").hover();
  await expect(transitionDetail).toBeVisible();
  await page.locator(".mastering-editor > header").hover();
  await expect(transitionDetail).toBeHidden();

  const waveformBox = await waveform.boundingBox();
  await waveform.click({ position: { x: waveformBox.width * 0.6, y: waveformBox.height * 0.5 } });
  await expect(alphaTrack).toHaveClass(/is-playing/);
  await expect(alphaTrack).toHaveAttribute("aria-label", /Playing.*pause/);
  await expect(page.locator(".transport-copy strong")).toHaveText("Alpha Tone");
  await expect.poll(() => page.locator(".transport-audio-source").evaluate((audio) => audio.currentTime)).toBeGreaterThan(0.5);
  await expect(page.locator(".waveform-playhead")).toBeVisible();

  await alphaTrack.click();
  await expect(alphaTrack).not.toHaveClass(/is-playing/);
  await expect(alphaTrack).toHaveAttribute("aria-label", /Paused.*resume/);
  await expect(page.locator(".transport-playback-toggle")).toHaveAttribute("aria-label", "Resume playback");

  await page.getByRole("button", { name: "Sequence", exact: true }).click();
  const protectedRow = page.locator(".sequence-track").filter({ hasText: "[SIGNAL SOURCE WITHHELD]" });
  await protectedRow.locator(".track-title").click();
  await expect(protectedRow).toHaveClass(/is-playing/);
  await protectedRow.locator(".track-status").click();
  await expect(protectedRow).not.toHaveClass(/is-playing/);

  await page.getByRole("button", { name: "Mastering", exact: true }).click();
  const protectedTrack = trackList.getByRole("button", { name: /SIGNAL SOURCE WITHHELD/ });
  await expect(protectedTrack).toHaveClass(/is-active/);
  await expect(protectedTrack).toHaveAttribute("aria-label", /Paused.*resume/);
  await expect(page.locator(".mastering-editor > header h2")).toHaveText("[SIGNAL SOURCE WITHHELD]");
});

test("album decisions persist versions, transition notes, explicit approval, and safe templates", async ({ page, request }) => {
  await page.getByRole("button", { name: "Album Decisions" }).click();
  const primaryDecisionGrid = page.locator(".decision-primary-grid");
  await expect(primaryDecisionGrid).toBeVisible();
  await expect.poll(async () => page.evaluate(() => getComputedStyle(document.querySelector(".decision-primary-grid")).gridTemplateColumns.split(" ").length)).toBe(2);
  const wideSequenceBox = await page.locator(".sequence-versions").boundingBox();
  const wideTransitionBox = await page.locator(".transition-notebook").boundingBox();
  const releaseDatePanel = page.locator(".sequence-versions > .album-release-date");
  const releaseDatePanelBox = await releaseDatePanel.boundingBox();
  expect(Math.abs(wideSequenceBox.y - wideTransitionBox.y)).toBeLessThan(2);
  expect(wideTransitionBox.x).toBeGreaterThan(wideSequenceBox.x + wideSequenceBox.width);
  expect(releaseDatePanelBox.y).toBeGreaterThan(wideSequenceBox.y);
  expect(releaseDatePanelBox.y + releaseDatePanelBox.height).toBeLessThanOrEqual(wideSequenceBox.y + wideSequenceBox.height);
  const readinessRows = page.locator(".readiness-row");
  const firstWideReadinessBox = await readinessRows.nth(0).boundingBox();
  const secondWideReadinessBox = await readinessRows.nth(1).boundingBox();
  expect(Math.abs(firstWideReadinessBox.y - secondWideReadinessBox.y)).toBeLessThan(2);
  expect(secondWideReadinessBox.x).toBeGreaterThan(firstWideReadinessBox.x + firstWideReadinessBox.width);
  const wideComparisonBox = await page.locator(".comparison-queue").boundingBox();
  const wideTemplatesBox = await page.locator(".album-templates").boundingBox();
  expect(Math.abs(wideComparisonBox.y - wideTemplatesBox.y)).toBeLessThan(2);
  expect(wideTemplatesBox.x).toBeGreaterThan(wideComparisonBox.x + wideComparisonBox.width);

  await page.setViewportSize({ width: 900, height: 800 });
  await expect.poll(async () => primaryDecisionGrid.evaluate((element) => getComputedStyle(element).gridTemplateColumns.split(" ").length)).toBe(1);
  await page.waitForTimeout(200);
  const stackedSequenceBox = await page.locator(".sequence-versions").boundingBox();
  const stackedTransitionBox = await page.locator(".transition-notebook").boundingBox();
  expect(Math.abs(stackedSequenceBox.x - stackedTransitionBox.x)).toBeLessThan(2);
  expect(stackedTransitionBox.y).toBeGreaterThan(stackedSequenceBox.y + stackedSequenceBox.height);
  await expect(page.locator(".readiness-head")).toBeVisible();
  const firstStackedReadinessBox = await readinessRows.nth(0).boundingBox();
  const secondStackedReadinessBox = await readinessRows.nth(1).boundingBox();
  expect(secondStackedReadinessBox.y).toBeGreaterThanOrEqual(firstStackedReadinessBox.y + firstStackedReadinessBox.height);
  await page.setViewportSize({ width: 1280, height: 720 });

  const releaseDate = page.getByLabel("Release date (optional)");
  await expect(releaseDate).toHaveValue("");
  await expect(page.locator("#album-release-date-status")).toContainText("No release date set");
  await releaseDate.fill("2027-04-23");
  await expect(page.locator("#album-release-date-status")).toContainText("Planned for Apr 23, 2027");
  await page.getByRole("button", { name: "Clear release date" }).click();
  await expect(releaseDate).toHaveValue("");
  await releaseDate.fill("2027-04-23");
  await expect(page.locator("[data-project-save-status]")).toContainText("Saved locally");
  let bootstrap = await (await request.get("/api/bootstrap")).json();
  let datedAlbum = bootstrap.state.albums.find((album) => album.id === "fixture-album");
  expect(datedAlbum.releaseDate).toBe("2027-04-23");
  expect(datedAlbum.orderApproved).toBe(false);
  expect(datedAlbum.tracks.some((track) => track.humanApproved)).toBe(false);
  await page.reload();
  await page.getByRole("button", { name: "Album Decisions" }).click();
  await expect(page.getByLabel("Release date (optional)")).toHaveValue("2027-04-23");

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
  await expect(page.getByRole("button", { name: "Open album Next Fixture" })).toHaveAttribute("aria-current", "true");
  await expect(page.locator(".decisions-heading > h2")).toHaveText("Album Decisions");
  await expect(page.locator("[data-project-save-status]")).toContainText("Saved locally");

  bootstrap = await (await request.get("/api/bootstrap")).json();
  const original = bootstrap.state.albums.find((album) => album.id === "fixture-album");
  const copy = bootstrap.state.albums.find((album) => album.title === "Next Fixture");
  expect(original.sequenceVersions).toHaveLength(2);
  expect(original.transitionNotebook[0].notes).toContain("next downbeat");
  expect(original.tracks[0].humanApproved).toBe(true);
  expect(copy.tracks.every((track) => track.candidates.length === 0 && !track.humanApproved)).toBe(true);
  expect(copy.orderApproved).toBe(false);
});

test("mastering analysis, chapter cues, and delivery authority remain explicit", async ({ page, request }) => {
  await page.getByRole("button", { name: "Mastering", exact: true }).click();
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
  const eqImpact = page.getByTestId("eq-live-impact");
  const compressorReduction = page.getByTestId("compressor-gain-reduction");
  const limiterReduction = page.getByTestId("limiter-gain-reduction");
  await expect(eqImpact).toHaveAttribute("data-live-active", "false");
  await expect(eqImpact).toHaveAttribute("data-impact-db", "0.00");
  await expect(compressorReduction).toHaveAttribute("data-live-active", "false");
  await expect(compressorReduction).toHaveAttribute("data-reduction-db", "0.00");
  await expect(limiterReduction).toHaveAttribute("data-live-active", "false");
  await expect(limiterReduction).toHaveAttribute("data-reduction-db", "0.00");
  const transportToggle = page.locator(".transport-playback-toggle");
  await transportToggle.click();
  await expect(eqImpact).toHaveAttribute("data-live-active", "true");
  await expect.poll(async () => Number(await eqImpact.getAttribute("data-impact-db")), { timeout: 2_000 }).toBeGreaterThan(0);
  await expect(compressorReduction).toHaveAttribute("data-live-active", "true");
  await expect.poll(async () => Number(await compressorReduction.getAttribute("data-reduction-db")), { timeout: 2_000 }).toBeGreaterThan(0);
  await expect(limiterReduction).toHaveAttribute("data-live-active", "true");
  await commitNumber(/MASTER output gain/, 12);
  await expect.poll(async () => Number(await limiterReduction.getAttribute("data-reduction-db")), { timeout: 2_000 }).toBeGreaterThan(0);
  await page.getByLabel("Enable MASTER limiter").uncheck();
  await expect(limiterReduction).toHaveAttribute("data-live-active", "false");
  await expect(limiterReduction).toHaveAttribute("data-reduction-db", "0.00");
  await page.getByLabel("Enable MASTER limiter").check();
  await expect(limiterReduction).toHaveAttribute("data-live-active", "true");
  await expect.poll(async () => Number(await limiterReduction.getAttribute("data-reduction-db")), { timeout: 2_000 }).toBeGreaterThan(0);
  await commitNumber(/MASTER output gain/, -1);
  await page.getByLabel("Enable MASTER EQ").uncheck();
  await expect(eqImpact).toHaveAttribute("data-live-active", "false");
  await expect(eqImpact).toHaveAttribute("data-impact-db", "0.00");
  await page.getByLabel("Enable MASTER EQ").check();
  await expect(eqImpact).toHaveAttribute("data-live-active", "true");
  await expect.poll(async () => Number(await eqImpact.getAttribute("data-impact-db")), { timeout: 2_000 }).toBeGreaterThan(0);
  await page.getByLabel("Enable MASTER compressor").uncheck();
  await expect(compressorReduction).toHaveAttribute("data-live-active", "false");
  await expect(compressorReduction).toHaveAttribute("data-reduction-db", "0.00");
  await page.getByLabel("Enable MASTER compressor").check();
  await expect(compressorReduction).toHaveAttribute("data-live-active", "true");
  await expect.poll(async () => Number(await compressorReduction.getAttribute("data-reduction-db")), { timeout: 2_000 }).toBeGreaterThan(0);
  await page.getByLabel("Bypass MASTER").check();
  await expect(eqImpact).toHaveAttribute("data-live-active", "false");
  await expect(eqImpact).toHaveAttribute("data-impact-db", "0.00");
  await expect(compressorReduction).toHaveAttribute("data-live-active", "false");
  await expect(compressorReduction).toHaveAttribute("data-reduction-db", "0.00");
  await expect(limiterReduction).toHaveAttribute("data-live-active", "false");
  await expect(limiterReduction).toHaveAttribute("data-reduction-db", "0.00");
  await page.getByLabel("Bypass MASTER").uncheck();
  await expect(eqImpact).toHaveAttribute("data-live-active", "true");
  await expect.poll(async () => Number(await eqImpact.getAttribute("data-impact-db")), { timeout: 2_000 }).toBeGreaterThan(0);
  await expect(compressorReduction).toHaveAttribute("data-live-active", "true");
  await expect.poll(async () => Number(await compressorReduction.getAttribute("data-reduction-db")), { timeout: 2_000 }).toBeGreaterThan(0);
  await expect(limiterReduction).toHaveAttribute("data-live-active", "true");
  await transportToggle.click();
  await expect(eqImpact).toHaveAttribute("data-live-active", "false");
  await expect(eqImpact).toHaveAttribute("data-impact-db", "0.00");
  await expect(compressorReduction).toHaveAttribute("data-live-active", "false");
  await expect(compressorReduction).toHaveAttribute("data-reduction-db", "0.00");
  await expect(limiterReduction).toHaveAttribute("data-live-active", "false");
  await expect(limiterReduction).toHaveAttribute("data-reduction-db", "0.00");
  const headerMeter = page.getByTestId("header-master-meter");
  await expect(headerMeter).toHaveAttribute("data-meter-routing", "mastering");
  await expect(headerMeter).toHaveAttribute("data-master-effects", "true");
  await expect(headerMeter).toHaveAttribute("data-routing-label", "MASTER");
  await expect(headerMeter).toHaveAttribute("aria-label", /Mastering enabled/);
  await expect.poll(() => headerMeter.evaluate((element) => getComputedStyle(element).borderColor)).toBe("rgb(168, 201, 47)");
  await page.getByLabel("Bypass MASTER").check();
  await expect(headerMeter).toHaveAttribute("data-meter-routing", "raw");
  await expect(headerMeter).toHaveAttribute("data-master-effects", "false");
  await expect.poll(() => headerMeter.evaluate((element) => getComputedStyle(element).borderColor)).toBe("rgba(0, 0, 0, 0)");
  await page.getByLabel("Bypass MASTER").uncheck();
  await expect(headerMeter).toHaveAttribute("data-meter-routing", "mastering");
  await expect.poll(() => headerMeter.evaluate((element) => getComputedStyle(element).borderColor)).toBe("rgb(168, 201, 47)");
  // The earlier meter exercise can legitimately advance the sequence to its
  // next source. Re-select and pause the intended mastering track before the
  // A/B check so the one-second fixture cannot advance during setup.
  await page.locator(".mastering-track-list").getByRole("button", { name: /^Alpha Tone\./ }).click();
  await transportToggle.click();
  await expect(transportToggle).toHaveAttribute("aria-label", "Resume playback");
  await expect(page.locator(".transport-copy")).toContainText("Alpha Tone");
  await page.locator(".reference-ab-panel > summary").click();
  await page.getByLabel("Reference audio track").selectOption("test-root::Alternate Mix.mp3");
  await page.getByRole("button", { name: /B Clean reference/ }).click();
  await expect(eqImpact).toHaveAttribute("data-live-active", "false");
  await expect(eqImpact).toHaveAttribute("data-impact-db", "0.00");
  await expect(compressorReduction).toHaveAttribute("data-live-active", "false");
  await expect(compressorReduction).toHaveAttribute("data-reduction-db", "0.00");
  await expect(limiterReduction).toHaveAttribute("data-live-active", "false");
  await expect(limiterReduction).toHaveAttribute("data-reduction-db", "0.00");
  await expect(headerMeter).toHaveAttribute("data-meter-routing", "reference");
  await expect(headerMeter).toHaveAttribute("data-master-effects", "false");
  await expect(headerMeter).toHaveAttribute("data-routing-label", "REF");
  await expect(headerMeter).toHaveAttribute("aria-label", /Clean reference; mastering bypassed/);
  await expect.poll(() => headerMeter.evaluate((element) => getComputedStyle(element).borderColor)).toBe("rgb(224, 173, 34)");
  await expect(page.locator(".transport-copy")).toContainText("Reference · Alternate Mix.mp3");
  await expect(page.locator(".transport-waveform-meta strong")).toHaveText("B · clean reference · MASTER bypassed");
  await expect(page.locator(".reference-ab-status")).toContainText("mastering effects are bypassed");
  await expect(page.getByRole("button", { name: /A Current master/ })).toHaveAttribute("aria-keyshortcuts", "ArrowLeft");
  await expect(page.getByRole("button", { name: /B Clean reference/ })).toHaveAttribute("aria-keyshortcuts", "ArrowRight");
  await page.locator(".reference-ab-panel > summary").click();
  await expect(page.locator(".reference-ab-summary-state")).toHaveText("B · Reference live");
  await page.keyboard.press("ArrowLeft");
  await expect(page.locator(".reference-ab-summary-state")).toHaveText("A · Master live");
  await expect(headerMeter).toHaveAttribute("data-meter-routing", "mastering");
  await expect(headerMeter).toHaveAttribute("data-routing-label", "MASTER");
  await expect.poll(() => headerMeter.evaluate((element) => getComputedStyle(element).borderColor)).toBe("rgb(168, 201, 47)");
  await expect(page.locator(".transport-copy")).toContainText("Alpha Tone");
  await expect(page.locator(".transport-waveform-meta strong")).toContainText("A · current master · MASTER live");
  await page.keyboard.press("ArrowRight");
  await expect(page.locator(".reference-ab-summary-state")).toHaveText("B · Reference live");
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
  await expect(page.locator("[data-project-save-status]")).toContainText("Saved locally");

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
  await expect(page.locator("[data-project-save-status]")).toContainText("Saved locally");

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

  await expect(page.locator("[data-project-save-status]")).toContainText("Saved locally");
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

  await page.getByRole("button", { name: "Mastering", exact: true }).click();
  await expect(page.locator(".render-history")).toContainText(completedJob.result.audioName);
});
