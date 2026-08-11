import { normalizeMasterBus } from "./mastering.js";

const STORAGE_KEY = "project-sequencer-hosted-tester-v2";
const STORAGE_VERSION = 2;
const ROOT_ID = "dreadnauts-album-one";

const DEMO_SOURCES = Object.freeze([
  { id: "funky-space-reggae-vibes", title: "Funky Space Reggae Vibes", duration: 372.481 },
  { id: "intergalactic-mind-traveler", title: "Intergalactic Mind Traveler", duration: 309.241 },
  { id: "captain-of-the-cosmic-tide", title: "Captain of the Cosmic Tide", duration: 291.84 },
  { id: "nebula-meditation", title: "Nebula Meditation", duration: 300.8 },
  { id: "solar-wind-surfer", title: "Solar Wind Surfer", duration: 348.961 },
  { id: "spacerock", title: "SpaceRock", duration: 277.801 },
  { id: "black-hole-dub", title: "Black Hole Dub", duration: 374.84 },
  { id: "one-love-across-the-universe", title: "One Love Across the Universe", duration: 277.2 },
  { id: "return-to-earth", title: "Return to Earth", duration: 321.88 },
].map((source, index) => ({
  ...source,
  fileName: `${String(index + 1).padStart(2, "0")} ${source.title}.mp3`,
})));

const sourceKeyFor = (source) => `${ROOT_ID}::${source.fileName}`;

export const hostedDemoLibrary = DEMO_SOURCES.map((source, index) => ({
  key: sourceKeyFor(source),
  rootId: ROOT_ID,
  relativePath: source.fileName,
  name: source.fileName,
  extension: "mp3",
  size: Math.round(source.duration * 40_000),
  mtimeMs: 1_786_329_600_000 + index,
  duration: source.duration,
  bitrate: 320_000,
  codec: "mp3",
  sampleRate: 44_100,
  channels: 2,
  bitDepth: null,
  probeError: "",
}));

export const hostedDemoRoots = [{
  id: ROOT_ID,
  label: "The Dreadnauts — Cosmic Reggae Sessions",
  path: "Protected public streams from dreadnauts.uk",
  kind: "folder",
  connected: true,
  connectionState: "connected",
}];

const componentPresets = () => ({
  eq: [{
    id: "warm-lift",
    name: "Warm Lift",
    settings: {
      enabled: true,
      lowShelf: { frequencyHz: 110, gainDb: 1.5 },
      midBand: { frequencyHz: 1_600, gainDb: -0.8, q: 1.1 },
      highShelf: { frequencyHz: 8_500, gainDb: 1.2 },
    },
  }],
  compressor: [{
    id: "gentle-glue",
    name: "Gentle Glue",
    settings: { enabled: true, thresholdDb: -18, ratio: 2, attackMs: 28, releaseMs: 220, knee: 3, makeupGainDb: 1, mix: 0.8, link: "maximum", detection: "rms" },
  }],
  output: [{ id: "headroom-check", name: "Headroom Check", settings: { outputGainDb: -1 } }],
  limiter: [{ id: "safe-ceiling", name: "Safe Ceiling", settings: { enabled: true, ceilingDbfs: -1, attackMs: 5, releaseMs: 80 } }],
  master: [{
    id: "tester-finish",
    name: "Tester Finish",
    settings: normalizeMasterBus({
      eq: {
        enabled: true,
        lowShelf: { frequencyHz: 100, gainDb: 1.2 },
        midBand: { frequencyHz: 1_800, gainDb: -0.6, q: 1.2 },
        highShelf: { frequencyHz: 9_000, gainDb: 1 },
      },
      compressor: { enabled: true, thresholdDb: -20, ratio: 2.2, attackMs: 24, releaseMs: 180, knee: 3, makeupGainDb: 1.2, mix: 0.82 },
      outputGainDb: -0.5,
      limiter: { enabled: true, ceilingDbfs: -1, attackMs: 4, releaseMs: 70 },
    }),
  }],
});

export const createHostedDemoState = () => ({
  schemaVersion: 5,
  albumTemplates: [],
  masteringPresets: componentPresets(),
  activeAlbumId: "cosmic-reggae-sessions",
  settings: {
    project: { artistName: "The Dreadnauts", setupComplete: true },
    revealPrivateFilenames: false,
    appearance: { mode: "dark", colorTheme: "signal", fontTheme: "condensed", textScale: 1 },
  },
  albums: [{
    id: "cosmic-reggae-sessions",
    artist: "The Dreadnauts",
    title: "Cosmic Reggae Sessions",
    era: "past",
    status: "working",
    orderApproved: false,
    masterBus: normalizeMasterBus(),
    baselineTrackOrder: DEMO_SOURCES.map((source) => source.id),
    visualAssets: [],
    tracks: DEMO_SOURCES.map((source, index) => ({
      id: source.id,
      title: source.title,
      decisionStatus: "undecided",
      masterCandidateId: "",
      auditionCandidateId: `${source.id}-demo`,
      notes: index === 0 ? "Use the MASTER controls to hear and see changes against the released Album 1 stream in real time." : "",
      visualAssets: [],
      candidates: [{
        id: `${source.id}-demo`,
        label: "Protected public album stream",
        sourceRef: { rootId: ROOT_ID, relativePath: source.fileName },
        flags: ["Released Album 1 stream", "Hosted playback only"],
        notes: "",
      }],
    })),
  }],
});

const clone = (value) => structuredClone(value);

const projectSummary = (state) => ({
  artistName: state.settings.project.artistName,
  albumCount: state.albums.length,
  trackCount: state.albums.reduce((total, album) => total + album.tracks.length, 0),
});

const publicProjects = (workspace) => workspace.projects
  .map(({ state, ...project }) => ({ ...project, ...projectSummary(state), active: project.id === workspace.activeProjectId }))
  .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt));

const initialWorkspace = () => {
  const now = new Date().toISOString();
  return {
    version: STORAGE_VERSION,
    activeProjectId: "hosted-tester-project",
    projects: [{ id: "hosted-tester-project", name: "The Dreadnauts — Album 1 Demo", createdAt: now, updatedAt: now, state: createHostedDemoState() }],
  };
};

const validateState = (state) => {
  if (!state || typeof state !== "object" || !Array.isArray(state.albums)) throw new Error("That project is not valid Project Sequencer data.");
  if (state.schemaVersion !== 5) {
    const direction = Number(state.schemaVersion) > 5 ? "newer than" : "older than";
    throw new Error(`Project state version ${state.schemaVersion ?? "unknown"} is ${direction} this hosted tester build supports.`);
  }
  return clone(state);
};

const cleanText = (value, label) => {
  const text = typeof value === "string" ? value.trim() : "";
  if (!text || text.length > 120) throw new Error(`${label} must be between 1 and 120 characters.`);
  return text;
};

const slugify = (value) => value.toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "untitled-album";

const freshProjectState = ({ artistName, firstAlbumTitle, era, appearance }) => {
  const albumId = slugify(firstAlbumTitle);
  return {
    schemaVersion: 5,
    albumTemplates: [],
    masteringPresets: componentPresets(),
    activeAlbumId: albumId,
    settings: {
      project: { artistName, setupComplete: true },
      revealPrivateFilenames: false,
      ...(appearance ? { appearance: clone(appearance) } : {}),
    },
    albums: [{
      id: albumId,
      artist: artistName,
      title: firstAlbumTitle,
      era: ["past", "current", "future"].includes(era) ? era : "future",
      status: "empty",
      orderApproved: false,
      masterBus: normalizeMasterBus(),
      baselineTrackOrder: [],
      visualAssets: [],
      tracks: [],
    }],
  };
};

const resolveStorage = (storage) => storage || globalThis.localStorage;

const readWorkspace = (storage) => {
  try {
    const parsed = JSON.parse(resolveStorage(storage).getItem(STORAGE_KEY));
    if (parsed?.version !== STORAGE_VERSION || !Array.isArray(parsed.projects) || !parsed.projects.some((project) => project.id === parsed.activeProjectId)) return initialWorkspace();
    parsed.projects.forEach((project) => validateState(project.state));
    return parsed;
  } catch {
    return initialWorkspace();
  }
};

const writeWorkspace = (storage, workspace) => {
  resolveStorage(storage).setItem(STORAGE_KEY, JSON.stringify(workspace));
};

const libraryPayload = () => ({
  library: clone(hostedDemoLibrary),
  roots: clone(hostedDemoRoots),
  scan: { reusedMetadata: hostedDemoLibrary.length, probedMetadata: 0, completedAt: new Date().toISOString() },
  watching: { configured: false, enabled: false, watchedRootIds: [] },
  scanning: false,
});

const hostedCapabilityError = () => Promise.reject(new Error("This action needs the local Project Sequencer server. The hosted tester never receives device paths or source files."));

const mediaUrl = (key) => {
  const source = DEMO_SOURCES.find((item) => sourceKeyFor(item) === key);
  return source ? `/demo-audio/${encodeURIComponent(source.id)}` : "";
};

const waveform = (key, requestedPoints = 900) => {
  const sourceIndex = Math.max(0, hostedDemoLibrary.findIndex((file) => file.key === key));
  const pointCount = Math.min(1_600, Math.max(240, Number.parseInt(requestedPoints, 10) || 900));
  const points = Array.from({ length: pointCount }, (_, index) => {
    const phase = index / Math.max(1, pointCount - 1);
    const shape = 0.42 + 0.3 * Math.abs(Math.sin(phase * Math.PI * (9 + sourceIndex * 2))) + 0.22 * Math.abs(Math.sin(phase * Math.PI * 37 + sourceIndex));
    const edge = Math.min(1, phase * 14, (1 - phase) * 14);
    return Number(Math.min(1, shape * edge).toFixed(4));
  });
  const file = hostedDemoLibrary[sourceIndex];
  return Promise.resolve({ key, duration: file.duration, pointCount, sampleCount: Math.round(file.duration * file.sampleRate), points });
};

export const createHostedDemoApi = ({ storage } = {}) => ({
  hostedDemo: true,
  bootstrap: async () => {
    const workspace = readWorkspace(storage);
    const project = workspace.projects.find((item) => item.id === workspace.activeProjectId);
    return {
      state: clone(project.state),
      projects: publicProjects(workspace),
      activeProjectId: workspace.activeProjectId,
      recovery: { required: false },
      supportedFormats: ["mp3"],
      ...libraryPayload(),
    };
  },
  saveState: async (state) => {
    const validated = validateState(state);
    const workspace = readWorkspace(storage);
    const project = workspace.projects.find((item) => item.id === workspace.activeProjectId);
    project.state = validated;
    project.updatedAt = new Date().toISOString();
    writeWorkspace(storage, workspace);
    return { state: clone(validated), projects: publicProjects(workspace), activeProjectId: workspace.activeProjectId };
  },
  createProject: async (details) => {
    const workspace = readWorkspace(storage);
    const id = globalThis.crypto?.randomUUID?.() || `hosted-${Date.now()}`;
    const name = cleanText(details?.name, "Project name");
    const artistName = cleanText(details?.artistName, "Artist name");
    const firstAlbumTitle = cleanText(details?.firstAlbumTitle, "First album title");
    const now = new Date().toISOString();
    const state = freshProjectState({ artistName, firstAlbumTitle, era: details?.era, appearance: workspace.projects.find((item) => item.id === workspace.activeProjectId)?.state?.settings?.appearance });
    workspace.projects.push({ id, name, createdAt: now, updatedAt: now, state });
    workspace.activeProjectId = id;
    writeWorkspace(storage, workspace);
    return { state: clone(state), projects: publicProjects(workspace), activeProjectId: id };
  },
  loadProject: async (projectId) => {
    const workspace = readWorkspace(storage);
    const project = workspace.projects.find((item) => item.id === projectId);
    if (!project) throw new Error("That browser-saved project does not exist.");
    workspace.activeProjectId = projectId;
    project.updatedAt = new Date().toISOString();
    writeWorkspace(storage, workspace);
    return { state: clone(project.state), projects: publicProjects(workspace), activeProjectId: projectId };
  },
  restoreRecovery: hostedCapabilityError,
  beaconState: (state) => {
    try {
      const workspace = readWorkspace(storage);
      const project = workspace.projects.find((item) => item.id === workspace.activeProjectId);
      project.state = validateState(state);
      project.updatedAt = new Date().toISOString();
      writeWorkspace(storage, workspace);
      return true;
    } catch {
      return false;
    }
  },
  rescan: async () => libraryPayload(),
  libraryStatus: async () => libraryPayload(),
  portableBundle: hostedCapabilityError,
  registerSource: hostedCapabilityError,
  chooseSources: hostedCapabilityError,
  chooseProjectAssets: hostedCapabilityError,
  renderAudio: hostedCapabilityError,
  startRenderJob: hostedCapabilityError,
  getRenderJob: hostedCapabilityError,
  waitForRenderJob: hostedCapabilityError,
  cancelRenderJob: hostedCapabilityError,
  waveform,
  technicalAnalysis: async (key) => {
    const index = Math.max(0, hostedDemoLibrary.findIndex((file) => file.key === key));
    return { key, measurements: { integratedLoudness: -16.4 + index * 0.8, loudnessRange: 5.2 + index * 0.7, truePeak: -2.1 + index * 0.2, dcOffset: 0, silenceBoundaries: [] }, analyzedAt: new Date().toISOString(), cached: false };
  },
  listRenderJobs: async () => ({ jobs: [] }),
  renderManifest: hostedCapabilityError,
  revealRender: hostedCapabilityError,
  addRoot: hostedCapabilityError,
  removeSource: hostedCapabilityError,
  removeRoot: hostedCapabilityError,
  mediaUrl,
  assetUrl: () => "",
});

export const hostedDemoApi = createHostedDemoApi();
