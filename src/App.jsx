import React, { useEffect, useMemo, useState } from "react";
import { AlbumRail } from "./components/AlbumRail.jsx";
import { AlbumDecisionsWorkspace } from "./components/AlbumDecisionsWorkspace.jsx";
import { AppHeader } from "./components/AppHeader.jsx";
import { AssetWorkspace } from "./components/AssetWorkspace.jsx";
import { AudioExportForm } from "./components/AudioExportForm.jsx";
import { AudioLibraryWorkspace } from "./components/AudioLibraryWorkspace.jsx";
import { FirstRunGuide } from "./components/FirstRunGuide.jsx";
import { Modal } from "./components/Modal.jsx";
import { ProjectIdentityForm } from "./components/ProjectIdentityForm.jsx";
import { NewProjectForm, SavedProjects } from "./components/ProjectLibrary.jsx";
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
import { shouldShowFirstRunGuide } from "./lib/first-run.js";
import { activeMasteringProcessors } from "./lib/live-mastering.js";
import {
  deleteMasteringPreset as deleteMasteringPresetCommand,
  loadMasteringPreset as loadMasteringPresetCommand,
  masteringPresetLibrary,
  saveMasteringPreset as saveMasteringPresetCommand,
} from "./lib/mastering-presets.js";
import { createAlbumFromTemplate, saveAlbumTemplate } from "./lib/album-decisions.js";
import {
  addAlbum as addAlbumCommand,
  addBlankTrack,
  appendImportedTracks,
  deleteAlbum as deleteAlbumCommand,
  projectArtistName as projectArtistNameCommand,
  renameAlbum as renameAlbumCommand,
  restoreBaselineOrder,
  selectAlbum as selectAlbumCommand,
  setTrackInSequence,
  updateAlbum,
  updateAppearance as updateAppearanceCommand,
  updateProjectIdentity as updateProjectIdentityCommand,
} from "./lib/project-commands.js";
import { EditIcon, FolderIcon, MusicIcon, PlusIcon, TrashIcon } from "./components/Icons.jsx";

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

function DeleteAlbumForm({ album, onSubmit, onCancel }) {
  const candidateCount = album.tracks.reduce((total, track) => total + track.candidates.length, 0);
  return (
    <div className="modal-form delete-album-form">
      <p><strong>{album.title}</strong> and its Project Sequencer records will be permanently removed from this project.</p>
      <dl className="rename-album-identity"><div><dt>Track records</dt><dd>{album.tracks.length}</dd></div><div><dt>Audio candidates referenced</dt><dd>{candidateCount}</dd></div></dl>
      <p className="deletion-safety-note">Indexed audio, artwork, lyric files, and rendered exports stay exactly where they are. Only this album’s saved decisions and references are deleted.</p>
      <div className="modal-actions"><button type="button" className="text-button" onClick={onCancel}>Cancel</button><button type="button" className="primary-button primary-button--danger" onClick={onSubmit}><TrashIcon /> Delete Album</button></div>
    </div>
  );
}

function AddTracksForm({ album, scanning, onlineApp = false, onChoose, onReviewPath, onAddBlank, onCancel }) {
  const [selectedPath, setSelectedPath] = useState("");
  const [blankTitle, setBlankTitle] = useState("");
  return (
    <div className="modal-form add-tracks-form">
      <p>Add tracks to <strong>{album.title}</strong>. Audio stays where it is; Project Sequencer saves only the path and your project decisions.</p>
      {onlineApp && <p className="online-privacy-note"><strong>Device audio stays private:</strong> choose files or a folder for this browser session. Audio plays directly from your device and is never uploaded.</p>}
      <div className="native-path-grid">
        <button type="button" className="native-path-field" disabled={scanning} onClick={() => onChoose("files")}>
          <MusicIcon />
          <span><strong>{onlineApp ? "Audio files" : "Audio file path"}</strong><small>{scanning ? "Waiting for the system picker…" : "Click to choose one or more audio files"}</small></span>
          <em>Browse</em>
        </button>
        <button type="button" className="native-path-field native-path-field--yellow" disabled={scanning} onClick={() => onChoose("folder")}>
          <FolderIcon />
          <span><strong>{onlineApp ? "Audio folder" : "Audio folder path"}</strong><small>Click to choose a full folder</small></span>
          <em>Browse</em>
        </button>
      </div>
      {!onlineApp && <details className="manual-path-fallback">
        <summary>Enter a path manually</summary>
        <form className="inline-path-form" onSubmit={(event) => { event.preventDefault(); onReviewPath(selectedPath); }}>
          <label>Audio file or folder path<input required value={selectedPath} onChange={(event) => setSelectedPath(event.target.value)} placeholder="/Volumes/Masters/Album" /></label>
          <button type="submit" className="text-button" disabled={scanning}>Review Path</button>
        </form>
      </details>}
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

const isTextEntryTarget = (target) => {
  if (typeof Element === "undefined" || !(target instanceof Element)) return false;
  return Boolean(target.closest("input, textarea, select, [contenteditable='true'], [role='textbox']"));
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
  const [deleteAlbumId, setDeleteAlbumId] = useState("");
  const [albumsCollapsed, setAlbumsCollapsed] = useState(false);
  const [masteringTrackId, setMasteringTrackId] = useState("");
  const [firstRunDismissed, setFirstRunDismissed] = useState(false);
  const configuredArtistName = projectArtistNameCommand(project.state);
  const activeAlbumRecord = project.state?.albums.find((album) => album.id === project.state.activeAlbumId) || project.state?.albums[0];
  const activeAlbum = activeAlbumRecord ? { ...activeAlbumRecord, artist: configuredArtistName } : activeAlbumRecord;
  const transport = useTransport({ libraryMap: project.libraryMap, masterBus: activeAlbumRecord?.masterBus, liveTracks: activeAlbumRecord?.tracks || [] });
  const albumToRename = project.state?.albums.find((album) => album.id === renameAlbumId);
  const albumToDelete = project.state?.albums.find((album) => album.id === deleteAlbumId);
  const currentProject = project.projects.find((item) => item.id === project.activeProjectId);
  const activeSequenceTracks = sequenceTracks(activeAlbum);
  const sequenceAlbum = activeAlbum ? { ...activeAlbum, tracks: activeSequenceTracks } : activeAlbum;
  const playableCount = activeSequenceTracks.filter((track) => transport.fileForTrack(track)).length;
  const approvalCount = activeSequenceTracks.filter((track) => ["approved", "released"].includes(track.decisionStatus) && track.masterCandidateId).length;
  const revealPrivateFilenames = Boolean(project.state?.settings?.revealPrivateFilenames);
  const protectedSourceKeys = useMemo(() => new Set(project.state?.albums.flatMap((album) => album.tracks.flatMap((track) => track.privacy === "protected" ? track.candidates.map((candidate) => sourceKey(candidate.sourceRef)) : [])) || []), [project.state?.albums]);
  const currentTransportTrack = transport.current?.track;
  const defaultTransportIndex = activeSequenceTracks.findIndex((track) => transport.fileForTrack(track));
  const defaultTransportTrack = defaultTransportIndex >= 0 ? activeSequenceTracks[defaultTransportIndex] : null;
  const focusedMasteringTrack = activeView === "mastering" ? activeSequenceTracks.find((track) => track.id === masteringTrackId) : null;
  const transportTrack = currentTransportTrack || focusedMasteringTrack || defaultTransportTrack;
  const transportTrackIndex = transportTrack ? activeSequenceTracks.findIndex((track) => track.id === transportTrack.id) : -1;
  const nextTransportTrack = transportTrackIndex >= 0
    ? activeSequenceTracks.slice(transportTrackIndex + 1).find((track) => transport.fileForTrack(track))
    : null;
  const standaloneCurrentSource = Boolean(transport.current && !currentTransportTrack);
  const transportVisual = {
    file: transport.current?.file || (transportTrack ? transport.fileForTrack(transportTrack) : null),
    trackTitle: transport.current?.trackTitle || transportTrack?.title || "No playable source",
    mastering: standaloneCurrentSource ? {} : transportTrack?.mastering || {},
    nextTrackTitle: standaloneCurrentSource ? "" : transport.current?.nextTrackTitle || nextTransportTrack?.title || "",
  };
  const liveProcessors = activeMasteringProcessors(activeAlbum?.masterBus);
  const liveMasteringLabel = transport.current?.referenceTrack
    ? "B · clean reference · MASTER bypassed"
    : transport.current?.renderedPreview
    ? "Rendered MASTER preview"
    : transport.current?.masteringComparison?.channel === "A"
      ? `A · current master · ${transport.liveMasteringAvailable === false ? "MASTER unavailable" : "MASTER live"}${liveProcessors.length ? ` · ${liveProcessors.join(" / ")}` : " · neutral pass-through"}`
    : transport.current?.track && liveProcessors.length
      ? `${transport.liveMasteringAvailable === false ? "MASTER unavailable" : "MASTER live"} · ${liveProcessors.join(" / ")}`
      : "";
  const masterMonitorLabel = transport.current?.referenceTrack
    ? "B · clean reference · MASTER bypassed"
    : transport.current?.renderedPreview
    ? "Rendered MASTER preview"
    : transport.current?.masteringComparison?.channel === "A"
      ? `A · current master · ${transport.liveMasteringAvailable === false ? "MASTER unavailable" : "MASTER live"} · ${liveProcessors.length ? liveProcessors.join(" / ") : "neutral pass-through"}`
    : transport.current?.track
      ? `${transport.liveMasteringAvailable === false ? "MASTER unavailable" : "MASTER live"} · ${liveProcessors.length ? liveProcessors.join(" / ") : "neutral pass-through"}`
      : transport.current
        ? "Output monitor · source bypass"
        : "";
  const firstRunEnvironment = shouldShowFirstRunGuide({ roots: project.roots, library: project.library });
  const showFirstRunGuide = firstRunEnvironment && !firstRunDismissed;

  useEffect(() => {
    const toggleTransportWithSpace = (event) => {
      if ((event.code !== "Space" && event.key !== " ") || event.repeat || event.isComposing) return;
      if (event.altKey || event.ctrlKey || event.metaKey || isTextEntryTarget(event.target)) return;
      event.preventDefault();
      if (transport.current) transport.togglePlayback();
      else if (sequenceAlbum?.tracks.length) transport.playSequence(sequenceAlbum);
    };
    window.addEventListener("keydown", toggleTransportWithSpace, { capture: true });
    return () => window.removeEventListener("keydown", toggleTransportWithSpace, { capture: true });
  }, [sequenceAlbum, transport.current, transport.playSequence, transport.togglePlayback]);

  const updateAppearance = (patch) => project.updateState((draft) => {
    updateAppearanceCommand(draft, patch);
  });

  const saveProjectIdentity = (artistName) => {
    project.updateState((draft) => {
      updateProjectIdentityCommand(draft, { artistName, setupComplete: true });
    });
    transport.setStatus(`Project artist set to ${artistName}. Album layouts and exports now use this identity.`);
  };

  const onAlbumChangeById = (albumId, recipe) => project.updateState((draft) => {
    updateAlbum(draft, albumId, recipe);
  });
  const onAlbumChange = (recipe) => onAlbumChangeById(activeAlbum.id, recipe);

  const masteringPresets = masteringPresetLibrary(project.state?.masteringPresets);
  const saveMasteringPreset = (type, name) => project.updateState((draft) => {
    const album = draft.albums.find((item) => item.id === activeAlbum.id);
    if (album) saveMasteringPresetCommand(draft, type, name, album.masterBus);
  }, `Save ${type} mastering preset`);
  const loadMasteringPreset = (type, presetId) => project.updateState((draft) => {
    loadMasteringPresetCommand(draft, activeAlbum.id, type, presetId);
  }, `Load ${type} mastering preset`);
  const deleteMasteringPreset = (type, presetId) => project.updateState((draft) => {
    deleteMasteringPresetCommand(draft, type, presetId);
  }, `Delete ${type} mastering preset`);

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

  const openDeleteAlbum = (albumId) => {
    if (project.state.albums.length <= 1) return;
    setDeleteAlbumId(albumId);
    setModal("delete-album");
  };

  const closeDeleteAlbum = () => {
    setDeleteAlbumId("");
    setModal("");
  };

  const deleteAlbum = () => {
    const title = albumToDelete?.title || "Album";
    project.updateState((draft) => { deleteAlbumCommand(draft, deleteAlbumId); });
    transport.stop(`${title} deleted from this project. Indexed source files were not changed.`);
    setActiveView("sequence");
    setAudioRenderResult(null);
    setAudioRenderJob(null);
    closeDeleteAlbum();
  };

  const resetAfterProjectSwitch = () => {
    transport.stop("Project changed. Ready to audition.");
    setActiveView("sequence");
    setPendingImport([]);
    setAudioRenderResult(null);
    setAudioRenderJob(null);
    setRenameAlbumId("");
    setDeleteAlbumId("");
    setFirstRunDismissed(true);
  };

  const createProject = async (details) => {
    if (await project.createProject(details)) {
      resetAfterProjectSwitch();
      setModal("");
    }
  };

  const loadProject = async (projectId) => {
    if (await project.loadProject(projectId)) {
      resetAfterProjectSwitch();
      setModal("");
    }
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
      const trackIndex = activeSequenceTracks.findIndex((item) => item.id === track.id);
      const nextPlayableTrack = activeSequenceTracks.slice(trackIndex + 1).find((item) => transport.fileForTrack(item));
      transport.previewRendered(result.audioUrl, `${track.title} — edited ${previewPart}`, {
        file: transport.fileForTrack(track),
        track,
        nextTrackTitle: nextPlayableTrack?.title || "",
      });
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
        file: transport.fileForTrack(track),
        track,
        nextTrackTitle: nextTrack.title,
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
      if (/cancelled/i.test(reason.message)) transport.setStatus("Audio print cancelled. Partial output was removed.");
      else setAudioRenderError(reason.message);
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
      <AlbumRail albums={project.state.albums} activeAlbumId={activeAlbum.id} currentProject={currentProject} collapsed={albumsCollapsed} projectBusy={project.projectOperation} onToggle={() => setAlbumsCollapsed((current) => !current)} onSelectAlbum={selectAlbum} onAddAlbum={() => setModal("album")} onRenameAlbum={openRenameAlbum} onDeleteAlbum={openDeleteAlbum} onOpenProjects={() => setModal("projects")} onNewProject={() => setModal("new-project")} />
      <div className="content-shell">
        {project.error && <div className="error-banner" role="alert"><strong>Project warning</strong><span>{project.error}</span><button type="button" onClick={() => project.setError("")}>Dismiss</button></div>}
        {activeView === "sequence" && <SequenceWorkspace album={activeAlbum} libraryMap={project.libraryMap} revealPrivateFilenames={revealPrivateFilenames} transitioningTrackId={transitioningTrackId} currentTrackId={currentTransportTrack?.id} playing={transport.playing} renderingAvailable={!api.onlineApp} onAlbumChange={onAlbumChange} onAddTracks={() => setModal("tracks")} onPlayFrom={(index) => transport.playSequence(sequenceAlbum, index)} onTogglePlayback={transport.togglePlayback} onTransition={previewSequenceTransition} onExport={exportSequence} onRemoveFromSequence={removeTrackFromSequence} onRestoreToSequence={restoreTrackToSequence} />}
        {activeView === "review" && <TrackReviewWorkspace album={activeAlbum} libraryMap={project.libraryMap} revealPrivateFilenames={revealPrivateFilenames} onAlbumChange={onAlbumChange} onPreviewFile={transport.previewFile} onOpenLibrary={() => setActiveView("library")} />}
        {activeView === "decisions" && <AlbumDecisionsWorkspace album={activeAlbum} templates={project.state.albumTemplates || []} libraryMap={project.libraryMap} renderingAvailable={!api.onlineApp} onAlbumChange={onAlbumChange} onSaveTemplate={saveTemplate} onCreateFromTemplate={createFromTemplate} onPreviewTransition={previewTransitionVariant} onPreviewComparison={previewComparisonCandidate} previewingDecision={previewingDecision} />}
        {activeView === "mastering" && <MasteringWorkspace album={activeAlbum} libraryMap={project.libraryMap} presets={masteringPresets} renderingAvailable={!api.onlineApp} revealPrivateFilenames={revealPrivateFilenames} protectedSourceKeys={protectedSourceKeys} activeComparison={transport.current?.masteringComparison} onAlbumChange={onAlbumChange} onPreview={previewMasteringEdit} onReferenceCompare={transport.previewMasteringComparison} previewingTrackId={previewingTrackId} onOpenExport={openAudioExport} onTrackFocus={setMasteringTrackId} onPreviewChapter={(index) => transport.previewChapter(sequenceAlbum, index)} onSavePreset={saveMasteringPreset} onLoadPreset={loadMasteringPreset} onDeletePreset={deleteMasteringPreset} meteringRef={transport.meteringRef} meteringAvailable={transport.liveMasteringAvailable} playing={transport.playing} monitorLabel={masterMonitorLabel} />}
        {activeView === "assets" && <AssetWorkspace album={activeAlbum} revealPrivateFilenames={revealPrivateFilenames} picking={project.pickingAssets} sourcePickingAvailable={!api.onlineApp} onAlbumChange={onAlbumChange} onPickAssets={project.chooseProjectAssets} />}
        {activeView === "library" && <AudioLibraryWorkspace state={project.state} activeAlbum={activeAlbum} library={project.library} roots={project.roots} formats={project.formats} scan={project.scan} watching={project.watching} onlineApp={api.onlineApp} revealPrivateFilenames={revealPrivateFilenames} scanning={project.scanning} onRescan={project.rescan} onPreviewFile={transport.previewFile} onProjectChange={project.updateState} onAlbumChangeById={onAlbumChangeById} onImportFiles={() => chooseTrackSources("files")} onImportFolder={() => chooseTrackSources("folder")} />}
        {activeView === "settings" && <SettingsWorkspace state={project.state} roots={project.roots} scan={project.scan} watching={project.watching} scanning={project.scanning} onlineApp={api.onlineApp} projectArtistName={configuredArtistName} currentProject={currentProject} projects={project.projects} projectBusy={project.projectOperation} revealPrivateFilenames={revealPrivateFilenames} appearance={appearance} resolvedMode={resolvedMode} onProjectIdentityChange={saveProjectIdentity} onAppearanceChange={updateAppearance} onTogglePrivate={(checked) => project.updateState((draft) => { draft.settings ||= {}; draft.settings.revealPrivateFilenames = checked; })} onAddRoot={project.addRoot} onRemoveRoot={project.removeRoot} onChooseSources={project.chooseSources} onRescan={project.rescan} onImportState={importState} onOpenProjects={() => setModal("projects")} onNewProject={() => setModal("new-project")} onExportBundle={exportPortableBundle} />}
      </div>
      <TransportBar audioRef={transport.audioRef} audioHandlers={transport.audioHandlers} current={transport.current} status={transport.status} activeAlbum={sequenceAlbum} visual={transportVisual} playing={transport.playing} currentTime={transport.currentTime} mediaDuration={transport.mediaDuration} liveMasteringLabel={liveMasteringLabel} resetArmed={resetArmed} onTogglePlayback={transport.togglePlayback} onSeek={transport.seek} onPlaySequence={() => transport.playSequence(sequenceAlbum)} onResetOrder={resetOrder} onExport={exportSequence} />
      <div className="status-strip"><span role="status" aria-live="polite">{project.saveStatus}</span><span>{api.onlineApp ? `${project.library.length} audio files available · changes stay in this browser` : `${project.library.length} audio files indexed · ${project.roots.length} configured path${project.roots.length === 1 ? "" : "s"}`}</span></div>
      {showFirstRunGuide && (
        <FirstRunGuide
          artistName={configuredArtistName}
          setupComplete={project.state.settings.project.setupComplete}
          scanning={project.scanning}
          onSaveIdentity={saveProjectIdentity}
          onChooseSources={chooseTrackSources}
          onCreateAlbum={() => { setFirstRunDismissed(true); setModal("album"); }}
          onExplore={() => setFirstRunDismissed(true)}
        />
      )}
      {!showFirstRunGuide && !project.state.settings.project.setupComplete && (
        <Modal title="Start a New Project" className="modal--project-setup" dismissible={false} onClose={() => {}}>
          <div className="project-setup-intro"><strong>Make this sequencing workspace yours.</strong><p>Set the artist once for the entire project. You can change it later under Settings → Project.</p></div>
          <ProjectIdentityForm artistName={configuredArtistName} setup onSubmit={saveProjectIdentity} />
        </Modal>
      )}
      {modal === "album" && <Modal title="Add Album" onClose={() => setModal("")}><AddAlbumForm albums={project.state.albums} onSubmit={addAlbum} onCancel={() => setModal("")} /></Modal>}
      {modal === "rename-album" && albumToRename && <Modal title="Rename Album" onClose={closeRenameAlbum}><RenameAlbumForm key={albumToRename.id} album={albumToRename} onSubmit={renameAlbum} onCancel={closeRenameAlbum} /></Modal>}
      {modal === "delete-album" && albumToDelete && <Modal title="Delete Album" onClose={closeDeleteAlbum}><DeleteAlbumForm key={albumToDelete.id} album={albumToDelete} onSubmit={deleteAlbum} onCancel={closeDeleteAlbum} /></Modal>}
      {modal === "projects" && <Modal title="Saved Projects" className="modal--wide" onClose={() => setModal("")} dismissible={!project.projectOperation}><SavedProjects projects={project.projects} busy={project.projectOperation} onLoad={loadProject} onNewProject={() => setModal("new-project")} onCancel={() => setModal("")} /></Modal>}
      {modal === "new-project" && <Modal title="Start a Fresh Project" onClose={() => setModal("")} dismissible={!project.projectOperation}><NewProjectForm defaultArtistName={configuredArtistName === "Untitled Artist" ? "" : configuredArtistName} busy={project.projectOperation} onSubmit={createProject} onCancel={() => setModal("")} /></Modal>}
      {modal === "tracks" && <Modal title="Add Tracks" onClose={() => setModal("")}><AddTracksForm album={activeAlbum} scanning={project.scanning} onlineApp={api.onlineApp} onChoose={chooseTrackSources} onReviewPath={reviewPath} onAddBlank={addTrack} onCancel={() => setModal("")} /></Modal>}
      {modal === "import-review" && <Modal title="Review Tracks" className="modal--wide" onClose={() => setModal("")}><ImportTracksReview key={pendingImport.map((file) => file.key).join("|")} album={activeAlbum} files={pendingImport} onSubmit={addImportedTracks} onBack={() => setModal("tracks")} /></Modal>}
      {modal === "audio-export" && <Modal title="Print / Export Audio" className="modal--wide" onClose={() => { if (!renderingAudio) setModal(""); }}><AudioExportForm album={activeAlbum} selectedTrack={activeAlbum.tracks.find((track) => track.id === audioExportTrackId)} deliveryProfileId={activeAlbum.delivery?.profileId || ""} rendering={renderingAudio} renderJob={audioRenderJob} error={audioRenderError} result={audioRenderResult} onRender={renderMasteringAudio} onCancelRender={cancelAudioRender} onClear={() => { setAudioRenderResult(null); setAudioRenderJob(null); setAudioRenderError(""); }} onCancel={() => setModal("")} /></Modal>}
    </div>
  );
}
