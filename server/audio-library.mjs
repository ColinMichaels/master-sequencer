import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import { opendir, readFile, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
export const AUDIO_EXTENSIONS = new Set([".mp3", ".wav", ".flac", ".aiff", ".aif", ".m4a", ".aac", ".ogg", ".opus"]);

export const sourceKey = ({ rootId, relativePath, privateSourceId }) => privateSourceId
  ? `private::${privateSourceId}`
  : `${rootId}::${relativePath.replaceAll("\\", "/").replaceAll(path.sep, "/")}`;

const readCache = async (cachePath) => {
  try {
    return JSON.parse(await readFile(cachePath, "utf8"));
  } catch (error) {
    if (error.code === "ENOENT") return {};
    throw error;
  }
};

const addDiscoveredFile = async ({ absolutePath, rootPath, rootId, files, seenAbsolutePaths }) => {
  const extension = path.extname(absolutePath).toLowerCase();
  if (!AUDIO_EXTENSIONS.has(extension)) return;
  const resolvedPath = path.resolve(absolutePath);
  if (seenAbsolutePaths.has(resolvedPath)) return;
  const fileStat = await stat(resolvedPath);
  if (!fileStat.isFile()) return;
  seenAbsolutePaths.add(resolvedPath);
  const relativePath = path.relative(rootPath, resolvedPath).split(path.sep).join("/") || path.basename(resolvedPath);
  files.push({
    key: sourceKey({ rootId, relativePath }),
    rootId,
    relativePath,
    absolutePath: resolvedPath,
    name: path.basename(resolvedPath),
    extension: extension.slice(1),
    size: fileStat.size,
    mtimeMs: fileStat.mtimeMs,
  });
};

const walk = async (directory, rootPath, rootId, ignoreDirectories, files, seenAbsolutePaths, includeHiddenDirectories) => {
  const entries = await opendir(directory);
  for await (const entry of entries) {
    if (!includeHiddenDirectories && entry.name.startsWith(".") && entry.name !== ".audio") {
      if (entry.isDirectory()) continue;
    }
    const absolutePath = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      if (!ignoreDirectories.has(entry.name)) await walk(absolutePath, rootPath, rootId, ignoreDirectories, files, seenAbsolutePaths, includeHiddenDirectories);
      continue;
    }
    if (!entry.isFile()) continue;
    await addDiscoveredFile({ absolutePath, rootPath, rootId, files, seenAbsolutePaths });
  }
};

const probeAudio = async (file) => {
  try {
    const { stdout } = await execFileAsync("ffprobe", [
      "-v", "error",
      "-show_entries", "format=duration,bit_rate:stream=codec_name,sample_rate,channels,bits_per_sample",
      "-of", "json",
      file.absolutePath,
    ], { maxBuffer: 2 * 1024 * 1024 });
    const parsed = JSON.parse(stdout);
    const stream = parsed.streams?.find((item) => item.codec_name) || {};
    return {
      duration: Number(parsed.format?.duration || 0),
      bitrate: Number(parsed.format?.bit_rate || 0),
      codec: stream.codec_name || file.extension,
      sampleRate: Number(stream.sample_rate || 0),
      channels: Number(stream.channels || 0),
      bitDepth: Number(stream.bits_per_sample || 0),
      probeError: "",
    };
  } catch (error) {
    return {
      duration: 0,
      bitrate: 0,
      codec: file.extension,
      sampleRate: 0,
      channels: 0,
      bitDepth: 0,
      probeError: error.message,
    };
  }
};

const mapLimit = async (items, limit, worker) => {
  const results = new Array(items.length);
  let cursor = 0;
  const workers = Array.from({ length: Math.max(1, Math.min(limit, items.length || 1)) }, async () => {
    while (cursor < items.length) {
      const index = cursor++;
      results[index] = await worker(items[index], index);
    }
  });
  await Promise.all(workers);
  return results;
};

export const scanAudioLibrary = async ({ roots, audioFiles = [], ignoreDirectories = [], cachePath, metadataConcurrency = 4, includeHiddenDirectories = false }) => {
  const files = [];
  const connectedRoots = [];
  const seenAbsolutePaths = new Set();
  for (const root of roots) {
    try {
      const rootStat = await stat(root.path);
      if (!rootStat.isDirectory()) throw new Error("Not a directory");
      connectedRoots.push({ ...root, kind: "folder", connected: true });
      await walk(root.path, root.path, root.id, new Set(ignoreDirectories), files, seenAbsolutePaths, includeHiddenDirectories);
    } catch (error) {
      connectedRoots.push({ ...root, kind: "folder", connected: false, error: error.message });
    }
  }
  for (const audioFile of audioFiles) {
    try {
      const fileStat = await stat(audioFile.path);
      if (!fileStat.isFile()) throw new Error("Not a file");
      connectedRoots.push({ ...audioFile, kind: "file", connected: true });
      await addDiscoveredFile({
        absolutePath: audioFile.path,
        rootPath: path.dirname(audioFile.path),
        rootId: audioFile.id,
        files,
        seenAbsolutePaths,
      });
    } catch (error) {
      connectedRoots.push({ ...audioFile, kind: "file", connected: false, error: error.message });
    }
  }

  const cache = await readCache(cachePath);
  const nextCache = {};
  let reusedMetadata = 0;
  let probedMetadata = 0;
  const enriched = await mapLimit(files, metadataConcurrency, async (file) => {
    const fingerprint = `${file.size}:${Math.round(file.mtimeMs)}`;
    const cached = cache[file.key];
    const cacheHit = cached?.fingerprint === fingerprint;
    if (cacheHit) reusedMetadata += 1;
    else probedMetadata += 1;
    const metadata = cacheHit ? cached.metadata : await probeAudio(file);
    nextCache[file.key] = { fingerprint, metadata };
    return {
      ...file,
      id: createHash("sha1").update(file.key).digest("hex").slice(0, 16),
      ...metadata,
    };
  });
  await writeFile(cachePath, `${JSON.stringify(nextCache, null, 2)}\n`);
  enriched.sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: "base" }));
  return {
    files: enriched,
    roots: connectedRoots,
    scan: {
      mode: "incremental",
      discoveredFiles: enriched.length,
      reusedMetadata,
      probedMetadata,
      completedAt: new Date().toISOString(),
    },
  };
};
