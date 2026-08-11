import React, { useState } from "react";
import { FolderIcon, PlusIcon, TrashIcon } from "./Icons.jsx";

const formatUpdatedAt = (value) => {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "Saved locally" : `Updated ${date.toLocaleString([], { dateStyle: "medium", timeStyle: "short" })}`;
};

export function NewProjectForm({ defaultArtistName, busy, onSubmit, onCancel }) {
  const [name, setName] = useState("");
  const [artistName, setArtistName] = useState(defaultArtistName || "");
  const [firstAlbumTitle, setFirstAlbumTitle] = useState("");
  const [era, setEra] = useState("future");
  const valid = name.trim() && artistName.trim() && firstAlbumTitle.trim();
  return (
    <form className="modal-form new-project-form" onSubmit={(event) => {
      event.preventDefault();
      if (valid) onSubmit({ name: name.trim(), artistName: artistName.trim(), firstAlbumTitle: firstAlbumTitle.trim(), era });
    }}>
      <p>Your open project is saved before the new project begins. The new project starts with one empty album and no carried-over decisions, approvals, tracks, or attachments.</p>
      <label>Project name<input autoFocus required maxLength={120} value={name} onChange={(event) => setName(event.target.value)} placeholder="Album Two Sessions" /></label>
      <label>Artist name<input required maxLength={120} value={artistName} onChange={(event) => setArtistName(event.target.value)} placeholder="Artist or band name" /></label>
      <label>First album title<input required maxLength={120} value={firstAlbumTitle} onChange={(event) => setFirstAlbumTitle(event.target.value)} placeholder="Untitled Album" /></label>
      <label>Album era<select value={era} onChange={(event) => setEra(event.target.value)}><option value="past">Past</option><option value="current">Current</option><option value="future">Future</option></select></label>
      <p className="path-storage-note">Configured audio paths remain available to every project, but source audio is never copied or changed.</p>
      <div className="modal-actions"><button type="button" className="text-button" disabled={busy} onClick={onCancel}>Cancel</button><button type="submit" className="primary-button" disabled={!valid || busy}><PlusIcon /> {busy ? "Starting…" : "Start Fresh Project"}</button></div>
    </form>
  );
}

export function SavedProjects({ projects, busy, onLoad, onRemove, onNewProject, onCancel }) {
  return (
    <div className="modal-form saved-projects">
      <p>Every project below is a separate local snapshot of its albums, tracks, notes, sources, mastering instructions, and approvals.</p>
      <ul className="saved-project-list">
        {projects.map((project) => (
          <li key={project.id} className={project.active ? "is-active" : ""}>
            <span><strong>{project.name}</strong><small>{project.artistName} · {project.albumCount} album{project.albumCount === 1 ? "" : "s"} · {project.trackCount} track{project.trackCount === 1 ? "" : "s"}</small><small>{formatUpdatedAt(project.updatedAt)}</small></span>
            <span className="saved-project-actions">
              {project.active
                ? <em>Open now</em>
                : <button type="button" className="text-button" disabled={busy} onClick={() => onLoad(project.id)}><FolderIcon /> Load Project</button>}
              <button type="button" className="icon-button saved-project-remove" disabled={busy || projects.length <= 1} onClick={() => onRemove(project.id)} aria-label={`Remove project ${project.name}`} title={projects.length <= 1 ? "Start another project before removing the final saved project" : `Remove ${project.name}`}><TrashIcon /></button>
            </span>
          </li>
        ))}
      </ul>
      <div className="modal-actions"><button type="button" className="text-button" disabled={busy} onClick={onCancel}>Close</button><button type="button" className="primary-button" disabled={busy} onClick={onNewProject}><PlusIcon /> New Project</button></div>
    </div>
  );
}

export function RemoveProjectForm({ project, busy, onSubmit, onCancel }) {
  return (
    <div className="modal-form remove-project-form">
      <p><strong>{project.name}</strong> and its saved Project Sequencer decisions will be removed from this app.</p>
      <dl className="rename-album-identity"><div><dt>Albums</dt><dd>{project.albumCount}</dd></div><div><dt>Track records</dt><dd>{project.trackCount}</dd></div><div><dt>Project status</dt><dd>{project.active ? "Open now — another saved project will open" : "Saved, not currently open"}</dd></div></dl>
      <p className="deletion-safety-note"><strong>Your assets are safe.</strong> Indexed audio, source folders, artwork, lyric files, and rendered exports stay exactly where they are. Only this saved project record and its app decisions are removed.</p>
      <div className="modal-actions"><button type="button" className="text-button" disabled={busy} onClick={onCancel}>Keep Project</button><button type="button" className="primary-button primary-button--danger" disabled={busy} onClick={onSubmit}><TrashIcon /> {busy ? "Removing…" : "Remove Project"}</button></div>
    </div>
  );
}
