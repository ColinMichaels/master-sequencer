import { normalizeMasterBus } from "./mastering.js";
import { createDefaultAdvancedMastering, normalizeAdvancedMastering } from "./advanced-mastering.js";
import { createBrowserMediaRegistry } from "./browser-media-registry.js";

const STORAGE_KEY = "project-sequencer-online-v1";
const LEGACY_STORAGE_KEY = "project-sequencer-hosted-tester-v3";
const STORAGE_VERSION = 3;
const ROOT_ID = "dreadnauts-album-one";
const AUDIO_EXTENSIONS = new Set(["mp3", "wav", "flac", "aiff", "aif", "m4a", "aac", "ogg", "opus"]);
const AUDIO_ACCEPT = [...AUDIO_EXTENSIONS].map((extension) => `.${extension}`).join(",");

const PREVIEW_SOURCES = Object.freeze([
  { id: "funky-space-reggae-vibes", title: "Funky Space Reggae Vibes", previewUrl: "https://audio-ssl.itunes.apple.com/itunes-assets/AudioPreview211/v4/2b/6d/9a/2b6d9a90-bbed-75be-e95e-c19251c8542f/mzaf_3227232006206776513.plus.aac.p.m4a" },
  { id: "intergalactic-mind-traveler", title: "Intergalactic Mind Traveler", previewUrl: "https://audio-ssl.itunes.apple.com/itunes-assets/AudioPreview211/v4/13/62/77/136277a5-bb5a-57a3-69aa-bda2fd576acf/mzaf_8925188031657701637.plus.aac.p.m4a" },
  { id: "captain-of-the-cosmic-tide", title: "Captain of the Cosmic Tide", previewUrl: "https://audio-ssl.itunes.apple.com/itunes-assets/AudioPreview221/v4/90/9a/5c/909a5cb1-158b-267f-53a3-92d4579a20f8/mzaf_7652213948932993798.plus.aac.p.m4a" },
  { id: "nebula-meditation", title: "Nebula Meditation", previewUrl: "https://audio-ssl.itunes.apple.com/itunes-assets/AudioPreview211/v4/49/84/d8/4984d8ee-a93c-1898-b9b9-d3c401b859ad/mzaf_7246105078446485788.plus.aac.p.m4a" },
  { id: "solar-wind-surfer", title: "Solar Wind Surfer", previewUrl: "https://audio-ssl.itunes.apple.com/itunes-assets/AudioPreview221/v4/95/6a/8d/956a8dbf-add9-2bd5-401d-565e8cc4d53b/mzaf_14886883486310609518.plus.aac.p.m4a" },
  { id: "spacerock", title: "SpaceRock", previewUrl: "https://audio-ssl.itunes.apple.com/itunes-assets/AudioPreview221/v4/24/f2/7f/24f27f31-b77e-5de7-82d9-b2e538c014a1/mzaf_11647380238469058767.plus.aac.p.m4a" },
  { id: "black-hole-dub", title: "Black Hole Dub", previewUrl: "https://audio-ssl.itunes.apple.com/itunes-assets/AudioPreview221/v4/8b/f0/b6/8bf0b6f9-c6bf-d615-de60-337b4d8c469f/mzaf_2142279483434309567.plus.aac.p.m4a" },
  { id: "one-love-across-the-universe", title: "One Love Across the Universe", previewUrl: "https://audio-ssl.itunes.apple.com/itunes-assets/AudioPreview211/v4/4b/c6/bf/4bc6bf91-ca7e-021a-9191-a011f05e8a93/mzaf_7040345245165369786.plus.aac.p.m4a" },
  { id: "return-to-earth", title: "Return to Earth", previewUrl: "https://audio-ssl.itunes.apple.com/itunes-assets/AudioPreview211/v4/5c/20/f4/5c20f450-c55a-4fae-a921-cdd9b65796e3/mzaf_10263104242253855429.plus.aac.p.m4a" },
].map((source, index) => ({
  ...source,
  duration: 30,
  fileName: `${String(index + 1).padStart(2, "0")} ${source.title} — Apple Music Preview.m4a`,
})));

const sourceKeyFor = (source) => `${ROOT_ID}::${source.fileName}`;

export const onlineAppLibrary = PREVIEW_SOURCES.map((source, index) => ({
  key: sourceKeyFor(source),
  rootId: ROOT_ID,
  relativePath: source.fileName,
  name: source.fileName,
  extension: "m4a",
  size: Math.round(source.duration * 34_000),
  mtimeMs: 1_786_329_600_000 + index,
  duration: source.duration,
  bitrate: 256_000,
  codec: "aac",
  sampleRate: 44_100,
  channels: 2,
  bitDepth: null,
  probeError: "",
}));

export const onlineAppRoots = [{
  id: ROOT_ID,
  label: "The Dreadnauts — Cosmic Reggae Sessions",
  path: "Official Apple Music preview clips",
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
    id: "release-finish",
    name: "Release Finish",
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

export const createOnlineAppState = () => ({
  schemaVersion: 7,
  albumTemplates: [],
  masteringPresets: componentPresets(),
  activeAlbumId: "cosmic-reggae-sessions",
  settings: {
    project: { artistName: "The Dreadnauts", setupComplete: true },
    revealPrivateFilenames: false,
    appearance: { mode: "dark", colorTheme: "signal", fontTheme: "modern", textScale: 1 },
  },
  albums: [{
    id: "cosmic-reggae-sessions",
    artist: "The Dreadnauts",
    title: "Cosmic Reggae Sessions",
    era: "past",
    releaseDate: "",
    status: "working",
    orderApproved: false,
    masterBus: normalizeMasterBus(),
    masteringPath: "basic",
    advancedMastering: createDefaultAdvancedMastering(),
    baselineTrackOrder: PREVIEW_SOURCES.map((source) => source.id),
    visualAssets: [],
    tracks: PREVIEW_SOURCES.map((source, index) => ({
      id: source.id,
      title: source.title,
      decisionStatus: "undecided",
      masterCandidateId: "",
      auditionCandidateId: `${source.id}-preview`,
      notes: index === 0 ? "Use the MASTER controls to hear and see changes against an official 30-second Album 1 preview in real time." : "",
      visualAssets: [],
      candidates: [{
        id: `${source.id}-preview`,
        label: "Official Apple Music preview",
        sourceRef: { rootId: ROOT_ID, relativePath: source.fileName },
        flags: ["Official 30-second preview", "Streaming preview"],
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
    activeProjectId: "online-project",
    projects: [{ id: "online-project", name: "The Dreadnauts — Album 1", createdAt: now, updatedAt: now, state: createOnlineAppState() }],
  };
};

const validateState = (state) => {
  if (!state || typeof state !== "object" || !Array.isArray(state.albums)) throw new Error("That project is not valid Project Sequencer data.");
  if (state.schemaVersion === 5) state = { ...state, schemaVersion: 6, albums: state.albums.map((album) => ({ ...album, masteringPath: "basic", advancedMastering: createDefaultAdvancedMastering() })) };
  if (state.schemaVersion === 6) state = { ...state, schemaVersion: 7, albums: state.albums.map((album) => ({ ...album, advancedMastering: normalizeAdvancedMastering(album.advancedMastering) })) };
  if (state.schemaVersion !== 7) {
    const direction = Number(state.schemaVersion) > 7 ? "newer than" : "older than";
    throw new Error(`Project state version ${state.schemaVersion ?? "unknown"} is ${direction} this online app supports.`);
  }
  return clone({ ...state, albums: state.albums.map((album) => ({ ...album, masteringPath: album.masteringPath === "advanced" ? "advanced" : "basic", advancedMastering: normalizeAdvancedMastering(album.advancedMastering) })) });
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
    schemaVersion: 7,
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
      releaseDate: "",
      status: "empty",
      orderApproved: false,
      masterBus: normalizeMasterBus(),
      masteringPath: "basic",
      advancedMastering: createDefaultAdvancedMastering(),
      baselineTrackOrder: [],
      visualAssets: [],
      tracks: [],
    }],
  };
};

const resolveStorage = (storage) => storage || globalThis.localStorage;

const migrateOnlineWorkspace = (workspace) => {
  workspace.projects.forEach((project) => {
    if (project.name === "The Dreadnauts — Album 1 Demo") project.name = "The Dreadnauts — Album 1";
    const masterPresets = project.state?.masteringPresets?.master || [];
    masterPresets.forEach((preset) => {
      if (preset.name === "Tester Finish") preset.name = "Release Finish";
      if (preset.id === "tester-finish") preset.id = "release-finish";
    });
    project.state?.albums?.forEach((album) => album.tracks?.forEach((track) => track.candidates?.forEach((candidate) => {
      candidate.flags = (candidate.flags || []).map((flag) => flag === "Hosted playback only" ? "Streaming preview" : flag);
    })));
  });
  return workspace;
};

const readWorkspace = (storage) => {
  try {
    const resolvedStorage = resolveStorage(storage);
    const currentValue = resolvedStorage.getItem(STORAGE_KEY);
    const parsed = JSON.parse(currentValue || resolvedStorage.getItem(LEGACY_STORAGE_KEY));
    if (parsed?.version !== STORAGE_VERSION || !Array.isArray(parsed.projects) || !parsed.projects.some((project) => project.id === parsed.activeProjectId)) return initialWorkspace();
    parsed.projects.forEach((project) => validateState(project.state));
    const migrated = migrateOnlineWorkspace(parsed);
    if (!currentValue) resolvedStorage.setItem(STORAGE_KEY, JSON.stringify(migrated));
    return migrated;
  } catch {
    return initialWorkspace();
  }
};

const writeWorkspace = (storage, workspace) => {
  resolveStorage(storage).setItem(STORAGE_KEY, JSON.stringify(workspace));
};

const onlineCapabilityError = () => Promise.reject(new Error("This action is not available in the browser. Project Sequencer can use only browser-granted access to files you explicitly choose; it cannot use system paths or FFmpeg."));

const safeRelativePath = (value, fallback) => {
  const parts = String(value || fallback || "audio").replaceAll("\\", "/").split("/").filter((part) => part && part !== "." && part !== "..");
  return parts.join("/") || fallback || "audio";
};

const fileExtension = (name) => String(name || "").split(".").at(-1)?.toLowerCase() || "";

const pickWithFileInput = (kind) => new Promise((resolve, reject) => {
  if (typeof document === "undefined") {
    reject(new Error("Browser file selection is unavailable in this environment."));
    return;
  }
  const input = document.createElement("input");
  input.type = "file";
  input.accept = AUDIO_ACCEPT;
  input.multiple = true;
  if (kind === "folder") input.setAttribute("webkitdirectory", "");
  input.hidden = true;
  document.body.append(input);
  const finish = (files, cancelled = false) => {
    input.remove();
    const pickedEntries = files.map((file) => ({ file, relativePath: safeRelativePath(file.webkitRelativePath, file.name) }));
    const folderName = kind === "folder" ? pickedEntries[0]?.relativePath.split("/")[0] : "";
    const entries = folderName
      ? pickedEntries.map((entry) => ({ ...entry, relativePath: safeRelativePath(entry.relativePath.slice(folderName.length + 1), entry.file.name) }))
      : pickedEntries;
    resolve({ cancelled, label: kind === "folder" ? folderName || "Selected audio folder" : "Selected audio files", entries });
  };
  input.addEventListener("change", () => finish([...input.files], input.files.length === 0), { once: true });
  input.addEventListener("cancel", () => finish([], true), { once: true });
  input.click();
});

const walkDirectory = async (handle, prefix = "") => {
  const entries = [];
  for await (const child of handle.values()) {
    const relativePath = safeRelativePath(`${prefix}/${child.name}`, child.name);
    if (child.kind === "file") entries.push({ file: await child.getFile(), relativePath });
    else if (child.kind === "directory") entries.push(...await walkDirectory(child, relativePath));
  }
  return entries;
};

const pickBrowserAudioSources = async (kind) => {
  try {
    if (kind === "files" && typeof globalThis.showOpenFilePicker === "function") {
      const handles = await globalThis.showOpenFilePicker({
        multiple: true,
        types: [{ description: "Audio files", accept: { "audio/*": [...AUDIO_EXTENSIONS].map((extension) => `.${extension}`) } }],
      });
      return { cancelled: handles.length === 0, persistent: true, kind: "files", handles, label: "Selected audio files", entries: await Promise.all(handles.map(async (handle) => ({ file: await handle.getFile(), relativePath: handle.name }))) };
    }
    if (kind === "folder" && typeof globalThis.showDirectoryPicker === "function") {
      const handle = await globalThis.showDirectoryPicker({ mode: "read" });
      return { cancelled: false, persistent: true, kind: "folder", handle, label: handle.name || "Selected audio folder", entries: await walkDirectory(handle) };
    }
    return pickWithFileInput(kind);
  } catch (error) {
    if (error?.name === "AbortError") return { cancelled: true, label: "", entries: [] };
    throw error;
  }
};

const createBrowserMediaUrl = (file) => URL.createObjectURL(file);

const readBrowserAudioMetadata = ({ mediaUrl }) => new Promise((resolve) => {
  const audio = document.createElement("audio");
  let settled = false;
  const finish = (duration = 0, probeError = "") => {
    if (settled) return;
    settled = true;
    audio.removeAttribute("src");
    audio.load();
    resolve({ duration: Number.isFinite(duration) ? duration : 0, probeError });
  };
  const timeout = globalThis.setTimeout(() => finish(0, "Audio metadata timed out."), 12_000);
  audio.addEventListener("loadedmetadata", () => {
    globalThis.clearTimeout(timeout);
    finish(audio.duration);
  }, { once: true });
  audio.addEventListener("error", () => {
    globalThis.clearTimeout(timeout);
    finish(0, "Audio metadata could not be read by this browser.");
  }, { once: true });
  audio.preload = "metadata";
  audio.src = mediaUrl;
});

const syntheticWaveform = (file, sourceIndex, requestedPoints = 900) => {
  const pointCount = Math.min(1_600, Math.max(240, Number.parseInt(requestedPoints, 10) || 900));
  const points = Array.from({ length: pointCount }, (_, index) => {
    const phase = index / Math.max(1, pointCount - 1);
    const shape = 0.42 + 0.3 * Math.abs(Math.sin(phase * Math.PI * (9 + sourceIndex * 2))) + 0.22 * Math.abs(Math.sin(phase * Math.PI * 37 + sourceIndex));
    const edge = Math.min(1, phase * 14, (1 - phase) * 14);
    return Number(Math.min(1, shape * edge).toFixed(4));
  });
  return { key: file.key, duration: file.duration, pointCount, sampleCount: Math.round(file.duration * (file.sampleRate || 44_100)), points };
};

const waveformFromBrowserFile = async (file, libraryFile, requestedPoints = 900) => {
  const AudioContextClass = globalThis.AudioContext || globalThis.webkitAudioContext;
  if (!AudioContextClass) throw new Error("Waveform analysis is unavailable in this browser.");
  const pointCount = Math.min(1_600, Math.max(240, Number.parseInt(requestedPoints, 10) || 900));
  const context = new AudioContextClass();
  try {
    const buffer = await context.decodeAudioData(await file.arrayBuffer());
    const points = Array.from({ length: pointCount }, (_, bucket) => {
      const start = Math.floor(bucket * buffer.length / pointCount);
      const end = Math.max(start + 1, Math.floor((bucket + 1) * buffer.length / pointCount));
      let peak = 0;
      for (let channel = 0; channel < buffer.numberOfChannels; channel += 1) {
        const samples = buffer.getChannelData(channel);
        for (let index = start; index < end; index += 1) peak = Math.max(peak, Math.abs(samples[index] || 0));
      }
      return Number(Math.min(1, peak).toFixed(4));
    });
    return { key: libraryFile.key, duration: buffer.duration, pointCount, sampleCount: buffer.length, points };
  } finally {
    await context.close();
  }
};

export const createOnlineAppApi = ({ storage, sourcePicker = pickBrowserAudioSources, mediaUrlFactory = createBrowserMediaUrl, metadataReader = readBrowserAudioMetadata, mediaRegistry = createBrowserMediaRegistry() } = {}) => {
  const browserLibrary = [];
  const browserRoots = [];
  const browserFiles = new Map();
  const browserMediaUrls = new Map();
  const waveformCache = new Map();
  const browserSessionId = globalThis.crypto?.randomUUID?.().slice(0, 12) || `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  let rootSequence = 0;
  let persistentSourcesLoaded = false;
  let persistentSourcesPromise;

  const allLibrary = () => [...onlineAppLibrary, ...browserLibrary];
  const allRoots = () => [...onlineAppRoots, ...browserRoots];
  const libraryPayload = (extra = {}) => ({
    library: clone(allLibrary()),
    roots: clone(allRoots()),
    scan: { reusedMetadata: onlineAppLibrary.length, probedMetadata: browserLibrary.length, completedAt: new Date().toISOString() },
    watching: { configured: false, enabled: false, watchedRootIds: [] },
    scanning: false,
    ...extra,
  });

  const removeIndexedRoot = (rootId) => {
    const rootIndex = browserRoots.findIndex((root) => root.id === rootId);
    if (rootIndex >= 0) browserRoots.splice(rootIndex, 1);
    for (let index = browserLibrary.length - 1; index >= 0; index -= 1) {
      const file = browserLibrary[index];
      if (file.rootId !== rootId) continue;
      const existingUrl = browserMediaUrls.get(file.key);
      if (existingUrl?.startsWith("blob:")) URL.revokeObjectURL(existingUrl);
      browserFiles.delete(file.key);
      browserMediaUrls.delete(file.key);
      browserLibrary.splice(index, 1);
    }
    waveformCache.clear();
  };

  const addDisconnectedRoot = (record, connectionState) => {
    const rootId = `browser-device-${record.id}`;
    removeIndexedRoot(rootId);
    browserRoots.push({
      id: rootId,
      label: String(record.label || "Selected audio").slice(0, 120),
      path: connectionState === "permission-required" ? "Permission required to reconnect on this device" : "Browser access is unavailable; reconnect to try again",
      kind: "browser-persistent",
      connected: false,
      connectionState,
    });
    return rootId;
  };

  const indexSelection = async ({ rootId, label, entries, persistent = false, connectionState = "connected" }) => {
    const supportedEntries = (entries || []).filter(({ file }) => AUDIO_EXTENSIONS.has(fileExtension(file?.name)));
    if (!supportedEntries.length) throw new Error("No supported audio files were found in that selection.");
    removeIndexedRoot(rootId);
    browserRoots.push({
      id: rootId,
      label: String(label || "Selected audio").slice(0, 120),
      path: persistent ? "Remembered on this device · reconnects after reload" : "Selected from this device · current browser session only",
      kind: persistent ? "browser-persistent" : "browser-session",
      connected: true,
      connectionState,
    });

    const reservedPaths = new Set();
    const preparedEntries = supportedEntries.map(({ file, relativePath }) => {
      const initialPath = safeRelativePath(relativePath, file.name);
      const dotIndex = initialPath.lastIndexOf(".");
      const stem = dotIndex > 0 ? initialPath.slice(0, dotIndex) : initialPath;
      const suffix = dotIndex > 0 ? initialPath.slice(dotIndex) : "";
      let safePath = initialPath;
      let duplicate = 2;
      while (reservedPaths.has(safePath)) safePath = `${stem} (${duplicate++})${suffix}`;
      reservedPaths.add(safePath);
      const key = `${rootId}::${safePath}`;
      const mediaUrl = mediaUrlFactory(file);
      return { file, safePath, key, mediaUrl };
    });

    // Device files are independent. Probe them together so one slow file does not
    // hold an entire folder behind a sequential metadata waterfall.
    const indexedEntries = await Promise.all(preparedEntries.map(async ({ file, safePath, key, mediaUrl }) => {
      let metadata;
      try {
        metadata = await metadataReader({ file, mediaUrl });
      } catch (error) {
        metadata = { duration: 0, probeError: error?.message || "Audio metadata could not be read by this browser." };
      }
      const duration = Number(metadata?.duration) || 0;
      const extension = fileExtension(file.name);
      return {
        file,
        mediaUrl,
        libraryFile: {
          key,
          rootId,
          relativePath: safePath,
          name: file.name,
          extension,
          size: Number(file.size) || 0,
          mtimeMs: Number(file.lastModified) || Date.now(),
          duration,
          bitrate: duration > 0 ? Math.round((Number(file.size) || 0) * 8 / duration) : null,
          codec: extension,
          sampleRate: null,
          channels: null,
          bitDepth: null,
          probeError: metadata?.probeError || "",
        },
      };
    }));

    const pickedKeys = [];
    for (const { file, mediaUrl, libraryFile } of indexedEntries) {
      browserLibrary.push(libraryFile);
      browserFiles.set(libraryFile.key, file);
      browserMediaUrls.set(libraryFile.key, mediaUrl);
      pickedKeys.push(libraryFile.key);
    }
    return pickedKeys;
  };

  const handlesForRecord = (record) => record.kind === "folder" ? [record.handle].filter(Boolean) : [...(record.handles || [])];

  const permissionState = async (record, request = false) => {
    const handles = handlesForRecord(record);
    if (!handles.length) return "denied";
    const states = await Promise.all(handles.map(async (handle) => {
      const checkPermission = request ? handle.requestPermission : handle.queryPermission;
      if (typeof checkPermission !== "function") return "granted";
      try {
        return await checkPermission.call(handle, { mode: "read" });
      } catch {
        return "denied";
      }
    }));
    if (states.every((state) => state === "granted")) return "granted";
    if (states.some((state) => state === "prompt")) return "prompt";
    return "denied";
  };

  const entriesForRecord = async (record) => record.kind === "folder"
    ? walkDirectory(record.handle)
    : Promise.all((record.handles || []).map(async (handle) => ({ file: await handle.getFile(), relativePath: handle.name })));

  const restoreRecord = async (record, { requestPermission = false, reconnected = false } = {}) => {
    const rootId = `browser-device-${record.id}`;
    const permission = await permissionState(record, requestPermission);
    if (permission !== "granted") {
      addDisconnectedRoot(record, permission === "prompt" ? "permission-required" : "offline");
      return [];
    }
    try {
      return await indexSelection({ rootId, label: record.label, entries: await entriesForRecord(record), persistent: true, connectionState: reconnected ? "reconnected" : "connected" });
    } catch {
      addDisconnectedRoot(record, "offline");
      return [];
    }
  };

  const restorePersistentSources = async () => {
    if (persistentSourcesLoaded) return;
    if (persistentSourcesPromise) return persistentSourcesPromise;
    persistentSourcesPromise = (async () => {
      let records = [];
      try {
        records = await mediaRegistry.list();
      } catch {
        records = [];
      }
      for (const record of records) await restoreRecord(record);
      persistentSourcesLoaded = true;
    })();
    try {
      await persistentSourcesPromise;
    } finally {
      persistentSourcesPromise = null;
    }
  };

  const chooseSources = async (kind) => {
    if (!["files", "folder"].includes(kind)) throw new Error("Choose either audio files or an audio folder.");
    await restorePersistentSources();
    const selection = await sourcePicker(kind);
    if (selection?.cancelled) return libraryPayload({ cancelled: true, pickedKeys: [] });
    if (!(selection?.entries || []).some(({ file }) => AUDIO_EXTENSIONS.has(fileExtension(file?.name)))) throw new Error("No supported audio files were found in that selection.");

    let record = null;
    if (selection?.persistent) {
      const id = globalThis.crypto?.randomUUID?.() || `media-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
      const candidate = {
        id,
        kind: selection.kind === "folder" ? "folder" : "files",
        label: selection.label || (kind === "folder" ? "Selected audio folder" : "Selected audio files"),
        ...(selection.kind === "folder" ? { handle: selection.handle } : { handles: selection.handles || [] }),
      };
      try {
        record = await mediaRegistry.save(candidate);
      } catch {
        record = null;
      }
    }

    rootSequence += 1;
    const rootId = record ? `browser-device-${record.id}` : `browser-session-${browserSessionId}-${rootSequence}`;
    const pickedKeys = await indexSelection({
      rootId,
      label: selection.label || (kind === "folder" ? "Selected audio folder" : "Selected audio files"),
      entries: selection.entries,
      persistent: Boolean(record),
    });
    return libraryPayload({ cancelled: false, pickedKeys });
  };

  const mediaUrl = (key) => {
    if (browserMediaUrls.has(key)) return browserMediaUrls.get(key);
    const source = PREVIEW_SOURCES.find((item) => sourceKeyFor(item) === key);
    return source?.previewUrl || "";
  };

  const waveform = async (key, requestedPoints = 900) => {
    const file = allLibrary().find((item) => item.key === key);
    if (!file) throw new Error("That audio source is not available in this browser session.");
    const browserFile = browserFiles.get(key);
    if (!browserFile) return syntheticWaveform(file, Math.max(0, onlineAppLibrary.findIndex((item) => item.key === key)), requestedPoints);
    const cacheKey = `${key}:${requestedPoints}`;
    if (!waveformCache.has(cacheKey)) waveformCache.set(cacheKey, waveformFromBrowserFile(browserFile, file, requestedPoints));
    return waveformCache.get(cacheKey);
  };

  const removeBrowserSource = async (sourceId) => {
    const rootIndex = browserRoots.findIndex((root) => root.id === sourceId);
    if (rootIndex < 0) return onlineCapabilityError();
    removeIndexedRoot(sourceId);
    if (sourceId.startsWith("browser-device-")) {
      try {
        await mediaRegistry.delete(sourceId.slice("browser-device-".length));
      } catch {
        // The in-memory disconnect still succeeds when browser storage is unavailable.
      }
    }
    return libraryPayload();
  };

  const reconnectSource = async (sourceId) => {
    if (!sourceId.startsWith("browser-device-")) throw new Error("That browser source cannot be reconnected after reload.");
    const recordId = sourceId.slice("browser-device-".length);
    const records = await mediaRegistry.list();
    const record = records.find((item) => item.id === recordId);
    if (!record) throw new Error("That saved browser media permission no longer exists.");
    const pickedKeys = await restoreRecord(record, { requestPermission: true, reconnected: true });
    if (!pickedKeys.length) throw new Error("Browser permission was not granted for that audio source.");
    return libraryPayload({ pickedKeys });
  };

  return {
  onlineApp: true,
  bootstrap: async () => {
    await restorePersistentSources();
    const workspace = readWorkspace(storage);
    const project = workspace.projects.find((item) => item.id === workspace.activeProjectId);
    return {
      state: clone(project.state),
      projects: publicProjects(workspace),
      activeProjectId: workspace.activeProjectId,
      recovery: { required: false },
      nativeAudio: { schemaVersion: 1, configured: false, available: false, reasonCode: "browser-only" },
      supportedFormats: [...new Set(allLibrary().map((file) => file.extension))].sort(),
      ...libraryPayload(),
    };
  },
  nativeAudioStatus: async () => ({ schemaVersion: 1, configured: false, available: false, reasonCode: "browser-only" }),
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
    const id = globalThis.crypto?.randomUUID?.() || `online-${Date.now()}`;
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
  deleteProject: async (projectId) => {
    const workspace = readWorkspace(storage);
    const projectIndex = workspace.projects.findIndex((item) => item.id === projectId);
    if (projectIndex < 0) throw new Error("That browser-saved project does not exist.");
    if (workspace.projects.length <= 1) throw new Error("The final saved project cannot be removed. Start another project first.");
    const removingActiveProject = workspace.activeProjectId === projectId;
    workspace.projects.splice(projectIndex, 1);
    if (removingActiveProject) {
      const nextProject = [...workspace.projects].sort((left, right) => right.updatedAt.localeCompare(left.updatedAt))[0];
      workspace.activeProjectId = nextProject.id;
      nextProject.updatedAt = new Date().toISOString();
    }
    writeWorkspace(storage, workspace);
    const activeProject = workspace.projects.find((item) => item.id === workspace.activeProjectId);
    return { state: clone(activeProject.state), projects: publicProjects(workspace), activeProjectId: workspace.activeProjectId };
  },
  restoreRecovery: onlineCapabilityError,
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
  rescan: async () => {
    let records = [];
    try {
      records = await mediaRegistry.list();
    } catch {
      records = [];
    }
    for (const record of records) await restoreRecord(record);
    return libraryPayload();
  },
  libraryStatus: async () => libraryPayload(),
  portableBundle: onlineCapabilityError,
  registerSource: onlineCapabilityError,
  chooseSources,
  reconnectSource,
  chooseProjectAssets: onlineCapabilityError,
  renderAudio: onlineCapabilityError,
  startRenderJob: onlineCapabilityError,
  getRenderJob: onlineCapabilityError,
  waitForRenderJob: onlineCapabilityError,
  cancelRenderJob: onlineCapabilityError,
  waveform,
  technicalAnalysis: async (key) => {
    if (browserFiles.has(key)) throw new Error("Detailed loudness analysis for device audio requires the local Project Sequencer app.");
    const index = Math.max(0, onlineAppLibrary.findIndex((file) => file.key === key));
    return { key, measurements: { integratedLoudness: -16.4 + index * 0.8, loudnessRange: 5.2 + index * 0.7, truePeak: -2.1 + index * 0.2, dcOffset: 0, silenceBoundaries: [] }, analyzedAt: new Date().toISOString(), cached: false };
  },
  listRenderJobs: async () => ({ jobs: [] }),
  renderManifest: onlineCapabilityError,
  revealRender: onlineCapabilityError,
  addRoot: onlineCapabilityError,
  removeSource: removeBrowserSource,
  removeRoot: removeBrowserSource,
  mediaUrl,
  assetUrl: () => "",
  };
};

export const onlineAppApi = createOnlineAppApi();
