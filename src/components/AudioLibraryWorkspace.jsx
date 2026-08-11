import React, { useEffect, useMemo, useState } from "react";
import { sourceKey } from "../lib/api.js";
import { formatBytes, formatDuration } from "../lib/format.js";
import { addFileAsNewTrack, addFileCandidate } from "../lib/import-tracks.js";
import { createLibrarySearchIndex, saveLibraryFilter } from "../lib/library-search.js";
import { FolderIcon, LockIcon, MusicIcon, PlayIcon, PlusIcon, RefreshIcon, SearchIcon, WaveIcon } from "./Icons.jsx";

export function AudioLibraryWorkspace({ state, activeAlbum, library, roots, formats, scan, watching, onlineApp = false, revealPrivateFilenames, scanning, draggedAudioKey = "", onRescan, onPreviewFile, onProjectChange, onAlbumChangeById, onAudioDragStart, onAudioDragEnd, onImportFiles, onImportFolder }) {
  const [query, setQuery] = useState("");
  const [format, setFormat] = useState("all");
  const [rootId, setRootId] = useState("all");
  const [usageFilter, setUsageFilter] = useState("all");
  const [filterName, setFilterName] = useState("");
  const [savedFilterId, setSavedFilterId] = useState("");
  const [selectedKey, setSelectedKey] = useState(library[0]?.key || "");
  const [targetAlbumId, setTargetAlbumId] = useState(activeAlbum.id);
  const [targetTrackId, setTargetTrackId] = useState(activeAlbum.tracks[0]?.id || "");
  const [importNotice, setImportNotice] = useState(null);

  useEffect(() => {
    setTargetAlbumId(activeAlbum.id);
    setTargetTrackId(activeAlbum.tracks[0]?.id || "");
  }, [activeAlbum.id]);
  useEffect(() => {
    if (!library.some((file) => file.key === selectedKey)) setSelectedKey(library[0]?.key || "");
  }, [library, selectedKey]);

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
  const searchIndex = useMemo(() => createLibrarySearchIndex(library), [library]);
  const matchingKeys = useMemo(() => searchIndex.search(query), [searchIndex, query]);
  const savedFilters = state.settings?.librarySavedFilters || [];
  const sessionFileCount = useMemo(() => {
    const sessionRootIds = new Set(roots.filter((root) => root.kind === "browser-session").map((root) => root.id));
    return library.filter((file) => sessionRootIds.has(file.rootId)).length;
  }, [library, roots]);

  const filtered = useMemo(() => library.filter((file) => {
    const used = usageMap.has(file.key);
    return matchingKeys.has(file.key)
      && (format === "all" || file.extension === format)
      && (rootId === "all" || file.rootId === rootId)
      && (usageFilter === "all" || (usageFilter === "assigned" ? used : !used));
  }), [library, matchingKeys, format, rootId, usageFilter, usageMap]);

  const applySavedFilter = (id) => {
    setSavedFilterId(id);
    const saved = savedFilters.find((filter) => filter.id === id);
    if (!saved) return;
    setQuery(saved.query);
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
    setQuery("");
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
        <div className="library-heading"><div><h2>Audio Library</h2><small id="audio-library-drag-help">Drag a file onto an album at left. Matching track titles become candidates.</small></div><p>{filtered.length} of {library.length} discovered files</p></div>
        <div className="library-filters">
          <label className="search-field"><SearchIcon /><span className="sr-only">Search files</span><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search files" /></label>
          <select aria-label="Filter by format" value={format} onChange={(event) => setFormat(event.target.value)}><option value="all">All formats</option>{formats.map((item) => <option key={item} value={item}>{item.toUpperCase()}</option>)}</select>
          <select aria-label="Filter by root" value={rootId} onChange={(event) => setRootId(event.target.value)}><option value="all">All roots</option>{roots.map((root) => <option key={root.id} value={root.id}>{root.label}</option>)}</select>
          <select aria-label="Filter by usage" value={usageFilter} onChange={(event) => setUsageFilter(event.target.value)}><option value="all">All usage</option><option value="unassigned">Unassigned</option><option value="assigned">Assigned</option></select>
          <button type="button" className="text-button" disabled={scanning} title={onlineApp ? "Refresh the current browser-session library" : "Rescan configured sources"} onClick={onRescan}><RefreshIcon /> {scanning ? "Scanning…" : onlineApp ? "Refresh" : "Rescan"}</button>
        </div>
        <div className="saved-filter-bar"><label>Saved filter<select value={savedFilterId} onChange={(event) => applySavedFilter(event.target.value)}><option value="">Choose saved filter</option>{savedFilters.map((filter) => <option key={filter.id} value={filter.id}>{filter.name}</option>)}</select></label><form onSubmit={saveCurrentFilter}><input aria-label="Saved filter name" required value={filterName} onChange={(event) => setFilterName(event.target.value)} placeholder="Filter name" /><button type="submit" className="text-button">Save Current</button></form><button type="button" className="text-button text-button--danger" disabled={!savedFilterId} onClick={deleteSavedFilter}>Delete</button></div>
        <div className="audio-table" role="table" aria-label="Audio files">
          <div className="audio-table-head" role="row"><span>File</span><span>Path</span><span>Format</span><span>Duration</span><span>Used by</span><span>Preview</span><span>Action</span></div>
          <div className="audio-table-body">
            {filtered.map((file) => {
              const usages = usageMap.get(file.key) || [];
              const privateFile = protectedKeys.has(file.key) && !revealPrivateFilenames;
              return (
                <div className={`audio-row ${selectedKey === file.key ? "is-selected" : ""} ${draggedAudioKey === file.key ? "is-dragging" : ""}`} key={file.key} draggable onClick={() => setSelectedKey(file.key)} onDragStart={(event) => { event.dataTransfer.effectAllowed = "copy"; event.dataTransfer.setData("text/plain", file.key); setSelectedKey(file.key); onAudioDragStart?.(file.key); }} onDragEnd={() => onAudioDragEnd?.()} onKeyDown={(event) => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); setSelectedKey(file.key); } }} aria-describedby="audio-library-drag-help" role="row" tabIndex="0">
                  <span className="audio-name"><WaveIcon /> <strong>{privateFile ? <><LockIcon /> [Private source file]</> : file.name}</strong></span>
                  <span title={file.relativePath}>{rootMap.get(file.rootId)?.label || file.rootId}/{privateFile ? "[protected]" : file.relativePath.replace(`/${file.name}`, "")}</span>
                  <span>{file.extension.toUpperCase()}</span>
                  <span>{formatDuration(file.duration)}</span>
                  <span className={usages.length ? "" : "is-unassigned"}>{usages.length ? usages.map((usage) => usage.trackTitle).join(", ") : "Unassigned"}</span>
                  <span><button type="button" className="icon-button" aria-label={`Preview ${displayName(file)}`} onClick={(event) => { event.stopPropagation(); onPreviewFile(file, displayName(file)); }}><PlayIcon /></button></span>
                  <span className="audio-action">Drag / assign</span>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      <aside className="library-inspector">
        <section className="source-summary">
          <h2>Audio Sources</h2>
          <p className="watch-status"><strong>{onlineApp ? "Album previews + device audio" : watching?.enabled ? "Watching connected folders" : watching?.configured ? "Watching unavailable" : "Manual incremental rescans"}</strong><span>{onlineApp ? `${sessionFileCount} device file${sessionFileCount === 1 ? "" : "s"} in this session · never uploaded` : scan ? `${scan.reusedMetadata} cached · ${scan.probedMetadata} updated` : "Scan status unavailable"}</span></p>
          <div className="source-summary-actions"><button type="button" className="text-button" disabled={scanning} title={onlineApp ? "Choose audio files from this device for the current browser session" : "Add audio files"} onClick={() => importIntoLibrary(onImportFiles)}><MusicIcon /> {scanning ? "Indexing…" : "Add Files"}</button><button type="button" className="text-button" disabled={scanning} title={onlineApp ? "Choose an audio folder from this device for the current browser session" : "Add an audio folder"} onClick={() => importIntoLibrary(onImportFolder)}><FolderIcon /> {scanning ? "Indexing…" : "Add Folder"}</button></div>
          {importNotice && <p className={`library-import-status is-${importNotice.kind}`} role="status">{importNotice.message}</p>}
          <ul>{roots.map((root) => <li key={root.id}><span>{root.label}<small>{root.path}</small></span><strong className={root.connected ? "is-connected" : "is-offline"}>{root.connectionState === "reconnected" ? "Reconnected" : root.connected ? "Connected" : "Offline"}</strong></li>)}</ul>
          <p>{onlineApp ? "Selected audio plays directly from this device for the current session. Reloading disconnects it; no audio is uploaded or copied." : "Audio remains in its original location."}</p>
        </section>
        <dl className="scan-summary">
          <div><dt>{library.length}</dt><dd>Files</dd></div>
          <div><dt>{formats.length}</dt><dd>Formats</dd></div>
          <div><dt>{roots.length}</dt><dd>Paths</dd></div>
          <div><dt>{library.filter((file) => !usageMap.has(file.key)).length}</dt><dd>Unassigned</dd></div>
        </dl>
        <section className="selected-file">
          <h2>Selected File</h2>
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
