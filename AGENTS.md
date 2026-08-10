# Project Sequencer guidance

Project Sequencer is a standalone, local-first album sequencing and audio-source
review tool. It does not own the audio it indexes.

## Safety

- Never rename, move, delete, transcode, normalize, overwrite, or copy indexed
  source audio as part of a sequencing workflow.
- Serve media only from a configured root and only after it has been indexed.
- Bind the local server to `127.0.0.1` by default.
- Keep machine-specific audio file and folder paths in ignored `config/sequencer.local.json` or
  `PROJECT_SEQUENCER_AUDIO_PATHS`; do not add them to tracked defaults.
- Preserve protected track labels and keep private filenames masked by default.
- Album ordering, audition sources, and master approval are separate decisions.
- Trims, fades, gaps, and transitions are non-destructive instructions. Rendered
  derivatives belong in ignored `exports/YYYY-MM-DD/` folders with their cue
  sheet and manifest; never write a render over an indexed source path.
- Waveform analysis must read an already-indexed source, return only compact
  peak data, and remain memory-only; never expose an absolute source path or
  create a waveform sidecar beside the audio.

## Workflow

Run from the repository root:

```bash
npm install
npm test
npm run build
npm run dev
```

Use Browser/IAB for rendered QA. Verify real range-based audio playback,
reordering, persistence, transition previews, library filters, path status,
desktop/mobile layout, waveform marker keyboard/drag behavior, and at least one
short FFmpeg print when changing the mastering workflow before declaring the
change complete.

## Data boundaries

- `data/seed-state.json` is the portable initial catalog.
- `data/sequencer-state.json` is ignored, mutable local project state.
- `data/audio-index-cache.json` is ignored and rebuildable.
- `config/sequencer.config.json` is portable application configuration.
- `config/sequencer.local.json` is ignored, machine-specific path configuration.
- Native picker actions register paths only; they must never copy or rewrite the
  selected audio.
