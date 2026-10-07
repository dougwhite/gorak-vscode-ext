import * as vscode from "vscode";
import path from "node:path";

const setting = "gorak.projectFileIcon.enabled";
const isProject = (document: vscode.TextDocument) =>
  document.uri.scheme === "file" &&
  path.basename(document.uri.fsPath).toLowerCase() === "gorak.json";

function hasExplicitAssociation(document: vscode.TextDocument): boolean {
  const associations = vscode.workspace
    .getConfiguration("files", document.uri)
    .get<Record<string, unknown>>("associations", {});
  // VS Code matches associations case-insensitively, on the basename unless
  // the pattern contains '/'. Reuse its glob matcher, including braces/ranges.
  const normalized = {
    ...document,
    languageId: document.languageId,
    uri: document.uri.with({ path: document.uri.path.toLowerCase() }),
  };
  return Object.entries(associations).some(([pattern, language]) => {
    if (typeof language !== "string") return false;
    const glob = pattern.toLowerCase();
    return (
      vscode.languages.match(
        { pattern: glob.includes("/") ? glob : `**/${glob}` },
        normalized,
      ) > 0
    );
  });
}

export function registerProjectLanguage(context: vscode.ExtensionContext) {
  // Language changes close/reopen the document. Queue reconciliation and read
  // fresh documents/settings each time rather than retaining a closed instance.
  let pending = Promise.resolve();
  let disposed = false;
  const reconcile = () => {
    pending = pending
      .then(async () => {
        if (disposed) return;
        for (const document of vscode.workspace.textDocuments) {
          if (
            document.isClosed ||
            !isProject(document) ||
            !["json", "gorak-project"].includes(document.languageId) ||
            hasExplicitAssociation(document)
          )
            continue;
          const language = vscode.workspace
            .getConfiguration(undefined, document.uri)
            .get<boolean>(setting, true)
            ? "gorak-project"
            : "json";
          if (document.languageId !== language) {
            await vscode.languages.setTextDocumentLanguage(document, language);
          }
        }
      })
      .catch((error) =>
        console.error("gorak project language selection failed", error),
      );
  };
  context.subscriptions.push(
    new vscode.Disposable(() => {
      disposed = true;
    }),
    vscode.workspace.onDidOpenTextDocument((document) => {
      if (isProject(document)) reconcile();
    }),
    vscode.workspace.onDidChangeConfiguration((event) => {
      if (
        event.affectsConfiguration(setting) ||
        event.affectsConfiguration("files.associations")
      )
        reconcile();
    }),
  );
  reconcile();
}
