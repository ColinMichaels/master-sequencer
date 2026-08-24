import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createLinkedPlaybackSnapshot, linkedPlaybackChannelName, linkedPlaybackMessage, sanitizeLinkedPlaybackMessage } from "../lib/linked-playback.js";

const HEARTBEAT_MS = 2_000;
const PEER_STALE_MS = 6_500;
const SNAPSHOT_INTERVAL_MS = 200;

const createTabId = () => globalThis.crypto?.randomUUID?.() || `tab-${Date.now()}-${Math.random().toString(36).slice(2)}`;

export const useLinkedTransport = ({ transport, projectId, albums = [] }) => {
  const supported = typeof window !== "undefined" && typeof window.BroadcastChannel === "function";
  const tabIdRef = useRef("");
  if (!tabIdRef.current) tabIdRef.current = createTabId();
  const channelRef = useRef(null);
  const peersRef = useRef(new Map());
  const ownerIdRef = useRef("");
  const roleRef = useRef("available");
  const transportRef = useRef(transport);
  const albumsRef = useRef(albums);
  const lastSnapshotAtRef = useRef(0);
  const lastSnapshotSignatureRef = useRef("");
  const [role, setRole] = useState("available");
  const [peerCount, setPeerCount] = useState(0);
  const [remoteSnapshot, setRemoteSnapshot] = useState(null);

  transportRef.current = transport;
  albumsRef.current = albums;

  const setLocalRole = useCallback((nextRole) => {
    roleRef.current = nextRole;
    setRole(nextRole);
  }, []);

  const post = useCallback((type, details = {}) => {
    const message = linkedPlaybackMessage(tabIdRef.current, type, details);
    if (message) channelRef.current?.postMessage(message);
  }, []);

  const publishSnapshot = useCallback((force = false) => {
    if (roleRef.current !== "owner") return;
    const activeTransport = transportRef.current;
    const snapshot = createLinkedPlaybackSnapshot({
      current: activeTransport.current,
      currentTime: activeTransport.currentTime,
      mediaDuration: activeTransport.mediaDuration,
      playing: activeTransport.playing,
      albums: albumsRef.current,
    });
    const signature = JSON.stringify([
      snapshot.current?.trackId,
      snapshot.current?.trackTitle,
      snapshot.playing,
      snapshot.mediaDuration,
    ]);
    const now = Date.now();
    if (!force && signature === lastSnapshotSignatureRef.current && now - lastSnapshotAtRef.current < SNAPSHOT_INTERVAL_MS) return;
    lastSnapshotAtRef.current = now;
    lastSnapshotSignatureRef.current = signature;
    post("snapshot", { snapshot });
  }, [post]);

  const claimOwnership = useCallback(() => {
    ownerIdRef.current = tabIdRef.current;
    setRemoteSnapshot(null);
    setLocalRole("owner");
    post("claim");
  }, [post, setLocalRole]);

  useEffect(() => {
    if (!supported || !projectId) return undefined;
    const channel = new window.BroadcastChannel(linkedPlaybackChannelName(projectId));
    channelRef.current = channel;
    peersRef.current.clear();
    ownerIdRef.current = "";
    setPeerCount(0);
    setRemoteSnapshot(null);
    setLocalRole("available");

    const rememberPeer = (senderId) => {
      peersRef.current.set(senderId, Date.now());
      setPeerCount(peersRef.current.size);
    };

    channel.onmessage = (event) => {
      const message = sanitizeLinkedPlaybackMessage(event.data);
      if (!message || message.senderId === tabIdRef.current) return;
      rememberPeer(message.senderId);

      if (message.type === "hello") {
        post("heartbeat", { role: roleRef.current });
        publishSnapshot(true);
        return;
      }
      if (message.type === "heartbeat") {
        if (message.role === "owner" && roleRef.current !== "owner") {
          ownerIdRef.current = message.senderId;
          setLocalRole("follower");
        }
        return;
      }
      if (message.type === "claim") {
        ownerIdRef.current = message.senderId;
        setLocalRole("follower");
        transportRef.current.stop("Following playback from another linked tab.");
        return;
      }
      if (message.type === "snapshot") {
        if (roleRef.current === "owner" || ownerIdRef.current && ownerIdRef.current !== message.senderId) return;
        ownerIdRef.current = message.senderId;
        setLocalRole("follower");
        setRemoteSnapshot(message.snapshot);
        return;
      }
      if (message.type === "command" && roleRef.current === "owner") {
        if (message.command === "toggle") transportRef.current.togglePlayback();
        else if (message.command === "seek") transportRef.current.seek(message.time);
        else if (message.command === "stop") transportRef.current.stop("Playback stopped from a linked tab.");
        window.setTimeout(() => publishSnapshot(true), 0);
        return;
      }
      if (message.type === "release") {
        peersRef.current.delete(message.senderId);
        setPeerCount(peersRef.current.size);
        if (ownerIdRef.current === message.senderId) {
          ownerIdRef.current = "";
          setRemoteSnapshot(null);
          setLocalRole("available");
        }
      }
    };

    post("hello");
    const heartbeat = window.setInterval(() => {
      const now = Date.now();
      peersRef.current.forEach((seenAt, peerId) => {
        if (now - seenAt > PEER_STALE_MS) peersRef.current.delete(peerId);
      });
      setPeerCount(peersRef.current.size);
      post("heartbeat", { role: roleRef.current });
      publishSnapshot(true);
    }, HEARTBEAT_MS);

    const release = () => post("release");
    window.addEventListener("pagehide", release);
    return () => {
      release();
      window.removeEventListener("pagehide", release);
      window.clearInterval(heartbeat);
      channel.close();
      if (channelRef.current === channel) channelRef.current = null;
    };
  }, [post, projectId, publishSnapshot, setLocalRole, supported]);

  useEffect(() => {
    publishSnapshot();
  }, [publishSnapshot, transport.current, transport.currentTime, transport.mediaDuration, transport.playing, transport.status]);

  const runAsOwner = useCallback((method, args) => {
    claimOwnership();
    const result = transportRef.current[method](...args);
    window.setTimeout(() => publishSnapshot(true), 0);
    return result;
  }, [claimOwnership, publishSnapshot]);

  const routeCommandOrRun = useCallback((command, method, args) => {
    if (roleRef.current === "follower" && ownerIdRef.current && remoteSnapshot) {
      post("command", { command, ...(command === "seek" ? { time: args[0] } : {}) });
      return undefined;
    }
    return runAsOwner(method, args);
  }, [post, remoteSnapshot, runAsOwner]);

  const findRemoteTrack = useCallback((snapshot) => {
    if (!snapshot?.current?.trackId) return { album: null, track: null };
    const album = albums.find((item) => !snapshot.current.albumId || item.id === snapshot.current.albumId)
      || albums.find((item) => item.tracks?.some((track) => track.id === snapshot.current.trackId));
    return { album, track: album?.tracks?.find((track) => track.id === snapshot.current.trackId) || null };
  }, [albums]);

  const remoteCurrent = useMemo(() => {
    if (role !== "follower" || !remoteSnapshot?.current) return null;
    const { album, track } = findRemoteTrack(remoteSnapshot);
    return {
      track,
      file: track ? transport.fileForTrack(track) : null,
      albumTitle: remoteSnapshot.current.albumTitle || album?.title || "Linked tab",
      trackTitle: remoteSnapshot.current.trackTitle || track?.title || "Linked playback",
      nextTrackTitle: remoteSnapshot.current.nextTrackTitle,
      renderedPreview: remoteSnapshot.current.renderedPreview,
      referenceTrack: remoteSnapshot.current.referenceTrack,
      masteringComparison: remoteSnapshot.current.comparisonChannel ? { channel: remoteSnapshot.current.comparisonChannel } : null,
      linkedRemote: true,
    };
  }, [findRemoteTrack, remoteSnapshot, role, transport]);

  const openLinkedTab = useCallback(() => {
    if (!supported) return null;
    return window.open(window.location.href, "_blank", "noopener");
  }, [supported]);

  const linked = role === "follower" && Boolean(remoteSnapshot);
  const wrapOwnerMethod = (method) => (...args) => runAsOwner(method, args);

  return {
    ...transport,
    ...(linked ? {
      current: remoteCurrent,
      currentTime: remoteSnapshot.currentTime,
      mediaDuration: remoteSnapshot.mediaDuration,
      playing: remoteSnapshot.playing,
      status: "Following transport from another tab. Audio plays only in the owner tab.",
      liveMasteringAvailable: null,
    } : {}),
    previewFile: wrapOwnerMethod("previewFile"),
    previewRendered: wrapOwnerMethod("previewRendered"),
    previewMasteringComparison: wrapOwnerMethod("previewMasteringComparison"),
    playSequence: wrapOwnerMethod("playSequence"),
    navigateSequence: wrapOwnerMethod("navigateSequence"),
    previewChapter: wrapOwnerMethod("previewChapter"),
    selectAuditionSource: wrapOwnerMethod("selectAuditionSource"),
    togglePlayback: (...args) => routeCommandOrRun("toggle", "togglePlayback", args),
    seek: (...args) => routeCommandOrRun("seek", "seek", args),
    stop: (...args) => routeCommandOrRun("stop", "stop", args),
    linkedPlayback: {
      supported,
      peerCount,
      role: linked ? "follower" : role === "owner" ? "owner" : "available",
      openLinkedTab,
    },
  };
};
