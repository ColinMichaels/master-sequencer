import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import test from "node:test";
import { createNativeAudioService } from "../server/native-audio-service.mjs";

test("native audio service reports an optional unconfigured boundary", async () => {
  const service = createNativeAudioService();
  assert.equal(service.configured, false);
  assert.deepEqual(await service.status(), { schemaVersion: 1, configured: false, available: false, reasonCode: "not-configured" });
});

test("native audio service verifies the binary handshake and returns path-free hardware status", async () => {
  const binary = Buffer.from("compiled-native-probe");
  const fingerprint = createHash("sha256").update(binary).digest("hex");
  const privatePath = "/private/tmp/native/shared-dsp-device-probe";
  const service = createNativeAudioService({
    executablePath: privatePath,
    readBinary: async (receivedPath) => {
      assert.equal(receivedPath, privatePath);
      return binary;
    },
    runProbe: async ({ executablePath, fingerprint: receivedFingerprint, timeoutMs }) => {
      assert.equal(executablePath, privatePath);
      assert.equal(receivedFingerprint, fingerprint);
      assert.equal(timeoutMs, 5_000);
      return JSON.stringify({
        schemaVersion: 1,
        capturedAt: "2026-08-12T12:00:00.000Z",
        handshake: {
          protocolVersion: 1,
          dspContractVersion: 2,
          engineVersion: "0.2.0",
          engineInstanceId: "engine-abcd1234",
          implementationFingerprint: fingerprint,
          capabilities: { offlineRender: true, realTimeOutput: false, deviceNotifications: false, maximumChannels: 2, supportedSampleRates: [48_000] },
        },
        defaultOutput: {
          label: "System Default Output",
          sampleRate: 48_000,
          channels: 2,
          presentationLatencySeconds: 0.0014583333333333334,
          presentationLatencyFrames: 70,
          interleaved: false,
          accessMode: "query-only",
        },
      });
    },
  });

  const status = await service.status();
  assert.equal(service.configured, true);
  assert.equal(status.available, true);
  assert.equal(status.probeReady, true);
  assert.equal(status.defaultOutput.presentationLatencyFrames, 70);
  assert.equal(status.defaultOutput.presentationLatencyMs, 1.458);
  assert.equal(status.engine.dspContractVersion, 2);
  assert.equal(JSON.stringify(status).includes(privatePath), false);
  assert.equal(JSON.stringify(status).includes(fingerprint), false);
  assert.equal(JSON.stringify(status).includes("engine-abcd1234"), false);
});

test("native audio service fails closed without exposing probe errors or paths", async () => {
  const privatePath = "/Users/private/audio-engine";
  const service = createNativeAudioService({
    executablePath: privatePath,
    readBinary: async () => Buffer.from("binary"),
    runProbe: async () => { throw new Error(`Cannot run ${privatePath}`); },
  });
  const status = await service.status();
  assert.deepEqual(status, { schemaVersion: 1, configured: true, available: false, probeReady: false, reasonCode: "probe-failed" });
  assert.equal(JSON.stringify(status).includes("/Users/"), false);
});

test("native audio service distinguishes a verified probe from a missing output device", async () => {
  const binary = Buffer.from("compiled-native-probe");
  const fingerprint = createHash("sha256").update(binary).digest("hex");
  const service = createNativeAudioService({
    executablePath: "/private/tmp/native-probe",
    readBinary: async () => binary,
    runProbe: async () => JSON.stringify({
      schemaVersion: 1,
      capturedAt: "2026-08-12T12:00:00.000Z",
      handshake: {
        protocolVersion: 1,
        dspContractVersion: 2,
        engineVersion: "0.2.0",
        engineInstanceId: "engine-abcd1234",
        implementationFingerprint: fingerprint,
        capabilities: { offlineRender: true, realTimeOutput: false, deviceNotifications: false, maximumChannels: 2, supportedSampleRates: [] },
      },
      defaultOutput: null,
      reasonCode: "no-output-device",
    }),
  });
  const status = await service.status();
  assert.equal(status.configured, true);
  assert.equal(status.probeReady, true);
  assert.equal(status.available, false);
  assert.equal(status.reasonCode, "no-output-device");
});

test("native audio service coalesces and briefly caches local process probes", async () => {
  const binary = Buffer.from("compiled-native-probe");
  const fingerprint = createHash("sha256").update(binary).digest("hex");
  let clock = 1_000;
  let executions = 0;
  const runProbe = async () => {
    executions += 1;
    return JSON.stringify({
      schemaVersion: 1,
      capturedAt: "2026-08-12T12:00:00.000Z",
      handshake: {
        protocolVersion: 1,
        dspContractVersion: 2,
        engineVersion: "0.2.0",
        engineInstanceId: "engine-abcd1234",
        implementationFingerprint: fingerprint,
        capabilities: { offlineRender: true, realTimeOutput: false, deviceNotifications: false, maximumChannels: 2, supportedSampleRates: [] },
      },
      defaultOutput: null,
      reasonCode: "no-output-device",
    });
  };
  const service = createNativeAudioService({ executablePath: "/probe", readBinary: async () => binary, runProbe, now: () => clock, cacheDurationMs: 5_000 });
  await Promise.all([service.status(), service.status(), service.status()]);
  await service.status();
  assert.equal(executions, 1);
  clock += 5_001;
  await service.status();
  assert.equal(executions, 2);
});
