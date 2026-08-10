import React from "react";
import { Modal } from "./Modal.jsx";
import { ProjectIdentityForm } from "./ProjectIdentityForm.jsx";
import {
  DocumentIcon,
  ExportIcon,
  FolderIcon,
  LockIcon,
  MusicIcon,
  PlusIcon,
  ReviewIcon,
  ScissorsIcon,
  SequenceIcon,
} from "./Icons.jsx";

const workflow = [
  {
    title: "Connect your audio",
    icon: MusicIcon,
    accent: "lime",
    body: "Choose individual files or a folder. Project Sequencer indexes supported audio in place; it never copies or changes the originals.",
  },
  {
    title: "Create an album",
    icon: PlusIcon,
    accent: "yellow",
    body: "Add an album, then import songs as new tracks. Albums keep their own order, notes, assets, and approval state.",
  },
  {
    title: "Audition every version",
    icon: ReviewIcon,
    accent: "orange",
    body: "Keep alternate mixes together as candidates. Compare them in Track Review and choose audition and master versions independently.",
  },
  {
    title: "Shape the sequence",
    icon: SequenceIcon,
    accent: "lime",
    body: "Reorder or temporarily remove tracks, check the running time, and preview how each song moves into the next.",
  },
  {
    title: "Trim and master timing",
    icon: ScissorsIcon,
    accent: "yellow",
    body: "Set non-destructive trims, fades, gaps, hard cuts, and crossfades. Print short previews before committing to the album flow.",
  },
  {
    title: "Export masters and lyrics",
    icon: ExportIcon,
    accent: "orange",
    body: "Attach clean distribution lyrics to the exact audio candidate, then print a 24-bit / 48 kHz WAV album or track with its cue sheet and manifest.",
  },
];

export function FirstRunGuide({
  artistName,
  setupComplete,
  scanning,
  onSaveIdentity,
  onChooseSources,
  onCreateAlbum,
  onExplore,
}) {
  return (
    <Modal
      title="Welcome to Project Sequencer"
      className="modal--first-run"
      dismissible={setupComplete}
      onClose={onExplore}
    >
      <div className="first-run-guide">
        <section className="first-run-intro">
          <div className="first-run-copy">
            <h3>Audition every version. Build one final album.</h3>
            <p>Project Sequencer is a local-first workspace for album compilation: compare multiple song versions, arrange the track order, shape song lengths and transitions, and prepare documented masters for distribution.</p>
          </div>
          <div className="first-run-safety"><LockIcon size={22} /><p><strong>Your source audio stays untouched.</strong> The app stores paths and editing instructions, then writes new derivatives only to dated export folders.</p></div>
        </section>

        <section className="first-run-workflow" aria-labelledby="first-run-workflow-title">
          <header><h3 id="first-run-workflow-title">From source files to final album</h3><p>Follow the six workspaces in order, or move between them whenever a decision changes.</p></header>
          <ol>
            {workflow.map(({ title, icon: StepIcon, accent, body }, index) => (
              <li className={`first-run-step first-run-step--${accent}`} key={title}>
                <span className="first-run-step-number">{String(index + 1).padStart(2, "0")}</span>
                <span className="first-run-step-icon"><StepIcon size={21} /></span>
                <span><strong>{title}</strong><small>{body}</small></span>
              </li>
            ))}
          </ol>
        </section>

        <section className="first-run-start" aria-labelledby="first-run-start-title">
          <div>
            <h3 id="first-run-start-title">{setupComplete ? "Load your first tracks" : "Name this project first"}</h3>
            <p>{setupComplete ? "Choose only the files you need, or index a folder so alternate mixes stay easy to find." : "Set the artist or band name once. Every album layout and export will inherit it."}</p>
          </div>
          {setupComplete ? (
            <div className="first-run-actions">
              <button type="button" className="primary-button" disabled={scanning} onClick={() => onChooseSources("files")}><MusicIcon /> {scanning ? "Waiting…" : "Choose Audio Files"}</button>
              <button type="button" className="primary-button primary-button--yellow" disabled={scanning} onClick={() => onChooseSources("folder")}><FolderIcon /> Choose Audio Folder</button>
              <button type="button" className="text-button" onClick={onCreateAlbum}><PlusIcon /> Create a New Album</button>
              <button type="button" className="text-button first-run-explore" onClick={onExplore}>Explore the Workspace</button>
            </div>
          ) : (
            <ProjectIdentityForm artistName={artistName} setup onSubmit={onSaveIdentity} />
          )}
        </section>

        <aside className="first-run-roadmap"><DocumentIcon size={20} /><p><strong>Mastering roadmap:</strong> today’s tools focus on timing, fades, gaps, crossfades, and clean audio printing. EQ, compression, limiting, and effects are planned future additions.</p></aside>
      </div>
    </Modal>
  );
}
