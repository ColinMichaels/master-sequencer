# Native audio engine contract

Status: compiled memory-safe DSP/offline proof plus tested host contracts; not a
production real-time audio engine

## Compiled Swift package

`native/SharedDspEngine` is a SwiftPM package with five products:

| Product | Purpose |
| --- | --- |
| `SharedDspEngine` | Memory-safe Swift implementation of shared DSP contract v2 |
| `shared-dsp-self-test` | Compiled bounds, bypass, recovery, and sample-rate reset checks |
| `shared-dsp-golden-runner` | Binary Float32 bridge used only for cross-language parity verification |
| `shared-dsp-device-probe` | Query-only Core Audio bridge for the current default-output format and reported latency |
| `shared-dsp-silent-stream` | Explicit silence-only AudioUnit lifecycle and callback-timing laboratory |

The processing method performs no file, network, UI, logging, or explicit
allocation work. Hosts own the input/output buffers. Reset and sample-rate
reconfiguration are control-thread operations and may replace state arrays.
The implementation uses checked Swift arrays and contains no unsafe pointer or
foreign-memory code.

Run:

```bash
npm run dsp:native:verify
```

The command builds with the Xcode Swift toolchain, runs the compiled self-test,
and compares 16 native renders against the four reviewed contract-v2 fixtures
at 1, 17, 128, and 511 frames. A passing run reports
`implementation: "swift"` and `comparisons: 16`.

On the current development machine, the Xcode installation does not expose a
macOS XCTest or Swift Testing module. `swift test` therefore cannot host tests,
so the package uses a compiled self-test executable plus the stronger binary
golden-parity verifier. This is an environment limitation, not a claim that a
SwiftPM test suite passed.

Run the hardware boundary separately:

```bash
npm run native:devices:verify
npm run native:realtime:verify
npm run native:stage
```

The first command verifies the same compiled parity authority, fingerprints the
probe binary, executes it, and requires an exact protocol/DSP/fingerprint
handshake. The real-time command runs three short silence-only trials. Staging
requires both gates before copying two verified executables and a path-free
manifest into ignored desktop staging. It never stages audio.
Staging clears any older native probe first, so a failed build or handshake
cannot leave a stale executable for a later package command to pick up.

The probe uses lower-level Core Audio property reads rather than constructing an
`AVAudioEngine`. It does not instantiate an AudioUnit, start an engine or
callback, play/record audio, or request microphone permission. A temporarily
missing default device is a valid `no-output-device` report instead of a process
crash. The DSP processing kernel itself remains free of file, network, logging,
allocation, and foreign-memory work.

## Host protocol

`src/lib/native-audio-engine-contract.js` defines the boundary that a later
signed local engine must implement:

- protocol version 1 and exact shared-DSP contract version
- semantic engine version, per-launch instance ID, and implementation
  fingerprint
- bounded capabilities for offline rendering, real-time output, device
  notification, channels, and sample rates
- explicit device request with input/output IDs, channel counts, sample rate,
  buffer size, exclusive mode, and safe default-device fallback

Handshake version drift fails closed. Device identifiers and engine telemetry
are machine-local runtime data and must not enter project JSON or cloud sync.
The local HTTP service also removes the binary path, implementation fingerprint,
per-launch instance ID, and raw process errors before returning status to the
UI.

## Silence-only real-time boundary

`SharedDspRealtimeSupport` is a deliberately small C boundary around the host's
`AudioBufferList` and callback ABI. It owns no audio memory. Every callback
zero-fills the host-provided buffers, reads the hardware clock, and updates only
lock-free atomic counters. It performs no allocation, locking, file or network
access, logging, Swift collection work, parameter changes, or project-media
reads.

Swift owns the control thread and enforces `stopped -> starting -> running`,
`running -> recovering -> running`, and `running -> stopped`. Every request and
successful transition is counted. A report is accepted only when all counts
reconcile, the final state is stopped, input/source/production isolation is
explicit, and no local path appears.

`npm run native:realtime:verify` runs three 750 ms trials. Each opens the current
default output, renders silence, simulates one device-change signal without
changing the system device, stops and recreates the AudioUnit, and stops
cleanly. It requires zero frame-bound violations, deadline misses, timing-gap
xruns, render errors, and processor-overload notifications. The C atomics must
also report lock-free on the running architecture.

On the final 2026-08-12 Apple Silicon staging run, all trials used a hardware-
aligned 48 kHz stereo client format, produced 34–47 callbacks and 17,408–24,064
silent frames, completed one recovery apiece, and had a worst callback below
0.005 ms. These short POC measurements on one machine are not broad performance
certification.

## Latency authority

Latency is recorded in integer frames first. Milliseconds are derived display
values. The report separates:

- input and output hardware latency
- one callback buffer on each path
- DSP/lookahead latency
- future plug-in latency
- host safety offset
- input path, output path, and round-trip totals

This prevents the UI from presenting one unexplained latency number and gives a
future compensation engine exact frame authority.

## Dropout and device recovery

The telemetry state machine is:

```text
stopped -> starting -> running -> degraded
                         |           |
                         v           v
                     recovering -> running
                         |
                         v
                       failed
```

Callback records count frame mismatches, deadline misses, aggregate xruns,
non-finite sample recoveries, and the longest callback. Device loss requires an
explicit `recovering` state and an explicit return to `running`; it cannot be
reported as healthy merely because a later callback arrived. The bounded event
log stores reason codes and timestamps, never absolute paths or audio data.

## Remaining production work

This checkpoint does not route project audio or shared DSP through the hardware
callback. It also does not provide full device enumeration, aggregate-device
support, physical hot-plug tests, WASM, a background service, production stream
IPC, or native offline printing. The golden runner remains a test bridge. The
query-only and silence-only binaries can be packaged into the POC, but promotion
still requires long-duration and representative-device profiling, callback
allocation instrumentation, real device-loss tests, measured loopback latency,
Developer ID signing/notarization, and the existing source-safe rendered-audio
checks.
