import assert from "node:assert/strict";
import { mkdir, mkdtemp, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { createProjectAssetReferences, scanProjectLyricFolder } from "../server/project-assets.mjs";

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

test("lyrics folders are scanned recursively without reading hidden files or following symlinks", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "project-sequencer-lyric-folder-"));
  const albumFolder = path.join(root, "Album 2");
  const nestedFolder = path.join(albumFolder, "current-sequence");
  await mkdir(albumFolder);
  await mkdir(nestedFolder);
  await writeFile(path.join(nestedFolder, "01-return-address.md"), "Working lyrics");
  await writeFile(path.join(nestedFolder, "01-return-address_distrokid.txt"), "Clean lyrics");
  await writeFile(path.join(nestedFolder, "cover.jpg"), "not lyrics");
  await writeFile(path.join(albumFolder, ".private.md"), "hidden");
  await symlink(nestedFolder, path.join(albumFolder, "linked-sequence"));
  const references = await scanProjectLyricFolder({ folderPath: albumFolder, roots: [{ id: "songs", path: root }] });
  assert.deepEqual(references.map((reference) => reference.relativePath), [
    "Album 2/current-sequence/01-return-address_distrokid.txt",
    "Album 2/current-sequence/01-return-address.md",
  ]);
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
