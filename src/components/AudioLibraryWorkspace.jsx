import React, { useDeferredValue, useEffect, useMemo, useRef, useState } from "react";
import { sourceKey } from "../lib/api.js";
import { loadAudioLibraryColumnWidths, loadAudioLibraryQuery, saveAudioLibraryColumnWidths, saveAudioLibraryQuery } from "../lib/audio-library-preferences.js";
import { formatBytes, formatDuration } from "../lib/format.js";
import { addFileAsNewTrack, addFileCandidate } from "../lib/import-tracks.js";
import { createLibrarySearchIndex, saveLibraryFilter } from "../lib/library-search.js";
import { usePinnedDisclosure } from "../hooks/usePinnedDisclosure.js";
import { ChevronIcon, FolderIcon, LockIcon, MusicIcon, PinIcon, PlayIcon, PlusIcon, RefreshIcon, SearchIcon, WaveIcon } from "./Icons.jsx";
import { ContextActionMenu } from "./ContextActionMenu.jsx";

const AUDIO_LIBRARY_COLUMNS = [
  { id: "file", label: "File", defaultWidth: 220, minimum: 150, maximum: 520 },
  { id: "path", label: "Path", defaultWidth: 190, minimum: 120, maximum: 520 },
  { id: "album", label: "Album", defaultWidth: 150, minimum: 100, maximum: 360 },
  { id: "format", label: "Format", defaultWidth: 68, minimum: 58, maximum: 150 },
  { id: "duration", label: "Duration", defaultWidth: 78, minimum: 68, maximum: 160 },
  { id: "usedBy", label: "Used by", defaultWidth: 160, minimum: 110, maximum: 420 },
  { id: "preview", label: "Preview", defaultWidth: 66, minimum: 58, maximum: 140 },
  { id: "action", label: "Action", defaultWidth: 90, minimum: 74, maximum: 180 },
];
const DEFAULT_COLUMN_WIDTHS = Object.fromEntries(AUDIO_LIBRARY_COLUMNS.map((column) => [column.id, column.defaultWidth]));
const clampColumnWidth = (column, value) => Math.min(column.maximum, Math.max(column.minimum, Math.round(value)));
const initialColumnWidths = () => {
  const stored = loadAudioLibraryColumnWidths();
  return Object.fromEntries(AUDIO_LIBRARY_COLUMNS.map((column) => [column.id, clampColumnWidth(column, stored[column.id] || column.defaultWidth)]));
};

export function AudioLibraryWorkspace({ projectId = "", state, activeAlbum, library, roots, formats, scan, watching, onlineApp = false, revealPrivateFilenames, scanning, draggedAudioKey = "", onRescan, onReconnectSource, onPreviewFile, onProjectChange, onAlbumChangeById, onAudioDragStart, onAudioDragEnd, onImportFiles, onImportFolder }) {
  const [query, setQuery] = useState(() => loadAudioLibraryQuery(projectId));
  const [format, setFormat] = useState("all");
  const [rootId, setRootId] = useState("all");
  const [usageFilter, setUsageFilter] = useState("all");
  const [filterName, setFilterName] = useState("");
  const [savedFilterId, setSavedFilterId] = useState("");
  const { open: savedFiltersOpen, pinned: savedFiltersPinned, setOpen: setSavedFiltersOpen, togglePinned: toggleSavedFiltersPinned } = usePinnedDisclosure("library-saved-filters");
  const [selectedKey, setSelectedKey] = useState(library[0]?.key || "");
  const [targetAlbumId, setTargetAlbumId] = useState(activeAlbum.id);
  const [targetTrackId, setTargetTrackId] = useState(activeAlbum.tracks[0]?.id || "");
  const [importNotice, setImportNotice] = useState(null);
  const [columnWidths, setColumnWidths] = useState(initialColumnWidths);
  const savedFiltersTriggerRef = useRef(null);
  const savedFiltersPanelRef = useRef(null);
  const columnResizeRef = useRef(null);

  const rememberQuery = (value) => {
    setQuery(value);
    saveAudioLibraryQuery(projectId, value);
  };

  useEffect(() => {
    setTargetAlbumId(activeAlbum.id);
    setTargetTrackId(activeAlbum.tracks[0]?.id || "");
  }, [activeAlbum.id]);
  useEffect(() => {
    if (!library.some((file) => file.key === selectedKey)) setSelectedKey(library[0]?.key || "");
  }, [library, selectedKey]);
  useEffect(() => { setQuery(loadAudioLibraryQuery(projectId)); }, [projectId]);

  const usageMap = useMemo(() => {
    const map = new Map();
    state.albums.forEach((album) => album.tracks.forEach((track) => track.candidates.forEach((candidate) => {
      const key = sourceKey(candidate.sourceRef);
      if (!map.has(key)) map.set(key, []);
      map.get(key).push({ albumId: album.id, albumTitle: album.title, trackId: track.id, trackTitle: track.title, protected: track.privacy === "protected" });
    })));
    return map;
  }, [state.albums]);
  const protectedKeys = useMemo(() => new Set([...usageMap.entries()].filter(([, usages]) => usages.some((usage) => usage.protected)).map(([key]) => key)), [usageMap]);
  const rootMap = useMemo(() => new Map(roots.map((root) => [root.id, root])), [roots]);
  const searchContextByKey = useMemo(() => new Map([...usageMap].map(([key, usages]) => [key, usages.map((usage) => `${usage.albumTitle} ${usage.protected && !revealPrivateFilenames ? "[SIGNAL SOURCE WITHHELD]" : usage.trackTitle}`).join(" ")])), [revealPrivateFilenames, usageMap]);
  const searchableLibrary = useMemo(() => library.map((file) => protectedKeys.has(file.key) && !revealPrivateFilenames
    ? { ...file, name: "[Private source file]", relativePath: "[protected]" }
    : file), [library, protectedKeys, revealPrivateFilenames]);
  const searchIndex = useMemo(() => createLibrarySearchIndex(searchableLibrary, { additionalTextByKey: searchContextByKey }), [searchableLibrary, searchContextByKey]);
  const deferredQuery = useDeferredValue(query);
  const matchingKeys = useMemo(() => searchIndex.search(deferredQuery), [searchIndex, deferredQuery]);
  const matchingOrder = useMemo(() => new Map([...matchingKeys].map((key, index) => [key, index])), [matchingKeys]);
  const savedFilters = state.settings?.librarySavedFilters || [];
  const activeSavedFilter = savedFilters.find((filter) => filter.id === savedFilterId);
  const deviceFileCount = useMemo(() => {
    const deviceRootIds = new Set(roots.filter((root) => root.kind === "browser-session" || root.kind === "browser-persistent").map((root) => root.id));
    return library.filter((file) => deviceRootIds.has(file.rootId)).length;
  }, [library, roots]);

  const filtered = useMemo(() => {
    const matches = library.filter((file) => {
      const used = usageMap.has(file.key);
      return matchingKeys.has(file.key)
        && (format === "all" || file.extension === format)
        && (rootId === "all" || file.rootId === rootId)
        && (usageFilter === "all" || (usageFilter === "assigned" ? used : !used));
    });
    if (deferredQuery.trim()) matches.sort((left, right) => matchingOrder.get(left.key) - matchingOrder.get(right.key));
    return matches;
  }, [deferredQuery, format, library, matchingKeys, matchingOrder, rootId, usageFilter, usageMap]);
  useEffect(() => {
    if (filtered.length && !filtered.some((file) => file.key === selectedKey)) setSelectedKey(filtered[0].key);
  }, [filtered, selectedKey]);

  const tableStyle = useMemo(() => ({
    "--audio-library-columns": AUDIO_LIBRARY_COLUMNS.map((column) => `${columnWidths[column.id]}px`).join(" "),
    "--audio-library-min-width": `${AUDIO_LIBRARY_COLUMNS.reduce((total, column) => total + columnWidths[column.id], 0)}px`,
  }), [columnWidths]);
  const columnsChanged = AUDIO_LIBRARY_COLUMNS.some((column) => columnWidths[column.id] !== column.defaultWidth);

  const updateColumnWidth = (column, width, { persist = true } = {}) => {
    const next = { ...columnWidths, [column.id]: clampColumnWidth(column, width) };
    setColumnWidths(next);
    if (persist) saveAudioLibraryColumnWidths(next);
  };
  const startColumnResize = (event, column) => {
    event.preventDefault();
    event.stopPropagation();
    event.currentTarget.setPointerCapture?.(event.pointerId);
    columnResizeRef.current = {
      column,
      pointerId: event.pointerId,
      startX: event.clientX,
      startWidth: columnWidths[column.id],
      startWidths: columnWidths,
      nextWidths: columnWidths,
    };
  };
  const continueColumnResize = (event) => {
    const resize = columnResizeRef.current;
    if (!resize || resize.pointerId !== event.pointerId) return;
    const nextWidths = { ...resize.startWidths, [resize.column.id]: clampColumnWidth(resize.column, resize.startWidth + event.clientX - resize.startX) };
    resize.nextWidths = nextWidths;
    setColumnWidths(nextWidths);
  };
  const finishColumnResize = (event) => {
    const resize = columnResizeRef.current;
    if (!resize || resize.pointerId !== event.pointerId) return;
    event.currentTarget.releasePointerCapture?.(event.pointerId);
    saveAudioLibraryColumnWidths(resize.nextWidths);
    columnResizeRef.current = null;
  };
  const resizeColumnWithKeyboard = (event, column) => {
    if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;
    event.preventDefault();
    const step = event.shiftKey ? 25 : 10;
    const width = event.key === "Home" ? column.minimum
      : event.key === "End" ? column.maximum
        : columnWidths[column.id] + (event.key === "ArrowRight" ? step : -step);
    updateColumnWidth(column, width);
  };
  const resetColumnWidths = () => {
    setColumnWidths(DEFAULT_COLUMN_WIDTHS);
    saveAudioLibraryColumnWidths(DEFAULT_COLUMN_WIDTHS);
  };

  const applySavedFilter = (id) => {
    setSavedFilterId(id);
    const saved = savedFilters.find((filter) => filter.id === id);
    if (!saved) return;
    rememberQuery(saved.query);
    setFormat(saved.format);
    setRootId(saved.rootId);
    setUsageFilter(saved.usageFilter);
  };
  const saveCurrentFilter = (event) => {
    event.preventDefault();
    onProjectChange((draft) => {
      draft.settings ||= {};
      saveLibraryFilter(draft.settings, { name: filterName, query, format, rootId, usageFilter });
    });
    setFilterName("");
  };
  const deleteSavedFilter = () => {
    if (!savedFilterId) return;
    onProjectChange((draft) => {
      draft.settings ||= {};
      draft.settings.librarySavedFilters = (draft.settings.librarySavedFilters || []).filter((filter) => filter.id !== savedFilterId);
    });
    setSavedFilterId("");
  };
  const toggleSavedFilters = () => {
    const nextOpen = !savedFiltersOpen;
    if (!nextOpen && savedFiltersPanelRef.current?.contains(document.activeElement)) savedFiltersTriggerRef.current?.focus();
    setSavedFiltersOpen(nextOpen);
  };

  const importIntoLibrary = async (picker) => {
    setImportNotice(null);
    const result = await picker();
    if (!result?.ok) {
      setImportNotice({ kind: "error", message: "Audio could not be added. Check the error above and try again." });
      return;
    }
    if (result.cancelled) {
      setImportNotice({ kind: "muted", message: "Selection cancelled. The library was not changed." });
      return;
    }
    if (!result.files.length) {
      setImportNotice({ kind: "error", message: "No supported audio files were found in that selection." });
      return;
    }
    rememberQuery("");
    setFormat("all");
    setRootId("all");
    setUsageFilter("all");
    setSavedFilterId("");
    setSelectedKey(result.files[0].key);
    setImportNotice({ kind: "success", message: `${result.files.length} audio file${result.files.length === 1 ? "" : "s"} added and shown below.` });
  };

  const selectedFile = library.find((file) => file.key === selectedKey);
  const targetAlbum = state.albums.find((album) => album.id === targetAlbumId) || activeAlbum;
  const targetTrack = targetAlbum.tracks.find((track) => track.id === targetTrackId);
  const isProtected = selectedFile && protectedKeys.has(selectedFile.key) && !revealPrivateFilenames;
  const displayName = (file) => protectedKeys.has(file.key) && !revealPrivateFilenames ? "[Private source file]" : file.name;

  const addCandidate = () => {
    if (!selectedFile || !targetTrack) return;
    onAlbumChangeById(targetAlbum.id, (draft) => {
      const draftTrack = draft.tracks.find((track) => track.id === targetTrack.id);
      if (!draftTrack) return;
      const result = addFileCandidate(draftTrack, selectedFile);
      if (result.action === "candidate" && draft.status === "empty") draft.status = "working";
    });
  };

  const addNewTrack = () => {
    if (!selectedFile) return;
    onAlbumChangeById(targetAlbum.id, (draft) => {
      addFileAsNewTrack(draft, selectedFile);
    });
  };

  return (
    <main className="library-workspace">
      <section className="library-main">
        <div className="library-heading"><h2 className="sr-only">Audio Library</h2><small id="audio-library-drag-help">Drag a file onto an album rail target. Matching track titles become candidates.</small><div className="library-heading-actions"><p>{filtered.length} of {library.length} discovered files</p><button type="button" className="text-button" disabled={!columnsChanged} onClick={resetColumnWidths}>Reset column widths</button></div></div>
        <div className="library-filters">
          <label className="search-field"><SearchIcon /><span className="sr-only">Search files, albums, and tracks. Partial words and small typos are matched by relevance. This query stays on this device when you switch workspaces.</span><input value={query} maxLength={240} onChange={(event) => rememberQuery(event.target.value)} placeholder="Search files" autoComplete="off" title="Ranked search across files, paths, albums, and tracks. The working query stays on this device." /></label>
          <select aria-label="Filter by format" value={format} onChange={(event) => setFormat(event.target.value)}><option value="all">All formats</option>{formats.map((item) => <option key={item} value={item}>{item.toUpperCase()}</option>)}</select>
          <select aria-label="Filter by root" value={rootId} onChange={(event) => setRootId(event.target.value)}><option value="all">All roots</option>{roots.map((root) => <option key={root.id} value={root.id}>{root.label}</option>)}</select>
          <select aria-label="Filter by usage" value={usageFilter} onChange={(event) => setUsageFilter(event.target.value)}><option value="all">All usage</option><option value="unassigned">Unassigned</option><option value="assigned">Assigned</option></select>
          <button type="button" className="text-button" disabled={scanning} title={onlineApp ? "Refresh remembered and connected audio sources" : "Rescan configured sources"} onClick={onRescan}><RefreshIcon /> {scanning ? "Scanning…" : onlineApp ? "Refresh" : "Rescan"}</button>
        </div>
        <section className={`saved-filter-disclosure ${savedFiltersPinned ? "is-pinned" : ""}`} aria-label="Saved filters">
          <header className="expert-disclosure-header">
            <button ref={savedFiltersTriggerRef} type="button" className="saved-filter-disclosure-trigger" aria-expanded={savedFiltersOpen} aria-controls="saved-filter-panel" onClick={toggleSavedFilters}>
              <span><strong>Saved filters</strong><small>{activeSavedFilter ? `${activeSavedFilter.name} active` : `${savedFilters.length} saved`}</small></span>
              <ChevronIcon direction={savedFiltersOpen ? "up" : "down"} />
            </button>
            <button type="button" className="expert-panel-pin" aria-pressed={savedFiltersPinned} aria-label={`${savedFiltersPinned ? "Stop keeping" : "Keep"} Saved filters open on this device`} title={`${savedFiltersPinned ? "Stop keeping" : "Keep"} this expert panel open on this device`} onClick={toggleSavedFiltersPinned}><PinIcon /></button>
          </header>
          <div ref={savedFiltersPanelRef} className="saved-filter-bar" id="saved-filter-panel" hidden={!savedFiltersOpen}>
            <label>Saved filter<select value={savedFilterId} onChange={(event) => applySavedFilter(event.target.value)}><option value="">Choose saved filter</option>{savedFilters.map((filter) => <option key={filter.id} value={filter.id}>{filter.name}</option>)}</select></label>
            <form onSubmit={saveCurrentFilter}><input aria-label="Saved filter name" required value={filterName} onChange={(event) => setFilterName(event.target.value)} placeholder="Filter name" /><button type="submit" className="text-button">Save Current</button></form>
            <button type="button" className="text-button text-button--danger" disabled={!savedFilterId} onClick={deleteSavedFilter}>Delete</button>
          </div>
        </section>
        <div className="audio-table" role="table" aria-label="Audio files" aria-busy={query !== deferredQuery} style={tableStyle}>
          <div className="audio-table-head" role="row">{AUDIO_LIBRARY_COLUMNS.map((column) => <span role="columnheader" key={column.id} data-audio-column={column.id}><span>{column.label}</span><span className="audio-column-resizer" role="separator" aria-label={`Resize ${column.label} column`} aria-orientation="vertical" aria-valuemin={column.minimum} aria-valuemax={column.maximum} aria-valuenow={columnWidths[column.id]} aria-valuetext={`${columnWidths[column.id]} pixels`} tabIndex={0} title="Drag to resize. Arrow keys adjust; Home and End use the minimum or maximum. Double-click resets." onPointerDown={(event) => startColumnResize(event, column)} onPointerMove={continueColumnResize} onPointerUp={finishColumnResize} onPointerCancel={finishColumnResize} onKeyDown={(event) => resizeColumnWithKeyboard(event, column)} onDoubleClick={() => updateColumnWidth(column, column.defaultWidth)} /></span>)}</div>
          <div className="audio-table-body" role="rowgroup">
            {filtered.map((file) => {
              const usages = usageMap.get(file.key) || [];
              const albumTitles = [...new Set(usages.map((usage) => usage.albumTitle))].join(", ");
              const trackTitles = [...new Set(usages.map((usage) => usage.trackTitle))].join(", ");
              const privateFile = protectedKeys.has(file.key) && !revealPrivateFilenames;
              return (
                <div className={`audio-row ${selectedKey === file.key ? "is-selected" : ""} ${draggedAudioKey === file.key ? "is-dragging" : ""}`} key={file.key} draggable onClick={() => setSelectedKey(file.key)} onDragStart={(event) => { event.dataTransfer.effectAllowed = "copy"; event.dataTransfer.setData("text/plain", file.key); setSelectedKey(file.key); onAudioDragStart?.(file.key); }} onDragEnd={() => onAudioDragEnd?.()} onKeyDown={(event) => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); setSelectedKey(file.key); } }} aria-describedby="audio-library-drag-help" role="row" tabIndex="0">
                  <span className="audio-name" role="cell"><WaveIcon /> <strong>{privateFile ? <><LockIcon /> [Private source file]</> : file.name}</strong></span>
                  <span role="cell" title={file.relativePath}>{rootMap.get(file.rootId)?.label || file.rootId}/{privateFile ? "[protected]" : file.relativePath.replace(`/${file.name}`, "")}</span>
                  <span role="cell" title={albumTitles} className={usages.length ? "audio-album-usage" : "is-unassigned"}>{albumTitles || "Unassigned"}</span>
                  <span role="cell">{file.extension.toUpperCase()}</span>
                  <span role="cell">{formatDuration(file.duration)}</span>
                  <span role="cell" title={trackTitles} className={usages.length ? "" : "is-unassigned"}>{trackTitles || "Unassigned"}</span>
                  <span role="cell"><button type="button" className="icon-button" aria-label={`Preview ${displayName(file)}`} onClick={(event) => { event.stopPropagation(); onPreviewFile(file, displayName(file)); }}><PlayIcon /></button></span>
                  <span className="audio-action" role="cell">Drag / assign</span>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      <aside className="library-inspector">
        <section className="source-summary">
          <h2>Audio Sources</h2>
          <p className="watch-status"><strong>{onlineApp ? "Album previews + remembered device audio" : watching?.enabled ? "Watching connected folders" : watching?.configured ? "Watching unavailable" : "Manual incremental rescans"}</strong><span>{onlineApp ? `${deviceFileCount} device file${deviceFileCount === 1 ? "" : "s"} ready · never uploaded` : scan ? `${scan.reusedMetadata} cached · ${scan.probedMetadata} updated` : "Scan status unavailable"}</span></p>
          <div className="source-summary-actions"><button type="button" className="text-button" disabled={scanning} title={onlineApp ? "Choose audio files and remember access when the browser supports it" : "Add audio files"} onClick={() => importIntoLibrary(onImportFiles)}><MusicIcon /> {scanning ? "Indexing…" : "Add Files"}</button><button type="button" className="text-button" disabled={scanning} title={onlineApp ? "Choose an audio folder and remember access when the browser supports it" : "Add an audio folder"} onClick={() => importIntoLibrary(onImportFolder)}><FolderIcon /> {scanning ? "Indexing…" : "Add Folder"}</button></div>
          {importNotice && <p className={`library-import-status is-${importNotice.kind}`} role="status">{importNotice.message}</p>}
          <ul>{roots.map((root) => <li key={root.id}><span>{root.label}<small>{root.path}</small></span><div className="source-connection"><strong className={root.connected ? "is-connected" : "is-offline"}>{root.connectionState === "reconnected" ? "Reconnected" : root.connectionState === "permission-required" ? "Access needed" : root.connected ? "Connected" : "Offline"}</strong>{onlineApp && root.kind === "browser-persistent" && !root.connected ? <button type="button" className="icon-button" disabled={scanning} aria-label={`Reconnect ${root.label}`} title={`Reconnect ${root.label}`} onClick={() => onReconnectSource(root.id)}><RefreshIcon /></button> : null}</div></li>)}</ul>
          <p>{onlineApp ? "Remembered sources reconnect automatically after reload. If the browser pauses access, use Reconnect once—there is no need to find the folder again. Audio is never uploaded or copied." : "Audio remains in its original location."}</p>
        </section>
        <section className="selected-file">
          <header className="selected-file-heading"><h2>Selected File</h2>{selectedFile ? <ContextActionMenu label={`Actions for ${displayName(selectedFile)}`} items={[
            { id: "preview", label: "Preview selected file", description: "Play the indexed source without changing it", Icon: PlayIcon, onSelect: () => onPreviewFile(selectedFile, displayName(selectedFile)) },
            { id: "candidate", label: "Add as candidate", description: targetTrack ? `Assign to ${targetTrack.title}` : "Choose a target track first", Icon: PlusIcon, disabled: !targetTrack, onSelect: addCandidate },
            { id: "new-track", label: "Add as new track", description: `Append to ${targetAlbum.title}`, Icon: PlusIcon, onSelect: addNewTrack },
          ]} /> : null}</header>
          {selectedFile ? <>
            <div className="selected-file-identity"><WaveIcon size={30}/><div><strong>{displayName(selectedFile)}</strong><small>{isProtected ? "Protected path" : selectedFile.relativePath}</small><span>{selectedFile.extension.toUpperCase()} · {formatDuration(selectedFile.duration, true)} · {formatBytes(selectedFile.size)}</span></div></div>
            <label>Assign to album<select value={targetAlbum.id} onChange={(event) => { const next = state.albums.find((album) => album.id === event.target.value); setTargetAlbumId(event.target.value); setTargetTrackId(next?.tracks[0]?.id || ""); }}>{state.albums.map((album) => <option key={album.id} value={album.id}>{album.title}</option>)}</select></label>
            <label>Assign to track<select value={targetTrack?.id || ""} onChange={(event) => setTargetTrackId(event.target.value)} disabled={!targetAlbum.tracks.length}><option value="">{targetAlbum.tracks.length ? "Choose a track" : "No tracks yet"}</option>{targetAlbum.tracks.map((track) => <option key={track.id} value={track.id}>{track.title}</option>)}</select></label>
            <button type="button" className="primary-button primary-button--yellow" onClick={addCandidate} disabled={!targetTrack}><PlusIcon /> Add as Candidate</button>
            <button type="button" className="primary-button" onClick={addNewTrack}><PlusIcon /> Add as New Track</button>
          </> : <p>No file selected.</p>}
        </section>
      </aside>
    </main>
  );
}
