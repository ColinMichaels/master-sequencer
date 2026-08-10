import assert from "node:assert/strict";
import { mkdir, mkdtemp, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { createProjectAssetReferences } from "../server/project-assets.mjs";

test("visual files become portable configured-root references", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "project-sequencer-assets-"));
  const artFolder = path.join(root, "Album Art");
  await mkdir(artFolder);
  const artwork = path.join(artFolder, "front-cover.png");
  await writeFile(artwork, "not-real-image-bytes");
  const [reference] = await createProjectAssetReferences({ selectedPaths: [artwork], roots: [{ id: "library", path: root }], kind: "visuals" });
  assert.equal(reference.rootId, "library");
  assert.equal(reference.relativePath, "Album Art/front-cover.png");
  assert.equal(reference.name, "front-cover.png");
  assert.equal(reference.kind, "visual");
});

test("Markdown lyric files become candidate-ready references", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "project-sequencer-lyrics-"));
  const lyrics = path.join(root, "song-distrokid.md");
  await writeFile(lyrics, "Clean words only\n");
  const [reference] = await createProjectAssetReferences({ selectedPaths: [lyrics], roots: [{ id: "songs", path: root }], kind: "lyrics" });
  assert.equal(reference.relativePath, "song-distrokid.md");
  assert.equal(reference.kind, "lyrics");
});

test("project assets stay inside configured roots and supported formats", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "project-sequencer-root-"));
  const outside = await mkdtemp(path.join(tmpdir(), "project-sequencer-outside-"));
  const outsideFile = path.join(outside, "lyrics.md");
  const unsupported = path.join(root, "notes.pdf");
  await writeFile(outsideFile, "lyrics");
  await writeFile(unsupported, "pdf");
  await assert.rejects(() => createProjectAssetReferences({ selectedPaths: [outsideFile], roots: [{ id: "root", path: root }], kind: "lyrics" }), /configured Project Sequencer folder/i);
  await assert.rejects(() => createProjectAssetReferences({ selectedPaths: [unsupported], roots: [{ id: "root", path: root }], kind: "lyrics" }), /Markdown or plain-text/i);
});

test("project assets reject symlinks that escape a configured root", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "project-sequencer-symlink-root-"));
  const outside = await mkdtemp(path.join(tmpdir(), "project-sequencer-symlink-outside-"));
  const outsideFile = path.join(outside, "cover.png");
  const linkedFile = path.join(root, "linked-cover.png");
  await writeFile(outsideFile, "not-real-image-bytes");
  await symlink(outsideFile, linkedFile);
  await assert.rejects(
    () => createProjectAssetReferences({ selectedPaths: [linkedFile], roots: [{ id: "root", path: root }], kind: "visuals" }),
    /configured Project Sequencer folder/i,
  );
});
