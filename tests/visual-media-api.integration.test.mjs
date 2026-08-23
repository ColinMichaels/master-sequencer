import assert from "node:assert/strict";
import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { Readable, Writable } from "node:stream";
import { finished } from "node:stream/promises";
import test from "node:test";
import { createApiRouter } from "../server/api-router.mjs";

class MockResponse extends Writable {
  constructor() {
    super();
    this.statusCode = 0;
    this.headers = {};
    this.chunks = [];
    this.headersSent = false;
  }
  _write(chunk, _encoding, callback) {
    this.chunks.push(Buffer.from(chunk));
    callback();
  }
  writeHead(statusCode, headers) {
    this.statusCode = statusCode;
    this.headers = headers;
    this.headersSent = true;
    return this;
  }
  body() {
    return Buffer.concat(this.chunks);
  }
}

const requestFor = (method, headers = {}) => Object.assign(Readable.from([]), { method, headers });

const routerFor = ({ visualFile, updateVisualMetadata = async () => null } = {}) => createApiRouter({
  stateStore: {},
  renderJobs: {},
  waveformService: {},
  technicalAnalysisService: {},
  getLibrary: () => ({ files: [], roots: [] }),
  getLibraryFile: () => null,
  getVisualLibrary: () => ({ files: visualFile ? [visualFile] : [], roots: [], scan: { discoveredFiles: visualFile ? 1 : 0 } }),
  getVisualLibraryFile: (key) => key === visualFile?.key ? visualFile : null,
  getVisualLibraryFileById: (id) => id === visualFile?.id ? visualFile : null,
  getConfig: () => ({ audioRoots: [] }),
  isScanning: () => false,
  isVisualScanning: () => false,
  nativeAudioConfigured: false,
  getNativeAudioStatus: async () => ({}),
  getNativeAudioLabStatus: () => ({}),
  startNativeAudioLab: async () => ({}),
  stopNativeAudioLab: () => ({}),
  getWatchStatus: () => ({}),
  refreshLibrary: async () => ({ files: [], roots: [] }),
  refreshVisualLibrary: async () => ({ files: visualFile ? [visualFile] : [], roots: [], scan: {} }),
  publicFile: (file) => file,
  publicVisualFile: (file) => file,
  updateVisualMetadata,
  responsePayloadForPaths: async () => ({}),
  removeAudioSource: async () => {},
  chooseAudioPaths: async () => [],
  chooseProjectAssetPaths: async () => [],
  createProjectAssetReferences: async () => [],
  revealRenderResult: async () => null,
  revealVisualMedia: async (key) => key === visualFile?.key ? { revealed: true } : null,
  createPortableBundle: async () => ({}),
});

test("indexed visual videos stream through /api/media with byte-range and MIME support", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "project-sequencer-visual-api-"));
  const videoPath = path.join(root, "fixture.mp4");
  await writeFile(videoPath, "0123456789");
  const visualFile = { key: "visual::root::fixture.mp4", id: "0123456789abcdef", absolutePath: videoPath };
  const response = new MockResponse();
  await routerFor({ visualFile })(requestFor("GET", { range: "bytes=2-5" }), response, new URL("http://127.0.0.1/api/media?visualKey=visual%3A%3Aroot%3A%3Afixture.mp4"));
  await finished(response);
  assert.equal(response.statusCode, 206);
  assert.equal(response.headers["Content-Type"], "video/mp4");
  assert.equal(response.headers["Content-Range"], "bytes 2-5/10");
  assert.equal(response.body().toString(), "2345");
});

test("indexed visual images return the correct MIME type and HEAD sends no body", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "project-sequencer-visual-image-api-"));
  const imagePath = path.join(root, "fixture.webp");
  await writeFile(imagePath, "image-bytes");
  const visualFile = { key: "visual::root::fixture.webp", id: "fedcba9876543210", absolutePath: imagePath };
  const response = new MockResponse();
  await routerFor({ visualFile })(requestFor("HEAD"), response, new URL("http://127.0.0.1/api/media?visualKey=visual%3A%3Aroot%3A%3Afixture.webp"));
  await finished(response);
  assert.equal(response.statusCode, 200);
  assert.equal(response.headers["Content-Type"], "image/webp");
  assert.equal(response.headers["Content-Length"], 11);
  assert.equal(response.body().length, 0);
});

test("visual media requests fail closed unless the exact key is indexed", async () => {
  const response = new MockResponse();
  await routerFor()(requestFor("GET"), response, new URL("http://127.0.0.1/api/media?visualKey=../../private.mov"));
  await finished(response);
  assert.equal(response.statusCode, 404);
  assert.match(JSON.parse(response.body()).error, /configured, indexed library root/i);
});

test("visual metadata updates require an indexed media id", async () => {
  const response = new MockResponse();
  await routerFor()(requestFor("PUT"), response, new URL("http://127.0.0.1/api/visual-library/metadata/not-indexed"));
  await finished(response);
  assert.equal(response.statusCode, 404);
});
