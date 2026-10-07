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

export async function testFileIcons() {
  const root = process.env.GORAK_TEST_OUTPUT!;
  const open = async (name: string, text: string) => {
    const file = path.join(root, "icons", name);
    await fs.mkdir(path.dirname(file), { recursive: true });
    await fs.writeFile(file, text);
    return vscode.workspace.openTextDocument(vscode.Uri.file(file));
  };
  const project = await open("gorak.json", '{"name":"demo"}');
  assert.equal(project.languageId, "gorak-project");
  await vscode.window.showTextDocument(project);
  await eventually(
    async () =>
      vscode.extensions.getExtension("vscode.json-language-features")
        ?.isActive === true,
    "Built-in JSON activates automatically",
  );
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
  assert.equal(
    vscode.languages.match("json", project),
    0,
    "Third-party json-only selectors do not match",
  );
  const settings = vscode.workspace.getConfiguration();
  const before = settings.inspect("[json]")?.workspaceValue;
  const settingsFile = path.join(
    vscode.workspace.workspaceFolders![0].uri.fsPath,
    ".vscode/settings.json",
  );
  const settingsBytes = await fs.readFile(settingsFile).catch(() => undefined);

  try {
    await settings.update(
      "[json]",
      { "editor.tabSize": 7 },
      vscode.ConfigurationTarget.Workspace,
    );
    assert.notEqual(
      vscode.workspace.getConfiguration("editor", project).get("tabSize"),
      7,
      "Custom mode does not inherit [json]",
    );
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
  } finally {
    await settings.update(
      "[json]",
      before,
      vscode.ConfigurationTarget.Workspace,
    );
    if (settingsBytes) await fs.writeFile(settingsFile, settingsBytes);
    else {
      await fs.rm(settingsFile, { force: true });
      await fs.rmdir(path.dirname(settingsFile)).catch(() => {});
    }
  }
  const toml = await open("ordinary.toml", 'name = "demo"');
  assert.ok(!toml.languageId.startsWith("gorak"), "TOML is not reassigned");
  for (const [filename, mode] of [
    ["sample.w4gl", "gorak-openroad"],
    ["sample.wml", "gorak-wml"],
  ]) {
    assert.equal((await open(filename, "")).languageId, mode);
  }
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
