export const renameAlbumRecord = (albums, albumId, nextTitle) => {
  const normalizedTitle = typeof nextTitle === "string" ? nextTitle.trim() : "";
  if (!normalizedTitle) return false;
  const album = albums.find((item) => item.id === albumId);
  if (!album) return false;
  album.title = normalizedTitle;
  return true;
};
