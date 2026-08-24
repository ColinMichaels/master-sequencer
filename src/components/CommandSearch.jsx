import React, { useEffect, useMemo, useRef, useState } from "react";
import { SearchIcon } from "./Icons.jsx";
import { Modal } from "./Modal.jsx";

const normalizedSearch = (value) => value.trim().toLocaleLowerCase();

export function CommandSearch({ commands, onClose }) {
  const [query, setQuery] = useState("");
  const [selectedIndex, setSelectedIndex] = useState(0);
  const resultRefs = useRef([]);
  const filteredCommands = useMemo(() => {
    const tokens = normalizedSearch(query).split(/\s+/).filter(Boolean);
    if (!tokens.length) return commands;
    return commands.filter((command) => {
      const searchable = normalizedSearch([command.label, command.description, command.group, ...(command.keywords || [])].filter(Boolean).join(" "));
      return tokens.every((token) => searchable.includes(token));
    });
  }, [commands, query]);

  useEffect(() => { setSelectedIndex(0); }, [query]);
  useEffect(() => { resultRefs.current[selectedIndex]?.scrollIntoView({ block: "nearest" }); }, [selectedIndex]);

  const nextEnabledIndex = (start, direction) => {
    if (!filteredCommands.length) return -1;
    for (let step = 1; step <= filteredCommands.length; step += 1) {
      const index = (start + direction * step + filteredCommands.length) % filteredCommands.length;
      if (!filteredCommands[index].disabled) return index;
    }
    return -1;
  };
  const runCommand = (command) => {
    if (!command || command.disabled) return;
    if (command.requiresUserActivation) {
      command.onSelect();
      onClose();
      return;
    }
    onClose();
    requestAnimationFrame(command.onSelect);
  };
  const onSearchKeyDown = (event) => {
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      const next = nextEnabledIndex(selectedIndex, event.key === "ArrowDown" ? 1 : -1);
      if (next >= 0) setSelectedIndex(next);
    } else if (event.key === "Home" || event.key === "End") {
      event.preventDefault();
      const start = event.key === "Home" ? -1 : 0;
      const direction = event.key === "Home" ? 1 : -1;
      const next = nextEnabledIndex(start, direction);
      if (next >= 0) setSelectedIndex(next);
    } else if (event.key === "Enter") {
      event.preventDefault();
      runCommand(filteredCommands[selectedIndex]);
    }
  };

  return (
    <Modal title="Command Search" className="modal--commands" onClose={onClose}>
      <div className="command-search">
        <label className="command-search-field"><SearchIcon /><span className="sr-only">Search commands</span><input data-modal-autofocus autoComplete="off" value={query} onChange={(event) => setQuery(event.target.value)} onKeyDown={onSearchKeyDown} placeholder="Search visible actions and workspaces" /></label>
        <div className="command-search-results" role="listbox" aria-label="Available commands" aria-live="polite">
          {filteredCommands.map((command, index) => <button ref={(element) => { resultRefs.current[index] = element; }} key={command.id} type="button" role="option" aria-selected={selectedIndex === index} disabled={command.disabled} className={selectedIndex === index ? "is-selected" : ""} onPointerMove={() => setSelectedIndex(index)} onFocus={() => setSelectedIndex(index)} onClick={() => runCommand(command)}>
            <span><small>{command.group}</small><strong>{command.label}</strong><em>{command.description}</em></span>
            {command.shortcut ? <kbd>{command.shortcut}</kbd> : <b aria-hidden="true">↵</b>}
          </button>)}
          {!filteredCommands.length && <p className="command-search-empty">No visible action matches “{query}”.</p>}
        </div>
        <footer><span><kbd>↑</kbd><kbd>↓</kbd> Navigate</span><span><kbd>Enter</kbd> Choose</span><span><kbd>Esc</kbd> Close</span></footer>
      </div>
    </Modal>
  );
}
