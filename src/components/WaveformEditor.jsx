import React, { useEffect, useMemo, useState } from "react";
import { api } from "../lib/api.js";
import { formatDuration } from "../lib/format.js";
import { waveformPath } from "../lib/waveform.js";
import { RefreshIcon, WaveIcon } from "./Icons.jsx";

const clamp = (value, minimum, maximum) => Math.min(maximum, Math.max(minimum, value));
const roundMillis = (value) => Number(value.toFixed(3));
const percent = (value, duration) => `${clamp((value / Math.max(0.1, duration)) * 100, 0, 100)}%`;
const timeLabel = (value) => value <= 0 ? "0:00.000" : formatDuration(value, true);

function WaveformMarker({ kind, label, value, minimum, maximum, duration, onChange }) {
  const updateFromPointer = (event) => {
    const bounds = event.currentTarget.parentElement.getBoundingClientRect();
    if (!bounds.width) return;
    const fraction = clamp((event.clientX - bounds.left) / bounds.width, 0, 1);
    onChange(roundMillis(clamp(fraction * duration, minimum, maximum)));
  };
  const handlePointerDown = (event) => {
    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    updateFromPointer(event);
  };
  const handlePointerMove = (event) => {
    if (event.currentTarget.hasPointerCapture(event.pointerId)) updateFromPointer(event);
  };
  const handlePointerUp = (event) => {
    if (!event.currentTarget.hasPointerCapture(event.pointerId)) return;
    updateFromPointer(event);
    event.currentTarget.releasePointerCapture(event.pointerId);
  };
  const handlePointerCancel = (event) => {
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
  };
  const handleKeyDown = (event) => {
    const step = event.altKey ? 0.01 : event.shiftKey ? 1 : 0.1;
    let next = value;
    if (event.key === "ArrowLeft" || event.key === "ArrowDown") next -= step;
    else if (event.key === "ArrowRight" || event.key === "ArrowUp") next += step;
    else if (event.key === "Home") next = minimum;
    else if (event.key === "End") next = maximum;
    else return;
    event.preventDefault();
    onChange(roundMillis(clamp(next, minimum, maximum)));
  };

  return (
    <button
      type="button"
      role="slider"
      className={`waveform-marker waveform-marker--${kind}`}
      style={{ left: percent(value, duration) }}
      aria-label={`${label} trim marker`}
      aria-orientation="horizontal"
      aria-valuemin={minimum}
      aria-valuemax={maximum}
      aria-valuenow={value}
      aria-valuetext={timeLabel(value)}
      title={`${label}: ${timeLabel(value)}. Drag or use arrow keys.`}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerCancel={handlePointerCancel}
      onKeyDown={handleKeyDown}
      onClick={(event) => event.stopPropagation()}
      onDragStart={(event) => event.preventDefault()}
    >
      <span aria-hidden="true">{kind === "start" ? "S" : "E"}</span>
    </button>
  );
}

function WaveformFadeHandle({ kind, label, value, maximum, duration, origin, onChange }) {
  const updateValue = (next) => {
    const rounded = roundMillis(clamp(next, 0, maximum));
    if (Math.abs(rounded - value) < 0.0005) return;
    onChange(rounded);
  };
  const updateFromPointer = (event) => {
    const bounds = event.currentTarget.parentElement.getBoundingClientRect();
    if (!bounds.width) return;
    const pointerTime = clamp((event.clientX - bounds.left) / bounds.width, 0, 1) * duration;
    updateValue(kind === "start" ? pointerTime - origin : origin - pointerTime);
  };
  const handlePointerDown = (event) => {
    event.preventDefault();
    event.stopPropagation();
    event.currentTarget.setPointerCapture(event.pointerId);
    updateFromPointer(event);
  };
  const handlePointerMove = (event) => {
    if (event.currentTarget.hasPointerCapture(event.pointerId)) updateFromPointer(event);
  };
  const handlePointerUp = (event) => {
    if (!event.currentTarget.hasPointerCapture(event.pointerId)) return;
    updateFromPointer(event);
    event.currentTarget.releasePointerCapture(event.pointerId);
  };
  const handlePointerCancel = (event) => {
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
  };
  const handleKeyDown = (event) => {
    const step = event.altKey ? 0.01 : event.shiftKey ? 1 : 0.1;
    let next = value;
    if (event.key === "ArrowLeft" || event.key === "ArrowDown") next -= step;
    else if (event.key === "ArrowRight" || event.key === "ArrowUp") next += step;
    else if (event.key === "Home") next = 0;
    else if (event.key === "End") next = maximum;
    else return;
    event.preventDefault();
    updateValue(next);
  };
  const handleTime = kind === "start" ? origin + value : origin - value;

  return (
    <button
      type="button"
      role="slider"
      className={`waveform-fade-handle waveform-fade-handle--${kind}`}
      style={{ left: percent(handleTime, duration) }}
      aria-label={`${label} fade handle`}
      aria-orientation="horizontal"
      aria-valuemin={0}
      aria-valuemax={maximum}
      aria-valuenow={value}
      aria-valuetext={`${timeLabel(value)} ${label.toLowerCase()} fade`}
      title={`${label} fade: ${timeLabel(value)}. Drag across the waveform or use arrow keys.`}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerCancel={handlePointerCancel}
      onKeyDown={handleKeyDown}
      onClick={(event) => event.stopPropagation()}
      onDragStart={(event) => event.preventDefault()}
    >
      <span aria-hidden="true">{timeLabel(value)}</span>
    </button>
  );
}

export function WaveformEditor({
  file,
  trackTitle,
  trackNumber,
  trackCount,
  nextTrackTitle,
  trimStart,
  trimEnd,
  fadeIn,
  endMode,
  endDuration,
  playheadTime,
  onTrimChange,
  onEndFadeChange,
  onSeek,
}) {
  const [requestVersion, setRequestVersion] = useState(0);
  const [waveform, setWaveform] = useState({ loading: true, error: "", points: [] });

  useEffect(() => {
    const controller = new AbortController();
    setWaveform({ loading: true, error: "", points: [] });
    api.waveform(file.key, 900, controller.signal)
      .then((payload) => setWaveform({ loading: false, error: "", points: Array.isArray(payload.points) ? payload.points : [] }))
      .catch((error) => {
        if (error.name !== "AbortError") setWaveform({ loading: false, error: error.message || "Waveform unavailable.", points: [] });
      });
    return () => controller.abort();
  }, [file.key, file.modifiedAt, requestVersion]);

  const path = useMemo(() => waveformPath(waveform.points), [waveform.points]);
  const duration = Math.max(0.1, file.duration || 0.1);
  const keptDuration = Math.max(0.1, trimEnd - trimStart);
  const showEndFade = ["fade", "crossfade"].includes(endMode) && endDuration > 0;
  const visibleEndFadeDuration = showEndFade ? endDuration : 0;
  const endFadeStart = Math.max(trimStart, trimEnd - endDuration);
  const maximumFadeDuration = Math.max(0, keptDuration - 0.05);
  const nextCopy = nextTrackTitle ? `Next: ${nextTrackTitle}` : "Final playable track";
  const ruler = [0, 0.25, 0.5, 0.75, 1];
  const seekFromPointer = (event) => {
    if (!onSeek || event.target.closest(".waveform-marker, .waveform-feedback")) return;
    const bounds = event.currentTarget.getBoundingClientRect();
    if (!bounds.width) return;
    onSeek(roundMillis(clamp((event.clientX - bounds.left) / bounds.width, 0, 1) * duration));
  };

  return (
    <section className="waveform-editor" aria-labelledby="waveform-editor-title">
      <header className="waveform-editor-heading">
        <div className="waveform-editor-title">
          <WaveIcon />
          <div>
            <h3 id="waveform-editor-title">Waveform Trim Editor</h3>
            <p>Track {trackNumber} of {trackCount} · {nextCopy}</p>
          </div>
        </div>
        <strong>Kept {formatDuration(keptDuration, true)}</strong>
      </header>

      <div
        className={`waveform-plot ${onSeek ? "is-seekable" : ""} ${waveform.loading ? "is-loading" : ""} ${waveform.error ? "has-error" : ""}`}
        role="group"
        aria-label={`Waveform for ${trackTitle}. Kept audio starts at ${timeLabel(trimStart)} and ends at ${timeLabel(trimEnd)}.`}
        onClick={seekFromPointer}
      >
        <svg className="waveform-svg" viewBox="0 0 1000 100" preserveAspectRatio="none" aria-hidden="true">
          <line className="waveform-center-line" x1="0" y1="50" x2="1000" y2="50" />
          {ruler.slice(1, -1).map((tick) => <line key={tick} className="waveform-grid-line" x1={tick * 1000} y1="0" x2={tick * 1000} y2="100" />)}
          {path && <path className="waveform-shape" d={path} />}
        </svg>

        <div className="waveform-kept-region" style={{ left: percent(trimStart, duration), width: percent(keptDuration, duration) }} aria-hidden="true" />
        {fadeIn > 0 && <div className="waveform-fade-region waveform-fade-region--in" style={{ left: percent(trimStart, duration), width: percent(Math.min(fadeIn, keptDuration), duration) }} aria-hidden="true" />}
        {showEndFade && <div className={`waveform-fade-region waveform-fade-region--${endMode}`} style={{ left: percent(endFadeStart, duration), width: percent(trimEnd - endFadeStart, duration) }} aria-hidden="true" />}
        <div className="waveform-trimmed-region waveform-trimmed-region--start" style={{ width: percent(trimStart, duration) }} aria-hidden="true" />
        <div className="waveform-trimmed-region waveform-trimmed-region--end" style={{ left: percent(trimEnd, duration), width: percent(duration - trimEnd, duration) }} aria-hidden="true" />

        <WaveformMarker kind="start" label="Start" value={trimStart} minimum={0} maximum={Math.max(0, trimEnd - 0.1)} duration={duration} onChange={(value) => onTrimChange("trimStart", value)} />
        <WaveformMarker kind="end" label="End" value={trimEnd} minimum={Math.min(duration, trimStart + 0.1)} maximum={duration} duration={duration} onChange={(value) => onTrimChange("trimEnd", value)} />
        <WaveformFadeHandle kind="start" label="Opening" value={fadeIn} maximum={maximumFadeDuration} duration={duration} origin={trimStart} onChange={(value) => onTrimChange("fadeIn", value)} />
        <WaveformFadeHandle kind="end" label="Ending" value={visibleEndFadeDuration} maximum={maximumFadeDuration} duration={duration} origin={trimEnd} onChange={onEndFadeChange} />
        {Number.isFinite(playheadTime) ? <div className="waveform-playhead" style={{ left: percent(playheadTime, duration) }} aria-hidden="true" /> : null}

        <div className="waveform-ruler" aria-hidden="true">
          {ruler.map((tick) => <span key={tick} style={{ left: `${tick * 100}%` }}>{timeLabel(duration * tick)}</span>)}
        </div>

        {waveform.loading && <div className="waveform-feedback" role="status"><span />Reading source waveform…</div>}
        {waveform.error && <div className="waveform-feedback waveform-feedback--error" role="status"><span>Waveform unavailable. Trim markers still work.</span><button type="button" className="text-button" onClick={() => setRequestVersion((value) => value + 1)}><RefreshIcon /> Retry</button></div>}
      </div>

      <div className="waveform-readout">
        <span><i className="waveform-key waveform-key--trimmed" />Trimmed</span>
        <strong>Start {timeLabel(trimStart)}</strong>
        {fadeIn > 0 ? <span><i className="waveform-key waveform-key--fade" />Fade in {timeLabel(fadeIn)}</span> : null}
        <span><i className="waveform-key waveform-key--kept" />Kept audio</span>
        {showEndFade && <span><i className="waveform-key waveform-key--fade" />{endMode === "crossfade" ? "Crossfade" : "Fade out"} {timeLabel(endDuration)}</span>}
        <strong>End {timeLabel(trimEnd)}</strong>
      </div>
      <p className="waveform-help">Click the waveform to seek. Drag the S and E bars to trim; drag their small top handles inward to set fades. Arrow keys adjust 0.1s, Shift 1s, and Option 0.01s.</p>
    </section>
  );
}
