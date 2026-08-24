import { createHash } from "node:crypto";
import { readdir, realpath, stat } from "node:fs/promises";
import path from "node:path";

export const VISUAL_EXTENSIONS = new Set([".png", ".jpg", ".jpeg", ".webp", ".avif", ".svg"]);
export const LYRIC_EXTENSIONS = new Set([".md", ".txt"]);

const invalidAsset = (message) => {
  const error = new Error(message);
  error.statusCode = 400;
  return error;
};

const relativeWithin = (rootPath, filePath) => {
  const relativePath = path.relative(path.resolve(rootPath), filePath);
  if (!relativePath || relativePath.startsWith("..") || path.isAbsolute(relativePath)) return "";
  return relativePath.split(path.sep).join("/");
};

export const createProjectAssetReferences = async ({ selectedPaths, roots, kind, inspect = stat, resolveRealPath = realpath }) => {
  const allowedExtensions = kind === "visuals" ? VISUAL_EXTENSIONS : kind === "lyrics" ? LYRIC_EXTENSIONS : null;
  if (!allowedExtensions) throw invalidAsset("Choose visual assets or lyric files.");
  const realRoots = (await Promise.all(roots.map(async (root) => {
    try {
      return { root, realPath: await resolveRealPath(root.path) };
    } catch {
      return null;
    }
  }))).filter(Boolean);
  const references = [];
  for (const selectedPath of selectedPaths) {
    const absolutePath = path.resolve(selectedPath);
    const details = await inspect(absolutePath);
    if (!details.isFile()) throw invalidAsset("Project assets must be individual files.");
    const extension = path.extname(absolutePath).toLowerCase();
    if (!allowedExtensions.has(extension)) {
      throw invalidAsset(kind === "visuals"
        ? "Visual assets must be PNG, JPG, WEBP, AVIF, or SVG files."
        : "Lyric attachments must be Markdown or plain-text files.");
    }
    const realAbsolutePath = await resolveRealPath(absolutePath);
    const match = realRoots.find((item) => relativeWithin(item.realPath, realAbsolutePath));
    if (!match) throw invalidAsset("Choose a file inside a configured Project Sequencer folder.");
    const relativePath = relativeWithin(match.realPath, realAbsolutePath);
    references.push({
      id: createHash("sha1").update(`${match.root.id}::${relativePath}`).digest("hex").slice(0, 16),
      rootId: match.root.id,
      relativePath,
      name: path.basename(absolutePath),
      extension: extension.slice(1),
      kind: kind === "visuals" ? "visual" : "lyrics",
    });
  }
  return references;
};

export const scanProjectLyricFolder = async ({ folderPath, roots, maxFiles = 2_000, readDirectory = readdir }) => {
  const selectedFolder = path.resolve(folderPath);
  const details = await stat(selectedFolder);
  if (!details.isDirectory()) throw invalidAsset("Choose a lyrics folder.");
  const selectedFiles = [];
  const pending = [selectedFolder];
  while (pending.length) {
    const current = pending.pop();
    const entries = await readDirectory(current, { withFileTypes: true });
    for (const entry of entries) {
      if (entry.name.startsWith(".") || entry.isSymbolicLink()) continue;
      const entryPath = path.join(current, entry.name);
      if (entry.isDirectory()) pending.push(entryPath);
      else if (entry.isFile() && LYRIC_EXTENSIONS.has(path.extname(entry.name).toLowerCase())) {
        selectedFiles.push(entryPath);
        if (selectedFiles.length > maxFiles) throw invalidAsset(`Choose a lyrics folder with ${maxFiles.toLocaleString()} files or fewer.`);
      }
    }
  }
  selectedFiles.sort((left, right) => left.localeCompare(right, undefined, { numeric: true, sensitivity: "base" }));
  return createProjectAssetReferences({ selectedPaths: selectedFiles, roots, kind: "lyrics" });
};
