export const isTrackSequenced = (track) => track?.inSequence !== false;

export const TRACK_TITLE_MAX_LENGTH = 120;

export const SEQUENCE_TRACK_STATUS_OPTIONS = Object.freeze([
  { value: "undecided", label: "Temporary audition" },
  { value: "master-sheet", label: "Master-sheet choice" },
  { value: "provisional", label: "Provisional selection" },
  { value: "approved", label: "Approved master source" },
  { value: "replacement", label: "Replacement required" },
  { value: "missing", label: "Missing audio" },
  { value: "legacy", label: "Legacy source only" },
  { value: "released", label: "Released source" },
]);

const sequenceTrackStatusValues = new Set(SEQUENCE_TRACK_STATUS_OPTIONS.map(({ value }) => value));

export const sequenceTrackStatus = (track) => {
  if (track?.decisionStatus === "undecided" && track.auditionCandidateId && track.masterCandidateId === track.auditionCandidateId) return "master-sheet";
  return sequenceTrackStatusValues.has(track?.decisionStatus) ? track.decisionStatus : "undecided";
};

export const setSequenceTrackStatus = (track, status) => {
  if (!track || !sequenceTrackStatusValues.has(status)) return false;
  if (status === "master-sheet") {
    if (!track.auditionCandidateId) return false;
    track.masterCandidateId = track.auditionCandidateId;
    track.decisionStatus = "undecided";
    return true;
  }
  if (status === "undecided" && track.masterCandidateId === track.auditionCandidateId) track.masterCandidateId = "";
  track.decisionStatus = status;
  return true;
};

export const renameTrackTitle = (album, trackId, title) => {
  const track = album?.tracks?.find((item) => item.id === trackId);
  const normalizedTitle = typeof title === "string" ? title.trim().replace(/\s+/g, " ") : "";
  if (!track || track.privacy === "protected" || !normalizedTitle || normalizedTitle.length > TRACK_TITLE_MAX_LENGTH || normalizedTitle === track.title) return false;
  track.title = normalizedTitle;
  return true;
};

export const sequenceTracks = (albumOrTracks) => {
  const tracks = Array.isArray(albumOrTracks) ? albumOrTracks : albumOrTracks?.tracks || [];
  return tracks.filter(isTrackSequenced);
};

export const setTrackSequenced = (album, trackId, sequenced) => {
  const track = album?.tracks?.find((item) => item.id === trackId);
  if (!track) return false;
  if (sequenced) delete track.inSequence;
  else track.inSequence = false;
  album.orderApproved = false;
  return true;
};
