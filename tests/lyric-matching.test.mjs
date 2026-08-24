import assert from "node:assert/strict";
import test from "node:test";
import { applyLyricFolderAssignments, lyricKindForFilename, normalizeLyricMatchTitle, planLyricFolderAssignments } from "../src/lib/lyric-matching.js";

const asset = (name, id = name) => ({ id, rootId: "songs", relativePath: `Album 2/${name}`, name, extension: "md", kind: "lyrics" });

const albumFixture = () => ({
  tracks: [
    {
      id: "return-address",
      title: "Return Address",
      masterCandidateId: "return-master",
      auditionCandidateId: "return-audition",
      candidates: [{ id: "return-audition", label: "Audition" }, { id: "return-master", label: "Master" }],
    },
    {
      id: "anthem",
      title: "Dreadnauts Anthem (One Vibration)",
      masterCandidateId: "",
      auditionCandidateId: "anthem-a",
      candidates: [{ id: "anthem-a", label: "Candidate" }],
    },
    { id: "protected", title: "[SIGNAL SOURCE WITHHELD]", candidates: [] },
  ],
});

test("lyric filenames normalize numbered sheets and DistroKid clean-lyrics markers", () => {
  assert.equal(normalizeLyricMatchTitle("01-return-address_distrokid.md"), "return address");
  assert.equal(normalizeLyricMatchTitle("Return Address — DistroKid Clean Lyrics.txt"), "return address");
  assert.equal(normalizeLyricMatchTitle("Return Address lyric sheet.md"), "return address");
  assert.equal(normalizeLyricMatchTitle("Return Address prompt sheets.txt"), "return address");
  assert.equal(normalizeLyricMatchTitle("Return Address working lyrics.txt"), "return address");
  assert.equal(normalizeLyricMatchTitle("Return Address lyrics clean.txt"), "return address");
  assert.equal(normalizeLyricMatchTitle("09-dreadnauts-anthem-one-vibration-transcription-draft.md"), "dreadnauts anthem one vibration");
  assert.equal(lyricKindForFilename("01-return-address_distrokid.md"), "distrokid");
  assert.equal(lyricKindForFilename("Return Address lyrics only.txt"), "distrokid");
  assert.equal(lyricKindForFilename("Return Address lyrics clean.txt"), "distrokid");
  assert.equal(lyricKindForFilename("01-return-address.md"), "sunoPrompt");
});

test("folder planning attaches exact title matches to the master candidate and leaves protected mismatches unmatched", () => {
  const album = albumFixture();
  const plan = planLyricFolderAssignments(album, [
    asset("01-return-address.md"),
    asset("01-return-address_distrokid.md"),
    asset("09-dreadnauts-anthem-one-vibration-transcription-draft.md"),
    asset("06-the-signal-was-us_distrokid.md"),
  ]);
  assert.equal(plan.assignments.length, 3);
  assert.deepEqual(plan.assignments.filter((assignment) => assignment.trackId === "return-address").map((assignment) => assignment.candidateId), ["return-master", "return-master"]);
  assert.deepEqual(plan.assignments.map((assignment) => assignment.kind).sort(), ["distrokid", "sunoPrompt", "sunoPrompt"]);
  assert.equal(plan.unmatched.length, 1);
  assert.equal(plan.unmatched[0].asset.name, "06-the-signal-was-us_distrokid.md");
});

test("folder planning never overwrites attachments or guesses between duplicate lyric files", () => {
  const album = albumFixture();
  album.tracks[0].candidates[1].lyricRefs = { distrokid: asset("preserved-clean.md", "preserved") };
  const plan = planLyricFolderAssignments(album, [
    asset("01-return-address_distrokid.md"),
    asset("return-address.md", "working-a"),
    asset("return-address-lyrics.md", "working-b"),
  ]);
  assert.equal(plan.assignments.length, 0);
  assert.equal(plan.skippedExisting.length, 1);
  assert.equal(plan.conflicts.length, 1);
  assert.equal(applyLyricFolderAssignments(album, plan.assignments), 0);
  assert.equal(album.tracks[0].candidates[1].lyricRefs.distrokid.id, "preserved");
});

test("applying a safe plan fills only empty typed lyric slots", () => {
  const album = albumFixture();
  const plan = planLyricFolderAssignments(album, [asset("01-return-address.md"), asset("01-return-address_distrokid.md")]);
  assert.equal(applyLyricFolderAssignments(album, plan.assignments), 2);
  assert.equal(album.tracks[0].candidates[1].lyricRefs.sunoPrompt.name, "01-return-address.md");
  assert.equal(album.tracks[0].candidates[1].lyricRefs.distrokid.name, "01-return-address_distrokid.md");
});
