import React, { useMemo, useState } from "react";
import { sourceKey } from "../lib/api.js";
import { formatDuration } from "../lib/format.js";
import { isTrackSequenced } from "../lib/sequence-tracks.js";
import { ChevronIcon, DragIcon, ExportIcon, PanelRightIcon, PlayIcon, PlusIcon, RefreshIcon, TransitionIcon, TrashIcon } from "./Icons.jsx";

const sourceLabel = (track, candidate, file, revealPrivateFilenames) => {
  if (track.privacy === "protected" && !revealPrivateFilenames) return candidate.label;
  return `${candidate.label} · ${file?.name || "Source offline"}`;
};

export function SequenceWorkspace({ album, libraryMap, revealPrivateFilenames, transitioningTrackId, renderingAvailable = true, layoutPreviewCollapsed, onToggleLayoutPreview, onAlbumChange, onAddTracks, onPlayFrom, onTransition, onExport, onRemoveFromSequence, onRestoreToSequence }) {
  const [draggedTrackId, setDraggedTrackId] = useState("");
  const [removeArmedTrackId, setRemoveArmedTrackId] = useState("");
  const tracks = useMemo(() => album.tracks.filter(isTrackSequenced), [album.tracks]);
  const unsequencedTracks = useMemo(() => album.tracks.filter((track) => !isTrackSequenced(track)), [album.tracks]);
  const resolveCandidate = (track) => track.candidates.find((candidate) => candidate.id === track.auditionCandidateId);
  const resolveFile = (track) => {
    const candidate = resolveCandidate(track);
    return candidate ? libraryMap.get(sourceKey(candidate.sourceRef)) : null;
  };
  const totalRuntime = useMemo(() => tracks.reduce((sum, track) => sum + (resolveFile(track)?.duration || 0), 0), [tracks, libraryMap]);

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

  return (
    <main className={`sequence-workspace ${layoutPreviewCollapsed ? "layout-preview-collapsed" : ""}`}>
      <section className="sequence-main" aria-labelledby="sequence-title">
        <div className="workspace-heading">
          <div>
            <h2 id="sequence-title">{album.title} <span>— Working Sequence</span></h2>
            <select aria-label="Album order approval" value={album.orderApproved ? "approved" : "working"} onChange={(event) => onAlbumChange((draft) => { draft.orderApproved = event.target.value === "approved"; })}>
              <option value="working">Working order — not approved</option>
              <option value="approved">Order approved</option>
            </select>
          </div>
          <div className="workspace-heading-actions">
            <button type="button" className="text-button" onClick={onAddTracks}><PlusIcon /> Add Tracks</button>
            <button type="button" className="text-button text-button--warn" onClick={onExport}><ExportIcon /> Export</button>
          </div>
        </div>

        {tracks.length ? (
          <div className="sequence-table" role="table" aria-label={`${album.title} track order`}>
            <div className="sequence-table-head" role="row">
              <span>Move</span><span>#</span><span>Track title</span><span>Source</span><span>Duration / status</span><span>Play</span><span>Transition</span><span>Remove</span>
            </div>
            <ol>
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
                return (
                  <li key={track.id} className={`sequence-track ${missing ? "is-missing" : ""} ${legacy ? "is-legacy" : ""} ${removeArmed ? "is-removal-armed" : ""}`} draggable onDragStart={() => setDraggedTrackId(track.id)} onDragOver={(event) => event.preventDefault()} onDrop={() => dropTrack(track.id)} role="row">
                    <div className="track-move">
                      <DragIcon />
                      <button type="button" onClick={() => moveTrack(track.id, -1)} disabled={index === 0} aria-label={`Move ${track.title} up`}><ChevronIcon direction="up" /></button>
                      <button type="button" onClick={() => moveTrack(track.id, 1)} disabled={index === tracks.length - 1} aria-label={`Move ${track.title} down`}><ChevronIcon direction="down" /></button>
                    </div>
                    <span className="track-index">{index + 1}</span>
                    <div className="track-title"><strong>{track.title}</strong><small>{originalIndex >= 0 ? `Original slot ${originalIndex + 1}` : "Added track"}{track.privacy === "protected" ? " · protected" : ""}</small></div>
                    <div className="track-source">
                      <select aria-label={`Audition source for ${track.title}`} value={track.auditionCandidateId || ""} disabled={!track.candidates.length} onChange={(event) => onAlbumChange((draft) => {
                        const target = draft.tracks.find((item) => item.id === track.id);
                        target.auditionCandidateId = event.target.value;
                      })}>
                        {!track.candidates.length && <option value="">— No source —</option>}
                        {track.candidates.map((item) => {
                          const itemFile = libraryMap.get(sourceKey(item.sourceRef));
                          return <option key={item.id} value={item.id}>{sourceLabel(track, item, itemFile, revealPrivateFilenames)}</option>;
                        })}
                      </select>
                    </div>
                    <div className="track-status"><strong>{file ? formatDuration(file.duration) : "No audio"}</strong><small>{missing ? "Missing source" : legacy ? "Legacy source" : track.decisionStatus === "released" ? "Released source" : track.masterCandidateId === candidate?.id ? "Master-sheet choice" : "Temporary audition"}</small></div>
                    <button type="button" className="icon-button sequence-play-button" disabled={!file} onClick={() => onPlayFrom(index)} aria-label={`Play sequence from ${track.title}`}><PlayIcon /></button>
                    <button type="button" className={`icon-button sequence-transition-button ${preparingTransition ? "is-busy" : ""}`} disabled={!renderingAvailable || !file || !nextFile || Boolean(transitioningTrackId)} onClick={() => onTransition(index)} aria-busy={preparingTransition} aria-label={renderingAvailable ? (preparingTransition ? `Preparing ${track.title} into ${nextTrack?.title || "the next track"}` : `Preview ${track.title} through ${nextTrack?.title || "the next track"}`) : "Rendered transition previews are unavailable in the browser"} title={renderingAvailable ? "Preview the edited ending and continue through the next track" : "Rendered transition previews are unavailable in the browser"}><TransitionIcon /></button>
                    <button type="button" className={`icon-button sequence-remove-button ${removeArmed ? "is-armed" : ""}`} onClick={() => requestRemove(track)} aria-label={removeArmed ? `Confirm remove ${track.title} from sequence` : `Remove ${track.title} from sequence`} title={removeArmed ? "Press again to remove from sequence; the track record will be preserved" : "Remove from sequence"}><TrashIcon /></button>
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
            <header><div><h3 id="unsequenced-title">Unsequenced Tracks</h3><p>These track records and all attached audio, notes, visuals, and lyrics are preserved.</p></div><strong>{unsequencedTracks.length}</strong></header>
            <ol>{unsequencedTracks.map((track) => <li key={track.id}><div><strong>{track.title}</strong><small>{track.candidates.length} candidate{track.candidates.length === 1 ? "" : "s"} preserved</small></div><button type="button" className="text-button" onClick={() => onRestoreToSequence(track.id, track.title)}><RefreshIcon /> Restore to Sequence</button></li>)}</ol>
          </section>
        )}
      </section>

      <aside className={`layout-preview ${layoutPreviewCollapsed ? "is-collapsed" : ""}`} aria-label="Album layout preview">
        <header className="layout-preview-heading">
          {!layoutPreviewCollapsed && <h2 id="layout-title">Album Layout Preview</h2>}
          <button type="button" className="panel-toggle panel-toggle--right" onClick={onToggleLayoutPreview} aria-expanded={!layoutPreviewCollapsed} aria-controls="album-layout-panel" aria-label={layoutPreviewCollapsed ? "Show album layout preview" : "Hide album layout preview"} data-tooltip={layoutPreviewCollapsed ? "Show album layout preview" : "Hide album layout preview"}><PanelRightIcon collapsed={layoutPreviewCollapsed} /></button>
        </header>
        {!layoutPreviewCollapsed && <div id="album-layout-panel" className="album-proof">
          <p className="proof-artist">{album.artist}</p>
          <p className="proof-title">{album.title}</p>
          <ol>
            {tracks.map((track, index) => {
              const file = resolveFile(track);
              return <li key={track.id} className={!file ? "is-missing" : ""}><span>{index + 1}.</span><strong>{track.title}{!file ? " — incomplete" : ""}</strong><time>{formatDuration(file?.duration)}</time></li>;
            })}
          </ol>
          <p className="proof-runtime"><span>Total playable runtime</span><strong>{formatDuration(totalRuntime)}</strong></p>
          <p className="proof-note">{album.orderApproved ? "Approved album order" : "Private working layout"}</p>
        </div>}
      </aside>
    </main>
  );
}
