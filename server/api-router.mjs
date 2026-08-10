import { realpath } from "node:fs/promises";
import path from "node:path";
import { readJsonBody, sendJson, streamFile, contentTypeFor } from "./http-response.mjs";
import { LYRIC_EXTENSIONS, VISUAL_EXTENSIONS } from "./project-assets.mjs";

const isWithinRoot = (rootPath, requestedPath) => {
  const relative = path.relative(rootPath, requestedPath);
  return relative && !relative.startsWith("..") && !path.isAbsolute(relative);
};

const resultPayload = (result) => result ? {
  id: result.id,
  scope: result.scope,
  format: result.format,
  audioName: result.audioName,
  size: result.size,
  createdAt: result.createdAt,
  outputDirectory: result.outputDirectory,
  warnings: result.warnings,
  recovered: Boolean(result.recovered),
  derivativeLabel: result.derivativeLabel || "",
  audioUrl: `/api/renders/file?id=${encodeURIComponent(result.id)}&kind=audio`,
  cueUrl: result.cuePath ? `/api/renders/file?id=${encodeURIComponent(result.id)}&kind=cue` : "",
  manifestUrl: result.manifestPath ? `/api/renders/file?id=${encodeURIComponent(result.id)}&kind=manifest` : "",
} : null;

const jobPayload = (job) => job ? { ...job, result: resultPayload(job.result) } : null;

export const createApiRouter = ({
  stateStore,
  renderJobs,
  waveformService,
  technicalAnalysisService,
  getLibrary,
  getLibraryFile,
  getConfig,
  isScanning,
  getWatchStatus,
  refreshLibrary,
  publicFile,
  responsePayloadForPaths,
  removeAudioSource,
  chooseAudioPaths,
  chooseProjectAssetPaths,
  createProjectAssetReferences,
  revealRenderResult,
  createPortableBundle,
}) => async (request, response, url) => {
  const library = getLibrary();
  if (request.method === "GET" && url.pathname === "/api/health") {
    sendJson(response, 200, { ok: true, audioFiles: library.files.length, scanning: isScanning() });
    return true;
  }
  if (request.method === "GET" && url.pathname === "/api/bootstrap") {
    sendJson(response, 200, {
      state: await stateStore.read(),
      projects: stateStore.listProjects(),
      activeProjectId: stateStore.activeProjectId(),
      recovery: stateStore.recoveryStatus(),
      library: library.files.map(publicFile),
      roots: library.roots,
      supportedFormats: [...new Set(library.files.map((file) => file.extension))].sort(),
      scanning: isScanning(),
      scan: library.scan,
      watching: getWatchStatus(),
      dataFiles: {
        state: "data/sequencer-state.json",
        recovery: "data/sequencer-state.last-known-good.json",
        projects: "data/projects/",
        projectIndex: "data/sequencer-projects.json",
        audioCache: "data/audio-index-cache.json",
        localConfig: "config/sequencer.local.json",
      },
    });
    return true;
  }
  if (request.method === "GET" && url.pathname === "/api/library") {
    sendJson(response, 200, {
      library: library.files.map(publicFile),
      roots: library.roots,
      scan: library.scan,
      watching: getWatchStatus(),
      scanning: isScanning(),
    });
    return true;
  }
  if (request.method === "GET" && url.pathname === "/api/project-bundle") {
    sendJson(response, 200, await createPortableBundle());
    return true;
  }
  if (["PUT", "POST"].includes(request.method) && url.pathname === "/api/state") {
    sendJson(response, 200, {
      state: await stateStore.write(await readJsonBody(request)),
      projects: stateStore.listProjects(),
      activeProjectId: stateStore.activeProjectId(),
    });
    return true;
  }
  if (request.method === "POST" && url.pathname === "/api/state/recovery/restore") {
    sendJson(response, 200, await stateStore.restoreRecovery());
    return true;
  }
  if (request.method === "GET" && url.pathname === "/api/projects") {
    sendJson(response, 200, { projects: stateStore.listProjects(), activeProjectId: stateStore.activeProjectId() });
    return true;
  }
  if (request.method === "POST" && url.pathname === "/api/projects") {
    sendJson(response, 201, await stateStore.createProject(await readJsonBody(request)));
    return true;
  }
  if (request.method === "POST" && url.pathname.startsWith("/api/projects/") && url.pathname.endsWith("/load")) {
    const projectId = decodeURIComponent(url.pathname.slice("/api/projects/".length, -"/load".length));
    sendJson(response, 200, await stateStore.loadProject(projectId));
    return true;
  }
  if (request.method === "POST" && url.pathname === "/api/rescan") {
    const scanned = await refreshLibrary();
    sendJson(response, 200, { library: scanned.files.map(publicFile), roots: scanned.roots, scan: scanned.scan, watching: getWatchStatus() });
    return true;
  }
  if (request.method === "POST" && url.pathname === "/api/sources/register") {
    const { path: selectedPath } = await readJsonBody(request);
    sendJson(response, 201, await responsePayloadForPaths([selectedPath]));
    return true;
  }
  if (request.method === "POST" && url.pathname === "/api/sources/pick") {
    const { kind } = await readJsonBody(request);
    const selectedPaths = await chooseAudioPaths({ kind });
    if (!selectedPaths.length) {
      sendJson(response, 200, { cancelled: true, library: library.files.map(publicFile), roots: library.roots, pickedKeys: [] });
      return true;
    }
    sendJson(response, 201, await responsePayloadForPaths(selectedPaths));
    return true;
  }
  if (request.method === "POST" && url.pathname === "/api/project-assets/pick") {
    const { kind } = await readJsonBody(request);
    const selectedPaths = await chooseProjectAssetPaths({ kind });
    if (!selectedPaths.length) {
      sendJson(response, 200, { cancelled: true, assets: [] });
      return true;
    }
    const assets = await createProjectAssetReferences({ selectedPaths, roots: getConfig().audioRoots, kind });
    sendJson(response, 201, { cancelled: false, assets });
    return true;
  }
  if (request.method === "POST" && url.pathname === "/api/renders") {
    const job = renderJobs.create(await readJsonBody(request));
    sendJson(response, 202, { job: jobPayload(job) });
    return true;
  }
  if (request.method === "GET" && url.pathname === "/api/render-jobs") {
    sendJson(response, 200, { jobs: renderJobs.list().map(jobPayload) });
    return true;
  }
  if (url.pathname.startsWith("/api/render-jobs/")) {
    const jobId = decodeURIComponent(url.pathname.slice("/api/render-jobs/".length));
    const job = request.method === "DELETE" ? renderJobs.cancel(jobId) : request.method === "GET" ? renderJobs.get(jobId) : null;
    if (!job) {
      sendJson(response, 404, { error: "Render job not found." });
      return true;
    }
    sendJson(response, request.method === "DELETE" ? 202 : 200, { job: jobPayload(job) });
    return true;
  }
  if (["GET", "HEAD"].includes(request.method) && url.pathname === "/api/renders/file") {
    const result = renderJobs.result(url.searchParams.get("id"));
    const kind = url.searchParams.get("kind");
    const renderPath = kind === "audio" ? result?.audioPath : kind === "cue" ? result?.cuePath : kind === "manifest" ? result?.manifestPath : "";
    if (!result || !renderPath) {
      sendJson(response, 404, { error: "That rendered file is not available." });
      return true;
    }
    await streamFile(request, response, renderPath, contentTypeFor(renderPath));
    return true;
  }
  if (request.method === "POST" && url.pathname === "/api/renders/reveal") {
    const { id } = await readJsonBody(request);
    const result = await revealRenderResult(id);
    if (!result) {
      sendJson(response, 404, { error: "That completed render is not available." });
      return true;
    }
    sendJson(response, 200, result);
    return true;
  }
  if (request.method === "POST" && url.pathname === "/api/roots") {
    const details = await readJsonBody(request);
    const payload = await responsePayloadForPaths([details.path]);
    sendJson(response, 201, payload);
    return true;
  }
  if (request.method === "DELETE" && (url.pathname.startsWith("/api/sources/") || url.pathname.startsWith("/api/roots/"))) {
    const prefix = url.pathname.startsWith("/api/sources/") ? "/api/sources/" : "/api/roots/";
    const sourceId = decodeURIComponent(url.pathname.slice(prefix.length));
    await removeAudioSource(sourceId);
    const scanned = await refreshLibrary();
    sendJson(response, 200, { library: scanned.files.map(publicFile), roots: scanned.roots, scan: scanned.scan, watching: getWatchStatus() });
    return true;
  }
  if (request.method === "GET" && url.pathname === "/api/waveform") {
    const file = getLibraryFile(url.searchParams.get("key"));
    if (!file) {
      sendJson(response, 404, { error: "Audio file is not in a configured library path." });
      return true;
    }
    try {
      sendJson(response, 200, await waveformService.get(file, url.searchParams.get("points")));
    } catch (error) {
      console.error(`Waveform analysis failed for indexed key ${file.key}:`, error);
      sendJson(response, 422, { error: "A waveform could not be generated for this audio source." });
    }
    return true;
  }
  if (request.method === "GET" && url.pathname === "/api/analysis") {
    const file = getLibraryFile(url.searchParams.get("key"));
    if (!file) {
      sendJson(response, 404, { error: "Audio file is not in a configured library path." });
      return true;
    }
    try {
      sendJson(response, 200, await technicalAnalysisService.get(file));
    } catch (error) {
      console.error(`Technical analysis failed for indexed key ${file.key}:`, error);
      sendJson(response, 422, { error: "Technical measurements could not be generated for this source." });
    }
    return true;
  }
  if (["GET", "HEAD"].includes(request.method) && url.pathname === "/api/media") {
    const file = getLibraryFile(url.searchParams.get("key"));
    if (!file) {
      sendJson(response, 404, { error: "Audio file is not in a configured library path." });
      return true;
    }
    await streamFile(request, response, file.absolutePath, contentTypeFor(file.absolutePath));
    return true;
  }
  if (["GET", "HEAD"].includes(request.method) && url.pathname === "/api/asset") {
    const root = getConfig().audioRoots.find((item) => item.id === url.searchParams.get("rootId"));
    const relativePath = url.searchParams.get("path") || "";
    const requestedPath = root ? path.resolve(root.path, relativePath) : "";
    const extension = path.extname(requestedPath).toLowerCase();
    if (!root || !isWithinRoot(root.path, requestedPath) || (!VISUAL_EXTENSIONS.has(extension) && !LYRIC_EXTENSIONS.has(extension))) {
      sendJson(response, 404, { error: "Asset is not available from a configured library path." });
      return true;
    }
    let safePath = "";
    try {
      const [realRoot, realRequestedPath] = await Promise.all([realpath(root.path), realpath(requestedPath)]);
      if (isWithinRoot(realRoot, realRequestedPath)) safePath = realRequestedPath;
    } catch {
      // Missing and escaped symlink targets are both unavailable.
    }
    if (!safePath) {
      sendJson(response, 404, { error: "Asset is not available from a configured library path." });
      return true;
    }
    const assetHeaders = extension === ".svg"
      ? { "Content-Security-Policy": "sandbox; default-src 'none'; style-src 'unsafe-inline'" }
      : {};
    await streamFile(request, response, safePath, contentTypeFor(safePath), assetHeaders);
    return true;
  }
  return false;
};
