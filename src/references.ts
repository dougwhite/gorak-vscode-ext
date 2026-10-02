import * as vscode from "vscode";

interface ReferenceFile {
  uri: vscode.Uri;
  references: ReferenceRow[];
}
interface ReferenceRow {
  location: vscode.Location;
  parent: ReferenceFile;
}
type ReferenceNode = ReferenceFile | ReferenceRow;

/** Full source lines are presentation only: navigation keeps the symbol range. */
class ReferenceInput {
  readonly title = "Gorak References";
  readonly contextValue = "gorak-references";
  constructor(readonly location: vscode.Location) {}
  with(location: vscode.Location) {
    return new ReferenceInput(location);
  }
  async resolve() {
    const locations =
      (await vscode.commands.executeCommand<vscode.Location[]>(
        "vscode.executeReferenceProvider",
        this.location.uri,
        this.location.range.start,
      )) ?? [];
    const groups = new Map<string, ReferenceFile>();
    const seen = new Set<string>();
    for (const location of locations) {
      const key = location.uri.toString();
      const identity = `${key}:${JSON.stringify(location.range)}`;
      if (seen.has(identity)) continue;
      seen.add(identity);
      let file = groups.get(key);
      if (!file) {
        file = { uri: location.uri, references: [] };
        groups.set(key, file);
      }
      file.references.push({ location, parent: file });
    }
    const files = [...groups.values()].sort((a, b) =>
      a.uri.toString().localeCompare(b.uri.toString()),
    );
    for (const file of files)
      file.references.sort((a, b) =>
        a.location.range.start.compareTo(b.location.range.start),
      );
    const rows = files.flatMap((f) => f.references);
    const provider: vscode.TreeDataProvider<ReferenceNode> = {
      getChildren: (node) =>
        !node ? files : "references" in node ? node.references : [],
      getParent: (node) => ("parent" in node ? node.parent : undefined),
      getTreeItem: async (node) => {
        if ("references" in node) {
          const item = new vscode.TreeItem(
            node.uri,
            vscode.TreeItemCollapsibleState.Collapsed,
          );
          item.description = `${node.references.length} · ${vscode.workspace.asRelativePath(node.uri)}`;
          item.iconPath = vscode.ThemeIcon.File;
          return item;
        }
        const document = await vscode.workspace.openTextDocument(
          node.location.uri,
        );
        const range = node.location.range;
        const text = document.lineAt(range.start.line).text;
        const indent = text.length - text.trimStart().length;
        const label = text.slice(indent);
        const start = Math.max(0, range.start.character - indent);
        const end =
          range.end.line === range.start.line
            ? Math.min(label.length, range.end.character - indent)
            : label.length;
        const item = new vscode.TreeItem({
          label,
          highlights: end > start ? [[start, end]] : [],
        });
        item.description = `line ${range.start.line + 1}`;
        item.tooltip = new vscode.MarkdownString().appendCodeblock(
          text,
          document.languageId,
        );
        item.command = {
          command: "vscode.open",
          title: "Open Reference",
          arguments: [node.location.uri, { selection: range, preview: true }],
        };
        return item;
      },
    };
    return {
      provider,
      message: `${rows.length} references in ${files.length} files`,
      navigation: {
        location: (node: ReferenceNode) =>
          "location" in node ? node.location : node.references[0]?.location,
        nearest: (uri: vscode.Uri, position: vscode.Position) =>
          rows.find(
            (r) =>
              r.location.uri.toString() === uri.toString() &&
              r.location.range.contains(position),
          ) ??
          rows.find((r) => r.location.uri.toString() === uri.toString()) ??
          rows[0],
        next: (node: ReferenceNode) =>
          rows[(rows.indexOf(node as ReferenceRow) + 1) % rows.length],
        previous: (node: ReferenceNode) =>
          rows[
            (rows.indexOf(node as ReferenceRow) + rows.length - 1) % rows.length
          ],
      },
    };
  }
}

export async function showFullLineReferences(
  uri?: vscode.Uri,
  position?: vscode.Position,
) {
  const editor = vscode.window.activeTextEditor;
  uri ??= editor?.document.uri;
  position ??= editor?.selection.active;
  if (!uri || !position) return;
  const extension = vscode.extensions.getExtension<{
    setInput(input: ReferenceInput): void;
  }>("vscode.references-view");
  if (!extension) {
    void vscode.window.showErrorMessage(
      "Enable VS Code's built-in References View extension to show full-line references.",
    );
    return;
  }
  const api = await extension.activate();
  api.setInput(new ReferenceInput(new vscode.Location(uri, position)));
}
