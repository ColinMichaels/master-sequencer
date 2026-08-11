import { randomUUID } from "node:crypto";
import { mkdir, readFile, rename, stat, unlink, writeFile } from "node:fs/promises";
import path from "node:path";
import { normalizeMasterBus } from "../src/lib/mastering.js";
import { createMasteringPresetLibrary } from "../src/lib/mastering-presets.js";
import { CURRENT_SCHEMA_VERSION, migrateState, validateState } from "./state-schema.mjs";

const readJson = async (filePath) => JSON.parse(await readFile(filePath, "utf8"));

const writeJsonAtomic = async (filePath, value) => {
  const temporaryPath = `${filePath}.tmp`;
  await writeFile(temporaryPath, `${JSON.stringify(value, null, 2)}\n`);
  await rename(temporaryPath, filePath);
};

const PROJECT_INDEX_VERSION = 1;
const PROJECT_ID_PATTERN = /^[a-f0-9-]+$/;
const cleanText = (value, label) => {
  const normalized = typeof value === "string" ? value.trim() : "";
  if (!normalized || normalized.length > 120) {
    const error = new Error(`${label} must be between 1 and 120 characters.`);
    error.statusCode = 422;
    throw error;
  }
  return normalized;
};

const slugify = (value) => value.toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "untitled-album";

const projectSummary = (state) => ({
  artistName: state.settings.project.artistName,
  albumCount: state.albums.length,
  trackCount: state.albums.reduce((total, album) => total + album.tracks.length, 0),
});

const inferredProjectName = (state) => {
  const artist = state.settings.project.artistName;
  const album = state.albums[0]?.title;
  return album ? `${artist} — ${album}`.slice(0, 120) : `${artist} Project`.slice(0, 120);
};

const freshProjectState = ({ artistName, firstAlbumTitle, era, appearance }) => {
  const albumId = slugify(firstAlbumTitle);
  return validateState({
    schemaVersion: CURRENT_SCHEMA_VERSION,
    masteringPresets: createMasteringPresetLibrary(),
    activeAlbumId: albumId,
    settings: {
      project: { artistName, setupComplete: true },
      revealPrivateFilenames: false,
      ...(appearance ? { appearance: structuredClone(appearance) } : {}),
    },
    albums: [{
      id: albumId,
      artist: artistName,
      title: firstAlbumTitle,
      era,
      releaseDate: "",
      status: "empty",
      orderApproved: false,
      masterBus: normalizeMasterBus(),
      baselineTrackOrder: [],
      visualAssets: [],
      tracks: [],
    }],
  });
};

const validateProjectIndex = (index) => {
  if (!index || index.version !== PROJECT_INDEX_VERSION || !Array.isArray(index.projects)) throw new Error("The saved-project index is invalid.");
  const ids = new Set();
  for (const project of index.projects) {
    if (!PROJECT_ID_PATTERN.test(project?.id || "") || typeof project.name !== "string" || !project.name.trim() || ids.has(project.id)) throw new Error("The saved-project index contains an invalid project record.");
    ids.add(project.id);
  }
  if (!ids.has(index.activeProjectId)) throw new Error("The saved-project index has no valid active project.");
  return index;
};

const snapshotDetails = async (snapshotPath, source) => {
  const details = await stat(snapshotPath);
  return {
    source,
    snapshotUpdatedAt: details.mtime.toISOString(),
  };
};

export const createStateStore = ({
  statePath,
  seedPath,
  recoveryPath = `${statePath}.last-known-good.json`,
  projectsIndexPath = path.join(path.dirname(statePath), "sequencer-projects.json"),
  projectsRoot = path.join(path.dirname(statePath), "projects"),
}) => {
  let writeQueue = Promise.resolve();
  let recovery = null;
  let readableState = null;
  let projectIndex = null;

  const projectPath = (projectId) => path.join(projectsRoot, `${projectId}.json`);

  const publicProjects = () => projectIndex.projects
    .map((project) => ({ ...project, active: project.id === projectIndex.activeProjectId }))
    .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt));

  const writeProjectIndex = async () => writeJsonAtomic(projectsIndexPath, projectIndex);

  const updateProjectRecord = (projectId, state, updatedAt = new Date().toISOString()) => {
    const record = projectIndex.projects.find((project) => project.id === projectId);
    if (!record) throw new Error("The active saved project is missing from the index.");
    Object.assign(record, projectSummary(state), { updatedAt: updatedAt || record.updatedAt || new Date().toISOString() });
    return record;
  };

  const writeProjectSnapshot = async (projectId, state, updatedAt = new Date().toISOString()) => {
    await writeJsonAtomic(projectPath(projectId), state);
    updateProjectRecord(projectId, state, updatedAt);
    await writeProjectIndex();
  };

  const initializeProjectIndex = async () => {
    await mkdir(projectsRoot, { recursive: true });
    try {
      projectIndex = validateProjectIndex(await readJson(projectsIndexPath));
    } catch (error) {
      if (error.code !== "ENOENT") throw error;
      const now = new Date().toISOString();
      const id = randomUUID();
      projectIndex = {
        version: PROJECT_INDEX_VERSION,
        activeProjectId: id,
        projects: [{ id, name: inferredProjectName(readableState), createdAt: now, updatedAt: now, ...projectSummary(readableState) }],
      };
    }
    const activeId = projectIndex.activeProjectId;
    await writeProjectSnapshot(activeId, readableState, projectIndex.projects.find((project) => project.id === activeId)?.updatedAt);
  };

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
          await initializeProjectIndex();
          return;
        }
        const fallback = await loadRecoverySnapshot(seed);
        readableState = fallback.snapshot;
        recovery = {
          ...fallback,
          reason: error.message || "The current project record could not be read safely.",
        };
      }
      await initializeProjectIndex();
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
      await writeProjectSnapshot(projectIndex.activeProjectId, restored);
      return { state: restored, recovery: publicRecovery(), projects: publicProjects(), activeProjectId: projectIndex.activeProjectId };
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
        await writeProjectSnapshot(projectIndex.activeProjectId, validated);
        readableState = validated;
      });
      writeQueue = operation.catch(() => {});
      await operation;
      return validated;
    },
    listProjects() {
      return publicProjects();
    },
    activeProjectId() {
      return projectIndex.activeProjectId;
    },
    async createProject(details) {
      if (recovery) {
        const error = new Error("Restore the recovery snapshot before starting a new project.");
        error.statusCode = 409;
        throw error;
      }
      const name = cleanText(details?.name, "Project name");
      const artistName = cleanText(details?.artistName, "Artist name");
      const firstAlbumTitle = cleanText(details?.firstAlbumTitle, "First album title");
      const era = ["past", "current", "future"].includes(details?.era) ? details.era : "future";
      const nextState = freshProjectState({ artistName, firstAlbumTitle, era, appearance: readableState?.settings?.appearance });
      const operation = writeQueue.then(async () => {
        const current = migrateState(await readJson(statePath));
        await writeProjectSnapshot(projectIndex.activeProjectId, current);
        const now = new Date().toISOString();
        const id = randomUUID();
        projectIndex.projects.push({ id, name, createdAt: now, updatedAt: now, ...projectSummary(nextState) });
        await writeJsonAtomic(projectPath(id), nextState);
        await writeRecoverySnapshot(current);
        await writeJsonAtomic(statePath, nextState);
        projectIndex.activeProjectId = id;
        await writeProjectIndex();
        readableState = nextState;
        return { state: nextState, projects: publicProjects(), activeProjectId: id };
      });
      writeQueue = operation.catch(() => {});
      return operation;
    },
    async loadProject(projectId) {
      if (recovery) {
        const error = new Error("Restore the recovery snapshot before loading another project.");
        error.statusCode = 409;
        throw error;
      }
      if (!PROJECT_ID_PATTERN.test(projectId || "") || !projectIndex.projects.some((project) => project.id === projectId)) {
        const error = new Error("That saved project does not exist.");
        error.statusCode = 404;
        throw error;
      }
      const nextState = migrateState(await readJson(projectPath(projectId)));
      const operation = writeQueue.then(async () => {
        const current = migrateState(await readJson(statePath));
        await writeProjectSnapshot(projectIndex.activeProjectId, current);
        await writeRecoverySnapshot(current);
        await writeJsonAtomic(statePath, nextState);
        projectIndex.activeProjectId = projectId;
        updateProjectRecord(projectId, nextState, new Date().toISOString());
        await writeProjectIndex();
        readableState = nextState;
        return { state: nextState, projects: publicProjects(), activeProjectId: projectId };
      });
      writeQueue = operation.catch(() => {});
      return operation;
    },
    async deleteProject(projectId) {
      if (recovery) {
        const error = new Error("Restore the recovery snapshot before removing a saved project.");
        error.statusCode = 409;
        throw error;
      }
      if (!PROJECT_ID_PATTERN.test(projectId || "") || !projectIndex.projects.some((project) => project.id === projectId)) {
        const error = new Error("That saved project does not exist.");
        error.statusCode = 404;
        throw error;
      }
      if (projectIndex.projects.length <= 1) {
        const error = new Error("The final saved project cannot be removed. Start another project first.");
        error.statusCode = 409;
        throw error;
      }
      const operation = writeQueue.then(async () => {
        const removingActiveProject = projectId === projectIndex.activeProjectId;
        const current = migrateState(await readJson(statePath));
        if (!removingActiveProject) await writeProjectSnapshot(projectIndex.activeProjectId, current);

        projectIndex.projects = projectIndex.projects.filter((project) => project.id !== projectId);
        let nextState = current;
        if (removingActiveProject) {
          const nextProject = [...projectIndex.projects].sort((left, right) => right.updatedAt.localeCompare(left.updatedAt))[0];
          nextState = migrateState(await readJson(projectPath(nextProject.id)));
          await writeJsonAtomic(statePath, nextState);
          await writeRecoverySnapshot(nextState);
          projectIndex.activeProjectId = nextProject.id;
          updateProjectRecord(nextProject.id, nextState, new Date().toISOString());
        }
        await writeProjectIndex();
        await unlink(projectPath(projectId)).catch((error) => {
          if (error.code !== "ENOENT") throw error;
        });
        readableState = nextState;
        return { state: nextState, projects: publicProjects(), activeProjectId: projectIndex.activeProjectId };
      });
      writeQueue = operation.catch(() => {});
      return operation;
    },
  };
};

export { migrateState, validateState } from "./state-schema.mjs";
