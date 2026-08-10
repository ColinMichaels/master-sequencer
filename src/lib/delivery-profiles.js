export const DELIVERY_PROFILES = [
  {
    id: "archive-wav",
    name: "Archive WAV",
    format: "wav",
    description: "24-bit PCM · 48 kHz · cue sheet · render manifest",
    documentation: ["cue-sheet", "render-manifest"],
  },
  {
    id: "distribution-wav",
    name: "Distribution WAV",
    format: "wav",
    description: "24-bit PCM · 48 kHz · album program documentation",
    documentation: ["cue-sheet", "render-manifest"],
    albumOnly: true,
  },
  {
    id: "review-mp3",
    name: "Review MP3",
    format: "mp3",
    description: "320 kbps MP3 · 48 kHz · cue sheet · render manifest",
    documentation: ["cue-sheet", "render-manifest"],
  },
];

export const deliveryProfile = (profileId) => DELIVERY_PROFILES.find((profile) => profile.id === profileId) || null;

export const validateDeliveryRequest = ({ profileId, format, scope }) => {
  if (!profileId) return { ok: true, profile: null, issues: [] };
  const profile = deliveryProfile(profileId);
  if (!profile) return { ok: false, profile: null, issues: ["The selected delivery profile is not supported."] };
  const issues = [];
  if (profile.format !== format) issues.push(`${profile.name} requires ${profile.format.toUpperCase()} output.`);
  if (profile.albumOnly && scope !== "album") issues.push(`${profile.name} requires a full album-program print.`);
  return { ok: issues.length === 0, profile, issues };
};

export const compareRenderManifests = (left, right) => {
  if (!left || !right) return [];
  const rows = [];
  if (left.format !== right.format) rows.push({ field: "Format", left: left.format, right: right.format });
  if (left.scope !== right.scope) rows.push({ field: "Scope", left: left.scope, right: right.scope });
  if (left.delivery?.profileId !== right.delivery?.profileId) rows.push({ field: "Delivery profile", left: left.delivery?.profileId || "None", right: right.delivery?.profileId || "None" });
  const leftTracks = new Map((left.tracks || []).map((track, index) => [track.id, { ...track, position: index + 1 }]));
  const rightTracks = new Map((right.tracks || []).map((track, index) => [track.id, { ...track, position: index + 1 }]));
  for (const trackId of new Set([...leftTracks.keys(), ...rightTracks.keys()])) {
    const a = leftTracks.get(trackId);
    const b = rightTracks.get(trackId);
    if (!a || !b) {
      rows.push({ field: a?.title || b?.title || trackId, left: a ? `Track ${a.position}` : "Not printed", right: b ? `Track ${b.position}` : "Not printed" });
      continue;
    }
    const changed = a.position !== b.position || a.candidateId !== b.candidateId || ["trimStart", "trimEnd", "fadeIn", "endMode", "endDuration", "gapAfter"].some((field) => a[field] !== b[field]);
    if (changed) rows.push({ field: a.title, left: `Track ${a.position} · ${a.candidateId} · ${a.endMode}`, right: `Track ${b.position} · ${b.candidateId} · ${b.endMode}` });
  }
  return rows;
};
