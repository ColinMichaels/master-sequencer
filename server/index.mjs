import { createHash } from "node:crypto";
import { stat } from "node:fs/promises";
import { createServer } from "node:http";
import path from "node:path";
import { createApiRouter } from "./api-router.mjs";
import { scanAudioLibrary, sourceKey } from "./audio-library.mjs";
import { addAudioSource, loadConfig, projectRoot, removeAudioSource } from "./config-store.mjs";
import { BASE_SECURITY_HEADERS, isStateChangingMethod, requestHostIsAllowed, requestOriginIsAllowed } from "./http-utils.mjs";
import { contentTypeFor, sendJson, streamFile } from "./http-response.mjs";
import { chooseAudioPaths, chooseProjectAssetPaths, revealInFinder } from "./native-picker.mjs";
import { createProjectAssetReferences } from "./project-assets.mjs";
import { createRenderJobService } from "./render-job-service.mjs";
import { createStateStore } from "./state-store.mjs";
import { createTechnicalAnalysisService } from "./technical-analysis.mjs";
import { createWaveformService } from "./waveform.mjs";

const development = process.argv.includes("--dev");
const configuredPath = (name, fallback) => process.env[name] ? path.resolve(process.env[name]) : fallback;
const dataRoot = configuredPath("PROJECT_SEQUENCER_DATA_ROOT", path.join(projectRoot, "data"));
const stateStore = createStateStore({
  statePath: configuredPath("PROJECT_SEQUENCER_STATE_PATH", path.join(dataRoot, "sequencer-state.json")),
  seedPath: configuredPath("PROJECT_SEQUENCER_SEED_PATH", path.join(dataRoot, "seed-state.json")),
  recoveryPath: configuredPath("PROJECT_SEQUENCER_RECOVERY_PATH", path.join(dataRoot, "sequencer-state.last-known-good.json")),
});
await stateStore.initialize();

let config = await loadConfig();
let library = { files: [], roots: [] };
let libraryByKey = new Map();
let scanPromise = null;
const outputRoot = configuredPath("PROJECT_SEQUENCER_EXPORTS_PATH", path.join(projectRoot, "exports"));
const waveformService = createWaveformService();
const technicalAnalysisService = createTechnicalAnalysisService();

const publicFile = (file) => ({
  key: file.key,
  id: file.id,
  rootId: file.rootId,
  relativePath: file.relativePath,
  name: file.name,
  extension: file.extension,
  size: file.size,
  modifiedAt: new Date(file.mtimeMs).toISOString(),
  duration: file.duration,
  bitrate: file.bitrate,
  codec: file.codec,
  sampleRate: file.sampleRate,
  channels: file.channels,
  bitDepth: file.bitDepth,
  probeError: file.probeError,
  privateSourceId: file.privateSourceId || "",
});

const createBrowserSafeLibrary = (scanned, aliases = []) => {
  const rawByKey = new Map(scanned.files.map((file) => [file.key, file]));
  const hiddenKeys = new Set();
  const privateFiles = [];
  for (const alias of aliases) {
    if (!alias?.id || !alias?.rootId || !alias?.relativePath) continue;
    const realKey = sourceKey(alias);
    const file = rawByKey.get(realKey);
    if (!file) continue;
    hiddenKeys.add(realKey);
    privateFiles.push({
      ...file,
      key: sourceKey({ privateSourceId: alias.id }),
      id: createHash("sha1").update(`private::${alias.id}`).digest("hex").slice(0, 16),
      name: "[Private source file]",
      relativePath: `[protected]/${alias.id}`,
      privateSourceId: alias.id,
    });
  }
  const files = [...scanned.files.filter((file) => !hiddenKeys.has(file.key)), ...privateFiles];
  files.sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: "base" }));
  return { ...scanned, files };
};

const refreshLibrary = async () => {
  if (scanPromise) return scanPromise;
  scanPromise = (async () => {
    config = await loadConfig();
    const scanned = await scanAudioLibrary({
      roots: config.audioRoots,
      audioFiles: config.audioFiles,
      ignoreDirectories: config.ignoreDirectories,
      cachePath: configuredPath("PROJECT_SEQUENCER_AUDIO_CACHE_PATH", path.join(dataRoot, "audio-index-cache.json")),
      metadataConcurrency: config.metadataConcurrency,
      includeHiddenDirectories: config.includeHiddenDirectories,
    });
    library = createBrowserSafeLibrary(scanned, config.privateSourceAliases);
    libraryByKey = new Map(library.files.map((file) => [file.key, file]));
    return library;
  })().finally(() => {
    scanPromise = null;
  });
  return scanPromise;
};

await refreshLibrary();

const renderJobs = createRenderJobService({
  outputRoot,
  getLibraryFile: (key) => libraryByKey.get(key),
  timeoutMs: Math.max(1_000, Number(config.renderTimeoutMs) || 10 * 60_000),
});
await renderJobs.initialize();

const isWithinOrSame = (parentPath, requestedPath) => {
  const relative = path.relative(parentPath, requestedPath);
  return relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative));
};

const responsePayloadForPaths = async (selectedPaths) => {
  for (const selectedPath of selectedPaths) await addAudioSource({ path: selectedPath });
  const scanned = await refreshLibrary();
  const selectedDetails = await Promise.all(selectedPaths.map(async (selectedPath) => ({
    path: path.resolve(selectedPath),
    directory: (await stat(selectedPath)).isDirectory(),
  })));
  const pickedKeys = scanned.files
    .filter((file) => selectedDetails.some((selected) => selected.directory
      ? isWithinOrSame(selected.path, file.absolutePath)
      : selected.path === file.absolutePath))
    .map((file) => file.key);
  return {
    library: scanned.files.map(publicFile),
    roots: scanned.roots,
    pickedKeys: [...new Set(pickedKeys)],
  };
};

const handleApi = createApiRouter({
  stateStore,
  renderJobs,
  waveformService,
  technicalAnalysisService,
  getLibrary: () => library,
  getLibraryFile: (key) => libraryByKey.get(key),
  getConfig: () => config,
  isScanning: () => Boolean(scanPromise),
  refreshLibrary,
  publicFile,
  responsePayloadForPaths,
  removeAudioSource,
  chooseAudioPaths,
  chooseProjectAssetPaths,
  createProjectAssetReferences,
  revealRenderResult: async (renderId) => {
    const result = renderJobs.result(renderId);
    if (!result?.audioPath) return null;
    await revealInFinder({ filePath: result.audioPath });
    return { revealed: true };
  },
});

let vite;
if (development) {
  const { createServer: createViteServer } = await import("vite");
  vite = await createViteServer({
    root: projectRoot,
    appType: "spa",
    server: { middlewareMode: true },
  });
}

const distRoot = path.join(projectRoot, "dist");
const serveProduction = async (request, response, url) => {
  const requested = url.pathname === "/" ? "/index.html" : url.pathname;
  const candidate = path.resolve(distRoot, `.${requested}`);
  const safeCandidate = candidate.startsWith(`${distRoot}${path.sep}`) ? candidate : path.join(distRoot, "index.html");
  try {
    await streamFile(request, response, safeCandidate, contentTypeFor(safeCandidate));
  } catch {
    await streamFile(request, response, path.join(distRoot, "index.html"), "text/html; charset=utf-8");
  }
};

const server = createServer(async (request, response) => {
  try {
    if (!requestHostIsAllowed(request.headers.host, { configuredHost: config.host, port: config.port })) {
      sendJson(response, 403, { error: "Project Sequencer accepts requests only through its configured local address." });
      return;
    }
    const url = new URL(request.url || "/", `http://${request.headers.host}`);
    if (isStateChangingMethod(request.method) && !requestOriginIsAllowed(request.headers.origin, request.headers.host)) {
      sendJson(response, 403, { error: "Cross-origin changes are not allowed." });
      return;
    }
    if (request.method === "OPTIONS") {
      response.writeHead(204, BASE_SECURITY_HEADERS);
      response.end();
      return;
    }
    if (url.pathname.startsWith("/api/")) {
      if (!(await handleApi(request, response, url))) sendJson(response, 404, { error: "API route not found." });
      return;
    }
    if (development) {
      vite.middlewares(request, response, () => sendJson(response, 404, { error: "Page not found." }));
      return;
    }
    await serveProduction(request, response, url);
  } catch (error) {
    if (!error.statusCode || error.statusCode >= 500) console.error(error);
    if (!response.headersSent) sendJson(response, error.statusCode || 500, { error: error.message || "Unexpected server error." });
    else response.end();
  }
});

server.listen(config.port, config.host, () => {
  console.log(`Project Sequencer ready at http://${config.host}:${config.port}`);
  console.log(`${library.files.length} audio files indexed across ${library.roots.length} configured path${library.roots.length === 1 ? "" : "s"}.`);
});

let shuttingDown = false;
const shutdown = async () => {
  if (shuttingDown) return;
  shuttingDown = true;
  renderJobs.shutdown();
  await vite?.close();
  server.close(() => process.exit(0));
};
process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
