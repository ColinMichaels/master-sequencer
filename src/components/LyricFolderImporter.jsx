import React, { useState } from "react";
import { applyLyricFolderAssignments, planLyricFolderAssignments } from "../lib/lyric-matching.js";
import { CheckIcon, FolderIcon, WarningIcon } from "./Icons.jsx";

const kindLabel = (kind) => kind === "distrokid" ? "DistroKid clean lyrics" : "Prompt / working lyrics";
const assetName = (asset) => asset?.name || asset?.relativePath?.split(/[\\/]/).at(-1) || "Lyric file";

export function LyricFolderImporter({ album, picking, sourcePickingAvailable, revealPrivateFilenames, onAlbumChange, onChooseFolder }) {
  const [outcome, setOutcome] = useState(null);

  const chooseFolder = async () => {
    const result = await onChooseFolder();
    if (!result.ok || result.cancelled) return;
    const plan = planLyricFolderAssignments(album, result.assets);
    const applied = plan.assignments.length;
    if (plan.assignments.length) {
      onAlbumChange((draft) => { applyLyricFolderAssignments(draft, plan.assignments); });
    }
    setOutcome({ ...plan, applied, folder: result.folder });
  };

  const skippedCount = outcome
    ? outcome.unmatched.length + outcome.conflicts.length + outcome.skippedExisting.length + outcome.skippedNoCandidate.length
    : 0;
  const matchedTrackCount = outcome ? new Set(outcome.assignments.map((assignment) => assignment.trackId)).size : 0;

  return (
    <section className="lyric-folder-import" aria-labelledby="lyric-folder-import-title">
      <div className="lyric-folder-import-copy">
        <span className="lyric-folder-import-icon"><FolderIcon /></span>
        <span>
          <strong id="lyric-folder-import-title">Auto-match a lyrics folder</strong>
          <small>Matches filenames to track titles. Files containing “DistroKid,” “clean lyrics,” or “lyrics only” fill the clean-lyrics slot; existing attachments are never replaced.</small>
        </span>
      </div>
      <button type="button" className="primary-button" disabled={!sourcePickingAvailable || picking} title={sourcePickingAvailable ? "Choose a folder and attach safe exact title matches" : "Lyrics folder matching is available in the local app"} onClick={chooseFolder}>
        <FolderIcon /> {picking ? "Waiting…" : sourcePickingAvailable ? "Choose Lyrics Folder" : "Local App Required"}
      </button>

      {outcome ? (
        <div className={`lyric-folder-result ${outcome.applied ? "is-success" : "is-warning"}`} role="status" aria-live="polite">
          <span>{outcome.applied ? <CheckIcon /> : <WarningIcon />}</span>
          <div>
            <strong>{outcome.applied
              ? `${outcome.applied} lyric file${outcome.applied === 1 ? "" : "s"} attached to ${matchedTrackCount} track${matchedTrackCount === 1 ? "" : "s"}.`
              : "No new lyric files were attached."}</strong>
            <small>{outcome.folder?.name || "Selected folder"} · {outcome.scannedCount} supported files scanned{skippedCount ? ` · ${skippedCount} skipped for review or safety` : ""}</small>
            {outcome.assignments.length ? (
              <ul className="lyric-folder-match-list" aria-label="Attached lyric matches">
                {outcome.assignments.map((assignment) => (
                  <li key={`${assignment.trackId}-${assignment.kind}-${assignment.asset.id}`}>
                    <span><strong>{assignment.trackTitle}</strong><small>{kindLabel(assignment.kind)}</small></span>
                    <small>{assetName(assignment.asset)}</small>
                  </li>
                ))}
              </ul>
            ) : null}
            {outcome.skippedExisting.length ? <small>{outcome.skippedExisting.length} already-filled slot{outcome.skippedExisting.length === 1 ? " was" : "s were"} preserved.</small> : null}
            {outcome.conflicts.length ? <small>{outcome.conflicts.length} duplicate title/type group{outcome.conflicts.length === 1 ? " needs" : "s need"} manual review.</small> : null}
            {outcome.skippedNoCandidate.length ? <small>{outcome.skippedNoCandidate.length} match{outcome.skippedNoCandidate.length === 1 ? " has" : "es have"} no audio candidate to receive lyrics.</small> : null}
            {outcome.unmatched.length ? (
              revealPrivateFilenames
                ? <details><summary>{outcome.unmatched.length} unmatched file{outcome.unmatched.length === 1 ? "" : "s"}</summary><ul>{outcome.unmatched.map(({ asset }) => <li key={asset.id}>{assetName(asset)}</li>)}</ul></details>
                : <small>{outcome.unmatched.length} unmatched filename{outcome.unmatched.length === 1 ? " is" : "s are"} hidden while private filenames are masked.</small>
            ) : null}
          </div>
        </div>
      ) : null}
    </section>
  );
}
