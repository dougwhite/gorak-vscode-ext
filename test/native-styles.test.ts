import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
const context = (async () => {
  const { getLanguageService, TextDocument } =
    await import("vscode-json-languageservice");
  const schema = JSON.parse(
    await fs.readFile("schemas/native-styles.schema.json", "utf8"),
  );
  const service = getLanguageService({});
  service.configure({
    schemas: [
      {
        uri: "https://example.invalid/native-styles.schema.json",
        fileMatch: ["**/field_defaults.json", "**/*.fielddefaults.json"],
        schema,
      },
    ],
  });
  return { service, TextDocument };
})();
async function validate(value: unknown, name = "field_defaults.json") {
  const { service, TextDocument } = await context;
  const doc = TextDocument.create(
    `file:///synthetic/${name}`,
    "json",
    1,
    JSON.stringify(value),
  );
  return service.doValidation(doc, service.parseJSONDocument(doc));
}
test("native stylesheet deltas retain strings, removals, repeated groups and ordering", async () => {
  const values = [
    {},
    {
      groups: {
        "entryfield:2": {
          styles: {
            style2: {
              outlinecolor: "0",
              defaultstring: "",
              script: "ON click = { MESSAGE 'hello'; }",
              childfields: {
                row: {
                  row2: {
                    _type: "entryfield",
                    _attributes: { row: "2", column: "1" },
                    datatype: "varchar(40)",
                    old_property: null,
                  },
                },
              },
              $before: { outlinecolor: "fgpattern" },
            },
          },
        },
      },
    },
    {
      standalone: true,
      properties: {},
      group_order: ["custom%3Agroup"],
      groups: {
        "custom%3Agroup": {
          properties: {},
          styles: {
            style1: {
              _type: "buttonfield",
              _text: "",
              _attributes: { label: "" },
            },
          },
        },
      },
    },
    {
      groups: { buttonfield: null, entryfield: { styles: { style2: null } } },
      group_order: ["entryfield"],
      $order: ["properties", "group_order", "groups"],
    },
  ];
  for (const name of [
    "field_defaults.json",
    "app/field_defaults.json",
    "app/main.fielddefaults.json",
  ]) {
    for (const value of values)
      assert.deepEqual(await validate(value, name), [], JSON.stringify(value));
  }
});
test("native stylesheet schema rejects legacy palettes and invalid scalar/slot shapes", async () => {
  for (const value of [
    { field_styles: [] },
    { source_format: 3 },
    { standalone: false },
    { standalone: true },
    { groups: { entryfield: { styles: { style0: {} } } } },
    { groups: { entryfield: { styles: { style1: { bgcolor: 0 } } } } },
    { groups: { entryfield: { styles: { style1: { enabled: false } } } } },
    {
      groups: {
        entryfield: {
          styles: { style1: { childfields: { row: { row0: {} } } } },
        },
      },
    },
  ])
    assert.ok((await validate(value)).length > 0, JSON.stringify(value));
});
test("schema offers stylesheet properties in frame sidecars", async () => {
  const text =
    '{ "groups": { "entryfield": { "styles": { "style1": { } } } } }';
  const { service, TextDocument } = await context;
  const doc = TextDocument.create(
    "file:///synthetic/app/main.fielddefaults.json",
    "json",
    1,
    text,
  );
  const at = doc.positionAt(text.indexOf("{ }") + 2);
  const result = await service.doComplete(
    doc,
    at,
    service.parseJSONDocument(doc),
  );
  assert.ok(result?.items.some((item) => item.label === "_type"));
  assert.ok(result?.items.some((item) => item.label === "$before"));
});
test("schema is contributed and included in the runtime package", async () => {
  const manifest = JSON.parse(await fs.readFile("package.json", "utf8"));
  assert.ok(
    manifest.contributes.jsonValidation.some(
      (entry: { url: string }) =>
        entry.url === "./schemas/native-styles.schema.json",
    ),
  );
  assert.match(await fs.readFile(".vscodeignore", "utf8"), /^!schemas\/\*\*$/m);
});
