import { copyFile, readFile, rename, writeFile } from "node:fs/promises";

const readJson = async (filePath) => JSON.parse(await readFile(filePath, "utf8"));

const validateAssetReference = (reference, label) => {
  if (!reference || typeof reference !== "object" || typeof reference.rootId !== "string" || !reference.rootId || typeof reference.relativePath !== "string" || !reference.relativePath) {
    throw new Error(`${label} must reference a configured root and relative path.`);
  }
  const normalizedPath = reference.relativePath.replaceAll("\\", "/");
  if (normalizedPath.startsWith("/") || normalizedPath.split("/").includes("..")) throw new Error(`${label} must use a safe relative path.`);
};

const validateSourceReference = (reference, label) => {
  if (!reference || typeof reference !== "object" || Array.isArray(reference)) throw new Error(`${label} must have a source reference.`);
  const hasPrivateSource = typeof reference.privateSourceId === "string" && Boolean(reference.privateSourceId);
  const hasRootSource = typeof reference.rootId === "string" && Boolean(reference.rootId)
    && typeof reference.relativePath === "string" && Boolean(reference.relativePath);
  if (hasPrivateSource === hasRootSource) throw new Error(`${label} must reference exactly one indexed source.`);
  if (hasRootSource) validateAssetReference(reference, `${label} source`);
};

const validateVisualAssets = (assets, label) => {
  if (assets === undefined) return;
  if (!Array.isArray(assets)) throw new Error(`${label} visual assets must be an array.`);
  for (const asset of assets) validateAssetReference(asset, `${label} visual asset`);
};

const appearanceOptions = {
  mode: new Set(["dark", "light", "system"]),
  colorTheme: new Set(["signal", "ocean", "ember", "violet"]),
  fontTheme: new Set(["condensed", "modern", "editorial", "mono"]),
  textScale: new Set([0.9, 1, 1.1, 1.2]),
};

const validateSettings = (settings) => {
  if (settings === undefined) return;
  if (!settings || typeof settings !== "object" || Array.isArray(settings)) throw new Error("Project settings must be an object.");
  if (settings.revealPrivateFilenames !== undefined && typeof settings.revealPrivateFilenames !== "boolean") throw new Error("Protected-filename visibility must be a boolean.");
  if (settings.appearance === undefined) return;
  if (!settings.appearance || typeof settings.appearance !== "object" || Array.isArray(settings.appearance)) throw new Error("Appearance settings must be an object.");
  for (const [field, options] of Object.entries(appearanceOptions)) {
    if (settings.appearance[field] !== undefined && !options.has(settings.appearance[field])) throw new Error(`Unsupported appearance ${field}.`);
  }
};

export const validateState = (state) => {
  if (!state || typeof state !== "object" || Array.isArray(state)) throw new Error("Project state must be an object.");
  if (state.schemaVersion !== 1) throw new Error("Unsupported project-state version.");
  if (!Array.isArray(state.albums)) throw new Error("Project state must contain an albums array.");
  validateSettings(state.settings);
  const albumIds = new Set();
  for (const album of state.albums) {
    if (!album.id || !album.title || !Array.isArray(album.tracks)) throw new Error("Every album needs an id, title, and tracks array.");
    if (albumIds.has(album.id)) throw new Error(`Duplicate album id: ${album.id}`);
    albumIds.add(album.id);
    if (album.orderApproved !== undefined && typeof album.orderApproved !== "boolean") throw new Error(`${album.title} orderApproved must be a boolean.`);
    if (album.coverRef) validateAssetReference(album.coverRef, `${album.title} cover`);
    validateVisualAssets(album.visualAssets, album.title);
    const trackIds = new Set();
    for (const track of album.tracks) {
      if (!track.id || !track.title || !Array.isArray(track.candidates)) throw new Error(`Every track in ${album.title} needs an id, title, and candidates array.`);
      if (trackIds.has(track.id)) throw new Error(`Duplicate track id in ${album.title}: ${track.id}`);
      if (track.inSequence !== undefined && typeof track.inSequence !== "boolean") throw new Error(`${track.title} inSequence must be a boolean when present.`);
      if (track.mastering !== undefined) {
        if (!track.mastering || typeof track.mastering !== "object" || Array.isArray(track.mastering)) throw new Error(`${track.title} mastering settings must be an object.`);
        for (const field of ["trimStart", "trimEnd", "fadeIn", "endDuration", "gapAfter"]) {
          if (track.mastering[field] !== undefined && track.mastering[field] !== null && (!Number.isFinite(track.mastering[field]) || track.mastering[field] < 0)) throw new Error(`${track.title} ${field} must be a non-negative number.`);
        }
        if (track.mastering.endMode !== undefined && !["natural", "cut", "fade", "crossfade"].includes(track.mastering.endMode)) throw new Error(`${track.title} has an unsupported ending mode.`);
      }
      trackIds.add(track.id);
      validateVisualAssets(track.visualAssets, `${album.title} / ${track.title}`);
      const candidateIds = new Set();
      for (const candidate of track.candidates) {
        if (!candidate || typeof candidate !== "object" || !candidate.id || !candidate.sourceRef) throw new Error(`Every candidate in ${track.title} needs an id and source reference.`);
        if (candidateIds.has(candidate.id)) throw new Error(`Duplicate candidate id in ${track.title}: ${candidate.id}`);
        candidateIds.add(candidate.id);
        validateSourceReference(candidate.sourceRef, `${track.title} / ${candidate.id}`);
        if (candidate.lyricRefs !== undefined) {
          if (!candidate.lyricRefs || typeof candidate.lyricRefs !== "object" || Array.isArray(candidate.lyricRefs)) throw new Error(`${track.title} lyric attachments must be an object.`);
          for (const kind of ["sunoPrompt", "distrokid"]) if (candidate.lyricRefs[kind]) validateAssetReference(candidate.lyricRefs[kind], `${track.title} ${kind} lyrics`);
        }
      }
      if (track.masterCandidateId && !candidateIds.has(track.masterCandidateId)) throw new Error(`${track.title} master candidate does not exist.`);
      if (track.auditionCandidateId && !candidateIds.has(track.auditionCandidateId)) throw new Error(`${track.title} audition candidate does not exist.`);
    }
    if (album.baselineTrackOrder !== undefined) {
      if (!Array.isArray(album.baselineTrackOrder)) throw new Error(`${album.title} baselineTrackOrder must be an array.`);
      const baselineIds = new Set();
      for (const trackId of album.baselineTrackOrder) {
        if (!trackIds.has(trackId)) throw new Error(`${album.title} baseline order references an unknown track: ${trackId}`);
        if (baselineIds.has(trackId)) throw new Error(`${album.title} baseline order repeats track: ${trackId}`);
        baselineIds.add(trackId);
      }
    }
  }
  if (state.activeAlbumId && !albumIds.has(state.activeAlbumId)) throw new Error("The active album does not exist.");
  return state;
};

export const createStateStore = ({ statePath, seedPath }) => {
  let writeQueue = Promise.resolve();
  return {
    async initialize() {
      try {
        validateState(await readJson(statePath));
      } catch (error) {
        if (error.code !== "ENOENT") throw error;
        validateState(await readJson(seedPath));
        await copyFile(seedPath, statePath);
      }
    },
    async read() {
      return validateState(await readJson(statePath));
    },
    async write(state) {
      const validated = validateState(structuredClone(state));
      const serialized = `${JSON.stringify(validated, null, 2)}\n`;
      const operation = writeQueue.then(async () => {
        const temporaryPath = `${statePath}.tmp`;
        await writeFile(temporaryPath, serialized);
        await rename(temporaryPath, statePath);
      });
      writeQueue = operation.catch(() => {});
      await operation;
      return validated;
    },
  };
};
