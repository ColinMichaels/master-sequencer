import assert from "node:assert/strict";
import test from "node:test";
import { createBrowserMediaRegistry } from "../src/lib/browser-media-registry.js";

test("browser media registry degrades to session-only behavior when IndexedDB is unavailable", async () => {
  const registry = createBrowserMediaRegistry({ indexedDb: null });
  assert.equal(registry.available, false);
  assert.deepEqual(await registry.list(), []);
  assert.equal(await registry.save({ id: "root-1", kind: "files", label: "Files", handles: [{}] }), null);
  assert.equal(await registry.delete("root-1"), null);
});

test("browser media registry rejects malformed records before attempting storage", async () => {
  const registry = createBrowserMediaRegistry({ indexedDb: null });
  await assert.rejects(registry.save({ id: "root-1", kind: "path" }), /invalid/);
});
