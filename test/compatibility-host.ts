// Only VS Code APIs: the server and designer must come from the installed VSIX.
import * as vscode from "vscode";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";

export async function run() {
  const root = process.env.GORAK_FIXTURE_ROOT!;
  const open = (file: string) =>
    vscode.workspace.openTextDocument(vscode.Uri.file(path.join(root, file)));
  const panel = await open("example/panel.w4gl");
  await vscode.window.showTextDocument(panel);
  const extension = vscode.extensions.getExtension(
    "dougwhite.gorak-vscode-ext",
  )!;
  const deadline = Date.now() + 60000;
  while (!extension.isActive || panel.languageId !== "gorak-openroad") {
    assert.ok(
      Date.now() < deadline,
      "Automatic activation and W4GL language mode",
    );
    await new Promise((r) => setTimeout(r, 50));
  }
  assert.equal(
    extension.packageJSON.version,
    process.env.GORAK_EXPECTED_VERSION,
  );
  const api = extension.exports as {
    indexStatus(): Promise<{ indexing: boolean; files: number }>;
  };
  while (true) {
    const status = await api.indexStatus();
    if (!status.indexing && status.files > 0) break;
    assert.ok(Date.now() < deadline, "Bundled server indexes upstream project");
    await new Promise((r) => setTimeout(r, 50));
  }
  const wml = await open("example/panel.wml");
  await vscode.window.showTextDocument(wml);
  assert.equal(wml.languageId, "gorak-wml");
  const position = (doc: vscode.TextDocument, needle: string) => {
    const offset = doc.getText().indexOf(needle);
    assert.ok(offset >= 0, `Upstream fixture marker: ${needle}`);
    return doc.positionAt(offset);
  };
  for (const [doc, needle, targetFile, targetMarker, name] of [
    [panel, "counter;", "shared/counter.w4gl", "counter", "counter"],
    [wml, "score(capsules", "example/score.w4gl", "score(capsules", "score"],
    [wml, "quantity = CALLPROC", "example/panel.wml", 'quantity"', "quantity"],
  ] as const) {
    const definitions = await vscode.commands.executeCommand<vscode.Location[]>(
      "vscode.executeDefinitionProvider",
      doc.uri,
      position(doc, needle),
    );
    assert.equal(definitions?.length, 1, `Definition: ${needle}`);
    const target = await open(targetFile);
    assert.equal(definitions![0].uri.fsPath, target.uri.fsPath);
    // Class declarations live in metadata: the class name comes from the filename.
    if (name !== "counter") {
      assert.deepEqual(
        definitions![0].range.start,
        position(target, targetMarker),
      );
      assert.equal(target.getText(definitions![0].range), name);
    } else {
      assert.deepEqual(
        definitions![0].range.start,
        position(target, "classsource"),
      );
      assert.equal(target.getText(definitions![0].range), "classsource");
    }
  }
  // VS Code's command may flatten DocumentSymbols into SymbolInformation.
  for (const [doc, name, start, end] of [
    [wml, "ON click", "on click =", "}]]>"],
    [panel, "INITIALIZE", "initialize =", "}"],
  ] as const) {
    const symbols = await vscode.commands.executeCommand<
      Array<vscode.DocumentSymbol | vscode.SymbolInformation>
    >("vscode.executeDocumentSymbolProvider", doc.uri);
    const symbol = symbols?.find((s) => s.name === name);
    assert.ok(symbol, `Outline includes ${name}: ${JSON.stringify(symbols)}`);
    const range = "location" in symbol ? symbol.location.range : symbol.range;
    if ("location" in symbol)
      assert.equal(symbol.location.uri.fsPath, doc.uri.fsPath);
    assert.deepEqual(range.start, position(doc, start));
    assert.deepEqual(range.end, position(doc, end).translate(0, 1));
    assert.equal(
      doc.getText(range),
      doc
        .getText()
        .slice(
          doc.offsetAt(position(doc, start)),
          doc.offsetAt(position(doc, end)) + 1,
        ),
    );
  }
  await vscode.commands.executeCommand("gorak.openFrameDesigner", wml.uri);
  assert.ok(
    vscode.window.tabGroups.all
      .flatMap((g) => g.tabs)
      .some(
        (t) =>
          t.input instanceof vscode.TabInputCustom &&
          t.input.viewType === "gorak.frameDesigner" &&
          t.input.uri.fsPath === wml.uri.fsPath,
      ),
  );
  await vscode.commands.executeCommand("gorak.openFrameSource", wml.uri);
  assert.equal(
    vscode.window.activeTextEditor?.document.uri.fsPath,
    wml.uri.fsPath,
  );
  assert.equal(
    vscode.window.activeTextEditor?.document.getText(),
    await fs.readFile(wml.uri.fsPath, "utf8"),
  );
  await fs.writeFile(
    path.join(process.env.GORAK_TEST_OUTPUT!, "result.json"),
    JSON.stringify({
      passed: true,
      phase: "compatibility",
      activation: true,
      definitions: 3,
      outline: 2,
      designerAndRawSource: true,
    }),
  );
}
