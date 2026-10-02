import * as vscode from "vscode";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
export async function run() {
  const extension = vscode.extensions.getExtension(
    "dougwhite.gorak-vscode-ext",
  )!;
  const api = (await extension.activate()) as {
    indexStatus(): Promise<{
      indexing: boolean;
      files: number;
      parsedFiles: number;
      restoredFiles: number;
    }>;
  };
  const doc = await vscode.workspace.openTextDocument(
    vscode.Uri.file(
      path.join(extension.extensionPath, "examples/demo/customer.w4gl"),
    ),
  );
  await vscode.window.showTextDocument(doc);
  const deadline = Date.now() + 15000;
  let state;
  do {
    state = await api.indexStatus();
    if (!state.indexing && state.files > 0) break;
    assert.ok(Date.now() < deadline);
    await new Promise((r) => setTimeout(r, 25));
  } while (true);
  if (process.env.GORAK_RESTART_PHASE === "warm") {
    assert.equal(state.parsedFiles, 0);
    assert.ok(state.restoredFiles > 0);
  } else assert.ok(state.parsedFiles > 0);
  const symbols = await vscode.commands.executeCommand<vscode.DocumentSymbol[]>(
    "vscode.executeDocumentSymbolProvider",
    doc.uri,
  );
  assert.equal(symbols?.[0].name, "METHOD Add()");
  await fs.writeFile(
    path.join(process.env.GORAK_TEST_OUTPUT!, "result.json"),
    JSON.stringify({
      passed: true,
      phase: process.env.GORAK_RESTART_PHASE,
      ...state,
    }),
  );
}
