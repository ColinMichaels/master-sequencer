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

Automated coverage lives in `tests/online-app.test.mjs`,
`tests/browser-media-registry.test.mjs`, and
`e2e-online/device-audio.spec.js`.
