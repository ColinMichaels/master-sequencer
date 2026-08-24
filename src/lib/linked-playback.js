const MESSAGE_VERSION = 1;
const MAX_LABEL_LENGTH = 180;
const MAX_PLAYBACK_SECONDS = 24 * 60 * 60;

const cleanText = (value, maximum = MAX_LABEL_LENGTH) => typeof value === "string"
  ? value.trim().slice(0, maximum)
  : "";

const cleanSeconds = (value) => {
  const number = Number(value);
  if (!Number.isFinite(number)) return 0;
  return Math.min(MAX_PLAYBACK_SECONDS, Math.max(0, number));
};

// Cross-tab messages use an explicit display-only allowlist. File keys, paths,
// URLs, status strings, and media objects never enter the broadcast channel.
const cleanCurrent = (current) => {
  if (!current || typeof current !== "object") return null;
  const trackId = cleanText(current.trackId, 120);
  const trackTitle = cleanText(current.trackTitle);
  if (!trackId && !trackTitle) return null;
  return {
    trackId,
    albumId: cleanText(current.albumId, 120),
    albumTitle: cleanText(current.albumTitle),
    trackTitle,
    nextTrackTitle: cleanText(current.nextTrackTitle),
    renderedPreview: Boolean(current.renderedPreview),
    referenceTrack: Boolean(current.referenceTrack),
    comparisonChannel: ["A", "B"].includes(current.comparisonChannel) ? current.comparisonChannel : "",
  };
};

export const linkedPlaybackChannelName = (projectId) => `project-sequencer:transport:v1:${encodeURIComponent(cleanText(projectId, 160) || "default")}`;

export const createLinkedPlaybackSnapshot = ({ current, currentTime, mediaDuration, playing, albums = [], sentAt = Date.now() }) => {
  const trackId = cleanText(current?.track?.id, 120);
  const album = trackId
    ? albums.find((item) => item.tracks?.some((track) => track.id === trackId))
    : null;
  return {
    current: current ? {
      trackId,
      albumId: cleanText(album?.id, 120),
      albumTitle: cleanText(current.albumTitle || album?.title),
      trackTitle: cleanText(current.trackTitle),
      nextTrackTitle: cleanText(current.nextTrackTitle),
      renderedPreview: Boolean(current.renderedPreview),
      referenceTrack: Boolean(current.referenceTrack),
      comparisonChannel: ["A", "B"].includes(current.masteringComparison?.channel) ? current.masteringComparison.channel : "",
    } : null,
    currentTime: cleanSeconds(currentTime),
    mediaDuration: cleanSeconds(mediaDuration),
    playing: Boolean(playing),
    sentAt: Number.isFinite(Number(sentAt)) ? Number(sentAt) : Date.now(),
  };
};

export const sanitizeLinkedPlaybackMessage = (value) => {
  if (!value || typeof value !== "object" || value.version !== MESSAGE_VERSION) return null;
  const senderId = cleanText(value.senderId, 120);
  if (!senderId) return null;
  const base = { version: MESSAGE_VERSION, senderId };

  if (["hello", "release"].includes(value.type)) return { ...base, type: value.type };
  if (value.type === "heartbeat") {
    return { ...base, type: value.type, role: value.role === "owner" ? "owner" : "available" };
  }
  if (value.type === "claim") return { ...base, type: value.type };
  if (value.type === "command") {
    if (value.command === "toggle" || value.command === "stop") return { ...base, type: value.type, command: value.command };
    if (value.command === "seek") return { ...base, type: value.type, command: value.command, time: cleanSeconds(value.time) };
    return null;
  }
  if (value.type !== "snapshot" || !value.snapshot || typeof value.snapshot !== "object") return null;
  return {
    ...base,
    type: value.type,
    snapshot: {
      current: cleanCurrent(value.snapshot.current),
      currentTime: cleanSeconds(value.snapshot.currentTime),
      mediaDuration: cleanSeconds(value.snapshot.mediaDuration),
      playing: Boolean(value.snapshot.playing),
      sentAt: Number.isFinite(Number(value.snapshot.sentAt)) ? Number(value.snapshot.sentAt) : Date.now(),
    },
  };
};

export const linkedPlaybackMessage = (senderId, type, details = {}) => sanitizeLinkedPlaybackMessage({
  version: MESSAGE_VERSION,
  senderId,
  type,
  ...details,
});
