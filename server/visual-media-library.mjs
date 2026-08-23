import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import { opendir, readFile, rename, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";
import { ffprobeExecutable } from "./tool-paths.mjs";

const execFileAsync = promisify(execFile);
const VISUAL_PROBE_CACHE_VERSION = 2;

export const VISUAL_VIDEO_EXTENSIONS = new Set([".mp4", ".mov", ".m4v", ".webm"]);
export const VISUAL_IMAGE_EXTENSIONS = new Set([".png", ".jpg", ".jpeg", ".webp"]);
export const VISUAL_MEDIA_EXTENSIONS = new Set([...VISUAL_VIDEO_EXTENSIONS, ...VISUAL_IMAGE_EXTENSIONS]);

export const visualMediaKey = ({ rootId, relativePath }) =>
  `visual::${rootId}::${relativePath.replaceAll("\\", "/").replaceAll(path.sep, "/")}`;

const readCache = async (cachePath) => {
  try {
    const parsed = JSON.parse(await readFile(cachePath, "utf8"));
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : {};
  } catch (error) {
    if (error.code === "ENOENT" || error instanceof SyntaxError) return {};
    throw error;
  }
};

const writeCache = async (cachePath, cache) => {
  const temporaryPath = `${cachePath}.tmp`;
  await writeFile(temporaryPath, `${JSON.stringify(cache, null, 2)}\n`);
  await rename(temporaryPath, cachePath);
};

const titleCase = (value) => value
  .replace(/\.[^.]+$/, "")
  .split(/[-_]+/)
  .filter(Boolean)
  .map((word) => word.length <= 4 && /^v?\d+$/i.test(word) ? word.toUpperCase() : `${word.charAt(0).toUpperCase()}${word.slice(1)}`)
  .join(" ");

const aspectRatio = (width, height) => {
  if (!width || !height) return "other";
  const ratio = width / height;
  const known = [
    [16 / 9, "16:9"],
    [9 / 16, "9:16"],
    [1, "1:1"],
    [4 / 5, "4:5"],
  ];
  const match = known.find(([target]) => Math.abs(ratio - target) <= 0.035);
  return match?.[1] || "other";
};

const finiteNumber = (value) => Number.isFinite(Number(value)) ? Number(value) : 0;
const compactText = (value, fallback = "") => typeof value === "string" && value.trim() ? value.trim().slice(0, 160) : fallback;

const sanitizeTechnicalMetadata = (technical = {}) => ({
  width: finiteNumber(technical.width),
  height: finiteNumber(technical.height),
  duration: finiteNumber(technical.duration),
  codec: compactText(technical.codec),
  container: compactText(technical.container),
  bitrate: finiteNumber(technical.bitrate),
  frameRate: finiteNumber(technical.frameRate),
  pixelFormat: compactText(technical.pixelFormat),
  audioCodec: compactText(technical.audioCodec),
  audioChannels: finiteNumber(technical.audioChannels),
  audioSampleRate: finiteNumber(technical.audioSampleRate),
  probeError: technical.probeError
    ? /timed?\s*out|timeout/i.test(technical.probeError) ? "Metadata probe timed out." : "Metadata probe failed."
    : "",
});

const rateToNumber = (value) => {
  if (typeof value !== "string") return finiteNumber(value);
  const [numerator, denominator = "1"] = value.split("/").map(Number);
  if (!Number.isFinite(numerator) || !Number.isFinite(denominator) || denominator === 0) return 0;
  return Number((numerator / denominator).toFixed(3));
};

const inferredMetadata = (file, root) => {
  const searchable = `${file.relativePath} ${file.name}`.toLowerCase();
  const aspect = aspectRatio(file.width, file.height);
  let format = file.mediaType === "image" ? "static-post" : "production-clip";
  if (/proof|review/.test(searchable)) format = "review-proof";
  else if (/spotify|canvas/.test(searchable)) format = "spotify-canvas";
  else if (/youtube|full[-_ ]?song|master/.test(searchable) && aspect === "16:9") format = "youtube-master";
  else if (/reel|short|tiktok|vertical/.test(searchable) || (file.mediaType === "video" && aspect === "9:16")) format = "reel";
  else if (/feed[-_ ]?square|square/.test(searchable) || aspect === "1:1") format = "feed-square";
  else if (/campaign|promo/.test(searchable)) format = "campaign-promo";

  let platform = "General";
  if (/youtube/.test(searchable) || format === "youtube-master") platform = "YouTube";
  else if (/spotify|canvas/.test(searchable)) platform = "Spotify";
  else if (/tiktok/.test(searchable)) platform = "TikTok";
  else if (/reel|short/.test(searchable)) platform = "Reels + Shorts";
  else if (/instagram|feed|square/.test(searchable)) platform = "Instagram";
  else if (/facebook/.test(searchable)) platform = "Facebook";
  else if (/website|web[-_ ]?site/.test(searchable)) platform = "Website";
  else if (/proof|review/.test(searchable)) platform = "Review";
  else if (/production|higgsfield|clip|source/.test(searchable)) platform = "Production";

  let readiness = "Alternate";
  if (/proof|review/.test(searchable)) readiness = "Review";
  else if (/production|exploration|clip|source/.test(searchable)) readiness = "Production clip";
  else if (/final|master|ready|current|feed-ready/.test(searchable)) readiness = "Ready to post";

  const segments = file.relativePath.split("/");
  const defaultMetadata = {
    displayTitle: titleCase(file.name),
    albumId: "",
    trackId: "",
    format,
    platform,
    readiness,
    collection: root.collection || root.label || segments.at(-2) || "Visual media",
    subjects: [],
    tags: [],
    notes: "",
  };
  const configured = { ...(root.defaults || {}) };
  for (const rule of root.pathRules || []) {
    if (typeof rule?.includes === "string" && searchable.includes(rule.includes.toLowerCase())) Object.assign(configured, rule.metadata || {});
  }
  return { ...defaultMetadata, ...configured };
};

export const probeVisualMedia = async (file, { timeoutMs = 10_000 } = {}) => {
  try {
    const { stdout } = await execFileAsync(ffprobeExecutable(), [
      "-v", "error",
      "-show_entries", "format=duration,format_name,bit_rate:stream=codec_type,codec_name,width,height,avg_frame_rate,pix_fmt,sample_rate,channels,bit_rate",
      "-of", "json",
      file.absolutePath,
    ], { maxBuffer: 2 * 1024 * 1024, timeout: timeoutMs, killSignal: "SIGKILL" });
    const parsed = JSON.parse(stdout);
    const videoStream = parsed.streams?.find((stream) => stream.codec_type === "video") || {};
    const audioStream = parsed.streams?.find((stream) => stream.codec_type === "audio") || {};
    return {
      width: Number(videoStream.width || 0),
      height: Number(videoStream.height || 0),
      duration: file.mediaType === "video" ? Number(parsed.format?.duration || 0) : 0,
      codec: videoStream.codec_name || file.extension,
      container: parsed.format?.format_name || file.extension,
      bitrate: Number(parsed.format?.bit_rate || videoStream.bit_rate || 0),
      frameRate: file.mediaType === "video" ? rateToNumber(videoStream.avg_frame_rate) : 0,
      pixelFormat: videoStream.pix_fmt || "",
      audioCodec: audioStream.codec_name || "",
      audioChannels: Number(audioStream.channels || 0),
      audioSampleRate: Number(audioStream.sample_rate || 0),
      probeError: "",
    };
  } catch (error) {
    return {
      width: 0,
      height: 0,
      duration: 0,
      codec: file.extension,
      container: file.extension,
      bitrate: 0,
      frameRate: 0,
      pixelFormat: "",
      audioCodec: "",
      audioChannels: 0,
      audioSampleRate: 0,
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

const addDiscoveredFile = async ({ absolutePath, root, files, seenAbsolutePaths }) => {
  const extensionWithDot = path.extname(absolutePath).toLowerCase();
  if (!VISUAL_MEDIA_EXTENSIONS.has(extensionWithDot)) return;
  const mediaType = VISUAL_VIDEO_EXTENSIONS.has(extensionWithDot) ? "video" : "image";
  if (Array.isArray(root.mediaTypes) && root.mediaTypes.length && !root.mediaTypes.includes(mediaType)) return;
  const resolvedPath = path.resolve(absolutePath);
  if (seenAbsolutePaths.has(resolvedPath)) return;
  const fileStat = await stat(resolvedPath);
  if (!fileStat.isFile()) return;
  seenAbsolutePaths.add(resolvedPath);
  const relativePath = path.relative(root.path, resolvedPath).split(path.sep).join("/");
  files.push({
    key: visualMediaKey({ rootId: root.id, relativePath }),
    rootId: root.id,
    relativePath,
    absolutePath: resolvedPath,
    name: path.basename(resolvedPath),
    extension: extensionWithDot.slice(1),
    mediaType,
    size: fileStat.size,
    mtimeMs: fileStat.mtimeMs,
    birthtimeMs: fileStat.birthtimeMs > 0 ? fileStat.birthtimeMs : 0,
  });
};

const walk = async ({ directory, root, ignoreDirectories, files, seenAbsolutePaths, includeHiddenDirectories }) => {
  const entries = await opendir(directory);
  for await (const entry of entries) {
    if (entry.isSymbolicLink()) continue;
    if (!includeHiddenDirectories && entry.name.startsWith(".")) continue;
    const absolutePath = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      if (!ignoreDirectories.has(entry.name)) await walk({ directory: absolutePath, root, ignoreDirectories, files, seenAbsolutePaths, includeHiddenDirectories });
      continue;
    }
    if (entry.isFile()) await addDiscoveredFile({ absolutePath, root, files, seenAbsolutePaths });
  }
};

export const scanVisualMediaLibrary = async ({
  roots = [],
  ignoreDirectories = [],
  cachePath,
  metadataConcurrency = 4,
  includeHiddenDirectories = false,
  probe = probeVisualMedia,
}) => {
  const files = [];
  const connectedRoots = [];
  const seenAbsolutePaths = new Set();
  for (const root of roots) {
    try {
      const rootStat = await stat(root.path);
      if (!rootStat.isDirectory()) throw new Error("Not a directory");
      connectedRoots.push({ ...root, connected: true });
      await walk({ directory: root.path, root, ignoreDirectories: new Set(ignoreDirectories), files, seenAbsolutePaths, includeHiddenDirectories });
    } catch (error) {
      connectedRoots.push({ ...root, connected: false, error: error.message });
    }
  }

  const cache = await readCache(cachePath);
  const nextCache = {};
  let reusedMetadata = 0;
  let probedMetadata = 0;
  const indexedAt = new Date().toISOString();
  const enriched = await mapLimit(files, metadataConcurrency, async (file) => {
    const fingerprint = `${VISUAL_PROBE_CACHE_VERSION}:${file.size}:${Math.round(file.mtimeMs)}`;
    const cached = cache[file.key];
    const cacheHit = cached?.fingerprint === fingerprint;
    if (cacheHit) reusedMetadata += 1;
    else probedMetadata += 1;
    const technical = sanitizeTechnicalMetadata(cacheHit ? cached.technical : await probe(file));
    const cachedFirstIndexedAt = typeof cached?.firstIndexedAt === "string" ? Date.parse(cached.firstIndexedAt) : Number.NaN;
    const firstIndexedAt = Number.isFinite(cachedFirstIndexedAt) ? new Date(cachedFirstIndexedAt).toISOString() : indexedAt;
    nextCache[file.key] = { fingerprint, firstIndexedAt, technical };
    const item = {
      ...file,
      id: createHash("sha1").update(file.key).digest("hex").slice(0, 16),
      firstIndexedAt,
      ...technical,
    };
    item.aspect = aspectRatio(item.width, item.height);
    item.inferredMetadata = inferredMetadata(item, rootForFile(roots, item.rootId));
    return item;
  });
  await writeCache(cachePath, nextCache);
  enriched.sort((left, right) => right.mtimeMs - left.mtimeMs || left.name.localeCompare(right.name, undefined, { numeric: true, sensitivity: "base" }));
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

const rootForFile = (roots, rootId) => roots.find((root) => root.id === rootId) || { id: rootId, label: rootId };
