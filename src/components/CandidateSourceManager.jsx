import React, { useMemo, useState } from "react";
import { sourceKey } from "../lib/api.js";
import { formatDuration } from "../lib/format.js";
import { createLibrarySearchIndex } from "../lib/library-search.js";
import { FolderIcon, MusicIcon, SearchIcon } from "./Icons.jsx";

const resultLimit = 40;

const safeFileName = (file, protectedSourceKeys, revealPrivateFilenames) => (
  !revealPrivateFilenames && (file.privateSourceId || protectedSourceKeys.has(file.key))
    ? "[Private source file]"
    : file.name
);

const safeFilePath = (file, protectedSourceKeys, revealPrivateFilenames) => (
  !revealPrivateFilenames && (file.privateSourceId || protectedSourceKeys.has(file.key))
    ? "Protected indexed source"
    : file.relativePath
);

const candidateLabel = (track, candidate, libraryMap, revealPrivateFilenames) => {
  const file = libraryMap.get(sourceKey(candidate.sourceRef));
  if (track.privacy === "protected" && !revealPrivateFilenames) return candidate.label;
  return `${candidate.label} · ${file?.name || "Source offline"}`;
};

export function CandidateSourceManager({
  album,
  track,
  library,
  libraryMap,
  protectedSourceKeys,
  revealPrivateFilenames,
  scanning,
  onChooseFiles,
  onAddFile,
  onMoveCandidate,
  onClose,
}) {
  const [mode, setMode] = useState("library");
  const [query, setQuery] = useState("");
  const [selectedFileKey, setSelectedFileKey] = useState("");
  const [makeActive, setMakeActive] = useState(true);
  const [notice, setNotice] = useState("");
  const moveTracks = useMemo(() => album.tracks.filter((item) => item.id !== track.id && item.candidates.length), [album.tracks, track.id]);
  const [sourceTrackId, setSourceTrackId] = useState(() => moveTracks[0]?.id || "");
  const initialSourceTrack = moveTracks.find((item) => item.id === sourceTrackId) || moveTracks[0];
  const [sourceCandidateId, setSourceCandidateId] = useState(() => initialSourceTrack?.auditionCandidateId || initialSourceTrack?.candidates[0]?.id || "");
  const sourceTrack = moveTracks.find((item) => item.id === sourceTrackId) || moveTracks[0];
  const sourceCandidate = sourceTrack?.candidates.find((candidate) => candidate.id === sourceCandidateId) || sourceTrack?.candidates[0];
  const targetSourceKeys = useMemo(() => new Set(track.candidates.map((candidate) => sourceKey(candidate.sourceRef))), [track.candidates]);
  const searchIndex = useMemo(() => createLibrarySearchIndex(library), [library]);
  const matchingKeys = useMemo(() => searchIndex.search(query), [query, searchIndex]);
  const matchingFiles = useMemo(() => library.filter((file) => matchingKeys.has(file.key)).slice(0, resultLimit), [library, matchingKeys]);
  const selectedFile = libraryMap.get(selectedFileKey) || library.find((file) => file.key === selectedFileKey);
  const selectedAlreadyAssigned = Boolean(selectedFile && targetSourceKeys.has(selectedFile.key));
  const movingDuplicate = Boolean(sourceCandidate && targetSourceKeys.has(sourceKey(sourceCandidate.sourceRef)));

  const chooseFiles = async () => {
    setNotice("");
    const result = await onChooseFiles();
    if (!result?.ok) {
      setNotice("Audio could not be indexed. Check the project warning and try again.");
      return;
    }
    if (result.cancelled) {
      setNotice("Selection cancelled. Nothing changed.");
      return;
    }
    if (!result.files.length) {
      setNotice("No supported audio files were found in that selection.");
      return;
    }
    const firstFile = result.files[0];
    setQuery(firstFile.name);
    setSelectedFileKey(firstFile.key);
    setNotice(`${result.files.length} file${result.files.length === 1 ? "" : "s"} indexed. The first result is selected below.`);
  };

  const addSelectedFile = () => {
    if (!selectedFile || selectedAlreadyAssigned) return;
    const result = onAddFile(track.id, selectedFile, makeActive);
    if (result?.action === "candidate") onClose();
    else setNotice("That source is already a candidate for this track.");
  };

  const moveSelectedCandidate = () => {
    if (!sourceTrack || !sourceCandidate || movingDuplicate) return;
    const result = onMoveCandidate(sourceTrack.id, sourceCandidate.id, track.id, makeActive);
    if (result?.action === "candidate-moved") onClose();
    else setNotice("That source is already a candidate for this track.");
  };

  return (
    <div className="modal-form candidate-source-manager">
      <p>Add an indexed file to <strong>{track.title}</strong>, or move a candidate reference from another track. Project Sequencer changes only project metadata; source audio stays exactly where it is.</p>
      <div className="candidate-source-modes" role="group" aria-label="Candidate source action">
        <button type="button" aria-pressed={mode === "library"} onClick={() => { setMode("library"); setNotice(""); }}><SearchIcon /> Search Audio Library</button>
        <button type="button" aria-pressed={mode === "move"} onClick={() => { setMode("move"); setNotice(""); }}><FolderIcon /> Move from Another Track</button>
      </div>

      {mode === "library" ? <>
        <div className="candidate-library-toolbar">
          <label className="candidate-search-field"><SearchIcon /><span className="sr-only">Search indexed audio</span><input autoFocus data-modal-autofocus value={query} onChange={(event) => { setQuery(event.target.value); setSelectedFileKey(""); }} placeholder="Search filename, path, or format" /></label>
          <button type="button" className="text-button" disabled={scanning} onClick={chooseFiles}><MusicIcon /> {scanning ? "Indexing…" : "Add Files"}</button>
        </div>
        <p className="candidate-result-count">{matchingKeys.size} matching indexed file{matchingKeys.size === 1 ? "" : "s"}{matchingKeys.size > resultLimit ? ` · showing first ${resultLimit}` : ""}</p>
        <div className="candidate-source-results" role="radiogroup" aria-label="Indexed audio files">
          {matchingFiles.map((file) => {
            const duplicate = targetSourceKeys.has(file.key);
            return <label key={file.key} className={duplicate ? "is-duplicate" : ""}><input type="radio" name="candidate-source-file" value={file.key} checked={selectedFileKey === file.key} disabled={duplicate} onChange={() => { setSelectedFileKey(file.key); setNotice(""); }} /><span><strong>{safeFileName(file, protectedSourceKeys, revealPrivateFilenames)}</strong><small>{duplicate ? "Already in this candidate list" : `${file.extension.toUpperCase()} · ${formatDuration(file.duration, true)} · ${safeFilePath(file, protectedSourceKeys, revealPrivateFilenames)}`}</small></span></label>;
          })}
          {!matchingFiles.length && <div className="candidate-source-empty"><strong>No matching indexed audio</strong><span>Try a shorter search, or choose Add Files to index a new source.</span></div>}
        </div>
      </> : <>
        {moveTracks.length ? <div className="candidate-move-fields">
          <label>Move from track<select value={sourceTrack?.id || ""} onChange={(event) => { const nextTrack = moveTracks.find((item) => item.id === event.target.value); setSourceTrackId(event.target.value); setSourceCandidateId(nextTrack?.auditionCandidateId || nextTrack?.candidates[0]?.id || ""); setNotice(""); }}>{moveTracks.map((item) => <option key={item.id} value={item.id}>{item.title}</option>)}</select></label>
          <label>Candidate source<select value={sourceCandidate?.id || ""} onChange={(event) => { setSourceCandidateId(event.target.value); setNotice(""); }}>{sourceTrack?.candidates.map((candidate) => <option key={candidate.id} value={candidate.id}>{candidateLabel(sourceTrack, candidate, libraryMap, revealPrivateFilenames)}</option>)}</select></label>
          <p className="candidate-move-safety">The candidate and its notes move to <strong>{track.title}</strong>. The other track record stays in place so its title, order, notes, and mastering work are not silently deleted.</p>
          {movingDuplicate && <p className="candidate-source-notice" role="status">That indexed source is already a candidate for {track.title}.</p>}
        </div> : <div className="candidate-source-empty"><strong>No other candidate tracks</strong><span>Add or index audio first, then return here to organize candidates.</span></div>}
      </>}

      <label className="candidate-active-toggle"><input type="checkbox" checked={makeActive} onChange={(event) => setMakeActive(event.target.checked)} /><span><strong>Use as the audition source</strong><small>Select the added or moved candidate in the source list immediately.</small></span></label>
      {notice && <p className="candidate-source-notice" role="status">{notice}</p>}
      <div className="modal-actions"><button type="button" className="text-button" onClick={onClose}>Cancel</button>{mode === "library" ? <button type="button" className="primary-button" disabled={!selectedFile || selectedAlreadyAssigned} onClick={addSelectedFile}><MusicIcon /> Add Candidate</button> : <button type="button" className="primary-button" disabled={!sourceCandidate || movingDuplicate} onClick={moveSelectedCandidate}><FolderIcon /> Move Candidate Here</button>}</div>
    </div>
  );
}
