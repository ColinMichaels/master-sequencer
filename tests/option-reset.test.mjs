import assert from "node:assert/strict";
import test from "node:test";
import { handleOptionReset, handleOptionResetKey, hasResetDefault, optionResetTitle } from "../src/lib/option-reset.js";

const event = ({ altKey = true, key } = {}) => {
  const calls = { preventDefault: 0, stopPropagation: 0 };
  return {
    altKey,
    key,
    calls,
    preventDefault: () => { calls.preventDefault += 1; },
    stopPropagation: () => { calls.stopPropagation += 1; },
  };
};

test("Option reset accepts numeric, string, and false defaults", () => {
  assert.equal(hasResetDefault(0), true);
  assert.equal(hasResetDefault(false), true);
  assert.equal(hasResetDefault(undefined), false);

  for (const defaultValue of [0, "natural", false]) {
    const pointerEvent = event();
    const received = [];
    assert.equal(handleOptionReset(pointerEvent, { defaultValue, onReset: (value) => received.push(value) }), true);
    assert.deepEqual(received, [defaultValue]);
    assert.deepEqual(pointerEvent.calls, { preventDefault: 1, stopPropagation: 1 });
  }
});

test("Option reset leaves ordinary and disabled interactions untouched", () => {
  const received = [];
  const ordinaryEvent = event({ altKey: false });
  const disabledEvent = event();

  assert.equal(handleOptionReset(ordinaryEvent, { defaultValue: 0, onReset: (value) => received.push(value) }), false);
  assert.equal(handleOptionReset(disabledEvent, { defaultValue: 0, disabled: true, onReset: (value) => received.push(value) }), false);
  assert.deepEqual(received, []);
  assert.deepEqual(ordinaryEvent.calls, { preventDefault: 0, stopPropagation: 0 });
  assert.deepEqual(disabledEvent.calls, { preventDefault: 0, stopPropagation: 0 });
});

test("Option plus Enter or Space provides the keyboard reset equivalent", () => {
  const received = [];
  const enterEvent = event({ key: "Enter" });
  const spaceEvent = event({ key: " " });
  const arrowEvent = event({ key: "ArrowLeft" });

  assert.equal(handleOptionResetKey(enterEvent, { defaultValue: -18, onReset: (value) => received.push(value) }), true);
  assert.equal(handleOptionResetKey(spaceEvent, { defaultValue: false, onReset: (value) => received.push(value) }), true);
  assert.equal(handleOptionResetKey(arrowEvent, { defaultValue: 0, onReset: (value) => received.push(value) }), false);
  assert.deepEqual(received, [-18, false]);
  assert.equal(optionResetTitle(-18, "-18.0 dB"), "Option-click to reset to -18.0 dB");
});
