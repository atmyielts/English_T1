import { test } from "node:test";
import assert from "node:assert/strict";
import { boundedJson, InterchangeError } from "./policy.ts";
test("JSON output budget matches actual UTF-8 escaping before allocating the full review", () => {
  for (
    const value of [
      null,
      true,
      0,
      1.25,
      "simple",
      "Русский Ўзбек 😀",
      '"\\\0\b\f\n\r\t',
      "\ud800",
      { a: 1, b: undefined, text: "<xml>" },
      [1, 2, { x: "é" }],
    ]
  ) {
    const expected = JSON.stringify(value), size = Buffer.byteLength(expected);
    assert.equal(boundedJson(value, size), expected);
    assert.throws(() => boundedJson(value, size - 1), InterchangeError);
  }
  const shared = { value: "x".repeat(1000) };
  assert.throws(() => boundedJson([shared, shared], 1500), InterchangeError);
  for (const value of [NaN, Infinity, new Date(), new Map(), undefined]) {
    assert.throws(() => boundedJson(value), InterchangeError);
  }
});
