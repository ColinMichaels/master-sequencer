import { useCallback, useEffect, useRef, useState } from "react";
import { api, sourceKey } from "../lib/api.js";
import { normalizeMastering } from "../lib/mastering.js";

export const useTransport = ({ libraryMap }) => {
  const audioRef = useRef(null);
  const [current, setCurrent] = useState(null);
  const [status, setStatus] = useState("Ready");
  const [playing, setPlaying] = useState(false);
  const mode = useRef("idle");
  const queue = useRef([]);
  const queueCursor = useRef(0);
  const completionMessage = useRef("Preview complete.");
  const playToken = useRef(0);

  const fileForTrack = useCallback((track) => {
    const candidate = track.candidates.find((item) => item.id === track.auditionCandidateId);
    return candidate ? libraryMap.get(sourceKey(candidate.sourceRef)) : null;
  }, [libraryMap]);

  const playEntry = useCallback((entry, startAt = entry?.startAt || 0) => {
    if ((!entry?.file && !entry?.url) || !audioRef.current) return;
    const audio = audioRef.current;
    const token = ++playToken.current;
    setCurrent(entry);
    audio.src = entry.url || api.mediaUrl(entry.file.key);
    audio.load();
    const start = () => {
      if (token !== playToken.current) return;
      audio.currentTime = Math.min(startAt, Math.max(0, (entry.file?.duration || audio.duration || 0) - 0.2));
      audio.play().catch((error) => {
        if (token === playToken.current) setStatus(`Playback needs a direct play gesture: ${error.message}`);
      });
    };
    if (audio.readyState >= 1) start();
    else audio.addEventListener("loadedmetadata", start, { once: true });
  }, []);

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
    playEntry({ url, trackTitle: label, albumTitle: options.albumTitle || "Mastering Preview" });
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
    setStatus(message);
  }, []);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return undefined;
    const onPlay = () => setPlaying(true);
    const onPause = () => setPlaying(false);
    audio.addEventListener("play", onPlay);
    audio.addEventListener("pause", onPause);
    audio.addEventListener("ended", handleEnded);
    const onTimeUpdate = () => {
      if (mode.current !== "chapterQueue") return;
      const entry = queue.current[queueCursor.current];
      if (Number.isFinite(entry?.endAt) && audio.currentTime >= entry.endAt - 0.02) handleEnded();
    };
    audio.addEventListener("timeupdate", onTimeUpdate);
    audio.addEventListener("error", handleError);
    return () => {
      audio.removeEventListener("play", onPlay);
      audio.removeEventListener("pause", onPause);
      audio.removeEventListener("ended", handleEnded);
      audio.removeEventListener("timeupdate", onTimeUpdate);
      audio.removeEventListener("error", handleError);
    };
  }, [handleEnded, handleError]);

  return { audioRef, current, status, setStatus, playing, fileForTrack, previewFile, previewRendered, playSequence, previewChapter, stop };
};
