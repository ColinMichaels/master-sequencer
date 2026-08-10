import React, { useRef, useState } from "react";
import { FolderIcon, LockIcon, MusicIcon, PlusIcon, RefreshIcon, TrashIcon } from "./Icons.jsx";
import { AppearanceSettings } from "./AppearanceSettings.jsx";

export function SettingsWorkspace({ state, roots, scanning, revealPrivateFilenames, appearance, resolvedMode, onAppearanceChange, onTogglePrivate, onAddRoot, onRemoveRoot, onChooseSources, onRescan, onImportState }) {
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
      <header className="settings-heading"><h2>Settings</h2><p>Adjust the screen, configure audio paths, and manage local project data. Source files always stay in place.</p></header>
      <AppearanceSettings appearance={appearance} resolvedMode={resolvedMode} onChange={onAppearanceChange} />
      <div className="settings-columns">
        <section className="settings-section">
          <div className="settings-section-heading"><h3>Audio Paths</h3><button type="button" className="text-button" disabled={scanning} onClick={onRescan}><RefreshIcon /> {scanning ? "Scanning…" : "Rescan All"}</button></div>
          <div className="native-path-grid">
            <button type="button" className="native-path-field" disabled={scanning} onClick={() => onChooseSources("files")}><MusicIcon /><span><strong>Audio file path</strong><small>{scanning ? "Waiting for the system picker…" : "Click to choose one or more audio files"}</small></span><em>Browse</em></button>
            <button type="button" className="native-path-field native-path-field--yellow" disabled={scanning} onClick={() => onChooseSources("folder")}><FolderIcon /><span><strong>Audio folder path</strong><small>Click to choose a full folder</small></span><em>Browse</em></button>
          </div>
          <ul className="root-list">{roots.map((root) => <li key={root.id}>{root.kind === "file" ? <MusicIcon size={28}/> : <FolderIcon size={28}/>}<span><strong>{root.label}</strong><small>{root.path}</small></span><em className={root.connected ? "is-connected" : "is-offline"}>{root.connected ? "Connected" : "Offline"}</em><button type="button" className="icon-button" onClick={() => onRemoveRoot(root.id)} aria-label={`Remove ${root.label}`}><TrashIcon /></button></li>)}</ul>
          <details className="manual-path-fallback manual-path-fallback--settings">
            <summary>Enter a path manually</summary>
            <form className="root-form" onSubmit={submitRoot}>
              <label>Source label<input value={folderLabel} onChange={(event) => setFolderLabel(event.target.value)} placeholder="External Masters" /></label>
              <label>Full file or folder path<input required value={folderPath} onChange={(event) => setFolderPath(event.target.value)} placeholder="/Volumes/Masters/Album" /></label>
              <button className="primary-button" type="submit" disabled={scanning}><PlusIcon /> Add Path</button>
            </form>
          </details>
        </section>

        <section className="settings-section">
          <h3>Privacy and Project Data</h3>
          <label className="privacy-toggle"><span><LockIcon /><strong>Reveal protected filenames</strong><small>Off by default. Sequence and review views keep protected sources masked.</small></span><input type="checkbox" checked={revealPrivateFilenames} onChange={(event) => onTogglePrivate(event.target.checked)} /></label>
          <div className="data-actions"><button type="button" className="primary-button" onClick={exportProject}>Export Project JSON</button><button type="button" className="primary-button primary-button--yellow" onClick={() => fileInput.current?.click()}>Import Project JSON</button><input ref={fileInput} type="file" accept="application/json,.json" hidden onChange={importProject}/></div>
          {importError && <p className="render-error" role="alert">{importError}</p>}
          <dl className="data-locations"><div><dt>Album decisions</dt><dd>data/sequencer-state.json</dd></div><div><dt>Audio metadata cache</dt><dd>data/audio-index-cache.json</dd></div><div><dt>File and folder paths</dt><dd>config/sequencer.local.json</dd></div></dl>
          <p className="settings-note"><strong>Local project storage:</strong> paths, notes, sequence order, audition choices, and approvals are stored in ignored JSON files on this device. Audio bytes are never stored in the project.</p>
          <p className="settings-note">Removing a path never deletes audio. It only disconnects that folder from this index. Existing album references remain and return when the path is connected again.</p>
        </section>
      </div>
    </main>
  );
}
