import { createRequire } from "node:module";
import * as vscode from "vscode";
import { randomBytes } from "node:crypto";
import { validateIntent } from "./frame-protocol";
export const frameViewType = "gorak.frameDesigner";
const enabled = (uri: vscode.Uri) =>
  vscode.workspace
    .getConfiguration("gorak", uri)
    .get("frameDesigner.enabled", true);

export function registerFrameEditor(context: vscode.ExtensionContext) {
  const provider = new FrameEditor(context);
  context.subscriptions.push(
    vscode.window.registerCustomEditorProvider(frameViewType, provider, {
      supportsMultipleEditorsPerDocument: true,
      webviewOptions: { retainContextWhenHidden: true },
    }),
    vscode.commands.registerCommand(
      "gorak.openFrameSource",
      async (uri?: vscode.Uri) => {
        uri ??= provider.activeUri;
        if (uri)
          await vscode.commands.executeCommand(
            "vscode.openWith",
            uri,
            "default",
          );
      },
    ),
    vscode.commands.registerCommand(
      "gorak.openFrameCode",
      async (uri?: vscode.Uri) => {
        uri ??=
          provider.activeUri ?? vscode.window.activeTextEditor?.document.uri;
        if (!uri) return;
        const companion = uri.with({
          path: uri.path.replace(/\.wml$/i, ".w4gl"),
        });
        try {
          await vscode.workspace.fs.stat(companion);
        } catch {
          void vscode.window.showInformationMessage(
            "This frame has no matching W4GL source file.",
          );
          return;
        }
        await vscode.commands.executeCommand(
          "vscode.openWith",
          companion,
          "default",
        );
      },
    ),
    vscode.commands.registerCommand(
      "gorak.openFrameDesigner",
      async (uri?: vscode.Uri, options?: vscode.TextDocumentShowOptions) => {
        uri ??= vscode.window.activeTextEditor?.document.uri;
        if (!uri || !/\.(wml|w4gl)$/i.test(uri.path)) return;
        uri = uri.with({ path: uri.path.replace(/\.w4gl$/i, ".wml") });
        try {
          await vscode.workspace.fs.stat(uri);
        } catch {
          void vscode.window.showInformationMessage(
            "This component has no matching frame layout.",
          );
          return;
        }
        await vscode.commands.executeCommand(
          "vscode.openWith",
          uri,
          enabled(uri) ? frameViewType : "default",
          options,
        );
      },
    ),
  );
}
export class FrameEditor implements vscode.CustomTextEditorProvider {
  activeUri?: vscode.Uri;
  private activePanel?: vscode.WebviewPanel;
  constructor(private context: vscode.ExtensionContext) {}
  async resolveCustomTextEditor(
    document: vscode.TextDocument,
    panel: vscode.WebviewPanel,
  ) {
    const { loadImages } = createRequire(
      vscode.Uri.joinPath(this.context.extensionUri, "package.json").fsPath,
    )(
      "./dist/image-assets/electron/image-assets.cjs",
    ) as typeof import("gorak-frame-designer/image-assets");
    if (panel.active) {
      this.activeUri = document.uri;
      this.activePanel = panel;
    }
    if (!enabled(document.uri)) {
      setTimeout(() => {
        void vscode.commands.executeCommand(
          "vscode.openWith",
          document.uri,
          "default",
          panel.viewColumn,
        );
        panel.dispose();
      }, 0);
      return;
    }
    let metadata: vscode.TextDocument | undefined;
    let lastEdited = document;
    let disposed = false;
    let applyingEdit = false;
    let queue = Promise.resolve();
    const disposables: vscode.Disposable[] = [];
    const media = vscode.Uri.joinPath(this.context.extensionUri, "dist");
    panel.webview.options = {
      enableScripts: true,
      localResourceRoots: [media],
    };
    const nonce = randomBytes(24).toString("hex");
    const script = panel.webview.asWebviewUri(
      vscode.Uri.joinPath(media, "frame-webview.js"),
    );
    panel.webview.html = `<!DOCTYPE html><html><head><meta charset="UTF-8"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'nonce-${nonce}'; style-src 'unsafe-inline'; img-src data:; font-src ${panel.webview.cspSource};"><style>
html,body{height:100%;margin:0;background:#202733;color:#dce3ee;font:12px Arial,sans-serif}body{display:flex;flex-direction:column}
.menubar{height:27px;flex:none;display:flex;align-items:center;border-bottom:1px solid #536078;background:#293341;padding:0 5px;z-index:10}
.menubar details{position:relative}.menubar summary{cursor:pointer;list-style:none;padding:5px 12px;user-select:none}.menubar summary::-webkit-details-marker{display:none}
.menubar summary:hover,.menubar details[open] summary,.menubar button:hover:not(:disabled),.menubar button:focus-visible{background:#45566e}
.menubar [role=menu]{position:absolute;top:100%;left:0;min-width:180px;background:#293341;box-shadow:0 3px 10px #0006;padding:2px 0}
.menubar button{display:flex;justify-content:space-between;gap:24px;width:100%;padding:7px 12px;text-align:left;border:0;background:transparent;color:inherit;font:inherit;white-space:nowrap;cursor:pointer}
.menubar button:disabled{color:#8996aa;cursor:default}.menubar kbd{font:inherit;color:#a9b4c6}.menubar :focus-visible{outline:1px solid #9fcaff;outline-offset:-1px}
#status{margin-left:auto;padding:0 8px;color:#a9b4c6;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
#error{color:var(--vscode-errorForeground);padding:0 8px;white-space:pre-wrap}#error:empty{display:none}
gorak-frame-designer{display:block;flex:1;min-height:0}
</style></head><body><nav class="menubar" aria-label="Frame viewer"><span id="status" role="status"></span></nav><div id="error" role="alert"></div><script nonce="${nonce}" src="${script}"></script></body></html>`;
    const report = (error: unknown) =>
      panel.webview.postMessage({
        type: "error",
        message: error instanceof Error ? error.message : String(error),
      });
    const optionalDocument = async (uri: vscode.Uri) => {
      try {
        await vscode.workspace.fs.stat(uri);
        return await vscode.workspace.openTextDocument(uri);
      } catch (error) {
        if (
          error instanceof vscode.FileSystemError &&
          error.code === "FileNotFound"
        )
          return;
        throw error;
      }
    };
    const companion = document.uri.with({
      path: document.uri.path.replace(/\.wml$/i, ".w4gl"),
    });
    const layers: { origin: string; defaults: object }[] = [];
    const load = async () => {
      metadata = await optionalDocument(companion);
      for (const [origin, uri] of [
        [
          "Repository",
          vscode.Uri.joinPath(document.uri, "..", "..", "field_defaults.json"),
        ],
        [
          "Application",
          vscode.Uri.joinPath(document.uri, "..", "field_defaults.json"),
        ],
        [
          "Frame",
          document.uri.with({
            path: document.uri.path.replace(/\.wml$/i, ".fielddefaults.json"),
          }),
        ],
      ] as const) {
        const layer = await optionalDocument(uri);
        if (!layer) continue;
        if (layer.getText().length > 8_000_000)
          throw Error("Stylesheet exceeds 8 MB");
        const defaults = JSON.parse(layer.getText());
        if (
          !defaults ||
          typeof defaults !== "object" ||
          Array.isArray(defaults)
        )
          throw Error("Invalid stylesheet");
        if (
          ["field_styles", "common_model_container", "structure"].some(
            (key) => key in defaults,
          )
        )
          throw Error(
            "Retired stylesheet format; re-export with current gorak.",
          );
        layers.push({ origin, defaults });
      }
    };
    const loaded = load();
    // Attach a rejection handler immediately, including if the webview is closed before ready.
    void loaded.catch(report);
    const update = async () => {
      await loaded;
      if (!disposed)
        await panel.webview.postMessage({
          type: "state",
          uri: document.uri.toString(),
          version: document.version,
          text: document.getText(),
          dirty: document.isDirty,
          layers,
          metadata: metadata && {
            uri: metadata.uri.toString(),
            version: metadata.version,
            text: metadata.getText(),
            dirty: metadata.isDirty,
          },
        });
    };
    disposables.push(
      vscode.workspace.onDidChangeTextDocument((event) => {
        if (
          !applyingEdit &&
          (event.document === document || event.document === metadata)
        )
          void update().catch(report);
      }),
      vscode.workspace.onDidSaveTextDocument((doc) => {
        if (doc === document || doc === metadata) void update().catch(report);
      }),
      panel.onDidChangeViewState(() => {
        if (panel.active) {
          this.activeUri = document.uri;
          this.activePanel = panel;
        } else if (this.activePanel === panel) {
          this.activeUri = undefined;
          this.activePanel = undefined;
        }
      }),
      vscode.workspace.onDidChangeConfiguration((event) => {
        if (
          event.affectsConfiguration(
            "gorak.frameDesigner.enabled",
            document.uri,
          ) &&
          !enabled(document.uri)
        ) {
          void vscode.commands
            .executeCommand(
              "vscode.openWith",
              document.uri,
              "default",
              panel.viewColumn,
            )
            .then(() => panel.dispose());
        }
      }),
      panel.webview.onDidReceiveMessage((message) => {
        queue = queue
          .then(async () => {
            if (disposed) return;
            // This release always uses viewer mode. Do not trust webview state
            // to authorize writes, saves or document history commands.
            if (["edit", "save", "undo", "redo"].includes(message.type))
              throw Error(
                "The frame viewer is read only. Use Raw WML to edit source.",
              );
            if (message.type === "source") {
              const editor = await vscode.window.showTextDocument(document, {
                viewColumn: panel.viewColumn,
                preview: false,
              });
              const location = message.location;
              if (
                location?.uri === document.uri.toString() &&
                location.version === document.version &&
                Number.isInteger(location.range?.start) &&
                Number.isInteger(location.range?.end)
              ) {
                editor.selection = new vscode.Selection(
                  document.positionAt(location.range.start),
                  document.positionAt(location.range.end),
                );
                editor.revealRange(editor.selection);
              }
              return;
            }
            if (message.type === "images") {
              if (
                message.uri !== document.uri.toString() ||
                message.version !== document.version
              )
                return;
              let images = {},
                imageError = "";
              try {
                const assets = await loadImages(
                  vscode.Uri.joinPath(document.uri, "..").fsPath,
                  message.references,
                );
                images = Object.fromEntries(
                  Object.entries(assets).map(([key, asset]) => [
                    key,
                    {
                      ...asset,
                      png: Array.from(asset.png),
                      transparent: asset.transparent
                        ? Array.from(asset.transparent)
                        : undefined,
                    },
                  ]),
                );
              } catch (error) {
                imageError =
                  error instanceof Error ? error.message : String(error);
              }
              if (!disposed && message.version === document.version)
                await panel.webview.postMessage({
                  type: "images",
                  uri: message.uri,
                  version: message.version,
                  images,
                  imageError,
                });
              return;
            }
            if (message.type === "code") {
              await vscode.commands.executeCommand(
                "gorak.openFrameCode",
                document.uri,
              );
              return;
            }
            if (message.type === "field-action") {
              const action = message.action;
              const range = message.range;
              if (
                message.uri !== document.uri.toString() ||
                message.version !== document.version ||
                !["references", "definition"].includes(action) ||
                !Number.isInteger(range?.start) ||
                !Number.isInteger(range?.end) ||
                range.start < 0 ||
                range.end <= range.start ||
                range.end > document.getText().length
              )
                throw Error(
                  "The frame changed. Select the field again before navigating.",
                );
              const position = document.positionAt(range.start);
              const result = await vscode.commands.executeCommand<
                (vscode.Location | vscode.LocationLink)[]
              >(
                action === "references"
                  ? "vscode.executeReferenceProvider"
                  : "vscode.executeDefinitionProvider",
                document.uri,
                position,
              );
              if (disposed || message.version !== document.version) return;
              const locations = (result ?? []).map((item) =>
                "targetUri" in item
                  ? new vscode.Location(
                      item.targetUri,
                      item.targetSelectionRange ?? item.targetRange,
                    )
                  : item,
              );
              if (!locations.length) {
                void vscode.window.showInformationMessage(
                  action === "references"
                    ? "No references found for this field."
                    : "No definition found for this field.",
                );
                return;
              }
              if (action === "references") {
                const editor = await vscode.window.showTextDocument(document, {
                  viewColumn: panel.viewColumn,
                  preview: true,
                });
                editor.selection = new vscode.Selection(position, position);
                await vscode.commands.executeCommand(
                  "references-view.findReferences",
                );
              } else if (locations.length === 1) {
                const location = locations[0];
                const editor = await vscode.window.showTextDocument(
                  location.uri,
                  { viewColumn: panel.viewColumn, preview: true },
                );
                editor.selection = new vscode.Selection(
                  location.range.start,
                  location.range.end,
                );
                editor.revealRange(location.range);
              } else
                await vscode.commands.executeCommand(
                  "editor.action.showReferences",
                  document.uri,
                  position,
                  locations,
                );
              return;
            }
            await loaded;
            if (message.type === "ready") return update();
            if (message.type === "edit") {
              const target =
                message.intent?.uri === document.uri.toString()
                  ? document
                  : message.intent?.uri === metadata?.uri.toString()
                    ? metadata
                    : undefined;
              if (!target)
                throw Error("Designer edit targets an unopened document.");
              const intent = validateIntent(
                message.intent,
                target.uri.toString(),
                target.version,
                target.getText(),
              );
              const edit = new vscode.WorkspaceEdit();
              for (const change of intent.edits)
                edit.replace(
                  target.uri,
                  new vscode.Range(
                    target.positionAt(change.start),
                    target.positionAt(change.end),
                  ),
                  change.text,
                );
              applyingEdit = true;
              try {
                if (!(await vscode.workspace.applyEdit(edit)))
                  throw Error("VS Code could not apply the frame edit.");
                lastEdited = target;
                if (
                  target === metadata &&
                  !vscode.window.tabGroups.all
                    .flatMap((group) => group.tabs)
                    .some(
                      (tab) =>
                        tab.input instanceof vscode.TabInputText &&
                        tab.input.uri.toString() === target.uri.toString(),
                    )
                ) {
                  await vscode.window.showTextDocument(target, {
                    viewColumn: panel.viewColumn,
                    preserveFocus: true,
                    preview: false,
                  });
                  panel.reveal(panel.viewColumn, true);
                }
              } finally {
                applyingEdit = false;
              }
              return update();
            }
            if (message.type === "save") {
              if (metadata?.isDirty && !(await metadata.save()))
                throw Error("Companion save failed or was cancelled.");
              if (!(await document.save()))
                throw Error("WML save failed or was cancelled.");
              return update();
            }
            if (message.type === "undo" || message.type === "redo") {
              // VS Code routes undo/redo directly to the active custom text editor.
              // Opening the WML text editor here would leave an unwanted source tab.
              if (lastEdited === document) {
                panel.reveal(panel.viewColumn);
                await vscode.commands.executeCommand(message.type);
                return;
              }
              // Companion metadata has its own native document history and source tab.
              const editor = await vscode.window.showTextDocument(lastEdited, {
                viewColumn: panel.viewColumn,
                preserveFocus: false,
              });
              await vscode.commands.executeCommand(message.type);
              panel.reveal(editor.viewColumn);
            }
          })
          .catch(async (error) => {
            await update().catch(() => {});
            await report(error);
          });
      }),
    );
    panel.onDidDispose(() => {
      disposed = true;
      if (this.activePanel === panel) {
        this.activeUri = undefined;
        this.activePanel = undefined;
      }
      disposables.forEach((item) => item.dispose());
    });
  }
}
