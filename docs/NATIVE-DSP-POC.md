# Native Media and Shared DSP POC

Plan date: 2026-08-12

Status: runnable proof of concept on `codex/native-dsp-poc`; not a signed or
customer-ready desktop release

## Roadmap gate status

### Gate 1 — packaged local-media lifecycle: passed 2026-08-12

The automated lifecycle uses a generated schema-7 project document and a
generated 0.6-second WAV in a disposable directory. This is the source-safe
equivalent of copying a real project and media into a test area.

It passes in both the development shell and the packaged `.app` and proves:

- authenticated bootstrap and persistent application-data state across three
  launches
- indexed 32-byte range playback without copying or changing the fixture
- compact waveform peaks and technical loudness analysis without absolute paths
- one short documented 24-bit/48 kHz WAV print plus readable cue sheet and
  schema-3 manifest
- an explicitly offline root after the media folder is temporarily moved
- restored indexing after the folder returns and rediscovery of completed
  render history after restart

Commands:

```bash
npm run desktop:media-smoke
npm run desktop:pack
npm run desktop:media-smoke:packaged
```

This gate found and fixed a real compatibility gap: render discovery accepted
manifest versions 1 and 2 while the schema-7 renderer writes version 3.

### Gate 2 — cloud project and Google-auth boundary: passed 2026-08-12

The versioned cloud-document contract, canonical digest, local-only exclusions,
optimistic revision rules, explicit divergent-edit result, and private Google
credential seam are implemented and unit tested. No cloud backend or Google
client credentials are configured, so this is architectural readiness rather
than a claim of working production login or synchronization. See
[CLOUD-PROJECT-SYNC-CONTRACT.md](./CLOUD-PROJECT-SYNC-CONTRACT.md).

### Gate 3 — browser media permission recovery: passed 2026-08-12

- The online edition stores revocable File System Access handles in IndexedDB
  when the browser supports them. Audio bytes and absolute paths are not stored
  in project documents or uploaded.
- Reopen performs only a silent permission query. It never opens a permission
  prompt during bootstrap. An expired grant becomes an explicit
  `permission-required` root and reconnect is available only from a user action.
- A successfully reconnected folder keeps the same stable root ID, so project
  source references survive reload. Forgetting the source removes its saved
  handle but never modifies the underlying files.
- File-input fallback remains session-only on browsers without File System
  Access or IndexedDB support.
- Verification covers persistent folder restore, denied/prompt state, explicit
  reconnect, removal, fallback behavior, the production build, and rendered
  online file/folder selection and playback.

### Gate 4 — opt-in shared DSP and golden parity: passed 2026-08-12

- Contract v2 adds an optional DC blocker, explicit sample-rate reset, and
  non-finite-sample recovery telemetry without connecting to production audio.
- Browser node creation requires a lab-enabled build and a separate
  device-local opt-in. Normal free-web and native POC operation stays on the
  established Web Audio and FFmpeg paths.
- Four versioned golden fixtures compare the core, Node/offline host, and
  AudioWorklet sample-for-sample at four block sizes and three sample rates.
- Exact bypass, gain smoothing, ceiling behavior, DC recovery, and NaN/Infinity
  containment are covered. True peak, dynamics, analog modeling, and production
  promotion remain later gates.

### Gate 5 — memory-safe native DSP and host contract: passed 2026-08-12

- A SwiftPM library implements contract v2 without unsafe pointer or foreign
  memory code. Its control-thread self-test is compiled and executed.
- The native golden runner is sample-identical to all four reviewed fixtures at
  all four block sizes: 16 comparisons pass against the JavaScript authority.
- The versioned host boundary defines bounded device requests, exact frame-based
  latency accounting, fail-closed handshake compatibility, xrun counters, and
  explicit device-loss recovery states with path-free telemetry.
- This gate proves a memory-safe offline native kernel and engine contract. It
  does not claim real-time Core Audio I/O, hot-plug recovery, WASM, or production
  transport/print integration. See
  [NATIVE-AUDIO-ENGINE-CONTRACT.md](./NATIVE-AUDIO-ENGINE-CONTRACT.md).

### Gate 6 — macOS distribution pipeline: prepared; external gates remain

- FFmpeg staging now fails closed on redistribution approval, provenance,
  hashes, version, license notices, platform/architecture, and non-system
  dynamic dependencies. Generated runtime files remain ignored.
- Local packaging includes hardened-runtime entitlement configuration and still
  passes the complete packaged media lifecycle when using installed FFmpeg.
- The release audit distinguishes local/ad-hoc, Developer ID signed, and signed
  plus notarized states and inspects nested code, Gatekeeper, stapling, and
  bundled-runtime evidence.
- The strict DMG/ZIP distribution command requires forced code signing, one
  complete Apple notarization credential set, and staged approved FFmpeg before
  it builds. It currently blocks because all three external prerequisites are
  absent. See [MACOS-DISTRIBUTION.md](./MACOS-DISTRIBUTION.md).

### Gate 7 — packaged query-only Core Audio boundary: passed 2026-08-12

- A fourth Swift product reads the current default-output format and device plus
  safety latency through Core Audio properties. It never instantiates an
  AudioUnit, opens a stream or callback, plays audio, or requests input access.
- The binary must return protocol v1, shared-DSP contract v2, and the SHA-256 of
  its own compiled executable. Incompatible, replaced, malformed, and crashed
  probes fail closed without exposing paths, fingerprints, instance IDs, or raw
  process errors through the local API.
- `npm run native:stage` runs all 16 compiled golden comparisons plus the device
  handshake before placing the binary and sanitized manifest in ignored desktop
  staging. Packaging includes it optionally; normal browser and local playback
  do not depend on it.
- The packaged three-launch media lifecycle passed with the native probe present
  and available on every launch. Rendered QA reported the system default output
  at 48 kHz, two channels, and 144 combined device/safety latency frames, with
  no console errors or horizontal overflow at 1280 px and 390 px widths.
- A transient no-device condition was also reproduced. The initial AVAudioEngine
  approach terminated in that state, so the implementation was replaced with
  Core Audio property reads and now returns an explicit `no-output-device`
  status without crashing.

This gate proves discovery, packaging, authentication, UI status, and graceful
absence. It still does not claim real-time native playback.

### Gate 8 — isolated silence-only real-time output: passed 2026-08-12

- A fifth Swift executable owns a default-output AudioUnit through explicit
  start, simulated recovery, restart, and final stop transitions. It never
  requests input, reads source media, or connects to production playback.
- A small C callback boundary zero-fills host-owned buffers and records frame,
  deadline, timing-gap, render-error, overload, and longest-callback evidence
  through atomics verified lock-free on the current architecture. The callback
  performs no allocation, locking, file/network access, logging, or Swift
  collection work.
- Real default-device and processor-overload listeners are registered. The test
  increments the same device-change signal without changing the user's selected
  output, then proves an owned stop/dispose/recreate/start cycle. Physical
  hot-plug remains a separate hardware test.
- Three 750 ms hardware trials ran at 48 kHz stereo. They produced 45–46
  callbacks and 23,040–23,552 silent frames, completed one recovery each, and
  ended stopped. Across all trials there were zero frame-bound violations,
  deadline misses, timing-gap xruns, render errors, and processor overloads; the
  longest callback was below 0.007 ms.
- At Gate 8, staging required the query and silence gates and wrote independent
  hashes and capabilities for both executables. Gate 9 strengthens that current
  requirement below.

This proves a narrow real-time host boundary, not a Pro playback engine. Web
Audio remains live audition authority and FFmpeg remains print authority.

### Gate 9 — muted shared-DSP callback shadow: passed 2026-08-12

- The real callback now invokes the Swift `SharedDspKernel` with only a frame
  count and opaque preallocated context. It receives generated in-memory samples
  from the reviewed `dual-tone-gain` fixture, never a source file, input device,
  project buffer, or hardware output pointer.
- All hardware buffers are zero-filled in C after shadow processing. The report
  is rejected unless every AudioUnit callback has matching kernel work and the
  C and Swift frame counts reconcile with zero failures.
- After the AudioUnit is stopped, the control thread hashes the first complete
  4,096-frame result using the same Float32 little-endian authority as the
  versioned golden runner. All three hardware trials matched
  `74d25b2c...b995` exactly.
- The final 750 ms trials processed 46–47 callbacks and 23,552–24,064 frames
  apiece. Each completed one recovery with zero frame-bound violations,
  deadline misses, timing-gap xruns, render errors, processor overloads, or
  shadow failures. The slowest callback was below 1.7 ms against the current
  10.67 ms hardware period.
- `npm run native:stage` requires query, silence, and muted-shadow verification
  before writing the two binaries and path-free schema-3 manifest.

This advances the shared kernel into the real callback without making it audible
or granting it access to user media. Gate 10 adds callback allocation evidence,
longer stress runs, and parameter handoff below; physical device changes remain
a promotion gate.

### Gate 10 — atomic parameter handoff and muted stress: passed 2026-08-12

- The control thread now publishes one release/acquire atomic 64-bit mailbox
  word containing a monotonic generation and bounded Float32 output gain. The
  callback performs one coherent load; reports fail unless publish/apply counts,
  final generation, and final value reconcile exactly.
- Each stress trial publishes three generations, changes gain twice around one
  simulated AudioUnit recovery, restores the initial value, and verifies that
  the post-stop default output device and nominal sample rate match their
  before-run samples. The report exposes only that boolean comparison, not the device ID. User media, input
  devices, production playback, and nonzero hardware output remain excluded.
- The final three optimized-release trials ran for 10.028–10.081 seconds at 48
  kHz stereo, processed 911–912 callbacks and 466,432–466,944 frames, and had a
  worst callback below 0.073 ms. Every trial matched the reviewed golden and
  reported zero frame, deadline, timing-gap, render, overload, or shadow
  failures.
- Native staging now verifies query, silence, shadow, and stress gates against
  optimized release binaries and writes an ignored path-free schema-4 manifest.
- Malloc stack logging against the exact staged binary identified one 32-byte
  Swift exclusivity TLS allocation on the first audio callback. This was not
  hidden or “fixed” by disabling exclusivity checks across the shared library.
  Strict allocation-free promotion therefore remains open even though there is
  no recurring per-block allocation call in the kernel.

Gate 10 proves the parameter-mailbox and muted stress scope, not production
readiness. Gate 11 is physical default-device loss/sample-rate recovery plus a
reviewed way to remove the first-callback runtime allocation. Project audio
remains prohibited until both are proven.

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
  |-- app-data exports/ derivatives
  `-- optional fingerprinted Swift hardware tools
      |-- query-only default-output probe
      `-- explicit silence-only callback lab (never auto-started)

Shared DSP contract v2
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
- Each launch creates a random engine credential. Electron injects it into
  loopback requests through a private renderer session, while the React page
  never receives or stores the credential. Normal browser mode remains
  compatible when native authentication is not configured.
- `src/dsp/shared-dsp-core.js` supplies a versioned, allocation-free processing
  loop for gain, smoothing, exact bypass, and a prototype sample-peak guard.
  Contract v2 also covers optional DC blocking, sample-rate reset, and recovery
  telemetry. The browser AudioWorklet and Node host use that same contract.
- The optional staged Swift probe is discovered only from an explicit local
  environment path or the packaged app resources. The Node service verifies its
  fingerprinted handshake, publishes a path-free `/api/native-audio/status`,
  and includes the same status in bootstrap. Settings labels this as a DSP lab
  and states that established playback remains authoritative.
- The staged silent-stream executable is not launched by bootstrap, the local
  API, Settings, or transport. It runs only through the explicit verification
  command and remains disconnected from indexed media and shared DSP playback.
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
npm run native:devices:verify
npm run native:realtime:verify
npm run native:stage
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
- An approved staged FFmpeg artifact, valid Developer ID identity, notarized
  installer, custom production icon, updater, and release-channel infrastructure
- A true-peak oversampled limiter, loudness engine, final shared EQ/compressor,
  production-grade dynamics fixtures, or project-audio native callback routing
- Security-scoped bookmarks required by a future Mac App Store sandboxed build
- VST3/AU scanning, SDK integration, plug-in isolation, latency compensation,
  state chunks, crash recovery, or quarantine

## Recommended build sequence

1. **Complete:** prove the packaged shell with an isolated project document and
   generated test media; verify reopen, offline/reconnect, range playback,
   waveform, analysis, one short print, cue sheet, manifest, and recovered
   render history.
2. **Contract complete; provider deployment gated:** define the cloud project
   schema, local-only exclusions, conflict rules, and Google-auth seam. A live
   login/backend still requires approved provider credentials and deployment.
3. **Complete:** add the free browser file-handle registry and a clear
   **Reconnect folder** flow. A lost permission is recoverable state, not lost
   project data; fallback pickers remain session-only.
4. **Complete for JavaScript hosts:** expand shared DSP behind an opt-in
   laboratory flag, add golden audio fixtures, and compare AudioWorklet and
   Node/offline output. Native parity remains Gate 5.
5. **Native kernel and host contract complete:** the
   Swift implementation passes the current goldens, and dropout/latency/recovery
   contracts are tested. Production routing remains gated.
6. **Pipeline prepared; distribution blocked:** stage an approved FFmpeg build,
   supply Developer ID and notarization credentials, pass the strict audit on
   DMG/ZIP artifacts, then add update/rollback infrastructure. Only after those
   gates should work begin on an isolated third-party plug-in host.
7. **Complete:** package the fingerprinted query-only Core Audio probe and
   publish only sanitized status.
8. **Complete:** the silence-only callback owns start, stop, recovery, and
   lock-free timing telemetry without production playback.
9. **Complete:** the real callback runs generated samples through the Swift
   kernel, matches the reviewed golden, and still emits only zeros.
10. **Atomic handoff/stress complete; production promotion remains gated:**
    three coherent parameter generations survive recovery in each 10-second
    release trial. Stack logging found one first-callback Swift TLS allocation.
    Next eliminate that allocation without weakening exclusivity and run
    physical device-loss/sample-rate tests before any user-selected audio enters
    this path.

The promotion gate for shared DSP is measurable parity and recovery—not its UI
appearance. It must survive buffer-size changes, sample-rate changes, device
loss, bypass switching, offline rendering, and reopen from a versioned project
before it replaces an existing audio path.
