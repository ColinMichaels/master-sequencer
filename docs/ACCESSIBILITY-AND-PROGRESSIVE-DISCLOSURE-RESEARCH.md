# Accessibility and Progressive Disclosure Research

Status: implementation brief for `codex/progressive-disclosure-ux`
Reviewed: 2026-08-20
Scope: first-use clarity, expert depth, keyboard discoverability, and safety-critical audio workflows

Implementation checkpoint — 2026-08-22: Phases 1–6 are complete on the working
branch. The 857-item visual-media catalog has one roving listbox entry instead
of 857 separate Tab stops, and query-driven rendering plus offscreen row work
are now deferred without removing results from the DOM. Pointer use, selection
details, browser find, accessibility relationships, and the global transport
shortcut boundary remain intact. The project owner accepts the automated WCAG,
rendered keyboard, and live listbox evidence as sufficient for this project's
current scope; physical macOS VoiceOver remains unverified but non-blocking.

## Executive judgment

Project Sequencer should keep one stable seven-workspace application structure. It should not split into separate "beginner" and "advanced" products, and it should not globally hide features behind a mode that silently changes what the project can do.

The right model is progressive disclosure by task:

1. Keep the next safe album action visible.
2. Reveal supporting controls when the selected track, decision, or delivery state makes them relevant.
3. Put repeat-use and specialized tools in one clearly labeled local disclosure or overflow menu.
4. Make every keyboard shortcut learnable from a visible control and a searchable reference.
5. Never hide source authority, privacy, monitor routing, save state, approval state, or export consequences.

This preserves a predictable mental model for new users while letting an experienced engineer work quickly. It also avoids the support and accessibility cost of two interfaces with different feature locations.

## What the current application already gets right

- The seven workspace tabs are stable, consistently ordered, and have number-key shortcuts.
- First use explains that audio remains local and source files are not changed.
- Audition selection, master approval, and publication readiness are modeled as separate decisions.
- Basic and Premium mastering are separate, recoverable paths rather than a cosmetic switch.
- A/B reference playback visibly identifies the processed master and clean bypass route.
- Keyboard shortcuts already yield to focused edit fields, native controls, and modal dialogs.
- Text scaling, color modes, reduced motion, keyboard focus, and automated serious/critical WCAG checks are release gates.

The remaining difficulty is density. Several expert tools are permanently visible even when they are not part of the user's current task:

- Audio Library saved-filter creation and deletion sit beside everyday search.
- Album Decisions presents sequence versions, transition variants, readiness, matched-candidate previews, templates, and release scheduling at once.
- Mastering combines delivery authority, Basic/Premium equipment, per-track editing, optional analysis, chapter navigation, render history, and advanced reset gestures in one long surface.
- Compact icon actions are technically labeled but can still require exploration before a first-time user understands their purpose.

## Research synthesis

### Progressive disclosure must be local and descriptive

Apple's disclosure guidance recommends showing common controls first, hiding advanced options until they are relevant, labeling the disclosure for the content it reveals, and placing it beside the affected content. The GOV.UK details pattern similarly recommends disclosure only for information that some users need—not content required by most users.

Project rule: one disclosure per task area, placed beside that area. The label must name the hidden tools and surface useful state, such as `Saved filters · 3` or `More transition tools · 2 variants`. Avoid generic labels such as `More`, nested disclosures, or an unlabeled ellipsis for important actions.

### Good defaults reduce setup, but modes create hidden state

Apple's Settings guidance favors useful defaults, fewer preferences, and task-specific options in the screen they affect. Logic Pro demonstrates a global Simplified/Complete mode for a professional audio application, including a visible indicator and automatic availability when an existing project uses a complete feature.

That is useful evidence, but Project Sequencer should use a narrower design. A global beginner/advanced switch would make screenshots, help, and support instructions ambiguous; it could also obscure controls needed to understand an existing album's saved mastering state. Local disclosure gives the same reduction in visual load while keeping saved project meaning visible.

Project rule: preferences can remember whether a user expanded a local expert panel, but they must never change project data, disable playback, or conceal the fact that an album already uses an advanced feature.

### Shortcuts are an acceleration layer, not a secret feature layer

Ableton Live exposes a complete shortcut reference, stable shortcuts for showing and hiding working areas, and explicit mapping modes that visually highlight assignable controls and open a browser showing the current mappings. The important pattern is not the number of shortcuts; it is that expert behavior is visible, reviewable, and reversible.

Project rule: every shortcut must have all four of these properties:

- a visible equivalent control;
- a visible shortcut hint at the point of use or in the shortcut guide;
- a documented scope and conflict rule;
- no activation while a focused input, native control, editable region, or modal owns the key.

The first implementation slice adds a Keyboard Shortcuts guide to Quick Settings and the `?` key from an unfocused workspace. It documents navigation, audition, A/B, waveform, and mastering-reset commands while explicitly stating when they pause.

### Discoverability is part of cognitive accessibility

W3C cognitive accessibility guidance calls for controls whose purpose is clear, instructions next to the activity, and complete step-by-step guidance for complex tasks. It specifically notes that clear instructions help new users as well as people with cognitive and learning disabilities.

Project rule: the interface should answer three questions without requiring a manual:

1. What am I deciding here?
2. What is the safest next action?
3. What changes—and what does not change—if I use it?

Descriptions should be short and local. The full first-run workflow remains available as reference, but routine work must not depend on remembering it.

## Four visibility layers

| Layer | Meaning | Behavior |
| --- | --- | --- |
| Core | The next common, safe task | Always visible and fully labeled |
| Context | Controls required by the current selection or state | Appears when relevant, near the selected item |
| Expert | Specialized, repeat-use, or configuration tools | One labeled disclosure/menu; can remember expansion per workspace |
| Authority | Privacy, source, route, approval, save, and export truth | Always visible; never collapsed, inferred, or combined |

The authority layer overrides visual simplification. For example, a clean-reference route must stay visible while A/B is active even if detailed comparison controls are collapsed.

## Workspace visibility map

| Workspace | Always visible for a new user | Reveal in context | Expert disclosure or shortcut | Never hide |
| --- | --- | --- | --- | --- |
| Sequence | Track order, source choice, play, add tracks, total length, export | Transition preview when a next playable track exists; restore list when tracks are excluded | Compact reorder commands, version handoff, bulk ordering tools | Missing audio, protected label, current playback, save state |
| Mastering | Selected track, waveform, track level, trim, ending, Basic chain, play, print/export | Fade/crossfade controls for the chosen ending; delivery requirements after a profile is chosen | Optional analysis, Premium rack, render history, exact-value/reset help | MASTER route, bypass, A/B channel, clean-reference status, approval and ready-to-publish distinction |
| Track Review | Candidate list, preview, audition choice, master choice, decision notes | Master approval after a candidate is selected | Comparison queue setup and secondary metadata | Private filename masking, audition/master separation, unavailable source |
| Album Decisions | Readiness summary and unresolved blockers | Release date when the album approaches readiness; transition note for the chosen pair | Sequence versions, A/B transition variants, matched derivatives, templates | Every independent readiness gate and human approval |
| Assets | Missing/attached state, add visual, lyrics tied to candidate | Track assets after selecting a track | Campaign/reference groupings and metadata | Candidate-to-lyric association and protected labels |
| Audio Library | Search, results, preview, add files/folder, assign to track | Reconnect only for a remembered source needing permission | Saved filters and path diagnostics | Local-only statement, connection state, privacy masking, selected destination |
| Settings | Project identity, appearance/accessibility, remembered audio, privacy | Reconnect/forget actions for the affected source | Native Engine Lab, manual paths, import/export diagnostics | Current project, local-data boundary, destructive-action consequences |

## Interaction specification

### Disclosure controls

- Use a real button with `aria-expanded` and `aria-controls` for an interactive tool panel. Native `details/summary` is acceptable for short secondary help, but should not conceal a multi-step workflow or majority-use action.
- Use one level of disclosure only. If a revealed panel needs another hierarchy, use clear headings or a dedicated inspector rather than a second accordion.
- Put the disclosure directly before or beside the controlled region.
- Labels name the content: `Saved filters`, `Optional technical analysis`, `Advanced transition tools`, or `Render history`.
- Include status without relying on color: `3 saved`, `analysis available`, `2 variants`, `last print succeeded`.
- When collapsed, preserve warnings and active-state summaries outside the panel.
- On collapse, move focus back to the disclosure button if focus was inside the region.

### Menus and overflow

- Use an overflow menu for short action lists that operate on one selected object, such as duplicate, remove, or reset a Premium rack node.
- Do not move the primary action or safety status into an overflow menu.
- Destructive or state-replacing actions retain confirmation and describe what is preserved.
- Menus close on Escape, restore focus to the trigger, support arrow navigation, and do not obscure the focused item behind sticky chrome.

### Keyboard learning

- Quick Settings includes `Keyboard shortcuts` as a labeled, one-click destination.
- `?` opens the guide only from the unfocused workspace.
- Workspace tabs continue to show number hints in tooltips and accessible descriptions.
- Context-specific hints appear next to their control: A/B arrows by the A/B monitor; Option reset by mastering equipment; waveform keys in the waveform help.
- A future command surface may search visible actions, but it must not expose actions that are unsafe or unavailable in the current state.

### First-use path

The first-run guide should remain a short orientation, not a tour of every control:

1. Confirm local/source safety.
2. Connect audio.
3. Create or choose an album.
4. Add and audition tracks.
5. Sequence and review.
6. Master and export.

After dismissal, each empty workspace supplies one local next action. Completion never depends on reopening the guide.

## Accessibility acceptance criteria

- WCAG 2.2 AA is the baseline for released surfaces.
- Interactive targets are at least 24 by 24 CSS pixels or meet the spacing exception; Project Sequencer should continue its stronger practical targets of 32 pixels for compact desktop controls and 44 pixels for principal/touch controls.
- Keyboard focus remains visible and is not hidden by the sticky app header, mobile workspace strip, transport bar, popovers, or non-modal dialogs.
- All pointer dragging has a keyboard/button alternative.
- Disclosures and menus work at 390 by 844 CSS pixels and 120% in-app text scale without horizontal page overflow.
- Reduced-motion mode removes nonessential transition and animation duration.
- No shortcut fires from focused inputs, textareas, selects, buttons, sliders, editable regions, menus, or modal dialogs.
- Automated Axe checks block serious or critical WCAG A/AA findings, but rendered keyboard, screen-size, and task-flow checks remain mandatory.

## Implementation order

### Phase 1 — Make expert paths learnable

- Add the Keyboard Shortcuts guide and safe `?` entry point. **Complete on this branch.**
- Inventory every global and contextual shortcut from runtime behavior, not aspirational documentation. **Complete on this branch.**
- Add shortcut hints only where the command is available. **Complete on this branch.**

Exit gate: users can discover every active shortcut through visible UI, and shortcut tests prove focused controls and dialogs retain ownership.

### Phase 2 — Reduce library and decision density

- Move saved-filter management behind one `Saved filters` disclosure while keeping search and filters visible. **Complete on this branch.**
- Keep the Readiness Inspector primary in Album Decisions. **Complete on this branch.**
- Group versions, transition variants, matched previews, and templates under clearly labeled local expert panels. **Complete on this branch.**

Exit gate: a new user can find an unresolved readiness blocker and assign a library file without opening an expert panel.

### Phase 3 — Reshape mastering around the selected task

- Keep route, meters, A/B identity, Basic/Premium selection, selected track, and export authority visible. **Complete on this branch.**
- Collapse optional technical analysis and render history by default, surfacing their status in the disclosure label. **Complete on this branch.**
- Show only ending controls relevant to Natural, Cut, Fade, or Crossfade while preserving the resulting instruction summary. **Complete on this branch.**

Exit gate: the Basic-path fixture keeps audition, trim, ending, route, A/B, and print authority in the primary flow; optional measurement vocabulary and render history stay closed until requested. Verified at desktop and 390×844, including 120% text, disclosure focus return, all four ending modes, and no horizontal overflow.

### Phase 4 — Add contextual expert acceleration

- Add local action menus for repeat-use operations and selected-node actions. **Complete on this branch for the selected Audio Library file and selected Mastering track; the original visible actions remain available.**
- Consider a searchable command surface only after the visible action inventory is stable. **Complete on this branch: Command Search mirrors the seven workspace tabs plus existing add, open, export, help, and shortcut actions, with a visible Quick Settings entry and Cmd/Ctrl+K accelerator that yields to focused controls and dialogs.**
- Let users pin a frequently used expert panel open per workspace; store this as device/interface preference, not portable album state. **Complete on this branch for Audio Library saved filters, all Album Decision expert modules, Mastering technical analysis, and render history. Pins are stored in a bounded device-only interface-preference record.**

Exit gate: expert actions are faster without changing project semantics, source authority, or the visible safety model. Verified through remount/reload persistence, unchanged server project state, keyboard focus return and ownership, desktop and 390×844 layouts at 120% text, automated WCAG A/AA checks, all 254 unit/integration checks, the production build, all 81 local browser checks, and all 5 hosted-mode browser checks. **Complete on this branch.**

### Phase 5 — Make large result sets practical for assistive technology

- Replace one Tab stop per visual-media row with a single-selection listbox and
  one roving Tab stop. **Complete on this branch.**
- Support Up/Down, Page Up/Down, Home, End, Enter, and Space without changing
  source files, project relationships, or visible pointer behavior. **Complete
  on this branch.**
- Give every option a concise title, media type, format, track, readiness,
  Added, and Modified announcement plus its position in the current result set.
  **Complete on this branch.**

Exit gate: an 857-item All Media result set contributes one Tab stop, the
selected option and details stay synchronized while navigating, focus remains
visible and scrolled into view, desktop and 390×844 remain usable, and the
automated accessibility/browser gates stay green. Verified with all 254
unit/integration checks, the production build, all 81 local browser checks, all
5 hosted-mode browser checks, and a live 857-item desktop/390×844 Browser pass
with clean diagnostics. Physical macOS VoiceOver remains unverified and is an
accepted non-blocking limitation for this project's current scope.

### Phase 6 — Keep large result sets responsive without hiding them

- Defer only query-driven filtering and result rendering so search input stays
  responsive; keep scope, format, track, platform, readiness, media/aspect, and
  sort changes immediate. **Complete on this branch.**
- Use browser-native offscreen rendering containment for result rows while
  retaining the full listbox in the DOM. **Complete on this branch.**
- Treat virtualization as a measured fallback. Require a repeatable production
  trace showing warm-cache search-to-results p95 above 100 ms or repeated
  main-thread tasks above 50 ms during ordinary scrolling before accepting the
  extra focus, browser-find, and accessibility complexity. **Documented on this
  branch.**

Exit gate: the 857-item library keeps one listbox and one roving Tab stop,
search retains focus while results update, offscreen rows report native
rendering containment, desktop and 390×844 remain usable, and the existing
accessibility/browser gates stay green. Verified with all 254 unit/integration
checks, the production build, all 81 local browser checks, all 5 hosted-mode
browser checks, and a live 857-item desktop/390×844 production-browser pass
with clean diagnostics. **Complete on this branch.**

## Measures of success

Usability testing should use both first-time and experienced participants. Measure:

- time to connect audio and play the first track;
- time to explain the difference between audition source and master approval;
- time to identify whether A or B bypasses mastering;
- completion and error rate for trimming, crossfading, and export readiness;
- number of expert panels opened during a basic sequencing task;
- shortcut discovery and recall after one session;
- keyboard-only completion and focus-loss incidents;
- mistaken belief that source audio was uploaded, copied, or overwritten.

The target is not the fewest visible controls. The target is the least uncertainty while preserving professional truth.

## Primary sources

- [Apple Human Interface Guidelines: Disclosure controls](https://developer.apple.com/design/human-interface-guidelines/disclosure-controls)
- [Apple Human Interface Guidelines: Settings](https://developer.apple.com/design/human-interface-guidelines/settings)
- [Apple Logic Pro: Use the complete set of features](https://support.apple.com/guide/logicpro/use-the-complete-set-of-logic-pro-features-lgcp5cbf192f/mac)
- [Ableton Live 12: Keyboard shortcuts](https://www.ableton.com/en/live-manual/12/live-keyboard-shortcuts/)
- [Ableton Live 12: MIDI and Key Remote Control](https://www.ableton.com/en/live-manual/12/midi-and-key-remote-control/)
- [GOV.UK Design System: Details](https://design-system.service.gov.uk/components/details/)
- [W3C WAI: Clearly Identify Controls and Their Use](https://www.w3.org/WAI/WCAG2/supplemental/patterns/o1p05-clear-controls/)
- [W3C WAI: Use Clear Step-by-step Instructions](https://www.w3.org/WAI/WCAG2/supplemental/patterns/o4p07-step-instructions/)
- [W3C WAI: WCAG 2.2 Target Size (Minimum)](https://www.w3.org/WAI/WCAG22/Understanding/target-size-minimum.html)
- [W3C WAI: WCAG 2.2 Focus Not Obscured (Minimum)](https://www.w3.org/WAI/WCAG22/Understanding/focus-not-obscured-minimum.html)
