import React from "react";
import { ExportIcon, PlayIcon, RefreshIcon } from "./Icons.jsx";
import { TransportWaveform } from "./TransportWaveform.jsx";

export function TransportBar({ playbackButtonRef, audioRef, audioHandlers, current, status, activeAlbum, visual, playing, currentTime, mediaDuration, liveMasteringLabel, resetArmed, onTogglePlayback, onSeek, onPlaySequence, onResetOrder, onExport }) {
  return (
    <footer className="transport-bar" aria-keyshortcuts="ArrowUp ArrowDown">
      <div className="transport-copy">
        <strong>{current?.trackTitle || "Ready to audition"}</strong>
        <span className="sr-only" role="status" aria-live="polite" data-transport-status>{status}</span>
        <span className="sr-only">Up Arrow selects the previous playable track. Down Arrow selects the next playable track.</span>
      </div>
      <TransportWaveform
        audioRef={audioRef}
        audioHandlers={audioHandlers}
        file={visual.file}
        trackTitle={visual.trackTitle}
        mastering={visual.mastering}
        nextTrackTitle={visual.nextTrackTitle}
        currentTime={currentTime}
        mediaDuration={mediaDuration}
        liveMasteringLabel={liveMasteringLabel}
        playbackButtonRef={playbackButtonRef}
        playing={playing}
        hasCurrentMedia={Boolean(current)}
        renderedPreview={Boolean(current?.renderedPreview)}
        onTogglePlayback={onTogglePlayback}
        onStartPlayback={onPlaySequence}
        onSeek={onSeek}
      />
      <div className="transport-actions">
        <button type="button" className="transport-button" onClick={onPlaySequence} disabled={!activeAlbum.tracks.length} aria-label="Play available tracks" data-tooltip="Play available tracks"><PlayIcon /><span className="sr-only">Play Available Tracks</span></button>
        <button type="button" className={`transport-button transport-button--yellow ${resetArmed ? "is-armed" : ""}`} onClick={onResetOrder} aria-label={resetArmed ? "Confirm reset order" : "Reset order"} data-tooltip={resetArmed ? "Confirm reset order" : "Reset order"}><RefreshIcon /><span className="sr-only">{resetArmed ? "Confirm Reset" : "Reset Order"}</span></button>
        <button type="button" className="transport-button transport-button--orange" onClick={onExport} aria-label="Export sequence" data-tooltip="Export sequence"><ExportIcon /><span className="sr-only">Export Sequence</span></button>
      </div>
    </footer>
  );
}
