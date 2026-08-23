# Account Access and Community Plan

Status: product and architecture direction; no live account backend, production
sign-in screen, or cloud database is configured

## Decision

Use account-gated authoring for the hosted product. A guest can open a public
demo, play, pause, seek, and preview it, but cannot create, rename, reorder,
attach, approve, import into project state, or save. Every attempted authoring
action should explain the boundary and offer **Sign in to save your work**.

Keep the installed/local profile offline-capable. Requiring a remote account to
edit a private local project would break Project Sequencer's local-first promise
and create a failure mode in studios without a connection. The same frontend can
apply a hosted `viewer` capability while the local adapter keeps its existing
local authoring capability.

## Current foundation

The repository already has the important seams:

- one React frontend selected through runtime capabilities;
- a hosted browser adapter with browser-approved local media and local recovery;
- a versioned cloud-project document contract that excludes audio bytes,
  absolute paths, file handles, credentials, and other device-only data;
- optimistic cloud revisions with an explicit conflict result; and
- a Google credential integration seam that keeps the token out of project
  state, exports, browser storage, and logs.

The missing production work is identity-provider configuration, an authenticated
cloud adapter, database rules, account UI, conflict/recovery UI, privacy controls,
and operational support. The existing seam should be adapted to Firebase
Authentication rather than adding a second identity model. Firebase officially
supports Google sign-in through its web SDK and recommends redirect flow for
mobile devices: <https://firebase.google.com/docs/auth/web/google-signin>.

## Access model

| Capability | Guest viewer | Signed-in owner | Future collaborator | Local installed profile |
| --- | --- | --- | --- | --- |
| Open a public demo | Yes | Yes | Yes | Optional |
| Play, pause, seek, and compare previews | Yes | Yes | Yes | Yes |
| Choose a local file for session playback | Optional, session-only | Yes | Yes | Yes |
| Change project decisions | No | Yes | Role-based | Yes, offline |
| Save project documents | No | Owner account | Role-based | Local JSON |
| Upload source audio automatically | Never | Never | Never | Never |
| Submit private support feedback | Sign-in prompt | Yes | Yes | Optional link |

Transport controls are not project mutations. A guest may change ephemeral
playback state without creating a saved project. If guest file selection is
offered, it must remain a clearly labeled session-only audition and must not
silently become a project candidate.

Client-side disabled buttons are only an explanation layer. The real authority
must be enforced by authenticated service/database rules. Firestore's documented
pattern is to require `request.auth` and match its `uid` to the owner record:
<https://firebase.google.com/docs/firestore/security/rules-conditions>.

## Proposed hosted data

Store only what the feature needs:

```text
users/{uid}
  displayName, email, avatarUrl
  createdAt, lastSeenAt
  privacy choices and their version
  optional onboarding answers volunteered by the user

users/{uid}/projects/{projectId}
  cloud document revision, digest, portable projectState
  createdAt, updatedAt

users/{uid}/feedback/{feedbackId}
  category, message, application version, page/workspace
  contact permission, createdAt, status
```

Do not store audio bytes, video bytes, absolute paths, private filenames, browser
file handles, native bookmarks, object URLs, render paths, engine credentials,
or analytics payloads inside a project document. An account identifies the owner
of portable sequencing decisions; it does not grant the service access to the
owner's studio.

Onboarding can ask a few optional product questions such as role, typical album
size, primary workflow, browser/native preference, and the one missing feature
that matters most. Do not infer or sell sensitive audience profiles. Keep
product analytics aggregate and off by default until the consent and retention
policy is written. Firebase recommends cataloging collected data, explaining its
use, recording privacy choices, and allowing users to change them:
<https://firebase.google.com/support/privacy/storing-privacy-settings>.

## Security and sync requirements

- Validate Firebase ID tokens on every write-capable backend path and derive the
  owner UID from the verified token, never from request JSON.
- Restrict every owner collection by UID and validate allowed fields, document
  size, schema version, and revision transitions in rules or trusted service
  code. Add Emulator Suite tests before deployment.
- Keep optimistic revisions. A stale divergent write must offer **Keep Local**,
  **Keep Cloud**, or **Duplicate as New Project**; never silently use
  last-writer-wins.
- Use Firebase App Check as an abuse-reduction layer after authentication and
  rules are correct. App Check rejects requests without valid app attestation,
  but it does not replace user authorization:
  <https://firebase.google.com/docs/app-check>.
- Provide account export and deletion paths before collecting research answers
  or private feedback. Publish a short, plain-language privacy notice.
- Preserve local recovery. A temporary network or account outage must not erase
  the last confirmed project document or revoke browser-granted media access.

## Open communication and feedback

Use two deliberately different channels:

1. **GitHub Discussions for public conversation.** Enable Q&A, Ideas, and
   Announcements; publish a pinned welcome post, a short roadmap, and clear
   guidance that users must not post private filenames, unreleased lyrics, or
   account details. GitHub describes Discussions as the repository space for
   questions, announcements, polls, and open-ended conversations about project
   direction: <https://docs.github.com/en/discussions/collaborating-with-your-community-using-discussions/about-discussions>.
2. **In-app Help & Feedback for private support.** A signed-in form should offer
   Bug, Workflow friction, Feature idea, and Account help. Show the exact context
   that will be sent, make diagnostics optional, and exclude project content and
   media names by default. Give the user a receipt/reference number.

Route reproducible engineering defects from Discussions or private feedback into
GitHub Issues. Keep broad ideas and questions in Discussions so the issue tracker
does not become a wish list. Add a public changelog and occasional opt-in user
research invitations; never enroll users automatically.

## Delivery phases

### Phase 0 — policy and capability contract

- Add `viewer`, `author`, and future `collaborator` capabilities to bootstrap.
- Mark every project mutation and save path as author-required in the hosted
  adapter while keeping transport available.
- Write privacy, retention, export, deletion, and community conduct policies.

### Phase 1 — account session and read-only guest UX

- Configure Firebase Authentication with Google first; add another provider only
  when user demand justifies its support burden.
- Add sign-in, sign-out, account state, blocked-action explanations, and return to
  the action that prompted sign-in.
- Test keyboard, screen-reader, phone redirect, token-expiration, offline, and
  cancelled-sign-in paths.

### Phase 2 — owned cloud project documents

- Implement the authenticated Firestore/cloud adapter against the existing
  cloud-document contract.
- Add owner-only rules, field validation, size/rate limits, revision history,
  Emulator Suite tests, backup, export, and deletion.
- Migrate a browser-local project only after the signed-in user explicitly
  chooses **Save this project to my account**.

### Phase 3 — reconnect and conflict recovery

- Reconnect remembered browser file handles only through visible permission
  gestures.
- Add Keep Local, Keep Cloud, and Duplicate recovery with clear timestamps and
  revision provenance.
- Test a second device, expired permission, deleted account, and interrupted
  write.

### Phase 4 — help and community

- Enable and seed GitHub Discussions.
- Add private feedback intake, triage labels, response expectations, and a public
  changelog.
- Invite a small, consented pilot group and summarize themes without exposing
  individual project data.

### Phase 5 — measured adaptation

- Review volunteered onboarding answers and feedback themes before adding
  analytics.
- If analytics is still necessary, define a minimal event allowlist, obtain
  consent before collection, set retention, and prohibit project/media content
  in event properties.
- Publish what changed because of feedback so contributors can see the loop
  close.

## Launch gates

Do not call hosted saving ready until all of these are true:

- guest mutation attempts are blocked in both UI and backend;
- authenticated ownership rules and denial cases pass emulator tests;
- no cloud document contains device-local fields or media;
- save conflicts are recoverable and never silent;
- privacy choices, export, and account deletion work;
- account and feedback flows pass desktop, phone, keyboard, and screen-reader
  checks; and
- support ownership and response expectations are published.

The first product question to settle is scope: account-gate hosted authoring only
(recommended), or intentionally abandon offline authoring in the installed
profile. Everything else can proceed without changing the local-first media
boundary.
