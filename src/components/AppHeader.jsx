import React, { useEffect, useRef, useState } from "react";
import { CheckIcon, ImageIcon, MasteringIcon, MusicIcon, ReviewIcon, SequenceIcon, SettingsIcon, WarningIcon, WaveIcon } from "./Icons.jsx";
import { MasterOutputMeters } from "./MasterOutputMeters.jsx";
import { ScreenControls } from "./ScreenControls.jsx";

const navItems = [
  ["sequence", "Sequence", SequenceIcon],
  ["mastering", "Mastering", MasteringIcon],
  ["review", "Track Review", ReviewIcon],
  ["decisions", "Album Decisions", CheckIcon],
  ["assets", "Assets", ImageIcon],
  ["library", "Audio Library", MusicIcon],
  ["settings", "Settings", SettingsIcon],
];

const numericShortcutIndex = (event) => {
  if (event.repeat || event.isComposing || event.defaultPrevented || event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return -1;
  if (!/^(?:Digit|Numpad)[1-7]$/.test(event.code)) return -1;
  return Number(event.code.slice(-1)) - 1;
};

const isEditingTarget = (target) => target instanceof Element
  && (target.matches("input, textarea, select") || target.isContentEditable || Boolean(target.closest("[contenteditable='true']")));

const summaryDefinitions = [
  { id: "tracks", label: "Tracks", Icon: WaveIcon, view: "sequence", action: "Open Sequence", detail: "All tracks in the current album" },
  { id: "playable", label: "Playable", Icon: MusicIcon, view: "sequence", action: "Open Sequence", detail: "Tracks with an available audition source" },
  { id: "missing", label: "Missing sources", Icon: WarningIcon, view: "library", action: "Open Audio Library", detail: "Tracks that need an audio source" },
  { id: "approvals", label: "Track approvals", Icon: CheckIcon, view: "review", action: "Open Track Review", detail: "Tracks with an approved master candidate" },
];

export function AppHeader({ activeView, onViewChange, onViewIntent = () => {}, album, playableCount, approvalCount, appearance, resolvedMode, onAppearanceChange, onOpenAppearance, onOpenHelp, commandHistory, meteringRef, meteringAvailable, playing, monitorLabel, monitorRouting, masterEffectsActive = false }) {
  const [expandedStat, setExpandedStat] = useState("");
  const summaryRef = useRef(null);
  const trackCount = album?.tracks.length || 0;
  const missingCount = Math.max(0, trackCount - playableCount);
  const summaryStats = summaryDefinitions.map((definition) => ({
    ...definition,
    count: definition.id === "tracks" ? trackCount : definition.id === "playable" ? playableCount : definition.id === "missing" ? missingCount : approvalCount,
  }));

  useEffect(() => {
    if (!expandedStat) return undefined;
    const closeOnOutsideClick = (event) => {
      if (!summaryRef.current?.contains(event.target)) setExpandedStat("");
    };
    const closeOnEscape = (event) => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      const activeId = expandedStat;
      setExpandedStat("");
      requestAnimationFrame(() => summaryRef.current?.querySelector(`[data-stat-id="${activeId}"]`)?.focus());
    };
    document.addEventListener("pointerdown", closeOnOutsideClick);
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      document.removeEventListener("pointerdown", closeOnOutsideClick);
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, [expandedStat]);

  useEffect(() => {
    const switchViewFromNumberKey = (event) => {
      const index = numericShortcutIndex(event);
      if (index < 0 || isEditingTarget(event.target) || document.querySelector('[role="dialog"][aria-modal="true"]')) return;
      event.preventDefault();
      setExpandedStat("");
      onViewIntent(navItems[index][0]);
      onViewChange(navItems[index][0]);
    };
    window.addEventListener("keydown", switchViewFromNumberKey);
    return () => window.removeEventListener("keydown", switchViewFromNumberKey);
  }, [onViewChange, onViewIntent]);

  const openView = (view) => {
    setExpandedStat("");
    onViewIntent(view);
    onViewChange(view);
  };

  return (
    <header className="app-header">
      <h1 className="sr-only">Project Sequencer</h1>
      <nav className="primary-nav" aria-label="Project views" style={{ "--nav-count": navItems.length }}>
        {navItems.map(([id, label, NavIcon], index) => (
          <button key={id} type="button" className={activeView === id ? "is-active" : ""} onPointerEnter={() => onViewIntent(id)} onFocus={() => onViewIntent(id)} onClick={() => openView(id)} aria-current={activeView === id ? "page" : undefined} aria-label={label} aria-describedby={`nav-shortcut-${id}`} data-tooltip={`${label} · ${index + 1}`}>
            <NavIcon size={20} />
            <span className="sr-only">{label}</span>
            <span id={`nav-shortcut-${id}`} className="sr-only">Keyboard shortcut: number {index + 1} on the number row or numeric keypad</span>
          </button>
        ))}
      </nav>
      {/* Keep utilities grouped so phone layouts can pin only the workspace tabs. */}
      <div className="app-header-controls">
        <div className="command-history" role="group" aria-label="Project edit history"><button type="button" disabled={!commandHistory.canUndo} onClick={commandHistory.undo} aria-label={commandHistory.canUndo ? `Undo ${commandHistory.undoLabel}` : "Nothing to undo"}>↶</button><button type="button" disabled={!commandHistory.canRedo} onClick={commandHistory.redo} aria-label={commandHistory.canRedo ? `Redo ${commandHistory.redoLabel}` : "Nothing to redo"}>↷</button></div>
        <MasterOutputMeters compact meteringRef={meteringRef} available={meteringAvailable} playing={playing} monitorLabel={monitorLabel} monitorRouting={monitorRouting} effectsActive={masterEffectsActive} onOpenMastering={() => openView("mastering")} />
        <div className="header-summary-shell" ref={summaryRef}>
          <div className="header-summary" role="group" aria-label={`${album?.title || "Album"} statistics`}>
            {summaryStats.map(({ id, label, Icon, count }) => (
              <button key={id} type="button" className={`header-stat-button ${id === "missing" && count ? "is-warning" : ""} ${expandedStat === id ? "is-open" : ""}`} data-stat-id={id} onClick={() => setExpandedStat((current) => current === id ? "" : id)} aria-expanded={expandedStat === id} aria-controls="album-statistics-popover" aria-label={`${label}: ${count}. Show album statistics`} data-tooltip={`${label}: ${count}`}>
                <Icon size={21} />
                <span className="header-stat-badge" aria-hidden="true">{count}</span>
                <span className="sr-only">{label}</span>
              </button>
            ))}
          </div>
          {expandedStat && <section id="album-statistics-popover" className="header-stats-popover" role="dialog" aria-modal="false" aria-labelledby="album-statistics-title">
            <header>
              <div><strong id="album-statistics-title">Album Statistics</strong><small>{album?.title || "Current album"}</small></div>
              <button type="button" onClick={() => setExpandedStat("")} aria-label="Close album statistics">×</button>
            </header>
            <div className="header-stat-details">
              {summaryStats.map(({ id, label, Icon, count, detail, action, view }) => (
                <button key={id} type="button" className={expandedStat === id ? "is-selected" : ""} onClick={() => openView(view)} aria-label={`${label}: ${count}. ${action}`}>
                  <Icon size={20} />
                  <span><strong>{label}</strong><small>{detail}</small></span>
                  <b>{count}</b>
                  <em>{action} →</em>
                </button>
              ))}
            </div>
          </section>}
        </div>
        <ScreenControls appearance={appearance} resolvedMode={resolvedMode} onChange={onAppearanceChange} onOpenSettings={onOpenAppearance} onOpenHelp={onOpenHelp} />
      </div>
    </header>
  );
}
