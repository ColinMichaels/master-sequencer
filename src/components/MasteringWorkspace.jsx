import React, { useCallback, useEffect, useMemo, useState } from "react";
import { sourceKey } from "../lib/api.js";
import { api } from "../lib/api.js";
import { DELIVERY_PROFILES } from "../lib/delivery-profiles.js";
import { formatDuration } from "../lib/format.js";
import { calculateProgramTimeline, masteringSummary, normalizeMasterBus, normalizeMastering, programDuration } from "../lib/mastering.js";
import { sequenceTracks } from "../lib/sequence-tracks.js";
import { ExportIcon, PlayIcon, RefreshIcon, ScissorsIcon, WarningIcon, WaveIcon } from "./Icons.jsx";
import { WaveformEditor } from "./WaveformEditor.jsx";
import { TransitionCurve } from "./TransitionCurve.jsx";
import { transitionCurve } from "../lib/waveform.js";
import { RenderHistory } from "./RenderHistory.jsx";
import { MasterBusControls, MasteringNumberField as NumberField, TrackLevelControl } from "./MasteringControls.jsx";
import { MasteringReferenceAB } from "./MasteringReferenceAB.jsx";

const fileForTrack = (track, libraryMap) => {
  const candidate = track.candidates.find((item) => item.id === track.auditionCandidateId);
  return candidate ? libraryMap.get(sourceKey(candidate.sourceRef)) : null;
};

const timeLabel = (value, precise = false) => value <= 0 ? (precise ? "0:00.000" : "0:00") : formatDuration(value, precise);

export function MasteringWorkspace({ album, libraryMap, presets, renderingAvailable = true, revealPrivateFilenames = false, protectedSourceKeys, activeComparison, onAlbumChange, onPreview, onReferenceCompare, previewingTrackId, onOpenExport, onTrackFocus, onPreviewChapter, onSavePreset, onLoadPreset, onDeletePreset, meteringRef, meteringAvailable, playing, liveProcessing, monitorLabel }) {
  const tracks = useMemo(() => sequenceTracks(album), [album]);
  const [selectedTrackId, setSelectedTrackId] = useState(tracks[0]?.id || "");
  const [analysisByKey, setAnalysisByKey] = useState({});
  const [analyzingKey, setAnalyzingKey] = useState("");
  const [analysisError, setAnalysisError] = useState("");
  useEffect(() => {
    if (!tracks.some((track) => track.id === selectedTrackId)) setSelectedTrackId(tracks[0]?.id || "");
  }, [album.id, tracks, selectedTrackId]);
  useEffect(() => { onTrackFocus(selectedTrackId); }, [onTrackFocus, selectedTrackId]);

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
  const analysis = selectedFile ? analysisByKey[selectedFile.key] : null;
  const delivery = album.delivery || {};
  const masterBus = useMemo(() => normalizeMasterBus(album.masterBus), [album.masterBus]);

  const updateMastering = (field, value) => onAlbumChange((draft) => {
    const track = draft.tracks.find((item) => item.id === selectedTrackId);
    track.mastering = { ...(track.mastering || {}), [field]: value };
  });
  const resetMastering = () => onAlbumChange((draft) => {
    const track = draft.tracks.find((item) => item.id === selectedTrackId);
    delete track.mastering;
  });
  const analyzeSelected = async () => {
    if (!selectedFile) return;
    setAnalyzingKey(selectedFile.key);
    setAnalysisError("");
    try {
      const result = await api.technicalAnalysis(selectedFile.key);
      setAnalysisByKey((current) => ({ ...current, [selectedFile.key]: result }));
    } catch (error) {
      setAnalysisError(error.message);
    } finally {
      setAnalyzingKey("");
    }
  };
  const updateDelivery = (field, value) => onAlbumChange((draft) => {
    draft.delivery = { profileId: "", masterApproved: false, readyToPublish: false, ...(draft.delivery || {}), [field]: value };
  });
  const updateMasterBus = (path, value) => onAlbumChange((draft) => {
    const next = normalizeMasterBus(draft.masterBus);
    let target = next;
    path.slice(0, -1).forEach((key) => { target = target[key]; });
    target[path.at(-1)] = value;
    draft.masterBus = normalizeMasterBus(next);
  });
  const resetMasterBus = () => onAlbumChange((draft) => { draft.masterBus = normalizeMasterBus(); });
  const updateReference = (sourceRef) => onAlbumChange((draft) => {
    if (sourceRef) draft.masteringReferenceSourceRef = sourceRef;
    else delete draft.masteringReferenceSourceRef;
  });
  const compareReference = useCallback((channel, referenceFile, referenceLabel) => onReferenceCompare({
    channel,
    track: selectedTrack,
    file: selectedFile,
    referenceFile,
    referenceLabel,
    albumTitle: album.title,
  }), [album.title, onReferenceCompare, selectedFile, selectedTrack]);

  if (!tracks.length) return <main className="mastering-workspace"><div className="empty-state"><ScissorsIcon size={30}/><h2>No tracks are currently sequenced.</h2><p>Restore or add a track in Sequence before creating timing and fade instructions.</p></div></main>;

  return (
    <main className="mastering-workspace">
      <header className="mastering-heading">
        <h2 className="sr-only">Mastering</h2>
        <dl><div><dt>{formatDuration(programDuration(entries))}</dt><dd>Estimated program</dd></div><div><dt>{editedCount}/{tracks.length}</dt><dd>Tracks edited</dd></div><div className={missingCount ? "is-warning" : ""}><dt>{missingCount}</dt><dd>Missing audio</dd></div></dl>
        <div className="mastering-delivery-controls" role="group" aria-label="Delivery and publication controls">
          <label className="mastering-delivery-select"><span>Delivery</span><select aria-label="Print requirements" value={delivery.profileId || ""} onChange={(event) => updateDelivery("profileId", event.target.value)}><option value="">No delivery profile</option>{DELIVERY_PROFILES.map((profile) => <option key={profile.id} value={profile.id}>{profile.name} — {profile.description}</option>)}</select></label>
          <label className={`mastering-delivery-check ${delivery.masterApproved ? "is-checked" : ""}`} title="Master approval is recorded separately from the delivery profile"><input type="checkbox" aria-label="Approved master" checked={Boolean(delivery.masterApproved)} onChange={(event) => updateDelivery("masterApproved", event.target.checked)} /><span>Approved</span></label>
          <label className={`mastering-delivery-check ${delivery.readyToPublish ? "is-checked" : ""}`} title="Publication readiness is recorded separately from master approval"><input type="checkbox" aria-label="Ready to publish" checked={Boolean(delivery.readyToPublish)} onChange={(event) => updateDelivery("readyToPublish", event.target.checked)} /><span>Ready</span></label>
          <button type="button" className="primary-button primary-button--yellow" onClick={() => onOpenExport(selectedFile ? selectedTrackId : "")} disabled={!renderingAvailable || !entries.length} title={renderingAvailable ? "Print a documented audio derivative" : "Documented audio printing is unavailable in the browser"}><ExportIcon /> {renderingAvailable ? "Print / Export Audio" : "Print Unavailable"}</button>
        </div>
      </header>

      <MasteringReferenceAB
        track={selectedTrack}
        currentFile={selectedFile}
        libraryMap={libraryMap}
        referenceSourceRef={album.masteringReferenceSourceRef}
        protectedSourceKeys={protectedSourceKeys}
        revealPrivateFilenames={revealPrivateFilenames}
        activeComparison={activeComparison}
        onReferenceChange={updateReference}
        onCompare={compareReference}
      />

      <MasterBusControls bus={masterBus} presets={presets} onChange={updateMasterBus} onReset={resetMasterBus} onSavePreset={onSavePreset} onLoadPreset={onLoadPreset} onDeletePreset={onDeletePreset} meteringRef={meteringRef} meteringAvailable={meteringAvailable} playing={playing} liveProcessing={liveProcessing} monitorLabel={monitorLabel} />

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

              <section className="technical-analysis">
                <header><div><h3>Optional Technical Analysis</h3><p>Rebuildable measurements only. No source is normalized or changed.</p></div><button type="button" className="text-button" disabled={analyzingKey === selectedFile.key} onClick={analyzeSelected}>{analyzingKey === selectedFile.key ? "Analyzing…" : analysis ? "Analyze Again" : "Analyze Source"}</button></header>
                {analysis && <dl><div><dt>Integrated</dt><dd>{analysis.measurements.integratedLoudness?.toFixed(1) ?? "—"} LUFS</dd></div><div><dt>True peak</dt><dd>{analysis.measurements.truePeak?.toFixed(1) ?? "—"} dBFS</dd></div><div><dt>Loudness range</dt><dd>{analysis.measurements.loudnessRange?.toFixed(1) ?? "—"} LU</dd></div><div><dt>DC offset</dt><dd>{analysis.measurements.dcOffset?.toFixed(6) ?? "—"}</dd></div><div><dt>Silence regions</dt><dd>{analysis.measurements.silenceBoundaries.length}</dd></div></dl>}
                {analysisError && <p className="render-error" role="alert">{analysisError}</p>}
              </section>

              <TrackLevelControl value={settings.gainDb} onChange={(value) => updateMastering("gainDb", value)} />

              <section className="mastering-control-section">
                <div className="mastering-section-title"><ScissorsIcon /><div><h3>Trim &amp; Opening</h3><p>Shorten the source from either end and optionally fade into the opening.</p></div></div>
                <div className="mastering-field-grid">
                  <NumberField label="Start at" value={settings.trimStart.toFixed(3)} maximum={Math.max(0, settings.trimEnd - 0.1)} step={0.01} onCommit={(value) => updateMastering("trimStart", value)} />
                  <NumberField label="End at" value={settings.trimEnd.toFixed(3)} minimum={settings.trimStart + 0.1} maximum={selectedFile.duration} step={0.01} onCommit={(value) => updateMastering("trimEnd", value)} />
                  <NumberField label="Fade in" value={settings.fadeIn.toFixed(2)} maximum={settings.duration - 0.05} step={0.1} onCommit={(value) => updateMastering("fadeIn", value)} />
                </div>
                <button type="button" className="text-button preview-edit-button" disabled={!renderingAvailable || previewingTrackId === selectedTrack.id} title={renderingAvailable ? "Print a short edited-start preview" : "Rendered edit previews are unavailable in the browser"} onClick={() => onPreview(selectedTrack.id, "start")}><PlayIcon /> {previewingTrackId === selectedTrack.id ? "Printing Preview…" : renderingAvailable ? "Preview Edited Start" : "Preview Unavailable"}</button>
              </section>

              <section className="mastering-control-section mastering-ending-section">
                <div className="mastering-section-title"><WaveIcon /><div><h3>Choose the Ending</h3><p>Set the behavior after the trim point. Crossfade overlaps the next playable track.</p></div></div>
                <div className="ending-mode-grid">
                  {[
                    ["natural", "Natural", "Keep the ending intact"],
                    ["cut", "Hard Cut", "Stop exactly at the trim point"],
                    ["fade", "Fade Out", "Fade to silence before the end"],
                    ["crossfade", "Crossfade", hasNextPlayable ? `Overlap into ${nextPlayable.track.title}` : "Needs a next playable track"],
                  ].map(([mode, label, copy]) => <label key={mode} className={`${settings.endMode === mode ? "is-selected" : ""} ${mode === "crossfade" && !hasNextPlayable ? "is-disabled" : ""}`}><input type="radio" name={`ending-${selectedTrack.id}`} value={mode} checked={settings.endMode === mode} disabled={mode === "crossfade" && !hasNextPlayable} onChange={() => updateMastering("endMode", mode)} /><TransitionCurve mode={mode} /><strong>{label}</strong><small>{copy}</small><em>{transitionCurve(mode).curveLabel}</em></label>)}
                </div>
                <div className="mastering-field-grid mastering-field-grid--ending">
                  <NumberField label={settings.endMode === "crossfade" ? "Crossfade length" : "Ending fade length"} value={settings.endDuration.toFixed(2)} maximum={settings.duration - 0.05} step={0.1} disabled={!['fade', 'crossfade'].includes(settings.endMode)} onCommit={(value) => updateMastering("endDuration", value)} />
                  <NumberField label="Silence after" value={settings.gapAfter.toFixed(2)} maximum={30} step={0.1} disabled={settings.endMode === "crossfade" || !hasNextPlayable} onCommit={(value) => updateMastering("gapAfter", value)} />
                  <div className="ending-result"><span>Result</span><strong>{masteringSummary(settings)}</strong></div>
                </div>
                <button type="button" className="primary-button preview-ending-button" disabled={!renderingAvailable || previewingTrackId === selectedTrack.id} title={renderingAvailable ? "Print a short edited-ending preview" : "Rendered edit previews are unavailable in the browser"} onClick={() => onPreview(selectedTrack.id, "end")}><PlayIcon /> {previewingTrackId === selectedTrack.id ? "Printing Preview…" : renderingAvailable ? "Preview Edited Ending" : "Preview Unavailable"}</button>
              </section>
            </>
          )}
        </section>

        <aside className="mastering-program" aria-labelledby="program-timeline-title">
          <header><h3 id="program-timeline-title">Chapter Preview</h3><small>Cue navigation · no full reprint</small></header>
          <ol>{timeline.map((entry, index) => <li key={entry.track.id}><span>{index + 1}</span><div><strong>{entry.track.title}</strong><small>{masteringSummary(entry.settings)}</small></div><time>{timeLabel(entry.outputStart, true)}</time><button type="button" className="chapter-cue" onClick={() => onPreviewChapter(index)} aria-label={`Preview chapter ${index + 1}: ${entry.track.title}`}><PlayIcon /></button></li>)}</ol>
          {missingCount > 0 && <div className="mastering-warning"><WarningIcon /><p><strong>{missingCount} track{missingCount === 1 ? "" : "s"} will be skipped.</strong> Add audio before printing a complete album master.</p></div>}
          <div className="program-total"><span>Estimated length</span><strong>{formatDuration(programDuration(entries), true)}</strong></div>
        </aside>
      </div>
      <RenderHistory />
    </main>
  );
}
