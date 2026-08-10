import assert from "node:assert/strict";
import test from "node:test";
import { chooseAudioPaths, chooseProjectAssetPaths, parsePickedPaths, revealInFinder } from "../server/native-picker.mjs";

test("native picker output becomes clean file paths", () => {
  assert.deepEqual(parsePickedPaths("/Music/One.wav\n/Music/Two.mp3\n"), ["/Music/One.wav", "/Music/Two.mp3"]);
});

test("native picker treats macOS cancellation as a normal empty choice", async () => {
  const run = async () => {
    const error = new Error("execution error: User canceled. (-128)");
    error.stderr = "User canceled.";
    throw error;
  };
  assert.deepEqual(await chooseAudioPaths({ kind: "files", platform: "darwin", run }), []);
});

test("native picker has a manual-path fallback message off macOS", async () => {
  await assert.rejects(() => chooseAudioPaths({ kind: "folder", platform: "linux" }), /full path manually/i);
});

test("native visual picker accepts multiple asset paths", async () => {
  const run = async () => ({ stdout: "/Art/front-cover.png\n/Art/back-cover.jpg\n" });
  assert.deepEqual(await chooseProjectAssetPaths({ kind: "visuals", platform: "darwin", run }), ["/Art/front-cover.png", "/Art/back-cover.jpg"]);
});

test("native lyric picker treats cancellation as a normal empty choice", async () => {
  const run = async () => {
    const error = new Error("execution error: User canceled. (-128)");
    throw error;
  };
  assert.deepEqual(await chooseProjectAssetPaths({ kind: "lyrics", platform: "darwin", run }), []);
});

test("Finder reveal receives only a server-resolved completed-render path", async () => {
  const calls = [];
  assert.deepEqual(await revealInFinder({ filePath: "/safe/exports/render.wav", platform: "darwin", run: async (...args) => { calls.push(args); } }), { revealed: true });
  assert.deepEqual(calls, [["open", ["-R", "/safe/exports/render.wav"]]]);
});
