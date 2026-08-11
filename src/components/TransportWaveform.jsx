import React, { useEffect, useMemo, useState } from "react";
import { api } from "../lib/api.js";
import { formatDuration } from "../lib/format.js";
import { masteringSummary, normalizeMastering } from "../lib/mastering.js";
import { waveformPath } from "../lib/waveform.js";
import { PauseIcon, PlayIcon } from "./Icons.jsx";
import { TransitionCurve } from "./TransitionCurve.jsx";

const clamp = (value, minimum, maximum) => Math.min(maximum, Math.max(minimum, value));
const percent = (value, duration) => `${clamp((value / Math.max(0.1, duration)) * 100, 0, 100)}%`;
const timeLabel = (value) => value > 0 ? formatDuration(value, true) : "0:00";

export function TransportWaveform({
  audioRef,
  audioHandlers,
  file,
  trackTitle,
  mastering,
  nextTrackTitle,
  currentTime,
  mediaDuration,
  liveMasteringLabel,
  playing,
  hasCurrentMedia,
  renderedPreview,
  onTogglePlayback,
  onStartPlayback,
  onSeek,
}) {
  const [waveform, setWaveform] = useState({ loading: false, error: "", points: [] });

  useEffect(() => {
    if (!file?.key) {
      setWaveform({ loading: false, error: "", points: [] });
      return undefined;
    }
    const controller = new AbortController();
    setWaveform({ loading: true, error: "", points: [] });
    api.waveform(file.key, 620, controller.signal)
      .then((payload) => setWaveform({ loading: false, error: "", points: Array.isArray(payload.points) ? payload.points : [] }))
      .catch((error) => {
        if (error.name !== "AbortError") setWaveform({ loading: false, error: error.message || "Waveform unavailable.", points: [] });
      });
    return () => controller.abort();
  }, [file?.key, file?.modifiedAt]);

  const duration = Math.max(0.1, file?.duration || mediaDuration || 0.1);
  const settings = useMemo(
    () => normalizeMastering(mastering, duration, { hasNext: Boolean(nextTrackTitle) }),
    [duration, mastering, nextTrackTitle],
  );
  const path = useMemo(() => waveformPath(waveform.points), [waveform.points]);
  const keptDuration = Math.max(0.1, settings.trimEnd - settings.trimStart);
  const endFadeStart = Math.max(settings.trimStart, settings.trimEnd - settings.endDuration);
  const showEndFade = ["fade", "crossfade"].includes(settings.endMode) && settings.endDuration > 0;
  const playableDuration = Math.max(0, mediaDuration || (hasCurrentMedia ? file?.duration || 0 : 0));
  const playbackPercent = percent(clamp(currentTime, 0, playableDuration), Math.max(0.1, playableDuration));
  const canSeek = hasCurrentMedia && playableDuration > 0;

  const seekFromPointer = (event) => {
    if (!canSeek) return;
    const bounds = event.currentTarget.getBoundingClientRect();
    if (!bounds.width) return;
    onSeek(clamp((event.clientX - bounds.left) / bounds.width, 0, 1) * playableDuration);
  };

  const handleSeekKey = (event) => {
    if (!canSeek) return;
    const step = event.shiftKey ? 10 : 1;
    let next = currentTime;
    if (event.key === "ArrowLeft" || event.key === "ArrowDown") next -= step;
    else if (event.key === "ArrowRight" || event.key === "ArrowUp") next += step;
    else if (event.key === "Home") next = 0;
    else if (event.key === "End") next = playableDuration;
    else return;
    event.preventDefault();
    onSeek(clamp(next, 0, playableDuration));
  };

  const toggle = () => hasCurrentMedia ? onTogglePlayback() : onStartPlayback();
  const toggleLabel = playing ? "Pause playback" : hasCurrentMedia ? "Resume playback" : "Play available tracks";
  const editSummary = masteringSummary(settings);

  return (
    <div className="transport-player">
      <audio ref={audioRef} crossOrigin="anonymous" preload="metadata" className="transport-audio-source" {...audioHandlers} />
      <button type="button" className="transport-playback-toggle" onClick={toggle} aria-label={toggleLabel} data-tooltip={toggleLabel}>
        {playing ? <PauseIcon /> : <PlayIcon />}
      </button>
      <div className="transport-waveform-stack">
        <div className="transport-waveform-meta">
          <span>{timeLabel(currentTime)} / {timeLabel(playableDuration || duration)}</span>
          <span>Trim {timeLabel(settings.trimStart)}–{timeLabel(settings.trimEnd)}</span>
          {renderedPreview ? <strong>Rendered preview · source edit map</strong> : <strong>{liveMasteringLabel || (waveform.error ? "Waveform unavailable" : waveform.loading ? "Reading waveform…" : "Source waveform")}</strong>}
        </div>
        <button
          type="button"
          className="transport-waveform"
          disabled={!canSeek}
          onClick={seekFromPointer}
          onKeyDown={handleSeekKey}
          aria-label={`${trackTitle || "Current track"} waveform. Trim starts at ${timeLabel(settings.trimStart)} and ends at ${timeLabel(settings.trimEnd)}. ${editSummary}.`}
          aria-valuemin="0"
          aria-valuemax={playableDuration}
          aria-valuenow={Math.min(currentTime, playableDuration)}
          role="slider"
        >
          <svg viewBox="0 0 1000 100" preserveAspectRatio="none" aria-hidden="true">
            <line className="transport-waveform-center" x1="0" y1="50" x2="1000" y2="50" />
            {path ? <path className="transport-waveform-shape" d={path} /> : null}
            {settings.fadeIn > 0 ? <path className="transport-envelope transport-envelope--in" d={`M ${(settings.trimStart / duration) * 1000} 49 L ${((settings.trimStart + Math.min(settings.fadeIn, keptDuration)) / duration) * 1000} 7`} /> : null}
            {showEndFade ? <path className={`transport-envelope transport-envelope--${settings.endMode}`} d={`M ${(endFadeStart / duration) * 1000} 7 L ${(settings.trimEnd / duration) * 1000} 49`} /> : null}
          </svg>
          <span className="transport-kept-region" style={{ left: percent(settings.trimStart, duration), width: percent(keptDuration, duration) }} aria-hidden="true" />
          <span className="transport-trim-mask transport-trim-mask--start" style={{ width: percent(settings.trimStart, duration) }} aria-hidden="true" />
          <span className="transport-trim-mask transport-trim-mask--end" style={{ left: percent(settings.trimEnd, duration), width: percent(duration - settings.trimEnd, duration) }} aria-hidden="true" />
          <span className="transport-trim-line transport-trim-line--start" style={{ left: percent(settings.trimStart, duration) }} aria-hidden="true"><i>S</i></span>
          <span className="transport-trim-line transport-trim-line--end" style={{ left: percent(settings.trimEnd, duration) }} aria-hidden="true"><i>E</i></span>
          {hasCurrentMedia ? <span className="transport-playhead" style={{ left: playbackPercent }} aria-hidden="true" /> : null}
        </button>
      </div>
      <div className={`transport-transition transport-transition--${settings.endMode}`} title={`${editSummary}. ${nextTrackTitle ? `Next: ${nextTrackTitle}` : "Final playable track"}.`}>
        <span><strong>{editSummary}</strong><small>{nextTrackTitle ? `Into ${nextTrackTitle}` : "End of source"}</small></span>
        <TransitionCurve mode={settings.endMode} className="transition-curve--transport" />
      </div>
    </div>
  );
}
