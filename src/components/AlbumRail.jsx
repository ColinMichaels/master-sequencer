import React, { useEffect, useState } from "react";
import { api } from "../lib/api.js";
import { CheckIcon, DocumentIcon, EditIcon, FolderIcon, MoreIcon, PanelLeftIcon, PlusIcon, TrashIcon } from "./Icons.jsx";

const eraLabels = { past: "Past", current: "Current", future: "Future" };

function AlbumArt({ album }) {
  if (album.coverRef) return <img src={api.assetUrl(album.coverRef)} alt="" />;
  return <span className="album-art-placeholder" aria-hidden="true">{album.title.slice(0, 1).toUpperCase()}</span>;
}

export function AlbumRail({ albums, activeAlbumId, currentProject, collapsed, projectBusy, draggedAudioKey = "", onToggle, onSelectAlbum, onDropAudio, onAddAlbum, onRenameAlbum, onDeleteAlbum, onOpenProjects, onNewProject }) {
  const [dropTargetAlbumId, setDropTargetAlbumId] = useState("");
  const toggleLabel = collapsed ? "Show albums panel" : "Hide albums panel";
  const audioDragActive = Boolean(draggedAudioKey && onDropAudio);

  useEffect(() => {
    if (!audioDragActive) setDropTargetAlbumId("");
  }, [audioDragActive]);

  const dropHandlers = (album) => audioDragActive ? {
    onDragEnter: (event) => {
      event.preventDefault();
      setDropTargetAlbumId(album.id);
    },
    onDragOver: (event) => {
      event.preventDefault();
      event.dataTransfer.dropEffect = "copy";
      setDropTargetAlbumId(album.id);
    },
    onDragLeave: (event) => {
      if (event.relatedTarget instanceof Node && event.currentTarget.contains(event.relatedTarget)) return;
      setDropTargetAlbumId((current) => current === album.id ? "" : current);
    },
    onDrop: (event) => {
      event.preventDefault();
      event.stopPropagation();
      setDropTargetAlbumId("");
      onDropAudio(album.id, draggedAudioKey);
    },
  } : {};

  return (
    <aside className={`album-rail ${collapsed ? "is-collapsed" : ""} ${audioDragActive ? "is-audio-drag-active" : ""}`} aria-label="Albums">
      <header className="album-rail-heading">
        {!collapsed && <h2>Albums</h2>}
        <button type="button" className="panel-toggle panel-toggle--left" onClick={onToggle} aria-expanded={!collapsed} aria-controls="album-panel-content" aria-label={toggleLabel} data-tooltip={toggleLabel}><PanelLeftIcon collapsed={collapsed} /></button>
      </header>
      {collapsed ? <div id="album-panel-content" className="album-rail-compact">
        <button type="button" className="compact-rail-button" disabled={projectBusy} onClick={onOpenProjects} aria-label={`Open saved projects for ${currentProject?.name || "Local Project"}`} data-tooltip={`Projects · ${currentProject?.name || "Local Project"}`}><FolderIcon /></button>
        <div className="compact-album-list" aria-label="Albums in this project">
          {albums.map((album) => (
            <button key={album.id} type="button" className={`compact-album-button ${activeAlbumId === album.id ? "is-active" : ""} ${dropTargetAlbumId === album.id ? "is-drop-target" : ""}`} onClick={() => onSelectAlbum(album.id)} aria-label={`Open album ${album.title}`} aria-current={activeAlbumId === album.id ? "true" : undefined} data-drop-album-id={album.id} data-tooltip={dropTargetAlbumId === album.id ? `Drop to add to ${album.title}` : `${album.title} · ${album.status}`} title={dropTargetAlbumId === album.id ? `Drop to add to ${album.title}` : `${album.title} · ${album.status}`} {...dropHandlers(album)}>
              <span className="album-art"><AlbumArt album={album} /></span>
            </button>
          ))}
        </div>
        <div className="compact-rail-actions">
          <button type="button" className="compact-rail-button compact-add-album" onClick={onAddAlbum} aria-label="Add Album" data-tooltip="Add Album"><PlusIcon /></button>
          <button type="button" className="compact-rail-button compact-new-project" disabled={projectBusy} onClick={onNewProject} aria-label="New Project" data-tooltip="New Project"><DocumentIcon /></button>
        </div>
      </div> : <div id="album-panel-content" className="album-panel-content">
      <button type="button" className="current-project-card" disabled={projectBusy} onClick={onOpenProjects}>
        <span><small>Current project</small><strong>{currentProject?.name || "Local Project"}</strong></span><FolderIcon />
      </button>
      <div className="album-groups">
        {Object.keys(eraLabels).map((era) => {
          const grouped = albums.filter((album) => album.era === era);
          if (!grouped.length) return null;
          return (
            <section className="album-group" key={era}>
              <h3>{eraLabels[era]}</h3>
              {grouped.map((album) => (
                <div key={album.id} className={`album-item-row ${activeAlbumId === album.id ? "is-active" : ""} ${dropTargetAlbumId === album.id ? "is-drop-target" : ""}`} data-drop-album-id={album.id} {...dropHandlers(album)}>
                  <button type="button" className="album-item" onClick={() => onSelectAlbum(album.id)} aria-current={activeAlbumId === album.id ? "true" : undefined}>
                    <span className="album-art"><AlbumArt album={album} /></span>
                    <span className="album-copy">
                      <strong>{album.title}</strong>
                      <small>{dropTargetAlbumId === album.id ? "Drop to add track / candidate" : album.status}</small>
                    </span>
                    <span className="album-state" aria-hidden="true">{album.status === "released" ? <CheckIcon /> : <MoreIcon />}</span>
                  </button>
                  <span className="album-row-actions">
                    <button type="button" className="album-action-button" onClick={() => onRenameAlbum(album.id)} aria-label={`Rename ${album.title}`} title={`Rename ${album.title}`}><EditIcon /></button>
                    <button type="button" className="album-action-button album-delete-button" disabled={albums.length <= 1} onClick={() => onDeleteAlbum(album.id)} aria-label={`Delete ${album.title}`} title={albums.length <= 1 ? "A project must keep at least one album" : `Delete ${album.title}`}><TrashIcon /></button>
                  </span>
                </div>
              ))}
            </section>
          );
        })}
      </div>
      <div className="rail-actions"><button type="button" className="rail-add-button" onClick={onAddAlbum}><PlusIcon /> Add Album</button><button type="button" className="rail-project-button" disabled={projectBusy} onClick={onNewProject}><PlusIcon /> New Project</button></div>
      </div>}
    </aside>
  );
}
