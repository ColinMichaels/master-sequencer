import assert from "node:assert/strict";
import test from "node:test";
import { createOnlineAppState } from "../src/lib/online-app.js";
import {
  canonicalCloudJson,
  cloudProjectDigest,
  createCloudProjectDocument,
  createGoogleAuthIntegration,
  resolveCloudProjectWrite,
  validateCloudProjectDocument,
} from "../src/lib/cloud-project-document.js";

const documentFor = (overrides = {}) => createCloudProjectDocument({
  documentId: "project-123",
  ownerSubject: "google:subject-123",
  projectState: createOnlineAppState(),
  revision: 4,
  baseRevision: 3,
  clientId: "browser-client-1",
  updatedAt: "2026-08-12T12:00:00.000Z",
  ...overrides,
});

test("cloud documents contain portable project decisions and a stable digest", async () => {
  const first = await documentFor();
  const reordered = JSON.parse(JSON.stringify(first.projectState));
  reordered.settings = Object.fromEntries(Object.entries(reordered.settings).reverse());
  assert.equal(await cloudProjectDigest(reordered), first.projectDigest);
  assert.equal((await validateCloudProjectDocument(first)).documentId, "project-123");
  assert.doesNotMatch(JSON.stringify(first), /idToken|engineToken|absolutePath|fileHandle|blob:/);
  assert.equal(canonicalCloudJson({ z: 1, a: 2 }), '{"a":2,"z":1}');
});

test("device-only objects and absolute paths fail closed at the cloud boundary", async () => {
  await assert.rejects(() => documentFor({ projectState: { albums: [], fileHandle: {} } }), /device-local/);
  await assert.rejects(() => documentFor({ projectState: { albums: [], artwork: { path: "/Users/example/cover.png" } } }), /absolute device path/);
  await assert.rejects(() => documentFor({ projectState: { albums: [], media: new Uint8Array([1, 2]) } }), /device-only or non-serializable/);
});

test("cloud writes use optimistic revisions and never silently overwrite divergent edits", async () => {
  const remote = await documentFor({ revision: 4, baseRevision: 3 });
  const unchanged = await documentFor({ revision: 4, baseRevision: 4, clientId: "desktop-client-2" });
  assert.equal(resolveCloudProjectWrite({ remoteDocument: remote, pendingDocument: unchanged }).status, "unchanged");

  const nextState = createOnlineAppState();
  nextState.albums[0].title = "Local edit";
  const update = await documentFor({ projectState: nextState, revision: 4, baseRevision: 4 });
  const resolvedUpdate = resolveCloudProjectWrite({ remoteDocument: remote, pendingDocument: update });
  assert.equal(resolvedUpdate.status, "update");
  assert.equal(resolvedUpdate.document.revision, 5);

  update.baseRevision = 2;
  const conflict = resolveCloudProjectWrite({ remoteDocument: remote, pendingDocument: update });
  assert.equal(conflict.status, "conflict");
  assert.equal(conflict.conflict.kind, "divergent-project-edits");
  assert.equal(conflict.conflict.remoteRevision, 4);
});

test("Google integration keeps credentials private while exposing a minimal account session", async () => {
  let cleared = false;
  const auth = createGoogleAuthIntegration({
    acquireCredential: async () => ({
      idToken: "private-google-id-token",
      claims: { sub: "subject-123", email: "artist@example.com", email_verified: true, name: "Artist", picture: "https://example.com/avatar.png" },
    }),
    clearCredential: async () => { cleared = true; },
  });
  const session = await auth.signIn();
  assert.deepEqual(session, { provider: "google", subject: "subject-123", email: "artist@example.com", displayName: "Artist", avatarUrl: "https://example.com/avatar.png" });
  assert.equal(JSON.stringify(session).includes("private-google-id-token"), false);
  assert.equal(auth.authorizationHeader(), "Bearer private-google-id-token");
  await auth.signOut();
  assert.equal(cleared, true);
  assert.equal(auth.publicSession(), null);
  assert.throws(() => auth.authorizationHeader(), /sign-in is required/i);
});
