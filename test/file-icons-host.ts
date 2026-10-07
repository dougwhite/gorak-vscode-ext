import * as vscode from "vscode";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";

async function eventually(check: () => Promise<boolean>, message: string) {
  for (let i = 0; i < 100; i++) {
    if (await check()) return;
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  assert.fail(message);
}

async function verifyJson(project: vscode.TextDocument) {
  await vscode.window.showTextDocument(project);
  const replace = async (text: string) => {
    const edit = new vscode.WorkspaceEdit();
    edit.replace(
      project.uri,
      new vscode.Range(
        project.positionAt(0),
        project.positionAt(project.getText().length),
      ),
      text,
    );
    assert.ok(await vscode.workspace.applyEdit(edit));
  };
  await replace('{"na": "demo"}');
  await eventually(async () => {
    const result = await vscode.commands.executeCommand<vscode.CompletionList>(
      "vscode.executeCompletionItemProvider",
      project.uri,
      new vscode.Position(0, 4),
    );
    return (
      result?.items.some(
        (item) =>
          (typeof item.label === "string" ? item.label : item.label.label) ===
          "name",
      ) ?? false
    );
  }, "Project schema completion");
  for (const text of [
    '{"name": 3}',
    '{"name":"demo",}',
    '{/* invalid */"name":"demo"}',
    '{"name":}',
  ]) {
    await replace(text);
    await eventually(
      async () =>
        vscode.languages
          .getDiagnostics(project.uri)
          .some(
            (d) =>
              d.severity <=
              (text === '{"name": 3}'
                ? vscode.DiagnosticSeverity.Warning
                : vscode.DiagnosticSeverity.Error),
          ),
      `Reject invalid JSON/schema: ${text}`,
    );
    await replace('{"name":"demo"}');
    await eventually(
      async () => vscode.languages.getDiagnostics(project.uri).length === 0,
      "Valid JSON clears diagnostics",
    );
  }
  const edits = await vscode.commands.executeCommand<vscode.TextEdit[]>(
    "vscode.executeFormatDocumentProvider",
    project.uri,
    { tabSize: 2, insertSpaces: true },
  );
  assert.ok(edits?.length, "Built-in JSON formatter");
  const formatted = new vscode.WorkspaceEdit();
  formatted.set(project.uri, edits!);
  await vscode.workspace.applyEdit(formatted);
  assert.deepEqual(JSON.parse(project.getText()), { name: "demo" });
  assert.ok(project.getText().includes('\n  "name"'));
}

export async function testFileIcons() {
  const root = process.env.GORAK_TEST_OUTPUT!;
  const open = async (name: string, text = '{"name":"demo"}') => {
    const file = path.join(root, "icons", name);
    await fs.mkdir(path.dirname(file), { recursive: true });
    await fs.writeFile(file, text);
    return vscode.workspace.openTextDocument(vscode.Uri.file(file));
  };
  const fresh = (uri: vscode.Uri) =>
    vscode.workspace.textDocuments.find(
      (d) => !d.isClosed && d.uri.toString() === uri.toString(),
    )!;
  const language = async (uri: vscode.Uri, expected: string) => {
    await eventually(
      async () => fresh(uri)?.languageId === expected,
      `${uri.path}: expected ${expected}`,
    );
    return fresh(uri);
  };
  let project = await open("gorak.json");
  assert.equal(project.languageId, "gorak-project", "Default-on project mode");
  await vscode.extensions
    .getExtension("dougwhite.gorak-vscode-ext")!
    .activate();
  await eventually(
    async () =>
      vscode.extensions.getExtension("vscode.json-language-features")
        ?.isActive === true,
    "Built-in JSON activates automatically",
  );
  const settings = vscode.workspace.getConfiguration();
  const option = "gorak.projectFileIcon.enabled";
  const keys = ["[json]", option, "files.associations"];
  const before = keys.map((key) => settings.inspect(key)?.workspaceValue);
  const globalAssociations =
    settings.inspect("files.associations")?.globalValue;
  const settingsFile = path.join(
    vscode.workspace.workspaceFolders![0].uri.fsPath,
    ".vscode/settings.json",
  );
  const settingsBytes = await fs.readFile(settingsFile).catch(() => undefined);
  const update = (key: string, value: unknown) =>
    settings.update(key, value, vscode.ConfigurationTarget.Workspace);
  const disk = await fs.readFile(project.uri.fsPath);
  const select = async (enabled: boolean) => {
    const text = project.getText(),
      dirty = project.isDirty;
    const associations = settings.get("files.associations", {});
    await update(option, enabled);
    project = await language(project.uri, enabled ? "gorak-project" : "json");
    assert.equal(
      project.getText(),
      text,
      "Changing modes preserves unsaved contents",
    );
    assert.equal(
      project.isDirty,
      dirty,
      "Changing modes preserves dirty state",
    );
    assert.deepEqual(
      await fs.readFile(project.uri.fsPath),
      disk,
      "Changing modes does not save or change the file",
    );
    assert.deepEqual(
      settings.get("files.associations", {}),
      associations,
      "The opt-out never writes files.associations",
    );
  };
  try {
    await update("[json]", { "editor.tabSize": 7 });
    await verifyJson(project);
    assert.notEqual(
      vscode.workspace.getConfiguration("editor", project).get("tabSize"),
      7,
    );
    assert.equal(vscode.languages.match("json", project), 0);
    // Toggle an already-open dirty document and exercise the built-in services
    // in both modes, including after changing back to the custom language.
    await select(false);
    assert.equal(
      vscode.workspace.getConfiguration("editor", project).get("tabSize"),
      7,
    );
    assert.ok(
      vscode.languages.match("json", project) > 0,
      "JSON-only providers match after opting out",
    );
    await verifyJson(project);
    const disabledNew = await open("disabled/gorak.json");
    await verifyJson(await language(disabledNew.uri, "json"));
    await select(true);
    await language(disabledNew.uri, "gorak-project");
    await verifyJson(project);

    // User/workspace association syntax includes basename globs, full paths,
    // case-insensitive matching, braces and character ranges.
    for (const [pattern, mode] of [
      ["gorak.json", "json"],
      ["*.json", "json"],
      ["**/override/gorak.json", "plaintext"],
      ["**/OVERRIDE/GORAK.JSON", "json"],
      ["{gorak,other}.json", "json"],
      ["[g]orak.json", "json"],
      ["gorak.json", "gorak-project"],
    ]) {
      await update("files.associations", { [pattern]: mode });
      const doc = await open("override/gorak.json");
      await language(doc.uri, mode);
      for (const enabled of [false, true]) {
        await update(option, enabled);
        // Allow the no-op reconciliation to run before asserting it did not
        // override VS Code's explicitly selected language.
        await new Promise((resolve) => setTimeout(resolve, 100));
        assert.equal(
          fresh(doc.uri).languageId,
          mode,
          `${pattern}, enabled=${enabled}`,
        );
      }
    }
    await update("files.associations", undefined);
    await settings.update(
      "files.associations",
      { "gorak.json": "json" },
      vscode.ConfigurationTarget.Global,
    );
    await language(project.uri, "json");
    const userOverride = await open("user-override/gorak.json");
    await language(userOverride.uri, "json");
    for (const enabled of [false, true]) {
      await update(option, enabled);
      await new Promise((resolve) => setTimeout(resolve, 100));
      assert.equal(
        fresh(userOverride.uri).languageId,
        "json",
        "User association wins",
      );
    }
    await settings.update(
      "files.associations",
      globalAssociations,
      vscode.ConfigurationTarget.Global,
    );
    await update("files.associations", { "unrelated.json": "plaintext" });
    project = await language(project.uri, "gorak-project");
    await select(false);
    await select(true);
    await update("files.associations", before[2]);

    for (const filename of [
      "ordinary.json",
      "other.gorak.json",
      "gorak.json.backup.json",
      "field_defaults.json",
      "sample.fielddefaults.json",
    ]) {
      const document = await open(filename, '{"sample":1}');
      assert.equal(document.languageId, "json", filename);
      assert.equal(
        vscode.workspace.getConfiguration("editor", document).get("tabSize"),
        7,
      );
      assert.ok(
        (
          await vscode.commands.executeCommand<vscode.TextEdit[]>(
            "vscode.executeFormatDocumentProvider",
            document.uri,
            { tabSize: 2, insertSpaces: true },
          )
        )?.length,
      );
    }
    const toml = await open("ordinary.toml", 'name = "demo"');
    assert.ok(!toml.languageId.startsWith("gorak"), "TOML is not reassigned");
    for (const [filename, mode] of [
      ["sample.w4gl", "gorak-openroad"],
      ["sample.wml", "gorak-wml"],
    ]) {
      assert.equal((await open(filename, "")).languageId, mode);
    }
  } finally {
    await settings.update(
      "files.associations",
      globalAssociations,
      vscode.ConfigurationTarget.Global,
    );
    for (const [index, key] of keys.entries()) await update(key, before[index]);
    if (settingsBytes) await fs.writeFile(settingsFile, settingsBytes);
    else {
      await fs.rm(settingsFile, { force: true });
      await fs.rmdir(path.dirname(settingsFile)).catch(() => {});
    }
  }
  project = await language(project.uri, "gorak-project");
  await project.save();
  await vscode.window.showTextDocument(project);
}

export async function run() {
  await testFileIcons();
  await fs.writeFile(
    path.join(process.env.GORAK_TEST_OUTPUT!, "ready.json"),
    JSON.stringify({
      version: vscode.version,
      passed: true,
      iconTheme: vscode.workspace
        .getConfiguration("workbench")
        .inspect("iconTheme"),
      colorTheme: vscode.workspace
        .getConfiguration("workbench")
        .inspect("colorTheme"),
    }),
  );
}
