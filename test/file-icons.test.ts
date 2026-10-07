import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";

test("file icons keep associations narrow and delegate JSON to VS Code", async () => {
  const manifest = JSON.parse(await fs.readFile("package.json", "utf8"));
  const { languages, jsonLanguageParticipants, grammars } =
    manifest.contributes;
  assert.deepEqual(
    languages.map((l: { id: string }) => l.id),
    ["gorak-openroad", "gorak-wml", "gorak-project"],
  );
  assert.deepEqual(languages[2].filenames, ["gorak.json"]);
  assert.equal(languages[2].extensions, undefined);
  assert.deepEqual(jsonLanguageParticipants, [
    { languageId: "gorak-project", comments: false },
  ]);
  assert.ok(
    manifest.extensionDependencies.includes("vscode.json-language-features"),
  );
  assert.ok(
    grammars.some((g: { language: string }) => g.language === "gorak-project"),
  );
  for (const [index, name] of ["w4gl", "wml", "project"].entries()) {
    for (const variant of ["light", "dark"]) {
      assert.equal(
        languages[index].icon[variant],
        `./icons/${variant}/${name}.svg`,
      );
    }
  }
  for (const variant of ["light", "dark"]) {
    for (const name of [
      "w4gl",
      "wml",
      "project",
      "metadata",
      "field-defaults",
    ]) {
      const svg = await fs.readFile(`icons/${variant}/${name}.svg`, "utf8");
      assert.ok(svg.includes("<svg"));
      assert.ok(!/<(?:script|image)\b|https?:\/\/(?!www.w3.org)/.test(svg));
    }
  }
  assert.equal(manifest.contributes.iconThemes, undefined);
  assert.equal(
    manifest.contributes.configurationDefaults["workbench.iconTheme"],
    undefined,
  );
});
