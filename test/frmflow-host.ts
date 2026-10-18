// Independent consumer fixture: exercise the released server through VS Code.
import * as vscode from "vscode";
import assert from "node:assert/strict";
import path from "node:path";

export async function testFrmflow(root: string) {
  const uri = vscode.Uri.file(path.join(root, "example/query_probe.wml"));
  const doc = await vscode.workspace.openTextDocument(uri);
  await vscode.window.showTextDocument(doc);
  const original = doc.getText();
  const at = (needle: string) => {
    const offset = original.indexOf(needle);
    assert.ok(offset >= 0, needle);
    return doc.positionAt(offset);
  };
  const defs = await vscode.commands.executeCommand<vscode.Location[]>(
    "vscode.executeDefinitionProvider",
    uri,
    at("query_caption;"),
  );
  assert.equal(defs?.length, 1, "Actual layout field remains navigable");
  assert.equal(defs![0].uri.fsPath, uri.fsPath);
  assert.equal(doc.getText(defs![0].range), "query_caption");
  assert.deepEqual(defs![0].range.start, at('query_caption"'));
  const symbols = await vscode.commands.executeCommand<
    Array<vscode.DocumentSymbol | vscode.SymbolInformation>
  >("vscode.executeDocumentSymbolProvider", uri);
  assert.ok(symbols?.some((s) => s.name === "INITIALIZE"));
  assert.ok(
    !symbols?.some((s) => /metadata_|ON click/i.test(s.name)),
    "Query metadata and metadata scripts stay out of outline",
  );
  const metadataDefs = await vscode.commands.executeCommand<vscode.Location[]>(
    "vscode.executeDefinitionProvider",
    uri,
    at("metadata_only_variable;"),
  );
  assert.equal(
    metadataDefs?.length ?? 0,
    0,
    "Metadata text has no invented binding",
  );
  await vscode.commands.executeCommand("gorak.openFrameDesigner", uri);
  await vscode.commands.executeCommand("gorak.openFrameSource", uri);
  assert.equal(
    doc.getText(),
    original,
    "Nested query graph survives source/designer switching exactly",
  );
  assert.equal(doc.isDirty, false);
}
