import React, { useState } from "react";
import { formatBytes } from "../lib/format.js";
import { DownloadIcon, ExportIcon, MusicIcon, WarningIcon } from "./Icons.jsx";

export function AudioExportForm({ album, selectedTrack, rendering, renderJob, error, result, onRender, onCancelRender, onClear, onCancel }) {
  const [scope, setScope] = useState(selectedTrack ? "track" : "album");
  const [format, setFormat] = useState("wav");
  if (result) return (
    <div className="modal-form audio-export-result">
      <div className="render-complete-mark"><MusicIcon size={26}/><div><strong>Audio print complete</strong><small>{result.audioName} · {formatBytes(result.size)}</small></div></div>
      <audio controls preload="metadata" src={result.audioUrl}>Your browser cannot preview this render.</audio>
      {result.warnings?.map((warning) => <p key={warning} className="render-warning"><WarningIcon /> {warning}</p>)}
      <div className="render-downloads">
        <a className="primary-button" href={result.audioUrl} download={result.audioName}><DownloadIcon /> Download {result.format.toUpperCase()}</a>
        {result.cueUrl && <a className="text-button" href={result.cueUrl} download><DownloadIcon /> Cue Sheet</a>}
        {result.manifestUrl && <a className="text-button" href={result.manifestUrl} download><DownloadIcon /> Render Manifest</a>}
      </div>
      <label className="render-output-path">Local print folder<input readOnly value={result.outputDirectory} onFocus={(event) => event.currentTarget.select()} /></label>
      <p>The render is a new derivative. Every indexed source remains untouched at its original path.</p>
      <div className="modal-actions"><button type="button" className="text-button" onClick={onClear}>Print Another</button><button type="button" className="primary-button primary-button--yellow" onClick={onCancel}>Done</button></div>
    </div>
  );

  return (
    <form className="modal-form audio-export-form" onSubmit={(event) => { event.preventDefault(); onRender({ scope, format, trackId: selectedTrack?.id || "" }); }}>
      <p>Print a new audio derivative from the current trims, fades, gaps, and sequence. Source files are read-only.</p>
      <fieldset><legend>What to print</legend>
        <label className={scope === "album" ? "is-selected" : ""}><input type="radio" name="scope" value="album" checked={scope === "album"} onChange={() => setScope("album")} /><span><strong>Full Album Program</strong><small>One continuous file with every playable sequenced track and transition.</small></span></label>
        <label className={`${scope === "track" ? "is-selected" : ""} ${!selectedTrack ? "is-disabled" : ""}`}><input type="radio" name="scope" value="track" checked={scope === "track"} disabled={!selectedTrack} onChange={() => setScope("track")} /><span><strong>Selected Track</strong><small>{selectedTrack ? `${selectedTrack.title} with its trims and fades.` : "Choose a playable track first."}</small></span></label>
      </fieldset>
      <fieldset><legend>Audio format</legend>
        <label className={format === "wav" ? "is-selected" : ""}><input type="radio" name="format" value="wav" checked={format === "wav"} onChange={() => setFormat("wav")} /><span><strong>WAV for Mastering</strong><small>24-bit PCM · 48 kHz · lossless</small></span></label>
        <label className={format === "mp3" ? "is-selected" : ""}><input type="radio" name="format" value="mp3" checked={format === "mp3"} onChange={() => setFormat("mp3")} /><span><strong>MP3 for Review</strong><small>320 kbps · 48 kHz</small></span></label>
      </fieldset>
      {scope === "track" && selectedTrack?.mastering?.endMode === "crossfade" && <p className="render-warning"><WarningIcon /> A selected-track print cannot include the next song, so its crossfade length becomes a fade-out. Choose Full Album Program to print the actual overlap.</p>}
      {rendering && <div className="render-progress" role="status" aria-live="polite">
        <div><strong>{renderJob?.phase === "queued" ? "Waiting to print" : renderJob?.phase === "cancelling" ? "Cancelling print" : "Printing audio"}</strong><span>{renderJob?.progress || 0}%</span></div>
        <progress max="100" value={renderJob?.progress || 0}>{renderJob?.progress || 0}%</progress>
        <small>{renderJob?.phase === "documenting" ? "Writing the cue sheet and manifest…" : renderJob?.phase === "queued" ? "Another print is finishing first…" : "FFmpeg is creating a new derivative. Indexed sources remain read-only."}</small>
      </div>}
      {error && <p className="render-error" role="alert"><WarningIcon /> {error}</p>}
      <div className="render-safety-note"><ExportIcon /><p><strong>Each print includes documentation.</strong> Album and track exports include a cue sheet and JSON manifest beside the audio.</p></div>
      <div className="modal-actions"><button type="button" className="text-button" onClick={rendering ? onCancelRender : onCancel}>{rendering ? "Cancel Print" : "Cancel"}</button><button type="submit" className="primary-button primary-button--yellow" disabled={rendering}><ExportIcon /> {rendering ? "Printing Audio…" : `Print ${format.toUpperCase()}`}</button></div>
    </form>
  );
}
