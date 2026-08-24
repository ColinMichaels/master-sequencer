const CLEAN_LYRIC_MARKER = /\b(?:distro\s*kid|clean\s+lyrics?|lyrics?\s+clean|lyrics?\s+only)\b/i;
const CLEAN_LYRIC_MARKERS = /\b(?:distro\s*kid|clean\s+lyrics?|lyrics?\s+clean|lyrics?\s+only)\b/gi;

const SHEET_MARKERS = /\b(?:working\s+lyrics?|lyric\s+sheets?|suno\s+prompts?|prompt\s+sheets?|transcriptions?|drafts?|lyrics?)\b/gi;

export const lyricKindForFilename = (filename = "") => {
  const searchable = filename.replace(/[^a-z0-9]+/gi, " ");
  return CLEAN_LYRIC_MARKER.test(searchable) ? "distrokid" : "sunoPrompt";
};

export const normalizeLyricMatchTitle = (value = "") => {
  const normalized = value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\.(?:md|txt)$/i, "")
    .replace(/^\s*\d{1,3}\s*[-_. )]+/, " ")
    .replace(/[^a-z0-9]+/gi, " ");
  return normalized
    .replace(CLEAN_LYRIC_MARKERS, " ")
    .replace(SHEET_MARKERS, " ")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");
};

const candidateForTrack = (track) => {
  const byId = new Map((track.candidates || []).map((candidate) => [candidate.id, candidate]));
  return byId.get(track.masterCandidateId)
    || byId.get(track.auditionCandidateId)
    || track.candidates?.[0]
    || null;
};

const attachmentKey = (asset) => `${asset.rootId}::${asset.relativePath}`;

export const planLyricFolderAssignments = (album, assets = []) => {
  // Exact normalized equality is intentional: automatic attachment should
  // skip uncertain titles rather than associate lyrics with the wrong song.
  const tracksByTitle = new Map();
  for (const track of album.tracks || []) {
    const normalizedTitle = normalizeLyricMatchTitle(track.title);
    if (!normalizedTitle) continue;
    const matches = tracksByTitle.get(normalizedTitle) || [];
    matches.push(track);
    tracksByTitle.set(normalizedTitle, matches);
  }

  const groupedAssets = new Map();
  const unmatched = [];
  for (const asset of assets) {
    const normalizedTitle = normalizeLyricMatchTitle(asset.name || asset.relativePath);
    const matchingTracks = tracksByTitle.get(normalizedTitle) || [];
    if (matchingTracks.length !== 1) {
      unmatched.push({ asset, reason: matchingTracks.length ? "ambiguous-track" : "no-track" });
      continue;
    }
    const track = matchingTracks[0];
    const kind = lyricKindForFilename(asset.name || asset.relativePath);
    const groupKey = `${track.id}::${kind}`;
    const group = groupedAssets.get(groupKey) || { track, kind, assets: [] };
    group.assets.push(asset);
    groupedAssets.set(groupKey, group);
  }

  const assignments = [];
  const conflicts = [];
  const skippedExisting = [];
  const skippedNoCandidate = [];
  for (const group of groupedAssets.values()) {
    if (group.assets.length !== 1) {
      conflicts.push(group);
      continue;
    }
    const candidate = candidateForTrack(group.track);
    if (!candidate) {
      skippedNoCandidate.push(group);
      continue;
    }
    const asset = group.assets[0];
    const existing = candidate.lyricRefs?.[group.kind];
    if (existing) {
      skippedExisting.push({ ...group, candidate, asset, sameFile: attachmentKey(existing) === attachmentKey(asset) });
      continue;
    }
    assignments.push({ trackId: group.track.id, trackTitle: group.track.title, candidateId: candidate.id, candidateLabel: candidate.label, kind: group.kind, asset });
  }

  return { assignments, unmatched, conflicts, skippedExisting, skippedNoCandidate, scannedCount: assets.length };
};

export const applyLyricFolderAssignments = (album, assignments = []) => {
  let applied = 0;
  const tracksById = new Map((album.tracks || []).map((track) => [track.id, track]));
  for (const assignment of assignments) {
    const track = tracksById.get(assignment.trackId);
    const candidate = track?.candidates?.find((item) => item.id === assignment.candidateId);
    if (!candidate || candidate.lyricRefs?.[assignment.kind]) continue;
    candidate.lyricRefs = { ...(candidate.lyricRefs || {}), [assignment.kind]: assignment.asset };
    applied += 1;
  }
  return applied;
};
