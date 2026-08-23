# Native Media and Shared DSP POC

Plan date: 2026-08-12 · VST3 validation update 2026-08-22

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
readiness.

### Gate 11 — allocation-safe callback and available hardware transitions: partial 2026-08-12

- The AudioUnit callback no longer enters the Swift runtime. A fixed-capacity C
  shadow state is allocated and initialized on the control thread, owns only the
  generated 4,096-frame fixture/capture buffers, applies the atomic parameter
  word with bounded loops, and is read only after the AudioUnit stops. Swift
  exclusivity remains fully enabled for the checked offline reference kernel.
- The exact optimized-release binary retained bit-exact
  `74d25b2c...b995` parity. Live malloc stack logging found no allocation event
  whose stack contained `ps_silence_render_callback` or
  `ps_realtime_shadow_process`; unrelated Core Audio/AudioAnalytics allocations
  were not misreported as callback work.
- `npm run native:hardware:verify` is an explicit system-audio mutation gate.
  It snapshots the default output and its nominal rate, renders only silence,
  switches to an available alternate output and back, changes to a supported
  alternate rate and back, and has an unconditional restoration guard. The
  normal app, server, and packaged bootstrap cannot invoke this mode.
- Accepted controlled runs switched from the built-in output to an aggregate
  output and back and changed 48 kHz to 44.1 kHz and back. The hardened gate
  forces one owned AudioUnit rebuild after every observed mutation, drains
  delayed property notifications before stop, and requires at least four
  recoveries. The latest scripted run completed six recoveries, restored the
  built-in output and 48 kHz client format, matched the golden, and reported no
  frame, deadline, timing-gap, render, overload, or shadow failure; its longest
  callback was below 0.007 ms.
- This Mac exposed one physical output (built-in speakers) and no removable USB,
  Bluetooth, or DisplayPort output. A literal physical removal/reconnection was
  therefore not attempted. The path-free report records
  `no-removable-physical-output`; the aggregate switch is not labeled a physical
  unplug.

Gate 11 closes the known callback-allocation and live sample-rate/default-output
work, but not the physical hot-plug requirement. Project audio remains prohibited
until loss/reconnection is repeated with removable hardware and the broader
production gates pass.

### Gate 12 — Settings-visible generated engine lab: passed 2026-08-12

- Settings now shows whether the packaged lab is ready and can run one muted
  golden/recovery check or one explicitly acknowledged three-second audible
  generated-tone preview. An active run always exposes **Stop native output
  now**; no run starts during bootstrap.
- The localhost service owns the child process, rejects overlapping starts,
  fingerprints the executable per run, caps output, and strips paths,
  fingerprints, instance IDs, and raw errors. Its API has no project file,
  media key, input device, or transport parameter.
- Native audible mode requires both `--audible-preview` and
  `--allow-audible-output`, caps duration at five seconds, applies fixed -30 dB
  attenuation and 20 ms fades, pre-zeros every hardware buffer, and writes only
  the two generated golden channels.
- The reproducible 750 ms audible verifier passed at 48 kHz stereo with 46
  callbacks, 23,552 frames, exact golden parity, zero callback issues, and a
  0.0269 ms longest callback. The complete three-second Settings run also
  matched the golden with zero callback issues, and the UI successfully stopped
  a separate audible run early.
- Desktop and 390 px rendered checks passed, the production page logged no
  console warnings/errors, all local and free-web browser regressions passed,
  and the packaged three-launch smoke confirmed the native lab is embedded and
  idle at startup.

This gate makes the engine observable and briefly audible without connecting
indexed media. It is still a laboratory control, not the Pro production
transport.

### Gate 13 — metadata-only VST3 discovery foundation: passed 2026-08-22

- The Swift package now contains a dependency-free `Vst3Discovery` library, a
  path-free `shared-vst3-scanner` CLI, and a generated-fixture self-test.
- Discovery is limited to standard macOS VST3 locations and explicitly approved
  roots. Standard roots retain Steinberg's priority order; a lower-priority
  duplicate processor Class ID remains unavailable.
- The scanner reads only bounded optional `moduleinfo.json` metadata. It does not
  load a module factory or executable, and its report declares
  `metadata-only-no-binary-load` so the result cannot be mistaken for host
  compatibility.
- Root, bundle, and metadata symlink boundaries fail closed. Metadata over 1 MiB
  is rejected, and public records contain sanitized labels and stable IDs rather
  than absolute machine paths.
- Seven fixture checks pass. A read-only standard-folder scan on this Mac found
  48 global VST3 bundles, all without `moduleinfo.json`; zero processors are
  ready from metadata and no paths were disclosed. This established the need
  for the separate explicit factory-validation gate below.

This gate does not make VST3 available in the rack. Every installed binary
remains blocked until instance, audio, state, latency, recovery, and later
runtime-host gates pass.

### Gate 14 — disposable VST3 factory validation: passed 2026-08-22

- A coordinator launches one short-lived worker for one explicitly selected
  bundle; the normal scanner and application startup still load no plug-in
  code.
- Approved-root/executable containment, SHA-256 fingerprint, CPU architecture,
  and code-signature preflight happen before the worker calls the mandatory
  macOS module entry points and `GetPluginFactory`.
- The worker enumerates factory and processor-class identity only and exits. It
  never creates a processor or controller instance, processes audio, opens an
  editor, reads parameters, or requests state/latency information.
- The coordinator bounds child output and classifies timeout, signal crash,
  malformed output, rejection, and nonzero failure. A factory success is named
  `factory-enumerated-runtime-blocked`, not available.
- Public reports contain stable IDs, fingerprints, and sanitized labels but no
  absolute paths. The optional ignored private catalog retains the local bundle
  path with mode `0600` and refuses to overwrite malformed catalog data.
- The ABI subset is derived from the official MIT-licensed Steinberg
  pluginterfaces; the complete license notice is tracked beside the package.
- Ten generated-fixture checks pass, including a real disposable worker, an
  ad-hoc-signed module factory, timeout, crash, unsigned rejection, malformed
  output, containment, and catalog privacy. No installed third-party VST3
  binary was loaded for this gate.

This is a load-isolation and identity proof, not a runtime host. Parameters,
state, latency, buses, audio processing, GUI, safe-mode recovery, and rack/print
integration remain blocked.

### Gate 15 — bounded VST3 instance laboratory: passed 2026-08-22

- A second explicit coordinator/worker pair creates one generated-fixture
  processor and controller instance per disposable process. It requires both
  binary-load and instance-lab consent flags and inherits the approved-root,
  signature, architecture, timeout, crash, and bounded-output gates.
- The worker provides the mandatory minimal host application context, follows
  the offline component lifecycle, and enumerates at most 256 parameters. One
  writable normalized parameter is set, read back, and restored.
- Component and controller state are independently capped at 1 MiB and
  round-tripped in memory. Public JSON receives only byte counts and SHA-256
  digests; it receives neither the state bytes nor an absolute path.
- The audio proof is intentionally narrow: one 48 kHz stereo 32-bit setup,
  64-frame blocks, four zero-input process calls, finite-output validation, and
  reported latency/tail capture. It saves no audio and consumes no indexed
  source.
- Twelve generated-fixture checks pass, including a real disposable worker,
  parameter/state/lifecycle evidence, latency/tail values, zero-input safety,
  oversized-state rejection, Class ID/root rejection, and timeout/crash/
  malformed-output classification.

Success is `instance-lab-passed-runtime-blocked`. The gate does not prove
automation queues, component/controller messaging, editor windows, program
signal processing, new-instance project reload, latency compensation, tail
flush, or compatibility with an installed third-party plug-in.

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
  |-- manual metadata-only VST3 discovery (no binary loading)
  |-- explicit disposable VST3 factory validation (no instances or audio)
  `-- optional fingerprinted Swift hardware tools
      |-- query-only default-output probe
      `-- explicit generated-fixture callback lab (never auto-started)

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
- The staged stream executable remains inert at bootstrap and is never used by
  transport. Settings can ask the server-owned lab service to run either a
  750 ms muted golden/recovery check or a double-opt-in three-second generated
  tone at -30 dB. Runs are single-owner, process-bounded, stoppable, and
  disconnected from indexed media, project paths, microphone input, and normal
  playback. HTTP status is sanitized and contains no executable path,
  fingerprint, engine instance ID, or raw child-process error.
- Unit and smoke checks cover tool-path injection, parameter bounds, exact
  bypass, block-size determinism, ceiling behavior, and the two-channel host.
- `native/SharedDspEngine/Sources/Vst3Discovery` owns the metadata-only VST3
  root, identity, duplicate-priority, and sanitization contract. It has no Node,
  browser, SDK, plug-in-execution, or project-state dependency.
- `native/SharedDspEngine/Sources/Vst3Validation` owns static preflight,
  one-bundle process coordination, factory-only identity reports, quarantine
  classification, and the ignored private catalog. It is not imported by the
  browser, Node server, production transport, or print path.

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
npm run native:hardware:verify
npm run native:audible:verify # intentionally emits a 750 ms generated tone
npm run native:stage
npm run desktop:smoke
npm run desktop:pack
```

The VST3 metadata, disposable-factory, and generated instance-lab slices can be
verified independently:

```bash
cd native/SharedDspEngine
swift run shared-vst3-scanner-self-test
swift run shared-vst3-scanner --standard --pretty
swift build
swift run shared-vst3-validator-self-test
swift run shared-vst3-instance-lab-self-test
```

Manual factory validation is an explicit native-code action and is not part of
normal verification:

```bash
swift run shared-vst3-validator --allow-binary-load \
  --approved-root approved /approved/vst3/root \
  --bundle /approved/vst3/root/Example.vst3 --pretty
```

Add `--catalog ../../../data/vst3-validation-catalog.json` only when the ignored
machine-local record is wanted. Do not use `--allow-unsigned` for installed
plug-ins; it exists for controlled development fixtures.

Manual instance validation is a separate explicit native-code action. It was
not run against installed third-party plug-ins for this gate:

```bash
swift run shared-vst3-instance-lab --allow-binary-load --allow-instance-lab \
  --approved-root approved /approved/vst3/root \
  --bundle /approved/vst3/root/Example.vst3 --class-id PROCESSOR_CLASS_ID --pretty
```

The current development machine has a mismatched default Command Line Tools
compiler/SDK pair. The 2026-08-22 evidence used the compatible installed macOS
15.4 SDK and a workspace-local module cache. Repair or update Command Line Tools
before adding these commands to release automation; the application does not
change SDK selection at runtime.

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
- Installed VST3/AU compatibility evidence, parameter automation queues,
  component/controller messaging, general bus layouts, nonzero program-signal
  processing, new-instance project state restoration, latency compensation,
  tail flushing, editor windows, safe-mode recovery, or rack integration.
  Generated-fixture instance validation grants no execution availability.

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
10. **Complete:** three coherent parameter generations survive recovery in each
    10-second release trial. Stack logging identified one first-callback Swift
    TLS allocation without weakening exclusivity to conceal it.
11. **Allocation and available device transitions complete; physical unplug
    remains gated:** the callback now stays in preallocated C, the exact golden
    remains stable, callback allocation stacks are absent, and controlled
    default-output plus 48/44.1 kHz transitions restore safely. Repeat true loss
    and reconnection when removable physical output hardware is attached before
    any user-selected audio enters this path.
12. **Generated-fixture UI lab complete:** Settings owns consent, run state,
    emergency stop, and path-free callback metrics for a muted check and a
    safety-limited audible preview. This is observable engine evidence, not
    project playback or permission to route indexed sources.
13. **Complete:** VST3 metadata discovery covers standard
    and approved roots, stable Class IDs, duplicate priority, bounded metadata,
    symlink containment, and path-free reports without loading code.
14. **Factory identity validation complete; instances remain blocked:** an
    explicit one-bundle disposable worker now proves module/factory entry,
    processor identity, timeout/crash quarantine, architecture/signature checks,
    path-free reports, and an ignored owner-only catalog. Next use a small
    opt-in compatibility set to prove parameters, bounded state, latency/tails,
    and zero-input/offline processing in the disposable laboratory before any
    rack or transport integration.
15. **Generated instance laboratory complete; installed compatibility next:**
    parameter identity and setter round-trip, 1 MiB-bounded component/controller
    state, latency/tail reporting, and four offline zero-input blocks are proven
    in a disposable worker. Next requires an explicit small installed-plug-in
    compatibility set plus message connections, automation queues, nonzero
    deterministic fixtures, new-instance restore, and tail flushing; failures
    remain quarantined and no result grants rack availability.

The promotion gate for shared DSP is measurable parity and recovery—not its UI
appearance. It must survive buffer-size changes, sample-rate changes, device
loss, bypass switching, offline rendering, and reopen from a versioned project
before it replaces an existing audio path.
