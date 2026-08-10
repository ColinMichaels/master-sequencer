import React from "react";
import { CheckIcon, ImageIcon, MusicIcon, ReviewIcon, ScissorsIcon, SequenceIcon, SettingsIcon, WarningIcon, WaveIcon } from "./Icons.jsx";
import { ScreenControls } from "./ScreenControls.jsx";

const navItems = [
  ["sequence", "Sequence", SequenceIcon],
  ["review", "Track Review", ReviewIcon],
  ["decisions", "Album Decisions", CheckIcon],
  ["mastering", "Mastering", ScissorsIcon],
  ["assets", "Assets", ImageIcon],
  ["library", "Audio Library", MusicIcon],
  ["settings", "Settings", SettingsIcon],
];

export function AppHeader({ activeView, onViewChange, album, playableCount, approvalCount, appearance, resolvedMode, onAppearanceChange, onOpenAppearance }) {
  const trackCount = album?.tracks.length || 0;
  const missingCount = Math.max(0, trackCount - playableCount);
  return (
    <header className="app-header">
      <div className="brand-lockup">
        <h1 className="sr-only">Project Sequencer</h1>
        <ScreenControls appearance={appearance} resolvedMode={resolvedMode} onChange={onAppearanceChange} onOpenSettings={onOpenAppearance} />
      </div>
      <nav className="primary-nav" aria-label="Project views" style={{ "--nav-count": navItems.length }}>
        {navItems.map(([id, label, NavIcon]) => (
          <button key={id} type="button" className={activeView === id ? "is-active" : ""} onClick={() => onViewChange(id)} aria-current={activeView === id ? "page" : undefined} aria-label={label} data-tooltip={label}>
            <NavIcon size={20} />
            <span className="sr-only">{label}</span>
          </button>
        ))}
      </nav>
      <dl className="header-summary" aria-label={`${album?.title || "Album"} summary`}>
        <div><WaveIcon /><dt>{trackCount}</dt><dd>Tracks</dd></div>
        <div><MusicIcon /><dt>{playableCount}</dt><dd>Playable</dd></div>
        <div className={missingCount ? "is-warning" : ""}><WarningIcon /><dt>{missingCount}</dt><dd>Missing source</dd></div>
        <div><CheckIcon /><dt>{approvalCount}</dt><dd>Track approvals</dd></div>
      </dl>
    </header>
  );
}
