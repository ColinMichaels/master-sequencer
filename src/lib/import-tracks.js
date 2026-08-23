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

const nextAvailableCandidateId = (track, preferredId = "") => {
  if (preferredId && !track.candidates.some((candidate) => candidate.id === preferredId)) return preferredId;
  return nextCandidateId(track);
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

export const moveCandidateToTrack = (album, { sourceTrackId, candidateId, targetTrackId, makeActive = true }) => {
  if (!album || sourceTrackId === targetTrackId) return { action: "invalid" };
  const sourceTrack = album.tracks.find((track) => track.id === sourceTrackId);
  const targetTrack = album.tracks.find((track) => track.id === targetTrackId);
  const sourceCandidateIndex = sourceTrack?.candidates.findIndex((candidate) => candidate.id === candidateId) ?? -1;
  if (!sourceTrack || !targetTrack || sourceCandidateIndex < 0) return { action: "invalid" };

  const sourceCandidate = sourceTrack.candidates[sourceCandidateIndex];
  const existing = targetTrack.candidates.find((candidate) => sourceKey(candidate.sourceRef) === sourceKey(sourceCandidate.sourceRef));
  if (existing) {
    return {
      action: "duplicate",
      sourceTrackId,
      targetTrackId,
      candidateId: existing.id,
      targetTrackTitle: targetTrack.title,
    };
  }

  const [movedCandidate] = sourceTrack.candidates.splice(sourceCandidateIndex, 1);
  const movedCandidateId = nextAvailableCandidateId(targetTrack, movedCandidate.id);
  movedCandidate.id = movedCandidateId;
  targetTrack.candidates.push(movedCandidate);

  // Candidate moves are metadata-only. Keep the source track record, but repair
  // any audition, master, and approval pointers that referenced the moved item.
  if (sourceTrack.auditionCandidateId === candidateId) sourceTrack.auditionCandidateId = sourceTrack.candidates[0]?.id || "";
  if (sourceTrack.masterCandidateId === candidateId) {
    sourceTrack.masterCandidateId = "";
    sourceTrack.humanApproved = false;
    if (["approved", "released"].includes(sourceTrack.decisionStatus)) sourceTrack.decisionStatus = "undecided";
  }
  if (!sourceTrack.candidates.length) {
    sourceTrack.auditionCandidateId = "";
    sourceTrack.masterCandidateId = "";
    sourceTrack.humanApproved = false;
    sourceTrack.decisionStatus = "missing";
  }

  if (sourceTrack.privacy === "protected" || movedCandidate.sourceRef.privateSourceId) targetTrack.privacy = "protected";
  if (makeActive || !targetTrack.auditionCandidateId) targetTrack.auditionCandidateId = movedCandidateId;
  if (targetTrack.decisionStatus === "missing") targetTrack.decisionStatus = "undecided";
  if (album.status === "empty") album.status = "working";

  return {
    action: "candidate-moved",
    sourceTrackId,
    sourceTrackTitle: sourceTrack.title,
    targetTrackId,
    targetTrackTitle: targetTrack.title,
    candidateId: movedCandidateId,
  };
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
