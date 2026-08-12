# Native Media and Shared DSP POC

Plan date: 2026-08-12

Status: runnable proof of concept on `codex/native-dsp-poc`; not a signed or
customer-ready desktop release

## Decision

Build this as a branch of Project Sequencer, not a separate product fork.
The browser and desktop editions should share the React workspace, project
schema, sequencing rules, safety rules, and as much DSP code as practical.
A fork now would make saved projects, transport behavior, and mastering
semantics drift before either product boundary is proven.

The product can still be sold in two clear editions:

| Capability | Free web edition | Pro native edition |
| --- | --- | --- |
| Project UI and album sequencing | Yes | Yes |
| Account and cloud-saved project documents | Planned; Google sign-in is not part of this POC | Planned account sync, with an offline local copy |
| Source audio | Local, never uploaded by default | Local, never uploaded by default |
| Reopening audio | Browser folder handles and permission recovery; the browser may require the user to grant access again | Persistent native paths, offline status, rescan, and recovery without a browser folder prompt |
| Live audio | Web Audio and later shared AudioWorklet/WASM | Shared DSP plus a native real-time engine |
| Exact documented print | Limited or unavailable in the hosted edition | Local FFmpeg now; versioned native DSP later |
| Folder watching and larger libraries | Browser-dependent and limited | Local engine |
| VST3/AU plug-ins | No | Later, only through an isolated signed plug-in host |

The free edition should be useful, not a demo: sequence, annotate, compare,
save project documents, and audition local files. Pro earns its price through
durable local-media access, larger libraries, background services, exact local
prints, higher-fidelity DSP, professional metering, and eventually plug-in
hosting. Audio upload or cloud rendering should be a separate explicit feature
and consent boundary if it is ever added.

## POC system shape

```text
Project Sequencer desktop window (existing React/Vite UI)
  | same-origin HTTP on a random loopback port
  v
Embedded local engine process (existing Node server, 127.0.0.1 only)
  |-- app-data project/config/index files
  |-- read-only access to explicitly registered audio
  |-- system FFmpeg + ffprobe
  `-- app-data exports/ derivatives

Shared DSP contract v1
  |-- AudioWorklet adapter for browser experiments
  `-- Node host adapter as the seam for a future native/WASM core
```

The desktop shell is Electron for this POC because it can package the current
Node server and React UI without rewriting working product behavior. The user
installs one app; the Node service is a child process owned by that app, not a
separately managed localhost daemon. A smaller Tauri/Rust shell can be assessed
after the engine protocol, file lifecycle, and packaging risks are proven.

## What is implemented

- `desktop/main.mjs` launches the existing production server through the
  Electron runtime, reserves a random loopback port, waits for a health check,
  and opens the existing UI in an isolated renderer.
- Project records, local path configuration, the rebuildable audio index, and
  exports use the operating system's application-data directory. A desktop
  smoke run uses a disposable temporary directory.
- FFmpeg and ffprobe paths can be injected through
  `PROJECT_SEQUENCER_FFMPEG_PATH` and
  `PROJECT_SEQUENCER_FFPROBE_PATH`. Every probe, waveform, analysis, and render
  service consumes that same resolved tool boundary.
- The renderer has no Node integration, uses context isolation and Chromium
  sandboxing, refuses in-window navigation, and opens only HTTPS external links
  through the operating system.
- `src/dsp/shared-dsp-core.js` supplies a versioned, allocation-free processing
  loop for gain, smoothing, exact bypass, and a prototype sample-peak guard.
  The browser AudioWorklet and Node host both use that source contract.
- Unit and smoke checks cover tool-path injection, parameter bounds, exact
  bypass, block-size determinism, ceiling behavior, and the two-channel host.

## Run the POC

Requirements for this checkpoint are Node.js, npm, and installed `ffmpeg` and
`ffprobe`.

```bash
npm install
npm run desktop:run
```

Useful verification commands:

```bash
npm run dsp:smoke
npm run desktop:smoke
npm run desktop:pack
```

`desktop:pack` creates an unpacked development application under ignored
`release/`. It is intentionally unsigned and depends on a system FFmpeg for
this checkpoint.

## Boundaries that remain unchanged

- Indexed source audio is read-only. The POC does not copy, move, rename,
  transcode, normalize, overwrite, or delete it.
- The browser receives indexed media keys, never absolute source paths.
- Waveforms remain compact, memory-only peak data.
- Every print is a derivative in an exports directory with its existing cue
  sheet and manifest behavior.
- Web Audio remains live-audition authority and FFmpeg remains print authority
  in the current application. The shared DSP prototype is not connected to the
  production transport yet.
- Audition source, sequence order, master approval, and release readiness remain
  separate decisions.

## Not yet implemented

- Google login, cloud project-document storage, subscriptions, entitlement
  checks, usage limits, or account recovery
- Browser folder-handle persistence and its reconnect experience
- A per-launch authenticated engine session beyond the current random loopback
  port and existing Host/Origin protections
- Bundled FFmpeg binaries, license notices, updater, signing, notarization, or
  release installers
- A true-peak oversampled limiter, loudness engine, final shared EQ/compressor,
  offline parity fixtures, or native audio-device callback
- Security-scoped bookmarks required by a future Mac App Store sandboxed build
- VST3/AU scanning, SDK integration, plug-in isolation, latency compensation,
  state chunks, crash recovery, or quarantine

## Recommended build sequence

1. Prove this shell against a copied project document and explicitly selected
   test media; verify reopen, offline/reconnect, range playback, waveform,
   analysis, one short print, cue sheet, and manifest.
2. Define the cloud project-document schema and conflict rules. Add Google
   sign-in without putting local paths, file handles, or audio bytes in cloud
   records.
3. Add the free browser file-handle registry and a clear **Reconnect folder**
   flow. Treat a lost permission as recoverable state, not lost project data.
4. Expand shared DSP v1 behind an opt-in laboratory flag, add golden audio
   fixtures, and compare AudioWorklet, Node/offline, and later native output.
5. Move the proven kernel to a memory-safe native/WASM implementation, then add
   device I/O, drop-out telemetry, latency accounting, and offline render.
6. Bundle approved FFmpeg builds, sign/notarize the app, add updates, and only
   then start the isolated third-party plug-in host.

The promotion gate for shared DSP is measurable parity and recovery—not its UI
appearance. It must survive buffer-size changes, sample-rate changes, device
loss, bypass switching, offline rendering, and reopen from a versioned project
before it replaces an existing audio path.
