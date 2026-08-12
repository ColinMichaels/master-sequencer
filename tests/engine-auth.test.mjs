import assert from "node:assert/strict";
import test from "node:test";
import { configuredEngineToken, engineRequestIsAuthorized } from "../server/engine-auth.mjs";

test("normal browser mode remains available when native engine authentication is not configured", () => {
  assert.equal(engineRequestIsAuthorized(undefined, ""), true);
  assert.equal(engineRequestIsAuthorized("anything", ""), true);
});

test("native engine requests require an exact per-launch token", () => {
  const token = "a-fixed-test-token-with-safe-length";
  assert.equal(engineRequestIsAuthorized(token, token), true);
  assert.equal(engineRequestIsAuthorized([token], token), true);
  assert.equal(engineRequestIsAuthorized(undefined, token), false);
  assert.equal(engineRequestIsAuthorized("wrong", token), false);
  assert.equal(engineRequestIsAuthorized(`${token}-extra`, token), false);
});

test("configured token trims environment whitespace without accepting an empty value", () => {
  const previous = process.env.PROJECT_SEQUENCER_ENGINE_TOKEN;
  try {
    process.env.PROJECT_SEQUENCER_ENGINE_TOKEN = "  native-session-token  ";
    assert.equal(configuredEngineToken(), "native-session-token");
    process.env.PROJECT_SEQUENCER_ENGINE_TOKEN = "   ";
    assert.equal(configuredEngineToken(), "");
  } finally {
    if (previous === undefined) delete process.env.PROJECT_SEQUENCER_ENGINE_TOKEN;
    else process.env.PROJECT_SEQUENCER_ENGINE_TOKEN = previous;
  }
});
