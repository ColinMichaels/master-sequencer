import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import { realpath, stat } from "node:fs/promises";
import { createServer } from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { scanAudioLibrary, sourceKey } from "./audio-library.mjs";
import { renderAudio } from "./audio-renderer.mjs";
import { addAudioSource, loadConfig, projectRoot, removeAudioSource } from "./config-store.mjs";
import { BASE_SECURITY_HEADERS, isStateChangingMethod, parseByteRange, requestHostIsAllowed, requestOriginIsAllowed } from "./http-utils.mjs";
import { chooseAudioPaths, chooseProjectAssetPaths } from "./native-picker.mjs";
import { createProjectAssetReferences, LYRIC_EXTENSIONS, VISUAL_EXTENSIONS } from "./project-assets.mjs";
import { createStateStore } from "./state-store.mjs";
import { createWaveformService } from "./waveform.mjs";

const development = process.argv.includes("--dev");
const dataRoot = path.join(projectRoot, "data");
const stateStore = createStateStore({
  statePath: path.join(dataRoot, "sequencer-state.json"),
  seedPath: path.join(dataRoot, "seed-state.json"),
});
await stateStore.initialize();

let config = await loadConfig();
let library = { files: [], roots: [] };
let libraryByKey = new Map();
let scanPromise = null;
const renderRegistry = new Map();
const outputRoot = path.join(projectRoot, "exports");
const waveformService = createWaveformService();

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
      cachePath: path.join(dataRoot, "audio-index-cache.json"),
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

const sendJson = (response, statusCode, value) => {
  const body = JSON.stringify(value);
  response.writeHead(statusCode, {
    ...BASE_SECURITY_HEADERS,
    "Content-Type": "application/json; charset=utf-8",
    "Content-Length": Buffer.byteLength(body),
    "Cache-Control": "no-store",
  });
  response.end(body);
};

const readJsonBody = async (request) => {
  let body = "";
  for await (const chunk of request) {
    body += chunk;
    if (body.length > 5_000_000) throw new Error("Request body is too large.");
  }
  return body ? JSON.parse(body) : {};
};

const isWithinRoot = (rootPath, requestedPath) => {
  const relative = path.relative(rootPath, requestedPath);
  return relative && !relative.startsWith("..") && !path.isAbsolute(relative);
};

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

const contentTypes = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".avif": "image/avif",
  ".svg": "image/svg+xml",
  ".mp3": "audio/mpeg",
  ".wav": "audio/wav",
  ".flac": "audio/flac",
  ".aiff": "audio/aiff",
  ".aif": "audio/aiff",
  ".m4a": "audio/mp4",
  ".aac": "audio/aac",
  ".ogg": "audio/ogg",
  ".opus": "audio/ogg",
  ".md": "text/markdown; charset=utf-8",
  ".txt": "text/plain; charset=utf-8",
};

const pipeFile = (response, filePath, options) => {
  const stream = createReadStream(filePath, options);
  stream.on("error", (error) => response.destroy(error));
  stream.pipe(response);
};

const streamFile = async (request, response, filePath, contentType, extraHeaders = {}) => {
  const file = await stat(filePath);
  const range = parseByteRange(request.headers.range, file.size);
  if (range) {
    if (!range.satisfiable) {
      response.writeHead(416, { ...BASE_SECURITY_HEADERS, ...extraHeaders, "Content-Range": `bytes */${file.size}` });
      response.end();
      return;
    }
    response.writeHead(206, {
      ...BASE_SECURITY_HEADERS,
      ...extraHeaders,
      "Accept-Ranges": "bytes",
      "Content-Length": range.end - range.start + 1,
      "Content-Range": `bytes ${range.start}-${range.end}/${file.size}`,
      "Content-Type": contentType,
      "Cache-Control": "no-store",
    });
    if (request.method === "HEAD") response.end();
    else pipeFile(response, filePath, { start: range.start, end: range.end });
    return;
  }
  response.writeHead(200, {
    ...BASE_SECURITY_HEADERS,
    ...extraHeaders,
    "Accept-Ranges": "bytes",
    "Content-Length": file.size,
    "Content-Type": contentType,
    "Cache-Control": "no-store",
  });
  if (request.method === "HEAD") response.end();
  else pipeFile(response, filePath);
};

const handleApi = async (request, response, url) => {
  if (request.method === "GET" && url.pathname === "/api/health") {
    sendJson(response, 200, { ok: true, audioFiles: library.files.length, scanning: Boolean(scanPromise) });
    return true;
  }
  if (request.method === "GET" && url.pathname === "/api/bootstrap") {
    sendJson(response, 200, {
      state: await stateStore.read(),
      library: library.files.map(publicFile),
      roots: library.roots,
      supportedFormats: [...new Set(library.files.map((file) => file.extension))].sort(),
      scanning: Boolean(scanPromise),
      dataFiles: {
        state: "data/sequencer-state.json",
        audioCache: "data/audio-index-cache.json",
        localConfig: "config/sequencer.local.json",
      },
    });
    return true;
  }
  if (["PUT", "POST"].includes(request.method) && url.pathname === "/api/state") {
    sendJson(response, 200, { state: await stateStore.write(await readJsonBody(request)) });
    return true;
  }
  if (request.method === "POST" && url.pathname === "/api/rescan") {
    const scanned = await refreshLibrary();
    sendJson(response, 200, { library: scanned.files.map(publicFile), roots: scanned.roots });
    return true;
  }
  if (request.method === "POST" && url.pathname === "/api/sources/register") {
    const { path: selectedPath } = await readJsonBody(request);
    const payload = await responsePayloadForPaths([selectedPath]);
    sendJson(response, 201, payload);
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
    const assets = await createProjectAssetReferences({ selectedPaths, roots: config.audioRoots, kind });
    sendJson(response, 201, { cancelled: false, assets });
    return true;
  }
  if (request.method === "POST" && url.pathname === "/api/renders") {
    const details = await readJsonBody(request);
    const result = await renderAudio({
      album: details.album,
      scope: details.scope,
      trackId: details.trackId,
      format: details.format,
      previewPart: details.previewPart,
      getLibraryFile: (key) => libraryByKey.get(key),
      outputRoot,
    });
    renderRegistry.set(result.id, result);
    sendJson(response, 201, {
      id: result.id,
      scope: result.scope,
      format: result.format,
      audioName: result.audioName,
      size: result.size,
      createdAt: result.createdAt,
      outputDirectory: result.outputDirectory,
      warnings: result.warnings,
      audioUrl: `/api/renders/file?id=${encodeURIComponent(result.id)}&kind=audio`,
      cueUrl: result.cuePath ? `/api/renders/file?id=${encodeURIComponent(result.id)}&kind=cue` : "",
      manifestUrl: result.manifestPath ? `/api/renders/file?id=${encodeURIComponent(result.id)}&kind=manifest` : "",
    });
    return true;
  }
  if (["GET", "HEAD"].includes(request.method) && url.pathname === "/api/renders/file") {
    const result = renderRegistry.get(url.searchParams.get("id"));
    const kind = url.searchParams.get("kind");
    const renderPath = kind === "audio" ? result?.audioPath : kind === "cue" ? result?.cuePath : kind === "manifest" ? result?.manifestPath : "";
    if (!result || !renderPath) {
      sendJson(response, 404, { error: "That rendered file is not available in this session." });
      return true;
    }
    await streamFile(request, response, renderPath, contentTypes[path.extname(renderPath).toLowerCase()] || "application/octet-stream");
    return true;
  }
  if (request.method === "POST" && url.pathname === "/api/roots") {
    const details = await readJsonBody(request);
    const result = await addAudioSource(details);
    const payload = await responsePayloadForPaths([details.path]);
    sendJson(response, 201, { source: result.source, ...payload });
    return true;
  }
  if (request.method === "DELETE" && (url.pathname.startsWith("/api/sources/") || url.pathname.startsWith("/api/roots/"))) {
    const prefix = url.pathname.startsWith("/api/sources/") ? "/api/sources/" : "/api/roots/";
    const sourceId = decodeURIComponent(url.pathname.slice(prefix.length));
    await removeAudioSource(sourceId);
    const scanned = await refreshLibrary();
    sendJson(response, 200, { library: scanned.files.map(publicFile), roots: scanned.roots });
    return true;
  }
  if (request.method === "GET" && url.pathname === "/api/waveform") {
    const file = libraryByKey.get(url.searchParams.get("key"));
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
  if (["GET", "HEAD"].includes(request.method) && url.pathname === "/api/media") {
    const file = libraryByKey.get(url.searchParams.get("key"));
    if (!file) {
      sendJson(response, 404, { error: "Audio file is not in a configured library path." });
      return true;
    }
    await streamFile(request, response, file.absolutePath, contentTypes[path.extname(file.absolutePath).toLowerCase()] || "application/octet-stream");
    return true;
  }
  if (["GET", "HEAD"].includes(request.method) && url.pathname === "/api/asset") {
    const root = config.audioRoots.find((item) => item.id === url.searchParams.get("rootId"));
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
    await streamFile(request, response, safePath, contentTypes[extension], assetHeaders);
    return true;
  }
  return false;
};

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
    await streamFile(request, response, safeCandidate, contentTypes[path.extname(safeCandidate).toLowerCase()] || "application/octet-stream");
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
    console.error(error);
    if (!response.headersSent) sendJson(response, error.statusCode || 500, { error: error.message || "Unexpected server error." });
    else response.end();
  }
});

server.listen(config.port, config.host, () => {
  console.log(`Project Sequencer ready at http://${config.host}:${config.port}`);
  console.log(`${library.files.length} audio files indexed across ${library.roots.length} configured path${library.roots.length === 1 ? "" : "s"}.`);
});

const shutdown = async () => {
  await vite?.close();
  server.close(() => process.exit(0));
};
process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
