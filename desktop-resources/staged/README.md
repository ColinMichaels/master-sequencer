# Generated desktop runtime

`npm run ffmpeg:stage -- --manifest /absolute/path/to/approved-manifest.json`
creates ignored `bin/`, `licenses/`, and `ffmpeg-runtime-manifest.json` entries
here. Only a reviewed, self-contained FFmpeg build can pass the staging gate.

Do not commit generated binaries, machine paths, certificates, or credentials.
