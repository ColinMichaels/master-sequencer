import React, { useState } from "react";
import { RefreshIcon, WarningIcon } from "./Icons.jsx";

export function RecoveryWorkspace({ recovery, error, onRestore }) {
  const [restoring, setRestoring] = useState(false);
  const restore = async () => {
    setRestoring(true);
    const restored = await onRestore();
    if (!restored) setRestoring(false);
  };
  const sourceLabel = recovery.source === "last-known-good" ? "last-known-good project snapshot" : "portable seed catalog";
  const snapshotTime = recovery.snapshotUpdatedAt
    ? new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" }).format(new Date(recovery.snapshotUpdatedAt))
    : "available local snapshot";

  return (
    <main className="recovery-workspace">
      <section className="recovery-card" aria-labelledby="recovery-title">
        <div className="recovery-mark" aria-hidden="true"><WarningIcon size={34} /></div>
        <p className="eyebrow">Project protection</p>
        <h1 id="recovery-title">Recovery is required</h1>
        <p>The current project record could not be opened safely, so Project Sequencer preserved it unchanged and stopped automatic saves.</p>
        <dl>
          <div><dt>Reason</dt><dd>{recovery.reason}</dd></div>
          <div><dt>Safe restore point</dt><dd>{sourceLabel}</dd></div>
          <div><dt>Snapshot time</dt><dd>{snapshotTime}</dd></div>
        </dl>
        <div className="recovery-safety-note">
          <strong>No source media was touched.</strong>
          <span>Restoring replaces only the ignored local project-state JSON. Indexed audio stays exactly where it is.</span>
        </div>
        {error && <p className="render-error" role="alert">{error}</p>}
        <button type="button" className="primary-button primary-button--yellow" disabled={restoring} onClick={restore}>
          <RefreshIcon /> {restoring ? "Restoring Project…" : `Restore ${sourceLabel}`}
        </button>
      </section>
    </main>
  );
} 
