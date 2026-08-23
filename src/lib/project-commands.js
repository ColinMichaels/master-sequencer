import { renameAlbumRecord } from "./albums.js";
import { mergeAppearance } from "./appearance.js";
import { slugify } from "./format.js";
import { addFileCandidate, buildImportedTracks } from "./import-tracks.js";
import { normalizeMasterBus } from "./mastering.js";
import { createDefaultAdvancedMastering } from "./advanced-mastering.js";
import { setTrackSequenced } from "./sequence-tracks.js";

export const DEFAULT_PROJECT_ARTIST = "Untitled Artist";

export const projectArtistName = (state) => {
  const configuredArtist = state?.settings?.project?.artistName?.trim();
  if (configuredArtist) return configuredArtist;
  const inheritedArtist = state?.albums?.find((album) => album.artist?.trim())?.artist.trim();
  return inheritedArtist || DEFAULT_PROJECT_ARTIST;
};

export const updateAlbum = (state, albumId, recipe) => {
  const album = state.albums.find((item) => item.id === albumId);
  if (!album) return false;
  recipe(album);
  return true;
};

export const selectAlbum = (state, albumId) => {
  if (!state.albums.some((album) => album.id === albumId)) return false;
  state.activeAlbumId = albumId;
  return true;
};

export const addAlbum = (state, { title, era }) => {
  const baseId = slugify(title);
  let id = baseId;
  let suffix = 2;
  while (state.albums.some((album) => album.id === id)) id = `${baseId}-${suffix++}`;
  state.albums.push({
    id,
    artist: projectArtistName(state),
    title: title.trim(),
    era,
    releaseDate: "",
    status: era === "past" ? "archive" : era === "current" ? "working" : "empty",
    orderApproved: false,
    masterBus: normalizeMasterBus(),
    masteringPath: "basic",
    advancedMastering: createDefaultAdvancedMastering(),
    delivery: { profileId: "", masterApproved: false, readyToPublish: false },
    baselineTrackOrder: [],
    sequenceVersions: [],
    transitionNotebook: [],
    visualAssets: [],
    tracks: [],
  });
  state.activeAlbumId = id;
  return id;
};

export const renameAlbum = (state, albumId, title) => renameAlbumRecord(state.albums, albumId, title);

export const deleteAlbum = (state, albumId) => {
  const albumIndex = state.albums.findIndex((album) => album.id === albumId);
  if (albumIndex < 0 || state.albums.length <= 1) return false;
  state.albums.splice(albumIndex, 1);
  if (state.activeAlbumId === albumId) {
    state.activeAlbumId = state.albums[Math.min(albumIndex, state.albums.length - 1)].id;
  }
  return true;
};

export const addBlankTrack = (album, title) => {
  const baseId = slugify(title);
  let id = baseId;
  let suffix = 2;
  while (album.tracks.some((track) => track.id === id)) id = `${baseId}-${suffix++}`;
  album.tracks.push({ id, title: title.trim(), decisionStatus: "missing", masterCandidateId: "", auditionCandidateId: "", humanApproved: false, comparisonQueue: [], notes: "", visualAssets: [], candidates: [] });
  album.baselineTrackOrder = [...(album.baselineTrackOrder || []), id];
  album.orderApproved = false;
  return id;
};

export const appendImportedTracks = (album, result) => {
  const candidateResults = (result.candidateAssignments || []).flatMap(({ trackId, file }) => {
    const track = album.tracks.find((item) => item.id === trackId);
    if (!track) return [];
    const candidate = addFileCandidate(track, file);
    return candidate.action === "candidate" ? [candidate] : [];
  });
  if (result.tracks.length) {
    album.tracks.push(...result.tracks);
    album.baselineTrackOrder = [...(album.baselineTrackOrder || []), ...result.tracks.map((track) => track.id)];
    album.orderApproved = false;
  }
  if ((result.tracks.length || candidateResults.length) && album.status === "empty") album.status = "working";
  return { ...result, candidateResults };
};

export const addTracksFromFiles = (album, files) => appendImportedTracks(album, buildImportedTracks(album.tracks, files));

export const restoreBaselineOrder = (album) => {
  const order = new Map((album.baselineTrackOrder || []).map((id, index) => [id, index]));
  album.tracks.sort((a, b) => (order.get(a.id) ?? Number.MAX_SAFE_INTEGER) - (order.get(b.id) ?? Number.MAX_SAFE_INTEGER));
  album.orderApproved = false;
};

export const setTrackInSequence = (album, trackId, inSequence) => setTrackSequenced(album, trackId, inSequence);

export const deleteTrackRecord = (album, trackId) => {
  if (!album.tracks.some((track) => track.id === trackId)) return false;
  album.tracks = album.tracks.filter((track) => track.id !== trackId);
  album.baselineTrackOrder = (album.baselineTrackOrder || []).filter((id) => id !== trackId);
  album.sequenceVersions = (album.sequenceVersions || []).map((version) => ({ ...version, trackOrder: version.trackOrder.filter((id) => id !== trackId) }));
  album.transitionNotebook = (album.transitionNotebook || []).filter((entry) => entry.fromTrackId !== trackId && entry.toTrackId !== trackId);
  album.orderApproved = false;
  return true;
};

export const updateAppearance = (state, patch) => {
  state.settings ||= {};
  state.settings.appearance = mergeAppearance(state.settings.appearance, patch);
};

export const updateProjectIdentity = (state, { artistName, setupComplete = true }) => {
  const normalizedArtist = artistName?.trim();
  if (!normalizedArtist || normalizedArtist.length > 120) return false;
  state.settings ||= {};
  state.settings.project = { artistName: normalizedArtist, setupComplete: Boolean(setupComplete) };
  for (const album of state.albums) album.artist = normalizedArtist;
  return true;
};
