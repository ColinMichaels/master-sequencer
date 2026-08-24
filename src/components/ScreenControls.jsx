import React, { useEffect, useRef, useState } from "react";
import { DocumentIcon, GearIcon, LinkedTabsIcon, MoonIcon, PaletteIcon, SearchIcon, SunIcon } from "./Icons.jsx";
import { adjustTextScale, TEXT_SCALES, textScaleLabel } from "../lib/appearance.js";

export function ScreenControls({ appearance, resolvedMode, linkedPlayback, onChange, onOpenSettings, onOpenCommands, onOpenHelp, onOpenShortcuts }) {
  const [open, setOpen] = useState(false);
  const shellRef = useRef(null);
  const triggerRef = useRef(null);
  const atMinimum = appearance.textScale === TEXT_SCALES[0];
  const atMaximum = appearance.textScale === TEXT_SCALES.at(-1);
  const lightTarget = resolvedMode === "dark";

  useEffect(() => {
    if (!open) return undefined;
    const closeOnOutsideClick = (event) => {
      if (!shellRef.current?.contains(event.target)) setOpen(false);
    };
    const closeOnEscape = (event) => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      setOpen(false);
      requestAnimationFrame(() => triggerRef.current?.focus());
    };
    document.addEventListener("pointerdown", closeOnOutsideClick);
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      document.removeEventListener("pointerdown", closeOnOutsideClick);
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, [open]);

  const openFullSettings = () => {
    setOpen(false);
    onOpenSettings();
  };

  const openModalFromMenu = (openModal) => {
    setOpen(false);
    triggerRef.current?.focus();
    openModal?.();
  };

  return (
    <div className="screen-settings-shell" ref={shellRef}>
      <button ref={triggerRef} type="button" className={`screen-settings-trigger ${open ? "is-open" : ""}`} onClick={() => setOpen((current) => !current)} aria-label={`${open ? "Close" : "Open"} settings menu`} aria-expanded={open} aria-controls="screen-settings-menu" aria-haspopup="dialog" data-tooltip="Quick settings"><GearIcon size={21} /></button>
      {open && <section id="screen-settings-menu" className="screen-settings-menu" role="dialog" aria-modal="false" aria-label="Quick Settings">
        <header><span><strong>Quick Settings</strong><small>Display and readability</small></span><button type="button" onClick={() => { setOpen(false); triggerRef.current?.focus(); }} aria-label="Dismiss quick settings">×</button></header>
        <div className="screen-settings-text-size">
          <span><strong>Text size</strong><small>Interface text and controls</small></span>
          <div role="group" aria-label="Text size controls">
            <button type="button" disabled={atMinimum} onClick={() => onChange({ textScale: adjustTextScale(appearance.textScale, -1) })} aria-label="Decrease text size">A−</button>
            <output aria-live="polite" aria-label={`Text size ${textScaleLabel(appearance.textScale)}`}>{textScaleLabel(appearance.textScale)}</output>
            <button type="button" disabled={atMaximum} onClick={() => onChange({ textScale: adjustTextScale(appearance.textScale, 1) })} aria-label="Increase text size">A+</button>
          </div>
        </div>
        <button type="button" className="screen-settings-option" onClick={() => onChange({ mode: lightTarget ? "light" : "dark" })} aria-label={`Use ${lightTarget ? "light" : "dark"} mode`}>
          {lightTarget ? <SunIcon /> : <MoonIcon />}
          <span><strong>{lightTarget ? "Light" : "Dark"} mode</strong><small>Currently showing {resolvedMode} mode</small></span>
        </button>
        <button type="button" className="screen-settings-option" disabled={!linkedPlayback?.supported} onClick={() => { setOpen(false); linkedPlayback?.openLinkedTab?.(); }}>
          <LinkedTabsIcon />
          <span><strong>Open linked tab</strong><small>{!linkedPlayback?.supported ? "This browser does not support linked transport" : linkedPlayback.peerCount ? `${linkedPlayback.peerCount} other tab${linkedPlayback.peerCount === 1 ? "" : "s"} connected · ${linkedPlayback.role === "owner" ? "audio plays here" : linkedPlayback.role === "follower" ? "following their transport" : "ready"}` : "One tab plays audio; both tabs control the same transport"}</small></span>
          <em>↗</em>
        </button>
        <button type="button" className="screen-settings-option" onClick={() => openModalFromMenu(onOpenCommands)} aria-keyshortcuts="Meta+K Control+K">
          <SearchIcon />
          <span><strong>Command search</strong><small>Find the same visible workspace and repeat-use actions</small></span>
          <em>⌘K</em>
        </button>
        <button type="button" className="screen-settings-option" onClick={() => openModalFromMenu(onOpenHelp)}>
          <DocumentIcon />
          <span><strong>Help &amp; app instructions</strong><small>Open the complete album workflow guide</small></span>
          <em>?</em>
        </button>
        <button type="button" className="screen-settings-option" onClick={() => openModalFromMenu(onOpenShortcuts)} aria-keyshortcuts="Shift+/">
          <kbd aria-hidden="true">?</kbd>
          <span><strong>Keyboard shortcuts</strong><small>Reveal faster workspace and audition controls</small></span>
          <em>→</em>
        </button>
        <button type="button" className="screen-settings-option" onClick={openFullSettings}>
          <PaletteIcon />
          <span><strong>Colors &amp; fonts</strong><small>Open full appearance settings</small></span>
          <em>→</em>
        </button>
      </section>}
    </div>
  );
}
