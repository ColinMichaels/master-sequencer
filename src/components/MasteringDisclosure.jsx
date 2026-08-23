import React, { useRef } from "react";
import { usePinnedDisclosure } from "../hooks/usePinnedDisclosure.js";
import { ChevronIcon, PinIcon } from "./Icons.jsx";

export function MasteringDisclosure({ id, title, description, summary, alert = "", className = "", children }) {
  const { open, pinned, setOpen, togglePinned } = usePinnedDisclosure(`mastering-${id}`);
  const triggerRef = useRef(null);
  const panelRef = useRef(null);

  const toggle = () => {
    const nextOpen = !open;
    if (!nextOpen && panelRef.current?.contains(document.activeElement)) triggerRef.current?.focus();
    setOpen(nextOpen);
  };

  return (
    <section className={`mastering-disclosure ${pinned ? "is-pinned" : ""} ${className}`} aria-labelledby={`${id}-title`}>
      <header className="expert-disclosure-header">
        <button ref={triggerRef} type="button" className="mastering-disclosure-trigger" aria-expanded={open} aria-controls={`${id}-panel`} onClick={toggle}>
          <span><h3 id={`${id}-title`}>{title}</h3><p>{description}</p></span>
          <span className="mastering-disclosure-state"><strong>{summary}</strong><ChevronIcon direction={open ? "up" : "down"} /></span>
        </button>
        <button type="button" className="expert-panel-pin" aria-pressed={pinned} aria-label={`${pinned ? "Stop keeping" : "Keep"} ${title} open on this device`} title={`${pinned ? "Stop keeping" : "Keep"} this expert panel open on this device`} onClick={togglePinned}><PinIcon /></button>
      </header>
      {alert ? <p className="mastering-disclosure-alert render-error" role="alert">{alert}</p> : null}
      <div ref={panelRef} className="mastering-disclosure-panel" id={`${id}-panel`} hidden={!open}>{children}</div>
    </section>
  );
}
