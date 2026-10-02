import * as vscode from "vscode";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
async function checkInstalled() {
  const extension = vscode.extensions.getExtension(
    "dougwhite.gorak-vscode-ext",
  )!;
  assert.equal(
    extension.packageJSON.version,
    process.env.GORAK_EXPECTED_VERSION,
  );
  const api = (await extension.activate()) as {
    indexStatus(): Promise<{
      indexing: boolean;
      files: number;
      parsedFiles: number;
      restoredFiles: number;
    }>;
  };
  const uri = vscode.Uri.file(
    path.join(process.env.GORAK_FIXTURE_ROOT!, "demo/customer.w4gl"),
  );
  const document = await vscode.workspace.openTextDocument(uri);
  await vscode.window.showTextDocument(document);
  const deadline = Date.now() + 60000;
  let status;
  do {
    status = await api.indexStatus();
    if (!status.indexing && status.files > 0) break;
    assert.ok(Date.now() < deadline, "Installed server index completes");
    await new Promise((resolve) => setTimeout(resolve, 50));
  } while (true);
  const refs = await vscode.commands.executeCommand<vscode.Location[]>(
    "vscode.executeReferenceProvider",
    uri,
    document.positionAt(document.getText().indexOf("updated = self")),
  );
  assert.equal(refs?.length, 4, "Installed native server resolves references");
  if (process.env.GORAK_INSTALLED_PHASE !== "install") {
    assert.equal(
      status.parsedFiles,
      0,
      "Upgrade/rollback reuses compatible cached analysis",
    );
    assert.ok(status.restoredFiles > 0);
  }
  await vscode.commands.executeCommand("gorak.copyDiagnostics");
  const summary = JSON.parse(await vscode.env.clipboard.readText());
  assert.equal(summary.extensionVersion, process.env.GORAK_EXPECTED_VERSION);
  assert.ok(summary.serverVersion);
  assert.ok(!JSON.stringify(summary).includes(process.env.GORAK_FIXTURE_ROOT!));
  await fs.writeFile(
    path.join(process.env.GORAK_TEST_OUTPUT!, "result.json"),
    JSON.stringify({
      passed: true,
      phase: process.env.GORAK_INSTALLED_PHASE,
      version: extension.packageJSON.version,
      parsedFiles: status.parsedFiles,
      restoredFiles: status.restoredFiles,
    }),
  );
}

export async function run() {
  try {
    await checkInstalled();
  } catch (error) {
    await fs.writeFile(
      path.join(process.env.GORAK_TEST_OUTPUT!, "failure.txt"),
      String(error),
    );
    throw error;
  }
}
