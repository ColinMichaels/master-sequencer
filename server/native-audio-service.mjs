import { createHash } from "node:crypto";
import { execFile } from "node:child_process";
import { readFile } from "node:fs/promises";
import { validateNativeAudioHardwareProbe } from "../src/lib/native-audio-engine-contract.js";

const defaultRunProbe = ({ executablePath, fingerprint, timeoutMs }) => new Promise((resolve, reject) => {
  execFile(executablePath, [], {
    encoding: "utf8",
    env: { ...process.env, PROJECT_SEQUENCER_ENGINE_FINGERPRINT: fingerprint },
    maxBuffer: 256 * 1024,
    timeout: timeoutMs,
  }, (error, stdout) => error ? reject(error) : resolve(stdout));
});

const publicEngine = (report) => ({
  protocolVersion: report.handshake.protocolVersion,
  dspContractVersion: report.handshake.dspContractVersion,
  engineVersion: report.handshake.engineVersion,
  capabilities: report.handshake.capabilities,
});

const publicStatus = (report) => report.defaultOutput ? ({
  schemaVersion: 1,
  configured: true,
  available: true,
  probeReady: true,
  mode: "query-only",
  capturedAt: report.capturedAt,
  engine: publicEngine(report),
  defaultOutput: {
    ...report.defaultOutput,
    presentationLatencyMs: Number((report.defaultOutput.presentationLatencySeconds * 1_000).toFixed(3)),
  },
}) : ({
  schemaVersion: 1,
  configured: true,
  available: false,
  probeReady: true,
  reasonCode: "no-output-device",
  mode: "query-only",
  capturedAt: report.capturedAt,
  engine: publicEngine(report),
});

export const createNativeAudioService = ({
  executablePath = "",
  timeoutMs = 5_000,
  cacheDurationMs = 5_000,
  now = Date.now,
  readBinary = readFile,
  runProbe = defaultRunProbe,
} = {}) => {
  const configuredPath = typeof executablePath === "string" ? executablePath.trim() : "";
  const configured = Boolean(configuredPath);
  let cachedStatus = null;
  let cacheExpiresAt = 0;
  let pendingStatus = null;

  const resolveStatus = async () => {
    try {
      const fingerprint = createHash("sha256").update(await readBinary(configuredPath)).digest("hex");
      const stdout = await runProbe({ executablePath: configuredPath, fingerprint, timeoutMs });
      const report = validateNativeAudioHardwareProbe(JSON.parse(stdout));
      if (report.handshake.implementationFingerprint !== fingerprint) throw new Error("Native audio probe fingerprint mismatch.");
      return publicStatus(report);
    } catch {
      return { schemaVersion: 1, configured: true, available: false, probeReady: false, reasonCode: "probe-failed" };
    }
  };

  return {
    configured,
    status: async () => {
      if (!configured) return { schemaVersion: 1, configured: false, available: false, reasonCode: "not-configured" };
      if (cachedStatus && now() < cacheExpiresAt) return cachedStatus;
      pendingStatus ||= resolveStatus().then((status) => {
        cachedStatus = status;
        cacheExpiresAt = now() + Math.max(0, cacheDurationMs);
        return status;
      }).finally(() => { pendingStatus = null; });
      return pendingStatus;
    },
  };
};
