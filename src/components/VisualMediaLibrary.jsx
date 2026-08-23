import React, { useCallback, useDeferredValue, useEffect, useMemo, useRef, useState } from "react";
import { api } from "../lib/api.js";
import { formatBytes, formatDuration } from "../lib/format.js";
import {
  createVisualAssetReference,
  DEFAULT_VISUAL_LIBRARY_COLUMN_IDS,
  filterVisualItems,
  loadVisualLibraryColumnIds,
  saveVisualLibraryColumnIds,
  summarizeVisualItems,
  VISUAL_FORMAT_LABELS,
  VISUAL_FORMATS,
  VISUAL_LIBRARY_COLUMNS,
} from "../lib/visual-library.js";
import { CopyIcon, ExternalLinkIcon, FilterIcon, GridIcon, ImageIcon, PlayIcon, RefreshIcon, SearchIcon, VideoIcon } from "./Icons.jsx";

const EMPTY_PAYLOAD = { capability: "local", items: [], roots: [], scan: null, scanning: false };
const READINESS_OPTIONS = ["Ready to post", "Alternate", "Production clip", "Review"];
const ASPECT_OPTIONS = ["16:9", "9:16", "1:1", "4:5", "other"];
const DATE_TIME_FORMATTER = new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" });
const DATE_FORMATTER = new Intl.DateTimeFormat(undefined, { dateStyle: "medium" });
const TIME_FORMATTER = new Intl.DateTimeFormat(undefined, { timeStyle: "short" });

const itemTitle = (item) => item?.metadata?.displayTitle || item?.name || "Untitled visual";
const referenceKey = (reference) => reference?.visualMediaKey || (reference ? `${reference.rootId}::${reference.relativePath}` : "");
const validDate = (value) => {
  const date = value ? new Date(value) : null;
  return date && Number.isFinite(date.valueOf()) ? date : null;
};
const formatDate = (value) => {
  const date = validDate(value);
  return date ? DATE_TIME_FORMATTER.format(date) : "Unknown";
};
const positiveNumber = (value) => {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? number : 0;
};
const formatBitrate = (value) => {
  const bitrate = positiveNumber(value);
  if (!bitrate) return "Unknown";
  return bitrate >= 1_000_000 ? `${(bitrate / 1_000_000).toFixed(1)} Mbps` : `${Math.round(bitrate / 1_000)} kbps`;
};
const formatFrameRate = (value) => {
  const frameRate = positiveNumber(value);
  return frameRate ? `${Number(frameRate.toFixed(3))} fps` : "—";
};
const formatSampleRate = (value) => {
  const sampleRate = positiveNumber(value);
  return sampleRate ? `${Number((sampleRate / 1000).toFixed(1))} kHz` : "";
};
const technicalSummary = (item) => [
  item.frameRate ? formatFrameRate(item.frameRate) : "",
  item.bitrate ? formatBitrate(item.bitrate) : "",
  item.pixelFormat,
  item.audioCodec ? `${item.audioCodec}${item.audioChannels ? ` · ${item.audioChannels} ch` : ""}${item.audioSampleRate ? ` · ${formatSampleRate(item.audioSampleRate)}` : ""}` : "",
].filter(Boolean).join(" · ") || "No additional technical metadata";
const rowAccessibleLabel = (item, trackTitle) => [
  itemTitle(item),
  item.mediaType === "video" ? "Video" : "Image",
  VISUAL_FORMAT_LABELS[item.metadata.format] || item.metadata.format,
  trackTitle === "—" ? "No track assigned" : `Track ${trackTitle}`,
  item.metadata.readiness,
  item.firstIndexedAt ? `Added ${formatDate(item.firstIndexedAt)}` : "",
  item.modifiedAt ? `Modified ${formatDate(item.modifiedAt)}` : "",
].filter(Boolean).join(". ");
const splitList = (value) => [...new Set(value.split(",").map((entry) => entry.trim()).filter(Boolean))];

function DateCell({ value }) {
  const date = validDate(value);
  return <span className="visual-library-cell visual-library-row-date"><time dateTime={date ? date.toISOString() : undefined} title={date ? DATE_TIME_FORMATTER.format(date) : "Unknown"}><strong>{date ? DATE_FORMATTER.format(date) : "Unknown"}</strong><small>{date ? TIME_FORMATTER.format(date) : ""}</small></time></span>;
}

function MediaThumbnail({ item }) {
  const url = api.visualMediaUrl(item.key);
  return item.mediaType === "image"
    ? <span className="visual-library-thumbnail"><img loading="lazy" src={url} alt="" /></span>
    : <span className="visual-library-thumbnail is-video"><video muted playsInline preload="none" data-src={url} aria-hidden="true" /><PlayIcon size={14} /></span>;
}

function VisualMediaCell({ column, item, trackTitle }) {
  if (column.id === "preview") return <MediaThumbnail item={item} />;
  if (column.id === "title") return <span className="visual-library-cell visual-library-row-title"><strong>{itemTitle(item)}</strong><small>{item.metadata.collection}</small></span>;
  if (column.id === "track") return <span className="visual-library-cell">{trackTitle}</span>;
  if (column.id === "platform") return <span className="visual-library-cell">{item.metadata.platform || "—"}</span>;
  if (column.id === "format") return <span className="visual-library-cell visual-library-row-format"><strong>{item.width && item.height ? `${item.width} × ${item.height}` : "Unknown"}</strong><small>{item.aspect} · {VISUAL_FORMAT_LABELS[item.metadata.format] || item.metadata.format}</small></span>;
  if (column.id === "duration") return <span className="visual-library-cell">{item.mediaType === "video" ? formatDuration(item.duration, true) : "—"}</span>;
  if (column.id === "readiness") return <span className="visual-library-cell visual-library-row-status" data-readiness={item.metadata.readiness}>{item.metadata.readiness}</span>;
  if (column.id === "added") return <DateCell value={item.firstIndexedAt} />;
  if (column.id === "modified") return <DateCell value={item.modifiedAt} />;
  if (column.id === "created") return <DateCell value={item.createdAt} />;
  if (column.id === "size") return <span className="visual-library-cell">{formatBytes(item.size)}</span>;
  if (column.id === "mediaType") return <span className="visual-library-cell">{item.mediaType}</span>;
  if (column.id === "codec") return <span className="visual-library-cell visual-library-row-technical"><strong>{item.codec || "Unknown"}</strong><small>{item.audioCodec ? `Audio: ${item.audioCodec}` : item.pixelFormat || ""}</small></span>;
  if (column.id === "frameRate") return <span className="visual-library-cell">{item.mediaType === "video" ? formatFrameRate(item.frameRate) : "—"}</span>;
  if (column.id === "container") return <span className="visual-library-cell" title={item.container}>{item.container || item.extension}</span>;
  if (column.id === "collection") return <span className="visual-library-cell">{item.metadata.collection || "—"}</span>;
  if (column.id === "filename") return <span className="visual-library-cell" title={item.name}>{item.name}</span>;
  return null;
}

const VisualMediaRow = React.memo(function VisualMediaRow({ item, index, total, visibleColumns, tableStyle, selected, trackTitle, onSelect, onNavigate }) {
  return <div role="option" className="visual-library-row" style={tableStyle} aria-label={rowAccessibleLabel(item, trackTitle)} aria-selected={selected} aria-posinset={index + 1} aria-setsize={total} tabIndex={selected ? 0 : -1} data-visual-media-id={item.id} data-visual-media-index={index} onClick={() => onSelect(item.id)} onKeyDown={onNavigate}>{visibleColumns.map((column) => <VisualMediaCell key={column.id} column={column} item={item} trackTitle={trackTitle} />)}</div>;
});

function ColumnPicker({ visibleColumnIds, visibleCount, onChange, onReset }) {
  return <details className="visual-library-column-picker"><summary><GridIcon /> Columns <span>{visibleCount}</span></summary><div role="group" aria-label="Visible media library columns"><header><strong>Visible columns</strong><button type="button" onClick={onReset}>Reset</button></header>{VISUAL_LIBRARY_COLUMNS.map((column) => <label key={column.id}><input type="checkbox" checked={visibleColumnIds.includes(column.id)} disabled={column.required} onChange={(event) => onChange(column, event.target.checked)} /><span>{column.label}</span>{column.required ? <small>Always shown</small> : null}</label>)}</div></details>;
}

function MetadataEditor({ item, album, saving, onSave }) {
  const [form, setForm] = useState(() => ({ ...item.metadata, subjects: (item.metadata.subjects || []).join(", "), tags: (item.metadata.tags || []).join(", ") }));
  useEffect(() => {
    setForm({ ...item.metadata, subjects: (item.metadata.subjects || []).join(", "), tags: (item.metadata.tags || []).join(", ") });
  }, [item.id, item.metadata]);
  const update = (field, value) => setForm((current) => ({ ...current, [field]: value }));
  return (
    <details className="visual-metadata-editor">
      <summary>Edit title, relationships, tags, and notes</summary>
      <form onSubmit={(event) => {
        event.preventDefault();
        onSave({ ...form, subjects: splitList(form.subjects || ""), tags: splitList(form.tags || ""), albumId: form.trackId ? album.id : form.albumId });
      }}>
        <label className="visual-metadata-wide">Display title<input required maxLength={160} value={form.displayTitle || ""} onChange={(event) => update("displayTitle", event.target.value)} /></label>
        <label>Album relationship<select value={form.albumId || ""} onChange={(event) => update("albumId", event.target.value)}><option value="">No album relationship</option><option value={album.id}>{album.title}</option></select></label>
        <label>Song / track<select value={form.trackId || ""} onChange={(event) => update("trackId", event.target.value)}><option value="">No track relationship</option>{album.tracks.map((track, index) => <option key={track.id} value={track.id}>{index + 1}. {track.title}</option>)}</select></label>
        <label>Format<select value={form.format || ""} onChange={(event) => update("format", event.target.value)}>{VISUAL_FORMATS.filter(([value]) => value !== "all").map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
        <label>Readiness<select value={form.readiness || ""} onChange={(event) => update("readiness", event.target.value)}>{READINESS_OPTIONS.map((value) => <option key={value}>{value}</option>)}</select></label>
        <label>Platform<input maxLength={160} value={form.platform || ""} onChange={(event) => update("platform", event.target.value)} /></label>
        <label>Collection<input maxLength={160} value={form.collection || ""} onChange={(event) => update("collection", event.target.value)} /></label>
        <label>Members / subjects<input maxLength={500} value={form.subjects || ""} onChange={(event) => update("subjects", event.target.value)} placeholder="Comma-separated" /></label>
        <label>Tags<input maxLength={500} value={form.tags || ""} onChange={(event) => update("tags", event.target.value)} placeholder="Comma-separated" /></label>
        <label className="visual-metadata-wide">Notes<textarea maxLength={2000} value={form.notes || ""} onChange={(event) => update("notes", event.target.value)} /></label>
        <div className="visual-metadata-actions"><button type="submit" className="primary-button" disabled={saving}>{saving ? "Saving…" : "Save Metadata"}</button></div>
      </form>
    </details>
  );
}

export function VisualMediaLibrary({ album, selectedTrackId, audioPlaying, onAlbumChange, onVideoPlay }) {
  const [payload, setPayload] = useState(EMPTY_PAYLOAD);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [selectedId, setSelectedId] = useState("");
  const [savingMetadata, setSavingMetadata] = useState(false);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [visibleColumnIds, setVisibleColumnIds] = useState(loadVisualLibraryColumnIds);
  const [filters, setFilters] = useState({ scope: "project", query: "", format: "all", mediaType: "all", aspect: "all", trackId: selectedTrackId || "", platform: "all", readiness: "all", sort: "recommended" });
  const searchRef = useRef(null);
  const listRef = useRef(null);
  const previewVideoRef = useRef(null);

  const loadLibrary = useCallback(async (rescan = false) => {
    setError("");
    if (!rescan) setLoading(true);
    else setPayload((current) => ({ ...current, scanning: true }));
    try {
      const next = await (rescan ? api.rescanVisualLibrary() : api.visualLibrary());
      setPayload(next);
      setSelectedId((current) => next.items.some((item) => item.id === current) ? current : next.items[0]?.id || "");
      if (rescan) setNotice(`Visual library refreshed: ${next.items.length} indexed item${next.items.length === 1 ? "" : "s"}.`);
    } catch (reason) {
      setError(reason.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadLibrary(); }, [loadLibrary]);
  useEffect(() => {
    setFilters((current) => current.scope === "project" ? { ...current, trackId: selectedTrackId || "" } : current);
  }, [selectedTrackId]);
  useEffect(() => {
    if (audioPlaying && previewVideoRef.current && !previewVideoRef.current.paused) previewVideoRef.current.pause();
  }, [audioPlaying]);
  useEffect(() => {
    const focusSearch = (event) => {
      if (event.key !== "/" || event.shiftKey || event.altKey || event.ctrlKey || event.metaKey || event.defaultPrevented) return;
      if (event.target instanceof Element && event.target.closest("input, textarea, select, button, video, [contenteditable='true'], [role='dialog']")) return;
      event.preventDefault();
      searchRef.current?.focus();
    };
    window.addEventListener("keydown", focusSearch);
    return () => window.removeEventListener("keydown", focusSearch);
  }, []);

  const items = payload.items || [];
  const { platforms, formatCounts } = useMemo(() => summarizeVisualItems(items), [items]);
  const trackTitlesById = useMemo(() => new Map(album.tracks.map((track) => [track.id, track.title])), [album.tracks]);
  const deferredQuery = useDeferredValue(filters.query);
  const filteredItems = useMemo(() => filterVisualItems(items, {
    scope: filters.scope,
    query: deferredQuery,
    format: filters.format,
    mediaType: filters.mediaType,
    aspect: filters.aspect,
    trackId: filters.trackId,
    platform: filters.platform,
    readiness: filters.readiness,
    sort: filters.sort,
  }, album), [
    album,
    deferredQuery,
    filters.aspect,
    filters.format,
    filters.mediaType,
    filters.platform,
    filters.readiness,
    filters.scope,
    filters.sort,
    filters.trackId,
    items,
  ]);
  const searchPending = filters.query !== deferredQuery;
  const visibleColumns = useMemo(() => VISUAL_LIBRARY_COLUMNS.filter(({ id }) => visibleColumnIds.includes(id)), [visibleColumnIds]);
  const tableStyle = useMemo(() => ({
    "--visual-library-columns": visibleColumns.map(({ width }) => width).join(" "),
    "--visual-library-min-width": `${visibleColumns.reduce((total, column) => total + column.minimum, 0)}px`,
  }), [visibleColumns]);
  const selected = useMemo(() => filteredItems.find((item) => item.id === selectedId) || filteredItems[0] || null, [filteredItems, selectedId]);
  useEffect(() => {
    if (selected && selected.id !== selectedId) setSelectedId(selected.id);
  }, [selected, selectedId]);
  useEffect(() => {
    const observer = new IntersectionObserver((entries) => {
      for (const entry of entries) {
        if (!entry.isIntersecting) continue;
        const video = entry.target;
        if (!video.src) video.src = video.dataset.src;
        observer.unobserve(video);
      }
    }, { root: listRef.current, rootMargin: "120px" });
    listRef.current?.querySelectorAll("video[data-src]").forEach((video) => observer.observe(video));
    return () => observer.disconnect();
  }, [filteredItems]);

  const replaceItem = (nextItem) => setPayload((current) => ({ ...current, items: current.items.map((item) => item.id === nextItem.id ? nextItem : item) }));
  const setColumnVisibility = (column, visible) => {
    if (column.required) return;
    setVisibleColumnIds((current) => saveVisualLibraryColumnIds(visible ? [...current, column.id] : current.filter((id) => id !== column.id)));
  };
  const resetColumns = () => setVisibleColumnIds(saveVisualLibraryColumnIds(DEFAULT_VISUAL_LIBRARY_COLUMN_IDS));
  const navigateRows = useCallback((event) => {
    const currentIndex = Number(event.currentTarget.dataset.visualMediaIndex);
    if (!Number.isInteger(currentIndex) || event.altKey || event.ctrlKey || event.metaKey) return;
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      setSelectedId(filteredItems[currentIndex]?.id || "");
      return;
    }
    const lastIndex = filteredItems.length - 1;
    const nextIndex = event.key === "ArrowDown" ? Math.min(currentIndex + 1, lastIndex)
      : event.key === "ArrowUp" ? Math.max(currentIndex - 1, 0)
        : event.key === "PageDown" ? Math.min(currentIndex + 10, lastIndex)
          : event.key === "PageUp" ? Math.max(currentIndex - 10, 0)
            : event.key === "Home" ? 0
              : event.key === "End" ? lastIndex
                : -1;
    if (nextIndex < 0 || nextIndex === currentIndex) return;
    event.preventDefault();
    const nextItem = filteredItems[nextIndex];
    setSelectedId(nextItem.id);
    requestAnimationFrame(() => {
      const row = listRef.current?.querySelector(`[data-visual-media-id="${nextItem.id}"]`);
      row?.focus({ preventScroll: true });
      row?.scrollIntoView({ block: event.key === "ArrowDown" || event.key === "ArrowUp" ? "nearest" : "center" });
    });
  }, [filteredItems]);
  const saveMetadata = async (metadata) => {
    if (!selected) return;
    setSavingMetadata(true);
    setError("");
    try {
      const { item } = await api.updateVisualMetadata(selected.id, metadata);
      replaceItem(item);
      setNotice(`Metadata saved for ${itemTitle(item)}.`);
    } catch (reason) {
      setError(reason.message);
    } finally {
      setSavingMetadata(false);
    }
  };

  const attach = async (scope) => {
    if (!selected) return;
    const reference = createVisualAssetReference(selected);
    onAlbumChange((draft) => {
      const target = scope === "album" ? draft : draft.tracks.find((track) => track.id === selectedTrackId);
      if (!target) return;
      const existing = new Set((target.visualAssets || []).map(referenceKey));
      if (!existing.has(referenceKey(reference))) target.visualAssets = [...(target.visualAssets || []), reference];
    });
    const relationship = scope === "album"
      ? { ...selected.metadata, albumId: album.id, trackId: "" }
      : { ...selected.metadata, albumId: album.id, trackId: selectedTrackId };
    try {
      const { item } = await api.updateVisualMetadata(selected.id, relationship);
      replaceItem(item);
    } catch {
      // The portable project reference is already safe and saved; a metadata
      // retry remains available without undoing the attachment.
    }
    setNotice(`${itemTitle(selected)} attached to ${scope === "album" ? album.title : trackTitlesById.get(selectedTrackId) || "the selected track"}. No media was copied.`);
  };

  const copyPath = async () => {
    if (!selected?.originalPath) return;
    try {
      await navigator.clipboard.writeText(selected.originalPath);
      setNotice("Original local path copied.");
    } catch {
      setError("The local path could not be copied in this browser session.");
    }
  };

  if (payload.capability === "local-only") {
    return <section className="visual-library-capability" role="status"><VideoIcon size={34} /><h3>Local visual library</h3><p>{payload.message}</p><strong>No device media is uploaded or simulated in hosted mode.</strong></section>;
  }

  return (
    <section className="visual-library-workspace" aria-labelledby="visual-library-title">
      <header className="visual-library-toolbar">
        <div><h2 id="visual-library-title">Video &amp; Graphics Library</h2><p>Indexed originals remain in place. Metadata and project relationships are saved separately.</p></div>
        <label className="visual-library-search"><SearchIcon /><span className="sr-only">Search visual media</span><input ref={searchRef} type="search" value={filters.query} onChange={(event) => setFilters((current) => ({ ...current, query: event.target.value }))} placeholder="Search titles, tracks, formats, subjects, or filenames" /><kbd>/</kbd></label>
        <button type="button" className="text-button visual-library-refresh" disabled={payload.scanning} onClick={() => loadLibrary(true)}><RefreshIcon /> {payload.scanning ? "Scanning…" : "Rescan"}</button>
      </header>

      <div className="visual-library-scope" role="group" aria-label="Library scope"><button type="button" aria-pressed={filters.scope === "project"} onClick={() => setFilters((current) => ({ ...current, scope: "project", trackId: selectedTrackId || "" }))}>Project focus</button><button type="button" aria-pressed={filters.scope === "all"} onClick={() => setFilters((current) => ({ ...current, scope: "all", trackId: "" }))}>All Media</button></div>
      <nav className="visual-format-strip" aria-label="Visual-media formats">{VISUAL_FORMATS.map(([value, label]) => <button type="button" key={value} aria-current={filters.format === value ? "page" : undefined} onClick={() => setFilters((current) => ({ ...current, format: value }))}><span>{value === "all" ? <GridIcon /> : value === "static-post" || value === "feed-square" ? <ImageIcon /> : <VideoIcon />}{label}</span><small>{value === "all" ? items.length : formatCounts.get(value) || 0}</small></button>)}</nav>

      <button type="button" className="visual-mobile-filter-toggle" aria-expanded={filtersOpen} aria-controls="visual-library-filters" onClick={() => setFiltersOpen((current) => !current)}><FilterIcon /> Filters</button>
      <section className={`visual-library-filters ${filtersOpen ? "is-open" : ""}`} id="visual-library-filters" aria-label="Visual-library filters">
        <label>Song / track<select value={filters.trackId} onChange={(event) => setFilters((current) => ({ ...current, trackId: event.target.value }))}><option value="">All album tracks</option>{album.tracks.map((track, index) => <option key={track.id} value={track.id}>{index + 1}. {track.title}</option>)}</select></label>
        <label>Platform<select value={filters.platform} onChange={(event) => setFilters((current) => ({ ...current, platform: event.target.value }))}><option value="all">All platforms</option>{platforms.map((value) => <option key={value}>{value}</option>)}</select></label>
        <label>Readiness<select value={filters.readiness} onChange={(event) => setFilters((current) => ({ ...current, readiness: event.target.value }))}><option value="all">All stages</option>{READINESS_OPTIONS.map((value) => <option key={value}>{value}</option>)}</select></label>
        <label>Media / aspect<select value={`${filters.mediaType}|${filters.aspect}`} onChange={(event) => { const [mediaType, aspect] = event.target.value.split("|"); setFilters((current) => ({ ...current, mediaType, aspect })); }}><option value="all|all">All media / aspects</option><option value="video|all">All videos</option><option value="image|all">All images</option>{ASPECT_OPTIONS.map((value) => <option key={value} value={`all|${value}`}>{value}</option>)}</select></label>
        <label>Sort<select value={filters.sort} onChange={(event) => setFilters((current) => ({ ...current, sort: event.target.value }))}><option value="recommended">Recommended order</option><option value="added">Added (newest)</option><option value="newest">Modified (newest)</option><option value="created">Created (newest)</option><option value="title">Title (A–Z)</option><option value="duration">Duration (longest)</option><option value="size">File size (largest)</option></select></label>
        <button type="button" className="text-button" onClick={() => setFilters({ scope: "all", query: "", format: "all", mediaType: "all", aspect: "all", trackId: "", platform: "all", readiness: "all", sort: "recommended" })}>Clear filters</button>
      </section>

      {error ? <p className="visual-library-message is-error" role="alert">{error}</p> : null}
      {notice ? <p className="visual-library-message" role="status">{notice}</p> : null}
      {loading ? <div className="visual-library-loading" role="status"><span className="loading-wave" /> Indexing configured visual roots…</div> : selected ? (
        <section className="selected-visual-media" aria-live="polite">
          <div className="selected-visual-preview" data-aspect={selected.aspect}>
            <span>{selected.aspect} · {selected.mediaType}</span>
            {selected.mediaType === "video"
              ? <video key={selected.key} ref={previewVideoRef} controls preload="metadata" src={api.visualMediaUrl(selected.key)} data-shortcuts-local="true" aria-label={`Preview ${itemTitle(selected)}`} onPlay={() => onVideoPlay?.()} />
              : <img key={selected.key} src={api.visualMediaUrl(selected.key)} alt={`Preview of ${itemTitle(selected)}`} />}
          </div>
          <div className="selected-visual-details">
            <h3>{itemTitle(selected)}</h3>
            <div className="visual-status-line"><span data-readiness={selected.metadata.readiness}>{selected.metadata.readiness}</span><span>{selected.metadata.platform}</span><span>{selected.width && selected.height ? `${selected.width} × ${selected.height}` : "Dimensions unavailable"}</span>{selected.mediaType === "video" ? <span>{formatDuration(selected.duration, true)}</span> : null}</div>
            <dl><dt>Collection</dt><dd>{selected.metadata.collection || "Unassigned"}</dd><dt>Track</dt><dd>{trackTitlesById.get(selected.metadata.trackId) || "Not assigned"}</dd><dt>Format</dt><dd>{VISUAL_FORMAT_LABELS[selected.metadata.format] || selected.metadata.format}</dd><dt>File</dt><dd>{selected.extension.toUpperCase()} · {selected.codec} · {formatBytes(selected.size)}</dd><dt>Technical</dt><dd>{technicalSummary(selected)}</dd><dt>Added</dt><dd>{formatDate(selected.firstIndexedAt)}</dd><dt>Created</dt><dd>{formatDate(selected.createdAt)}</dd><dt>Modified</dt><dd>{formatDate(selected.modifiedAt)}</dd></dl>
            <div className="selected-visual-path"><span>Original file reference</span><code title={selected.originalPath}>{selected.originalPath}</code></div>
            <div className="selected-visual-actions"><button type="button" className="primary-button" onClick={() => attach("album")}>Attach to Album</button><button type="button" className="text-button" disabled={!selectedTrackId} onClick={() => attach("track")}>Attach to Track</button><button type="button" className="text-button" onClick={() => api.revealVisualMedia(selected.key).then(() => setNotice("Original revealed in Finder.")).catch((reason) => setError(reason.message))}><ExternalLinkIcon /> Reveal</button><button type="button" className="text-button" onClick={copyPath}><CopyIcon /> Copy path</button></div>
            <MetadataEditor item={selected} album={album} saving={savingMetadata} onSave={saveMetadata} />
          </div>
        </section>
      ) : <div className="visual-library-empty"><strong>No visual media matches this view.</strong><span>{filters.scope === "project" ? "Choose All Media or connect metadata to this album or track." : "Clear a filter or configure a visual root."}</span><button type="button" className="text-button" onClick={() => setFilters((current) => ({ ...current, scope: "all", query: "", format: "all", platform: "all", readiness: "all" }))}>Show All Media</button></div>}

      <section className="visual-library-list" aria-labelledby="visual-library-list-title">
        <header><div><h3 id="visual-library-list-title">Media Library</h3><p>{filteredItems.length} of {items.length} items · {filters.scope === "project" ? "Project focus" : "All Media"}</p><small id="visual-library-keyboard-help" className="visual-library-keyboard-hint">Keyboard: Up/Down moves one result, Page Up/Down moves ten, and Home/End jumps to the list edges.</small></div><div className="visual-library-list-controls"><small>{payload.scan?.completedAt ? `Indexed ${formatDate(payload.scan.completedAt)}` : "Not yet indexed"}</small><ColumnPicker visibleColumnIds={visibleColumnIds} visibleCount={visibleColumns.length} onChange={setColumnVisibility} onReset={resetColumns} /></div></header>
        <div ref={listRef} className="visual-library-table-scroll"><div className="visual-library-table-head" style={tableStyle} aria-hidden="true">{visibleColumns.map((column) => <span key={column.id}>{column.label}</span>)}</div><div className="visual-library-rows" role="listbox" aria-labelledby="visual-library-list-title" aria-describedby="visual-library-keyboard-help" aria-orientation="vertical" aria-busy={searchPending} data-shortcuts-local="true">{filteredItems.map((item, index) => <VisualMediaRow key={item.id} item={item} index={index} total={filteredItems.length} visibleColumns={visibleColumns} tableStyle={tableStyle} selected={item.id === selected?.id} trackTitle={trackTitlesById.get(item.metadata.trackId) || "—"} onSelect={setSelectedId} onNavigate={navigateRows} />)}</div></div>
      </section>

      <details className="visual-format-guide">
        <summary>Platform format cheat sheet</summary>
        <div><article><h3>YouTube 16:9</h3><strong>1920 × 1080</strong><p>Landscape masters and full-song video.</p></article><article><h3>Reels / Shorts</h3><strong>1080 × 1920 · 9:16</strong><p>Full-screen vertical delivery.</p></article><article><h3>Feed square</h3><strong>1080 × 1080 · 1:1</strong><p>Dedicated square art or video.</p></article><article><h3>Spotify Canvas</h3><strong>1080 × 1920 · 9:16</strong><p>Short silent looping video.</p></article><article><h3>Feed portrait</h3><strong>1080 × 1350 · 4:5</strong><p>High-visibility static feed format.</p></article></div>
      </details>
    </section>
  );
}
