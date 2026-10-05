import * as vscode from "vscode";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import { FrameEditor, frameViewType } from "../src/frame-editor";
// Command completion and TextDocument updates cross separate extension-host RPCs.
// Subscribe before dispatch, issue the command once, and wait for the actual edit.
async function historyEdit(
  document: vscode.TextDocument,
  command: "undo" | "redo",
  expected: string,
) {
  const version = document.version;
  let versionAtCommandReturn: number | undefined;
  let reason: vscode.TextDocumentChangeReason | undefined;
  let subscription: vscode.Disposable | undefined;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const changed = new Promise<void>((resolve, reject) => {
    subscription = vscode.workspace.onDidChangeTextDocument((event) => {
      if (event.document !== document || !event.contentChanges.length) return;
      reason = event.reason;
      if (document.version > version && document.getText() === expected)
        resolve();
    });
    timer = setTimeout(
      () =>
        reject(
          new Error(
            `${command} did not produce the expected source: ${JSON.stringify({
              versionBefore: version,
              versionAtCommandReturn,
              currentVersion: document.version,
              reason,
              activeDocument:
                vscode.window.activeTextEditor?.document.uri.toString(),
              expectedDocument: document.uri.toString(),
              actual: document.getText(),
              expected,
            })}`,
          ),
        ),
      5000,
    );
  });
  try {
    await Promise.all([
      changed,
      vscode.commands.executeCommand(command).then(() => {
        versionAtCommandReturn = document.version;
      }),
    ]);
    assert.equal(
      reason,
      command === "undo"
        ? vscode.TextDocumentChangeReason.Undo
        : vscode.TextDocumentChangeReason.Redo,
    );
    assert.equal(
      document.getText(),
      expected,
      `${command} preserves the exact source`,
    );
    console.log(
      `Frame ${command}: ${JSON.stringify({ versionBefore: version, versionAtCommandReturn, versionAfter: document.version })}`,
    );
  } finally {
    clearTimeout(timer);
    subscription?.dispose();
  }
}

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
  await vscode.commands.executeCommand("gorak.openFrameSource", uri);
  assert.equal(
    vscode.window.activeTextEditor?.document.uri.toString(),
    uri.toString(),
  );
  const designerTabs = () =>
    vscode.window.tabGroups.all
      .flatMap((group) => group.tabs)
      .filter(
        (tab) =>
          tab.input instanceof vscode.TabInputCustom &&
          tab.input.viewType === frameViewType &&
          tab.input.uri.toString() === uri.toString(),
      );
  // Finish the resolver/source-switch check before attaching the fake transport.
  // A live webview can retain focus after showTextDocument: Windows traces showed
  // history commands handled by 'webview' despite activeTextEditor being the WML.
  // Close it explicitly so this bridge test has only one provider and no competing
  // webview command target. The designer UI suite covers real webview history.
  assert.equal(await vscode.window.tabGroups.close(designerTabs()), true);
  assert.equal(designerTabs().length, 0, "Resolver webview is closed");
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
  await vscode.window.showTextDocument(doc, { preserveFocus: false });
  assert.equal(vscode.window.activeTextEditor?.document, doc);
  await historyEdit(doc, "undo", original);
  await historyEdit(
    doc,
    "redo",
    original.slice(0, at) + "500" + original.slice(at + 3),
  );
  await doc.save();
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
