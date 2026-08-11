import { slugify } from "./format.js";
import { normalizeMasterBus } from "./mastering.js";
import { isTrackSequenced } from "./sequence-tracks.js";

const uniqueId = (base, existingIds) => {
  let id = slugify(base) || "item";
  let suffix = 2;
  while (existingIds.has(id)) id = `${slugify(base) || "item"}-${suffix++}`;
  return id;
};

export const currentSequenceOrder = (album) => album.tracks.filter(isTrackSequenced).map((track) => track.id);

export const saveSequenceVersion = (album, name, sourceVersionId = "") => {
  album.sequenceVersions ||= [];
  const source = album.sequenceVersions.find((version) => version.id === sourceVersionId);
  const label = name.trim();
  if (!label) return "";
  const id = uniqueId(label, new Set(album.sequenceVersions.map((version) => version.id)));
  album.sequenceVersions.push({
    id,
    name: label,
    trackOrder: source ? [...source.trackOrder] : currentSequenceOrder(album),
    createdAt: new Date().toISOString(),
  });
  return id;
};

export const restoreSequenceVersion = (album, versionId) => {
  const version = (album.sequenceVersions || []).find((item) => item.id === versionId);
  if (!version) return false;
  const byId = new Map(album.tracks.map((track) => [track.id, track]));
  const restored = version.trackOrder.flatMap((id) => byId.has(id) ? [byId.get(id)] : []);
  const included = new Set(restored.map((track) => track.id));
  const remaining = album.tracks.filter((track) => !included.has(track.id));
  restored.forEach((track) => { track.inSequence = true; });
  remaining.forEach((track) => { track.inSequence = false; });
  album.tracks = [...restored, ...remaining];
  album.orderApproved = false;
  album.activeSequenceVersionId = version.id;
  return true;
};

export const compareSequenceVersions = (album, leftId, rightId) => {
  const versions = album.sequenceVersions || [];
  const left = versions.find((version) => version.id === leftId);
  const right = versions.find((version) => version.id === rightId);
  if (!left || !right) return [];
  const ids = [...new Set([...left.trackOrder, ...right.trackOrder])];
  const tracks = new Map(album.tracks.map((track) => [track.id, track]));
  return ids.map((trackId) => ({
    trackId,
    title: tracks.get(trackId)?.title || trackId,
    leftPosition: left.trackOrder.indexOf(trackId) + 1 || null,
    rightPosition: right.trackOrder.indexOf(trackId) + 1 || null,
  }));
};

export const transitionPairId = (fromTrackId, toTrackId) => `${fromTrackId}--${toTrackId}`;

export const defaultTransitionVariant = () => ({ endMode: "natural", duration: 3, gapAfter: 0 });

export const ensureTransitionNote = (album, fromTrackId, toTrackId) => {
  album.transitionNotebook ||= [];
  const id = transitionPairId(fromTrackId, toTrackId);
  let entry = album.transitionNotebook.find((item) => item.id === id);
  if (!entry) {
    entry = {
      id,
      fromTrackId,
      toTrackId,
      notes: "",
      markers: [],
      variants: { A: defaultTransitionVariant(), B: defaultTransitionVariant() },
    };
    album.transitionNotebook.push(entry);
  }
  return entry;
};

export const updateTransitionNote = (album, fromTrackId, toTrackId, recipe) => {
  recipe(ensureTransitionNote(album, fromTrackId, toTrackId));
};

export const addTransitionMarker = (entry, { label, seconds }) => {
  const parsed = Number(seconds);
  if (!label.trim() || !Number.isFinite(parsed) || parsed < 0) return "";
  const id = uniqueId(label, new Set(entry.markers.map((marker) => marker.id)));
  entry.markers.push({ id, label: label.trim(), seconds: parsed });
  return id;
};

export const readinessForAlbum = (album, availableSourceKeys = new Set(), sourceKeyFor = () => "") => album.tracks.map((track) => {
  const audition = track.candidates.find((candidate) => candidate.id === track.auditionCandidateId);
  const master = track.candidates.find((candidate) => candidate.id === track.masterCandidateId);
  const candidateWithLyrics = track.candidates.some((candidate) => candidate.lyricRefs?.sunoPrompt || candidate.lyricRefs?.distrokid);
  return {
    trackId: track.id,
    title: track.title,
    gates: {
      playable: Boolean(audition && availableSourceKeys.has(sourceKeyFor(audition.sourceRef))),
      audition: Boolean(audition),
      master: Boolean(master),
      disposition: Boolean(track.decisionStatus && !["undecided", "missing"].includes(track.decisionStatus)),
      lyrics: candidateWithLyrics,
      artwork: Boolean(album.coverRef || track.visualAssets?.length),
      ordering: Boolean(album.orderApproved && isTrackSequenced(track)),
      humanApproval: Boolean(track.humanApproved),
    },
  };
});

export const toggleComparisonCandidate = (track, candidateId) => {
  if (!track.candidates.some((candidate) => candidate.id === candidateId)) return false;
  track.comparisonQueue ||= [];
  track.comparisonQueue = track.comparisonQueue.includes(candidateId)
    ? track.comparisonQueue.filter((id) => id !== candidateId)
    : [...track.comparisonQueue, candidateId];
  return true;
};

export const saveAlbumTemplate = (state, album, name) => {
  const label = name.trim();
  if (!label) return "";
  state.albumTemplates ||= [];
  const id = uniqueId(label, new Set(state.albumTemplates.map((template) => template.id)));
  state.albumTemplates.push({
    id,
    name: label,
    artist: album.artist,
    era: album.era,
    tracks: album.tracks.map((track) => ({ title: track.title, privacy: track.privacy || "standard", mastering: structuredClone(track.mastering || {}) })),
  });
  return id;
};

export const createAlbumFromTemplate = (state, templateId, title) => {
  const template = (state.albumTemplates || []).find((item) => item.id === templateId);
  const albumTitle = title.trim();
  if (!template || !albumTitle) return "";
  const id = uniqueId(albumTitle, new Set(state.albums.map((album) => album.id)));
  const trackIds = new Set();
  const tracks = template.tracks.map((track) => {
    const trackId = uniqueId(track.title, trackIds);
    trackIds.add(trackId);
    return {
      id: trackId,
      title: track.title,
      privacy: track.privacy,
      decisionStatus: "missing",
      masterCandidateId: "",
      auditionCandidateId: "",
      humanApproved: false,
      notes: "",
      visualAssets: [],
      candidates: [],
      mastering: structuredClone(track.mastering || {}),
    };
  });
  state.albums.push({
    id,
    artist: template.artist,
    title: albumTitle,
    era: template.era,
    releaseDate: "",
    status: "empty",
    orderApproved: false,
    masterBus: normalizeMasterBus(),
    delivery: { profileId: "", masterApproved: false, readyToPublish: false },
    baselineTrackOrder: tracks.map((track) => track.id),
    sequenceVersions: [],
    transitionNotebook: [],
    visualAssets: [],
    tracks,
  });
  state.activeAlbumId = id;
  return id;
};
