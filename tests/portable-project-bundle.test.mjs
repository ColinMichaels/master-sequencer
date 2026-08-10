import assert from "node:assert/strict";
import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { createPortableProjectBundle } from "../server/portable-project-bundle.mjs";

test("portable bundles contain project JSON and checksums without media bytes or absolute paths", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "project-sequencer-bundle-"));
  const sourcePath = path.join(root, "source.wav");
  await writeFile(sourcePath, "source bytes stay outside the bundle");
  const state = { schemaVersion: 5, albums: [{ id: "album", tracks: [{ id: "track", candidates: [{ id: "a", sourceRef: { rootId: "root", relativePath: "source.wav" } }, { id: "b", sourceRef: { privateSourceId: "private-b" } }] }] }] };
  const bundle = await createPortableProjectBundle({ state, getLibraryFile: (key) => key === "root::source.wav" ? { absolutePath: sourcePath, size: 36 } : null });
  assert.equal(bundle.mediaIncluded, false);
  assert.match(bundle.sources[0].sha256, /^[a-f0-9]{64}$/);
  assert.equal(bundle.sources[1].status, "offline");
  assert.equal(JSON.stringify(bundle).includes(root), false);
  assert.equal(JSON.stringify(bundle).includes("source bytes stay outside"), false);
});
