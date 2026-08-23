import assert from "node:assert/strict";
import test from "node:test";
import { compareRenderManifests, validateDeliveryRequest } from "../src/lib/delivery-profiles.js";

test("delivery profiles validate output without inferring approval or publication", () => {
  assert.deepEqual(validateDeliveryRequest({ profileId: "archive-wav", scope: "track" }).issues, []);
  assert.deepEqual(validateDeliveryRequest({ profileId: "review-mp3", scope: "album" }).issues, []);
  assert.deepEqual(validateDeliveryRequest({ profileId: "distribution-wav", scope: "tracks" }).issues, []);
  assert.match(validateDeliveryRequest({ profileId: "distribution-wav", scope: "track" }).issues[0], /numbered separate-track/);
});

test("render manifest comparison highlights format, profile, order, source, and edit differences", () => {
  const left = { format: "wav", scope: "album", delivery: { profileId: "archive-wav" }, tracks: [{ id: "one", title: "One", candidateId: "a", endMode: "natural" }] };
  const right = { format: "mp3", scope: "album", delivery: { profileId: "review-mp3" }, tracks: [{ id: "one", title: "One", candidateId: "b", endMode: "fade" }] };
  const rows = compareRenderManifests(left, right);
  assert.deepEqual(rows.map((row) => row.field), ["Format", "Delivery profile", "One"]);
});
