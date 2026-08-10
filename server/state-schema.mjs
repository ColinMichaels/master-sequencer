export const CURRENT_SCHEMA_VERSION = 5;
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
  if (settings.librarySavedFilters !== undefined) {
    if (!Array.isArray(settings.librarySavedFilters)) throw new Error("Saved library filters must be an array.");
    const filterIds = new Set();
    for (const filter of settings.librarySavedFilters) {
      if (!filter?.id || !filter.name || ["query", "format", "rootId", "usageFilter"].some((field) => typeof filter[field] !== "string")) throw new Error("Every saved library filter needs an id, name, query, and facets.");
      if (filterIds.has(filter.id)) throw new Error(`Duplicate saved library filter id: ${filter.id}`);
      filterIds.add(filter.id);
    }
  }
  if (settings.appearance === undefined) return;
  if (!settings.appearance || typeof settings.appearance !== "object" || Array.isArray(settings.appearance)) throw new Error("Appearance settings must be an object.");
  for (const [field, options] of Object.entries(appearanceOptions)) {
    if (settings.appearance[field] !== undefined && !options.has(settings.appearance[field])) throw new Error(`Unsupported appearance ${field}.`);
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
  [2, (state) => ({
    ...state,
    schemaVersion: 3,
    albumTemplates: Array.isArray(state.albumTemplates) ? state.albumTemplates : [],
    albums: state.albums.map((album) => ({
      ...album,
      sequenceVersions: Array.isArray(album.sequenceVersions) ? album.sequenceVersions : [],
      transitionNotebook: Array.isArray(album.transitionNotebook) ? album.transitionNotebook : [],
    })),
  })],
  [3, (state) => ({
    ...state,
    schemaVersion: 4,
    albums: state.albums.map((album) => ({
      ...album,
      delivery: album.delivery && typeof album.delivery === "object" && !Array.isArray(album.delivery)
        ? album.delivery
        : { profileId: "", masterApproved: false, readyToPublish: false },
    })),
  })],
  [4, (state) => ({
    ...state,
    schemaVersion: 5,
    settings: {
      ...(state.settings || {}),
      librarySavedFilters: Array.isArray(state.settings?.librarySavedFilters) ? state.settings.librarySavedFilters : [],
    },
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
