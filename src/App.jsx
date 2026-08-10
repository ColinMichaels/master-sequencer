import React, { useState } from "react";
import { AlbumRail } from "./components/AlbumRail.jsx";
import { AlbumDecisionsWorkspace } from "./components/AlbumDecisionsWorkspace.jsx";
import { AppHeader } from "./components/AppHeader.jsx";
import { AssetWorkspace } from "./components/AssetWorkspace.jsx";
import { AudioExportForm } from "./components/AudioExportForm.jsx";
import { AudioLibraryWorkspace } from "./components/AudioLibraryWorkspace.jsx";
import { Modal } from "./components/Modal.jsx";
import { RecoveryWorkspace } from "./components/RecoveryWorkspace.jsx";
import { MasteringWorkspace } from "./components/MasteringWorkspace.jsx";
import { SequenceWorkspace } from "./components/SequenceWorkspace.jsx";
import { SettingsWorkspace } from "./components/SettingsWorkspace.jsx";
import { TrackReviewWorkspace } from "./components/TrackReviewWorkspace.jsx";
import { TransportBar } from "./components/TransportBar.jsx";
import { useProjectData } from "./hooks/useProjectData.js";
import { useAppearance } from "./hooks/useAppearance.js";
import { useTransport } from "./hooks/useTransport.js";
import { formatDuration, slugify } from "./lib/format.js";
import { buildImportedTracks } from "./lib/import-tracks.js";
import { api, sourceKey } from "./lib/api.js";
import { sequenceTracks } from "./lib/sequence-tracks.js";
import { createAlbumFromTemplate, saveAlbumTemplate } from "./lib/album-decisions.js";
import {
  addAlbum as addAlbumCommand,
  addBlankTrack,
  appendImportedTracks,
  renameAlbum as renameAlbumCommand,
  restoreBaselineOrder,
  selectAlbum as selectAlbumCommand,
  setTrackInSequence,
  updateAlbum,
  updateAppearance as updateAppearanceCommand,
} from "./lib/project-commands.js";
import { EditIcon, FolderIcon, MusicIcon, PlusIcon } from "./components/Icons.jsx";

function AddAlbumForm({ albums, onSubmit, onCancel }) {
  const [title, setTitle] = useState("");
  const [era, setEra] = useState("future");
  return (
    <form className="modal-form" onSubmit={(event) => { event.preventDefault(); onSubmit({ title, era }); }}>
      <label>Album title<input autoFocus required value={title} onChange={(event) => setTitle(event.target.value)} placeholder="Untitled Album" /></label>
      <label>Album era<select value={era} onChange={(event) => setEra(event.target.value)}><option value="past">Past</option><option value="current">Current</option><option value="future">Future</option></select></label>
      <p>{albums.length} albums are currently in this project.</p>
      <div className="modal-actions"><button type="button" className="text-button" onClick={onCancel}>Cancel</button><button type="submit" className="primary-button"><PlusIcon /> Add Album</button></div>
    </form>
  );
}

function RenameAlbumForm({ album, onSubmit, onCancel }) {
  const [title, setTitle] = useState(album.title);
  const normalizedTitle = title.trim();
  return (
    <form className="modal-form rename-album-form" onSubmit={(event) => { event.preventDefault(); onSubmit(normalizedTitle); }}>
      <label>Album title<input autoFocus required maxLength={120} value={title} onChange={(event) => setTitle(event.target.value)} onFocus={(event) => event.currentTarget.select()} /></label>
      <p>Only the displayed album title changes. Its permanent ID, tracks, audio references, artwork, notes, sequence, and approvals stay attached.</p>
      <dl className="rename-album-identity"><div><dt>Permanent album ID</dt><dd>{album.id}</dd></div><div><dt>Track records preserved</dt><dd>{album.tracks.length}</dd></div></dl>
      <div className="modal-actions"><button type="button" className="text-button" onClick={onCancel}>Cancel</button><button type="submit" className="primary-button" disabled={!normalizedTitle || normalizedTitle === album.title}><EditIcon /> Save New Name</button></div>
    </form>
  );
}

function AddTracksForm({ album, scanning, onChoose, onReviewPath, onAddBlank, onCancel }) {
  const [selectedPath, setSelectedPath] = useState("");
  const [blankTitle, setBlankTitle] = useState("");
  return (
    <div className="modal-form add-tracks-form">
      <p>Add tracks to <strong>{album.title}</strong>. Audio stays where it is; Project Sequencer saves only the path and your project decisions.</p>
      <div className="native-path-grid">
        <button type="button" className="native-path-field" disabled={scanning} onClick={() => onChoose("files")}>
          <MusicIcon />
          <span><strong>Audio file path</strong><small>{scanning ? "Waiting for the system picker…" : "Click to choose one or more audio files"}</small></span>
          <em>Browse</em>
        </button>
        <button type="button" className="native-path-field native-path-field--yellow" disabled={scanning} onClick={() => onChoose("folder")}>
          <FolderIcon />
          <span><strong>Audio folder path</strong><small>Click to choose a full folder</small></span>
          <em>Browse</em>
        </button>
      </div>
      <details className="manual-path-fallback">
        <summary>Enter a path manually</summary>
        <form className="inline-path-form" onSubmit={(event) => { event.preventDefault(); onReviewPath(selectedPath); }}>
          <label>Audio file or folder path<input required value={selectedPath} onChange={(event) => setSelectedPath(event.target.value)} placeholder="/Volumes/Masters/Album" /></label>
          <button type="submit" className="text-button" disabled={scanning}>Review Path</button>
        </form>
      </details>
      <div className="form-divider"><span>or add a placeholder</span></div>
      <form className="inline-path-form" onSubmit={(event) => { event.preventDefault(); onAddBlank(blankTitle); }}>
        <label>Blank track title<input required value={blankTitle} onChange={(event) => setBlankTitle(event.target.value)} placeholder="New Track" /></label>
        <button type="submit" className="text-button"><PlusIcon /> Add Blank</button>
      </form>
      <div className="modal-actions"><button type="button" className="text-button" onClick={onCancel}>Cancel</button></div>
    </div>
  );
}

function ImportTracksReview({ album, files, onSubmit, onBack }) {
  const existingKeys = new Set(album.tracks.flatMap((track) => track.candidates.map((candidate) => sourceKey(candidate.sourceRef))));
  const availableFiles = files.filter((file) => !existingKeys.has(file.key));
  const [selectedKeys, setSelectedKeys] = useState(() => new Set(availableFiles.map((file) => file.key)));
  const toggle = (key) => setSelectedKeys((current) => {
    const next = new Set(current);
    if (next.has(key)) next.delete(key);
    else next.add(key);
    return next;
  });
  return (
    <div className="modal-form import-review-form">
      <p><strong>{files.length}</strong> audio file{files.length === 1 ? "" : "s"} found. Choose which files become new tracks in <strong>{album.title}</strong>.</p>
      <div className="import-file-list">
        {files.map((file) => {
          const duplicate = existingKeys.has(file.key);
          return <label key={file.key} className={duplicate ? "is-duplicate" : ""}><input type="checkbox" disabled={duplicate} checked={!duplicate && selectedKeys.has(file.key)} onChange={() => toggle(file.key)} /><span><strong>{file.name}</strong><small>{duplicate ? "Already used in this album" : `${file.extension.toUpperCase()} · ${formatDuration(file.duration, true)}`}</small></span></label>;
        })}
        {!files.length && <div className="import-empty">No supported audio files were found at that path.</div>}
      </div>
      <p className="path-storage-note">Only source references are saved. The audio is not copied into Project Sequencer.</p>
      <div className="modal-actions"><button type="button" className="text-button" onClick={onBack}>Back</button><button type="button" className="primary-button" disabled={!selectedKeys.size} onClick={() => onSubmit([...selectedKeys])}><PlusIcon /> Add {selectedKeys.size} Track{selectedKeys.size === 1 ? "" : "s"}</button></div>
    </div>
  );
}

const downloadText = (content, filename, type) => {
  const blob = new Blob([content], { type });
  const link = document.createElement("a");
  link.href = URL.createObjectURL(blob);
  link.download = filename;
  link.click();
  URL.revokeObjectURL(link.href);
};

export default function App() {
  const project = useProjectData();
  const { appearance, resolvedMode } = useAppearance(project.state?.settings?.appearance);
  const [activeView, setActiveView] = useState("sequence");
  const [modal, setModal] = useState("");
  const [pendingImport, setPendingImport] = useState([]);
  const [resetArmed, setResetArmed] = useState(false);
  const [audioExportTrackId, setAudioExportTrackId] = useState("");
  const [audioRenderResult, setAudioRenderResult] = useState(null);
  const [audioRenderJob, setAudioRenderJob] = useState(null);
  const [audioRenderError, setAudioRenderError] = useState("");
  const [renderingAudio, setRenderingAudio] = useState(false);
  const [previewingTrackId, setPreviewingTrackId] = useState("");
  const [transitioningTrackId, setTransitioningTrackId] = useState("");
  const [previewingDecision, setPreviewingDecision] = useState("");
  const [renameAlbumId, setRenameAlbumId] = useState("");
  const [albumsCollapsed, setAlbumsCollapsed] = useState(false);
  const [layoutPreviewCollapsed, setLayoutPreviewCollapsed] = useState(false);
  const transport = useTransport({ libraryMap: project.libraryMap });

  const activeAlbum = project.state?.albums.find((album) => album.id === project.state.activeAlbumId) || project.state?.albums[0];
  const albumToRename = project.state?.albums.find((album) => album.id === renameAlbumId);
  const activeSequenceTracks = sequenceTracks(activeAlbum);
  const sequenceAlbum = activeAlbum ? { ...activeAlbum, tracks: activeSequenceTracks } : activeAlbum;
  const playableCount = activeSequenceTracks.filter((track) => transport.fileForTrack(track)).length;
  const approvalCount = activeSequenceTracks.filter((track) => ["approved", "released"].includes(track.decisionStatus) && track.masterCandidateId).length;
  const revealPrivateFilenames = Boolean(project.state?.settings?.revealPrivateFilenames);

  const updateAppearance = (patch) => project.updateState((draft) => {
    updateAppearanceCommand(draft, patch);
  });

  const onAlbumChangeById = (albumId, recipe) => project.updateState((draft) => {
    updateAlbum(draft, albumId, recipe);
  });
  const onAlbumChange = (recipe) => onAlbumChangeById(activeAlbum.id, recipe);

  const selectAlbum = (albumId) => {
    project.updateState((draft) => { selectAlbumCommand(draft, albumId); });
    transport.stop("Album changed. Ready to audition.");
    setActiveView("sequence");
    setAudioRenderResult(null);
    setAudioRenderJob(null);
  };

  const addAlbum = ({ title, era }) => {
    project.updateState((draft) => { addAlbumCommand(draft, { title, era }); });
    setModal("");
    setActiveView("sequence");
  };

  const openRenameAlbum = (albumId) => {
    setRenameAlbumId(albumId);
    setModal("rename-album");
  };

  const closeRenameAlbum = () => {
    setRenameAlbumId("");
    setModal("");
  };

  const renameAlbum = (title) => {
    const previousTitle = albumToRename?.title || "Album";
    project.updateState((draft) => { renameAlbumCommand(draft, renameAlbumId, title); });
    transport.setStatus(`${previousTitle} renamed to ${title}. Album identity and attached records were preserved.`);
    closeRenameAlbum();
  };

  const addTrack = (title) => {
    onAlbumChange((draft) => { addBlankTrack(draft, title); });
    setModal("");
  };

  const reviewImportResult = (result) => {
    if (!result?.ok || result.cancelled) return;
    setPendingImport(result.files);
    setModal("import-review");
  };

  const chooseTrackSources = async (kind) => reviewImportResult(await project.chooseSources(kind));
  const reviewPath = async (selectedPath) => reviewImportResult(await project.registerSource({ path: selectedPath }));
  const addImportedTracks = (selectedKeys) => {
    const selectedKeySet = new Set(selectedKeys);
    const selectedFiles = pendingImport.filter((file) => selectedKeySet.has(file.key));
    const result = buildImportedTracks(activeAlbum.tracks, selectedFiles);
    if (!result.tracks.length) {
      transport.setStatus("No new tracks were added; those sources are already in this album.");
      return;
    }
    onAlbumChange((draft) => {
      appendImportedTracks(draft, result);
    });
    transport.setStatus(`${result.tracks.length} track${result.tracks.length === 1 ? "" : "s"} added from source paths${result.skipped ? `; ${result.skipped} duplicate skipped` : ""}.`);
    setPendingImport([]);
    setModal("");
  };

  const resetOrder = () => {
    if (!resetArmed) {
      setResetArmed(true);
      transport.setStatus("Press Confirm Reset to restore the original album order.");
      window.setTimeout(() => setResetArmed(false), 5000);
      return;
    }
    onAlbumChange((draft) => {
      restoreBaselineOrder(draft);
    });
    setResetArmed(false);
    transport.setStatus("Original album order restored. The change is saved locally.");
  };

  const removeTrackFromSequence = (trackId, title) => {
    onAlbumChange((draft) => { setTrackInSequence(draft, trackId, false); });
    transport.stop(`${title} removed from the working sequence. Its track record and attachments are preserved.`);
  };

  const restoreTrackToSequence = (trackId, title) => {
    onAlbumChange((draft) => { setTrackInSequence(draft, trackId, true); });
    transport.setStatus(`${title} restored to the working sequence.`);
  };

  const previewMasteringEdit = async (trackId, previewPart) => {
    const track = activeAlbum.tracks.find((item) => item.id === trackId);
    if (!track) return;
    setPreviewingTrackId(trackId);
    project.setError("");
    transport.setStatus(`Printing a short ${previewPart} preview for ${track.title}…`);
    try {
      const result = await api.renderAudio({ album: activeAlbum, scope: "preview", trackId, format: "mp3", previewPart });
      transport.previewRendered(result.audioUrl, `${track.title} — edited ${previewPart}`);
    } catch (reason) {
      project.setError(reason.message);
      transport.setStatus("The edit preview could not be printed.");
    } finally {
      setPreviewingTrackId("");
    }
  };

  const previewSequenceTransition = async (trackIndex) => {
    const track = activeSequenceTracks[trackIndex];
    const nextTrack = activeSequenceTracks[trackIndex + 1];
    if (!track || !nextTrack || !transport.fileForTrack(track) || !transport.fileForTrack(nextTrack)) {
      transport.setStatus("Both adjacent tracks need audition sources for a transition preview.");
      return;
    }
    setTransitioningTrackId(track.id);
    project.setError("");
    transport.setStatus(`Preparing ${track.title} into ${nextTrack.title}…`);
    try {
      const result = await api.renderAudio({ album: sequenceAlbum, scope: "preview", trackId: track.id, format: "mp3", previewPart: "transition" });
      transport.previewRendered(result.audioUrl, `${track.title} → ${nextTrack.title}`, {
        albumTitle: activeAlbum.title,
        status: `Playing the transition and continuing through ${nextTrack.title}.`,
        completionStatus: `Transition through ${nextTrack.title} complete.`,
      });
    } catch (reason) {
      project.setError(reason.message);
      transport.setStatus("The transition preview could not be prepared.");
    } finally {
      setTransitioningTrackId("");
    }
  };

  const previewTransitionVariant = async (pair, name, variant) => {
    const previewAlbum = structuredClone(activeAlbum);
    const fromTrack = previewAlbum.tracks.find((track) => track.id === pair.from.id);
    if (!fromTrack) return;
    fromTrack.mastering = {
      ...(fromTrack.mastering || {}),
      endMode: variant.endMode,
      endDuration: variant.duration,
      gapAfter: variant.endMode === "crossfade" ? 0 : variant.gapAfter,
    };
    setPreviewingDecision(`transition-${name}`);
    project.setError("");
    try {
      const result = await api.renderAudio({ album: previewAlbum, scope: "preview", trackId: pair.from.id, format: "mp3", previewPart: "transition" });
      transport.previewRendered(result.audioUrl, `${pair.from.title} → ${pair.to.title} · Variant ${name}`, { status: `Playing non-destructive transition variant ${name}.` });
    } catch (reason) {
      project.setError(reason.message);
    } finally {
      setPreviewingDecision("");
    }
  };

  const previewComparisonCandidate = async (track, candidate) => {
    const key = `${track.id}-${candidate.id}`;
    setPreviewingDecision(key);
    project.setError("");
    try {
      const result = await api.renderAudio({ album: activeAlbum, scope: "comparison", trackId: track.id, candidateId: candidate.id, format: "mp3" });
      transport.previewRendered(result.audioUrl, `${track.title} · ${candidate.label} · matched derivative`, { status: result.derivativeLabel || "Playing a loudness-matched preview derivative." });
    } catch (reason) {
      project.setError(reason.message);
    } finally {
      setPreviewingDecision("");
    }
  };

  const saveTemplate = (name) => {
    project.updateState((draft) => { saveAlbumTemplate(draft, activeAlbum, name); });
    transport.setStatus("Album structure saved as a media-free, approval-free template.");
  };

  const createFromTemplate = (templateId, title) => {
    project.updateState((draft) => { createAlbumFromTemplate(draft, templateId, title); });
    transport.stop(`${title} created from structure only. No media or approvals were copied.`);
    setActiveView("decisions");
  };

  const openAudioExport = (trackId = "") => {
    setAudioExportTrackId(trackId);
    setAudioRenderResult(null);
    setAudioRenderJob(null);
    setAudioRenderError("");
    setModal("audio-export");
  };

  const renderMasteringAudio = async (details) => {
    setRenderingAudio(true);
    setAudioRenderError("");
    try {
      const { job } = await api.startRenderJob({ album: activeAlbum, ...details });
      setAudioRenderJob(job);
      const result = await api.waitForRenderJob(job.id, { onUpdate: setAudioRenderJob });
      setAudioRenderResult(result);
      transport.setStatus(`${result.format.toUpperCase()} audio print complete.`);
    } catch (reason) {
      setAudioRenderError(reason.message);
    } finally {
      setRenderingAudio(false);
    }
  };

  const cancelAudioRender = async () => {
    if (!audioRenderJob?.id) return;
    try {
      const { job } = await api.cancelRenderJob(audioRenderJob.id);
      setAudioRenderJob(job);
      transport.setStatus("Cancelling the audio print and removing partial output…");
    } catch (reason) {
      setAudioRenderError(reason.message);
    }
  };

  const exportSequence = () => {
    const total = activeSequenceTracks.reduce((sum, track) => sum + (transport.fileForTrack(track)?.duration || 0), 0);
    const lines = [
      `# ${activeAlbum.artist} — ${activeAlbum.title}`,
      "",
      `Exported from Project Sequencer: ${new Date().toISOString()}`,
      `Order approval: ${activeAlbum.orderApproved ? "approved" : "working / not approved"}`,
      `Playable runtime: ${formatDuration(total)}`,
      "",
      "## Sequence",
      "",
    ];
    activeSequenceTracks.forEach((track, index) => {
      const candidate = track.candidates.find((item) => item.id === track.auditionCandidateId);
      const file = transport.fileForTrack(track);
      lines.push(`${index + 1}. ${track.title} — ${file ? formatDuration(file.duration) : "NO AUDIO"}`);
      lines.push(`   - Audition source: ${track.privacy === "protected" ? candidate?.label || "private source" : file?.name || "missing"}`);
      lines.push(`   - Master decision: ${track.decisionStatus}${track.masterCandidateId ? ` / ${track.masterCandidateId}` : " / none"}`);
    });
    downloadText(`${lines.join("\n")}\n`, `${slugify(activeAlbum.title)}-sequence-${new Date().toISOString().slice(0, 10)}.md`, "text/markdown;charset=utf-8");
    transport.setStatus("Working sequence exported.");
  };

  const importState = async (nextState) => {
    if (!nextState || typeof nextState !== "object" || !Array.isArray(nextState.albums)) {
      project.setError("That file is not a recognizable Project Sequencer project.");
      return false;
    }
    return project.replaceState(nextState);
  };

  const exportPortableBundle = async () => {
    project.setError("");
    try {
      const bundle = await api.portableBundle();
      downloadText(`${JSON.stringify(bundle, null, 2)}\n`, `project-sequencer-portable-${new Date().toISOString().slice(0, 10)}.json`, "application/json");
      transport.setStatus("Portable JSON/checksum bundle created. No media was copied.");
    } catch (reason) {
      project.setError(reason.message);
    }
  };

  if (project.loading) return <div className="loading-screen"><span className="loading-wave" /> <strong>Indexing Project Sequencer…</strong><small>Audio stays in its original location.</small></div>;
  if (project.recovery?.required) return <RecoveryWorkspace recovery={project.recovery} error={project.error} onRestore={project.restoreRecovery} />;
  if (!project.state || !activeAlbum) return <div className="loading-screen is-error"><strong>Project Sequencer could not open.</strong><small>{project.error || "No album data was found."}</small></div>;

  return (
    <div className={`app-shell ${albumsCollapsed ? "albums-collapsed" : ""}`}>
      <AppHeader activeView={activeView} onViewChange={setActiveView} album={sequenceAlbum} playableCount={playableCount} approvalCount={approvalCount} appearance={appearance} resolvedMode={resolvedMode} onAppearanceChange={updateAppearance} onOpenAppearance={() => setActiveView("settings")} commandHistory={project.commandHistory} />
      <AlbumRail albums={project.state.albums} activeAlbumId={activeAlbum.id} collapsed={albumsCollapsed} onToggle={() => setAlbumsCollapsed((current) => !current)} onSelectAlbum={selectAlbum} onAddAlbum={() => setModal("album")} onRenameAlbum={openRenameAlbum} />
      <div className="content-shell">
        {project.error && <div className="error-banner" role="alert"><strong>Project warning</strong><span>{project.error}</span><button type="button" onClick={() => project.setError("")}>Dismiss</button></div>}
        {activeView === "sequence" && <SequenceWorkspace album={activeAlbum} libraryMap={project.libraryMap} revealPrivateFilenames={revealPrivateFilenames} transitioningTrackId={transitioningTrackId} layoutPreviewCollapsed={layoutPreviewCollapsed} onToggleLayoutPreview={() => setLayoutPreviewCollapsed((current) => !current)} onAlbumChange={onAlbumChange} onAddTracks={() => setModal("tracks")} onPlayFrom={(index) => transport.playSequence(sequenceAlbum, index)} onTransition={previewSequenceTransition} onExport={exportSequence} onRemoveFromSequence={removeTrackFromSequence} onRestoreToSequence={restoreTrackToSequence} />}
        {activeView === "review" && <TrackReviewWorkspace album={activeAlbum} libraryMap={project.libraryMap} revealPrivateFilenames={revealPrivateFilenames} onAlbumChange={onAlbumChange} onPreviewFile={transport.previewFile} onOpenLibrary={() => setActiveView("library")} />}
        {activeView === "decisions" && <AlbumDecisionsWorkspace album={activeAlbum} templates={project.state.albumTemplates || []} libraryMap={project.libraryMap} onAlbumChange={onAlbumChange} onSaveTemplate={saveTemplate} onCreateFromTemplate={createFromTemplate} onPreviewTransition={previewTransitionVariant} onPreviewComparison={previewComparisonCandidate} previewingDecision={previewingDecision} />}
        {activeView === "mastering" && <MasteringWorkspace album={activeAlbum} libraryMap={project.libraryMap} onAlbumChange={onAlbumChange} onPreview={previewMasteringEdit} previewingTrackId={previewingTrackId} onOpenExport={openAudioExport} onPreviewChapter={(index) => transport.previewChapter(sequenceAlbum, index)} />}
        {activeView === "assets" && <AssetWorkspace album={activeAlbum} revealPrivateFilenames={revealPrivateFilenames} picking={project.pickingAssets} onAlbumChange={onAlbumChange} onPickAssets={project.chooseProjectAssets} />}
        {activeView === "library" && <AudioLibraryWorkspace state={project.state} activeAlbum={activeAlbum} library={project.library} roots={project.roots} formats={project.formats} scan={project.scan} watching={project.watching} revealPrivateFilenames={revealPrivateFilenames} scanning={project.scanning} onRescan={project.rescan} onPreviewFile={transport.previewFile} onProjectChange={project.updateState} onAlbumChangeById={onAlbumChangeById} onImportFiles={() => chooseTrackSources("files")} onImportFolder={() => chooseTrackSources("folder")} />}
        {activeView === "settings" && <SettingsWorkspace state={project.state} roots={project.roots} scan={project.scan} watching={project.watching} scanning={project.scanning} revealPrivateFilenames={revealPrivateFilenames} appearance={appearance} resolvedMode={resolvedMode} onAppearanceChange={updateAppearance} onTogglePrivate={(checked) => project.updateState((draft) => { draft.settings ||= {}; draft.settings.revealPrivateFilenames = checked; })} onAddRoot={project.addRoot} onRemoveRoot={project.removeRoot} onChooseSources={project.chooseSources} onRescan={project.rescan} onImportState={importState} onExportBundle={exportPortableBundle} />}
      </div>
      <TransportBar audioRef={transport.audioRef} current={transport.current} status={transport.status} activeAlbum={sequenceAlbum} resetArmed={resetArmed} onPlaySequence={() => transport.playSequence(sequenceAlbum)} onResetOrder={resetOrder} onExport={exportSequence} />
      <div className="status-strip"><span role="status" aria-live="polite">{project.saveStatus}</span><span>{project.library.length} audio files indexed · {project.roots.length} configured path{project.roots.length === 1 ? "" : "s"}</span><strong>Local mode</strong></div>
      {modal === "album" && <Modal title="Add Album" onClose={() => setModal("")}><AddAlbumForm albums={project.state.albums} onSubmit={addAlbum} onCancel={() => setModal("")} /></Modal>}
      {modal === "rename-album" && albumToRename && <Modal title="Rename Album" onClose={closeRenameAlbum}><RenameAlbumForm key={albumToRename.id} album={albumToRename} onSubmit={renameAlbum} onCancel={closeRenameAlbum} /></Modal>}
      {modal === "tracks" && <Modal title="Add Tracks" onClose={() => setModal("")}><AddTracksForm album={activeAlbum} scanning={project.scanning} onChoose={chooseTrackSources} onReviewPath={reviewPath} onAddBlank={addTrack} onCancel={() => setModal("")} /></Modal>}
      {modal === "import-review" && <Modal title="Review Tracks" className="modal--wide" onClose={() => setModal("")}><ImportTracksReview key={pendingImport.map((file) => file.key).join("|")} album={activeAlbum} files={pendingImport} onSubmit={addImportedTracks} onBack={() => setModal("tracks")} /></Modal>}
      {modal === "audio-export" && <Modal title="Print / Export Audio" className="modal--wide" onClose={() => { if (!renderingAudio) setModal(""); }}><AudioExportForm album={activeAlbum} selectedTrack={activeAlbum.tracks.find((track) => track.id === audioExportTrackId)} deliveryProfileId={activeAlbum.delivery?.profileId || ""} rendering={renderingAudio} renderJob={audioRenderJob} error={audioRenderError} result={audioRenderResult} onRender={renderMasteringAudio} onCancelRender={cancelAudioRender} onClear={() => { setAudioRenderResult(null); setAudioRenderJob(null); setAudioRenderError(""); }} onCancel={() => setModal("")} /></Modal>}
    </div>
  );
}
