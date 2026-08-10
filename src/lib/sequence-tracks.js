export const isTrackSequenced = (track) => track?.inSequence !== false;

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
