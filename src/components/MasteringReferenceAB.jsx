import React, { useCallback, useEffect, useMemo } from "react";
import { sourceKey } from "../lib/api.js";
import { formatDuration } from "../lib/format.js";
import { MusicIcon } from "./Icons.jsx";

const EMPTY_SOURCE_KEYS = new Set();

const sourceReferenceForFile = (file) => file?.privateSourceId
  ? { privateSourceId: file.privateSourceId }
  : file
    ? { rootId: file.rootId, relativePath: file.relativePath }
    : null;

const isArrowKeyOwnedByControl = (target) => {
  if (typeof Element === "undefined" || !(target instanceof Element)) return false;
  return Boolean(target.closest("input, textarea, select, [contenteditable='true'], [role='textbox'], [role='slider']"));
};

export function MasteringReferenceAB({
  track,
  currentFile,
  libraryMap,
  referenceSourceRef,
  protectedSourceKeys = EMPTY_SOURCE_KEYS,
  revealPrivateFilenames = false,
  activeComparison,
  onReferenceChange,
  onCompare,
}) {
  const files = useMemo(
    () => [...libraryMap.values()].sort((left, right) => left.name.localeCompare(right.name, undefined, { numeric: true, sensitivity: "base" })),
    [libraryMap],
  );
  const referenceKey = sourceKey(referenceSourceRef);
  const referenceFile = referenceKey ? libraryMap.get(referenceKey) : null;
  const displayName = useCallback((file) => {
    const isProtected = Boolean(file?.privateSourceId) || protectedSourceKeys.has(file?.key);
    return isProtected && !revealPrivateFilenames ? "[Private source file]" : file?.name || "Unavailable reference";
  }, [protectedSourceKeys, revealPrivateFilenames]);
  const comparisonIsCurrent = activeComparison?.trackId === track?.id && activeComparison?.referenceKey === referenceFile?.key;
  const activeChannel = comparisonIsCurrent ? activeComparison.channel : "";
  const referenceLabel = referenceFile ? displayName(referenceFile) : "";
  const summaryState = activeChannel === "A"
    ? "A · Master live"
    : activeChannel === "B"
      ? "B · Reference live"
      : "Open controls";

  const startComparison = useCallback((channel) => {
    if (!track || !currentFile || !referenceFile || activeChannel === channel) return;
    onCompare(channel, referenceFile, referenceLabel);
  }, [activeChannel, currentFile, onCompare, referenceFile, referenceLabel, track]);

  useEffect(() => {
    const switchReferenceChannel = (event) => {
      const channel = event.key === "ArrowLeft" ? "A" : event.key === "ArrowRight" ? "B" : "";
      if (!channel || event.repeat || event.isComposing || event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return;
      if (isArrowKeyOwnedByControl(event.target) || !track || !currentFile || !referenceFile || activeChannel === channel) return;
      event.preventDefault();
      startComparison(channel);
    };
    window.addEventListener("keydown", switchReferenceChannel);
    return () => window.removeEventListener("keydown", switchReferenceChannel);
  }, [activeChannel, currentFile, referenceFile, startComparison, track]);

  const selectReference = (event) => {
    const file = libraryMap.get(event.target.value);
    onReferenceChange(sourceReferenceForFile(file));
  };

  return (
    <details className={`reference-ab-panel ${activeChannel ? "is-monitoring" : ""}`}>
      <summary className="reference-ab-summary">
        <span className="reference-ab-mark"><MusicIcon /> A/B</span>
        <span className="reference-ab-summary-copy"><strong>A/B Reference Track</strong><small>{referenceFile ? referenceLabel : "Choose an indexed reference"}</small></span>
        <span className={`reference-ab-summary-state ${activeChannel === "A" ? "is-master" : activeChannel === "B" ? "is-reference" : ""}`}>{summaryState}</span>
      </summary>
      <div className="reference-ab-body">
        <p className="reference-ab-description">Compare the current live master with one indexed source. B always takes the clean direct path around track gain and every MASTER effect.</p>
        <label className="reference-ab-source">Reference audio track
          <select value={referenceKey} onChange={selectReference}>
            <option value="">Choose an indexed reference</option>
            {referenceKey && !referenceFile ? <option value={referenceKey}>Reference unavailable — reconnect or rescan</option> : null}
            {files.map((file) => <option key={file.key} value={file.key}>{displayName(file)} · {file.extension.toUpperCase()} · {formatDuration(file.duration)}</option>)}
          </select>
        </label>
        <div className="reference-ab-toggle" role="group" aria-label="Reference A/B monitor">
          <button type="button" className={activeChannel === "A" ? "is-active" : ""} aria-pressed={activeChannel === "A"} aria-keyshortcuts="ArrowLeft" disabled={!track || !currentFile || !referenceFile} onClick={() => startComparison("A")}>
            <span>A</span><strong>Current master</strong><small>{track?.title || "No playable track"}</small>
          </button>
          <button type="button" className={activeChannel === "B" ? "is-active is-clean" : ""} aria-pressed={activeChannel === "B"} aria-keyshortcuts="ArrowRight" disabled={!track || !currentFile || !referenceFile} onClick={() => startComparison("B")}>
            <span>B</span><strong>Clean reference</strong><small>{referenceFile ? referenceLabel : "Choose a reference above"}</small>
          </button>
        </div>
        <p className={`reference-ab-status reference-ab-status--${activeChannel || "ready"}`} role="status" aria-live="polite">
          <span>{activeChannel === "A" ? <><strong>A is live.</strong> Track gain and the current MASTER chain are active.</> : activeChannel === "B" ? <><strong>B is live.</strong> Clean reference output; mastering effects are bypassed.</> : <><strong>A/B ready.</strong> Switching keeps the same elapsed audition point where possible.</>}</span>
          <span className="reference-ab-shortcuts" aria-label="Keyboard shortcuts: Left Arrow selects A, Right Arrow selects B"><kbd>←</kbd> A <i>·</i> B <kbd>→</kbd></span>
        </p>
      </div>
    </details>
  );
}
