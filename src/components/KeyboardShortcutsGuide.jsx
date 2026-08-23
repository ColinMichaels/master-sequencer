import React from "react";
import { Modal } from "./Modal.jsx";

const shortcutGroups = [
  {
    title: "Move between workspaces",
    description: "The seven workspace tabs stay in one predictable order.",
    shortcuts: [
      ["1", "Sequence"],
      ["2", "Mastering"],
      ["3", "Track Review"],
      ["4", "Album Decisions"],
      ["5", "Assets"],
      ["6", "Audio Library"],
      ["7", "Settings"],
    ],
  },
  {
    title: "Find a visible action",
    description: "Command Search mirrors the stable buttons and workspace tabs already on screen.",
    shortcuts: [
      ["⌘ / Ctrl + K", "Open Command Search"],
      ["↑ / ↓", "Move through matching actions"],
      ["Enter", "Choose the highlighted action"],
      ["Esc", "Close the command surface or an action menu"],
    ],
  },
  {
    title: "Audition without leaving the keyboard",
    description: "These commands work from the workspace, but yield to focused controls and dialogs.",
    shortcuts: [
      ["Space", "Play or pause the current sequence"],
      ["↑ / ↓", "Previous or next playable track"],
      ["← / →", "Master A or clean reference B when A/B is ready"],
    ],
  },
  {
    title: "Make precise adjustments",
    description: "Every shortcut has a visible control; shortcuts only accelerate the same safe action.",
    shortcuts: [
      ["Enter / Space / F2", "Rename a focused standard track title"],
      ["⌥ / Alt + click", "Reset a mastering parameter to its documented default"],
      ["⌥ / Alt + Enter", "Reset the focused mastering control"],
      ["Arrow keys", "Nudge a focused waveform marker or slider"],
      ["Home / End", "Move a focused waveform control to its boundary"],
    ],
  },
];

export function KeyboardShortcutsGuide({ onClose }) {
  return (
    <Modal title="Keyboard Shortcuts" className="modal--shortcuts" onClose={onClose}>
      <div className="shortcut-guide">
        <p className="shortcut-guide-intro"><strong>Start with visible controls. Add shortcuts when they become useful.</strong> Project Sequencer never requires a hidden command to complete an album workflow.</p>
        <div className="shortcut-guide-grid">
          {shortcutGroups.map((group) => (
            <section key={group.title} className="shortcut-guide-group" aria-labelledby={`shortcut-${group.title.toLowerCase().replaceAll(" ", "-")}`}>
              <header>
                <h3 id={`shortcut-${group.title.toLowerCase().replaceAll(" ", "-")}`}>{group.title}</h3>
                <p>{group.description}</p>
              </header>
              <dl>
                {group.shortcuts.map(([keys, action]) => (
                  <div key={`${keys}-${action}`}>
                    <dt><kbd>{keys}</kbd></dt>
                    <dd>{action}</dd>
                  </div>
                ))}
              </dl>
            </section>
          ))}
        </div>
        <aside className="shortcut-guide-safety"><strong>Keyboard safety</strong><span>Workspace shortcuts pause while you type, adjust a native control, edit text, or use a modal dialog.</span></aside>
      </div>
    </Modal>
  );
}
