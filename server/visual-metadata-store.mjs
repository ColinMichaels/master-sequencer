import { readFile, rename, writeFile } from "node:fs/promises";

const STORE_VERSION = 1;
const EDITABLE_FIELDS = new Set(["displayTitle", "albumId", "trackId", "format", "platform", "readiness", "collection", "subjects", "tags", "notes"]);

const cleanText = (value, maximum = 500) => typeof value === "string" ? value.trim().slice(0, maximum) : "";
const cleanList = (value) => Array.isArray(value)
  ? [...new Set(value.map((item) => cleanText(item, 80)).filter(Boolean))].slice(0, 50)
  : [];

export const normalizeVisualMetadata = (value = {}) => {
  const normalized = {};
  for (const field of EDITABLE_FIELDS) {
    if (!(field in value)) continue;
    normalized[field] = field === "subjects" || field === "tags"
      ? cleanList(value[field])
      : cleanText(value[field], field === "notes" ? 2_000 : 160);
  }
  return normalized;
};

export const createVisualMetadataStore = ({ metadataPath }) => {
  let records = {};
  let writeQueue = Promise.resolve();
  const write = async () => {
    const temporaryPath = `${metadataPath}.tmp`;
    await writeFile(temporaryPath, `${JSON.stringify({ version: STORE_VERSION, records }, null, 2)}\n`);
    await rename(temporaryPath, metadataPath);
  };
  return {
    async initialize() {
      try {
        const parsed = JSON.parse(await readFile(metadataPath, "utf8"));
        records = parsed?.version === STORE_VERSION && parsed.records && typeof parsed.records === "object" ? parsed.records : {};
      } catch (error) {
        if (error.code !== "ENOENT") throw error;
        records = {};
      }
    },
    get(id) {
      return structuredClone(records[id] || {});
    },
    async update(id, metadata) {
      if (!/^[a-f0-9]{16}$/.test(id || "")) {
        const error = new Error("Visual metadata requires a valid indexed-media id.");
        error.statusCode = 400;
        throw error;
      }
      const next = { ...records[id], ...normalizeVisualMetadata(metadata), updatedAt: new Date().toISOString() };
      records[id] = next;
      const operation = writeQueue.then(write);
      writeQueue = operation.catch(() => {});
      await operation;
      return structuredClone(next);
    },
  };
};
