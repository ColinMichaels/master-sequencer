import assert from "node:assert/strict";
import test from "node:test";
import { createAudioWatchService } from "../server/audio-watch-service.mjs";

test("optional audio watching observes connected folders and closes cleanly", () => {
  const records = [];
  const fakeWatch = (path, options, callback) => {
    const record = { path, options, callback, closed: false, on() {} };
    record.close = () => { record.closed = true; };
    records.push(record);
    return record;
  };
  const service = createAudioWatchService({ onChange: async () => {}, watch: fakeWatch, platform: "darwin" });
  service.configure([{ id: "online", path: "/audio", kind: "folder", connected: true }, { id: "offline", path: "/missing", kind: "folder", connected: false }], true);
  assert.deepEqual(service.status().watchedRootIds, ["online"]);
  assert.equal(records[0].options.recursive, true);
  service.close();
  assert.equal(records[0].closed, true);
});
