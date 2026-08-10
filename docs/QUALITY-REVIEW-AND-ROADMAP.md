# Quality Review and Roadmap

Review date: 2026-08-10

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
| State integrity | Strong | Schema and reference validation; formal migrations are still future work |
| Playback | Strong | Indexed-key lookup, real byte ranges, queue error recovery |
| Waveforms | Strong | Bounded FFmpeg output, compact response, memory-only cache |
| Render safety | Good | New destination, cue sheet, manifest; cancellation/progress need a job layer |
| Privacy | Strong | Opaque protected aliases and default masking; operator can explicitly reveal |
| Accessibility | Good | Semantic controls, keyboard markers, focus-managed dialogs; automated audits remain |
| Responsive UI | Good | No horizontal overflow at 390 px in the reviewed primary workflow |
| Automated coverage | Good | Domain/server unit tests and build; rendered end-to-end tests remain manual |
| Maintainability | Good | Clear modules and pure helpers; three composition hubs should be split as features grow |

## Prioritized roadmap

### Delivery status

| Round | Status | Branch | Evidence |
| --- | --- | --- | --- |
| P1 — confidence foundation | Complete | `codex/p1-confidence-foundation` | Repository Playwright coverage, generated-audio FFmpeg integration test, render-job lifecycle, schema migration/recovery, and composition-hub splits |
| P2 — album decisions | Complete | `codex/p2-album-decisions` | Sequence versions, transition notebook, readiness, comparison previews, and safe templates |
| P3 — mastering review | Next | `codex/p3-mastering-review` | Technical analysis, chapter preview, delivery profiles, and render history |
| P4 — scale and portability | Planned | `codex/p4-scale-portability` | Incremental indexing, saved filters, undoable commands, and JSON/checksum bundles |

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

1. Optional compact technical analysis for true peak, integrated loudness,
   loudness range, DC offset, and silence boundaries. Cache only rebuildable
   measurements and never normalize a source automatically.
2. Chaptered program preview and cue navigation without rendering an entire new
   file for every small sequence change.
3. Delivery profiles that validate requested output settings and documentation
   while keeping “print,” “approved master,” and “ready to publish” separate.
4. Render-history browser for derivatives under `exports/`, with manifest
   comparison and an explicit reveal-in-Finder action. No automatic deletion.

### P4 — scale and portability

1. Incremental rescans and optional filesystem watching for very large source
   libraries, with clear offline/reconnected status.
2. Search indexing and saved filters once catalog size justifies them.
3. A command/undo layer for project-state edits, enabling reliable multi-step
   undo without touching source media.
4. Optional portable project bundles containing JSON and checksums only. Media
   copying should be a separate, explicit future product decision, not a side
   effect of export.

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
