import { test } from "node:test";
import assert from "node:assert/strict";
import { validateIntent } from "../src/frame-protocol";
test("designer edits retain UTF-16 offsets and exact CRLF/script source", () => {
  const text =
    '<frame label="😀">\r\n<!-- retained -->\r\n<field x="10"/>\r\n</frame>';
  const start = text.indexOf("10");
  const intent = {
    uri: "file:///frame.wml",
    version: 4,
    edits: [{ start, end: start + 2, expected: "10", text: "20" }],
  };
  assert.equal(validateIntent(intent, intent.uri, 4, text), intent);
  for (const bad of [
    { ...intent, version: 3 },
    { ...intent, uri: "file:///other.wml" },
    { ...intent, edits: [{ ...intent.edits[0], expected: "11" }] },
    { ...intent, edits: [...intent.edits, ...intent.edits] },
    { ...intent, edits: [{ ...intent.edits[0], start: -1 }] },
  ])
    assert.throws(() => validateIntent(bad, intent.uri, 4, text));
});
test("designer rejects malformed requests and permits adjacent source edits", () => {
  for (const value of [null, {}, { uri: "u", version: 1, edits: [null] }])
    assert.throws(() => validateIntent(value, "u", 1, "ab"));
  assert.equal(
    validateIntent(
      {
        uri: "u",
        version: 1,
        edits: [
          { start: 0, end: 1, expected: "a", text: "A" },
          { start: 1, end: 2, expected: "b", text: "B" },
        ],
      },
      "u",
      1,
      "ab",
    ).edits.length,
    2,
  );
});
