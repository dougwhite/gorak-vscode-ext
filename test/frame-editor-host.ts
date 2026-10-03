import * as vscode from "vscode";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import { FrameEditor, frameViewType } from "../src/frame-editor";
export async function testFrameEditor(extension: vscode.Extension<any>) {
  const folder = path.join(process.env.GORAK_TEST_OUTPUT!, "frame-test");
  await fs.mkdir(folder, { recursive: true });
  const uri = vscode.Uri.file(path.join(folder, "sample.wml"));
  const original =
    '<frame><!-- 😀 preserved -->\r\n<topform width="6500" height="4000"><entryfield name="caption" xleft="250" ytop="250" width="1200" height="350"/></topform></frame>\r\n';
  const companion = uri.with({ path: uri.path.replace(/\.wml$/, ".w4gl") });
  const metadata =
    '[framesource]\r\nwindowwidth = "6500"\r\nwindowheight = "4000"\r\n\r\n===\r\n// opaque script 😀\r\n';
  await fs.writeFile(uri.fsPath, original);
  await fs.writeFile(companion.fsPath, metadata);
  const doc = await vscode.workspace.openTextDocument(uri);
  // Exercise the real VS Code resolver, not merely the manifest.
  await vscode.commands.executeCommand("vscode.open", uri);
  const deadline = Date.now() + 10000;
  while (
    !vscode.window.tabGroups.all
      .flatMap((g) => g.tabs)
      .some(
        (t) =>
          t.input instanceof vscode.TabInputCustom &&
          t.input.viewType === frameViewType &&
          t.input.uri.toString() === uri.toString(),
      )
  ) {
    assert.ok(Date.now() < deadline, "WML defaults to the designer");
    await new Promise((r) => setTimeout(r, 50));
  }
  // Run the host bridge against real TextDocuments and a controllable webview transport.
  const messages: any[] = [];
  const receiver = new vscode.EventEmitter<any>();
  const disposed = new vscode.EventEmitter<void>();
  const viewState = new vscode.EventEmitter<any>();
  const panel = {
    webview: {
      options: {},
      html: "",
      cspSource: "test:",
      asWebviewUri: (uri: vscode.Uri) => uri,
      postMessage: async (message: any) => {
        messages.push(message);
        return true;
      },
      onDidReceiveMessage: receiver.event,
    },
    onDidDispose: disposed.event,
    onDidChangeViewState: viewState.event,
    active: true,
    viewColumn: vscode.ViewColumn.One,
    reveal() {},
    dispose() {
      disposed.fire();
    },
  } as unknown as vscode.WebviewPanel;
  const provider = new FrameEditor({
    extensionUri: extension.extensionUri,
  } as vscode.ExtensionContext);
  await provider.resolveCustomTextEditor(doc, panel);
  const send = async (message: any, predicate: (m: any) => boolean) => {
    const start = messages.length;
    receiver.fire(message);
    const deadline = Date.now() + 5000;
    while (!messages.slice(start).some(predicate)) {
      assert.ok(
        Date.now() < deadline,
        `Frame response: ${JSON.stringify(message)}; ${JSON.stringify(messages.slice(start))}`,
      );
      await new Promise((r) => setTimeout(r, 20));
    }
    return messages.slice(start).find(predicate);
  };
  await send({ type: "ready" }, (m) => m.type === "state");
  const at = original.indexOf("250");
  const intent = {
    uri: uri.toString(),
    version: doc.version,
    edits: [{ start: at, end: at + 3, expected: "250", text: "500" }],
  };
  await send({ type: "edit", intent }, (m) => m.type === "state" && m.dirty);
  assert.equal(doc.isDirty, true);
  assert.equal(
    await fs.readFile(uri.fsPath, "utf8"),
    original,
    "Designer edits do not write to disk",
  );
  assert.equal(
    doc.getText(),
    original.slice(0, at) + "500" + original.slice(at + 3),
  );
  await send({ type: "edit", intent }, (m) => m.type === "error");
  const companionDoc = await vscode.workspace.openTextDocument(companion);
  const offset = metadata.indexOf("6500");
  await send(
    {
      type: "edit",
      intent: {
        uri: companion.toString(),
        version: companionDoc.version,
        edits: [
          { start: offset, end: offset + 4, expected: "6500", text: "7000" },
        ],
      },
    },
    (m) => m.type === "state" && m.metadata.dirty,
  );
  assert.equal(await fs.readFile(companion.fsPath, "utf8"), metadata);
  await send(
    { type: "save" },
    (m) => m.type === "state" && !m.dirty && !m.metadata.dirty,
  );
  assert.equal(await fs.readFile(uri.fsPath, "utf8"), doc.getText());
  assert.equal(
    await fs.readFile(companion.fsPath, "utf8"),
    companionDoc.getText(),
  );
  await vscode.window.showTextDocument(doc);
  await vscode.commands.executeCommand("undo");
  assert.equal(
    doc.getText(),
    original,
    "Native undo restores the exact source",
  );
  await vscode.commands.executeCommand("redo");
  assert.ok(doc.getText().includes('xleft="500"'));
  await doc.save();
  await vscode.commands.executeCommand("gorak.openFrameSource", uri);
  assert.equal(
    vscode.window.activeTextEditor?.document.uri.toString(),
    uri.toString(),
  );
  await vscode.workspace
    .getConfiguration("gorak")
    .update("frameDesigner.enabled", false, vscode.ConfigurationTarget.Global);
  await vscode.commands.executeCommand("workbench.action.closeAllEditors");
  await vscode.commands.executeCommand("vscode.open", uri);
  const disabledDeadline = Date.now() + 5000;
  while (
    vscode.window.activeTextEditor?.document.uri.toString() !== uri.toString()
  ) {
    assert.ok(Date.now() < disabledDeadline, "Disabled designer opens raw WML");
    await new Promise((r) => setTimeout(r, 30));
  }
  await vscode.workspace
    .getConfiguration("gorak")
    .update(
      "frameDesigner.enabled",
      undefined,
      vscode.ConfigurationTarget.Global,
    );
  disposed.fire();
  receiver.dispose();
  disposed.dispose();
  viewState.dispose();
}
