# Quality Review and Roadmap

Review date: 2026-08-23

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

### 2026-08-23 integrated work-in-progress completion

- Progressive disclosure, contextual actions, device-only expert-panel pins,
  safe global shortcuts, and Command Search now form one tested interface layer
  without changing portable project state or source authority.
- Track-status editing, confirmed track renaming, project-record removal, and
  candidate-source grouping remain separate from audition choice, master
  approval, and indexed source audio.
- The Video & Graphics Library indexes configured originals in place, keeps
  metadata separate, supports an 857-item roving listbox, and reports a
  truthful local-only boundary in hosted mode.
- MASTER print planning, export disclosure, render manifests, delivery
  profiles, and the generated-fixture VST3 scanner, validator, and instance lab
  are integrated. Third-party plug-in execution remains runtime-blocked.
- The final integrated gate passes all 254 unit/integration checks, the
  production build, all 81 local rendered-browser checks (including a real
  numbered-track FFmpeg print), all 5 hosted-mode checks, and the native
  contract, 7-check scanner, 10-check validator, and 12-check instance-lab
  self-tests. The compatible macOS 15.4 SDK was selected explicitly because the
  machine's default Command Line Tools SDK/compiler pair is mismatched.

### 2026-08-22 VST3 host Phase 5.1–5.2b foundation

- A dependency-free Swift metadata scanner now discovers only standard macOS
  VST3 roots or explicitly approved roots, retains root priority, and identifies
  processor classes by stable Class ID without loading plug-in code.
- Bundle and metadata symlinks fail closed, metadata is capped at 1 MiB, and the
  versioned public report excludes absolute paths and path-like metadata.
- Seven generated-fixture self-tests and the full 238-test/build repository gate
  pass. A read-only scan found 48 global bundles, all lacking optional module
  metadata, so zero are marked ready for native factory validation.
- An explicit coordinator now launches one disposable worker per bundle,
  performs architecture/signature/fingerprint preflight, bounds child output,
  and classifies timeout, crash, malformed output, and rejection. Public reports
  remain path-free; the optional ignored local catalog is owner-only.
- Ten generated-fixture checks prove real module/factory entry and isolation
  behavior without creating a plug-in instance or loading installed third-party
  binaries. A factory success is explicitly runtime-blocked.
- A second explicit disposable laboratory now creates only the generated
  fixture instance, enumerates up to 256 parameters, round-trips 1 MiB-bounded
  component/controller state, records latency/tails, and verifies four finite
  offline zero-input blocks. It emits only summaries and state digests.
- Twelve instance-lab checks pass in addition to the seven scanner and ten
  factory-validator checks. Installed third-party plug-ins remain unexecuted;
  success is runtime-blocked and no VST3 binary is available in the rack.
- The next Phase 5 slice is an explicit small compatibility set plus message
  connections, automation queues, nonzero fixtures, new-instance state restore,
  and tail flushing, still quarantined from the rack.

### 2026-08-22 visual-catalog maintenance cleanup

- Platform choices and format counters now come from one memoized catalog pass
  instead of rebuilding one platform pipeline and scanning the entire catalog
  once per format on every component render.
- Selected-result lookup is memoized, so urgent search-field renders do not
  rescan the previous result set while the deferred query is catching up.
- The project owner accepts automated WCAG checks, rendered keyboard coverage,
  and the live listbox review as sufficient for this project's current scope.
  A physical macOS VoiceOver session remains unverified but is not a blocking
  release gate.
- Verification passed with all 238 unit/integration checks, the production
  build, the focused visual-library browser workflow, and a live 786-item
  desktop/390×844 production-browser pass with clean diagnostics.

### 2026-08-22 large-catalog responsiveness follow-up

- Visual-library text search now defers only the query-driven result render, so
  typing remains the urgent update while scope, format, platform, readiness,
  media/aspect, track, and sort controls remain immediate.
- Rows use browser-native offscreen rendering containment while keeping all
  results in the DOM. The Phase 5 listbox, roving Tab stop, position
  announcements, browser find, and assistive-technology relationships are not
  replaced by virtualization.
- Virtualization is now a measured fallback rather than an item-count reaction:
  it requires repeatable production evidence of search-to-results p95 above
  100 ms or repeated main-thread tasks above 50 ms during ordinary scrolling,
  plus the existing keyboard, responsive, lazy-media, and accessibility gates.
- Verification passed with all 237 unit/integration checks, the production
  build, all 74 local browser checks, all 5 hosted-mode browser checks, and a
  live 786-item desktop/390×844 production-browser pass with clean diagnostics.

### 2026-08-22 assistive-technology navigation follow-up

- The 786-item Video & Graphics Library now exposes one named single-selection
  listbox instead of making every result a separate Tab stop.
- Up/Down, Page Up/Down, Home, End, Enter, and Space stay local to the focused
  media list, update the selected preview/details, and keep focus visible around
  sticky application chrome. The global album-transport arrows remain unchanged
  everywhere else.
- Each result announces a concise title, media type, format, track relationship,
  readiness, Added date, Modified date, and position. The keyboard instructions
  are also visible beside the result count.
- The repository gates and live 786-item desktop/390×844 verification pass. A
  physical macOS VoiceOver session remains unverified and is accepted as
  non-blocking for this project's current scope.

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

### 2026-08-20 automated accessibility gate

- A repository-owned Axe/Playwright suite now scans all seven primary
  workspaces at desktop and 390 px phone widths, including the maximum 120%
  interface text setting, plus eight key popover and modal workflows. It blocks
  serious or critical WCAG 2 A/AA findings, phone-width overflow, and modal
  focus that remains behind a dialog.
- The first audit exposed an invalid Sequence table hierarchy. Its header,
  rowgroup, rows, column headers, and cells now form one valid semantic table
  while preserving the existing nested controls and desktop/mobile layout.
- The expanded dialog audit exposed an Add Tracks focus handoff gap. Opening the
  workflow now moves keyboard focus directly to its first audio-source action.
- Preference-mode coverage exposed invalid table hierarchies in Album Decisions
  and Audio Library plus low-contrast native-host boundary copy. Those surfaces
  now expose complete row/header/cell semantics and readable boundary text.
- Reduced-motion coverage now verifies that scrolling becomes immediate and
  nonessential CSS animations, delays, and transitions collapse to effectively
  zero duration throughout the expanded Premium rack.
- Automated scans complement rather than replace manual keyboard, screen-reader,
  browser-zoom, visual, and cognitive-accessibility review.

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
| Accessibility | Good | Semantic tables and controls, keyboard markers, focus-managed dialogs, 120% text/reduced-motion coverage, a serious/critical WCAG 2 A/AA gate, and roving listbox navigation for the current 857-item visual library; physical macOS VoiceOver is an accepted non-blocking limitation |
| Responsive UI | Strong | Automated primary-workspace overflow checks at 390 px plus Browser/IAB inspection |
| Automated coverage | Strong | 254 domain/server/FFmpeg checks, production build, 81 local rendered workflows, and 5 hosted-mode boundaries |
| Maintainability | Strong | API routing, schema/migrations, project commands, search, delivery rules, and style layers are separated |
| Native plug-ins | Instance-lab foundation | Path-free discovery, factory validation, and generated-fixture parameter/state/latency/tail/offline lifecycle are proven in disposable workers; installed compatibility, automation, editors, program audio, restoration, compensation, and prints remain blocked |

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
