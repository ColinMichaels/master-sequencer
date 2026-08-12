# Cloud Project Sync Contract

Status: contract and Google-auth integration seam implemented; no cloud backend,
credentials, or production sign-in UI is configured

## Authority boundary

The cloud owns versioned Project Sequencer decisions. It does not own media,
machine access, or local processing state.

Cloud document fields include:

- stable document and Google account subject identifiers
- optimistic revision and base-revision numbers
- client identifier and update time
- canonical SHA-256 digest
- portable schema-7 project state

The boundary rejects absolute paths, file/folder handles, native bookmarks,
object/blob URLs, audio bytes, engine credentials, local configuration, render
paths, and non-serializable browser/native objects. Relative source references
remain because they are portable matching hints; they do not grant file access.

## Conflict behavior

Cloud writes use compare-and-swap semantics:

1. No remote record creates revision 1.
2. Matching content is an unchanged result.
3. A pending base revision equal to the remote revision creates the next
   revision.
4. Any divergent stale base produces an explicit conflict containing both
   records. The client must offer Keep Local, Keep Cloud, or duplicate-project
   recovery; it must never silently use last-writer-wins.

## Google sign-in seam

`createGoogleAuthIntegration` accepts a future Google Identity Services adapter.
It keeps the ID token in a private closure and exposes only provider, subject,
verified email, display name, and HTTPS avatar URL to the UI. Cloud requests can
ask the integration for an Authorization header, but the credential never enters
a project document, browser storage, exported JSON, logs, or engine state.

A production backend must verify token signature, issuer, audience, expiration,
and hosted-domain policy where applicable. The browser cannot declare its own
Google claims authoritative.

## Backend/API seam

The future service should expose authenticated document operations equivalent
to:

```text
GET /v1/projects/:documentId
PUT /v1/projects/:documentId
  If-Match: <base revision>
  Authorization: Bearer <Google ID token or exchanged app session>
```

The server must bind `ownerSubject` to the verified credential, impose document
size/rate limits, retain revision history, and reject any device-local field
using the same contract before storage.
