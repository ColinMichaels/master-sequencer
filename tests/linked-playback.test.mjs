import test from "node:test";
import assert from "node:assert/strict";
import {
  createLinkedPlaybackSnapshot,
  linkedPlaybackChannelName,
  linkedPlaybackMessage,
  sanitizeLinkedPlaybackMessage,
} from "../src/lib/linked-playback.js";

test("linked playback channels are isolated by project", () => {
  assert.notEqual(linkedPlaybackChannelName("album-lab"), linkedPlaybackChannelName("second-project"));
  assert.match(linkedPlaybackChannelName("album/lab"), /album%2Flab$/);
});

test("transport snapshots contain coordination state without source paths or media objects", () => {
  const track = { id: "track-1", title: "Safe display title", candidates: [] };
  const snapshot = createLinkedPlaybackSnapshot({
    current: {
      track,
      file: { key: "root:/private/master.wav", path: "/private/master.wav", bytes: new Uint8Array([1, 2, 3]) },
      url: "blob:private-audio",
      trackTitle: track.title,
      albumTitle: "Album One",
      nextTrackTitle: "Next Track",
    },
    currentTime: 12.5,
    mediaDuration: 180,
    playing: true,
    status: "Playing",
    albums: [{ id: "album-1", title: "Album One", tracks: [track] }],
    sentAt: 42,
  });

  assert.deepEqual(snapshot.current, {
    trackId: "track-1",
    albumId: "album-1",
    albumTitle: "Album One",
    trackTitle: "Safe display title",
    nextTrackTitle: "Next Track",
    renderedPreview: false,
    referenceTrack: false,
    comparisonChannel: "",
  });
  assert.equal(JSON.stringify(snapshot).includes("/private/master.wav"), false);
  assert.equal(JSON.stringify(snapshot).includes("blob:private-audio"), false);
  assert.equal("status" in snapshot, false);
});

test("linked messages reject unknown commands and clamp untrusted playback values", () => {
  assert.equal(linkedPlaybackMessage("tab-1", "command", { command: "delete" }), null);
  assert.equal(sanitizeLinkedPlaybackMessage({ version: 2, senderId: "tab-1", type: "hello" }), null);

  const message = sanitizeLinkedPlaybackMessage({
    version: 1,
    senderId: " tab-1 ",
    type: "snapshot",
    snapshot: {
      current: { trackId: "track-1", trackTitle: "Track", path: "/must/not/pass" },
      currentTime: -20,
      mediaDuration: Number.POSITIVE_INFINITY,
      playing: 1,
      status: "Ready",
      sentAt: 100,
      audioBytes: [1, 2, 3],
    },
  });

  assert.equal(message.senderId, "tab-1");
  assert.equal(message.snapshot.currentTime, 0);
  assert.equal(message.snapshot.mediaDuration, 0);
  assert.equal(message.snapshot.playing, true);
  assert.equal("path" in message.snapshot.current, false);
  assert.equal("audioBytes" in message.snapshot, false);
  assert.equal("status" in message.snapshot, false);
});
