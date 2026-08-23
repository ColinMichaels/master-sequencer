import React, { useEffect, useMemo, useState } from "react";
import { api } from "../lib/api.js";
import { DocumentIcon, ImageIcon, LockIcon, MusicIcon, PlusIcon, TrashIcon, VideoIcon } from "./Icons.jsx";
import { VisualMediaLibrary } from "./VisualMediaLibrary.jsx";

const referenceKey = (reference) => reference ? `${reference.rootId}::${reference.relativePath}` : "";
const fileName = (reference) => reference?.name || reference?.relativePath?.split(/[\\/]/).at(-1) || "Attached file";
const isVideoAsset = (reference) => ["mp4", "mov", "m4v", "webm"].includes(reference?.extension?.toLowerCase());
const lyricKinds = [
  ["sunoPrompt", "Suno prompt lyrics", "Original prompt sheet with sections, directions, and production metadata."],
  ["distrokid", "DistroKid clean lyrics", "Clean sung words only, ready for distributor lyric entry."],
];

function VisualAssetCard({ asset, cover, protectedAsset, onUseAsCover, onRemove }) {
  return (
    <article className={`visual-asset-card ${cover ? "is-cover" : ""}`}>
      <div className="visual-asset-preview">
        {protectedAsset
          ? <span className="protected-asset-preview"><LockIcon size={28} /> Protected visual</span>
          : isVideoAsset(asset)
            ? <span className="attached-video-preview"><video src={api.assetUrl(asset)} muted playsInline preload="metadata" aria-label={fileName(asset)} /><VideoIcon /></span>
            : <img src={api.assetUrl(asset)} alt={fileName(asset)} />}
      </div>
      <div className="visual-asset-copy">
        <strong>{protectedAsset ? "Protected visual asset" : fileName(asset)}</strong>
        <small>{cover ? "Current album cover" : protectedAsset ? "Filename masked" : asset.relativePath}</small>
      </div>
      <div className="visual-asset-actions">
        {onUseAsCover && !cover ? <button type="button" className="text-button" onClick={onUseAsCover}>Use as cover</button> : null}
        <button type="button" className="icon-button" onClick={onRemove} aria-label={`Remove ${protectedAsset ? "protected visual asset" : fileName(asset)}`}><TrashIcon /></button>
      </div>
    </article>
  );
}

function LyricAttachment({ kind, label, description, attachment, protectedAsset, picking, sourcePickingAvailable, onAttach, onRemove }) {
  return (
    <section className={`lyric-attachment ${attachment ? "has-file" : ""}`}>
      <div className="lyric-attachment-heading"><DocumentIcon /><span><strong>{label}</strong><small>{description}</small></span></div>
      {attachment ? (
        <div className="lyric-file-row">
          <span><strong>{protectedAsset ? "Protected lyric file" : fileName(attachment)}</strong><small>{protectedAsset ? "Filename masked" : attachment.relativePath}</small></span>
          <div>
            {!protectedAsset ? <a className="text-button" href={api.assetUrl(attachment)} target="_blank" rel="noreferrer">Open</a> : null}
            <button type="button" className="text-button" disabled={!sourcePickingAvailable || picking} title={sourcePickingAvailable ? "Replace this attachment" : "Asset attachment is unavailable in this browser session"} onClick={() => onAttach(kind)}>Replace</button>
            <button type="button" className="icon-button" onClick={() => onRemove(kind)} aria-label={`Remove ${label}`}><TrashIcon /></button>
          </div>
        </div>
      ) : <button type="button" className="asset-add-button" disabled={!sourcePickingAvailable || picking} title={sourcePickingAvailable ? `Attach ${label}` : "Asset attachment is unavailable in this browser session"} onClick={() => onAttach(kind)}><PlusIcon /> Attach {label}</button>}
    </section>
  );
}

export function AssetWorkspace({ album, revealPrivateFilenames, picking, sourcePickingAvailable = true, audioPlaying = false, onAlbumChange, onPickAssets, onTrackFocus, onVideoPlay }) {
  const [mode, setMode] = useState("project");
  const [selectedTrackId, setSelectedTrackId] = useState(album.tracks[0]?.id || "");
  useEffect(() => {
    if (!album.tracks.some((track) => track.id === selectedTrackId)) setSelectedTrackId(album.tracks[0]?.id || "");
  }, [album.id, album.tracks, selectedTrackId]);

  const track = album.tracks.find((item) => item.id === selectedTrackId);
  useEffect(() => { onTrackFocus?.(track?.id || ""); }, [onTrackFocus, track?.id]);
  const coverKey = referenceKey(album.coverRef);
  const albumAssets = useMemo(() => {
    const byReference = new Map();
    if (album.coverRef) byReference.set(coverKey, album.coverRef);
    for (const asset of album.visualAssets || []) byReference.set(referenceKey(asset), asset);
    return [...byReference.values()];
  }, [album.coverRef, album.visualAssets, coverKey]);

  const addVisuals = async (scope) => {
    const result = await onPickAssets("visuals");
    if (!result.ok || result.cancelled || !result.assets.length) return;
    onAlbumChange((draft) => {
      const target = scope === "album" ? draft : draft.tracks.find((item) => item.id === track?.id);
      if (!target) return;
      const existing = new Set((target.visualAssets || []).map(referenceKey));
      target.visualAssets = [...(target.visualAssets || []), ...result.assets.filter((asset) => !existing.has(referenceKey(asset)))];
    });
  };

  const removeAlbumVisual = (asset) => onAlbumChange((draft) => {
    const key = referenceKey(asset);
    draft.visualAssets = (draft.visualAssets || []).filter((item) => referenceKey(item) !== key);
    if (referenceKey(draft.coverRef) === key) delete draft.coverRef;
  });

  const removeTrackVisual = (asset) => onAlbumChange((draft) => {
    const target = draft.tracks.find((item) => item.id === track.id);
    target.visualAssets = (target.visualAssets || []).filter((item) => referenceKey(item) !== referenceKey(asset));
  });

  const setCover = (asset) => onAlbumChange((draft) => {
    draft.coverRef = asset;
    if (!(draft.visualAssets || []).some((item) => referenceKey(item) === referenceKey(asset))) {
      draft.visualAssets = [...(draft.visualAssets || []), asset];
    }
  });

  const attachLyrics = async (candidateId, kind) => {
    const result = await onPickAssets("lyrics");
    const attachment = result.assets[0];
    if (!result.ok || result.cancelled || !attachment) return;
    onAlbumChange((draft) => {
      const targetTrack = draft.tracks.find((item) => item.id === track.id);
      const candidate = targetTrack.candidates.find((item) => item.id === candidateId);
      candidate.lyricRefs = { ...(candidate.lyricRefs || {}), [kind]: attachment };
    });
  };

  const removeLyrics = (candidateId, kind) => onAlbumChange((draft) => {
    const targetTrack = draft.tracks.find((item) => item.id === track.id);
    const candidate = targetTrack.candidates.find((item) => item.id === candidateId);
    candidate.lyricRefs = { ...(candidate.lyricRefs || {}) };
    delete candidate.lyricRefs[kind];
  });

  const trackProtected = track?.privacy === "protected" && !revealPrivateFilenames;
  const albumVisualCount = albumAssets.length;
  const trackVisualCount = track?.visualAssets?.length || 0;
  const lyricCount = track?.candidates.reduce((sum, candidate) => sum + Object.values(candidate.lyricRefs || {}).filter(Boolean).length, 0) || 0;

  return (
    <main className="assets-workspace">
      <nav className="assets-mode-selector" aria-label="Assets workspace mode">
        <button type="button" aria-current={mode === "project" ? "page" : undefined} onClick={() => setMode("project")}><span>Project Assets</span><small>Artwork, track visuals, and lyrics</small></button>
        <button type="button" aria-current={mode === "library" ? "page" : undefined} onClick={() => setMode("library")}><span>Video &amp; Graphics Library</span><small>Indexed visual media and project relationships</small></button>
      </nav>

      {mode === "library" ? <VisualMediaLibrary album={album} selectedTrackId={selectedTrackId} audioPlaying={audioPlaying} onAlbumChange={onAlbumChange} onVideoPlay={onVideoPlay} /> : <>
      <header className="assets-heading">
        <h2 className="sr-only">Assets</h2>
        <dl><div><dt>{albumVisualCount}</dt><dd>Album visuals</dd></div><div><dt>{trackVisualCount}</dt><dd>Track visuals</dd></div><div><dt>{lyricCount}</dt><dd>Lyric files</dd></div></dl>
      </header>

      <div className="assets-columns">
        <section className="asset-pane album-assets-pane" aria-labelledby="album-assets-title">
          <header><div><h3 id="album-assets-title">Album Visuals</h3><p>Cover art, back-cover ideas, campaign art, and layout references.</p></div><button type="button" className="primary-button" disabled={!sourcePickingAvailable || picking} title={sourcePickingAvailable ? "Attach existing visual files" : "Asset attachment is unavailable in this browser session"} onClick={() => addVisuals("album")}><ImageIcon /> {picking ? "Waiting…" : sourcePickingAvailable ? "Add Visuals" : "Attach Unavailable"}</button></header>
          <div className="visual-asset-list">
            {albumAssets.map((asset) => <VisualAssetCard key={referenceKey(asset)} asset={asset} cover={referenceKey(asset) === coverKey} onUseAsCover={isVideoAsset(asset) ? undefined : () => setCover(asset)} onRemove={() => removeAlbumVisual(asset)} />)}
            {!albumAssets.length ? <div className="asset-empty"><ImageIcon size={28}/><strong>No album visuals attached</strong><span>Add existing artwork without copying it.</span></div> : null}
          </div>
        </section>

        <section className="asset-pane track-assets-pane" aria-labelledby="track-assets-title">
          <header className="track-assets-heading">
            <div><h3 id="track-assets-title">Track Assets</h3><p>Visual development and lyric sheets for one track at a time.</p></div>
            <label>Track<select value={selectedTrackId} onChange={(event) => setSelectedTrackId(event.target.value)}>{album.tracks.map((item, index) => <option key={item.id} value={item.id}>{index + 1}. {item.title}</option>)}</select></label>
          </header>

          {!track ? <div className="asset-empty asset-empty--large"><strong>Add a track before attaching assets.</strong></div> : <>
            <section className="track-visuals-section">
              <div className="subsection-heading"><div><h3>Track Visuals</h3><p>Concept art, storyboards, thumbnails, and social artwork.</p></div><button type="button" className="text-button" disabled={!sourcePickingAvailable || picking} title={sourcePickingAvailable ? "Attach existing visual files" : "Asset attachment is unavailable in this browser session"} onClick={() => addVisuals("track")}><PlusIcon /> {sourcePickingAvailable ? "Add Track Visuals" : "Attach Unavailable"}</button></div>
              <div className="visual-asset-list visual-asset-list--track">
                {(track.visualAssets || []).map((asset) => <VisualAssetCard key={referenceKey(asset)} asset={asset} protectedAsset={trackProtected} onRemove={() => removeTrackVisual(asset)} />)}
                {!track.visualAssets?.length ? <div className="asset-empty"><ImageIcon size={24}/><strong>No track visuals</strong><span>Attach visual references for {track.title}.</span></div> : null}
              </div>
            </section>

            <section className="candidate-lyrics-section">
              <div className="subsection-heading"><div><h3>Lyrics by Audio Candidate</h3><p>Attach the exact lyric sources associated with each audio version.</p></div></div>
              {track.candidates.length ? <div className="candidate-asset-list">{track.candidates.map((candidate) => (
                <article className="candidate-asset-record" key={candidate.id}>
                  <header><MusicCandidateLabel candidate={candidate} protectedAsset={trackProtected} /></header>
                  <div className="lyric-slots">{lyricKinds.map(([kind, label, description]) => <LyricAttachment key={kind} kind={kind} label={label} description={description} attachment={candidate.lyricRefs?.[kind]} protectedAsset={trackProtected} picking={picking} sourcePickingAvailable={sourcePickingAvailable} onAttach={(nextKind) => attachLyrics(candidate.id, nextKind)} onRemove={(nextKind) => removeLyrics(candidate.id, nextKind)} />)}</div>
                </article>
              ))}</div> : <div className="asset-empty"><DocumentIcon size={24}/><strong>No audio candidate record</strong><span>Add candidate audio before attaching its lyric files.</span></div>}
            </section>
          </>}
        </section>
      </div>
      <p className="asset-storage-note"><LockIcon /> Project Sequencer stores path references only. It never copies, edits, publishes, or deletes attached artwork or lyric files.</p>
      </>}
    </main>
  );
}

function MusicCandidateLabel({ candidate, protectedAsset }) {
  return <div className="candidate-asset-title"><span className="candidate-asset-icon"><MusicIcon /></span><span><strong>{candidate.label}</strong><small>{protectedAsset ? "Protected audio asset record" : "Audio asset record"}</small></span></div>;
}
