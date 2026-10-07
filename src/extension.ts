import * as vscode from "vscode";
import path from "node:path";
import { registerProjectLanguage } from "./project-language";
import { registerFrameEditor } from "./frame-editor";
import { access, constants } from "node:fs/promises";
import type { ServerOptions } from "vscode-languageclient/node";
import { IndexStatus, indexStatusText } from "./index-status";
import { diagnosticSummary } from "./diagnostics";
import { showFullLineReferences } from "./references";
import {
  LanguageClient,
  TransportKind,
  State,
} from "vscode-languageclient/node";

let client: LanguageClient | undefined;
async function detect(document: vscode.TextDocument) {
  if (
    document.uri.scheme !== "file" ||
    !vscode.workspace
      .getConfiguration("gorak", document.uri)
      .get("autoDetect", true)
  )
    return;
  const extension = path.extname(document.uri.fsPath).toLowerCase();
  if (![".w4gl", ".wml"].includes(extension)) return;
  const language = extension === ".wml" ? "gorak-wml" : "gorak-openroad";
  if (document.languageId === language) return;
  let directory = path.dirname(document.uri.fsPath);
  while (true) {
    try {
      await vscode.workspace.fs.stat(
        vscode.Uri.file(path.join(directory, "gorak.json")),
      );
      await vscode.languages.setTextDocumentLanguage(document, language);
      return;
    } catch {
      /* Try the enclosing project directory. */
    }
    const parent = path.dirname(directory);
    if (parent === directory) return;
    directory = parent;
  }
}
export async function activate(context: vscode.ExtensionContext) {
  registerProjectLanguage(context);
  registerFrameEditor(context);
  const output = vscode.window.createOutputChannel("gorak OpenROAD");
  context.subscriptions.push(output);
  let degraded = false;
  let showHealth = (_message: string) => {};
  const command = context.asAbsolutePath(
    `dist/gorak-lsp${process.platform === "win32" ? ".exe" : ""}`,
  );
  await access(command, constants.X_OK);
  const server: ServerOptions = { command, transport: TransportKind.stdio };
  output.appendLine("Starting gorak language server.");
  const presentStatus = indexStatusText;
  context.subscriptions.push(
    vscode.commands.registerCommand("gorak.copyDiagnostics", async () => {
      const cancellation = new vscode.CancellationTokenSource();
      const summary = await diagnosticSummary(
        {
          extensionVersion: context.extension.packageJSON.version,
          vscodeVersion: vscode.version,
          platform: process.platform,
          architecture: process.arch,
        },
        () =>
          client!.sendRequest<Record<string, unknown>>(
            "gorak/indexStatus",
            undefined,
            cancellation.token,
          ),
        () => cancellation.cancel(),
      );
      cancellation.dispose();
      await vscode.env.clipboard.writeText(JSON.stringify(summary, null, 2));
      void vscode.window.showInformationMessage(
        "gorak diagnostic summary copied. It contains no source or document paths.",
      );
    }),
  );
  const pattern = "**/{*.w4gl,*.wml,app.json,gorak.json}";
  const watchRoots = new Set<string>();
  for (const folder of vscode.workspace.workspaceFolders ?? []) {
    if (folder.uri.scheme !== "file") continue;
    let candidate = folder.uri.fsPath,
      project = candidate;
    while (true) {
      try {
        await vscode.workspace.fs.stat(
          vscode.Uri.file(path.join(candidate, "gorak.json")),
        );
        project = candidate;
        break;
      } catch {
        /* Walk to the gorak project, if any. */
      }
      const parent = path.dirname(candidate);
      if (parent === candidate) break;
      candidate = parent;
    }
    watchRoots.add(project);
  }
  const watcher = [
    vscode.workspace.createFileSystemWatcher(pattern),
    ...[...watchRoots].map((root) =>
      vscode.workspace.createFileSystemWatcher(
        new vscode.RelativePattern(vscode.Uri.file(root), pattern),
      ),
    ),
  ];
  context.subscriptions.push(...watcher);
  client = new LanguageClient("gorak", "gorak OpenROAD", server, {
    outputChannel: output,
    middleware: {
      provideCompletionItem: async (
        document,
        position,
        completionContext,
        token,
        next,
      ) => {
        const started = Date.now();
        const timer = setTimeout(() => {
          output.appendLine(
            `Completion pending for document version ${document.version} after ${Date.now() - started} ms.`,
          );
          degraded = true;
          showHealth(
            "Completion is taking longer than expected. See gorak output; Restart Language Server is available.",
          );
        }, 5000);
        try {
          const result = await next(
            document,
            position,
            completionContext,
            token,
          );
          if (!token.isCancellationRequested && result == null)
            output.appendLine(
              "Completion returned no result; inspect server request diagnostics if unexpected.",
            );
          return result;
        } catch (error) {
          output.appendLine(
            `Completion failed: ${error instanceof Error ? error.name : "unknown error"}.`,
          );
          degraded = true;
          showHealth("Completion failed. See gorak output.");
          throw error;
        } finally {
          clearTimeout(timer);
        }
      },
    },
    initializationOptions: {
      cacheDirectory: path.join(context.globalStorageUri.fsPath, "rust"),
      memoryBudgetMB: vscode.workspace
        .getConfiguration("gorak")
        .get("detailCacheMB", 32),
    },
    documentSelector: [
      { scheme: "file", language: "gorak-openroad" },
      { scheme: "file", language: "gorak-wml" },
      { scheme: "file", language: "json", pattern: "**/app.json" },
    ],
    synchronize: { fileEvents: watcher },
  });
  context.subscriptions.push(
    vscode.commands.registerCommand(
      "gorak.findReferences",
      showFullLineReferences,
    ),
  );
  context.subscriptions.push(
    vscode.commands.registerCommand("gorak.restartServer", async () => {
      // A hung server must not prevent the replacement from starting.
      try {
        await client?.stop(2000);
      } catch {
        output.appendLine("Server did not shut down in time; restarting.");
      }
      await client?.start();
    }),
  );
  context.subscriptions.push(
    vscode.workspace.onDidOpenTextDocument((document) => {
      void detect(document);
    }),
  );
  context.subscriptions.push(
    vscode.commands.registerCommand("gorak.rebuildIndex", async () => {
      await vscode.window.withProgress(
        {
          location: vscode.ProgressLocation.Notification,
          title: "Rebuilding gorak index",
        },
        async () => {
          await client!.sendRequest("gorak/rebuildIndex");
        },
      );
    }),
  );
  const status = vscode.window.createStatusBarItem(
    vscode.StatusBarAlignment.Left,
    20,
  );
  showHealth = (message) => {
    status.text = "$(warning) gorak: check output";
    status.tooltip = message;
  };
  context.subscriptions.push(
    client.onDidChangeState((event) => {
      output.appendLine(
        `Language server: ${State[event.oldState]} → ${State[event.newState]}`,
      );
      if (event.newState === State.Stopped) {
        degraded = true;
        showHealth(
          "Language server stopped. Run gorak: Restart Language Server.",
        );
      }
    }),
  );
  status.name = "gorak index";
  status.command = "gorak.showIndexStatus";
  status.text = `$(sync~spin) gorak: starting`;
  status.show();
  context.subscriptions.push(status);
  client.onNotification("gorak/indexStatus", (state: IndexStatus) => {
    if (degraded) return;
    const presentation = presentStatus(state);
    status.text = presentation.label;
    status.tooltip = presentation.detail;
  });
  context.subscriptions.push(
    vscode.commands.registerCommand("gorak.showIndexStatus", async () => {
      const state = await client!.sendRequest<IndexStatus>("gorak/indexStatus");
      void vscode.window.showInformationMessage(presentStatus(state).message);
    }),
  );
  context.subscriptions.push(
    vscode.commands.registerCommand("gorak.explainSymbol", async () => {
      const editor = vscode.window.activeTextEditor;
      if (!editor) return;
      const result = await client!.sendRequest<{
        status: string;
        issues: string[];
        candidates: { name: string }[];
      }>("gorak/resolve", {
        textDocument: { uri: editor.document.uri.toString() },
        position: editor.selection.active,
      });
      void vscode.window.showInformationMessage(
        `gorak: ${result.status}${result.candidates.length ? " — " + result.candidates.map((c) => c.name).join(", ") : ""}${result.issues.length ? " (" + result.issues.join(", ") + ")" : ""}`,
      );
    }),
  );
  context.subscriptions.push(
    vscode.commands.registerCommand("gorak.showDiagnostics", async () => {
      output.show(true);
      output.appendLine(
        "Collecting language-server health (no source text or document paths)...",
      );
      const timer = setTimeout(
        () =>
          output.appendLine(
            "Server has not answered after 5 seconds. Run gorak: Restart Language Server if it remains unresponsive.",
          ),
        5000,
      );
      try {
        output.appendLine(
          JSON.stringify(
            await client!.sendRequest("gorak/indexStatus"),
            null,
            2,
          ),
        );
      } catch {
        output.appendLine(
          "Could not retrieve server health. Run gorak: Restart Language Server.",
        );
      } finally {
        clearTimeout(timer);
      }
    }),
  );
  context.subscriptions.push(
    vscode.commands.registerCommand(
      "gorak.findClassReferences",
      async (source?: string, position?: vscode.Position) => {
        const uri = source
          ? vscode.Uri.parse(source)
          : vscode.window.activeTextEditor?.document.uri;
        if (!uri) return;
        if (!position) {
          const lenses = await vscode.commands.executeCommand<
            vscode.CodeLens[]
          >("vscode.executeCodeLensProvider", uri);
          position = lenses?.find(
            (l) => l.command?.command === "gorak.findClassReferences",
          )?.range.start;
        }
        if (!position) {
          void vscode.window.showInformationMessage(
            "Open a userclass source file to find its references.",
          );
          return;
        }
        const at = new vscode.Position(position.line, position.character);
        await vscode.window.withProgress(
          {
            location: vscode.ProgressLocation.Window,
            title: "Finding class references",
          },
          async () => {
            await showFullLineReferences(uri, at);
          },
        );
      },
    ),
  );
  context.subscriptions.push(
    vscode.workspace.registerTextDocumentContentProvider("gorak-builtin", {
      provideTextDocumentContent: async (uri) =>
        (await client!.sendRequest<string | null>("gorak/builtinSource", {
          uri: uri.toString(),
        })) ?? "Reference declaration unavailable.",
    }),
  );
  await client.start();
  let checking = false;
  const heartbeat = setInterval(async () => {
    if (checking || !client?.isRunning()) return;
    checking = true;
    const timer = setTimeout(() => {
      degraded = true;
      showHealth(
        "Server is not responding. Open gorak diagnostics or restart the language server.",
      );
      output.appendLine("Language-server health request exceeded 5 seconds.");
    }, 5000);
    try {
      const health = await client.sendRequest<IndexStatus>("gorak/indexStatus");
      if (health.failed) {
        degraded = true;
        showHealth("Workspace indexing failed. See gorak output.");
      } else if (degraded) {
        degraded = false;
        const presentation = presentStatus(health);
        status.text = presentation.label;
        status.tooltip = presentation.detail;
      }
    } catch {
      degraded = true;
      showHealth("Could not contact language server. See gorak output.");
    } finally {
      clearTimeout(timer);
      checking = false;
    }
  }, 15000);
  context.subscriptions.push({ dispose: () => clearInterval(heartbeat) });
  await Promise.all(vscode.workspace.textDocuments.map(detect));
  return {
    indexStatus: () =>
      client!.sendRequest<{
        indexing: boolean;
        files: number;
        applications: number;
      }>("gorak/indexStatus"),
  };
}
export async function deactivate() {
  await client?.stop();
  client = undefined;
}
