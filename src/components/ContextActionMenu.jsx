import React, { useEffect, useId, useRef, useState } from "react";
import { MoreIcon } from "./Icons.jsx";

export function ContextActionMenu({ label, items, align = "end" }) {
  const [open, setOpen] = useState(false);
  const menuId = useId();
  const shellRef = useRef(null);
  const triggerRef = useRef(null);
  const menuRef = useRef(null);
  const visibleItems = items.filter((item) => !item.hidden);

  const menuButtons = () => [...(menuRef.current?.querySelectorAll('[role="menuitem"]:not(:disabled)') || [])];
  const focusMenuItem = (position) => requestAnimationFrame(() => {
    const buttons = menuButtons();
    buttons[position === "last" ? buttons.length - 1 : 0]?.focus();
  });
  const openMenu = (position = "first") => {
    setOpen(true);
    focusMenuItem(position);
  };
  const closeMenu = ({ restoreFocus = false } = {}) => {
    setOpen(false);
    if (restoreFocus) requestAnimationFrame(() => triggerRef.current?.focus());
  };

  useEffect(() => {
    if (!open) return undefined;
    const closeOnOutside = (event) => {
      if (!shellRef.current?.contains(event.target)) closeMenu();
    };
    const closeOnEscape = (event) => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      closeMenu({ restoreFocus: true });
    };
    document.addEventListener("pointerdown", closeOnOutside);
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      document.removeEventListener("pointerdown", closeOnOutside);
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, [open]);

  const moveFocus = (event) => {
    if (!["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key)) return;
    const buttons = menuButtons();
    if (!buttons.length) return;
    event.preventDefault();
    if (event.key === "Home") return buttons[0].focus();
    if (event.key === "End") return buttons.at(-1).focus();
    const currentIndex = buttons.indexOf(document.activeElement);
    const direction = event.key === "ArrowDown" ? 1 : -1;
    buttons[(currentIndex + direction + buttons.length) % buttons.length].focus();
  };

  const runItem = (item) => {
    setOpen(false);
    triggerRef.current?.focus({ preventScroll: true });
    item.onSelect();
  };

  return (
    <div ref={shellRef} className={`context-action-menu context-action-menu--${align}`}>
      <button ref={triggerRef} type="button" className="context-action-trigger" aria-label={label} aria-haspopup="menu" aria-expanded={open} aria-controls={open ? menuId : undefined} onClick={() => open ? closeMenu() : openMenu()} onKeyDown={(event) => {
        if (event.key === "ArrowDown" || event.key === "ArrowUp") {
          event.preventDefault();
          openMenu(event.key === "ArrowUp" ? "last" : "first");
        }
      }}><MoreIcon /></button>
      {open && <div ref={menuRef} id={menuId} className="context-action-popover" role="menu" aria-label={label} onKeyDown={moveFocus}>
        <header><strong>Actions</strong><small>{label.replace(/^Actions for /, "")}</small></header>
        {visibleItems.map((item) => {
          const ItemIcon = item.Icon;
          return <button key={item.id} type="button" role="menuitem" disabled={item.disabled} onClick={() => runItem(item)}>{ItemIcon ? <ItemIcon /> : null}<span><strong>{item.label}</strong>{item.description ? <small>{item.description}</small> : null}</span></button>;
        })}
      </div>}
    </div>
  );
}
