# Shared DSP Contract v1

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
| `server/shared-dsp-host.mjs` | Node/offline adapter for fixtures and future engine protocol work |

## Version 1 parameters

- bypass
- input and output gain in dB
- smoothing time in milliseconds
- sample-peak guard enable and ceiling

The peak guard clamps samples. It is not inter-sample true-peak detection, an
oversampled lookahead limiter, or release-ready mastering DSP. EQ, compression,
limiting, meters, rack topology, and automation will enter only with matching
golden fixtures and explicit contract-version changes.

## Real-time rules

- No file access, network access, logging, or UI work in the processing loop.
- No per-block arrays are created by the core processor. Hosts own and reuse
  input/output buffers.
- Parameters are bounded before entering the loop and gain changes are smoothed.
- Bypass copies samples exactly.
- Output is deterministic for the same ordered samples regardless of block
  boundaries.
- Meter delivery is lower rate and never defines render authority.

## Future compatibility gate

Before a native or WASM replacement can claim parity, the same fixtures must
compare impulse response, frequency response, dynamics envelopes, channel
linking, bypass, automation ramps, denormal handling, NaN/Infinity recovery,
sample rates, and block sizes. Each authoritative print must record the DSP
contract version and implementation fingerprint in its manifest.
