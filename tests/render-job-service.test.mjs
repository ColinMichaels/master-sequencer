import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { RenderCancelledError } from "../server/audio-renderer.mjs";
import { createRenderJobService, discoverRenderResults } from "../server/render-job-service.mjs";

const waitFor = async (condition, timeoutMs = 2_000) => {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const value = condition();
    if (value) return value;
    await new Promise((resolve) => setTimeout(resolve, 5));
  }
  throw new Error("Timed out waiting for render job state.");
};

test("render jobs serialize work and expose monotonic progress", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "project-sequencer-jobs-"));
  const starts = [];
  const finishes = [];
  const service = createRenderJobService({
    outputRoot: root,
    getLibraryFile: () => null,
    render: async ({ scope, onProgress }) => {
      starts.push(scope);
      onProgress(35, "rendering");
      await new Promise((resolve) => setTimeout(resolve, 15));
      finishes.push(scope);
      return { id: `${scope}-result`, scope, format: "wav", audioName: `${scope}.wav`, size: 10, createdAt: new Date().toISOString() };
    },
  });
  await service.initialize();
  const first = service.create({ scope: "album", format: "wav" });
  const second = service.create({ scope: "track", format: "wav" });

  await waitFor(() => service.get(first.id)?.status === "completed");
  await waitFor(() => service.get(second.id)?.status === "completed");
  assert.deepEqual(starts, ["album", "track"]);
  assert.deepEqual(finishes, ["album", "track"]);
  assert.equal(service.get(first.id).progress, 100);
  assert.equal(service.result("album-result").audioName, "album.wav");
});

test("running and queued render jobs can be cancelled without completing", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "project-sequencer-cancel-"));
  const service = createRenderJobService({
    outputRoot: root,
    getLibraryFile: () => null,
    render: ({ signal }) => new Promise((resolve, reject) => {
      signal.addEventListener("abort", () => reject(new RenderCancelledError()), { once: true });
    }),
  });
  await service.initialize();
  const running = service.create({ scope: "album", format: "wav" });
  const queued = service.create({ scope: "track", format: "wav" });
  await waitFor(() => service.get(running.id)?.status === "running");
  assert.equal(service.cancel(queued.id).status, "cancelled");
  service.cancel(running.id);
  await waitFor(() => service.get(running.id)?.status === "cancelled");
  assert.match(service.get(running.id).error, /Partial output was removed/);
  assert.equal(service.get(queued.id).status, "cancelled");
});

test("completed documented renders are rediscovered after restart and partial files are removed", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "project-sequencer-discovery-"));
  const directory = path.join(root, "2026-08-10", "album-print");
  await mkdir(directory, { recursive: true });
  await writeFile(path.join(directory, "album.wav"), Buffer.alloc(24));
  await writeFile(path.join(directory, "artist.part.mix.wav"), Buffer.alloc(12));
  await writeFile(path.join(directory, "album-cue-sheet.txt"), "00:00.000 Track\n");
  await writeFile(path.join(directory, "orphan.part.wav"), "partial");
  await writeFile(path.join(directory, "album-render-manifest.json"), JSON.stringify({
    schemaVersion: 1,
    renderId: "render-123",
    createdAt: "2026-08-10T12:00:00.000Z",
    scope: "album",
    format: "wav",
    audioFile: "album.wav",
    warnings: [],
  }));
  const malformedMetadataDirectory = path.join(root, "2026-08-10", "metadata-fallback");
  await mkdir(malformedMetadataDirectory, { recursive: true });
  await writeFile(path.join(malformedMetadataDirectory, "fallback.mp3"), Buffer.alloc(8));
  await writeFile(path.join(malformedMetadataDirectory, "fallback-render-manifest.json"), JSON.stringify({
    schemaVersion: 2,
    renderId: "render-fallback",
    createdAt: 17,
    scope: "track",
    format: "mp3",
    audioFile: "fallback.mp3",
    warnings: [],
  }));

  const results = await discoverRenderResults(root);
  assert.equal(results.length, 2);
  const documented = results.find((result) => result.id === "render-123");
  assert.equal(documented.size, 24);
  assert.equal(typeof results.find((result) => result.id === "render-fallback").createdAt, "string");
  await assert.rejects(() => readFile(path.join(directory, "orphan.part.wav")), { code: "ENOENT" });
  assert.equal((await readFile(path.join(directory, "artist.part.mix.wav"))).byteLength, 12);

  const service = createRenderJobService({ outputRoot: root, getLibraryFile: () => null });
  await service.initialize();
  assert.equal(service.get("render-123").recovered, true);
  assert.equal(service.result("render-123").manifestPath, path.join(directory, "album-render-manifest.json"));
});
