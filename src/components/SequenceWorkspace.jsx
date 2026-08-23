import React, { useEffect, useMemo, useRef, useState } from "react";
import { sourceKey } from "../lib/api.js";
import { formatDuration } from "../lib/format.js";
import { isTrackSequenced, renameTrackTitle, SEQUENCE_TRACK_STATUS_OPTIONS, sequenceTrackStatus, setSequenceTrackStatus, TRACK_TITLE_MAX_LENGTH } from "../lib/sequence-tracks.js";
import { ChevronIcon, DragIcon, EditIcon, ExportIcon, PauseIcon, PlayIcon, PlusIcon, RefreshIcon, TransitionIcon, TrashIcon } from "./Icons.jsx";
import { CandidateSourceManager } from "./CandidateSourceManager.jsx";
import { Modal } from "./Modal.jsx";

const sourceLabel = (track, candidate, file, revealPrivateFilenames) => {
  if (track.privacy === "protected" && !revealPrivateFilenames) return candidate.label;
  return `${candidate.label} · ${file?.name || "Source offline"}`;
};

const isIndependentRowControl = (target) => target instanceof Element
  && Boolean(target.closest("button, select, input, textarea, a, [data-row-playback-ignore]"));

function RenameTrackForm({ track, onSubmit, onCancel }) {
  const [title, setTitle] = useState(track.title);
  const normalizedTitle = title.trim().replace(/\s+/g, " ");
  return (
    <form className="modal-form rename-track-form" onSubmit={(event) => { event.preventDefault(); onSubmit(normalizedTitle); }}>
      <label>Track title<input autoFocus required maxLength={TRACK_TITLE_MAX_LENGTH} value={title} onChange={(event) => setTitle(event.target.value)} onFocus={(event) => event.currentTarget.select()} /></label>
      <p>Confirming changes only this displayed song title. The permanent track ID, indexed audio references, candidate choices, notes, sequence position, and mastering instructions stay attached.</p>
      <dl className="rename-album-identity"><div><dt>Permanent track ID</dt><dd>{track.id}</dd></div><div><dt>Audio candidates preserved</dt><dd>{track.candidates.length}</dd></div></dl>
      <div className="modal-actions"><button type="button" className="text-button" onClick={onCancel}>Cancel</button><button type="submit" className="primary-button" disabled={!normalizedTitle || normalizedTitle === track.title}><EditIcon /> Confirm Rename</button></div>
    </form>
  );
}

function RemoveTrackFromProjectForm({ track, onSubmit, onCancel }) {
  return (
    <div className="modal-form delete-track-form">
      <p><strong>{track.title}</strong> will be permanently removed from this project.</p>
      <dl className="rename-album-identity"><div><dt>Track record</dt><dd>1</dd></div><div><dt>Candidate references</dt><dd>{track.candidates.length}</dd></div></dl>
      <p className="deletion-safety-note">Its sequence history, notes, candidate choices, and attached project records will be deleted. Indexed source audio stays exactly where it is and remains available in the Audio Library.</p>
      <div className="modal-actions"><button type="button" className="text-button" onClick={onCancel}>Cancel</button><button type="button" className="primary-button primary-button--danger" onClick={onSubmit}><TrashIcon /> Remove from Project</button></div>
    </div>
  );
}

export function SequenceWorkspace({ album, library, libraryMap, protectedSourceKeys, revealPrivateFilenames, scanning = false, transitioningTrackId, currentTrackId, playing, renderingAvailable = true, onAlbumChange, onAuditionSourceChange, onChooseCandidateFiles, onAddCandidate, onMoveCandidate, onAddTracks, onPlayFrom, onTogglePlayback, onTransition, onExport, onRemoveFromSequence, onRestoreToSequence, onRemoveFromProject }) {
  const [draggedTrackId, setDraggedTrackId] = useState("");
  const [removeArmedTrackId, setRemoveArmedTrackId] = useState("");
  const [renamingTrackId, setRenamingTrackId] = useState("");
  const [removingProjectTrackId, setRemovingProjectTrackId] = useState("");
  const [candidateManagerTrackId, setCandidateManagerTrackId] = useState("");
  const trackRowsRef = useRef(new Map());
  const tracks = useMemo(() => album.tracks.filter(isTrackSequenced), [album.tracks]);
  const unsequencedTracks = useMemo(() => album.tracks.filter((track) => !isTrackSequenced(track)), [album.tracks]);
  const renamingTrack = album.tracks.find((track) => track.id === renamingTrackId && track.privacy !== "protected");
  const removingProjectTrack = unsequencedTracks.find((track) => track.id === removingProjectTrackId);
  const candidateManagerTrack = album.tracks.find((track) => track.id === candidateManagerTrackId);
  const resolveCandidate = (track) => track.candidates.find((candidate) => candidate.id === track.auditionCandidateId);
  const resolveFile = (track) => {
    const candidate = resolveCandidate(track);
    return candidate ? libraryMap.get(sourceKey(candidate.sourceRef)) : null;
  };

  useEffect(() => {
    const row = trackRowsRef.current.get(currentTrackId);
    const scrollRegion = row?.closest(".sequence-scroll-region");
    if (!row || !scrollRegion) return;
    const rowBounds = row.getBoundingClientRect();
    const regionBounds = scrollRegion.getBoundingClientRect();
    if (rowBounds.top < regionBounds.top || rowBounds.bottom > regionBounds.bottom) {
      row.scrollIntoView({ block: "nearest" });
    }
  }, [currentTrackId]);

  const moveTrack = (trackId, direction) => onAlbumChange((draft) => {
    const sequencePositions = draft.tracks.reduce((positions, track, index) => {
      if (isTrackSequenced(track)) positions.push(index);
      return positions;
    }, []);
    const currentSequenceIndex = sequencePositions.findIndex((index) => draft.tracks[index].id === trackId);
    const nextSequenceIndex = currentSequenceIndex + direction;
    if (currentSequenceIndex < 0 || nextSequenceIndex < 0 || nextSequenceIndex >= sequencePositions.length) return;
    const currentIndex = sequencePositions[currentSequenceIndex];
    const nextIndex = sequencePositions[nextSequenceIndex];
    [draft.tracks[currentIndex], draft.tracks[nextIndex]] = [draft.tracks[nextIndex], draft.tracks[currentIndex]];
    draft.orderApproved = false;
  });

  const dropTrack = (targetTrackId) => {
    if (!draggedTrackId || draggedTrackId === targetTrackId) return;
    onAlbumChange((draft) => {
      const orderedTracks = draft.tracks.filter(isTrackSequenced);
      const sourceIndex = orderedTracks.findIndex((track) => track.id === draggedTrackId);
      const targetIndex = orderedTracks.findIndex((track) => track.id === targetTrackId);
      if (sourceIndex < 0 || targetIndex < 0) return;
      const [moved] = orderedTracks.splice(sourceIndex, 1);
      orderedTracks.splice(targetIndex, 0, moved);
      let sequenceIndex = 0;
      draft.tracks = draft.tracks.map((track) => isTrackSequenced(track) ? orderedTracks[sequenceIndex++] : track);
      draft.orderApproved = false;
    });
    setDraggedTrackId("");
  };

  const requestRemove = (track) => {
    if (removeArmedTrackId !== track.id) {
      setRemoveArmedTrackId(track.id);
      window.setTimeout(() => setRemoveArmedTrackId((current) => current === track.id ? "" : current), 5000);
      return;
    }
    onRemoveFromSequence(track.id, track.title);
    setRemoveArmedTrackId("");
  };

  const beginTrackRename = (track) => {
    if (track.privacy === "protected") return;
    setRenamingTrackId(track.id);
  };

  const confirmTrackRename = (title) => {
    const trackId = renamingTrackId;
    onAlbumChange((draft) => { renameTrackTitle(draft, trackId, title); });
    setRenamingTrackId("");
  };

  return (
    <>
    <main className="sequence-workspace">
      <section className="sequence-main" aria-labelledby="sequence-title">
        <div className="workspace-heading">
          <h2 id="sequence-title" className="sr-only">Sequence</h2>
          <select aria-label="Album order approval" value={album.orderApproved ? "approved" : "working"} onChange={(event) => onAlbumChange((draft) => { draft.orderApproved = event.target.value === "approved"; })}>
            <option value="working">Working order — not approved</option>
            <option value="approved">Order approved</option>
          </select>
          <div className="workspace-heading-actions">
            <button type="button" className="text-button" onClick={onAddTracks}><PlusIcon /> Add Tracks</button>
            <button type="button" className="text-button text-button--warn" onClick={onExport}><ExportIcon /> Export</button>
          </div>
        </div>

        <div className="sequence-scroll-region">
          {tracks.length ? (
            <div className="sequence-table" role="table" aria-label={`${album.title} track order`}>
            <div className="sequence-table-head" role="row">
              <span role="columnheader">Move</span><span role="columnheader">#</span><span role="columnheader">Track title</span><span role="columnheader">Source</span><span role="columnheader">Duration / status</span><span role="columnheader">Play</span><span role="columnheader">Transition</span><span role="columnheader">Remove</span>
            </div>
            <ol role="rowgroup">
              {tracks.map((track, index) => {
                const originalIndex = (album.baselineTrackOrder || []).indexOf(track.id);
                const candidate = resolveCandidate(track);
                const file = resolveFile(track);
                const nextFile = tracks[index + 1] ? resolveFile(tracks[index + 1]) : null;
                const nextTrack = tracks[index + 1];
                const missing = !file;
                const legacy = track.decisionStatus === "legacy" || candidate?.flags?.some((flag) => /old|legacy/i.test(flag));
                const removeArmed = removeArmedTrackId === track.id;
                const preparingTransition = transitioningTrackId === track.id;
                // Keep the current row selected while paused; reserve the active treatment for audible playback.
                const current = currentTrackId === track.id;
                const trackPlaying = current && playing;
                const toggleRowPlayback = () => current ? onTogglePlayback() : onPlayFrom(index);
                const rowPlaybackLabel = trackPlaying
                  ? `${track.title}. Playing. Press Enter or Space to pause.`
                  : current
                    ? `${track.title}. Paused. Press Enter or Space to resume.`
                    : `${track.title}. Press Enter or Space to play from this track.`;
                return (
                  <li
                    key={track.id}
                    ref={(node) => {
                      if (node) trackRowsRef.current.set(track.id, node);
                      else trackRowsRef.current.delete(track.id);
                    }}
                    className={`sequence-track ${missing ? "is-missing" : "is-playable"} ${legacy ? "is-legacy" : ""} ${current ? "is-current" : ""} ${trackPlaying ? "is-playing" : ""} ${removeArmed ? "is-removal-armed" : ""}`}
                    draggable
                    onDragStart={() => setDraggedTrackId(track.id)}
                    onDragOver={(event) => event.preventDefault()}
                    onDrop={() => dropTrack(track.id)}
                    onClick={(event) => {
                      if (missing || removeArmed || isIndependentRowControl(event.target)) return;
                      toggleRowPlayback();
                    }}
                    onKeyDown={(event) => {
                      if (missing || removeArmed || event.target !== event.currentTarget || !["Enter", " "].includes(event.key)) return;
                      event.preventDefault();
                      toggleRowPlayback();
                    }}
                    role="row"
                    tabIndex={missing ? undefined : 0}
                    aria-label={missing ? undefined : rowPlaybackLabel}
                  >
                    <div className="track-move" role="cell" data-row-playback-ignore>
                      <DragIcon />
                      <button type="button" onClick={() => moveTrack(track.id, -1)} disabled={index === 0} aria-label={`Move ${track.title} up`}><ChevronIcon direction="up" /></button>
                      <button type="button" onClick={() => moveTrack(track.id, 1)} disabled={index === tracks.length - 1} aria-label={`Move ${track.title} down`}><ChevronIcon direction="down" /></button>
                    </div>
                    <span className="track-index" role="cell">{index + 1}</span>
                    <div className="track-title" role="cell">
                      {track.privacy === "protected" ? <strong title="Protected track labels cannot be renamed">{track.title}</strong> : <strong className="track-title-rename-trigger" role="button" tabIndex={0} aria-label={`Rename ${track.title}`} aria-keyshortcuts="Enter Space F2" title="Double-click or press Enter to rename" data-row-playback-ignore onClick={(event) => { event.stopPropagation(); if (event.detail === 0) beginTrackRename(track); }} onDoubleClick={(event) => { event.preventDefault(); event.stopPropagation(); beginTrackRename(track); }} onKeyDown={(event) => { if (!["Enter", " ", "F2"].includes(event.key)) return; event.preventDefault(); event.stopPropagation(); beginTrackRename(track); }}>{track.title}</strong>}
                      <small>{originalIndex >= 0 ? `Original slot ${originalIndex + 1}` : "Added track"}{track.privacy === "protected" ? " · protected" : ""}</small>
                    </div>
                    <div className="track-source" role="cell">
                      <select aria-label={`Audition source for ${track.title}`} value={track.auditionCandidateId || ""} disabled={!track.candidates.length} onChange={(event) => onAuditionSourceChange(track.id, event.target.value)}>
                        {!track.candidates.length && <option value="">— No source —</option>}
                        {track.candidates.map((item) => {
                          const itemFile = libraryMap.get(sourceKey(item.sourceRef));
                          return <option key={item.id} value={item.id}>{sourceLabel(track, item, itemFile, revealPrivateFilenames)}</option>;
                        })}
                      </select>
                      <button type="button" className="icon-button candidate-source-button" aria-label={`Manage candidates for ${track.title}`} title="Search audio or move a candidate from another track" onClick={() => setCandidateManagerTrackId(track.id)}><PlusIcon /></button>
                    </div>
                    <div className="track-status" role="cell">
                      <strong>{file ? formatDuration(file.duration) : "No audio"}</strong>
                      <select
                        aria-label={`Track status for ${track.title}`}
                        value={sequenceTrackStatus(track)}
                        onChange={(event) => onAlbumChange((draft) => {
                          const draftTrack = draft.tracks.find((item) => item.id === track.id);
                          setSequenceTrackStatus(draftTrack, event.target.value);
                        })}
                      >
                        {SEQUENCE_TRACK_STATUS_OPTIONS.map((option) => <option key={option.value} value={option.value} disabled={option.value === "master-sheet" && !track.auditionCandidateId}>{option.label}</option>)}
                      </select>
                    </div>
                    <div className="sequence-action-cell sequence-action-cell--play" role="cell"><button type="button" className={`icon-button sequence-play-button ${trackPlaying ? "is-playing" : ""}`} disabled={!file} onClick={() => current ? onTogglePlayback() : onPlayFrom(index)} aria-label={trackPlaying ? `Pause ${track.title}` : current ? `Resume ${track.title}` : `Play sequence from ${track.title}`} aria-pressed={trackPlaying}>{trackPlaying ? <PauseIcon /> : <PlayIcon />}</button></div>
                    <div className="sequence-action-cell sequence-action-cell--transition" role="cell"><button type="button" className={`icon-button sequence-transition-button ${preparingTransition ? "is-busy" : ""}`} disabled={!renderingAvailable || !file || !nextFile || Boolean(transitioningTrackId)} onClick={() => onTransition(index)} aria-busy={preparingTransition} aria-label={renderingAvailable ? (preparingTransition ? `Preparing ${track.title} into ${nextTrack?.title || "the next track"}` : `Preview ${track.title} through ${nextTrack?.title || "the next track"}`) : "Rendered transition previews are unavailable in the browser"} title={renderingAvailable ? "Preview the edited ending and continue through the next track" : "Rendered transition previews are unavailable in the browser"}><TransitionIcon /></button></div>
                    <div className="sequence-action-cell sequence-action-cell--remove" role="cell"><button type="button" className={`icon-button sequence-remove-button ${removeArmed ? "is-armed" : ""}`} onClick={() => requestRemove(track)} aria-label={removeArmed ? `Confirm remove ${track.title} from sequence` : `Remove ${track.title} from sequence`} title={removeArmed ? "Press again to remove from sequence; the track record will be preserved" : "Remove from sequence"}><TrashIcon /></button></div>
                  </li>
                );
              })}
            </ol>
            </div>
          ) : (
            <div className="empty-state"><h3>This album is ready for its first track.</h3><p>Choose audio files, import a whole folder, enter a full path, or add a blank placeholder.</p><button type="button" className="primary-button" onClick={onAddTracks}><PlusIcon /> Add First Tracks</button></div>
          )}

          {unsequencedTracks.length > 0 && (
            <section className="unsequenced-tracks" aria-labelledby="unsequenced-title">
              <header><div><h3 id="unsequenced-title">Unsequenced Tracks</h3><p>Restore a track to the sequence or remove its saved record from this project. Indexed source audio is never deleted.</p></div><strong>{unsequencedTracks.length}</strong></header>
              <ol>{unsequencedTracks.map((track) => <li key={track.id}><div><strong>{track.title}</strong><small>{track.candidates.length} candidate{track.candidates.length === 1 ? "" : "s"} preserved</small></div><div className="unsequenced-track-actions"><button type="button" className="text-button" onClick={() => onRestoreToSequence(track.id, track.title)}><RefreshIcon /> Restore to Sequence</button><button type="button" className="text-button text-button--danger" onClick={() => setRemovingProjectTrackId(track.id)}><TrashIcon /> Remove from Project</button></div></li>)}</ol>
            </section>
          )}
        </div>
      </section>

    </main>
    {renamingTrack && <Modal title="Rename Track" onClose={() => setRenamingTrackId("")}><RenameTrackForm key={renamingTrack.id} track={renamingTrack} onSubmit={confirmTrackRename} onCancel={() => setRenamingTrackId("")} /></Modal>}
    {removingProjectTrack && <Modal title="Remove Track from Project" onClose={() => setRemovingProjectTrackId("")}><RemoveTrackFromProjectForm key={removingProjectTrack.id} track={removingProjectTrack} onSubmit={() => { onRemoveFromProject(removingProjectTrack.id, removingProjectTrack.title); setRemovingProjectTrackId(""); }} onCancel={() => setRemovingProjectTrackId("")} /></Modal>}
    {candidateManagerTrack && <Modal title={`Manage Candidates — ${candidateManagerTrack.title}`} className="modal--wide" onClose={() => setCandidateManagerTrackId("")}><CandidateSourceManager key={candidateManagerTrack.id} album={album} track={candidateManagerTrack} library={library} libraryMap={libraryMap} protectedSourceKeys={protectedSourceKeys} revealPrivateFilenames={revealPrivateFilenames} scanning={scanning} onChooseFiles={onChooseCandidateFiles} onAddFile={onAddCandidate} onMoveCandidate={onMoveCandidate} onClose={() => setCandidateManagerTrackId("")} /></Modal>}
    </>
  );
}
