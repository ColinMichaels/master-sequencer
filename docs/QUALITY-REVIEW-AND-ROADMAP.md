# Quality Review and Roadmap

Review date: 2026-08-11

## Conclusion

Project Sequencer has a strong product foundation: it is useful now, visually
coherent, local-first, explicit about decision authority, and unusually careful
with source masters. The baseline unit suite and production build were already
green. The highest-risk gaps were not missing features; they were overlapping
state writes, incomplete byte-range behavior, shallow import validation, local
API request trust, asset symlink boundaries, and keyboard dialog behavior.

Those gaps are addressed. “Perfect” is not a static
finish line for an audio tool, so the remaining plan is intentionally ordered by
risk reduction and user value rather than feature count.

## Review scope

- Server startup, configuration, scanning, source indexing, range streaming,
  waveform analysis, project assets, state persistence, and FFmpeg rendering
- Sequence, candidate review, mastering, assets, audio library, settings,
  appearance, transport, import/export, responsive layout, and accessibility
- Portable versus machine-local data boundaries
- Unit/build health and rendered desktop/mobile behavior
- Maintainability under likely future album-review features

## Changes completed in this pass

### 2026-08-20 browser-audio and input follow-up

- Browser-selected files and folders now retain permission handles in IndexedDB
  when the File System Access API is available. Bootstrap queries permission
  silently, restores readable sources, and shows an explicit Reconnect action
  only when a user gesture is required. Audio bytes and absolute paths remain
  outside project storage, and file-input fallback remains session-only.
- Space now controls transport from the workspace while focused form controls
  and open dialogs retain native typing and activation behavior. This restores
  ordinary album-title and search editing without allowing modal shortcuts to
  leak into the player.
- Modern is the default font pairing, with Space Age, Groove, and Rounded added
  as portable appearance choices alongside the existing options.

### 2026-08-14 mobile navigation follow-up

- The seven primary workspace tabs now remain pinned at the top edge on phone
  widths while header utilities, the compact album rail, and workspace content
  continue to scroll normally.
- The utility controls stay grouped separately from the tab row so the mobile
  sticky container is not clipped by the desktop header, while desktop retains
  its existing single-row header order.
- Browser regression coverage scrolls the 390×844 Mastering workspace, verifies
  the tab row remains at `top: 0`, switches to Track Review from the pinned row,
  and checks the existing desktop quick-settings layout.

### 2026-08-11 mobile layout pass

- Phone chrome now omits duplicate album counters and redundant workspace
  statistics, keeps only the active album in the compact rail, and disables
  hover-only tooltips while preserving accessible labels and expanded controls.
- Sequence cards reserve separate columns for status and transport actions;
  reorder and Library preview controls meet larger touch targets.
- Mobile Mastering removes the duplicate summary/signal-flow rows, while the
  Audio Library prioritizes search, filters, saved-filter recall, and the file
  list over desktop-only filter management and scan counters.
- Rendered QA passed at 390×844 and 360×800 with no document overflow, no
  framework overlay, and a clean browser console. The regression gate passed
  128 unit/integration tests, 26 browser workflows, and the production build.

### 2026-08-11 interface and performance release

- Number-row and numeric-keypad shortcuts now open all seven primary views,
  with Mastering in slot 2 and a dedicated mastering icon.
- Page titles identify the current view, album, track, and saved project while
  repeated in-workspace headings and the default-collapsed Albums rail preserve
  vertical editing space.
- Sequence lists scroll inside the workspace with sticky controls; large
  sequence/library rows use offscreen rendering containment.
- Delivery controls moved beside Print / Export, the A/B reference panel became
  collapsible with its live A/B choice retained in the summary, and Master Bus
  guidance moved behind an accessible help tooltip.
- The header meter opens Mastering and uses a stronger border/tint only for an
  active MASTER route. EQ, compressor, and limiter displays visualize live
  signal impact only while their processing is active.
- Audio-source references continue to persist through project and page reloads;
  browser device handles are restored when the platform permits and otherwise
  remain explicit reconnectable session sources.
- Secondary workspaces are deferred and warmed on intent/idle, reducing the
  initial production JavaScript from roughly 444 kB/129 kB gzip to
  321 kB/97 kB gzip.
- Live MASTER values use short click-safe ramps, the AudioContext suspends while
  paused, compact VU mode skips unused FFT reads, and time-domain analyzers use
  a smaller window without reducing the full spectrum resolution.
- The cumulative gate passed 128 unit/integration tests, 25 local browser flows,
  2 online device-audio flows, both production/Sites builds, real FFmpeg source
  integrity checks, desktop QA, and 390×844 phone QA with a clean console.

### Reliability

- Autosaves are serialized, so an older request cannot finish last and restore
  stale project state.
- Server state writes are serialized and still use atomic temporary-file
  replacement.
- A pending final browser snapshot is flushed on page exit.
- Imported project JSON is size-bounded, parse-checked, server-validated, and
  saved before it replaces the open project.
- State validation now rejects duplicate candidate IDs, ambiguous source
  references, missing selected candidates, and invalid baseline order entries.

### Media and local security

- Range delivery now handles bounded, open-ended, and suffix byte requests and
  fails closed on malformed or unsatisfiable ranges.
- Local Host and same-origin mutation guards reduce DNS-rebinding and cross-site
  request exposure.
- Security headers deny framing, MIME sniffing, cross-origin resource use, and
  broad content execution.
- Project assets are checked after realpath resolution, preventing a symlink
  inside a configured folder from escaping that folder.
- SVG previews are served under a sandboxed content security policy.

### UX and accessibility

- Dialogs focus their first useful control, keep keyboard focus inside, close
  with Escape, and restore focus to the opener.
- Space toggles the shared transport while focus is in the workspace. Focused
  fields, selects, sliders, switches, buttons, and open dialogs retain their
  native Space behavior so editing and control activation remain predictable.
- Up Arrow and Down Arrow navigate the shared player through the main sequence,
  skip unavailable sources, preserve play/pause intent, and keep the selected
  row visible. Editable controls, sliders, waveform controls, and modal dialogs
  retain their own arrow-key behavior.
- Audio playback reports source failures and continues to the next available
  track during a sequence instead of silently stalling.
- Track-record deletion confirmation expires after five seconds.
- Save state is exposed as a polite live status.
- Dependency versions are pinned and the supported Node range is explicit.

## Current quality matrix

| Area | Status | Evidence / remaining boundary |
| --- | --- | --- |
| Source preservation | Strong | Indexed media is only read; derivatives use ignored export folders |
| State durability | Strong | Serialized client/server writes, atomic replace, page-exit flush |
| State integrity | Strong | Five schema versions, explicit migrations, validation, last-known-good recovery, and bounded undo/redo |
| Playback | Strong | Indexed-key lookup, real byte ranges, queue error recovery |
| Waveforms | Strong | Bounded FFmpeg output, compact response, memory-only cache |
| Render safety | Strong | Queued jobs, progress, cancellation, timeout, partial cleanup, restart discovery, cue sheets, and manifests |
| Privacy | Strong | Opaque protected aliases and default masking; operator can explicitly reveal |
| Accessibility | Good | Semantic controls, keyboard markers, focus-managed dialogs; automated audits remain |
| Responsive UI | Strong | Automated primary-workspace overflow checks at 390 px plus Browser/IAB inspection |
| Automated coverage | Strong | Domain/server/FFmpeg tests, production build, and repository-owned rendered workflows |
| Maintainability | Strong | API routing, schema/migrations, project commands, search, delivery rules, and style layers are separated |

## Prioritized roadmap

### Delivery status

| Round | Status | Branch | Evidence |
| --- | --- | --- | --- |
| P1 — confidence foundation | Complete | `codex/p1-confidence-foundation` | Repository Playwright coverage, generated-audio FFmpeg integration test, render-job lifecycle, schema migration/recovery, and composition-hub splits |
| P2 — album decisions | Complete | `codex/p2-album-decisions` | Sequence versions, transition notebook, readiness, comparison previews, and safe templates |
| P3 — mastering review | Complete | `codex/p3-mastering-review` | Technical analysis, chapter preview, delivery profiles, and render history |
| P4 — scale and portability | Complete | `codex/p4-scale-portability` | Incremental indexing, saved filters, undoable commands, and JSON/checksum bundles |

### P1 — confidence before feature expansion

Completed in the P1 branch:

1. Added repository-owned rendered tests for bootstrap, reorder persistence,
   protected masking, candidate/master separation, JSON import rejection,
   modal focus, library filters, and mobile overflow. Keep Browser/IAB as the
   human-visible QA path; use the automated suite for regression coverage.
2. Introduced a render-job service with progress, cancellation, process timeout,
   partial-output cleanup, and restart-aware result discovery. Never point a job
   at an indexed source path.
3. Added tiny generated audio fixtures and an automated short FFmpeg print test
   that verifies duration, stream format, cue sheet, and manifest consistency.
4. Added state migration and recovery: schema-version migrations, a last-known-good
   snapshot, a recovery screen, and an explicit restore workflow.
5. Split API route handlers out of `server/index.mjs`, extracted project commands
   from `src/App.jsx`, and divide `src/styles.css` by tokens, shell, workspaces,
   and responsive rules. Do this as features touch each area, not as a rewrite.

### P2 — high-value album decisions

Completed in the P2 branch:

1. Added sequence versions that can be named, duplicated, compared, and restored
   without changing track records or approvals.
2. Added a transition notebook with listening notes and markers for each track pair,
   support A/B preview of two non-destructive transition settings.
3. Added a readiness inspector with separate gates for playable source, audition choice,
   master choice, disposition, lyrics, artwork, ordering, and human approval.
   Never infer one gate from another.
4. Added an explicit candidate comparison queue. Its bounded FFmpeg previews
   are loudness matched and labeled as derivatives; originals, audition choices,
   and master decisions stay untouched.
5. Added album templates that copy track organization and mastering instructions
   without copying media, artwork, source choices, or approvals.

### P3 — deeper mastering review

Completed in the P3 branch:

1. Added optional compact technical analysis for true peak, integrated loudness,
   loudness range, DC offset, and silence boundaries. Cache only rebuildable
   measurements and never normalize a source automatically.
2. Added chaptered program preview and cue navigation without rendering an entire new
   file for every small sequence change.
3. Added delivery profiles that validate requested output settings and documentation
   while keeping “print,” “approved master,” and “ready to publish” separate.
4. Added a render-history browser for derivatives under `exports/`, with manifest
   comparison and an explicit reveal-in-Finder action. No automatic deletion.

### P4 — scale and portability

Completed in the P4 branch:

1. Added metadata-incremental rescans and optional filesystem watching for large source
   libraries, with clear offline/reconnected status.
2. Added an indexed catalog search and project-persisted saved filters.
3. Added a bounded command/undo layer for project-state edits, enabling multi-step
   undo without touching source media.
4. Added optional portable project bundles containing JSON and SHA-256 checksums
   only. Media copying remains outside export and outside this roadmap.

All four roadmap rounds are implemented on separate cumulative branches. The
release gate remains the ongoing definition of done for later feature work.

## Features to reject by default

- Automatic renaming, moving, deduplication, normalization, or deletion of
  indexed media
- A single “approved” switch that conflates ordering, audition, mastering, and
  release authority
- Absolute machine paths in tracked defaults, seed data, screenshots, or docs
- Browser-supplied arbitrary filesystem reads or render destinations
- Waveform sidecars beside source audio
- Cloud accounts, collaboration, or publishing until local authority and
  privacy requirements are defined separately

## Release gate for future changes

A feature is ready only when its domain rules have tests, the production build
passes, desktop and mobile rendering have been inspected, keyboard recovery is
available, source paths remain within the configured/indexed boundary, and any
mastering change has produced and verified one short derivative with its cue
sheet and manifest.
