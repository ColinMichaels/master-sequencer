# macOS distribution runbook

Status: local packaging and fail-closed distribution pipeline verified;
Developer ID signing, notarization, and a distributable FFmpeg runtime are not
configured

## Release states

Project Sequencer reports three distinct states:

| State | Meaning |
| --- | --- |
| Local package | An `.app` exists and its hidden packaged media lifecycle passes on the build Mac |
| Developer ID signed | The outer app and every nested executable are signed with a valid Developer ID Application identity under hardened runtime |
| Signed and notarized | Apple accepted the signed artifact, the ticket is stapled, Gatekeeper accepts it, and bundled FFmpeg/license evidence passes |

Only the final state is ready for direct customer distribution. The current
checkpoint is **local package** only.

## Local POC verification

```bash
npm run desktop:pack
npm run desktop:media-smoke:packaged
npm run desktop:audit
```

The audit inspects the outer signature, hardened-runtime flag, nested Electron
helpers/frameworks/native modules, stapled ticket, Gatekeeper result, bundled
FFmpeg executables, portable approval manifest, and license directory. The
normal audit returns a report even when local-only. Add
`-- --require-distribution` to make any release blocker fail the command.

The local POC may use explicitly configured or installed FFmpeg. That is not a
distribution mechanism.

## Approve and stage FFmpeg

Do not point packaging at a Homebrew executable. The currently inspected
FFmpeg 8.1.1 build is GPL-enabled and dynamically linked to Homebrew FFmpeg,
OpenSSL, codec, and other libraries. Copying only `ffmpeg` and `ffprobe` would
produce a broken and incomplete distribution.

1. Select a reviewed, self-contained build for the exact platform and
   architecture. Record its upstream HTTPS source, exact build configuration,
   SPDX license expression, source/offer obligations, license files, version,
   and SHA-256 hashes.
2. Copy `config/ffmpeg-bundle-manifest.example.json` to the ignored
   `config/ffmpeg-bundle-manifest.local.json` and fill it in. Set
   `redistributionApproved` only after the distribution/license review has an
   approval reference.
3. Validate without copying:

   ```bash
   npm run ffmpeg:stage -- --manifest config/ffmpeg-bundle-manifest.local.json --check
   ```

4. Stage the approved runtime:

   ```bash
   npm run ffmpeg:stage -- --manifest config/ffmpeg-bundle-manifest.local.json
   ```

The stager verifies hashes, reported versions, executable permissions, and
macOS dynamic dependencies. It accepts only system-library dependencies. It
then writes ignored `desktop-resources/staged/bin`, `licenses`, and a sanitized
manifest with no source-machine paths. Generated binaries and private approval
records are never committed.

## Signing and notarization credentials

Direct distribution requires a valid **Developer ID Application** certificate.
Provide it through the keychain or `CSC_LINK` plus `CSC_KEY_PASSWORD`. Never
commit a certificate or its password.

Provide one complete Apple notarization credential set:

- `APPLE_API_KEY`, `APPLE_API_KEY_ID`, `APPLE_API_ISSUER`, and `APPLE_TEAM_ID`;
- or `APPLE_ID`, `APPLE_APP_SPECIFIC_PASSWORD`, and `APPLE_TEAM_ID`;
- or `APPLE_KEYCHAIN`, `APPLE_KEYCHAIN_PROFILE`, and `APPLE_TEAM_ID`.

The API-key option is preferred for CI. Store all values as protected CI
secrets. The app config enables hardened runtime and only Electron's JIT and
unsigned-executable-memory entitlements. Library-validation exceptions are not
enabled; future third-party plug-ins require their own isolated signed host and
review.

Official references:

- [Electron Builder macOS code signing](https://www.electron.build/docs/features/code-signing/code-signing-mac/)
- [Electron Builder notarization](https://www.electron.build/docs/features/code-signing/notarization/)
- [Apple notarization overview](https://developer.apple.com/documentation/security/notarizing-macos-software-before-distribution)

## Distribution command

```bash
npm run desktop:dist
```

The command refuses to start unless the FFmpeg runtime, license manifest,
Developer ID identity, and one complete notarization credential set are
present. Electron Builder is invoked with forced code signing and notarization,
builds DMG and ZIP targets, and then runs the strict audit.

After the strict audit passes, run the packaged media lifecycle again on the
exact signed app and test the downloaded/quarantined artifact on a clean Mac.
Review the Apple notary log even after success. A custom production icon,
update-signing strategy, rollback plan, release channel, and representative
Intel/Apple Silicon testing remain separate product-release gates.

## Current evidence — 2026-08-12

- Packaged arm64 app: built successfully.
- Packaged three-launch media lifecycle: passed.
- Valid Developer ID identities on this Mac: zero.
- Signature: ad-hoc/linker only; not Developer ID.
- Hardened-runtime proof on a Developer ID signature: absent.
- Stapled notarization ticket: absent.
- Gatekeeper: rejected.
- Approved staged FFmpeg runtime and license manifest: absent.
- Distribution command: correctly blocked before build.
