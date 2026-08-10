import React, { useEffect, useMemo, useState } from "react";
import { sourceKey } from "../lib/api.js";
import { formatBytes, formatDuration, slugify, titleFromFilename } from "../lib/format.js";
import { createLibrarySearchIndex, saveLibraryFilter } from "../lib/library-search.js";
import { FolderIcon, LockIcon, MusicIcon, PlayIcon, PlusIcon, RefreshIcon, SearchIcon, WaveIcon } from "./Icons.jsx";

export function AudioLibraryWorkspace({ state, activeAlbum, library, roots, formats, scan, watching, hostedDemo = false, revealPrivateFilenames, scanning, onRescan, onPreviewFile, onProjectChange, onAlbumChangeById, onImportFiles, onImportFolder }) {
  const [query, setQuery] = useState("");
  const [format, setFormat] = useState("all");
  const [rootId, setRootId] = useState("all");
  const [usageFilter, setUsageFilter] = useState("all");
  const [filterName, setFilterName] = useState("");
  const [savedFilterId, setSavedFilterId] = useState("");
  const [selectedKey, setSelectedKey] = useState(library[0]?.key || "");
  const [targetAlbumId, setTargetAlbumId] = useState(activeAlbum.id);
  const [targetTrackId, setTargetTrackId] = useState(activeAlbum.tracks[0]?.id || "");

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

  const selectedFile = library.find((file) => file.key === selectedKey);
  const targetAlbum = state.albums.find((album) => album.id === targetAlbumId) || activeAlbum;
  const targetTrack = targetAlbum.tracks.find((track) => track.id === targetTrackId);
  const isProtected = selectedFile && protectedKeys.has(selectedFile.key) && !revealPrivateFilenames;
  const displayName = (file) => protectedKeys.has(file.key) && !revealPrivateFilenames ? "[Private source file]" : file.name;
  const sourceRefFor = (file) => file.privateSourceId
    ? { privateSourceId: file.privateSourceId }
    : { rootId: file.rootId, relativePath: file.relativePath };

  const addCandidate = () => {
    if (!selectedFile || !targetTrack) return;
    onAlbumChangeById(targetAlbum.id, (draft) => {
      const draftTrack = draft.tracks.find((track) => track.id === targetTrack.id);
      if (draftTrack.candidates.some((candidate) => sourceKey(candidate.sourceRef) === selectedFile.key)) return;
      let candidateId = `candidate-${draftTrack.candidates.length + 1}`;
      let suffix = 2;
      while (draftTrack.candidates.some((candidate) => candidate.id === candidateId)) candidateId = `candidate-${draftTrack.candidates.length + 1}-${suffix++}`;
      draftTrack.candidates.push({ id: candidateId, label: draftTrack.privacy === "protected" ? `Private candidate ${draftTrack.candidates.length + 1}` : `Candidate ${draftTrack.candidates.length + 1}`, sourceRef: sourceRefFor(selectedFile), flags: [], notes: "" });
      if (!draftTrack.auditionCandidateId) draftTrack.auditionCandidateId = candidateId;
    });
  };

  const addNewTrack = () => {
    if (!selectedFile) return;
    onAlbumChangeById(targetAlbum.id, (draft) => {
      const baseTitle = isProtected ? "Protected Track" : titleFromFilename(selectedFile.name);
      const baseId = slugify(baseTitle);
      let trackId = baseId;
      let suffix = 2;
      while (draft.tracks.some((track) => track.id === trackId)) trackId = `${baseId}-${suffix++}`;
      const candidateId = `${trackId}-source-1`;
      draft.tracks.push({
        id: trackId,
        title: baseTitle,
        decisionStatus: "undecided",
        masterCandidateId: "",
        auditionCandidateId: candidateId,
        notes: "",
        ...(selectedFile.privateSourceId ? { privacy: "protected" } : {}),
        candidates: [{ id: candidateId, label: "Candidate 1", sourceRef: sourceRefFor(selectedFile), flags: [], notes: "" }],
      });
      draft.baselineTrackOrder = [...(draft.baselineTrackOrder || []), trackId];
      draft.orderApproved = false;
    });
  };

  return (
    <main className="library-workspace">
      <section className="library-main">
        <div className="library-heading"><h2>Audio Library</h2><p>{filtered.length} of {library.length} discovered files</p></div>
        <div className="library-filters">
          <label className="search-field"><SearchIcon /><span className="sr-only">Search files</span><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search files" /></label>
          <select aria-label="Filter by format" value={format} onChange={(event) => setFormat(event.target.value)}><option value="all">All formats</option>{formats.map((item) => <option key={item} value={item}>{item.toUpperCase()}</option>)}</select>
          <select aria-label="Filter by root" value={rootId} onChange={(event) => setRootId(event.target.value)}><option value="all">All roots</option>{roots.map((root) => <option key={root.id} value={root.id}>{root.label}</option>)}</select>
          <select aria-label="Filter by usage" value={usageFilter} onChange={(event) => setUsageFilter(event.target.value)}><option value="all">All usage</option><option value="unassigned">Unassigned</option><option value="assigned">Assigned</option></select>
          <button type="button" className="text-button" disabled={hostedDemo || scanning} title={hostedDemo ? "The hosted tester uses a fixed generated library" : "Rescan configured sources"} onClick={onRescan}><RefreshIcon /> {scanning ? "Scanning…" : hostedDemo ? "Demo Library" : "Rescan"}</button>
        </div>
        <div className="saved-filter-bar"><label>Saved filter<select value={savedFilterId} onChange={(event) => applySavedFilter(event.target.value)}><option value="">Choose saved filter</option>{savedFilters.map((filter) => <option key={filter.id} value={filter.id}>{filter.name}</option>)}</select></label><form onSubmit={saveCurrentFilter}><input aria-label="Saved filter name" required value={filterName} onChange={(event) => setFilterName(event.target.value)} placeholder="Filter name" /><button type="submit" className="text-button">Save Current</button></form><button type="button" className="text-button text-button--danger" disabled={!savedFilterId} onClick={deleteSavedFilter}>Delete</button></div>
        <div className="audio-table" role="table" aria-label="Audio files">
          <div className="audio-table-head" role="row"><span>File</span><span>Path</span><span>Format</span><span>Duration</span><span>Used by</span><span>Preview</span><span>Action</span></div>
          <div className="audio-table-body">
            {filtered.map((file) => {
              const usages = usageMap.get(file.key) || [];
              const privateFile = protectedKeys.has(file.key) && !revealPrivateFilenames;
              return (
                <div className={`audio-row ${selectedKey === file.key ? "is-selected" : ""}`} key={file.key} onClick={() => setSelectedKey(file.key)} onKeyDown={(event) => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); setSelectedKey(file.key); } }} role="row" tabIndex="0">
                  <span className="audio-name"><WaveIcon /> <strong>{privateFile ? <><LockIcon /> [Private source file]</> : file.name}</strong></span>
                  <span title={file.relativePath}>{rootMap.get(file.rootId)?.label || file.rootId}/{privateFile ? "[protected]" : file.relativePath.replace(`/${file.name}`, "")}</span>
                  <span>{file.extension.toUpperCase()}</span>
                  <span>{formatDuration(file.duration)}</span>
                  <span className={usages.length ? "" : "is-unassigned"}>{usages.length ? usages.map((usage) => usage.trackTitle).join(", ") : "Unassigned"}</span>
                  <span><button type="button" className="icon-button" aria-label={`Preview ${displayName(file)}`} onClick={(event) => { event.stopPropagation(); onPreviewFile(file, displayName(file)); }}><PlayIcon /></button></span>
                  <span className="audio-action">Assign</span>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      <aside className="library-inspector">
        <section className="source-summary">
          <h2>Audio Sources</h2>
          <p className="watch-status"><strong>{hostedDemo ? "Generated tester sources" : watching?.enabled ? "Watching connected folders" : watching?.configured ? "Watching unavailable" : "Manual incremental rescans"}</strong><span>{hostedDemo ? "No device paths or media were uploaded" : scan ? `${scan.reusedMetadata} cached · ${scan.probedMetadata} updated` : "Scan status unavailable"}</span></p>
          <div className="source-summary-actions"><button type="button" className="text-button" disabled={hostedDemo || scanning} title={hostedDemo ? "Add device audio in the local app" : "Add audio files"} onClick={onImportFiles}><MusicIcon /> Add Files</button><button type="button" className="text-button" disabled={hostedDemo || scanning} title={hostedDemo ? "Add device folders in the local app" : "Add an audio folder"} onClick={onImportFolder}><FolderIcon /> Add Folder</button></div>
          <ul>{roots.map((root) => <li key={root.id}><span>{root.label}<small>{root.path}</small></span><strong className={root.connected ? "is-connected" : "is-offline"}>{root.connectionState === "reconnected" ? "Reconnected" : root.connected ? "Connected" : "Offline"}</strong></li>)}</ul>
          <p>{hostedDemo ? "Demo audio is generated in this browser session." : "Audio remains in its original location."}</p>
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
