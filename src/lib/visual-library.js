export const VISUAL_FORMATS = [
  ["all", "All media"],
  ["youtube-master", "YouTube masters 16:9"],
  ["reel", "Reels + Shorts 9:16"],
  ["feed-square", "Feed squares 1:1"],
  ["spotify-canvas", "Spotify Canvas"],
  ["campaign-promo", "Campaign promos"],
  ["static-post", "Static posts"],
  ["production-clip", "Production clips"],
  ["review-proof", "Review proofs"],
];

export const VISUAL_FORMAT_LABELS = Object.fromEntries(VISUAL_FORMATS);

export const VISUAL_LIBRARY_COLUMN_STORAGE_KEY = "project-sequencer.visual-library.columns.v1";

export const VISUAL_LIBRARY_COLUMNS = [
  { id: "preview", label: "Preview", width: "84px", minimum: 84, required: true },
  { id: "title", label: "Title", width: "minmax(190px, 1.25fr)", minimum: 190, required: true },
  { id: "track", label: "Track", width: "minmax(110px, 0.75fr)", minimum: 110 },
  { id: "platform", label: "Platform", width: "minmax(96px, 0.65fr)", minimum: 96 },
  { id: "format", label: "Format / dimensions", width: "minmax(145px, 0.9fr)", minimum: 145 },
  { id: "duration", label: "Duration", width: "78px", minimum: 78 },
  { id: "readiness", label: "Readiness", width: "108px", minimum: 108 },
  { id: "added", label: "Added", width: "116px", minimum: 116 },
  { id: "modified", label: "Modified", width: "116px", minimum: 116 },
  { id: "size", label: "Size", width: "78px", minimum: 78 },
  { id: "created", label: "Created", width: "116px", minimum: 116 },
  { id: "mediaType", label: "Media type", width: "88px", minimum: 88 },
  { id: "codec", label: "Codec", width: "118px", minimum: 118 },
  { id: "frameRate", label: "Frame rate", width: "88px", minimum: 88 },
  { id: "container", label: "Container", width: "110px", minimum: 110 },
  { id: "collection", label: "Collection", width: "minmax(130px, 0.75fr)", minimum: 130 },
  { id: "filename", label: "Filename", width: "minmax(170px, 1fr)", minimum: 170 },
];

export const DEFAULT_VISUAL_LIBRARY_COLUMN_IDS = [
  "preview",
  "title",
  "track",
  "platform",
  "format",
  "duration",
  "readiness",
  "added",
  "modified",
  "size",
];

const columnIds = new Set(VISUAL_LIBRARY_COLUMNS.map(({ id }) => id));
const requiredColumnIds = new Set(VISUAL_LIBRARY_COLUMNS.filter(({ required }) => required).map(({ id }) => id));
const deviceStorage = () => {
  try {
    return globalThis.localStorage;
  } catch {
    return null;
  }
};

export const normalizeVisualLibraryColumnIds = (value) => {
  const source = Array.isArray(value) ? value : DEFAULT_VISUAL_LIBRARY_COLUMN_IDS;
  const requested = new Set(source.filter((id) => typeof id === "string" && columnIds.has(id)));
  for (const id of requiredColumnIds) requested.add(id);
  return VISUAL_LIBRARY_COLUMNS.map(({ id }) => id).filter((id) => requested.has(id));
};

export const loadVisualLibraryColumnIds = (storage) => {
  const target = storage === undefined ? deviceStorage() : storage;
  try {
    const saved = JSON.parse(target?.getItem(VISUAL_LIBRARY_COLUMN_STORAGE_KEY) || "null");
    return normalizeVisualLibraryColumnIds(saved || DEFAULT_VISUAL_LIBRARY_COLUMN_IDS);
  } catch {
    return [...DEFAULT_VISUAL_LIBRARY_COLUMN_IDS];
  }
};

export const saveVisualLibraryColumnIds = (ids, storage) => {
  const normalized = normalizeVisualLibraryColumnIds(ids);
  const target = storage === undefined ? deviceStorage() : storage;
  try {
    target?.setItem(VISUAL_LIBRARY_COLUMN_STORAGE_KEY, JSON.stringify(normalized));
  } catch {
    // Device-only display preferences remain optional when storage is blocked.
  }
  return normalized;
};

export const summarizeVisualItems = (items) => {
  const platforms = new Set();
  const formatCounts = new Map();
  for (const item of items || []) {
    const platform = item.metadata?.platform;
    const format = item.metadata?.format;
    if (platform) platforms.add(platform);
    if (format) formatCounts.set(format, (formatCounts.get(format) || 0) + 1);
  }
  return { platforms: [...platforms].toSorted(), formatCounts };
};

const normalizedSearch = (value) => String(value || "").toLocaleLowerCase().replace(/[^a-z0-9]+/g, " ").trim();

export const visualItemIsRelated = (item, album, trackId = "") => {
  const metadata = item.metadata || {};
  if (metadata.trackId && metadata.trackId === trackId) return true;
  if (metadata.albumId && metadata.albumId === album?.id) return true;
  const searchable = normalizedSearch([
    metadata.displayTitle,
    item.name,
    item.relativePath,
    metadata.collection,
  ].join(" "));
  const track = album?.tracks?.find((entry) => entry.id === trackId);
  const trackTitle = normalizedSearch(track?.title);
  const albumTitle = normalizedSearch(album?.title);
  return Boolean((trackTitle.length >= 4 && searchable.includes(trackTitle)) || (albumTitle.length >= 4 && searchable.includes(albumTitle)));
};

const visualItemMatchesTrack = (item, album, trackId) => {
  if (!trackId) return true;
  if (item.metadata?.trackId) return item.metadata.trackId === trackId;
  const trackTitle = normalizedSearch(album?.tracks?.find((track) => track.id === trackId)?.title);
  if (trackTitle.length < 4) return false;
  return normalizedSearch([item.metadata?.displayTitle, item.name, item.relativePath, item.metadata?.collection].join(" ")).includes(trackTitle);
};

const readinessRank = new Map([
  ["Ready to post", 0],
  ["Alternate", 1],
  ["Production clip", 2],
  ["Review", 3],
]);
const timestamp = (value) => {
  const parsed = Date.parse(value || "");
  return Number.isFinite(parsed) ? parsed : 0;
};

export const filterVisualItems = (items, filters, album) => {
  const query = normalizedSearch(filters.query);
  const filtered = items.filter((item) => {
    const metadata = item.metadata || {};
    if (filters.scope === "project" && !visualItemIsRelated(item, album, filters.trackId)) return false;
    if (filters.format !== "all" && metadata.format !== filters.format) return false;
    if (filters.mediaType !== "all" && item.mediaType !== filters.mediaType) return false;
    if (filters.aspect !== "all" && item.aspect !== filters.aspect) return false;
    if (!visualItemMatchesTrack(item, album, filters.trackId)) return false;
    if (filters.platform !== "all" && metadata.platform !== filters.platform) return false;
    if (filters.readiness !== "all" && metadata.readiness !== filters.readiness) return false;
    if (!query) return true;
    const searchable = normalizedSearch([
      metadata.displayTitle,
      item.name,
      item.relativePath,
      metadata.format,
      metadata.platform,
      metadata.readiness,
      metadata.collection,
      metadata.albumId,
      metadata.trackId,
      ...(metadata.subjects || []),
      ...(metadata.tags || []),
      item.extension,
      item.codec,
      item.width,
      item.height,
    ].join(" "));
    return query.split(" ").every((term) => searchable.includes(term));
  });
  return filtered.toSorted((left, right) => {
    if (filters.sort === "title") return (left.metadata?.displayTitle || left.name).localeCompare(right.metadata?.displayTitle || right.name);
    if (filters.sort === "duration") return (right.duration || 0) - (left.duration || 0);
    if (filters.sort === "size") return right.size - left.size;
    if (filters.sort === "newest") return timestamp(right.modifiedAt) - timestamp(left.modifiedAt);
    if (filters.sort === "added") return timestamp(right.firstIndexedAt) - timestamp(left.firstIndexedAt);
    if (filters.sort === "created") return timestamp(right.createdAt) - timestamp(left.createdAt);
    return Number(!visualItemIsRelated(left, album, filters.trackId)) - Number(!visualItemIsRelated(right, album, filters.trackId))
      || (readinessRank.get(left.metadata?.readiness) ?? 9) - (readinessRank.get(right.metadata?.readiness) ?? 9)
      || timestamp(right.modifiedAt) - timestamp(left.modifiedAt);
  });
};

export const createVisualAssetReference = (item) => ({
  id: item.id,
  visualMediaKey: item.key,
  rootId: item.rootId,
  relativePath: item.relativePath,
  name: item.name,
  extension: item.extension,
  kind: "visual",
});
