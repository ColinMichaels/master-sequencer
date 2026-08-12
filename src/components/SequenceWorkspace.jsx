import React, { useEffect, useMemo, useRef, useState } from "react";
import { sourceKey } from "../lib/api.js";
import { formatDuration } from "../lib/format.js";
import { isTrackSequenced } from "../lib/sequence-tracks.js";
import { ChevronIcon, DragIcon, ExportIcon, PauseIcon, PlayIcon, PlusIcon, RefreshIcon, TransitionIcon, TrashIcon } from "./Icons.jsx";

const sourceLabel = (track, candidate, file, revealPrivateFilenames) => {
  if (track.privacy === "protected" && !revealPrivateFilenames) return candidate.label;
  return `${candidate.label} · ${file?.name || "Source offline"}`;
};

const isIndependentRowControl = (target) => target instanceof Element
  && Boolean(target.closest("button, select, input, textarea, a, [data-row-playback-ignore]"));

export function SequenceWorkspace({ album, libraryMap, revealPrivateFilenames, transitioningTrackId, currentTrackId, playing, renderingAvailable = true, onAlbumChange, onAddTracks, onPlayFrom, onTogglePlayback, onTransition, onExport, onRemoveFromSequence, onRestoreToSequence }) {
  const [draggedTrackId, setDraggedTrackId] = useState("");
  const [removeArmedTrackId, setRemoveArmedTrackId] = useState("");
  const trackRowsRef = useRef(new Map());
  const tracks = useMemo(() => album.tracks.filter(isTrackSequenced), [album.tracks]);
  const unsequencedTracks = useMemo(() => album.tracks.filter((track) => !isTrackSequenced(track)), [album.tracks]);
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

  return (
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
                    <div className="track-move" data-row-playback-ignore>
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
                    <button type="button" className={`icon-button sequence-play-button ${trackPlaying ? "is-playing" : ""}`} disabled={!file} onClick={() => current ? onTogglePlayback() : onPlayFrom(index)} aria-label={trackPlaying ? `Pause ${track.title}` : current ? `Resume ${track.title}` : `Play sequence from ${track.title}`} aria-pressed={trackPlaying}>{trackPlaying ? <PauseIcon /> : <PlayIcon />}</button>
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
        </div>
      </section>

    </main>
  );
}
