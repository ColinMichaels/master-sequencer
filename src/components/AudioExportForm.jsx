import React, { useState } from "react";
import { formatBytes } from "../lib/format.js";
import { DownloadIcon, ExportIcon, MusicIcon, WarningIcon } from "./Icons.jsx";
import { deliveryProfile } from "../lib/delivery-profiles.js";
import { createMasteringPrintPlan } from "../lib/mastering-print-plan.js";
import { AUDIO_EXPORT_FORMATS, audioExportFormat, audioExportSummary, sampleRateLabel } from "../lib/audio-export-settings.js";

export function AudioExportForm({ album, selectedTrack, deliveryProfileId, rendering, renderJob, error, result, onRender, onCancelRender, onClear, onCancel }) {
  const profile = deliveryProfile(deliveryProfileId);
  const scopeAllowed = (value) => !profile?.allowedScopes || profile.allowedScopes.includes(value);
  const sequencedTrackCount = album.tracks.filter((track) => track.inSequence !== false).length;
  const printPlan = result?.masteringPrintPlan || createMasteringPrintPlan(album);
  const processingDetail = printPlan.bypassed
    ? "The selected MASTER path is bypassed, so its effects stay out of this print."
    : printPlan.processors.length === 0
      ? "No rack processors are active; the print goes directly from track edits and level to output."
      : printPlan.processors.length === 1
        ? `The active ${printPlan.path === "advanced" ? "rack processor" : "MASTER stage"} will be printed in this position.`
        : `All ${printPlan.processors.length} active ${printPlan.path === "advanced" ? "rack processors" : "MASTER stages"} will be printed in this order.`;
  const [scope, setScope] = useState(profile?.defaultScope || (selectedTrack ? "track" : "album"));
  const [format, setFormat] = useState(profile?.defaultFormat || "wav");
  const initialFormat = audioExportFormat(profile?.defaultFormat || "wav");
  const [sampleRate, setSampleRate] = useState(profile?.defaultSampleRate || initialFormat.defaultSampleRate);
  const [bitDepth, setBitDepth] = useState(profile?.defaultBitDepth || initialFormat.defaultBitDepth || 24);
  const [bitrateKbps, setBitrateKbps] = useState(profile?.defaultBitrateKbps || initialFormat.defaultBitrateKbps || 320);
  const formatOption = audioExportFormat(format);
  const exportSettings = { format, sampleRate, bitDepth, bitrateKbps };
  const selectFormat = (nextFormat) => {
    const option = audioExportFormat(nextFormat);
    setFormat(nextFormat);
    if (!option.sampleRates.includes(sampleRate)) setSampleRate(option.defaultSampleRate);
    if (option.qualityKind === "bitDepth") setBitDepth(option.defaultBitDepth);
    else setBitrateKbps(option.defaultBitrateKbps);
  };
  const renderedFiles = result?.files || [];
  if (result) return (
    <div className="modal-form audio-export-result">
      <div className="render-complete-mark"><MusicIcon size={26}/><div><strong>{renderedFiles.length ? "Numbered track print complete" : "Audio print complete"}</strong><small>{renderedFiles.length ? `${renderedFiles.length} separate files` : result.audioName} · {audioExportSummary(result.audioSettings || result)} · {formatBytes(result.size)}</small></div></div>
      <div className="mastering-print-plan mastering-print-plan--complete"><strong>Printed through {printPlan.pathLabel}</strong><p>{printPlan.summary}</p></div>
      {renderedFiles.length ? <ol className="rendered-track-files" aria-label="Rendered individual track files">
        {renderedFiles.map((file) => <li key={file.trackId}><span><strong>{String(file.trackNumber).padStart(2, "0")} · {file.title}</strong><small>{file.audioName} · {formatBytes(file.size)}</small></span><a className="text-button" href={file.audioUrl} download={file.audioName}><DownloadIcon /> Download</a></li>)}
      </ol> : <audio controls preload="metadata" src={result.audioUrl}>Your browser cannot preview this render.</audio>}
      {result.warnings?.map((warning) => <p key={warning} className="render-warning"><WarningIcon /> {warning}</p>)}
      <div className="render-downloads">
        {!renderedFiles.length && <a className="primary-button" href={result.audioUrl} download={result.audioName}><DownloadIcon /> Download {result.format.toUpperCase()}</a>}
        {result.cueUrl && <a className="text-button" href={result.cueUrl} download><DownloadIcon /> Cue Sheet</a>}
        {result.manifestUrl && <a className="text-button" href={result.manifestUrl} download><DownloadIcon /> Render Manifest</a>}
      </div>
      <label className="render-output-path">Local print folder<input readOnly value={result.outputDirectory} onFocus={(event) => event.currentTarget.select()} /></label>
      <p>The render is a new derivative. Every indexed source remains untouched at its original path.</p>
      <div className="modal-actions"><button type="button" className="text-button" onClick={onClear}>Print Another</button><button type="button" className="primary-button primary-button--yellow" onClick={onCancel}>Done</button></div>
    </div>
  );

  return (
    <form className="modal-form audio-export-form" onSubmit={(event) => { event.preventDefault(); onRender({ scope, ...exportSettings, trackId: selectedTrack?.id || "", deliveryProfileId: profile?.id || "" }); }}>
      <p>Print a new audio derivative from the current trims, fades, gaps, sequence, track levels, and active MASTER processing. Source files are read-only.</p>
      <section className="mastering-print-plan" aria-labelledby="mastering-print-plan-title">
        <div><strong id="mastering-print-plan-title">MASTER processing included</strong><span>{printPlan.pathLabel}</span></div>
        <p>{printPlan.summary}</p>
        <small>{processingDetail}</small>
      </section>
      {printPlan.inactiveProcessors.length > 0 && <p className="mastering-print-note">{printPlan.inactiveProcessors.length} bypassed or unavailable rack {printPlan.inactiveProcessors.length === 1 ? "unit stays" : "units stay"} out of circuit.</p>}
      {!printPlan.canRender && <p className="render-error" role="alert"><WarningIcon /> Resolve or bypass {printPlan.unresolvedProcessors.join(", ")} before printing. Active DSP is never silently omitted.</p>}
      {profile && <div className="delivery-profile-summary"><strong>{profile.name}</strong><span>{profile.description}</span><small>The profile sets starting values; format and quality remain adjustable. It does not approve a master or mark the album ready to publish.</small></div>}
      <fieldset className="audio-export-scopes"><legend>What to print</legend>
        <label className={`${scope === "album" ? "is-selected" : ""} ${!scopeAllowed("album") ? "is-disabled" : ""}`}><input type="radio" name="scope" value="album" checked={scope === "album"} disabled={!scopeAllowed("album")} onChange={() => setScope("album")} /><span><strong>Full Album Program</strong><small>{scopeAllowed("album") ? "One continuous file with every playable sequenced track and transition." : `${profile.name} requires numbered individual tracks.`}</small></span></label>
        <label className={`${scope === "tracks" ? "is-selected" : ""} ${!scopeAllowed("tracks") ? "is-disabled" : ""}`}><input type="radio" name="scope" value="tracks" checked={scope === "tracks"} disabled={!scopeAllowed("tracks")} onChange={() => setScope("tracks")} /><span><strong>Separate Numbered Tracks</strong><small>One “01 - Track Name” file per sequenced song, with trims, fades, levels, and MASTER effects printed.</small></span></label>
        <label className={`${scope === "track" ? "is-selected" : ""} ${!selectedTrack || !scopeAllowed("track") ? "is-disabled" : ""}`}><input type="radio" name="scope" value="track" checked={scope === "track"} disabled={!selectedTrack || !scopeAllowed("track")} onChange={() => setScope("track")} /><span><strong>Selected Track</strong><small>{!scopeAllowed("track") ? `${profile.name} requires numbered individual tracks.` : selectedTrack ? `${selectedTrack.title} with its trims and fades.` : "Choose a playable track first."}</small></span></label>
      </fieldset>
      <fieldset className="audio-format-options"><legend>Audio format</legend>
        {AUDIO_EXPORT_FORMATS.map((option) => <label key={option.id} className={format === option.id ? "is-selected" : ""}><input type="radio" name="format" value={option.id} checked={format === option.id} onChange={() => selectFormat(option.id)} /><span><strong>{option.label}</strong><small>{option.description}</small></span></label>)}
      </fieldset>
      <fieldset className="audio-export-quality"><legend>Audio quality</legend>
        <label><span>Sample rate</span><select aria-label="Sample rate" value={sampleRate} onChange={(event) => setSampleRate(Number(event.target.value))}>{formatOption.sampleRates.map((value) => <option key={value} value={value}>{sampleRateLabel(value)}</option>)}</select><small>The printed MASTER and final file use this rate.</small></label>
        {formatOption.qualityKind === "bitDepth"
          ? <label><span>Bit depth</span><select aria-label="Bit depth" value={bitDepth} onChange={(event) => setBitDepth(Number(event.target.value))}>{formatOption.bitDepths.map((value) => <option key={value} value={value}>{value}-bit</option>)}</select><small>PCM precision for {formatOption.label} output.</small></label>
          : <label><span>Bitrate</span><select aria-label="Bitrate" value={bitrateKbps} onChange={(event) => setBitrateKbps(Number(event.target.value))}>{formatOption.bitratesKbps.map((value) => <option key={value} value={value}>{value} kbps</option>)}</select><small>Higher rates retain more detail and create larger files.</small></label>}
        <output aria-label="Selected audio quality"><strong>{audioExportSummary(exportSettings)}</strong><small>Applied to {scope === "tracks" ? "every numbered track" : "this print"}.</small></output>
      </fieldset>
      {scope === "track" && selectedTrack?.mastering?.endMode === "crossfade" && <p className="render-warning"><WarningIcon /> A selected-track print cannot include the next song, so its crossfade length becomes a fade-out. Choose Full Album Program to print the actual overlap.</p>}
      {scope === "tracks" && <p className="render-track-note"><MusicIcon /> The continuous program passes through MASTER once, then splits into {sequencedTrackCount} numbered files. Crossfades split at their midpoint so gapless playback preserves the transition.</p>}
      {rendering && <div className="render-progress" role="status" aria-live="polite">
        <div><strong>{renderJob?.phase === "queued" ? "Waiting to print" : renderJob?.phase === "cancelling" ? "Cancelling print" : "Printing audio"}</strong><span>{renderJob?.progress || 0}%</span></div>
        <progress max="100" value={renderJob?.progress || 0}>{renderJob?.progress || 0}%</progress>
        <small>{renderJob?.phase === "documenting" ? "Writing the cue sheet and manifest…" : renderJob?.phase === "queued" ? "Another print is finishing first…" : "FFmpeg is creating a new derivative. Indexed sources remain read-only."}</small>
      </div>}
      {error && <p className="render-error" role="alert"><WarningIcon /> {error}</p>}
      <div className="render-safety-note"><ExportIcon /><p><strong>Each print includes documentation.</strong> Album, selected-track, and numbered-track exports include a cue sheet and JSON manifest beside the audio.</p></div>
      <div className="modal-actions"><button type="button" className="text-button" onClick={rendering ? onCancelRender : onCancel}>{rendering ? "Cancel Print" : "Cancel"}</button><button type="submit" className="primary-button primary-button--yellow" disabled={rendering || !printPlan.canRender}><ExportIcon /> {rendering ? "Printing Audio…" : scope === "tracks" ? `Print ${sequencedTrackCount} ${formatOption.label} Tracks` : `Print ${formatOption.label}`}</button></div>
    </form>
  );
}
