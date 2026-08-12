import React, { useRef, useState } from "react";
import { FolderIcon, LockIcon, MusicIcon, PlusIcon, RefreshIcon, TrashIcon } from "./Icons.jsx";
import { AppearanceSettings } from "./AppearanceSettings.jsx";
import { ProjectIdentityForm } from "./ProjectIdentityForm.jsx";

export function SettingsWorkspace({ state, roots, scan, watching, scanning, onlineApp = false, projectArtistName, currentProject, projects, projectBusy, revealPrivateFilenames, appearance, resolvedMode, onProjectIdentityChange, onAppearanceChange, onTogglePrivate, onAddRoot, onRemoveRoot, onReconnectRoot, onChooseSources, onRescan, onImportState, onOpenProjects, onNewProject, onExportBundle }) {
  const [folderPath, setFolderPath] = useState("");
  const [folderLabel, setFolderLabel] = useState("");
  const [importError, setImportError] = useState("");
  const fileInput = useRef(null);
  const submitRoot = async (event) => {
    event.preventDefault();
    if (await onAddRoot({ path: folderPath, label: folderLabel })) {
      setFolderPath("");
      setFolderLabel("");
    }
  };
  const exportProject = () => {
    const blob = new Blob([`${JSON.stringify(state, null, 2)}\n`], { type: "application/json" });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = `project-sequencer-${new Date().toISOString().slice(0, 10)}.json`;
    link.click();
    URL.revokeObjectURL(link.href);
  };
  const importProject = async (event) => {
    const file = event.target.files?.[0];
    if (!file) return;
    setImportError("");
    try {
      if (file.size > 5_000_000) throw new Error("Project JSON must be smaller than 5 MB.");
      await onImportState(JSON.parse(await file.text()));
    } catch (error) {
      setImportError(error instanceof SyntaxError ? "That file is not valid JSON." : error.message || "That project could not be imported.");
    } finally {
      event.target.value = "";
    }
  };

  return (
    <main className="settings-workspace">
      <h2 className="sr-only">Settings</h2>
      <section className="settings-section project-settings" id="project-settings">
        <div className="settings-section-heading">
          <div><h3>Project</h3><p>The artist is a project-wide identity, separate from album and audio-source decisions.</p></div>
        </div>
        <ProjectIdentityForm artistName={projectArtistName} onSubmit={onProjectIdentityChange} />
        <div className="project-lifecycle-panel">
          <span><small>Current saved project</small><strong>{currentProject?.name || "Local Project"}</strong><em>{projects.length} saved project{projects.length === 1 ? "" : "s"} {onlineApp ? "in this browser" : "on this device"}</em></span>
          <div><button type="button" className="text-button" disabled={projectBusy} onClick={onOpenProjects}><FolderIcon /> Open Saved Project</button><button type="button" className="primary-button" disabled={projectBusy} onClick={onNewProject}><PlusIcon /> New Project</button></div>
        </div>
      </section>
      <AppearanceSettings appearance={appearance} resolvedMode={resolvedMode} onChange={onAppearanceChange} />
      <div className="settings-columns">
        <section className="settings-section">
          <div className="settings-section-heading"><h3>{onlineApp ? "Browser Audio" : "Audio Paths"}</h3><button type="button" className="text-button" disabled={scanning} title={onlineApp ? "Refresh device audio whose browser permission is still active" : "Rescan every configured source"} onClick={onRescan}><RefreshIcon /> {scanning ? "Scanning…" : onlineApp ? "Refresh" : "Rescan All"}</button></div>
          {onlineApp && <p className="online-privacy-note"><strong>Browser privacy:</strong> project decisions stay in this browser. Supported browsers can remember revocable file permissions on this device; absolute paths and audio bytes are never stored in project data or uploaded.</p>}
          {!onlineApp && <>
          <div className="native-path-grid">
            <button type="button" className="native-path-field" disabled={scanning} onClick={() => onChooseSources("files")}><MusicIcon /><span><strong>Audio file path</strong><small>{scanning ? "Waiting for the system picker…" : "Click to choose one or more audio files"}</small></span><em>Browse</em></button>
            <button type="button" className="native-path-field native-path-field--yellow" disabled={scanning} onClick={() => onChooseSources("folder")}><FolderIcon /><span><strong>Audio folder path</strong><small>Click to choose a full folder</small></span><em>Browse</em></button>
          </div>
          <p className="watch-status"><strong>{watching?.enabled ? "Filesystem watching active" : watching?.configured ? "Filesystem watching waiting for a connected folder" : "Filesystem watching off"}</strong><span>{scan ? `Last incremental scan reused ${scan.reusedMetadata} metadata records and probed ${scan.probedMetadata}.` : "Run a rescan to refresh status."}</span></p>
          <ul className="root-list">{roots.map((root) => <li key={root.id}>{root.kind === "file" ? <MusicIcon size={28}/> : <FolderIcon size={28}/>}<span><strong>{root.label}</strong><small>{root.path}</small></span><em className={root.connected ? "is-connected" : "is-offline"}>{root.connectionState === "reconnected" ? "Reconnected" : root.connected ? "Connected" : "Offline"}</em><button type="button" className="icon-button" onClick={() => onRemoveRoot(root.id)} aria-label={`Remove ${root.label}`}><TrashIcon /></button></li>)}</ul>
          <details className="manual-path-fallback manual-path-fallback--settings">
            <summary>Enter a path manually</summary>
            <form className="root-form" onSubmit={submitRoot}>
              <label>Source label<input value={folderLabel} onChange={(event) => setFolderLabel(event.target.value)} placeholder="External Masters" /></label>
              <label>Full file or folder path<input required value={folderPath} onChange={(event) => setFolderPath(event.target.value)} placeholder="/Volumes/Masters/Album" /></label>
              <button className="primary-button" type="submit" disabled={scanning}><PlusIcon /> Add Path</button>
            </form>
          </details>
          </>}
          {onlineApp && <ul className="root-list">{roots.map((root) => <li key={root.id}>{root.kind === "browser-persistent" ? <FolderIcon size={28}/> : <MusicIcon size={28}/>}<span><strong>{root.label}</strong><small>{root.path}</small></span><em className={root.connected ? "is-connected" : "is-offline"}>{root.connectionState === "permission-required" ? "Permission required" : root.connectionState === "reconnected" ? "Reconnected" : root.connected ? "Ready" : "Offline"}</em>{root.kind === "browser-persistent" && !root.connected && <button type="button" className="text-button" disabled={scanning} onClick={() => onReconnectRoot(root.id)}>Reconnect</button>}{root.id !== "dreadnauts-album-one" && <button type="button" className="icon-button" onClick={() => onRemoveRoot(root.id)} aria-label={`Forget ${root.label}`}><TrashIcon /></button>}</li>)}</ul>}
        </section>

        <section className="settings-section">
          <h3>Privacy and Project Data</h3>
          <label className="privacy-toggle"><span><LockIcon /><strong>Reveal protected filenames</strong><small>Off by default. Sequence and review views keep protected sources masked.</small></span><input type="checkbox" checked={revealPrivateFilenames} onChange={(event) => onTogglePrivate(event.target.checked)} /></label>
          <div className="data-actions"><button type="button" className="primary-button" onClick={exportProject}>Export Project JSON</button>{!onlineApp && <button type="button" className="primary-button" onClick={onExportBundle}>Export Portable Checksums</button>}<button type="button" className="primary-button primary-button--yellow" onClick={() => fileInput.current?.click()}>Import Project JSON</button><input ref={fileInput} type="file" accept="application/json,.json" hidden onChange={importProject}/></div>
          <p className="settings-note"><strong>{onlineApp ? "Browser project export:" : "Portable checksum bundle:"}</strong> {onlineApp ? "downloads project decisions only. Album previews and selected device audio are not included." : "exports project JSON plus SHA-256 records for currently indexed sources. It contains no media bytes and does not copy audio."}</p>
          {importError && <p className="render-error" role="alert">{importError}</p>}
          <dl className="data-locations">{onlineApp ? <><div><dt>Open project</dt><dd>Browser local storage</dd></div><div><dt>Saved projects</dt><dd>This browser only</dd></div><div><dt>Included audio</dt><dd>Official Apple Music previews</dd></div><div><dt>Device media</dt><dd>Revocable browser handles; never uploaded</dd></div></> : <><div><dt>Open project</dt><dd>data/sequencer-state.json</dd></div><div><dt>Saved projects</dt><dd>data/projects/</dd></div><div><dt>Audio metadata cache</dt><dd>data/audio-index-cache.json</dd></div><div><dt>File and folder paths</dt><dd>config/sequencer.local.json</dd></div></>}</dl>
          <p className="settings-note"><strong>{onlineApp ? "Browser project storage:" : "Local project storage:"}</strong> {onlineApp ? "notes, sequence order, audition choices, presets, and approvals remain in this browser until its site data is cleared." : "paths, notes, sequence order, audition choices, and approvals are stored in ignored JSON files on this device. Audio bytes are never stored in the project."}</p>
          {!onlineApp && <p className="settings-note">Removing a path never deletes audio. It only disconnects that folder from this index. Existing album references remain and return when the path is connected again.</p>}
        </section>
      </div>
    </main>
  );
}
