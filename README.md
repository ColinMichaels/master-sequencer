# Project Sequencer

Project Sequencer is a standalone, local-first workspace for building and
reviewing album sequences across past, current, and future records. It indexes
audio from configurable folders, streams the originals in place, and keeps
album order, audition sources, master decisions, and review notes separate.

No indexed audio is copied, renamed, transcoded, normalized, overwritten, or
deleted.

## Included Dreadnauts seed

- **Past:** _Cosmic Reggae Sessions_, using the released nine-track Website
  sequence and its released Website audio sources.
- **Current:** _No Planet to Call Home_, using the full 18-file candidate
  inventory. The title-track audio gap stays explicit, the protected Track 8
  label and filenames stay masked by default, and Track 9 stays marked legacy.
- **Future:** an empty _Untitled Album_ ready for new tracks without inventing
  future canon.

Machine-specific source paths and live index counts are intentionally absent
from tracked documentation. The running application reports its current paths,
connection state, and discovered file count locally.

## Start

Requirements: Node.js 20.19+ in the Node 20 line, or Node.js 22.12+, plus
`ffprobe` and `ffmpeg` on `PATH` for duration metadata, edit previews, and audio
printing.

```bash
npm install
npm run dev
```

Open [http://127.0.0.1:4177](http://127.0.0.1:4177). The first scan may take a
few seconds; later starts use the metadata cache.

On a new installation with no configured audio paths or indexed files, the app
opens a first-run guide. It explains the complete file-to-album workflow and
links directly to the native audio picker, album creation, and the main editing
workspace. The guide also introduces the non-destructive track-level controls
and shared album MASTER bus alongside the timing and transition workflow.

For the built production app:

```bash
npm run build
npm start
```

## Main workflows

- **Sequence:** add individual audio files or a whole folder, review the files
  before they become tracks, drag tracks or use arrow buttons, choose temporary
  audition sources, play the available album order, and use the active row's
  play control to pause or resume the shared main transport. Render an edited
  track ending into its adjacent track and continue through that next track,
  remove a track from the working sequence without deleting its record, restore
  unsequenced tracks, reset to the baseline order, and export a Markdown
  sequence.
- **Track Review:** compare every candidate, play sources, record notes, choose
  a master candidate, set a separate disposition, and explicitly queue sources
  for loudness-matched derivative previews without changing either choice.
- **Album Decisions:** name, duplicate, compare, and restore sequence versions;
  keep notes, markers, and A/B settings for every adjacent transition; inspect
  eight independent readiness gates; audition clearly labeled loudness-matched
  comparison derivatives; and create reusable album structures that carry no
  media or approvals.
- **Mastering:** read the real source waveform, drag or keyboard-adjust
  accessible start/end markers, see trimmed, kept, fade, and crossfade regions,
  and retain next-track context while sequencing. Set non-destructive opening
  fades, natural endings, hard cuts, fade-outs, crossfades, and post-track
  silence; balance each track before fades and transitions; shape the complete
  album through a shared MASTER EQ, compressor, output stage, and limiter;
  preview edited starts and endings; then print a selected track or
  continuous album program as 24-bit/48 kHz WAV or 320 kbps MP3. Run optional
  rebuildable true-peak, loudness, DC-offset, and silence analysis; navigate a
  chaptered trim preview without reprinting the full program; validate prints
  against delivery profiles while recording master approval and publish
  readiness separately; and compare or reveal documented render history without
  deleting derivatives.
- **Assets:** attach album artwork and track-specific visual references, choose
  an album cover, and associate both Suno prompt lyrics and clean DistroKid
  lyrics with the exact audio candidate they describe.
- **Audio Library:** search every discovered source, filter by root/format/use,
  save and restore indexed searches/facets, preview files, add a file as a
  candidate, or create a new track from it. Incremental rescan status shows
  reused versus reprobed metadata and explicitly reports offline/reconnected
  roots.
- **Settings:** click a file-path or folder-path control to open the native
  macOS picker; manual path entry remains under an optional fallback. Choose
  dark, light, or system mode; adjust interface text from 90% to 120%; and mix
  four color themes with four font pairings. Disconnect sources, rescan, keep
  protected filenames masked, and export/import the complete Project Sequencer
  JSON record. Export an optional portable bundle containing project JSON and
  source checksums only; it never copies media.

The application shell uses compact icon tabs and transport actions with
accessible hover/focus labels. The Albums rail can be collapsed when more
editing space is needed; its compact state keeps project actions and album-art
navigation available as labeled icons. Header statistics use icon buttons with
count badges; selecting one opens a detailed album snapshot with direct links
to the relevant workspace. The Sequence workspace uses the full content area.
Project edits also have a bounded 100-step undo/redo history. Undo changes only
the local project record; it never reverses a filesystem operation.

Projects can be started fresh and reopened from the album rail or Settings.
Before a switch, pending edits are flushed into the current project's ignored
local snapshot; configured audio paths remain shared without copying media.
Albums can be added, renamed, or explicitly deleted from the album rail, and
blank tracks can be added from the sequence workspace. Deleting an album removes
only its Project Sequencer decisions and references—indexed source audio and
rendered exports are untouched—and the final album in a project is protected.
Renaming changes only the album title;
the permanent album ID and every attached track, source, asset, note, sequence,
and approval remain unchanged. Past, current, and future are organizational
eras, not publication states.

## Configure audio paths

Machine-specific paths live in the ignored file
`config/sequencer.local.json`:

```json
{
  "audioRoots": [
    {
      "id": "music-library",
      "label": "Music Library",
      "path": "/absolute/path/to/music"
    }
  ],
  "audioFiles": [
    {
      "id": "single-master",
      "label": "Single Master",
      "path": "/absolute/path/to/audio/master.wav"
    }
  ]
}
```

You can manage both lists from **Settings → Audio Paths**. On macOS, the
**Audio file path** and **Audio folder path** controls open native system
pickers. Every platform also keeps manual full-path entry behind an optional
fallback. An additional read-only folder list can be supplied at launch with
the platform-delimited
`PROJECT_SEQUENCER_AUDIO_PATHS` environment variable.

The recursive scanner supports MP3, WAV, FLAC, AIFF/AIF, M4A, AAC, OGG, and
Opus. Symlinked directories are not followed, which avoids cycles and keeps the
index boundary explicit.

Private sources can be mapped to opaque IDs with `privateSourceAliases` in the
ignored local configuration. Their real names and relative paths are then
removed from browser data while playback continues through the private ID.

Hidden directories are skipped by default. Set `includeHiddenDirectories` to
`true` in configuration if a library intentionally stores source audio there;
the Dreadnauts installation leaves it off so `.whisper` cache and sample audio
do not enter album work.

Rescans always reuse cached metadata for unchanged files. Optional debounced
filesystem watching can be enabled with `"watchAudioRoots": true` in the ignored
local configuration. It is off in the portable default; manual rescans remain
available, and disconnected roots report Offline or Reconnected explicitly.

## Local data

| File | Purpose |
| --- | --- |
| `data/seed-state.json` | Portable initial album catalog |
| `data/sequencer-state.json` | Ignored, mutable album/review state |
| `data/sequencer-state.last-known-good.json` | Ignored, validated recovery snapshot |
| `data/sequencer-projects.json` | Ignored saved-project index and active-project pointer |
| `data/projects/*.json` | Ignored per-project snapshots used for switching and recovery |
| `data/audio-index-cache.json` | Ignored, rebuildable `ffprobe` cache |
| `config/sequencer.config.json` | Portable server and scanner defaults |
| `config/sequencer.local.json` | Ignored machine-specific file and folder paths |
| `exports/YYYY-MM-DD/` | Ignored rendered audio, cue sheets, and manifests |

Project-state writes are debounced in the browser and atomically replaced on
disk. Client and server writes are serialized so an earlier save cannot
overwrite a newer edit. A pending final snapshot is flushed when the page is
left. Album metadata, notes, order, approvals, appearance preferences, and
source references stay in local JSON;
an unsequenced track stays in that record with its candidates and attachments;
the audio, image, and lyric bytes remain at their original paths. Asset records
use configured-root references such as `Album Art/front-cover.png`; visual
previews and lyric files are served only from those configured local folders.
Timing and fade settings are instructions stored on the track record. Audio
printing reads the indexed source and creates a new derivative under
`exports/YYYY-MM-DD/`; it never rewrites the source. Every non-preview print
includes a text cue sheet and JSON render manifest beside the WAV or MP3.
Prints run as cancellable jobs with visible phase and progress, a bounded
process timeout, and cleanup of incomplete files. Completed manifests are
rediscovered after restart so documented results remain available. If current
project state cannot be parsed, validated, or migrated, the application shows
an explicit recovery screen for restoring the last-known-good snapshot; it does
not silently replace project decisions. This is intentionally more
inspectable and portable than browser-only localStorage or IndexedDB. Export
the Project JSON from Settings for a portable backup before large catalog
changes.

## Architecture

- React + Vite application UI
- Local Node HTTP server bound to `127.0.0.1`
- Recursive folder index plus explicit-file sources with cached `ffprobe` metadata
- Range-based audio streaming restricted to indexed files
- On-demand FFmpeg waveform peak extraction restricted to indexed files and
  cached only in server memory
- Configured-root validation for optional album-cover previews
- Album- and track-level visual asset records
- Candidate-level Suno prompt and DistroKid clean lyric attachments
- FFmpeg-based non-destructive trims, fades, crossfades, and documented exports
- No database, cloud account, upload service, or media duplication

The local API validates its Host and state-changing Origin, applies restrictive
security headers, and resolves project-asset symlinks before enforcing the
configured-root boundary. Media delivery supports bounded, open-ended, and
suffix HTTP byte ranges.

See [Architecture](docs/ARCHITECTURE.md) for data flow and extension rules, and
[Quality Review and Roadmap](docs/QUALITY-REVIEW-AND-ROADMAP.md) for the current
assessment and prioritized future plan.

## Verify

```bash
npm run check
```

The full release gate also runs the isolated rendered-browser suite:

```bash
npm run check:full
```

The browser suite generates tiny temporary audio fixtures outside the project
catalog. It exercises real FFmpeg output and HTTP byte-range playback without
reading or changing configured source audio.

For a parallel local production QA process without editing local configuration,
override only the listening port:

```bash
PROJECT_SEQUENCER_PORT=4178 npm start
```
