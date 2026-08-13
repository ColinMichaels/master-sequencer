import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AFTER_TRACK_MODES, normalizeAfterTrackMode, readAfterTrackMode, writeAfterTrackMode } from "../lib/after-track.js";
import { api, sourceKey } from "../lib/api.js";
import { normalizeMastering } from "../lib/mastering.js";
import { buildLiveSequenceEntries, liveEnvelopeGainAt, liveTransitionSourceTime } from "../lib/live-sequence.js";
import { applyLiveMasteringSettings, applyLivePlaybackEnvelope, comparisonPlaybackStart, createLiveMasteringGraph, normalizeMasterMonitorMode, playbackBypassesMastering, setMasterMonitorMode } from "../lib/live-mastering.js";

const clamp = (value, minimum, maximum) => Math.min(maximum, Math.max(minimum, value));
const queueModes = new Set(["queue", "chapterQueue"]);
const entryLoadKey = (entry) => entry?.url ? `url:${entry.url}` : entry?.file?.key ? `file:${entry.file.key}` : "";
const entrySource = (entry) => entry?.url || (entry?.file?.key ? api.mediaUrl(entry.file.key) : "");

export const useTransport = ({ libraryMap, masterBus, masteringPath = "basic", advancedMastering, liveTracks = [] }) => {
  const firstAudioRef = useRef(null);
  const secondAudioRef = useRef(null);
  const audioRefs = useMemo(() => [firstAudioRef, secondAudioRef], []);
  const audioGraphs = useRef([null, null]);
  const deckEntries = useRef([null, null]);
  const deckEnvelopeOptions = useRef([{}, {}]);
  const deckPlayTokens = useRef([0, 0]);
  const activeDeckRef = useRef(0);
  const currentRef = useRef(null);
  const masterBusRef = useRef(masterBus);
  const masteringPathRef = useRef(masteringPath);
  const advancedMasteringRef = useRef(advancedMastering);
  const liveTracksRef = useRef(liveTracks);
  const meteringRef = useRef(null);
  const afterTrackModeRef = useRef(AFTER_TRACK_MODES.AUTO_NEXT);
  const playbackIntent = useRef(false);
  const mode = useRef("idle");
  const queue = useRef([]);
  const queueCursor = useRef(0);
  const completionMessage = useRef("Preview complete.");
  const transitionStarted = useRef("");
  const overlapState = useRef(null);
  const overlapTimer = useRef(null);
  const gapState = useRef(null);
  const gapTimer = useRef(null);
  const lastUiUpdate = useRef(0);
  const advanceQueueRef = useRef(() => {});

  const [activeDeck, setActiveDeck] = useState(0);
  const [current, setCurrent] = useState(null);
  const [status, setStatus] = useState("Ready");
  const [playing, setPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [mediaDuration, setMediaDuration] = useState(0);
  const [liveMasteringAvailable, setLiveMasteringAvailable] = useState(null);
  const [monitorMode, setMonitorModeState] = useState("stereo");
  const [afterTrackMode, setAfterTrackModeState] = useState(() => readAfterTrackMode());

  masterBusRef.current = masterBus;
  masteringPathRef.current = masteringPath;
  advancedMasteringRef.current = advancedMastering;
  liveTracksRef.current = liveTracks;
  afterTrackModeRef.current = afterTrackMode;

  const activeAudio = useCallback(() => audioRefs[activeDeckRef.current]?.current || null, [audioRefs]);
  const preparedDeckForEntry = useCallback((entry) => {
    const loadKey = entryLoadKey(entry);
    const preparedDeck = audioRefs.findIndex((ref) => ref.current?.dataset.loadedEntryKey === loadKey && ref.current?.src);
    return preparedDeck >= 0 ? preparedDeck : activeDeckRef.current;
  }, [audioRefs]);

  const fileForTrack = useCallback((track) => {
    const candidate = track.candidates.find((item) => item.id === track.auditionCandidateId);
    return candidate ? libraryMap.get(sourceKey(candidate.sourceRef)) : null;
  }, [libraryMap]);

  const liveSettingsForEntry = useCallback((entry) => {
    const liveTrack = entry?.track?.id ? liveTracksRef.current.find((track) => track.id === entry.track.id) : null;
    const sourceBypassed = playbackBypassesMastering(entry);
    const trackGainDb = sourceBypassed ? 0 : Number(liveTrack?.mastering?.gainDb ?? entry?.track?.mastering?.gainDb ?? 0);
    return { sourceBypassed, trackGainDb };
  }, []);

  const meteringForGraph = useCallback((graph) => graph ? {
    compressor: graph.compressor,
    limiter: graph.limiter,
    eqInputAnalyser: graph.eqInputAnalyser,
    frequencyAnalyser: graph.frequencyAnalyser,
    leftAnalyser: graph.leftAnalyser,
    rightAnalyser: graph.rightAnalyser,
    sampleRate: graph.context.sampleRate,
    monitorMode,
    processorMeterKeys: [],
  } : null, [monitorMode]);

  const updateAudioGraph = useCallback((entry = currentRef.current, deckIndex = activeDeckRef.current) => {
    const graph = audioGraphs.current[deckIndex];
    if (!graph) return;
    const result = applyLiveMasteringSettings(graph, masterBusRef.current, {
      ...liveSettingsForEntry(entry),
      masteringPath: masteringPathRef.current,
      advancedMastering: advancedMasteringRef.current,
    });
    if (deckIndex !== activeDeckRef.current) return;
    const meter = meteringForGraph(graph);
    if (meter && result?.metering) {
      meter.compressor = result.metering.compressor;
      meter.limiter = result.metering.limiter;
      const processorMeterKeys = Object.keys(result.metering.processorMeters || {});
      processorMeterKeys.forEach((key) => { meter[key] = result.metering.processorMeters[key]; });
      meter.processorMeterKeys = processorMeterKeys;
    }
    meteringRef.current = meter;
  }, [liveSettingsForEntry, meteringForGraph]);

  const ensureAudioGraph = useCallback((deckIndex = activeDeckRef.current) => {
    if (audioGraphs.current[deckIndex]) return audioGraphs.current[deckIndex];
    const AudioContextClass = window.AudioContext || window.webkitAudioContext;
    const audio = audioRefs[deckIndex]?.current;
    if (!audio || !AudioContextClass) {
      if (deckIndex === activeDeckRef.current) setLiveMasteringAvailable(false);
      return null;
    }
    try {
      const graph = createLiveMasteringGraph(audio, AudioContextClass);
      audioGraphs.current[deckIndex] = graph;
      if (graph) setMasterMonitorMode(graph, monitorMode);
      updateAudioGraph(deckEntries.current[deckIndex], deckIndex);
      if (deckIndex === activeDeckRef.current) {
        meteringRef.current = meteringForGraph(graph);
        setLiveMasteringAvailable(Boolean(graph));
      }
      return graph;
    } catch {
      if (deckIndex === activeDeckRef.current) setLiveMasteringAvailable(false);
      return null;
    }
  }, [audioRefs, meteringForGraph, monitorMode, updateAudioGraph]);

  const resumeAudioGraph = useCallback((deckIndex = activeDeckRef.current) => {
    const context = audioGraphs.current[deckIndex]?.context;
    if (context?.state === "suspended" && typeof context.resume === "function") context.resume().catch(() => {});
  }, []);

  const suspendAudioGraph = useCallback((deckIndex) => {
    const context = audioGraphs.current[deckIndex]?.context;
    if (context?.state === "running" && typeof context.suspend === "function") context.suspend().catch(() => {});
  }, []);

  const suspendAudioGraphs = useCallback(() => {
    audioGraphs.current.forEach((_, deckIndex) => suspendAudioGraph(deckIndex));
  }, [suspendAudioGraph]);

  const applyDeckEnvelope = useCallback((deckIndex, entry = deckEntries.current[deckIndex], sourceTime = audioRefs[deckIndex]?.current?.currentTime || 0) => {
    const graph = audioGraphs.current[deckIndex];
    const audio = audioRefs[deckIndex]?.current;
    if (audio) {
      audio.dataset.liveTrimStart = String(entry?.settings?.trimStart ?? 0);
      audio.dataset.liveTrimEnd = String(entry?.settings?.trimEnd ?? entry?.file?.duration ?? 0);
      audio.dataset.liveFadeIn = String(entry?.settings?.fadeIn ?? 0);
      audio.dataset.liveEndMode = entry?.settings?.endMode || "natural";
      audio.dataset.liveEndDuration = String(entry?.settings?.endDuration ?? 0);
      audio.dataset.liveCrossfadeIn = String(deckEnvelopeOptions.current[deckIndex]?.crossfadeDuration || 0);
    }
    if (!graph) return;
    applyLivePlaybackEnvelope(graph, entry?.settings, sourceTime, deckEnvelopeOptions.current[deckIndex]);
  }, [audioRefs]);

  const preloadEntry = useCallback((entry, deckIndex) => {
    const audio = audioRefs[deckIndex]?.current;
    const loadKey = entryLoadKey(entry);
    const source = entrySource(entry);
    if (!audio || !loadKey || !source) return;
    const alreadyLoaded = audio.dataset.loadedEntryKey === loadKey && Boolean(audio.src);

    const token = ++deckPlayTokens.current[deckIndex];
    deckEntries.current[deckIndex] = entry;
    deckEnvelopeOptions.current[deckIndex] = {};
    audio.dataset.loadedEntryKey = loadKey;
    audio.preload = "auto";
    if (!alreadyLoaded) {
      audio.src = source;
      audio.load();
    }

    const prepareTrimStart = () => {
      if (token !== deckPlayTokens.current[deckIndex] || audio.dataset.loadedEntryKey !== loadKey) return;
      audio.currentTime = Math.min(entry.startAt, Math.max(0, (entry.file?.duration || audio.duration || 0) - 0.05));
      applyDeckEnvelope(deckIndex, entry, audio.currentTime);
    };
    if (audio.readyState >= 1) prepareTrimStart();
    else audio.addEventListener("loadedmetadata", prepareTrimStart, { once: true });
  }, [applyDeckEnvelope, audioRefs]);

  const clearOverlapTimer = useCallback(() => {
    if (overlapTimer.current !== null) window.clearTimeout(overlapTimer.current);
    overlapTimer.current = null;
  }, []);

  const clearGapTimer = useCallback(() => {
    if (gapTimer.current !== null) window.clearTimeout(gapTimer.current);
    gapTimer.current = null;
  }, []);

  const finishOverlap = useCallback(() => {
    clearOverlapTimer();
    const overlap = overlapState.current;
    if (!overlap) return;
    const outgoing = audioRefs[overlap.outgoingDeck]?.current;
    outgoing?.pause();
    suspendAudioGraph(overlap.outgoingDeck);
    overlapState.current = null;
    const followingEntry = queue.current[queueCursor.current + 1];
    if (queueModes.has(mode.current) && followingEntry) preloadEntry(followingEntry, overlap.outgoingDeck);
  }, [audioRefs, clearOverlapTimer, preloadEntry, suspendAudioGraph]);

  const scheduleOverlapFinish = useCallback(() => {
    clearOverlapTimer();
    const overlap = overlapState.current;
    if (!overlap) return;
    const outgoing = audioRefs[overlap.outgoingDeck]?.current;
    const remainingMs = Math.max(0, ((overlap.outgoingEntry?.endAt || 0) - (outgoing?.currentTime || 0)) * 1_000);
    if (remainingMs <= 5) finishOverlap();
    else overlapTimer.current = window.setTimeout(finishOverlap, remainingMs);
  }, [audioRefs, clearOverlapTimer, finishOverlap]);

  useEffect(() => {
    audioGraphs.current.forEach((graph, deckIndex) => {
      if (graph) updateAudioGraph(deckEntries.current[deckIndex], deckIndex);
    });
  }, [masterBus, masteringPath, advancedMastering, liveTracks, updateAudioGraph]);

  useEffect(() => () => {
    clearGapTimer();
    clearOverlapTimer();
    audioGraphs.current.forEach((graph) => {
      if (!graph) return;
      try { graph.source.disconnect(); } catch { /* Already disconnected. */ }
      Promise.resolve(graph.context.close?.()).catch(() => {});
    });
  }, [clearGapTimer, clearOverlapTimer]);

  const playEntry = useCallback((entry, startAt = entry?.startAt || 0, options = {}) => {
    const deckIndex = options.deckIndex ?? activeDeckRef.current;
    const keepOtherPlaying = Boolean(options.keepOtherPlaying);
    const autoplay = options.autoplay !== false;
    const audio = audioRefs[deckIndex]?.current;
    if ((!entry?.file && !entry?.url) || !audio) return;
    const loadKey = entryLoadKey(entry);
    const source = entrySource(entry);
    const usePreloadedSource = audio.dataset.loadedEntryKey === loadKey && Boolean(audio.src);

    if (!keepOtherPlaying) {
      clearOverlapTimer();
      overlapState.current = null;
      audioRefs.forEach((ref, index) => {
        if (index === deckIndex) return;
        ref.current?.pause();
        suspendAudioGraph(index);
      });
    }
    clearGapTimer();
    gapState.current = null;
    transitionStarted.current = "";
    const token = ++deckPlayTokens.current[deckIndex];
    deckEntries.current[deckIndex] = entry;
    deckEnvelopeOptions.current[deckIndex] = options.envelopeOptions || {};
    activeDeckRef.current = deckIndex;
    setActiveDeck(deckIndex);
    currentRef.current = entry;
    setCurrent(entry);
    playbackIntent.current = autoplay;
    setPlaying(autoplay);
    setCurrentTime(startAt);
    setMediaDuration(entry.file?.duration || 0);

    const graph = autoplay ? ensureAudioGraph(deckIndex) : audioGraphs.current[deckIndex];
    updateAudioGraph(entry, deckIndex);
    if (deckIndex === activeDeckRef.current) meteringRef.current = meteringForGraph(graph);
    if (autoplay) resumeAudioGraph(deckIndex);

    audio.muted = true;
    audio.volume = 1;
    audio.preload = "auto";
    audio.dataset.loadedEntryKey = loadKey;
    if (!usePreloadedSource) {
      audio.src = source;
      audio.load();
    }
    const safeStart = Math.min(startAt, Math.max(0, (entry.file?.duration || audio.duration || 0) - 0.05));
    const reportPlaybackError = (error) => {
      if (error?.name === "AbortError" && audio.paused) return;
      if (token === deckPlayTokens.current[deckIndex]) {
        playbackIntent.current = false;
        setPlaying(false);
        setStatus(`Playback needs a direct play gesture: ${error.message}`);
      }
    };
    const beginAtEdit = () => {
      if (token !== deckPlayTokens.current[deckIndex]) return;
      audio.currentTime = safeStart;
      applyDeckEnvelope(deckIndex, entry, safeStart);
      audio.muted = false;
      if (autoplay) audio.play().catch(reportPlaybackError);
      else {
        audio.pause();
        suspendAudioGraphs();
      }
    };

    if (audio.readyState >= 1) beginAtEdit();
    else {
      audio.addEventListener("loadedmetadata", beginAtEdit, { once: true });
      if (autoplay) audio.play().catch(reportPlaybackError);
    }
  }, [applyDeckEnvelope, audioRefs, clearGapTimer, clearOverlapTimer, ensureAudioGraph, meteringForGraph, resumeAudioGraph, suspendAudioGraph, suspendAudioGraphs, updateAudioGraph]);

  const completeSequence = useCallback((message) => {
    clearGapTimer();
    finishOverlap();
    audioRefs.forEach((ref) => ref.current?.pause());
    mode.current = "idle";
    playbackIntent.current = false;
    setPlaying(false);
    setStatus(message);
    suspendAudioGraphs();
  }, [audioRefs, clearGapTimer, finishOverlap, suspendAudioGraphs]);

  const continueAfterGap = useCallback(() => {
    const gap = gapState.current;
    if (!gap) return;
    clearGapTimer();
    gapState.current = null;
    queueCursor.current = gap.nextCursor;
    playEntry(gap.nextEntry, gap.nextEntry.startAt, { deckIndex: gap.nextDeck });
    const followingEntry = queue.current[gap.nextCursor + 1];
    if (followingEntry) preloadEntry(followingEntry, gap.nextDeck === 0 ? 1 : 0);
  }, [clearGapTimer, playEntry, preloadEntry]);

  const scheduleGap = useCallback((entry, nextEntry, nextCursor, nextDeck) => {
    const remainingMs = Math.max(0, (entry.settings?.gapAfter || 0) * 1_000);
    gapState.current = { remainingMs, startedAt: performance.now(), nextEntry, nextCursor, nextDeck };
    playbackIntent.current = true;
    setPlaying(true);
    setStatus(`${entry.trackTitle} complete. Auditioning the ${entry.settings.gapAfter.toFixed(1)}s gap before ${nextEntry.trackTitle}.`);
    gapTimer.current = window.setTimeout(continueAfterGap, remainingMs);
  }, [continueAfterGap]);

  const restartCurrentEntry = useCallback((deckIndex, entry, { autoplay }) => {
    const audio = audioRefs[deckIndex]?.current;
    if (!audio || !entry) return;
    clearOverlapTimer();
    overlapState.current = null;
    clearGapTimer();
    gapState.current = null;
    transitionStarted.current = "";
    playbackIntent.current = autoplay;
    setPlaying(autoplay);
    audioRefs.forEach((ref, index) => {
      if (index !== deckIndex) ref.current?.pause();
    });
    audio.pause();
    audio.currentTime = entry.startAt;
    applyDeckEnvelope(deckIndex, entry, entry.startAt);
    setCurrentTime(entry.startAt);
    if (!autoplay) {
      suspendAudioGraphs();
      return;
    }
    ensureAudioGraph(deckIndex);
    resumeAudioGraph(deckIndex);
    audio.play().catch((error) => {
      playbackIntent.current = false;
      setPlaying(false);
      setStatus(`Playback needs a direct play gesture: ${error.message}`);
    });
  }, [applyDeckEnvelope, audioRefs, clearGapTimer, clearOverlapTimer, ensureAudioGraph, resumeAudioGraph, suspendAudioGraphs]);

  const advanceQueue = useCallback((deckIndex, { crossfade = false } = {}) => {
    if (!queueModes.has(mode.current) || deckIndex !== activeDeckRef.current) return;
    const entry = deckEntries.current[deckIndex];
    const boundaryMode = afterTrackModeRef.current;

    if (boundaryMode === AFTER_TRACK_MODES.LOOP_CURRENT) {
      restartCurrentEntry(deckIndex, entry, { autoplay: true });
      setStatus(`Looping ${entry.trackTitle} from its trim start.`);
      return;
    }

    if (boundaryMode === AFTER_TRACK_MODES.RESET_CURRENT) {
      restartCurrentEntry(deckIndex, entry, { autoplay: false });
      setStatus(`${entry.trackTitle} reset to its trim start. Press Space to play.`);
      return;
    }

    const nextCursor = queueCursor.current + 1;
    const nextEntry = queue.current[nextCursor];
    if (!nextEntry) {
      completeSequence(boundaryMode === AFTER_TRACK_MODES.CUE_NEXT
        ? `${entry.trackTitle} complete. No next track is available to cue.`
        : mode.current === "chapterQueue" ? "Chaptered program preview complete." : "Edited working-order audition complete.");
      return;
    }

    const nextDeck = deckIndex === 0 ? 1 : 0;
    if (boundaryMode === AFTER_TRACK_MODES.CUE_NEXT) {
      audioRefs[deckIndex]?.current?.pause();
      suspendAudioGraph(deckIndex);
      queueCursor.current = nextCursor;
      playEntry(nextEntry, nextEntry.startAt, { autoplay: false, deckIndex: nextDeck });
      const followingEntry = queue.current[nextCursor + 1];
      if (followingEntry) preloadEntry(followingEntry, deckIndex);
      setStatus(`${nextEntry.trackTitle} cued at its trim start. Press Space to play.`);
      return;
    }

    if (crossfade && entry?.overlap > 0) {
      queueCursor.current = nextCursor;
      const crossfadeStart = nextEntry.settings.trimStart;
      playEntry(nextEntry, crossfadeStart, {
        deckIndex: nextDeck,
        keepOtherPlaying: true,
        envelopeOptions: { crossfadeStart, crossfadeDuration: entry.overlap },
      });
      overlapState.current = { outgoingDeck: deckIndex, incomingDeck: nextDeck, outgoingEntry: entry };
      scheduleOverlapFinish();
      setStatus(`Crossfading ${entry.trackTitle} into ${nextEntry.trackTitle} over ${entry.overlap.toFixed(1)}s.`);
      return;
    }

    audioRefs[deckIndex]?.current?.pause();
    suspendAudioGraph(deckIndex);
    if ((entry?.settings?.gapAfter || 0) > 0) {
      scheduleGap(entry, nextEntry, nextCursor, nextDeck);
      return;
    }
    queueCursor.current = nextCursor;
    playEntry(nextEntry, nextEntry.startAt, { deckIndex: nextDeck });
    const followingEntry = queue.current[nextCursor + 1];
    if (followingEntry) preloadEntry(followingEntry, deckIndex);
  }, [audioRefs, completeSequence, playEntry, preloadEntry, restartCurrentEntry, scheduleGap, scheduleOverlapFinish, suspendAudioGraph]);

  advanceQueueRef.current = advanceQueue;

  const processTimeline = useCallback((deckIndex, sourceTime) => {
    if (!queueModes.has(mode.current) || gapState.current || deckIndex !== activeDeckRef.current) return;
    const entry = deckEntries.current[deckIndex];
    if (!entry?.settings) return;
    const autoNext = afterTrackModeRef.current === AFTER_TRACK_MODES.AUTO_NEXT;
    const transitionAt = liveTransitionSourceTime(entry);
    if (autoNext && entry.overlap > 0 && sourceTime >= transitionAt - 0.015) {
      const key = `${entry.track?.id || entry.trackTitle}:${deckIndex}`;
      if (transitionStarted.current !== key) {
        transitionStarted.current = key;
        advanceQueueRef.current(deckIndex, { crossfade: true });
      }
      return;
    }
    if ((!autoNext || entry.overlap <= 0) && sourceTime >= entry.endAt - 0.015) advanceQueueRef.current(deckIndex);
  }, []);

  useEffect(() => {
    if (!playing || typeof window.requestAnimationFrame !== "function") return undefined;
    let frame = 0;
    const tick = (timestamp) => {
      if (gapState.current) {
        frame = window.requestAnimationFrame(tick);
        return;
      }
      const deckIndex = activeDeckRef.current;
      const audio = audioRefs[deckIndex]?.current;
      audioRefs.forEach((ref, index) => {
        const deckAudio = ref.current;
        const entry = deckEntries.current[index];
        if (!deckAudio || deckAudio.paused) return;
        deckAudio.volume = audioGraphs.current[index] || !entry?.settings
          ? 1
          : liveEnvelopeGainAt(entry.settings, deckAudio.currentTime || 0, deckEnvelopeOptions.current[index]);
      });
      if (audio && !audio.paused) {
        if (timestamp - lastUiUpdate.current >= 50) {
          setCurrentTime(audio.currentTime || 0);
          lastUiUpdate.current = timestamp;
        }
        processTimeline(deckIndex, audio.currentTime || 0);
      }
      frame = window.requestAnimationFrame(tick);
    };
    frame = window.requestAnimationFrame(tick);
    return () => window.cancelAnimationFrame(frame);
  }, [audioRefs, playing, processTimeline]);

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
    const audio = activeAudio();
    const elapsed = activeEntry?.masteringComparison?.id === comparisonId && audio
      ? Math.max(0, audio.currentTime - Number(activeEntry.comparisonStartAt || 0))
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
  }, [activeAudio, playEntry]);

  const playSequence = useCallback((album, startIndex = 0, startAt = null) => {
    const entries = buildLiveSequenceEntries(album, fileForTrack, startIndex);
    if (!entries.length) {
      setStatus("No playable source exists from this position.");
      return;
    }
    const skipped = album.tracks.slice(startIndex).length - entries.length;
    mode.current = "queue";
    queue.current = entries;
    queueCursor.current = 0;
    const first = entries[0];
    const requestedStart = Number.isFinite(startAt) ? clamp(startAt, first.startAt, first.endAt - 0.01) : first.startAt;
    setStatus(skipped
      ? `Auditioning the edited order; ${skipped} missing source ${skipped === 1 ? "is" : "are"} skipped.`
      : "Auditioning the edited working order with live trims, fades, gaps, and crossfades.");
    const firstDeck = preparedDeckForEntry(first);
    playEntry(first, requestedStart, { deckIndex: firstDeck });
    if (entries[1]) preloadEntry(entries[1], firstDeck === 0 ? 1 : 0);
  }, [fileForTrack, playEntry, preloadEntry, preparedDeckForEntry]);

  const navigateSequence = useCallback((album, direction) => {
    if (!album?.tracks?.length || ![-1, 1].includes(direction)) return;
    const playable = buildLiveSequenceEntries(album, fileForTrack);
    if (!playable.length) {
      setStatus("No playable track exists in the main sequence.");
      return;
    }
    const currentPlayableIndex = playable.findIndex((entry) => entry.track.id === currentRef.current?.track?.id);
    const targetPlayableIndex = currentPlayableIndex < 0
      ? direction > 0 ? 0 : playable.length - 1
      : currentPlayableIndex + direction;
    if (targetPlayableIndex < 0 || targetPlayableIndex >= playable.length) {
      setStatus(direction < 0 ? "Already at the first playable track." : "Already at the last playable track.");
      return;
    }
    const entries = playable.slice(targetPlayableIndex);
    const target = entries[0];
    const autoplay = Boolean((activeAudio()?.src && !activeAudio()?.paused) || gapState.current && playing);
    mode.current = "queue";
    queue.current = entries;
    queueCursor.current = 0;
    completionMessage.current = "Edited working-order audition complete.";
    setStatus(autoplay
      ? `Playing ${target.trackTitle} with its saved trims and fades.`
      : `${target.trackTitle} selected at its trim start. Press Space to play.`);
    const targetDeck = preparedDeckForEntry(target);
    playEntry(target, target.startAt, { autoplay, deckIndex: targetDeck });
    if (entries[1]) preloadEntry(entries[1], targetDeck === 0 ? 1 : 0);
  }, [activeAudio, fileForTrack, playEntry, playing, preloadEntry, preparedDeckForEntry]);

  const previewChapter = useCallback((album, startIndex = 0) => {
    const entries = buildLiveSequenceEntries(album, fileForTrack, startIndex);
    if (!entries.length) {
      setStatus("No playable chapter exists from this cue.");
      return;
    }
    mode.current = "chapterQueue";
    queue.current = entries;
    queueCursor.current = 0;
    setStatus("Playing the edited chapter with live trims, fades, gaps, and crossfades.");
    const firstDeck = preparedDeckForEntry(entries[0]);
    playEntry(entries[0], entries[0].startAt, { deckIndex: firstDeck });
    if (entries[1]) preloadEntry(entries[1], firstDeck === 0 ? 1 : 0);
  }, [fileForTrack, playEntry, preloadEntry, preparedDeckForEntry]);

  const stop = useCallback((message = "Ready") => {
    clearGapTimer();
    clearOverlapTimer();
    gapState.current = null;
    overlapState.current = null;
    deckPlayTokens.current = deckPlayTokens.current.map((token) => token + 1);
    audioRefs.forEach((ref) => ref.current?.pause());
    mode.current = "idle";
    queue.current = [];
    deckEntries.current = [null, null];
    currentRef.current = null;
    setCurrent(null);
    playbackIntent.current = false;
    setPlaying(false);
    setCurrentTime(0);
    setMediaDuration(0);
    setStatus(message);
    suspendAudioGraphs();
  }, [audioRefs, clearGapTimer, clearOverlapTimer, suspendAudioGraphs]);

  const selectAuditionSource = useCallback((album, trackId, candidateId) => {
    const targetIndex = album?.tracks?.findIndex((track) => track.id === trackId) ?? -1;
    if (targetIndex < 0) return;
    const updatedAlbum = {
      ...album,
      tracks: album.tracks.map((track) => track.id === trackId ? { ...track, auditionCandidateId: candidateId } : track),
    };
    const entries = buildLiveSequenceEntries(updatedAlbum, fileForTrack, targetIndex);
    const targetEntry = entries.find((entry) => entry.track.id === trackId);
    if (!targetEntry) {
      stop(`${updatedAlbum.tracks[targetIndex].title} source changed, but the selected audio is unavailable.`);
      return;
    }
    mode.current = "queue";
    queue.current = entries.slice(entries.indexOf(targetEntry));
    queueCursor.current = 0;
    completionMessage.current = "Edited working-order audition complete.";
    setStatus(`${targetEntry.trackTitle} source changed. Playback stopped at the new source trim; press Space to play.`);
    const targetDeck = preparedDeckForEntry(targetEntry);
    playEntry(targetEntry, targetEntry.startAt, { autoplay: false, deckIndex: targetDeck });
    if (queue.current[1]) preloadEntry(queue.current[1], targetDeck === 0 ? 1 : 0);
  }, [fileForTrack, playEntry, preloadEntry, preparedDeckForEntry, stop]);

  const pauseGap = useCallback(() => {
    const gap = gapState.current;
    if (!gap) return;
    clearGapTimer();
    gap.remainingMs = Math.max(0, gap.remainingMs - (performance.now() - gap.startedAt));
    playbackIntent.current = false;
    setPlaying(false);
    setStatus("Playback paused during the inter-track gap. Press Space to resume.");
  }, [clearGapTimer]);

  const resumeGap = useCallback(() => {
    const gap = gapState.current;
    if (!gap) return;
    gap.startedAt = performance.now();
    playbackIntent.current = true;
    setPlaying(true);
    setStatus(`Resuming the inter-track gap before ${gap.nextEntry.trackTitle}.`);
    gapTimer.current = window.setTimeout(continueAfterGap, gap.remainingMs);
  }, [continueAfterGap]);

  const togglePlayback = useCallback(() => {
    if (gapState.current) {
      if (playbackIntent.current) pauseGap();
      else resumeGap();
      return;
    }
    const audio = activeAudio();
    if (!audio?.src) return;
    if (!playbackIntent.current) {
      const deckIndex = activeDeckRef.current;
      const token = ++deckPlayTokens.current[deckIndex];
      playbackIntent.current = true;
      setPlaying(true);
      const graph = ensureAudioGraph(deckIndex);
      updateAudioGraph(currentRef.current, deckIndex);
      resumeAudioGraph(deckIndex);
      const resumeCurrentDeck = () => {
        if (token !== deckPlayTokens.current[deckIndex] || !playbackIntent.current) return Promise.resolve();
        const entry = currentRef.current;
        if (entry && (audio.currentTime < entry.startAt || audio.currentTime >= entry.endAt)) audio.currentTime = entry.startAt;
        applyDeckEnvelope(deckIndex, entry, audio.currentTime || entry?.startAt || 0);
        audio.muted = false;
        return audio.play();
      };
      const activePlay = audio.readyState >= 1
        ? resumeCurrentDeck()
        : new Promise((resolve, reject) => audio.addEventListener("loadedmetadata", () => resumeCurrentDeck().then(resolve, reject), { once: true }));
      const plays = [activePlay];
      const overlap = overlapState.current;
      if (overlap) {
        const outgoing = audioRefs[overlap.outgoingDeck]?.current;
        if (outgoing?.src) {
          ensureAudioGraph(overlap.outgoingDeck);
          applyDeckEnvelope(overlap.outgoingDeck);
          resumeAudioGraph(overlap.outgoingDeck);
          plays.push(outgoing.play());
          scheduleOverlapFinish();
        }
      }
      Promise.all(plays)
        .then(() => {
          if (token === deckPlayTokens.current[deckIndex] && playbackIntent.current) setStatus("Playback resumed with the saved edit timing. Press Space to pause.");
        })
        .catch((error) => {
          if (token !== deckPlayTokens.current[deckIndex] || error.name === "AbortError" && audio.paused) return;
          playbackIntent.current = false;
          setPlaying(false);
          setStatus(`Playback needs a direct play gesture: ${error.message}`);
        });
    } else {
      clearOverlapTimer();
      playbackIntent.current = false;
      deckPlayTokens.current[activeDeckRef.current] += 1;
      audioRefs.forEach((ref) => ref.current?.pause());
      setPlaying(false);
      suspendAudioGraphs();
      setStatus("Playback paused. Press Space to resume the edited sequence.");
    }
  }, [activeAudio, applyDeckEnvelope, audioRefs, clearOverlapTimer, ensureAudioGraph, pauseGap, resumeAudioGraph, resumeGap, scheduleOverlapFinish, suspendAudioGraphs, updateAudioGraph]);

  const seek = useCallback((time) => {
    const audio = activeAudio();
    if (!audio || !Number.isFinite(audio.duration)) return;
    finishOverlap();
    const entry = currentRef.current;
    const minimum = entry?.settings?.trimStart || 0;
    const maximum = entry?.settings?.trimEnd || audio.duration;
    audio.currentTime = clamp(time, minimum, maximum);
    transitionStarted.current = "";
    applyDeckEnvelope(activeDeckRef.current, entry, audio.currentTime);
    setCurrentTime(audio.currentTime);
    processTimeline(activeDeckRef.current, audio.currentTime);
  }, [activeAudio, applyDeckEnvelope, finishOverlap, processTimeline]);

  const handleEnded = useCallback((deckIndex) => {
    if (deckIndex !== activeDeckRef.current || !playbackIntent.current) return;
    if (queueModes.has(mode.current)) {
      advanceQueueRef.current(deckIndex);
      return;
    }
    if (mode.current === "single") {
      mode.current = "idle";
      playbackIntent.current = false;
      setPlaying(false);
      setStatus(completionMessage.current);
    }
  }, []);

  const handleError = useCallback((deckIndex) => {
    if (deckIndex !== activeDeckRef.current) return;
    playbackIntent.current = false;
    setPlaying(false);
    if (queueModes.has(mode.current)) {
      const failedEntry = deckEntries.current[deckIndex];
      const nextCursor = queueCursor.current + 1;
      const nextEntry = queue.current[nextCursor];
      if (nextEntry) {
        queueCursor.current = nextCursor;
        setStatus(`${failedEntry?.trackTitle || "A source"} could not be played; continuing with the next available track.`);
        playEntry(nextEntry, nextEntry.startAt, { deckIndex: deckIndex === 0 ? 1 : 0 });
      } else {
        mode.current = "idle";
        setStatus(`${failedEntry?.trackTitle || "The final source"} could not be played. Sequence preview stopped.`);
      }
      return;
    }
    mode.current = "idle";
    setStatus("This audio source could not be played. Reconnect or rescan its configured path, then try again.");
  }, [playEntry]);

  const audioHandlers = useMemo(() => [0, 1].map((deckIndex) => ({
    onPlay: (event) => {
      resumeAudioGraph(deckIndex);
      if (deckIndex === activeDeckRef.current) {
        if (!playbackIntent.current) {
          event.currentTarget.pause();
          return;
        }
        setPlaying(true);
      }
    },
    onPause: (event) => {
      if (deckIndex === activeDeckRef.current && !gapState.current && event.currentTarget.paused && !playbackIntent.current) setPlaying(false);
    },
    onTimeUpdate: (event) => {
      if (deckIndex !== activeDeckRef.current) return;
      const time = event.currentTarget.currentTime || 0;
      setCurrentTime(time);
      processTimeline(deckIndex, time);
    },
    onDurationChange: (event) => {
      if (deckIndex === activeDeckRef.current) setMediaDuration(Number.isFinite(event.currentTarget.duration) ? event.currentTarget.duration : 0);
    },
    onLoadedMetadata: (event) => {
      if (deckIndex === activeDeckRef.current) setMediaDuration(Number.isFinite(event.currentTarget.duration) ? event.currentTarget.duration : 0);
    },
    onEnded: () => handleEnded(deckIndex),
    onError: () => handleError(deckIndex),
  })), [handleEnded, handleError, processTimeline, resumeAudioGraph]);

  const setMonitorMode = useCallback((value) => {
    const normalized = normalizeMasterMonitorMode(value);
    setMonitorModeState(normalized);
    audioGraphs.current.forEach((graph) => { if (graph) setMasterMonitorMode(graph, normalized); });
    if (meteringRef.current) meteringRef.current.monitorMode = normalized;
  }, []);

  const setAfterTrackMode = useCallback((value) => {
    const normalized = normalizeAfterTrackMode(value);
    afterTrackModeRef.current = normalized;
    setAfterTrackModeState(normalized);
    writeAfterTrackMode(normalized);
  }, []);

  return {
    audioRefs,
    audioHandlers,
    activeDeck,
    meteringRef,
    current,
    status,
    setStatus,
    playing,
    currentTime,
    mediaDuration,
    liveMasteringAvailable,
    monitorMode,
    setMonitorMode,
    afterTrackMode,
    setAfterTrackMode,
    fileForTrack,
    previewFile,
    previewRendered,
    previewMasteringComparison,
    playSequence,
    navigateSequence,
    previewChapter,
    selectAuditionSource,
    stop,
    togglePlayback,
    seek,
  };
};
