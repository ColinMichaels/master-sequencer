import React, { useCallback, useEffect, useRef, useState } from "react";
import { AFTER_TRACK_OPTIONS } from "../lib/after-track.js";
import { AfterTrackPlayIcon, ExportIcon, RefreshIcon } from "./Icons.jsx";
import { TransportWaveform } from "./TransportWaveform.jsx";

const PLAYBACK_STYLE_HOLD_MS = 450;

export function TransportBar({ playbackButtonRef, audioRefs, audioHandlers, activeDeck, current, status, activeAlbum, visual, playing, currentTime, mediaDuration, liveMasteringLabel, linkedPlayback, afterTrackMode, resetArmed, onTogglePlayback, onSeek, onPlaySequence, onAfterTrackModeChange, onResetOrder, onExport }) {
  const [modeMenuOpen, setModeMenuOpen] = useState(false);
  const [holdingControl, setHoldingControl] = useState("");
  const holdTimerRef = useRef(null);
  const holdTriggeredRef = useRef(false);
  const modeMenuRef = useRef(null);
  const modeMenuTriggerRef = useRef(null);
  const selectedModeRef = useRef(null);
  const afterTrackLabel = AFTER_TRACK_OPTIONS.find((option) => option.value === afterTrackMode)?.label || AFTER_TRACK_OPTIONS[0].label;
  const playTooltip = `Play available tracks · ${afterTrackLabel} · Hold for playback style`;

  const clearHoldTimer = useCallback(() => {
    if (holdTimerRef.current !== null) window.clearTimeout(holdTimerRef.current);
    holdTimerRef.current = null;
  }, []);

  const closeModeMenu = useCallback((restoreFocus = true) => {
    setModeMenuOpen(false);
    holdTriggeredRef.current = false;
    if (restoreFocus) window.requestAnimationFrame(() => modeMenuTriggerRef.current?.focus());
  }, []);

  const openModeMenu = useCallback((trigger) => {
    modeMenuTriggerRef.current = trigger;
    setModeMenuOpen(true);
  }, []);

  const startModeHold = useCallback((event, control) => {
    if (event.pointerType === "mouse" && event.button !== 0) return;
    const trigger = event.currentTarget;
    clearHoldTimer();
    holdTriggeredRef.current = false;
    modeMenuTriggerRef.current = trigger;
    setHoldingControl(control);
    holdTimerRef.current = window.setTimeout(() => {
      holdTimerRef.current = null;
      holdTriggeredRef.current = true;
      setHoldingControl("");
      openModeMenu(trigger);
    }, PLAYBACK_STYLE_HOLD_MS);
  }, [clearHoldTimer, openModeMenu]);

  const cancelModeHold = useCallback(() => {
    clearHoldTimer();
    setHoldingControl("");
  }, [clearHoldTimer]);

  const modeButtonProps = (action, control) => ({
    "aria-controls": "playback-style-menu",
    "aria-describedby": "playback-style-instructions",
    "aria-expanded": modeMenuOpen,
    "aria-haspopup": "menu",
    "data-hold-active": holdingControl === control ? "true" : "false",
    onClick: (event) => {
      cancelModeHold();
      if (holdTriggeredRef.current) {
        event.preventDefault();
        holdTriggeredRef.current = false;
        return;
      }
      setModeMenuOpen(false);
      action();
    },
    onContextMenu: (event) => event.preventDefault(),
    onKeyDown: (event) => {
      if (event.key === "ArrowDown") {
        event.preventDefault();
        event.stopPropagation();
        openModeMenu(event.currentTarget);
      } else if (event.key === "Escape" && modeMenuOpen) {
        event.preventDefault();
        closeModeMenu();
      }
    },
    onPointerCancel: cancelModeHold,
    onPointerDown: (event) => startModeHold(event, control),
    onPointerLeave: cancelModeHold,
    onPointerUp: cancelModeHold,
  });

  const handleMenuKeyDown = (event) => {
    if (event.key === "Escape") {
      event.preventDefault();
      closeModeMenu();
      return;
    }
    if (event.key === "Tab") {
      setModeMenuOpen(false);
      return;
    }
    if (!["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key)) return;
    const items = [...modeMenuRef.current.querySelectorAll('[role="menuitemradio"]')];
    if (!items.length) return;
    event.preventDefault();
    const currentIndex = Math.max(0, items.indexOf(document.activeElement));
    const nextIndex = event.key === "Home" ? 0
      : event.key === "End" ? items.length - 1
        : event.key === "ArrowDown" ? (currentIndex + 1) % items.length
          : (currentIndex - 1 + items.length) % items.length;
    items[nextIndex].focus();
  };

  useEffect(() => () => {
    if (holdTimerRef.current !== null) window.clearTimeout(holdTimerRef.current);
  }, []);

  useEffect(() => {
    if (!modeMenuOpen) return undefined;
    const focusFrame = window.requestAnimationFrame(() => selectedModeRef.current?.focus());
    const closeFromOutside = (event) => {
      if (modeMenuRef.current?.contains(event.target) || modeMenuTriggerRef.current?.contains(event.target)) return;
      setModeMenuOpen(false);
    };
    document.addEventListener("pointerdown", closeFromOutside, true);
    return () => {
      window.cancelAnimationFrame(focusFrame);
      document.removeEventListener("pointerdown", closeFromOutside, true);
    };
  }, [modeMenuOpen]);

  const playbackButtonProps = modeButtonProps(current ? onTogglePlayback : onPlaySequence, "playback");
  const sequenceButtonProps = modeButtonProps(onPlaySequence, "sequence");

  return (
    <footer className="transport-bar" aria-keyshortcuts="ArrowUp ArrowDown">
      <div className="transport-copy">
        <strong>{current?.trackTitle || "Ready to audition"}</strong>
        {linkedPlayback?.peerCount ? <small className={`transport-link-state is-${linkedPlayback.role}`}>{linkedPlayback.role === "owner" ? `Audio owner · ${linkedPlayback.peerCount} linked tab${linkedPlayback.peerCount === 1 ? "" : "s"}` : linkedPlayback.role === "follower" ? "Following audio from linked tab" : `${linkedPlayback.peerCount} linked tab${linkedPlayback.peerCount === 1 ? "" : "s"} ready`}</small> : null}
        <span className="sr-only" role="status" aria-live="polite" data-transport-status>{status}</span>
        <span className="sr-only">Up Arrow selects the previous playable track. Down Arrow selects the next playable track.</span>
        <span className="sr-only" id="playback-style-instructions">Hold this playback control, or press Down Arrow while it is focused, to choose the playback style used after each track.</span>
      </div>
      <TransportWaveform
        audioRefs={audioRefs}
        audioHandlers={audioHandlers}
        activeDeck={activeDeck}
        file={visual.file}
        trackTitle={visual.trackTitle}
        mastering={visual.mastering}
        nextTrackTitle={visual.nextTrackTitle}
        currentTime={currentTime}
        mediaDuration={mediaDuration}
        liveMasteringLabel={liveMasteringLabel}
        afterTrackMode={afterTrackMode}
        playbackButtonRef={playbackButtonRef}
        playing={playing}
        hasCurrentMedia={Boolean(current)}
        renderedPreview={Boolean(current?.renderedPreview)}
        modeButtonProps={playbackButtonProps}
        onTogglePlayback={onTogglePlayback}
        onStartPlayback={onPlaySequence}
        onSeek={onSeek}
      />
      <div className="transport-actions">
        <button type="button" className="transport-button" disabled={!activeAlbum.tracks.length} aria-label="Play available tracks" data-tooltip={playTooltip} data-after-track-mode={afterTrackMode} {...sequenceButtonProps}><AfterTrackPlayIcon mode={afterTrackMode} size={22} /><span className="sr-only">Play Available Tracks · {afterTrackLabel}</span></button>
        <button type="button" className={`transport-button transport-button--yellow ${resetArmed ? "is-armed" : ""}`} onClick={onResetOrder} aria-label={resetArmed ? "Confirm reset order" : "Reset order"} data-tooltip={resetArmed ? "Confirm reset order" : "Reset order"}><RefreshIcon /><span className="sr-only">{resetArmed ? "Confirm Reset" : "Reset Order"}</span></button>
        <button type="button" className="transport-button transport-button--orange" onClick={onExport} aria-label="Export sequence" data-tooltip="Export sequence"><ExportIcon /><span className="sr-only">Export Sequence</span></button>
      </div>
      {modeMenuOpen ? <div ref={modeMenuRef} className="transport-mode-menu" id="playback-style-menu" role="menu" aria-label="Playback style" onKeyDown={handleMenuKeyDown}>
        <header><strong>Playback style</strong><small>After each track</small></header>
        {AFTER_TRACK_OPTIONS.map((option) => {
          const [title, detail = "Repeat the current track"] = option.label.split(" · ");
          const selected = option.value === afterTrackMode;
          return <button key={option.value} ref={selected ? selectedModeRef : null} type="button" role="menuitemradio" aria-checked={selected} onClick={() => {
            onAfterTrackModeChange(option.value);
            closeModeMenu();
          }}><AfterTrackPlayIcon mode={option.value} size={22} /><span><strong>{title}</strong><small>{detail}</small></span></button>;
        })}
        <p>Hold Play/Pause or press ↓ to open</p>
      </div> : null}
    </footer>
  );
}
