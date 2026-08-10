import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { api, sourceKey } from "../lib/api.js";
import { normalizeMastering } from "../lib/mastering.js";
import { applyLiveMasteringSettings, comparisonPlaybackStart, createLiveMasteringGraph, playbackBypassesMastering } from "../lib/live-mastering.js";

export const useTransport = ({ libraryMap, masterBus, liveTracks = [] }) => {
  const audioRef = useRef(null);
  const audioGraph = useRef(null);
  const meteringRef = useRef(null);
  const currentRef = useRef(null);
  const masterBusRef = useRef(masterBus);
  const liveTracksRef = useRef(liveTracks);
  const [current, setCurrent] = useState(null);
  const [status, setStatus] = useState("Ready");
  const [playing, setPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [mediaDuration, setMediaDuration] = useState(0);
  const [liveMasteringAvailable, setLiveMasteringAvailable] = useState(null);
  const mode = useRef("idle");
  const queue = useRef([]);
  const queueCursor = useRef(0);
  const completionMessage = useRef("Preview complete.");
  const playToken = useRef(0);

  masterBusRef.current = masterBus;
  liveTracksRef.current = liveTracks;

  const liveSettingsForEntry = useCallback((entry) => {
    const liveTrack = entry?.track?.id ? liveTracksRef.current.find((track) => track.id === entry.track.id) : null;
    const sourceBypassed = playbackBypassesMastering(entry);
    const trackGainDb = sourceBypassed ? 0 : Number(liveTrack?.mastering?.gainDb ?? entry.track?.mastering?.gainDb ?? 0);
    return { sourceBypassed, trackGainDb };
  }, []);

  const updateAudioGraph = useCallback((entry = currentRef.current) => {
    if (!audioGraph.current) return;
    applyLiveMasteringSettings(audioGraph.current, masterBusRef.current, liveSettingsForEntry(entry));
  }, [liveSettingsForEntry]);

  const ensureAudioGraph = useCallback(() => {
    if (audioGraph.current) return audioGraph.current;
    const AudioContextClass = window.AudioContext || window.webkitAudioContext;
    if (!audioRef.current || !AudioContextClass) {
      setLiveMasteringAvailable(false);
      return null;
    }
    try {
      audioGraph.current = createLiveMasteringGraph(audioRef.current, AudioContextClass);
      meteringRef.current = audioGraph.current ? {
        frequencyAnalyser: audioGraph.current.frequencyAnalyser,
        leftAnalyser: audioGraph.current.leftAnalyser,
        rightAnalyser: audioGraph.current.rightAnalyser,
        sampleRate: audioGraph.current.context.sampleRate,
      } : null;
      updateAudioGraph();
      setLiveMasteringAvailable(Boolean(audioGraph.current));
      return audioGraph.current;
    } catch {
      setLiveMasteringAvailable(false);
      return null;
    }
  }, [updateAudioGraph]);

  useEffect(() => {
    updateAudioGraph();
  }, [masterBus, liveTracks, updateAudioGraph]);

  useEffect(() => () => {
    const graph = audioGraph.current;
    audioGraph.current = null;
    meteringRef.current = null;
    if (!graph) return;
    try { graph.source.disconnect(); } catch { /* Already disconnected. */ }
    graph.context.close().catch(() => {});
  }, []);

  const fileForTrack = useCallback((track) => {
    const candidate = track.candidates.find((item) => item.id === track.auditionCandidateId);
    return candidate ? libraryMap.get(sourceKey(candidate.sourceRef)) : null;
  }, [libraryMap]);

  const playEntry = useCallback((entry, startAt = entry?.startAt || 0) => {
    if ((!entry?.file && !entry?.url) || !audioRef.current) return;
    const audio = audioRef.current;
    const token = ++playToken.current;
    currentRef.current = entry;
    setCurrent(entry);
    setCurrentTime(0);
    setMediaDuration(0);
    const graph = ensureAudioGraph();
    updateAudioGraph(entry);
    if (graph?.context.state === "suspended") graph.context.resume().catch(() => {});
    audio.src = entry.url || api.mediaUrl(entry.file.key);
    audio.load();
    const start = () => {
      if (token !== playToken.current) return;
      audio.currentTime = Math.min(startAt, Math.max(0, (entry.file?.duration || audio.duration || 0) - 0.2));
      audio.play().catch((error) => {
        if (error.name === "AbortError" && audio.paused) return;
        if (token === playToken.current) setStatus(`Playback needs a direct play gesture: ${error.message}`);
      });
    };
    if (audio.readyState >= 1) start();
    else audio.addEventListener("loadedmetadata", start, { once: true });
  }, [ensureAudioGraph, updateAudioGraph]);

  const previewFile = useCallback((file, label = file?.name) => {
    if (!file) return;
    mode.current = "single";
    queue.current = [];
    completionMessage.current = "Source preview complete.";
    setStatus("Previewing one source.");
    playEntry({ file, trackTitle: label, albumTitle: "Audio Library" });
  }, [playEntry]);

  const previewRendered = useCallback((url, label, options = {}) => {
    if (!url) return;
    mode.current = "single";
    queue.current = [];
    completionMessage.current = options.completionStatus || "Rendered preview complete.";
    setStatus(options.status || "Playing the rendered edit preview.");
    playEntry({
      url,
      file: options.file,
      track: options.track,
      trackTitle: label,
      albumTitle: options.albumTitle || "Mastering Preview",
      nextTrackTitle: options.nextTrackTitle || "",
      renderedPreview: true,
    });
  }, [playEntry]);

  const previewMasteringComparison = useCallback(({ channel, track, file, referenceFile, referenceLabel = "Reference track", albumTitle }) => {
    const cleanReference = channel === "B";
    const targetFile = cleanReference ? referenceFile : file;
    if (!track || !file || !referenceFile || !targetFile) return;

    const comparisonId = `${track.id}::${referenceFile.key}`;
    const activeEntry = currentRef.current;
    const activeAudio = audioRef.current;
    const elapsed = activeEntry?.masteringComparison?.id === comparisonId && activeAudio
      ? Math.max(0, activeAudio.currentTime - Number(activeEntry.comparisonStartAt || 0))
      : 0;
    const settings = normalizeMastering(track.mastering, file.duration);
    const comparisonStartAt = cleanReference ? 0 : settings.trimStart;
    const startAt = comparisonPlaybackStart({ baseStart: comparisonStartAt, elapsed, duration: targetFile.duration });
    const safeReferenceLabel = referenceLabel || "Reference track";

    mode.current = "single";
    queue.current = [];
    completionMessage.current = `${channel} reference comparison complete.`;
    setStatus(cleanReference
      ? "B: Playing the clean reference. Track gain and MASTER effects are bypassed."
      : "A: Playing the current track through live track gain and MASTER effects.");
    playEntry({
      file: targetFile,
      ...(cleanReference ? {} : { track }),
      trackTitle: cleanReference ? `Reference · ${safeReferenceLabel}` : track.title,
      albumTitle: `${albumTitle} · Reference A/B`,
      referenceTrack: cleanReference,
      masteringComparison: { id: comparisonId, channel, trackId: track.id, referenceKey: referenceFile.key },
      comparisonStartAt,
    }, startAt);
  }, [playEntry]);

  const playSequence = useCallback((album, startIndex = 0) => {
    const entries = album.tracks
      .map((track, index) => ({ file: fileForTrack(track), trackTitle: track.title, albumTitle: album.title, track, index }))
      .filter((entry) => entry.index >= startIndex && entry.file);
    if (!entries.length) {
      setStatus("No playable source exists from this position.");
      return;
    }
    const skipped = album.tracks.slice(startIndex).filter((track) => !fileForTrack(track)).length;
    mode.current = "queue";
    queue.current = entries;
    queueCursor.current = 0;
    setStatus(skipped ? `Playing available order; ${skipped} missing source ${skipped === 1 ? "is" : "are"} skipped.` : "Playing the complete working order.");
    playEntry(entries[0]);
  }, [fileForTrack, playEntry]);

  const previewChapter = useCallback((album, startIndex = 0) => {
    const playable = album.tracks.map((track, index) => ({ track, index, file: fileForTrack(track) })).filter((entry) => entry.file);
    const entries = playable.flatMap((entry, playableIndex) => {
      if (entry.index < startIndex) return [];
      const settings = normalizeMastering(entry.track.mastering, entry.file.duration, { hasNext: playableIndex < playable.length - 1 });
      return [{ file: entry.file, trackTitle: entry.track.title, albumTitle: `${album.title} · Chapter Preview`, track: entry.track, startAt: settings.trimStart, endAt: settings.trimEnd }];
    });
    if (!entries.length) {
      setStatus("No playable chapter exists from this cue.");
      return;
    }
    mode.current = "chapterQueue";
    queue.current = entries;
    queueCursor.current = 0;
    setStatus("Playing chaptered trims from this cue. Use transition A/B preview for overlaps and fades.");
    playEntry(entries[0]);
  }, [fileForTrack, playEntry]);

  const handleEnded = useCallback(() => {
    if (["queue", "chapterQueue"].includes(mode.current)) {
      const completedMode = mode.current;
      queueCursor.current += 1;
      if (queueCursor.current < queue.current.length) playEntry(queue.current[queueCursor.current]);
      else {
        mode.current = "idle";
        setStatus(completedMode === "chapterQueue" ? "Chaptered program preview complete." : "Available-sequence preview complete.");
      }
      return;
    }
    if (mode.current === "single") {
      mode.current = "idle";
      setStatus(completionMessage.current);
    }
  }, [playEntry]);

  const handleError = useCallback(() => {
    setPlaying(false);
    if (["queue", "chapterQueue"].includes(mode.current)) {
      const failedEntry = queue.current[queueCursor.current];
      queueCursor.current += 1;
      if (queueCursor.current < queue.current.length) {
        setStatus(`${failedEntry?.trackTitle || "A source"} could not be played; continuing with the next available track.`);
        playEntry(queue.current[queueCursor.current]);
      } else {
        mode.current = "idle";
        setStatus(`${failedEntry?.trackTitle || "The final source"} could not be played. Sequence preview stopped.`);
      }
      return;
    }
    mode.current = "idle";
    setStatus("This audio source could not be played. Reconnect or rescan its configured path, then try again.");
  }, [playEntry]);

  const stop = useCallback((message = "Ready") => {
    playToken.current += 1;
    audioRef.current?.pause();
    mode.current = "idle";
    queue.current = [];
    currentRef.current = null;
    setCurrent(null);
    setPlaying(false);
    setCurrentTime(0);
    setMediaDuration(0);
    setStatus(message);
  }, []);

  const togglePlayback = useCallback(() => {
    const audio = audioRef.current;
    if (!audio?.src) return;
    if (audio.paused) {
      const graph = ensureAudioGraph();
      updateAudioGraph();
      if (graph?.context.state === "suspended") graph.context.resume().catch(() => {});
      audio.play()
        .then(() => setStatus("Playback resumed. Press Space to pause."))
        .catch((error) => {
          if (error.name === "AbortError" && audio.paused) return;
          setStatus(`Playback needs a direct play gesture: ${error.message}`);
        });
    } else {
      audio.pause();
      setStatus("Playback paused. Press Space to resume.");
    }
  }, [ensureAudioGraph, updateAudioGraph]);

  const seek = useCallback((time) => {
    const audio = audioRef.current;
    if (!audio || !Number.isFinite(audio.duration)) return;
    audio.currentTime = Math.min(audio.duration, Math.max(0, time));
    setCurrentTime(audio.currentTime);
  }, []);

  const audioHandlers = useMemo(() => ({
    onPlay: () => setPlaying(true),
    onPause: () => setPlaying(false),
    onTimeUpdate: (event) => {
      const time = event.currentTarget.currentTime || 0;
      setCurrentTime(time);
      if (mode.current === "chapterQueue") {
        const entry = queue.current[queueCursor.current];
        if (Number.isFinite(entry?.endAt) && time >= entry.endAt - 0.02) handleEnded();
      }
    },
    onDurationChange: (event) => setMediaDuration(Number.isFinite(event.currentTarget.duration) ? event.currentTarget.duration : 0),
    onLoadedMetadata: (event) => setMediaDuration(Number.isFinite(event.currentTarget.duration) ? event.currentTarget.duration : 0),
    onEnded: handleEnded,
    onError: handleError,
  }), [handleEnded, handleError]);

  return { audioRef, audioHandlers, meteringRef, current, status, setStatus, playing, currentTime, mediaDuration, liveMasteringAvailable, fileForTrack, previewFile, previewRendered, previewMasteringComparison, playSequence, previewChapter, stop, togglePlayback, seek };
};
