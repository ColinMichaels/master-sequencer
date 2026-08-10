import { readFile, rename, stat, writeFile } from "node:fs/promises";
import { migrateState, validateState } from "./state-schema.mjs";

const readJson = async (filePath) => JSON.parse(await readFile(filePath, "utf8"));

const writeJsonAtomic = async (filePath, value) => {
  const temporaryPath = `${filePath}.tmp`;
  await writeFile(temporaryPath, `${JSON.stringify(value, null, 2)}\n`);
  await rename(temporaryPath, filePath);
};

const snapshotDetails = async (snapshotPath, source) => {
  const details = await stat(snapshotPath);
  return {
    source,
    snapshotUpdatedAt: details.mtime.toISOString(),
  };
};

export const createStateStore = ({ statePath, seedPath, recoveryPath = `${statePath}.last-known-good.json` }) => {
  let writeQueue = Promise.resolve();
  let recovery = null;
  let readableState = null;

  const writeRecoverySnapshot = async (state) => {
    const validated = validateState(structuredClone(state));
    await writeJsonAtomic(recoveryPath, validated);
    return validated;
  };

  const loadRecoverySnapshot = async (seed) => {
    try {
      const snapshot = migrateState(await readJson(recoveryPath));
      return { snapshot, ...(await snapshotDetails(recoveryPath, "last-known-good")) };
    } catch {
      await writeRecoverySnapshot(seed);
      return { snapshot: seed, ...(await snapshotDetails(recoveryPath, "portable-seed")) };
    }
  };

  const publicRecovery = () => recovery ? {
    required: true,
    reason: recovery.reason,
    source: recovery.source,
    snapshotUpdatedAt: recovery.snapshotUpdatedAt,
  } : { required: false };

  return {
    async initialize() {
      const seed = migrateState(await readJson(seedPath));
      try {
        const rawState = await readJson(statePath);
        const state = migrateState(rawState);
        readableState = state;
        if (JSON.stringify(rawState) !== JSON.stringify(state)) await writeJsonAtomic(statePath, state);
        await writeRecoverySnapshot(state);
      } catch (error) {
        if (error.code === "ENOENT") {
          await writeJsonAtomic(statePath, seed);
          await writeRecoverySnapshot(seed);
          readableState = seed;
          return;
        }
        const fallback = await loadRecoverySnapshot(seed);
        readableState = fallback.snapshot;
        recovery = {
          ...fallback,
          reason: error.message || "The current project record could not be read safely.",
        };
      }
    },
    async read() {
      if (recovery) return readableState;
      readableState = migrateState(await readJson(statePath));
      return readableState;
    },
    recoveryStatus() {
      return publicRecovery();
    },
    async restoreRecovery() {
      if (!recovery) return { state: await this.read(), recovery: publicRecovery() };
      const restored = validateState(structuredClone(recovery.snapshot));
      await writeJsonAtomic(statePath, restored);
      await writeRecoverySnapshot(restored);
      readableState = restored;
      recovery = null;
      return { state: restored, recovery: publicRecovery() };
    },
    async write(state) {
      if (recovery) {
        const error = new Error("Restore the recovery snapshot before saving new project changes.");
        error.statusCode = 409;
        throw error;
      }
      let validated;
      try {
        validated = migrateState(state);
      } catch (error) {
        error.statusCode ||= 422;
        throw error;
      }
      const operation = writeQueue.then(async () => {
        const current = migrateState(await readJson(statePath));
        await writeRecoverySnapshot(current);
        await writeJsonAtomic(statePath, validated);
        readableState = validated;
      });
      writeQueue = operation.catch(() => {});
      await operation;
      return validated;
    },
  };
};

export { migrateState, validateState } from "./state-schema.mjs";
