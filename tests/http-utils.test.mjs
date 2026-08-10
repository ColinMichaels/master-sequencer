import assert from "node:assert/strict";
import test from "node:test";
import {
  isStateChangingMethod,
  parseByteRange,
  requestHostIsAllowed,
  requestOriginIsAllowed,
} from "../server/http-utils.mjs";

test("byte ranges support bounded, open-ended, and suffix requests", () => {
  assert.deepEqual(parseByteRange("bytes=10-19", 100), { satisfiable: true, start: 10, end: 19 });
  assert.deepEqual(parseByteRange("bytes=90-", 100), { satisfiable: true, start: 90, end: 99 });
  assert.deepEqual(parseByteRange("bytes=-10", 100), { satisfiable: true, start: 90, end: 99 });
  assert.deepEqual(parseByteRange("bytes=-500", 100), { satisfiable: true, start: 0, end: 99 });
  assert.equal(parseByteRange("", 100), null);
});

test("invalid and unsatisfiable byte ranges fail closed", () => {
  for (const header of ["bytes=", "bytes=20-10", "bytes=100-", "bytes=-0", "bytes=1-2,4-5", "items=0-1"]) {
    assert.deepEqual(parseByteRange(header, 100), { satisfiable: false });
  }
});

test("local host and same-origin checks reject DNS-rebinding origins", () => {
  const server = { configuredHost: "127.0.0.1", port: 4177 };
  assert.equal(requestHostIsAllowed("127.0.0.1:4177", server), true);
  assert.equal(requestHostIsAllowed("localhost:4177", server), true);
  assert.equal(requestHostIsAllowed("evil.example:4177", server), false);
  assert.equal(requestHostIsAllowed("127.0.0.1:9999", server), false);
  assert.equal(requestOriginIsAllowed("http://127.0.0.1:4177", "127.0.0.1:4177"), true);
  assert.equal(requestOriginIsAllowed("https://evil.example", "127.0.0.1:4177"), false);
  assert.equal(requestOriginIsAllowed(undefined, "127.0.0.1:4177"), true);
  assert.equal(isStateChangingMethod("POST"), true);
  assert.equal(isStateChangingMethod("GET"), false);
});
