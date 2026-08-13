import { spawn } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { validateNativeAudiblePreviewReport, validateNativeShadowStreamReport } from "../src/lib/native-audio-engine-contract.js";

const OUTPUT_LIMIT_BYTES = 256 * 1024;
const MODES = Object.freeze({
  muted: { durationMs: 750, label: "Muted DSP check" },
  audible: { durationMs: 3_000, label: "Audible generated-tone preview" },
});

const serviceError = (message, statusCode) => Object.assign(new Error(message), { statusCode });

const defaultSpawnProcess = ({ executablePath, args, fingerprint }) => spawn(executablePath, args, {
  env: { ...process.env, PROJECT_SEQUENCER_ENGINE_FINGERPRINT: fingerprint },
  stdio: ["ignore", "pipe", "pipe"],
  windowsHide: true,
});

const appendBounded = (current, chunk) => {
  if (Buffer.byteLength(current) >= OUTPUT_LIMIT_BYTES) return current;
  const combined = `${current}${chunk}`;
  return Buffer.byteLength(combined) <= OUTPUT_LIMIT_BYTES ? combined : combined.slice(0, OUTPUT_LIMIT_BYTES);
};

const publicResult = ({ runId, mode, startedAt, completedAt, report }) => {
  const stream = report.stream;
  const failureCount = stream ? stream.frameMismatches + stream.deadlineMisses + stream.timingGapXruns + stream.renderErrors + stream.processorOverloads : 0;
  return {
    runId,
    mode,
    outcome: report.available ? failureCount === 0 && report.shadow?.checksumMatch ? "passed" : "issues" : "unavailable",
    available: report.available,
    reasonCode: report.reasonCode || null,
    startedAt,
    completedAt,
    output: mode === "audible" ? "generated-tone-minus-30-db" : "muted",
    generatedFixtureOnly: true,
    projectMediaAccessed: false,
    ...(stream ? {
      sampleRate: stream.sampleRate,
      channels: stream.channels,
      requestedDurationMs: stream.requestedDurationMs,
      observedDurationMs: Number(stream.observedDurationMs.toFixed(1)),
      callbacks: stream.callbacks,
      renderedFrames: stream.renderedFrames,
      recoveries: report.lifecycle.recoveries,
      longestCallbackMs: Number(stream.longestCallbackMs.toFixed(4)),
      callbackIssues: failureCount,
      goldenMatched: report.shadow.checksumMatch,
    } : {}),
  };
};

export const createNativeAudioLabService = ({
  executablePath = "",
  readBinary = readFile,
  spawnProcess = defaultSpawnProcess,
  now = () => new Date(),
  createRunId = randomUUID,
} = {}) => {
  const configuredPath = typeof executablePath === "string" ? executablePath.trim() : "";
  const configured = Boolean(configuredPath);
  let active = null;
  let starting = false;
  let lastRun = null;

  const status = () => ({
    schemaVersion: 1,
    configured,
    state: active ? "running" : starting ? "starting" : "idle",
    running: Boolean(active),
    modes: {
      muted: { durationMs: MODES.muted.durationMs, output: "muted", generatedFixtureOnly: true },
      audible: { durationMs: MODES.audible.durationMs, maximumDurationMs: 5_000, output: "generated-tone-minus-30-db", requiresAcknowledgement: true, generatedFixtureOnly: true },
    },
    activeRun: active ? { runId: active.runId, mode: active.mode, label: MODES[active.mode].label, startedAt: active.startedAt } : null,
    lastRun,
  });

  const finish = (runId, result) => {
    if (active?.runId !== runId) return;
    globalThis.clearTimeout(active.timeout);
    active = null;
    lastRun = result;
  };

  const start = async ({ mode, acknowledged = false } = {}) => {
    if (!configured) throw serviceError("The native audio lab is not included in this build.", 503);
    if (!Object.hasOwn(MODES, mode)) throw serviceError("Choose either the muted check or audible generated-tone preview.", 400);
    if (mode === "audible" && acknowledged !== true) throw serviceError("Confirm that a short generated tone may play through the current output.", 400);
    if (active || starting) throw serviceError("A native audio lab run is already active.", 409);
    starting = true;
    let runId = null;
    try {
      const fingerprint = createHash("sha256").update(await readBinary(configuredPath)).digest("hex");
      runId = createRunId();
      const startedAt = now().toISOString();
      const argumentsForMode = mode === "audible"
        ? ["--audible-preview", "--allow-audible-output", "--duration-ms", String(MODES.audible.durationMs)]
        : ["--shadow", "--duration-ms", String(MODES.muted.durationMs), "--simulate-device-change-ms", "250"];
      const child = spawnProcess({ executablePath: configuredPath, args: argumentsForMode, fingerprint });
      let stdout = "";
      let stderr = "";
      const timeout = globalThis.setTimeout(() => child.kill("SIGKILL"), MODES[mode].durationMs + 5_000);
      active = { runId, mode, startedAt, child, timeout };
      child.stdout?.setEncoding?.("utf8");
      child.stderr?.setEncoding?.("utf8");
      child.stdout?.on("data", (chunk) => { stdout = appendBounded(stdout, chunk); });
      child.stderr?.on("data", (chunk) => { stderr = appendBounded(stderr, chunk); });
      child.once("error", () => finish(runId, { runId, mode, outcome: "failed", reasonCode: "engine-launch-failed", startedAt, completedAt: now().toISOString(), output: mode === "audible" ? "generated-tone-minus-30-db" : "muted", generatedFixtureOnly: true, projectMediaAccessed: false }));
      child.once("close", (code, signal) => {
        if (active?.runId !== runId) return;
        const completedAt = now().toISOString();
        if (active.stopRequested) {
          finish(runId, { runId, mode, outcome: "stopped", reasonCode: "user-stopped", startedAt, completedAt, output: mode === "audible" ? "generated-tone-minus-30-db" : "muted", generatedFixtureOnly: true, projectMediaAccessed: false });
          return;
        }
        if (code !== 0 || signal || Buffer.byteLength(stdout) >= OUTPUT_LIMIT_BYTES || Buffer.byteLength(stderr) >= OUTPUT_LIMIT_BYTES) {
          finish(runId, { runId, mode, outcome: "failed", reasonCode: "engine-run-failed", startedAt, completedAt, output: mode === "audible" ? "generated-tone-minus-30-db" : "muted", generatedFixtureOnly: true, projectMediaAccessed: false });
          return;
        }
        try {
          const parsed = JSON.parse(stdout);
          if (parsed.handshake?.implementationFingerprint !== fingerprint) throw new Error("fingerprint mismatch");
          const report = mode === "audible" ? validateNativeAudiblePreviewReport(parsed) : validateNativeShadowStreamReport(parsed);
          finish(runId, publicResult({ runId, mode, startedAt, completedAt, report }));
        } catch {
          finish(runId, { runId, mode, outcome: "failed", reasonCode: "invalid-engine-report", startedAt, completedAt, output: mode === "audible" ? "generated-tone-minus-30-db" : "muted", generatedFixtureOnly: true, projectMediaAccessed: false });
        }
      });
      return status();
    } catch {
      if (active?.runId === runId) {
        globalThis.clearTimeout(active.timeout);
        active.child.kill("SIGTERM");
        active = null;
      }
      throw serviceError("The native audio lab could not start.", 503);
    } finally {
      starting = false;
    }
  };

  const stop = () => {
    if (!active) return status();
    active.stopRequested = true;
    active.child.kill("SIGTERM");
    return status();
  };

  const shutdown = () => {
    if (!active) return;
    active.stopRequested = true;
    active.child.kill("SIGTERM");
  };

  return { configured, status, start, stop, shutdown };
};
