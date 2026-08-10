import { MASTERING_LIMITS, normalizeMasterBus } from "../src/lib/mastering.js";

export const CURRENT_SCHEMA_VERSION = 4;

const DEFAULT_PROJECT_ARTIST = "Untitled Artist";
const deliveryProfileIds = new Set(["", "archive-wav", "distribution-wav", "review-mp3"]);

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

const validateObject = (value, label) => {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error(`${label} must be an object.`);
};

const validateBoolean = (value, label) => {
  if (typeof value !== "boolean") throw new Error(`${label} must be a boolean.`);
};

const validateNumberRange = (value, limits, label) => {
  if (!Number.isFinite(value) || value < limits.minimum || value > limits.maximum) {
    throw new Error(`${label} must be between ${limits.minimum} and ${limits.maximum}.`);
  }
};

const validateEqBand = (band, frequencyLimits, label, { includeQ = false } = {}) => {
  validateObject(band, label);
  validateNumberRange(band.frequencyHz, frequencyLimits, `${label} frequencyHz`);
  validateNumberRange(band.gainDb, MASTERING_LIMITS.eqGainDb, `${label} gainDb`);
  if (includeQ) validateNumberRange(band.q, MASTERING_LIMITS.midBandQ, `${label} q`);
};

const validateMasterBus = (masterBus, label) => {
  validateObject(masterBus, label);
  validateBoolean(masterBus.bypass, `${label} bypass`);
  validateObject(masterBus.eq, `${label} EQ`);
  validateBoolean(masterBus.eq.enabled, `${label} EQ enabled`);
  validateEqBand(masterBus.eq.lowShelf, MASTERING_LIMITS.lowShelfFrequencyHz, `${label} low shelf`);
  validateEqBand(masterBus.eq.midBand, MASTERING_LIMITS.midBandFrequencyHz, `${label} mid band`, { includeQ: true });
  validateEqBand(masterBus.eq.highShelf, MASTERING_LIMITS.highShelfFrequencyHz, `${label} high shelf`);

  validateObject(masterBus.compressor, `${label} compressor`);
  validateBoolean(masterBus.compressor.enabled, `${label} compressor enabled`);
  validateNumberRange(masterBus.compressor.thresholdDb, MASTERING_LIMITS.compressorThresholdDb, `${label} compressor thresholdDb`);
  validateNumberRange(masterBus.compressor.ratio, MASTERING_LIMITS.compressorRatio, `${label} compressor ratio`);
  validateNumberRange(masterBus.compressor.attackMs, MASTERING_LIMITS.compressorAttackMs, `${label} compressor attackMs`);
  validateNumberRange(masterBus.compressor.releaseMs, MASTERING_LIMITS.compressorReleaseMs, `${label} compressor releaseMs`);
  validateNumberRange(masterBus.compressor.knee, MASTERING_LIMITS.compressorKnee, `${label} compressor knee`);
  validateNumberRange(masterBus.compressor.makeupGainDb, MASTERING_LIMITS.compressorMakeupGainDb, `${label} compressor makeupGainDb`);
  validateNumberRange(masterBus.compressor.mix, MASTERING_LIMITS.compressorMix, `${label} compressor mix`);
  if (!["average", "maximum"].includes(masterBus.compressor.link)) throw new Error(`${label} compressor link must be average or maximum.`);
  if (!["peak", "rms"].includes(masterBus.compressor.detection)) throw new Error(`${label} compressor detection must be peak or rms.`);

  validateNumberRange(masterBus.outputGainDb, MASTERING_LIMITS.outputGainDb, `${label} outputGainDb`);
  validateObject(masterBus.limiter, `${label} limiter`);
  validateBoolean(masterBus.limiter.enabled, `${label} limiter enabled`);
  validateNumberRange(masterBus.limiter.ceilingDbfs, MASTERING_LIMITS.limiterCeilingDbfs, `${label} limiter ceilingDbfs`);
  validateNumberRange(masterBus.limiter.attackMs, MASTERING_LIMITS.limiterAttackMs, `${label} limiter attackMs`);
  validateNumberRange(masterBus.limiter.releaseMs, MASTERING_LIMITS.limiterReleaseMs, `${label} limiter releaseMs`);
};

const appearanceOptions = {
  mode: new Set(["dark", "light", "system"]),
  colorTheme: new Set(["signal", "ocean", "ember", "violet"]),
  fontTheme: new Set(["condensed", "modern", "editorial", "mono"]),
  textScale: new Set([0.9, 1, 1.1, 1.2]),
};

const validateSettings = (settings) => {
  if (!settings || typeof settings !== "object" || Array.isArray(settings)) throw new Error("Project settings must be an object.");
  if (settings.revealPrivateFilenames !== undefined && typeof settings.revealPrivateFilenames !== "boolean") throw new Error("Protected-filename visibility must be a boolean.");
  if (!settings.project || typeof settings.project !== "object" || Array.isArray(settings.project)) throw new Error("Project identity settings must be an object.");
  if (typeof settings.project.artistName !== "string" || !settings.project.artistName.trim() || settings.project.artistName.length > 120) throw new Error("Project artist name must be between 1 and 120 characters.");
  if (typeof settings.project.setupComplete !== "boolean") throw new Error("Project setup status must be a boolean.");
  if (settings.appearance !== undefined) {
    if (!settings.appearance || typeof settings.appearance !== "object" || Array.isArray(settings.appearance)) throw new Error("Appearance settings must be an object.");
    for (const [field, options] of Object.entries(appearanceOptions)) {
      if (settings.appearance[field] !== undefined && !options.has(settings.appearance[field])) throw new Error(`Unsupported appearance ${field}.`);
    }
  }
};

const validateAlbumTemplates = (templates) => {
  if (templates === undefined) return;
  if (!Array.isArray(templates)) throw new Error("Album templates must be an array.");
  const ids = new Set();
  for (const template of templates) {
    if (!template?.id || !template.name || !template.artist || !Array.isArray(template.tracks)) throw new Error("Every album template needs an id, name, artist, and track structure.");
    if (ids.has(template.id)) throw new Error(`Duplicate album template id: ${template.id}`);
    ids.add(template.id);
    for (const track of template.tracks) {
      if (!track?.title) throw new Error(`${template.name} has an untitled template track.`);
      if (track.candidates !== undefined || track.masterCandidateId !== undefined || track.auditionCandidateId !== undefined || track.humanApproved === true) throw new Error(`${template.name} must not carry media or approvals.`);
    }
  }
};

export const validateState = (state) => {
  if (!state || typeof state !== "object" || Array.isArray(state)) throw new Error("Project state must be an object.");
  if (state.schemaVersion !== CURRENT_SCHEMA_VERSION) throw new Error(`Unsupported project-state version ${state.schemaVersion ?? "unknown"}.`);
  if (!Array.isArray(state.albums)) throw new Error("Project state must contain an albums array.");
  validateSettings(state.settings);
  validateAlbumTemplates(state.albumTemplates);
  const albumIds = new Set();
  for (const album of state.albums) {
    if (!album.id || !album.title || !Array.isArray(album.tracks)) throw new Error("Every album needs an id, title, and tracks array.");
    if (albumIds.has(album.id)) throw new Error(`Duplicate album id: ${album.id}`);
    albumIds.add(album.id);
    if (album.orderApproved !== undefined && typeof album.orderApproved !== "boolean") throw new Error(`${album.title} orderApproved must be a boolean.`);
    validateMasterBus(album.masterBus, `${album.title} MASTER bus`);
    if (album.delivery !== undefined) {
      if (!album.delivery || typeof album.delivery !== "object" || Array.isArray(album.delivery)) throw new Error(`${album.title} delivery record must be an object.`);
      if (!deliveryProfileIds.has(album.delivery.profileId || "")) throw new Error(`${album.title} has an unsupported delivery profile.`);
      for (const field of ["masterApproved", "readyToPublish"]) if (album.delivery[field] !== undefined && typeof album.delivery[field] !== "boolean") throw new Error(`${album.title} ${field} must be a boolean.`);
    }
    if (album.coverRef) validateAssetReference(album.coverRef, `${album.title} cover`);
    validateVisualAssets(album.visualAssets, album.title);
    const trackIds = new Set();
    for (const track of album.tracks) {
      if (!track.id || !track.title || !Array.isArray(track.candidates)) throw new Error(`Every track in ${album.title} needs an id, title, and candidates array.`);
      if (trackIds.has(track.id)) throw new Error(`Duplicate track id in ${album.title}: ${track.id}`);
      if (track.inSequence !== undefined && typeof track.inSequence !== "boolean") throw new Error(`${track.title} inSequence must be a boolean when present.`);
      if (track.humanApproved !== undefined && typeof track.humanApproved !== "boolean") throw new Error(`${track.title} human approval must be a boolean.`);
      if (track.mastering !== undefined) {
        if (!track.mastering || typeof track.mastering !== "object" || Array.isArray(track.mastering)) throw new Error(`${track.title} mastering settings must be an object.`);
        for (const field of ["trimStart", "trimEnd", "fadeIn", "endDuration", "gapAfter"]) {
          if (track.mastering[field] !== undefined && track.mastering[field] !== null && (!Number.isFinite(track.mastering[field]) || track.mastering[field] < 0)) throw new Error(`${track.title} ${field} must be a non-negative number.`);
        }
        if (track.mastering.gainDb !== undefined) validateNumberRange(track.mastering.gainDb, MASTERING_LIMITS.trackGainDb, `${track.title} gainDb`);
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
      if (track.comparisonQueue !== undefined) {
        if (!Array.isArray(track.comparisonQueue) || new Set(track.comparisonQueue).size !== track.comparisonQueue.length) throw new Error(`${track.title} comparison queue must contain unique candidate IDs.`);
        for (const candidateId of track.comparisonQueue) if (!candidateIds.has(candidateId)) throw new Error(`${track.title} comparison queue references an unknown candidate.`);
      }
    }
    if (album.sequenceVersions !== undefined) {
      if (!Array.isArray(album.sequenceVersions)) throw new Error(`${album.title} sequence versions must be an array.`);
      const versionIds = new Set();
      for (const version of album.sequenceVersions) {
        if (!version?.id || !version.name || !Array.isArray(version.trackOrder)) throw new Error(`${album.title} has an invalid sequence version.`);
        if (versionIds.has(version.id) || new Set(version.trackOrder).size !== version.trackOrder.length) throw new Error(`${album.title} sequence versions must have unique IDs and track orders.`);
        versionIds.add(version.id);
        for (const trackId of version.trackOrder) if (!trackIds.has(trackId)) throw new Error(`${album.title} sequence version references an unknown track: ${trackId}`);
      }
      if (album.activeSequenceVersionId && !versionIds.has(album.activeSequenceVersionId)) throw new Error(`${album.title} active sequence version does not exist.`);
    }
    if (album.transitionNotebook !== undefined) {
      if (!Array.isArray(album.transitionNotebook)) throw new Error(`${album.title} transition notebook must be an array.`);
      const pairIds = new Set();
      for (const entry of album.transitionNotebook) {
        if (!entry?.id || !trackIds.has(entry.fromTrackId) || !trackIds.has(entry.toTrackId) || entry.fromTrackId === entry.toTrackId) throw new Error(`${album.title} has an invalid transition pair.`);
        if (pairIds.has(entry.id) || entry.id !== `${entry.fromTrackId}--${entry.toTrackId}`) throw new Error(`${album.title} has a duplicate or mismatched transition pair.`);
        pairIds.add(entry.id);
        if (typeof entry.notes !== "string" || !Array.isArray(entry.markers) || !entry.variants || typeof entry.variants !== "object") throw new Error(`${album.title} transition notes are malformed.`);
        for (const marker of entry.markers) if (!marker?.id || !marker.label || !Number.isFinite(marker.seconds) || marker.seconds < 0) throw new Error(`${album.title} has an invalid transition marker.`);
        for (const name of ["A", "B"]) {
          const variant = entry.variants[name];
          if (!variant || !["natural", "cut", "fade", "crossfade"].includes(variant.endMode) || !Number.isFinite(variant.duration) || variant.duration < 0 || !Number.isFinite(variant.gapAfter) || variant.gapAfter < 0) throw new Error(`${album.title} transition variant ${name} is invalid.`);
        }
      }
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

const migrations = new Map([
  [1, (state) => ({
    ...state,
    schemaVersion: 2,
    settings: state.settings && typeof state.settings === "object" && !Array.isArray(state.settings) ? state.settings : {},
  })],
  [2, (state) => {
    const settings = state.settings && typeof state.settings === "object" && !Array.isArray(state.settings) ? state.settings : {};
    const inheritedArtist = state.albums?.find((album) => typeof album?.artist === "string" && album.artist.trim())?.artist.trim() || DEFAULT_PROJECT_ARTIST;
    const configuredArtist = typeof settings.project?.artistName === "string" ? settings.project.artistName.trim() : "";
    return {
      ...state,
      schemaVersion: 3,
      settings: {
        ...settings,
        project: {
          artistName: configuredArtist || inheritedArtist,
          setupComplete: typeof settings.project?.setupComplete === "boolean" ? settings.project.setupComplete : true,
        },
      },
    };
  }],
  [3, (state) => ({
    ...state,
    schemaVersion: 4,
    albumTemplates: Array.isArray(state.albumTemplates) ? state.albumTemplates : [],
    albums: Array.isArray(state.albums) ? state.albums.map((album) => ({
      ...album,
      masterBus: normalizeMasterBus(album?.masterBus),
      delivery: album.delivery && typeof album.delivery === "object" && !Array.isArray(album.delivery)
        ? album.delivery
        : { profileId: "", masterApproved: false, readyToPublish: false },
      sequenceVersions: Array.isArray(album.sequenceVersions) ? album.sequenceVersions : [],
      transitionNotebook: Array.isArray(album.transitionNotebook) ? album.transitionNotebook : [],
    })) : state.albums,
  })],
]);

export const migrateState = (input) => {
  if (!input || typeof input !== "object" || Array.isArray(input)) throw new Error("Project state must be an object.");
  let state = structuredClone(input);
  if (!Number.isInteger(state.schemaVersion) || state.schemaVersion < 1) throw new Error("Project state has no supported schema version.");
  if (state.schemaVersion > CURRENT_SCHEMA_VERSION) throw new Error(`Project state version ${state.schemaVersion} is newer than this application supports.`);
  while (state.schemaVersion < CURRENT_SCHEMA_VERSION) {
    const migrate = migrations.get(state.schemaVersion);
    if (!migrate) throw new Error(`No migration is available for project-state version ${state.schemaVersion}.`);
    state = migrate(state);
  }
  return validateState(state);
};
