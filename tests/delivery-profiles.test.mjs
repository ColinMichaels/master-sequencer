import assert from "node:assert/strict";
import test from "node:test";
import { compareRenderManifests, validateDeliveryRequest } from "../src/lib/delivery-profiles.js";

test("delivery profiles validate output without inferring approval or publication", () => {
  assert.deepEqual(validateDeliveryRequest({ profileId: "archive-wav", format: "wav", scope: "track" }).issues, []);
  assert.match(validateDeliveryRequest({ profileId: "review-mp3", format: "wav", scope: "album" }).issues[0], /requires MP3/);
  assert.match(validateDeliveryRequest({ profileId: "distribution-wav", format: "wav", scope: "track" }).issues[0], /album-program/);
});

test("render manifest comparison highlights format, profile, order, source, and edit differences", () => {
  const left = { format: "wav", scope: "album", delivery: { profileId: "archive-wav" }, tracks: [{ id: "one", title: "One", candidateId: "a", endMode: "natural" }] };
  const right = { format: "mp3", scope: "album", delivery: { profileId: "review-mp3" }, tracks: [{ id: "one", title: "One", candidateId: "b", endMode: "fade" }] };
  const rows = compareRenderManifests(left, right);
  assert.deepEqual(rows.map((row) => row.field), ["Format", "Delivery profile", "One"]);
});
