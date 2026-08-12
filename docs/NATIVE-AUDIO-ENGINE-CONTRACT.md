# Native audio engine contract

Status: compiled memory-safe DSP/offline proof plus tested host contracts; not a
production real-time audio engine

## Compiled Swift package

`native/SharedDspEngine` is a SwiftPM package with four products:

| Product | Purpose |
| --- | --- |
| `SharedDspEngine` | Memory-safe Swift implementation of shared DSP contract v2 |
| `shared-dsp-self-test` | Compiled bounds, bypass, recovery, and sample-rate reset checks |
| `shared-dsp-golden-runner` | Binary Float32 bridge used only for cross-language parity verification |
| `shared-dsp-device-probe` | Query-only Core Audio bridge for the current default-output format and reported latency |

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
npm run native:stage
```

The first command verifies the same compiled parity authority, fingerprints the
probe binary, executes it, and requires an exact protocol/DSP/fingerprint
handshake. The second repeats those gates before copying the verified executable
and a path-free manifest into ignored desktop staging. It never stages audio.
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

This checkpoint does not provide full device enumeration, a hardware callback,
aggregate-device support, hot-plug notifications, WASM, a background service,
production stream IPC, or native offline printing. The golden runner remains a
test bridge. The query-only probe can be packaged into the POC, but production
promotion still requires real device-loss tests, callback allocation profiling,
measured loopback latency, Developer ID signing/notarization of the native code,
and the same source-safe rendered-audio checks used by the existing FFmpeg path.
