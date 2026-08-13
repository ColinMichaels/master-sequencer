import assert from "node:assert/strict";
import test from "node:test";
import { assessMacReleaseEvidence } from "../src/lib/macos-release-assessment.js";

test("macOS release evidence never confuses local packaging with distribution readiness", () => {
  const local = assessMacReleaseEvidence({ signature: "adhoc", nestedCodeValid: true });
  assert.equal(local.status, "local-only");
  assert.equal(local.distributionReady, false);
  assert.match(local.blockers.join(" "), /Developer ID/);
  assert.match(local.blockers.join(" "), /notarization/);
});

test("macOS distribution readiness requires every signing, notarization, and FFmpeg gate", () => {
  assert.deepEqual(assessMacReleaseEvidence({
    signature: "developer-id",
    hardenedRuntime: true,
    nestedCodeValid: true,
    notarizationTicket: true,
    gatekeeperAccepted: true,
    bundledFfmpeg: true,
    ffmpegManifest: true,
    licenseNotices: true,
  }), { distributionReady: true, status: "signed-notarized", blockers: [] });
});
