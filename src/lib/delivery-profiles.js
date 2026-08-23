export const DELIVERY_PROFILES = [
  {
    id: "archive-wav",
    name: "Archive Master",
    defaultFormat: "wav",
    defaultSampleRate: 48_000,
    defaultBitDepth: 24,
    description: "Defaults to 24-bit WAV · 48 kHz · cue sheet · render manifest",
    documentation: ["cue-sheet", "render-manifest"],
  },
  {
    id: "distribution-wav",
    name: "DistroKid Tracks",
    defaultFormat: "wav",
    defaultSampleRate: 48_000,
    defaultBitDepth: 24,
    description: "Defaults to 24-bit WAV · numbered individual tracks · print documentation",
    documentation: ["cue-sheet", "render-manifest"],
    defaultScope: "tracks",
    allowedScopes: ["tracks"],
  },
  {
    id: "review-mp3",
    name: "Review Copy",
    defaultFormat: "mp3",
    defaultSampleRate: 48_000,
    defaultBitrateKbps: 320,
    description: "Defaults to 320 kbps MP3 · 48 kHz · cue sheet · render manifest",
    documentation: ["cue-sheet", "render-manifest"],
  },
];

export const deliveryProfile = (profileId) => DELIVERY_PROFILES.find((profile) => profile.id === profileId) || null;

export const validateDeliveryRequest = ({ profileId, scope }) => {
  if (!profileId) return { ok: true, profile: null, issues: [] };
  const profile = deliveryProfile(profileId);
  if (!profile) return { ok: false, profile: null, issues: ["The selected delivery profile is not supported."] };
  const issues = [];
  if (profile.allowedScopes && !profile.allowedScopes.includes(scope)) issues.push(`${profile.name} requires a numbered separate-track print.`);
  return { ok: issues.length === 0, profile, issues };
};

export const compareRenderManifests = (left, right) => {
  if (!left || !right) return [];
  const rows = [];
  if (left.format !== right.format) rows.push({ field: "Format", left: left.format, right: right.format });
  if (left.audioSettings?.sampleRate !== right.audioSettings?.sampleRate) rows.push({ field: "Sample rate", left: left.audioSettings?.sampleRate || "Unspecified", right: right.audioSettings?.sampleRate || "Unspecified" });
  if (left.audioSettings?.bitDepth !== right.audioSettings?.bitDepth) rows.push({ field: "Bit depth", left: left.audioSettings?.bitDepth || "Not used", right: right.audioSettings?.bitDepth || "Not used" });
  if (left.audioSettings?.bitrateKbps !== right.audioSettings?.bitrateKbps) rows.push({ field: "Bitrate", left: left.audioSettings?.bitrateKbps || "Not used", right: right.audioSettings?.bitrateKbps || "Not used" });
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
