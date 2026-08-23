import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import { sourceKey } from "./audio-library.mjs";

const checksumFile = (filePath) => new Promise((resolve, reject) => {
  const hash = createHash("sha256");
  const stream = createReadStream(filePath);
  stream.on("data", (chunk) => hash.update(chunk));
  stream.on("error", reject);
  stream.on("end", () => resolve(hash.digest("hex")));
});

const MACHINE_LOCAL_PATH_FIELDS = new Set(["absolutePath", "originalPath", "filePath"]);

const createPortableClone = (value) => {
  if (Array.isArray(value)) return value.map(createPortableClone);
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(Object.entries(value)
    .filter(([key]) => !MACHINE_LOCAL_PATH_FIELDS.has(key))
    .map(([key, nestedValue]) => [key, createPortableClone(nestedValue)]));
};

export const createPortableProjectBundle = async ({ state, getLibraryFile }) => {
  const references = new Map();
  for (const album of state.albums) for (const track of album.tracks) for (const candidate of track.candidates) {
    const key = sourceKey(candidate.sourceRef);
    if (!references.has(key)) references.set(key, createPortableClone(candidate.sourceRef));
  }
  const sources = [];
  for (const [key, reference] of references) {
    const file = getLibraryFile(key);
    if (!file) {
      sources.push({ sourceRef: reference, status: "offline", size: null, sha256: "" });
      continue;
    }
    sources.push({ sourceRef: reference, status: "verified", size: file.size, sha256: await checksumFile(file.absolutePath) });
  }
  return {
    bundleSchemaVersion: 1,
    kind: "project-sequencer-portable-json-checksum-bundle",
    createdAt: new Date().toISOString(),
    mediaIncluded: false,
    project: createPortableClone(state),
    sources,
  };
};
