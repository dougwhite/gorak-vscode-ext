import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";

// The library also exports a custom element; this suite only exercises its model API.
Object.defineProperty(globalThis, "HTMLElement", { value: class {} });
Object.defineProperty(globalThis, "customElements", {
  value: { define() {}, get() {} },
});

test("released designer keeps frmflow variants opaque through layout edits", async () => {
  const { parseWml, frameFromWml, propertyEdit, applyIntent } =
    await import("gorak-frame-designer");
  const graph = await fs.readFile(
    "test/fixtures/frmflow/query_probe.wml",
    "utf8",
  );
  const metadata = graph.slice(
    graph.indexOf("  <frmflow>"),
    graph.lastIndexOf("</frame>"),
  );
  for (const flow of [
    metadata,
    "<frmflow/>",
    "<frmflow><row_class>menufield</row_class></frmflow>",
    "<frmflow> legacy scalar </frmflow>",
    "",
  ]) {
    const text = `<frame><topform><entryfield name="real_field" xleft="100"/></topform>${flow}</frame>`;
    const doc = parseWml("file:///independent.wml", 1, text);
    const model = frameFromWml(doc, []);
    assert.deepEqual(
      model.fields.map((f) => f.name),
      ["real_field"],
      "Only topform contributes layout fields",
    );
    assert.equal(doc.text, text);
    const field = doc.nodes.find(
      (n) => n.attributes.name?.value === "real_field",
    )!;
    const updated = applyIntent(
      doc,
      propertyEdit(doc, field.id, "xleft", "200"),
    );
    assert.equal(
      updated.text,
      text.replace('xleft="100"', 'xleft="200"'),
      "Unrelated layout edit preserves every metadata byte, reference and expression",
    );
  }
});
