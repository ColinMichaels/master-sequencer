import { access, readFile, rename, stat, writeFile } from "node:fs/promises";
import { constants } from "node:fs";
import { homedir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const configuredPath = (name, fallback) => process.env[name] ? path.resolve(process.env[name]) : fallback;
const baseConfigPath = configuredPath("PROJECT_SEQUENCER_CONFIG_PATH", path.join(projectRoot, "config", "sequencer.config.json"));
const localConfigPath = configuredPath("PROJECT_SEQUENCER_LOCAL_CONFIG_PATH", path.join(projectRoot, "config", "sequencer.local.json"));
const AUDIO_EXTENSIONS = new Set([".mp3", ".wav", ".flac", ".aiff", ".aif", ".m4a", ".aac", ".ogg", ".opus"]);
let configMutationQueue = Promise.resolve();

const withConfigMutation = (mutation) => {
  const operation = configMutationQueue.catch(() => {}).then(mutation);
  configMutationQueue = operation.catch(() => {});
  return operation;
};

const expandPath = (value) => {
  const expanded = value.startsWith("~/") ? path.join(homedir(), value.slice(2)) : value;
  return path.resolve(expanded);
};

const readJson = async (filePath, fallback = {}) => {
  try {
    return JSON.parse(await readFile(filePath, "utf8"));
  } catch (error) {
    if (error.code === "ENOENT") return fallback;
    throw error;
  }
};

const slugify = (value) => value
  .toLowerCase()
  .replace(/[^a-z0-9]+/g, "-")
  .replace(/^-|-$/g, "") || "audio-root";

const writeLocalConfig = async (config) => {
  const temporaryPath = `${localConfigPath}.tmp`;
  await writeFile(temporaryPath, `${JSON.stringify(config, null, 2)}\n`);
  await rename(temporaryPath, localConfigPath);
};

export const isPathInside = (parentPath, candidatePath) => {
  const relative = path.relative(parentPath, candidatePath);
  return relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative));
};

export const loadConfig = async () => {
  const base = await readJson(baseConfigPath);
  const local = await readJson(localConfigPath);
  const configuredRoots = Array.isArray(local.audioRoots) ? local.audioRoots : base.audioRoots || [];
  const configuredFiles = Array.isArray(local.audioFiles) ? local.audioFiles : base.audioFiles || [];
  const envRoots = (process.env.PROJECT_SEQUENCER_AUDIO_PATHS || "")
    .split(path.delimiter)
    .map((entry) => entry.trim())
    .filter(Boolean)
    .map((entry, index) => ({ id: `environment-${index + 1}`, label: path.basename(entry), path: entry }));
  const seen = new Set();
  const audioRoots = [...configuredRoots, ...envRoots]
    .map((root) => ({ ...root, path: expandPath(root.path) }))
    .filter((root) => {
      const key = `${root.id}:${root.path}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  const seenFiles = new Set();
  const audioFiles = configuredFiles
    .map((file) => ({ ...file, path: expandPath(file.path) }))
    .filter((file) => {
      if (seenFiles.has(file.path)) return false;
      seenFiles.add(file.path);
      return true;
    });
  const merged = { ...base, ...local, audioRoots, audioFiles };
  const requestedPort = Number(process.env.PROJECT_SEQUENCER_PORT);
  const port = Number.isInteger(requestedPort) && requestedPort >= 1 && requestedPort <= 65_535
    ? requestedPort
    : merged.port;
  return { ...merged, port };
};

export const rootStatuses = async (roots) => Promise.all(roots.map(async (root) => {
  try {
    await access(root.path, constants.R_OK);
    return { ...root, connected: true };
  } catch {
    return { ...root, connected: false };
  }
}));

export const addAudioSource = async ({ path: requestedPath, label }) => {
  if (!requestedPath || typeof requestedPath !== "string") throw new Error("Choose an audio file or folder path.");
  const resolvedPath = expandPath(requestedPath.trim());
  const sourceStat = await stat(resolvedPath);
  const kind = sourceStat.isDirectory() ? "folder" : sourceStat.isFile() ? "file" : "";
  if (!kind) throw new Error("The configured path must be an audio file or folder.");
  if (kind === "file" && !AUDIO_EXTENSIONS.has(path.extname(resolvedPath).toLowerCase())) {
    throw new Error("That file is not a supported audio format.");
  }

  return withConfigMutation(async () => {
    const config = await loadConfig();
    const exact = [...config.audioRoots, ...config.audioFiles].find((source) => source.path === resolvedPath);
    if (exact) return { source: exact, added: false, covered: true };
    const coveringRoot = config.audioRoots.find((root) => isPathInside(root.path, resolvedPath));
    if (coveringRoot) return { source: coveringRoot, added: false, covered: true };

    const local = await readJson(localConfigPath);
    const localRoots = Array.isArray(local.audioRoots) ? local.audioRoots : config.audioRoots.filter((root) => !root.id.startsWith("environment-"));
    const localFiles = Array.isArray(local.audioFiles) ? local.audioFiles : config.audioFiles;
    const allSources = [...localRoots, ...localFiles];
    const baseId = slugify(label || path.basename(resolvedPath));
    let id = baseId;
    let suffix = 2;
    while (allSources.some((source) => source.id === id)) id = `${baseId}-${suffix++}`;
    const source = { id, label: label?.trim() || path.basename(resolvedPath), path: resolvedPath };
    if (kind === "folder") local.audioRoots = [...localRoots, source];
    else local.audioFiles = [...localFiles, source];
    await writeLocalConfig(local);
    return { source, added: true, covered: false };
  });
};

export const addAudioRoot = async (details) => (await addAudioSource(details)).source;

export const removeAudioSource = async (sourceId) => withConfigMutation(async () => {
  const local = await readJson(localConfigPath);
  const config = await loadConfig();
  const localRoots = Array.isArray(local.audioRoots) ? local.audioRoots : config.audioRoots.filter((root) => !root.id.startsWith("environment-"));
  const localFiles = Array.isArray(local.audioFiles) ? local.audioFiles : config.audioFiles;
  const nextRoots = localRoots.filter((root) => root.id !== sourceId);
  const nextFiles = localFiles.filter((file) => file.id !== sourceId);
  if (nextRoots.length === localRoots.length && nextFiles.length === localFiles.length) {
    throw new Error("Configured path not found or supplied through the environment.");
  }
  local.audioRoots = nextRoots;
  local.audioFiles = nextFiles;
  await writeLocalConfig(local);
});

export const removeAudioRoot = removeAudioSource;

export { projectRoot, localConfigPath };
