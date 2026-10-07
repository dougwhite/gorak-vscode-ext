// Independent consumer assertions through the installed extension's VS Code API.
import * as vscode from "vscode";
import assert from "node:assert/strict";
import path from "node:path";

export async function testContract12(root: string) {
  const doc = await vscode.workspace.openTextDocument(
    vscode.Uri.file(path.join(root, "example/member_probe.w4gl")),
  );
  await vscode.window.showTextDocument(doc);
  const original = doc.getText();
  const at = (needle: string, delta = 0) =>
    doc.positionAt(original.indexOf(needle) + delta);
  const definitions = async (needle: string, delta = 0) =>
    (await vscode.commands.executeCommand<vscode.Location[]>(
      "vscode.executeDefinitionProvider",
      doc.uri,
      at(needle, delta),
    )) ?? [];
  for (const [needle, delta, name] of [
    ["self.balance =", 5, "balance"],
    ["self.caption;", 5, "caption"],
    ["self.Summarize();", 5, "Summarize"],
    ["METHOD ReadCaption()", 7, "ReadCaption"],
  ] as const) {
    const locations = await definitions(needle, delta);
    assert.equal(locations.length, 1, `Contract 12 binding: ${name}`);
    assert.equal(locations[0].uri.fsPath, doc.uri.fsPath);
    assert.equal(doc.getText(locations[0].range), name);
    assert.deepEqual(
      locations[0].range.start,
      name === "ReadCaption" ? at("METHOD ReadCaption()", 7) : at(`${name} =`),
    );
  }
  const refs = await vscode.commands.executeCommand<vscode.Location[]>(
    "vscode.executeReferenceProvider",
    doc.uri,
    at("self.balance =", 5),
  );
  assert.equal(refs?.length, 3);
  for (const ref of refs!) assert.equal(doc.getText(ref.range), "balance");
  await assert.rejects(
    async () =>
      vscode.commands.executeCommand<vscode.WorkspaceEdit>(
        "vscode.executeDocumentRenameProvider",
        doc.uri,
        at("self.balance =", 5),
        "total",
      ),
    /proven rename coverage/,
    "Attribute rename stays outside the server's proven scope",
  );
  const rename = await vscode.commands.executeCommand<vscode.WorkspaceEdit>(
    "vscode.executeDocumentRenameProvider",
    doc.uri,
    at("buffer = picture;"),
    "textBuffer",
  );
  assert.equal(rename?.get(doc.uri).length, 2);
  for (const edit of rename!.get(doc.uri)) {
    assert.equal(doc.getText(edit.range), "buffer");
    assert.equal(edit.newText, "textBuffer");
  }
  assert.equal(
    doc.getText(),
    original,
    "Rename preview preserves remarks/tags/defaults",
  );
  assert.equal(doc.isDirty, false);
  const core = await definitions("StringObject;");
  assert.equal(core.length, 1, "Implicit core navigation");
  assert.equal(core[0].uri.scheme, "gorak-builtin");
  let refused = false;
  try {
    const edit = await vscode.commands.executeCommand<vscode.WorkspaceEdit>(
      "vscode.executeDocumentRenameProvider",
      doc.uri,
      at("StringObject;"),
      "RenamedCore",
    );
    refused = !edit || edit.entries().length === 0;
  } catch {
    refused = true;
  }
  assert.ok(refused, "Built-in rename must be refused");
  const completion =
    await vscode.commands.executeCommand<vscode.CompletionList>(
      "vscode.executeCompletionItemProvider",
      doc.uri,
      at("self.caption;", 5),
    );
  assert.ok(
    completion?.items.some(
      (i) =>
        (typeof i.label === "string" ? i.label : i.label.label) === "caption",
    ),
  );
  const deadline = Date.now() + 10000;
  let diagnostic: vscode.Diagnostic | undefined;
  while (
    !(diagnostic = vscode.languages
      .getDiagnostics(doc.uri)
      .find((d) => d.code === "incompatible-reference-type"))
  ) {
    assert.ok(Date.now() < deadline, "Installed server publishes diagnostic");
    await new Promise((r) => setTimeout(r, 50));
  }
  assert.equal(doc.getText(diagnostic.range), "picture");
  assert.deepEqual(diagnostic.range.start, at("buffer = picture;", 9));
  assert.deepEqual(
    vscode.languages
      .getDiagnostics(doc.uri)
      .filter((d) => d.severity === vscode.DiagnosticSeverity.Error),
    [],
  );
}
