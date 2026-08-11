import { sourceKey } from "./api.js";
import { slugify, titleFromFilename } from "./format.js";

export const sourceRefForFile = (file) => file.privateSourceId
  ? { privateSourceId: file.privateSourceId }
  : { rootId: file.rootId, relativePath: file.relativePath };

const normalizedTrackTitle = (value) => value
  .normalize("NFKD")
  .replace(/[\u0300-\u036f]/g, "")
  .toLowerCase()
  .replace(/[^a-z0-9]+/g, "");

const nextCandidateId = (track) => {
  const baseId = `${track.id}-candidate-${track.candidates.length + 1}`;
  let id = baseId;
  let suffix = 2;
  while (track.candidates.some((candidate) => candidate.id === id)) id = `${baseId}-${suffix++}`;
  return id;
};

export const addFileCandidate = (track, file) => {
  const existing = track.candidates.find((candidate) => sourceKey(candidate.sourceRef) === file.key);
  if (existing) return { action: "duplicate", trackId: track.id, trackTitle: track.title, candidateId: existing.id };

  const number = track.candidates.length + 1;
  const candidateId = nextCandidateId(track);
  track.candidates.push({
    id: candidateId,
    label: track.privacy === "protected" || file.privateSourceId ? `Private candidate ${number}` : `Candidate ${number}`,
    sourceRef: sourceRefForFile(file),
    flags: [],
    notes: "",
  });
  if (file.privateSourceId) track.privacy = "protected";
  if (!track.auditionCandidateId) track.auditionCandidateId = candidateId;
  if (track.decisionStatus === "missing") track.decisionStatus = "undecided";
  return { action: "candidate", trackId: track.id, trackTitle: track.title, candidateId };
};

export const buildImportedTracks = (existingTracks, files) => {
  const occupiedIds = new Set(existingTracks.map((track) => track.id));
  const usedSourceKeys = new Set(existingTracks.flatMap((track) => track.candidates.map((candidate) => sourceKey(candidate.sourceRef))));
  const tracks = [];
  let skipped = 0;

  for (const file of files) {
    if (usedSourceKeys.has(file.key)) {
      skipped += 1;
      continue;
    }
    const title = file.privateSourceId ? "Protected Track" : titleFromFilename(file.name);
    const baseId = slugify(title);
    let id = baseId;
    let suffix = 2;
    while (occupiedIds.has(id)) id = `${baseId}-${suffix++}`;
    occupiedIds.add(id);
    usedSourceKeys.add(file.key);
    const candidateId = `${id}-source-1`;
    tracks.push({
      id,
      title,
      decisionStatus: "undecided",
      masterCandidateId: "",
      auditionCandidateId: candidateId,
      notes: "",
      visualAssets: [],
      ...(file.privateSourceId ? { privacy: "protected" } : {}),
      candidates: [{
        id: candidateId,
        label: "Imported source",
        sourceRef: sourceRefForFile(file),
        flags: [],
        notes: "",
      }],
    });
  }

  return { tracks, skipped };
};

export const addFileAsNewTrack = (album, file) => {
  const result = buildImportedTracks(album.tracks, [file]);
  const track = result.tracks[0];
  if (!track) {
    const existingTrack = album.tracks.find((item) => item.candidates.some((candidate) => sourceKey(candidate.sourceRef) === file.key));
    return { action: "duplicate", trackId: existingTrack?.id || "", trackTitle: existingTrack?.title || titleFromFilename(file.name) };
  }
  album.tracks.push(track);
  album.baselineTrackOrder = [...(album.baselineTrackOrder || []), track.id];
  album.orderApproved = false;
  if (album.status === "empty") album.status = "working";
  return { action: "track", trackId: track.id, trackTitle: track.title, candidateId: track.auditionCandidateId };
};

export const assignFileToAlbum = (album, file) => {
  const existingTrack = album.tracks.find((track) => track.candidates.some((candidate) => sourceKey(candidate.sourceRef) === file.key));
  if (existingTrack) {
    const candidate = existingTrack.candidates.find((item) => sourceKey(item.sourceRef) === file.key);
    return { action: "duplicate", trackId: existingTrack.id, trackTitle: existingTrack.title, candidateId: candidate?.id || "" };
  }

  if (!file.privateSourceId) {
    const fileTitle = titleFromFilename(file.name);
    const matchingTrack = album.tracks.find((track) => normalizedTrackTitle(track.title) === normalizedTrackTitle(fileTitle));
    if (matchingTrack) {
      const result = addFileCandidate(matchingTrack, file);
      if (result.action === "candidate" && album.status === "empty") album.status = "working";
      return result;
    }
  }

  return addFileAsNewTrack(album, file);
};
