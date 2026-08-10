import assert from "node:assert/strict";
import { mkdtemp, mkdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { scanAudioLibrary, sourceKey } from "../server/audio-library.mjs";

test("sourceKey stays stable across platform path separators", () => {
  assert.equal(sourceKey({ rootId: "music", relativePath: "Album\\Track.mp3" }), "music::Album/Track.mp3");
  assert.equal(sourceKey({ privateSourceId: "protected-a" }), "private::protected-a");
});

test("audio scanning finds supported files and respects ignored directories", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "project-sequencer-audio-"));
  await mkdir(path.join(root, "Album"));
  await mkdir(path.join(root, "node_modules"));
  await writeFile(path.join(root, "Album", "source.mp3"), "not a real mp3");
  await writeFile(path.join(root, "Album", "notes.txt"), "ignore me");
  await writeFile(path.join(root, "node_modules", "ignored.wav"), "ignore me too");
  const result = await scanAudioLibrary({
    roots: [{ id: "test", label: "Test", path: root }],
    ignoreDirectories: ["node_modules"],
    cachePath: path.join(root, "cache.json"),
    metadataConcurrency: 1,
  });
  assert.equal(result.roots[0].connected, true);
  assert.equal(result.files.length, 1);
  assert.equal(result.files[0].relativePath, "Album/source.mp3");
  assert.match(result.files[0].probeError, /ffprobe|Invalid data|failed/i);
  const incremental = await scanAudioLibrary({
    roots: [{ id: "test", label: "Test", path: root }],
    ignoreDirectories: ["node_modules"],
    cachePath: path.join(root, "cache.json"),
    metadataConcurrency: 1,
  });
  assert.equal(incremental.scan.reusedMetadata, 1);
  assert.equal(incremental.scan.probedMetadata, 0);
});

test("audio scanning accepts an explicit file without copying it", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "project-sequencer-file-"));
  const audioPath = path.join(root, "single master.wav");
  await writeFile(audioPath, "not a real wav");
  const result = await scanAudioLibrary({
    roots: [],
    audioFiles: [{ id: "single", label: "Single", path: audioPath }],
    cachePath: path.join(root, "cache.json"),
    metadataConcurrency: 1,
  });
  assert.equal(result.files.length, 1);
  assert.equal(result.files[0].absolutePath, audioPath);
  assert.equal(result.files[0].rootId, "single");
  assert.equal(result.roots[0].kind, "file");
});
