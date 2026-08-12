# Project Sequencer Architecture

Project Sequencer is a local-first album sequencing and source-review tool. It
owns project decisions and non-destructive edit instructions. It does not own,
move, rewrite, or publish the audio and visual files it indexes.

## System shape

```text
React workspace
  | JSON API, same origin only
  v
Local Node server (127.0.0.1)
  |-- project state store ------> ignored data/sequencer-state.json
  |                              |-> ignored last-known-good snapshot
  |                              `-> ignored saved-project index + data/projects/*.json
  |-- configuration store -----> ignored config/sequencer.local.json
  |-- audio index -------------> ignored data/audio-index-cache.json
  |   `-- optional watcher ----> debounced incremental metadata rescans
  |-- range media service -----> already-indexed source audio (read-only)
  |-- waveform service --------> compact in-memory peak arrays
  |-- analysis service --------> compact rebuildable mastering measurements
  |-- project asset service ---> configured-root images and lyric text (read-only)
  |-- render-job service ------> bounded FFmpeg queue and result discovery
  `-- audio renderer ----------> ignored exports/YYYY-MM-DD derivatives
```

The browser never receives an absolute source-audio path. Audio playback,
waveform analysis, and rendering identify a source through its indexed key.
Protected sources use an opaque `privateSourceId`; their original filename and
relative path are removed before library data reaches the browser.

## Runtime profiles

The product now has one implemented local architecture and two distribution
profiles under development:

| Profile | UI | Project documents | Media and processing |
| --- | --- | --- | --- |
| Current local web app | React in a browser | Ignored local JSON through Node | Indexed local sources, Web Audio audition, FFmpeg print |
| Free hosted web | Same React workspace | Planned account/cloud documents plus local recovery | Browser-approved local files, Web Audio/AudioWorklet, no audio upload by default |
| Pro native POC | Same built React workspace in Electron | OS application-data JSON now; account sync later | Embedded loopback Node engine, persistent local paths, system FFmpeg now, shared/native DSP later |

The desktop engine is owned by the desktop app and listens on a random
`127.0.0.1` port. It is not a separately installed background daemon. See
[NATIVE-DSP-POC.md](./NATIVE-DSP-POC.md) for the product boundary and release
gates.

## Core invariants

Every feature must preserve these rules:

1. Indexed source media is read-only. No sequencing action may rename, move,
   copy, delete, normalize, transcode, or overwrite it.
2. Album order, audition source, master candidate, disposition, and order
   approval are separate fields and separate decisions.
3. A track removed from the working sequence remains a complete track record.
   Deleting that record is a distinct, explicitly confirmed action.
4. Trims, fades, gaps, and crossfades are instructions. A print creates a new
   derivative below `exports/`; it never writes to a source location.
5. A media request is valid only when its key is present in the current index.
6. Project assets must resolve inside a configured folder after symlinks are
   resolved. State stores only a configured-root ID and relative path.
7. Waveform analysis returns compact peak data, keeps its cache in memory, and
   never writes a sidecar beside audio.
8. Machine-specific source paths belong only in ignored local configuration or
   `PROJECT_SEQUENCER_AUDIO_PATHS`.
9. Sequence versions snapshot track IDs and membership only. Transition A/B
   variants and loudness-matched comparisons are preview instructions; they do
   not mutate track mastering or source-choice authority.
10. Album templates contain structure and non-destructive mastering settings,
    never source references, artwork, candidate decisions, or approvals.
11. A delivery profile validates a print request and its documentation. It does
    not imply an approved master or publication readiness; those remain
    separate explicit album fields.
12. Undo/redo stores bounded project-state snapshots only. It never performs a
    filesystem inverse operation. Portable bundles contain JSON and checksums,
    never media bytes or absolute indexed-source paths.

## Server modules

| Module | Responsibility |
| --- | --- |
| `server/index.mjs` | Process startup, static delivery, and composition of server services |
| `server/api-router.mjs` | Narrow JSON/media route handlers and API response shaping |
| `server/http-response.mjs` | Size-bounded JSON input, JSON output, MIME lookup, and range-file streaming |
| `server/config-store.mjs` | Merge portable/local/environment configuration and atomically register or disconnect sources |
| `server/audio-library.mjs` | Recursively discover supported audio, probe metadata, and maintain the rebuildable cache |
| `server/audio-watch-service.mjs` | Optionally watch connected folders and debounce incremental metadata rescans |
| `server/portable-project-bundle.mjs` | Hash indexed candidate sources and build JSON/checksum-only portable bundles |
| `server/state-schema.mjs` | Validate the current state schema and apply explicit migrations from older versions |
| `server/state-store.mjs` | Serialize atomic state writes, maintain recovery state, and create/load per-project snapshots |
| `server/http-utils.mjs` | Byte-range parsing, local Host/Origin guards, and response security headers |
| `server/waveform.mjs` | Bound FFmpeg analysis and maintain an in-memory LRU-style waveform cache |
| `server/technical-analysis.mjs` | Run optional bounded FFmpeg loudness/peak/DC/silence analysis and cache compact rebuildable measurements |
| `server/render-job-service.mjs` | Queue one bounded render at a time, report progress, cancel work, clean partials, and discover completed results after restart |
| `server/audio-renderer.mjs` | Normalize edit instructions, build FFmpeg graphs, enforce timeout/cancellation, and atomically publish documented derivatives |
| `server/project-assets.mjs` | Convert selected images/lyrics into safe configured-root references |
| `server/native-picker.mjs` | Register paths selected by the native macOS picker without copying files |
| `server/tool-paths.mjs` | Resolve injected FFmpeg/ffprobe executables for local and packaged runtimes |
| `server/shared-dsp-host.mjs` | Node adapter for the versioned shared-DSP portability prototype |
| `server/native-audio-service.mjs` | Execute the optional fingerprinted Swift hardware probe and publish only sanitized query-only status |

The state and configuration stores serialize writes before replacing their
target file. This prevents overlapping requests from sharing a temporary write
at the same time. Server state validation rejects duplicate IDs, unsafe relative
paths, ambiguous source references, stale candidate choices, and invalid
baseline order references before disk state changes.

## Client modules

| Area | Responsibility |
| --- | --- |
| `src/App.jsx` | Compose workspaces, defer secondary workspace chunks, and coordinate cross-workspace actions |
| `src/hooks/useProjectData.js` | Bootstrap state/library data, serialize autosaves, rescan sources, and manage imports |
| `src/hooks/useTransport.js` | Preview sources, queue playback, route live MASTER audio, suspend idle processing, expose transport state, and recover from media errors |
| `src/hooks/useAppearance.js` | Resolve and apply persisted display preferences |
| `src/components/*Workspace.jsx` | Own one user workflow and its local interaction state |
| `src/lib/project-commands.js` | Immutable commands for albums, tracks, candidates, assets, and sequence edits |
| `src/lib/library-search.js` | Build the in-memory catalog index and define portable saved-filter records |
| `src/lib/*.js` | Pure import, sequence, formatting, appearance, and mastering rules |
| `src/dsp/*` | Opt-in shared processing contract and AudioWorklet adapter; not production authority yet |
| `native/SharedDspEngine/*` | Swift contract-v2 kernel, golden parity tools, and query-only Core Audio probe; not real-time device authority |
| `desktop-resources/staged/*` | Ignored FFmpeg distribution artifacts and optional verified native-audio probe copied into desktop builds |
| `src/styles/*.css` | Tokens/base rules, shell chrome, workspace features, and responsive/motion rules |

Autosave uses a short debounce for editing comfort, then puts each snapshot on a
single promise chain. A later save cannot be overtaken by an earlier request.
The client tracks the last queued snapshot as well as the last confirmed one,
so a rapid edit/revert or add/delete pair cannot leave a stale pending status or
allow an intermediate queued snapshot to become authoritative.
When the page is being left, an unsaved final snapshot is sent through the
same-origin state endpoint with `sendBeacon`. Imported JSON is validated and
persisted by the server before it replaces the open client state.

Sequence is the entry workspace. Track Review, Album Decisions, Mastering,
Assets, Audio Library, and Settings are separate lazy chunks; pointer/focus
intent and browser idle time warm them before use. Repeated album, sequence,
and source lookups are memoized, while long sequence/library rows use CSS
render containment so offscreen catalogs do not create unnecessary paint work.

The shared transport creates one Web Audio graph on first playback. Track gain
and MASTER EQ/compressor/output/limiter changes use short AudioParam ramps while
the context is running. Raw library sources, clean references, and already
rendered previews use the direct bypass path. Pause suspends rather than closes
the context, keeping resume immediate while releasing real-time processing.
Compact header metering samples fewer time-domain points and skips FFT reads in
VU mode; the full frequency display retains its 2,048-point FFT. This graph is
for responsive auditioning only—FFmpeg remains authoritative for every print.

## HTTP and local security boundary

The default server binds to `127.0.0.1`. It accepts only the configured local
Host and port, and state-changing browser requests must have a matching Origin.
This limits DNS-rebinding and cross-site request risks against the local API.
When the server is owned by the desktop shell, Electron also supplies a random
per-launch engine token through a private renderer session. The server requires
that header on API, media, and static requests, while ordinary browser mode
remains compatible when no engine token is configured.
Responses deny framing, disable MIME sniffing, use a same-origin resource
policy, and apply a restrictive content security policy. User-supplied SVG
assets receive an additional sandbox policy.

The optional native-audio executable is never selected from the shell `PATH`.
The desktop shell accepts only an explicit local path or its packaged resources
location. The service hashes the executable before every probe, requires that
exact fingerprint in the versioned handshake, and strips binary paths,
fingerprints, instance IDs, and process errors from HTTP responses. The current
capability is query-only and cannot become playback authority through the
status endpoint. Concurrent requests share one probe and status is cached
briefly so a local page cannot create an unbounded child-process loop.

Audio delivery supports single HTTP byte ranges, including suffix ranges used
by media clients. Malformed, multiple, reversed, and out-of-bounds ranges return
`416` instead of falling back to an unintended full response.

## State lifecycle and recovery

- `data/seed-state.json` is portable initial state and must remain free of
  machine-specific paths.
- `data/sequencer-state.json` is the ignored, mutable project record.
- `data/sequencer-state.last-known-good.json` is an ignored, validated recovery
  snapshot written before the current state is replaced.
- `data/sequencer-projects.json` indexes saved projects and identifies the open
  project; each project's decisions live in an ignored `data/projects/*.json`
  snapshot. Starting or loading a project flushes pending edits first.
- Every normal edit shows `Changes pending`, `Saving changes`, or `Saved locally`
  in a live status region.
- If current state cannot be parsed, validated, or migrated, startup enters a
  dedicated recovery screen. Restoring the last-known-good snapshot is an
  explicit operator action and never touches indexed media.
- A failed save leaves the open client state intact and shows a recoverable
  warning. Export Project JSON before large catalog changes.
- Invalid imported JSON never replaces the open project.
- `data/audio-index-cache.json` can be deleted and rebuilt; it is not authority
  for album decisions.

Schema version 3 adds sequence versions, transition notebooks, explicit human
approval, candidate comparison queues, and media-free album templates. The
version 2 migration initializes only the new collections; it does not infer any
decision or approval.

Schema version 4 adds the delivery record. Optional technical analysis remains
outside project authority in an in-memory, rebuildable cache. Render history is
rediscovered from completed manifests below `exports/`; the UI can compare
manifests and reveal a server-resolved result in Finder, but cannot delete one.

Schema version 5 adds saved library filters. The audio metadata cache reports
reused versus reprobed records on each incremental scan. Optional filesystem
watching is disabled in portable configuration by default and can be enabled
locally. Undo/redo is session-local; autosave persists the resulting state.
Portable bundles are generated on demand and downloaded directly without
creating a second media tree.

Schema version 6 keeps the fixed Basic MASTER bus intact and adds a separately
stored Premium serial rack. Migration always leaves Basic selected, so opening
an older project does not change its live or rendered sound.

Schema version 7 upgrades every Premium node to the common mastering plug-in
contract. Included processors carry a stable built-in format, vendor, plug-in
ID, definition version, parameters, and serial position. Future VST3 and Audio
Unit nodes use the same identity boundary plus bounded opaque state. Until an
isolated signed native host resolves an installed, user-owned instance, an
external node is preserved but forced unavailable and bypassed.

## Adding a feature safely

1. Put domain rules in a pure `src/lib` module when they can be independent of
   React or the filesystem.
2. Add server behavior through a narrow service that receives indexed records,
   not arbitrary browser-supplied absolute paths.
3. Extend state validation before adding new persisted fields. Introduce a new
   schema version and migration for incompatible changes.
4. Keep source selection, sequencing, approval, and printing explicit in the
   UI; do not collapse them into one overloaded status.
5. Add unit coverage for boundaries and run the rendered workflow in the
   in-app browser at desktop and mobile sizes.
6. For mastering changes, run at least one short FFmpeg print and inspect the
   derivative, cue sheet, and manifest together.

## Architectural pressure points

The first confidence-foundation refactor extracted API routing, project
commands, state migrations, and style layers. `src/App.jsx` remains the primary
client composition hub; future feature families should keep moving domain
rules into focused modules instead of growing it indefinitely. The prioritized
plan is maintained in [QUALITY-REVIEW-AND-ROADMAP.md](./QUALITY-REVIEW-AND-ROADMAP.md).
The schema-7 Basic/Premium mastering split and serial plug-in graph are now
implemented. `src/lib/advanced-mastering.js` owns normalization, catalog
definitions, plug-in identity, serial connections, and the 16-instance safety limit;
`AdvancedMasteringRack.jsx` owns the hardware rack and patch lane; the live Web
Audio slot pool and FFmpeg filter builder consume the same ordered node list.
The included catalog adds Stereo Field Matrix, Harmonic Color, Phase Alignment,
HF Smoother, Mastering Ambience, Transient Sculptor, and Creative Phaser to the
original EQ, compressor, output, and limiter. Master monitoring now adds
audition-only stereo/mono/Mid/Side matrices, a vectorscope, and phase
correlation; monitor selection is never serialized into a master print.
Basic remains the default after migration, and each path keeps independent
state. The higher-fidelity shared DSP core and isolated native plug-in companion
remain specified separately in
[ADVANCED-MASTERING-AUDIO-PIPELINE-PLAN.md](./ADVANCED-MASTERING-AUDIO-PIPELINE-PLAN.md).
The first executable shell and contract proof are documented in
[NATIVE-DSP-POC.md](./NATIVE-DSP-POC.md) and
[SHARED-DSP-CONTRACT.md](./SHARED-DSP-CONTRACT.md); neither changes the current
Web Audio/FFmpeg authority boundary.
The original analog-style visual direction and per-processor faceplate roadmap
are tracked in
[MASTERING-PLUGIN-VISUAL-DESIGN-NOTES.md](./MASTERING-PLUGIN-VISUAL-DESIGN-NOTES.md).

## Verification layers

- `npm test` covers pure domain rules, plug-in identity and bounds, server
  boundaries, migrations, recovery, render jobs, Basic prints, the original
  Premium chain, and a real FFmpeg print through every new spatial/creative
  built-in.
- `npm run test:browser` starts an isolated repository-owned server with tiny
  generated fixtures. It covers persistence, privacy masking, independent
  audition/master choices, import rejection, modal focus, filters, mobile
  overflow, drag-to-repatch Premium persistence, a real render job, and
  byte-range delivery.
- Browser/IAB remains the human-visible desktop/mobile and keyboard QA path.
