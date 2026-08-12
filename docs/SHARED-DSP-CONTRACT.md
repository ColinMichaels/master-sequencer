# Shared DSP Contract v2

Status: opt-in portability prototype; not connected to production transport or
authoritative printing

## Purpose

The shared contract proves that one normalized parameter model and processing
state can run in browser-sized real-time blocks and a local offline host. It is
the seam where a future C++ or Rust kernel can replace the JavaScript proof
without changing Project Sequencer's project data or rack semantics.

## Modules

| Module | Role |
| --- | --- |
| `src/dsp/shared-dsp-core.js` | Version, settings normalization, state, and block processor |
| `src/dsp/project-sequencer-worklet.js` | AudioWorklet adapter and low-rate meter messages |
| `src/lib/shared-dsp-prototype.js` | Browser node creation and current MASTER-to-prototype mapping |
| `src/lib/shared-dsp-lab.js` | Build-time permission plus device-local laboratory opt-in |
| `server/shared-dsp-host.mjs` | Node/offline adapter for fixtures and future engine protocol work |

## Version 2 parameters

- bypass
- input and output gain in dB
- smoothing time in milliseconds
- sample-peak guard enable and ceiling
- DC blocker enable and bounded cutoff

The peak guard clamps samples. It is not inter-sample true-peak detection, an
oversampled lookahead limiter, or release-ready mastering DSP. EQ, compression,
limiting, meters, rack topology, and automation will enter only with matching
golden fixtures and explicit contract-version changes.

Version 2 adds the optional DC blocker, explicit sample-rate reset behavior,
and a `recoveredSamples` counter for NaN and Infinity inputs. Version 1 remains
available in Git history only; no saved project or production audio path depends
on either prototype contract.

## Laboratory gate

The browser node remains unreachable in normal builds. It requires both:

1. a build made with `VITE_SHARED_DSP_LAB=true`; and
2. device-local opt-in value `project-sequencer-shared-dsp-lab-v2=enabled` in
   that origin's local storage.

The gate is deliberately separate from project state and future cloud data. It
cannot silently travel with an imported or synchronized project. Removing the
local value disables new laboratory nodes. The production Web Audio transport
and FFmpeg print path remain authoritative.

## Golden parity fixtures

`tests/fixtures/shared-dsp-golden-v2.json` records four reviewed output hashes:
stereo impulse/DC response, dual-tone gain, peak guarding, and non-finite input
recovery. The suite compares identical Float32 output from the core,
Node/offline host, and AudioWorklet adapter at 1, 17, 128, and 511 frames per
block across 44.1, 48, and 96 kHz.

Run `npm run dsp:golden`. A contract or algorithm change must intentionally
version and review the fixtures; tests must never rewrite the expected hashes.

## Real-time rules

- No file access, network access, logging, or UI work in the processing loop.
- No per-block arrays are created by the core processor. Hosts own and reuse
  input/output buffers.
- Parameters are bounded before entering the loop and gain changes are smoothed.
- Bypass copies samples exactly.
- Output is sample-identical for the same ordered samples regardless of the
  verified block boundaries.
- A sample-rate change resets filter history before processing resumes.
- NaN and Infinity inputs become silence and increment recovery telemetry.
- Meter delivery is lower rate and never defines render authority.

## Future compatibility gate

The Swift native implementation passes the current goldens but is not yet a
production replacement. WASM must independently pass them. Promotion also
requires frequency response, dynamics envelopes, channel linking, automation
ramps, denormal handling, and device-loss recovery. Each authoritative print
must record the DSP contract version and implementation fingerprint in its
manifest.
