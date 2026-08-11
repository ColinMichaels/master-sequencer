import React, { useEffect, useState } from "react";
import { sourceKey } from "../lib/api.js";
import { formatBytes, formatDuration } from "../lib/format.js";
import { toggleComparisonCandidate } from "../lib/album-decisions.js";
import { deleteTrackRecord } from "../lib/project-commands.js";
import { LockIcon, PlayIcon, TrashIcon, WarningIcon } from "./Icons.jsx";

export function TrackReviewWorkspace({ album, libraryMap, revealPrivateFilenames, onAlbumChange, onPreviewFile, onOpenLibrary, onTrackFocus }) {
  const [selectedTrackId, setSelectedTrackId] = useState(album.tracks[0]?.id || "");
  const [deleteArmed, setDeleteArmed] = useState(false);
  useEffect(() => {
    if (!album.tracks.some((track) => track.id === selectedTrackId)) setSelectedTrackId(album.tracks[0]?.id || "");
    setDeleteArmed(false);
  }, [album.id, album.tracks, selectedTrackId]);
  useEffect(() => {
    if (!deleteArmed) return undefined;
    const timer = window.setTimeout(() => setDeleteArmed(false), 5000);
    return () => window.clearTimeout(timer);
  }, [deleteArmed]);
  const track = album.tracks.find((item) => item.id === selectedTrackId);
  useEffect(() => { onTrackFocus?.(track?.id || ""); }, [onTrackFocus, track?.id]);

  if (!track) return <main className="review-workspace"><div className="empty-state"><h2>No track selected</h2><p>Add a track from Sequence or Audio Library to begin reviewing candidates.</p></div></main>;

  const updateTrack = (recipe) => onAlbumChange((draft) => recipe(draft.tracks.find((item) => item.id === track.id)));
  const deleteTrack = () => {
    if (!deleteArmed) { setDeleteArmed(true); return; }
    onAlbumChange((draft) => { deleteTrackRecord(draft, track.id); });
    setDeleteArmed(false);
  };

  return (
    <main className="review-workspace">
      <nav className="review-track-rail" aria-label={`${album.title} tracks`}>
        <h2 className="sr-only">Track Review</h2>
        <ol>{album.tracks.map((item, index) => <li key={item.id}><button type="button" className={item.id === track.id ? "is-active" : ""} onClick={() => setSelectedTrackId(item.id)}><span>{index + 1}</span><strong>{item.title}</strong><small>{item.inSequence === false ? "Off" : item.candidates.length}</small></button></li>)}</ol>
      </nav>
      <section className="review-panel">
        <header className="review-heading">
          <div><h2>{album.tracks.indexOf(track) + 1}. {track.title}</h2><p>{track.inSequence === false ? "Unsequenced track — its candidates, notes, visuals, and lyrics remain available here. " : ""}Select a source only after listening in full. Audition choices and master decisions remain separate.</p></div>
          <div><button type="button" className="text-button" onClick={onOpenLibrary}>Add Candidate</button><button type="button" className={`text-button ${deleteArmed ? "text-button--danger" : ""}`} onClick={deleteTrack} title="Permanently remove this track record from the album project"><TrashIcon /> {deleteArmed ? "Confirm Delete Record" : "Delete Track Record"}</button></div>
        </header>

        {!track.candidates.length ? (
          <div className="missing-review"><WarningIcon size={30}/><div><h3>No candidate audio</h3><p>Open Audio Library to add a source in place. The original file will not be copied or changed.</p></div></div>
        ) : (
          <ol className="candidate-review-list">
            {track.candidates.map((candidate) => {
              const file = libraryMap.get(sourceKey(candidate.sourceRef));
              const privateSource = track.privacy === "protected" && !revealPrivateFilenames;
              return (
                <li key={candidate.id} className={track.masterCandidateId === candidate.id ? "is-selected" : ""}>
                  <label className="candidate-selector"><input type="radio" name={`master-${track.id}`} checked={track.masterCandidateId === candidate.id} onChange={() => updateTrack((draft) => { draft.masterCandidateId = candidate.id; })}/><span>{candidate.label}</span></label>
                  <div className="candidate-identity">
                    <strong>{privateSource ? <><LockIcon /> Private source</> : file?.name || "Source offline"}</strong>
                    <small>{privateSource ? "Filename protected" : file?.relativePath || candidate.sourceRef.relativePath}</small>
                    <button type="button" className="icon-button" disabled={!file} onClick={() => onPreviewFile(file, privateSource ? candidate.label : file.name)} aria-label={`Preview ${candidate.label}`}><PlayIcon /></button>
                  </div>
                  <dl className="candidate-tech">
                    <div><dt>Duration</dt><dd>{formatDuration(file?.duration, true)}</dd></div>
                    <div><dt>Format</dt><dd>{file?.codec?.toUpperCase() || "—"}</dd></div>
                    <div><dt>Sample rate</dt><dd>{file?.sampleRate ? `${(file.sampleRate / 1000).toFixed(1)} kHz` : "—"}</dd></div>
                    <div><dt>Channels</dt><dd>{file?.channels || "—"}</dd></div>
                    <div><dt>Bit rate</dt><dd>{file?.bitrate ? `${Math.round(file.bitrate / 1000)} kb/s` : "—"}</dd></div>
                    <div><dt>Size</dt><dd>{formatBytes(file?.size)}</dd></div>
                  </dl>
                  {candidate.flags?.length > 0 && <ul className="candidate-flags">{candidate.flags.map((flag) => <li key={flag}>{flag}</li>)}</ul>}
                  <label className="comparison-toggle"><input type="checkbox" checked={(track.comparisonQueue || []).includes(candidate.id)} onChange={() => updateTrack((draft) => { toggleComparisonCandidate(draft, candidate.id); })} /><span>Add to loudness-matched comparison queue</span><small>Creates previews only; audition and master choices remain unchanged.</small></label>
                  <label className="candidate-notes">Candidate notes<textarea value={candidate.notes || ""} onChange={(event) => updateTrack((draft) => { draft.candidates.find((item) => item.id === candidate.id).notes = event.target.value; })} placeholder="Mix, vocal, artifacts, ending, emotional fit…" /></label>
                </li>
              );
            })}
          </ol>
        )}

        <section className="decision-record">
          <h3>Decision Record</h3>
          <div className="decision-fields">
            <label>Disposition<select value={track.decisionStatus} onChange={(event) => updateTrack((draft) => { draft.decisionStatus = event.target.value; })}><option value="undecided">Undecided</option><option value="provisional">Provisional selection</option><option value="approved">Approved master source</option><option value="replacement">Replacement required</option><option value="missing">Missing audio</option><option value="legacy">Legacy source only</option><option value="released">Released source</option></select></label>
            <label>Review notes<textarea value={track.notes || ""} onChange={(event) => updateTrack((draft) => { draft.notes = event.target.value; })} placeholder="Decision rationale and next action…" /></label>
          </div>
        </section>
      </section>
    </main>
  );
}
