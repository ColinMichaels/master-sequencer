import React, { useEffect, useMemo, useState } from "react";
import { sourceKey } from "../lib/api.js";
import { formatDuration } from "../lib/format.js";
import { calculateProgramTimeline, masteringSummary, normalizeMastering, programDuration } from "../lib/mastering.js";
import { sequenceTracks } from "../lib/sequence-tracks.js";
import { ExportIcon, PlayIcon, RefreshIcon, ScissorsIcon, WarningIcon, WaveIcon } from "./Icons.jsx";
import { WaveformEditor } from "./WaveformEditor.jsx";

function NumberField({ label, value, minimum = 0, maximum, step = 0.1, suffix = "seconds", onCommit, disabled = false }) {
  const [draft, setDraft] = useState(String(value));
  useEffect(() => { setDraft(String(value)); }, [value]);
  const commit = () => {
    const parsed = Number(draft);
    if (Number.isFinite(parsed)) onCommit(Math.min(maximum ?? parsed, Math.max(minimum, parsed)));
    else setDraft(String(value));
  };
  return <label className="mastering-number-field"><span>{label}</span><div><input type="number" min={minimum} max={maximum} step={step} value={draft} disabled={disabled} onChange={(event) => setDraft(event.target.value)} onBlur={commit} onKeyDown={(event) => { if (event.key === "Enter") event.currentTarget.blur(); }} /><small>{suffix}</small></div></label>;
}

const fileForTrack = (track, libraryMap) => {
  const candidate = track.candidates.find((item) => item.id === track.auditionCandidateId);
  return candidate ? libraryMap.get(sourceKey(candidate.sourceRef)) : null;
};

const timeLabel = (value, precise = false) => value <= 0 ? (precise ? "0:00.000" : "0:00") : formatDuration(value, precise);

export function MasteringWorkspace({ album, libraryMap, onAlbumChange, onPreview, previewingTrackId, onOpenExport }) {
  const tracks = useMemo(() => sequenceTracks(album), [album]);
  const [selectedTrackId, setSelectedTrackId] = useState(tracks[0]?.id || "");
  useEffect(() => {
    if (!tracks.some((track) => track.id === selectedTrackId)) setSelectedTrackId(tracks[0]?.id || "");
  }, [album.id, tracks, selectedTrackId]);

  const entries = useMemo(() => tracks.flatMap((track) => {
    const file = fileForTrack(track, libraryMap);
    return file ? [{ track, sourceDuration: file.duration, mastering: track.mastering || {}, file }] : [];
  }), [tracks, libraryMap]);
  const timeline = useMemo(() => calculateProgramTimeline(entries), [entries]);
  const timelineByTrackId = useMemo(() => new Map(timeline.map((entry) => [entry.track.id, entry])), [timeline]);
  const selectedTrack = tracks.find((track) => track.id === selectedTrackId);
  const selectedFile = selectedTrack ? fileForTrack(selectedTrack, libraryMap) : null;
  const selectedPlayableIndex = entries.findIndex((entry) => entry.track.id === selectedTrackId);
  const hasNextPlayable = selectedPlayableIndex >= 0 && selectedPlayableIndex < entries.length - 1;
  const nextPlayable = hasNextPlayable ? entries[selectedPlayableIndex + 1] : null;
  const settings = selectedFile ? normalizeMastering(selectedTrack.mastering, selectedFile.duration, { hasNext: hasNextPlayable }) : null;
  const missingCount = tracks.length - entries.length;
  const editedCount = tracks.filter((track) => track.mastering && Object.keys(track.mastering).length).length;

  const updateMastering = (field, value) => onAlbumChange((draft) => {
    const track = draft.tracks.find((item) => item.id === selectedTrackId);
    track.mastering = { ...(track.mastering || {}), [field]: value };
  });
  const resetMastering = () => onAlbumChange((draft) => {
    const track = draft.tracks.find((item) => item.id === selectedTrackId);
    delete track.mastering;
  });

  if (!tracks.length) return <main className="mastering-workspace"><div className="empty-state"><ScissorsIcon size={30}/><h2>No tracks are currently sequenced.</h2><p>Restore or add a track in Sequence before creating timing and fade instructions.</p></div></main>;

  return (
    <main className="mastering-workspace">
      <header className="mastering-heading">
        <div><h2>{album.title} <span>— Timing &amp; Fades</span></h2><p>All edits are instructions. Indexed source audio is never changed.</p></div>
        <dl><div><dt>{formatDuration(programDuration(entries))}</dt><dd>Estimated program</dd></div><div><dt>{editedCount}/{tracks.length}</dt><dd>Tracks edited</dd></div><div className={missingCount ? "is-warning" : ""}><dt>{missingCount}</dt><dd>Missing audio</dd></div></dl>
        <button type="button" className="primary-button primary-button--yellow" onClick={() => onOpenExport(selectedFile ? selectedTrackId : "")} disabled={!entries.length}><ExportIcon /> Print / Export Audio</button>
      </header>

      <div className="mastering-columns">
        <nav className="mastering-track-list" aria-label={`${album.title} mastering tracks`}>
          <header><h3>Program Order</h3><small>{tracks.length} sequenced tracks</small></header>
          <ol>{tracks.map((track, index) => {
            const timelineEntry = timelineByTrackId.get(track.id);
            const file = fileForTrack(track, libraryMap);
            return <li key={track.id}><button type="button" className={`${track.id === selectedTrackId ? "is-active" : ""} ${!file ? "is-missing" : ""}`} onClick={() => setSelectedTrackId(track.id)}><span>{index + 1}</span><span><strong>{track.title}</strong><small>{file ? masteringSummary(track.mastering) : "Missing audio"}</small></span><time>{timelineEntry ? timeLabel(timelineEntry.outputStart) : "—:—"}</time></button></li>;
          })}</ol>
        </nav>

        <section className="mastering-editor" aria-live="polite">
          {!selectedTrack || !selectedFile ? (
            <div className="mastering-missing"><WarningIcon size={34}/><h3>{selectedTrack?.title || "No track selected"}</h3><p>This track needs a playable audition source before it can be trimmed, faded, previewed, or printed.</p></div>
          ) : (
            <>
              <header><div><span>Track {tracks.indexOf(selectedTrack) + 1}</span><h2>{selectedTrack.title}</h2><p>{selectedFile.name} · source {formatDuration(selectedFile.duration, true)}</p></div><button type="button" className="text-button" onClick={resetMastering}><RefreshIcon /> Reset Edit</button></header>

              <WaveformEditor
                file={selectedFile}
                trackTitle={selectedTrack.title}
                trackNumber={tracks.indexOf(selectedTrack) + 1}
                trackCount={tracks.length}
                nextTrackTitle={nextPlayable?.track.title || ""}
                trimStart={settings.trimStart}
                trimEnd={settings.trimEnd}
                fadeIn={settings.fadeIn}
                endMode={settings.endMode}
                endDuration={settings.endDuration}
                onTrimChange={updateMastering}
              />

              <section className="mastering-control-section">
                <div className="mastering-section-title"><ScissorsIcon /><div><h3>Trim &amp; Opening</h3><p>Shorten the source from either end and optionally fade into the opening.</p></div></div>
                <div className="mastering-field-grid">
                  <NumberField label="Start at" value={settings.trimStart.toFixed(3)} maximum={Math.max(0, settings.trimEnd - 0.1)} step={0.01} onCommit={(value) => updateMastering("trimStart", value)} />
                  <NumberField label="End at" value={settings.trimEnd.toFixed(3)} minimum={settings.trimStart + 0.1} maximum={selectedFile.duration} step={0.01} onCommit={(value) => updateMastering("trimEnd", value)} />
                  <NumberField label="Fade in" value={settings.fadeIn.toFixed(2)} maximum={settings.duration - 0.05} step={0.1} onCommit={(value) => updateMastering("fadeIn", value)} />
                </div>
                <button type="button" className="text-button preview-edit-button" disabled={previewingTrackId === selectedTrack.id} onClick={() => onPreview(selectedTrack.id, "start")}><PlayIcon /> {previewingTrackId === selectedTrack.id ? "Printing Preview…" : "Preview Edited Start"}</button>
              </section>

              <section className="mastering-control-section mastering-ending-section">
                <div className="mastering-section-title"><WaveIcon /><div><h3>Choose the Ending</h3><p>Set the behavior after the trim point. Crossfade overlaps the next playable track.</p></div></div>
                <div className="ending-mode-grid">
                  {[
                    ["natural", "Natural", "Keep the ending intact"],
                    ["cut", "Hard Cut", "Stop exactly at the trim point"],
                    ["fade", "Fade Out", "Fade to silence before the end"],
                    ["crossfade", "Crossfade", hasNextPlayable ? `Overlap into ${nextPlayable.track.title}` : "Needs a next playable track"],
                  ].map(([mode, label, copy]) => <label key={mode} className={`${settings.endMode === mode ? "is-selected" : ""} ${mode === "crossfade" && !hasNextPlayable ? "is-disabled" : ""}`}><input type="radio" name={`ending-${selectedTrack.id}`} value={mode} checked={settings.endMode === mode} disabled={mode === "crossfade" && !hasNextPlayable} onChange={() => updateMastering("endMode", mode)} /><strong>{label}</strong><small>{copy}</small></label>)}
                </div>
                <div className="mastering-field-grid mastering-field-grid--ending">
                  <NumberField label={settings.endMode === "crossfade" ? "Crossfade length" : "Ending fade length"} value={settings.endDuration.toFixed(2)} maximum={settings.duration - 0.05} step={0.1} disabled={!['fade', 'crossfade'].includes(settings.endMode)} onCommit={(value) => updateMastering("endDuration", value)} />
                  <NumberField label="Silence after" value={settings.gapAfter.toFixed(2)} maximum={30} step={0.1} disabled={settings.endMode === "crossfade" || !hasNextPlayable} onCommit={(value) => updateMastering("gapAfter", value)} />
                  <div className="ending-result"><span>Result</span><strong>{masteringSummary(settings)}</strong></div>
                </div>
                <button type="button" className="primary-button preview-ending-button" disabled={previewingTrackId === selectedTrack.id} onClick={() => onPreview(selectedTrack.id, "end")}><PlayIcon /> {previewingTrackId === selectedTrack.id ? "Printing Preview…" : "Preview Edited Ending"}</button>
              </section>
            </>
          )}
        </section>

        <aside className="mastering-program" aria-labelledby="program-timeline-title">
          <header><h3 id="program-timeline-title">Rendered Timeline</h3><small>First playable frame</small></header>
          <ol>{timeline.map((entry, index) => <li key={entry.track.id}><span>{index + 1}</span><div><strong>{entry.track.title}</strong><small>{masteringSummary(entry.settings)}</small></div><time>{timeLabel(entry.outputStart, true)}</time></li>)}</ol>
          {missingCount > 0 && <div className="mastering-warning"><WarningIcon /><p><strong>{missingCount} track{missingCount === 1 ? "" : "s"} will be skipped.</strong> Add audio before printing a complete album master.</p></div>}
          <div className="program-total"><span>Estimated length</span><strong>{formatDuration(programDuration(entries), true)}</strong></div>
        </aside>
      </div>
    </main>
  );
}
