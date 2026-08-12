import assert from "node:assert/strict";
import test from "node:test";
import { validateFfmpegBundleManifest } from "../src/lib/ffmpeg-bundle-manifest.js";

const digest = "a".repeat(64);
const validManifest = () => ({
  schemaVersion: 1,
  redistributionApproved: true,
  binaryKind: "self-contained",
  platform: "darwin",
  architecture: "arm64",
  approvalReference: "release-review-2026-08",
  sourceUrl: "https://example.invalid/ffmpeg.tar.xz",
  licenseSpdx: "GPL-3.0-or-later",
  buildConfiguration: "--enable-gpl --disable-shared",
  tools: {
    ffmpeg: { sourcePath: "/approved/ffmpeg", sha256: digest, version: "8.1.1" },
    ffprobe: { sourcePath: "/approved/ffprobe", sha256: digest, version: "8.1.1" },
  },
  licenseFiles: [{ sourcePath: "/approved/COPYING.GPLv3", targetName: "COPYING.GPLv3", sha256: digest }],
});

test("FFmpeg bundle manifests require explicit redistribution approval and self-contained binaries", () => {
  assert.throws(() => validateFfmpegBundleManifest({ ...validManifest(), redistributionApproved: false }, { platform: "darwin", architecture: "arm64" }), /approval/);
  assert.throws(() => validateFfmpegBundleManifest({ ...validManifest(), binaryKind: "dynamic" }, { platform: "darwin", architecture: "arm64" }), /self-contained/);
});

test("FFmpeg bundle manifests bind platform, provenance, licenses, and hashes", () => {
  const validated = validateFfmpegBundleManifest(validManifest(), { platform: "darwin", architecture: "arm64" });
  assert.equal(validated.tools.ffmpeg.sha256, digest);
  assert.equal(validated.licenseFiles[0].targetName, "COPYING.GPLv3");
  assert.throws(() => validateFfmpegBundleManifest({ ...validManifest(), architecture: "x64" }, { platform: "darwin", architecture: "arm64" }), /not darwin-arm64/);
  assert.throws(() => validateFfmpegBundleManifest({ ...validManifest(), licenseFiles: [] }, { platform: "darwin", architecture: "arm64" }), /license/);
});
