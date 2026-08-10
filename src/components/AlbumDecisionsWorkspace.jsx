import React, { useEffect, useMemo, useState } from "react";
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
import { sequenceTracks } from "../lib/sequence-tracks.js";
import { CheckIcon, PlayIcon, PlusIcon, RefreshIcon, WarningIcon } from "./Icons.jsx";

const gateLabels = [
  ["playable", "Playable"],
  ["audition", "Audition"],
  ["master", "Master"],
  ["disposition", "Disposition"],
  ["lyrics", "Lyrics"],
  ["artwork", "Artwork"],
  ["ordering", "Order"],
  ["humanApproval", "Human approval"],
];

function TransitionVariant({ name, value, busy, onChange, onPreview }) {
  return (
    <fieldset className="transition-variant">
      <legend>Variant {name}</legend>
      <label>Ending<select value={value.endMode} onChange={(event) => onChange("endMode", event.target.value)}><option value="natural">Natural</option><option value="cut">Hard cut</option><option value="fade">Fade</option><option value="crossfade">Crossfade</option></select></label>
      <label>Duration<input type="number" min="0" max="30" step="0.1" value={value.duration} onChange={(event) => onChange("duration", Number(event.target.value))} /></label>
      <label>Gap after<input type="number" min="0" max="30" step="0.1" value={value.gapAfter} disabled={value.endMode === "crossfade"} onChange={(event) => onChange("gapAfter", Number(event.target.value))} /></label>
      <button type="button" className="text-button" disabled={busy} onClick={onPreview}><PlayIcon /> {busy ? "Preparing…" : `Preview ${name}`}</button>
    </fieldset>
  );
}

export function AlbumDecisionsWorkspace({ album, templates, libraryMap, onAlbumChange, onSaveTemplate, onCreateFromTemplate, onPreviewTransition, onPreviewComparison, previewingDecision }) {
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
  const queued = album.tracks.flatMap((track) => (track.comparisonQueue || []).flatMap((candidateId) => {
    const candidate = track.candidates.find((item) => item.id === candidateId);
    return candidate ? [{ track, candidate }] : [];
  }));

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
      <header className="decisions-heading"><div><h2>{album.title} <span>— Album Decisions</span></h2><p>Ordering, source choices, readiness, and human approval stay separate.</p></div></header>

      <section className="decision-module sequence-versions" aria-labelledby="sequence-versions-title">
        <header><div><h3 id="sequence-versions-title">Sequence Versions</h3><p>Snapshots store only track membership and order. Track records and approvals are untouched.</p></div><form onSubmit={(event) => { event.preventDefault(); saveVersion(); }}><input aria-label="Sequence version name" required value={versionName} onChange={(event) => setVersionName(event.target.value)} placeholder="Late-night order" /><button className="primary-button" type="submit"><PlusIcon /> Save Current</button></form></header>
        {(album.sequenceVersions || []).length ? <>
          <ol className="version-list">{album.sequenceVersions.map((version) => <li key={version.id}><div><strong>{version.name}</strong><small>{version.trackOrder.length} tracks · {new Date(version.createdAt).toLocaleString()}</small></div><button type="button" className="text-button" onClick={() => saveVersion(version.id)}>Duplicate</button><button type="button" className="text-button" onClick={() => onAlbumChange((draft) => { restoreSequenceVersion(draft, version.id); })}><RefreshIcon /> Restore</button></li>)}</ol>
          <div className="version-compare-controls"><label>Left<select value={leftVersionId} onChange={(event) => setLeftVersionId(event.target.value)}>{album.sequenceVersions.map((version) => <option key={version.id} value={version.id}>{version.name}</option>)}</select></label><label>Right<select value={rightVersionId} onChange={(event) => setRightVersionId(event.target.value)}>{album.sequenceVersions.map((version) => <option key={version.id} value={version.id}>{version.name}</option>)}</select></label></div>
          <div className="version-comparison" role="table" aria-label="Sequence version comparison">{comparison.map((row) => <div key={row.trackId} role="row"><span>{row.leftPosition || "—"}</span><strong>{row.title}</strong><span>{row.rightPosition || "—"}</span></div>)}</div>
        </> : <p className="module-empty">Save the current order to begin comparing alternatives.</p>}
      </section>

      <section className="decision-module transition-notebook" aria-labelledby="transition-notebook-title">
        <header><div><h3 id="transition-notebook-title">Transition Notebook</h3><p>Notes and A/B variants are non-destructive instructions for adjacent pairs.</p></div>{pairs.length > 0 && <select aria-label="Transition pair" value={selectedPairId} onChange={(event) => setSelectedPairId(event.target.value)}>{pairs.map((pair) => <option key={pair.id} value={pair.id}>{pair.from.title} → {pair.to.title}</option>)}</select>}</header>
        {transition && selectedPair ? <>
          <label className="transition-notes">Listening notes<textarea value={transition.notes} onChange={(event) => updateTransition((entry) => { entry.notes = event.target.value; })} placeholder="Decay, lyric collision, energy, timing…" /></label>
          <div className="transition-markers"><form onSubmit={(event) => { event.preventDefault(); updateTransition((entry) => { addTransitionMarker(entry, { label: markerLabel, seconds: markerSeconds }); }); setMarkerLabel(""); }}><input aria-label="Marker label" required value={markerLabel} onChange={(event) => setMarkerLabel(event.target.value)} placeholder="Vocal enters" /><input aria-label="Marker seconds" type="number" min="0" step="0.01" value={markerSeconds} onChange={(event) => setMarkerSeconds(event.target.value)} /><button type="submit" className="text-button"><PlusIcon /> Marker</button></form><ul>{transition.markers.map((marker) => <li key={marker.id}><span>{marker.seconds.toFixed(2)}s</span><strong>{marker.label}</strong><button type="button" onClick={() => updateTransition((entry) => { entry.markers = entry.markers.filter((item) => item.id !== marker.id); })}>Remove</button></li>)}</ul></div>
          <div className="transition-variants">{["A", "B"].map((name) => <TransitionVariant key={name} name={name} value={transition.variants[name]} busy={previewingDecision === `transition-${name}`} onChange={(field, value) => updateTransition((entry) => { entry.variants[name][field] = value; })} onPreview={() => onPreviewTransition(selectedPair, name, transition.variants[name])} />)}</div>
        </> : <p className="module-empty">At least two sequenced tracks are required.</p>}
      </section>

      <section className="decision-module readiness-inspector" aria-labelledby="readiness-title">
        <header><div><h3 id="readiness-title">Readiness Inspector</h3><p>Every gate is reported independently. No check implies another.</p></div></header>
        <div className="readiness-table" role="table"><div className="readiness-head" role="row"><strong>Track</strong>{gateLabels.map(([, label]) => <span key={label}>{label}</span>)}</div>{readiness.map((row) => <div className="readiness-row" role="row" key={row.trackId}><strong>{row.title}</strong>{gateLabels.map(([key, label]) => key === "humanApproval" ? <label key={key} className={row.gates[key] ? "is-ready" : ""}><input type="checkbox" checked={row.gates[key]} onChange={(event) => onAlbumChange((draft) => { draft.tracks.find((track) => track.id === row.trackId).humanApproved = event.target.checked; })} /><span className="sr-only">{label} for {row.title}</span>{row.gates[key] ? <CheckIcon /> : <WarningIcon />}</label> : <span key={key} className={row.gates[key] ? "is-ready" : ""} aria-label={`${label}: ${row.gates[key] ? "ready" : "not ready"}`}>{row.gates[key] ? <CheckIcon /> : <WarningIcon />}</span>)}</div>)}</div>
      </section>

      <section className="decision-module comparison-queue" aria-labelledby="comparison-title">
        <header><div><h3 id="comparison-title">Candidate Comparison Queue</h3><p>Loudness matching creates temporary labeled previews only. Originals and master decisions do not change.</p></div></header>
        {queued.length ? <ol>{queued.map(({ track, candidate }) => <li key={`${track.id}-${candidate.id}`}><div><strong>{track.title}</strong><small>{candidate.label} · original indexed source</small></div><button type="button" className="text-button" disabled={Boolean(previewingDecision)} onClick={() => onPreviewComparison(track, candidate)}><PlayIcon /> {previewingDecision === `${track.id}-${candidate.id}` ? "Matching…" : "Play Matched Derivative"}</button></li>)}</ol> : <p className="module-empty">Add candidates from Track Review. Nothing is selected automatically.</p>}
      </section>

      <section className="decision-module album-templates" aria-labelledby="templates-title">
        <header><div><h3 id="templates-title">Album Templates</h3><p>Templates copy track structure and mastering instructions—not media, artwork, source choices, or approvals.</p></div></header>
        <div className="template-actions"><form onSubmit={(event) => { event.preventDefault(); onSaveTemplate(templateName); setTemplateName(""); }}><label>Template name<input required value={templateName} onChange={(event) => setTemplateName(event.target.value)} placeholder="12-track LP" /></label><button type="submit" className="text-button">Save Structure</button></form><form onSubmit={(event) => { event.preventDefault(); onCreateFromTemplate(templateId, newAlbumTitle); setNewAlbumTitle(""); }}><label>Template<select required value={templateId} onChange={(event) => setTemplateId(event.target.value)}><option value="">Choose template</option>{templates.map((template) => <option key={template.id} value={template.id}>{template.name}</option>)}</select></label><label>New album title<input required value={newAlbumTitle} onChange={(event) => setNewAlbumTitle(event.target.value)} placeholder="Next Record" /></label><button type="submit" className="primary-button" disabled={!templateId}>Create Empty Album</button></form></div>
      </section>
    </main>
  );
}
