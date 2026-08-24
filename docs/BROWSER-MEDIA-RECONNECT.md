# Browser media reconnect contract

The free online edition can remember a user's audio selection without uploading
or copying the audio. On browsers that support the File System Access API,
Project Sequencer stores only the browser-issued file or folder handle in that
origin's IndexedDB database.

## Permission lifecycle

1. The user chooses audio through a browser picker.
2. The browser grants a revocable read handle. The current files are indexed in
   memory and object URLs are created only for the open page.
3. On reload, the app calls `queryPermission({ mode: "read" })`. It never calls
   `requestPermission` during startup.
4. If access remains granted, the folder is re-indexed under the same stable
   `browser-device-*` root ID.
5. If access is `prompt` or denied, the source remains visible as disconnected.
   The user can choose **Reconnect**, which is the only path that calls
   `requestPermission`.
6. **Forget** removes the saved handle and in-memory index. It does not rename,
   move, rewrite, copy, or delete any source file.

If the required browser APIs are unavailable, file-input selection still works
for the current page session. The UI identifies this as session-only access.

## Stored and excluded data

IndexedDB may contain the handle, its user-visible label, a stable random ID,
and the time it was registered. Project JSON and future cloud documents contain
only logical media references such as root ID and relative path.

The browser registry never stores audio bytes, blob URLs, decoded waveform
samples, engine credentials, or absolute filesystem paths. Object URLs and
waveform peaks are memory-only and are discarded or revoked when a source is
removed or the page closes.

## Recovery guarantees

- Reload cannot trigger a surprise permission prompt.
- Permission loss does not delete project decisions or source references.
- Reconnection preserves root identity.
- A missing or moved file reports as unavailable and can be retried.
- Cloud sync must continue to reject browser handles; they remain device-local.

## Linked-tab playback

Linked tabs do not share browser file handles or audio objects. Tabs opened from
Quick Settings or Command Search coordinate through a project-scoped,
same-origin `BroadcastChannel`; exactly one owner tab plays audio and follower
tabs send bounded play/pause, seek, or stop commands. The shared snapshot is an
explicit allowlist of display labels, project/album/track IDs, playback time,
duration, route flags, and playing state. It excludes source keys, paths, URLs,
blob references, media bytes, status text, and browser handles.

This is a transport-control convenience layer around the existing Web Audio
path, not a second audio engine or sample-accurate network clock. If the owner
closes or becomes stale, a remaining tab can become owner by starting playback.

Automated coverage lives in `tests/online-app.test.mjs`,
`tests/browser-media-registry.test.mjs`, and
`e2e-online/device-audio.spec.js`; linked-message sanitization and ownership are
covered by `tests/linked-playback.test.mjs` and `e2e/critical-flows.spec.js`.
