import React from "react";
import { ExportIcon, PlayIcon, RefreshIcon } from "./Icons.jsx";

export function TransportBar({ audioRef, current, status, activeAlbum, resetArmed, onPlaySequence, onResetOrder, onExport }) {
  return (
    <footer className="transport-bar">
      <div className="transport-copy"><span>Sequence Preview</span><strong>{current?.trackTitle || "Ready to audition"}</strong><small>{status}</small></div>
      <audio ref={audioRef} controls preload="metadata">Your browser cannot play this audio source.</audio>
      <div className="transport-actions">
        <button type="button" className="transport-button" onClick={onPlaySequence} disabled={!activeAlbum.tracks.length} aria-label="Play available tracks" data-tooltip="Play available tracks"><PlayIcon /><span className="sr-only">Play Available Tracks</span></button>
        <button type="button" className={`transport-button transport-button--yellow ${resetArmed ? "is-armed" : ""}`} onClick={onResetOrder} aria-label={resetArmed ? "Confirm reset order" : "Reset order"} data-tooltip={resetArmed ? "Confirm reset order" : "Reset order"}><RefreshIcon /><span className="sr-only">{resetArmed ? "Confirm Reset" : "Reset Order"}</span></button>
        <button type="button" className="transport-button transport-button--orange" onClick={onExport} aria-label="Export sequence" data-tooltip="Export sequence"><ExportIcon /><span className="sr-only">Export Sequence</span></button>
      </div>
    </footer>
  );
}
