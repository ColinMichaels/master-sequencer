import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  addTransitionMarker,
  compareSequenceVersions,
  defaultTransitionVariant,
  ensureTransitionNote,
  readinessForAlbum,
  restoreSequenceVersion,
  saveSequenceVersion,
  transitionPairId,
  updateTransitionNote,
} from "../lib/album-decisions.js";
import { sourceKey } from "../lib/api.js";
import { albumReleaseDateStatus } from "../lib/release-date.js";
import { sequenceTracks } from "../lib/sequence-tracks.js";
import { usePinnedDisclosure } from "../hooks/usePinnedDisclosure.js";
import { CheckIcon, ChevronIcon, PinIcon, PlayIcon, PlusIcon, RefreshIcon, WarningIcon } from "./Icons.jsx";

const gateLabels = [
  ["playable", "Playable", "Play"],
  ["audition", "Audition", "Aud"],
  ["master", "Master", "Master"],
  ["disposition", "Disposition", "Status"],
  ["lyrics", "Lyrics", "Lyrics"],
  ["artwork", "Artwork", "Art"],
  ["ordering", "Order", "Order"],
  ["humanApproval", "Human approval", "Human"],
];

function TransitionVariant({ name, value, busy, renderingAvailable, onChange, onPreview }) {
  return (
    <fieldset className="transition-variant">
      <legend>Variant {name}</legend>
      <label>Ending<select value={value.endMode} onChange={(event) => onChange("endMode", event.target.value)}><option value="natural">Natural</option><option value="cut">Hard cut</option><option value="fade">Fade</option><option value="crossfade">Crossfade</option></select></label>
      <label>Duration<input type="number" min="0" max="30" step="0.1" value={value.duration} onChange={(event) => onChange("duration", Number(event.target.value))} /></label>
      <label>Gap after<input type="number" min="0" max="30" step="0.1" value={value.gapAfter} disabled={value.endMode === "crossfade"} onChange={(event) => onChange("gapAfter", Number(event.target.value))} /></label>
      <button type="button" className="text-button" disabled={!renderingAvailable || busy} title={renderingAvailable ? `Render transition variant ${name}` : "Rendered transition previews are unavailable in the browser"} onClick={onPreview}><PlayIcon /> {busy ? "Preparing…" : renderingAvailable ? `Preview ${name}` : "Preview Unavailable"}</button>
    </fieldset>
  );
}

function DecisionDisclosure({ id, title, description, summary, className = "", children }) {
  const { open, pinned, setOpen, togglePinned } = usePinnedDisclosure(`decisions-${id}`);
  const triggerRef = useRef(null);
  const panelRef = useRef(null);
  const toggle = () => {
    const nextOpen = !open;
    if (!nextOpen && panelRef.current?.contains(document.activeElement)) triggerRef.current?.focus();
    setOpen(nextOpen);
  };

  return (
    <section className={`decision-module decision-disclosure ${pinned ? "is-pinned" : ""} ${className}`} aria-labelledby={`${id}-title`}>
      <header className="expert-disclosure-header">
        <button ref={triggerRef} type="button" className="decision-disclosure-trigger" aria-expanded={open} aria-controls={`${id}-panel`} onClick={toggle}>
          <span><h3 id={`${id}-title`}>{title}</h3><p>{description}</p></span>
          <span className="decision-disclosure-state"><strong>{summary}</strong><ChevronIcon direction={open ? "up" : "down"} /></span>
        </button>
        <button type="button" className="expert-panel-pin" aria-pressed={pinned} aria-label={`${pinned ? "Stop keeping" : "Keep"} ${title} open on this device`} title={`${pinned ? "Stop keeping" : "Keep"} this expert panel open on this device`} onClick={togglePinned}><PinIcon /></button>
      </header>
      <div ref={panelRef} className="decision-disclosure-panel" id={`${id}-panel`} hidden={!open}>{children}</div>
    </section>
  );
}

export function AlbumDecisionsWorkspace({ album, templates, libraryMap, renderingAvailable = true, onAlbumChange, onSaveTemplate, onCreateFromTemplate, onPreviewTransition, onPreviewComparison, previewingDecision }) {
  const tracks = useMemo(() => sequenceTracks(album), [album]);
  const pairs = useMemo(() => tracks.slice(0, -1).map((track, index) => ({ from: track, to: tracks[index + 1], id: transitionPairId(track.id, tracks[index + 1].id) })), [tracks]);
  const [versionName, setVersionName] = useState("");
  const [leftVersionId, setLeftVersionId] = useState(album.sequenceVersions?.[0]?.id || "");
  const [rightVersionId, setRightVersionId] = useState(album.sequenceVersions?.[1]?.id || "");
  const [selectedPairId, setSelectedPairId] = useState(pairs[0]?.id || "");
  const [markerLabel, setMarkerLabel] = useState("");
  const [markerSeconds, setMarkerSeconds] = useState("0");
  const [templateName, setTemplateName] = useState("");
  const [templateId, setTemplateId] = useState(templates[0]?.id || "");
  const [newAlbumTitle, setNewAlbumTitle] = useState("");

  useEffect(() => {
    if (!pairs.some((pair) => pair.id === selectedPairId)) setSelectedPairId(pairs[0]?.id || "");
  }, [pairs, selectedPairId]);
  useEffect(() => {
    const versions = album.sequenceVersions || [];
    if (!versions.some((version) => version.id === leftVersionId)) setLeftVersionId(versions[0]?.id || "");
    if (!versions.some((version) => version.id === rightVersionId)) setRightVersionId(versions[1]?.id || versions[0]?.id || "");
  }, [album.id, album.sequenceVersions, leftVersionId, rightVersionId]);
  useEffect(() => {
    if (!templates.some((template) => template.id === templateId)) setTemplateId(templates[0]?.id || "");
  }, [templates, templateId]);

  const comparison = useMemo(() => compareSequenceVersions(album, leftVersionId, rightVersionId), [album, leftVersionId, rightVersionId]);
  const selectedPair = pairs.find((pair) => pair.id === selectedPairId);
  const storedTransition = (album.transitionNotebook || []).find((entry) => entry.id === selectedPairId);
  const transition = storedTransition || (selectedPair ? {
    id: selectedPair.id,
    fromTrackId: selectedPair.from.id,
    toTrackId: selectedPair.to.id,
    notes: "",
    markers: [],
    variants: { A: defaultTransitionVariant(), B: defaultTransitionVariant() },
  } : null);
  const availableKeys = useMemo(() => new Set(libraryMap.keys()), [libraryMap]);
  const readiness = useMemo(() => readinessForAlbum(album, availableKeys, sourceKey), [album, availableKeys]);
  const releaseDate = album.releaseDate || "";
  const releaseDateStatus = albumReleaseDateStatus(releaseDate);
  const queued = album.tracks.flatMap((track) => (track.comparisonQueue || []).flatMap((candidateId) => {
    const candidate = track.candidates.find((item) => item.id === candidateId);
    return candidate ? [{ track, candidate }] : [];
  }));
  const transitionMarkerCount = (album.transitionNotebook || []).reduce((total, entry) => total + (entry.markers?.length || 0), 0);
  const blockedReadinessGates = readiness.reduce((total, row) => total + gateLabels.filter(([key]) => !row.gates[key]).length, 0);

  const saveVersion = (sourceVersionId = "") => {
    const fallback = sourceVersionId ? `${album.sequenceVersions.find((version) => version.id === sourceVersionId)?.name || "Sequence"} copy` : versionName;
    onAlbumChange((draft) => { saveSequenceVersion(draft, fallback, sourceVersionId); });
    if (!sourceVersionId) setVersionName("");
  };
  const updateTransition = (recipe) => {
    if (!selectedPair) return;
    onAlbumChange((draft) => updateTransitionNote(draft, selectedPair.from.id, selectedPair.to.id, recipe));
  };

  return (
    <main className="decisions-workspace">
      <header className="decisions-heading">
        <h2 className="sr-only">Album Decisions</h2>
      </header>

      <section className="decision-module readiness-inspector" aria-labelledby="readiness-title">
        <header><div><h3 id="readiness-title">Readiness Inspector</h3><p>Every gate is reported independently. No check implies another.</p></div><strong className="readiness-summary">{blockedReadinessGates ? `${blockedReadinessGates} unresolved` : "All gates ready"}</strong></header>
        <div className="readiness-table" role="table"><div className="readiness-head" role="row"><strong role="columnheader">Track</strong>{gateLabels.map(([, label]) => <span role="columnheader" key={label}>{label}</span>)}</div><div className="readiness-body" role="rowgroup">{readiness.map((row) => <div className="readiness-row" role="row" key={row.trackId}><strong role="cell">{row.title}</strong>{gateLabels.map(([key, label, shortLabel]) => key === "humanApproval" ? <label role="cell" key={key} className={row.gates[key] ? "is-ready" : ""} data-gate-label={shortLabel}><input type="checkbox" checked={row.gates[key]} onChange={(event) => onAlbumChange((draft) => { draft.tracks.find((track) => track.id === row.trackId).humanApproved = event.target.checked; })} /><span className="sr-only">{label} for {row.title}</span>{row.gates[key] ? <CheckIcon /> : <WarningIcon />}</label> : <span role="cell" key={key} className={row.gates[key] ? "is-ready" : ""} data-gate-label={shortLabel} aria-label={`${label}: ${row.gates[key] ? "ready" : "not ready"}`}>{row.gates[key] ? <CheckIcon /> : <WarningIcon />}</span>)}</div>)}</div></div>
        <div className={`album-release-date is-${releaseDateStatus.kind}`}>
          <label htmlFor="album-release-date">Release date <span>(optional)</span></label>
          <div className="album-release-date-input">
            <input id="album-release-date" type="date" value={releaseDate} aria-describedby="album-release-date-status" onChange={(event) => onAlbumChange((draft) => { draft.releaseDate = event.target.value; })} />
            {releaseDate && <button type="button" className="text-button" aria-label="Clear release date" onClick={() => onAlbumChange((draft) => { draft.releaseDate = ""; })}>Clear</button>}
          </div>
          <small id="album-release-date-status" role="status">{releaseDateStatus.message}</small>
        </div>
      </section>

      <div className="decision-primary-grid">
        <DecisionDisclosure id="sequence-versions" className="sequence-versions" title="Sequence Versions" description="Save, compare, duplicate, or restore alternate track orders." summary={`${(album.sequenceVersions || []).length} saved`}>
          <form className="sequence-version-form" onSubmit={(event) => { event.preventDefault(); saveVersion(); }}><input aria-label="Sequence version name" required value={versionName} onChange={(event) => setVersionName(event.target.value)} placeholder="Late-night order" /><button className="primary-button" type="submit"><PlusIcon /> Save Current</button></form>
          {(album.sequenceVersions || []).length ? <>
            <ol className="version-list">{album.sequenceVersions.map((version) => <li key={version.id}><div><strong>{version.name}</strong><small>{version.trackOrder.length} tracks · {new Date(version.createdAt).toLocaleString()}</small></div><button type="button" className="text-button" onClick={() => saveVersion(version.id)}>Duplicate</button><button type="button" className="text-button" onClick={() => onAlbumChange((draft) => { restoreSequenceVersion(draft, version.id); })}><RefreshIcon /> Restore</button></li>)}</ol>
            <div className="version-compare-controls"><label>Left<select value={leftVersionId} onChange={(event) => setLeftVersionId(event.target.value)}>{album.sequenceVersions.map((version) => <option key={version.id} value={version.id}>{version.name}</option>)}</select></label><label>Right<select value={rightVersionId} onChange={(event) => setRightVersionId(event.target.value)}>{album.sequenceVersions.map((version) => <option key={version.id} value={version.id}>{version.name}</option>)}</select></label></div>
            <div className="version-comparison" role="table" aria-label="Sequence version comparison"><div role="rowgroup">{comparison.map((row) => <div key={row.trackId} role="row"><span role="cell">{row.leftPosition || "—"}</span><strong role="cell">{row.title}</strong><span role="cell">{row.rightPosition || "—"}</span></div>)}</div></div>
          </> : <p className="module-empty">Save the current order to begin comparing alternatives.</p>}
        </DecisionDisclosure>

        <DecisionDisclosure id="transition-tools" className="transition-notebook" title="Transition Tools" description="Write pair notes, place markers, and compare non-destructive A/B variants." summary={`${pairs.length} ${pairs.length === 1 ? "pair" : "pairs"} · ${transitionMarkerCount} ${transitionMarkerCount === 1 ? "marker" : "markers"}`}>
          {pairs.length > 0 && <label className="transition-pair-control">Adjacent pair<select aria-label="Transition pair" value={selectedPairId} onChange={(event) => setSelectedPairId(event.target.value)}>{pairs.map((pair) => <option key={pair.id} value={pair.id}>{pair.from.title} → {pair.to.title}</option>)}</select></label>}
          {transition && selectedPair ? <>
            <label className="transition-notes">Listening notes<textarea value={transition.notes} onChange={(event) => updateTransition((entry) => { entry.notes = event.target.value; })} placeholder="Decay, lyric collision, energy, timing…" /></label>
            <div className="transition-markers"><form onSubmit={(event) => { event.preventDefault(); updateTransition((entry) => { addTransitionMarker(entry, { label: markerLabel, seconds: markerSeconds }); }); setMarkerLabel(""); }}><input aria-label="Marker label" required value={markerLabel} onChange={(event) => setMarkerLabel(event.target.value)} placeholder="Vocal enters" /><input aria-label="Marker seconds" type="number" min="0" step="0.01" value={markerSeconds} onChange={(event) => setMarkerSeconds(event.target.value)} /><button type="submit" className="text-button"><PlusIcon /> Marker</button></form><ul>{transition.markers.map((marker) => <li key={marker.id}><span>{marker.seconds.toFixed(2)}s</span><strong>{marker.label}</strong><button type="button" onClick={() => updateTransition((entry) => { entry.markers = entry.markers.filter((item) => item.id !== marker.id); })}>Remove</button></li>)}</ul></div>
            <div className="transition-variants">{["A", "B"].map((name) => <TransitionVariant key={name} name={name} value={transition.variants[name]} busy={previewingDecision === `transition-${name}`} renderingAvailable={renderingAvailable} onChange={(field, value) => updateTransition((entry) => { entry.variants[name][field] = value; })} onPreview={() => onPreviewTransition(selectedPair, name, transition.variants[name])} />)}</div>
          </> : <p className="module-empty">At least two sequenced tracks are required.</p>}
        </DecisionDisclosure>
      </div>

      <div className="decision-secondary-grid">
        <DecisionDisclosure id="matched-previews" className="comparison-queue" title="Matched Candidate Previews" description="Create loudness-matched derivatives without changing originals or master decisions." summary={`${queued.length} queued`}>
          {queued.length ? <ol>{queued.map(({ track, candidate }) => <li key={`${track.id}-${candidate.id}`}><div><strong>{track.title}</strong><small>{candidate.label} · original indexed source</small></div><button type="button" className="text-button" disabled={!renderingAvailable || Boolean(previewingDecision)} title={renderingAvailable ? "Create and play a loudness-matched derivative" : "Matched derivatives are unavailable in the browser"} onClick={() => onPreviewComparison(track, candidate)}><PlayIcon /> {previewingDecision === `${track.id}-${candidate.id}` ? "Matching…" : renderingAvailable ? "Play Matched Derivative" : "Preview Unavailable"}</button></li>)}</ol> : <p className="module-empty">Add candidates from Track Review. Nothing is selected automatically.</p>}
        </DecisionDisclosure>

        <DecisionDisclosure id="album-templates" className="album-templates" title="Album Templates" description="Reuse track structure and mastering instructions without copying media or approvals." summary={`${templates.length} saved`}>
          <div className="template-actions"><form onSubmit={(event) => { event.preventDefault(); onSaveTemplate(templateName); setTemplateName(""); }}><label>Template name<input required value={templateName} onChange={(event) => setTemplateName(event.target.value)} placeholder="12-track LP" /></label><button type="submit" className="text-button">Save Structure</button></form><form onSubmit={(event) => { event.preventDefault(); onCreateFromTemplate(templateId, newAlbumTitle); setNewAlbumTitle(""); }}><label>Template<select required value={templateId} onChange={(event) => setTemplateId(event.target.value)}><option value="">Choose template</option>{templates.map((template) => <option key={template.id} value={template.id}>{template.name}</option>)}</select></label><label>New album title<input required value={newAlbumTitle} onChange={(event) => setNewAlbumTitle(event.target.value)} placeholder="Next Record" /></label><button type="submit" className="primary-button" disabled={!templateId}>Create Empty Album</button></form></div>
        </DecisionDisclosure>
      </div>
    </main>
  );
}
