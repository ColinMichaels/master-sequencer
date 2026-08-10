import { sourceKey } from "./api.js";
import { slugify, titleFromFilename } from "./format.js";

export const sourceRefForFile = (file) => file.privateSourceId
  ? { privateSourceId: file.privateSourceId }
  : { rootId: file.rootId, relativePath: file.relativePath };

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
