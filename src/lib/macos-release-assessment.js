export const assessMacReleaseEvidence = (evidence = {}) => {
  const blockers = [];
  if (evidence.signature !== "developer-id") blockers.push("Developer ID Application signature is missing.");
  if (!evidence.hardenedRuntime) blockers.push("Hardened runtime is not verified on the signed app.");
  if (!evidence.nestedCodeValid) blockers.push("Nested code-signing integrity is not valid.");
  if (!evidence.notarizationTicket) blockers.push("A stapled Apple notarization ticket is missing.");
  if (!evidence.gatekeeperAccepted) blockers.push("Gatekeeper does not accept the app.");
  if (!evidence.bundledFfmpeg) blockers.push("Approved self-contained FFmpeg and ffprobe are not bundled.");
  if (!evidence.ffmpegManifest) blockers.push("The portable FFmpeg approval manifest is missing.");
  if (!evidence.licenseNotices) blockers.push("FFmpeg redistribution license notices are missing.");
  return {
    distributionReady: blockers.length === 0,
    status: blockers.length === 0 ? "signed-notarized" : evidence.signature === "developer-id" ? "signed-not-ready" : "local-only",
    blockers,
  };
};
