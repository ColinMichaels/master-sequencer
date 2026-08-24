import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";

test("chosen lyrics folders persist as machine-local roots and nested choices reuse them", async () => {
  const runtime = await mkdtemp(path.join(tmpdir(), "project-sequencer-lyrics-config-"));
  const basePath = path.join(runtime, "base.json");
  const localPath = path.join(runtime, "local.json");
  const lyricsRoot = path.join(runtime, "Album Lyrics");
  const nestedFolder = path.join(lyricsRoot, "Current Sequence");
  await mkdir(lyricsRoot);
  await mkdir(nestedFolder);
  await writeFile(basePath, JSON.stringify({ audioRoots: [], audioFiles: [], visualRoots: [], lyricRoots: [] }));
  await writeFile(localPath, "{}\n");

  const previousBase = process.env.PROJECT_SEQUENCER_CONFIG_PATH;
  const previousLocal = process.env.PROJECT_SEQUENCER_LOCAL_CONFIG_PATH;
  process.env.PROJECT_SEQUENCER_CONFIG_PATH = basePath;
  process.env.PROJECT_SEQUENCER_LOCAL_CONFIG_PATH = localPath;
  try {
    const configStore = await import(`../server/config-store.mjs?lyrics-test=${Date.now()}`);
    const first = await configStore.addLyricRoot({ path: lyricsRoot });
    assert.equal(first.added, true);
    assert.equal(first.source.id, "lyrics-album-lyrics");
    const nested = await configStore.addLyricRoot({ path: nestedFolder });
    assert.equal(nested.added, false);
    assert.equal(nested.source.id, first.source.id);
    const config = await configStore.loadConfig();
    assert.deepEqual(config.lyricRoots.map(({ id, path: rootPath }) => ({ id, path: rootPath })), [{ id: "lyrics-album-lyrics", path: lyricsRoot }]);
    const local = JSON.parse(await readFile(localPath, "utf8"));
    assert.equal(local.lyricRoots.length, 1);
  } finally {
    if (previousBase === undefined) delete process.env.PROJECT_SEQUENCER_CONFIG_PATH;
    else process.env.PROJECT_SEQUENCER_CONFIG_PATH = previousBase;
    if (previousLocal === undefined) delete process.env.PROJECT_SEQUENCER_LOCAL_CONFIG_PATH;
    else process.env.PROJECT_SEQUENCER_LOCAL_CONFIG_PATH = previousLocal;
  }
});
