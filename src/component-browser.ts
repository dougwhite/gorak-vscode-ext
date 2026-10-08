import * as vscode from "vscode";
import { randomBytes } from "node:crypto";
import {
  type Catalogue,
  type Component,
  componentTypes,
  componentTarget,
  findComponents,
  applicationLabels,
} from "./component-catalogue";

export function registerComponentBrowser(
  context: vscode.ExtensionContext,
  request: () => Promise<Catalogue>,
) {
  let view: vscode.WebviewView | undefined;
  let catalogue: Catalogue = { components: [], indexing: false, failures: 0 };
  let loading: Promise<void> | undefined;
  let refreshAgain = false;
  let disposed = false;
  let focusWhenReady = false;
  let ready = false;
  const publish = () =>
    view?.webview.postMessage({ type: "catalogue", ...catalogue });
  const refresh = async () => {
    if (loading) {
      refreshAgain = true;
      return loading;
    }
    loading = (async () => {
      let retries = 1;
      try {
        do {
          refreshAgain = false;
          await view?.webview.postMessage({ type: "loading" });
          try {
            const result = await request();
            if (disposed) return;
            catalogue = result;
            await publish();
          } catch (error) {
            const code = (error as { code?: number })?.code;
            if ((code === -32801 || code === -32800) && retries-- > 0)
              refreshAgain = true;
            else if (!disposed)
              await view?.webview.postMessage({
                type: "error",
                message:
                  "Could not load components. Check the language server, then refresh.",
              });
          }
        } while (refreshAgain && !disposed);
      } finally {
        loading = undefined;
      }
    })();
    return loading;
  };
  const stylesheet = (item: Component) =>
    vscode.Uri.parse(item.sourceUri).with({
      path: vscode.Uri.parse(item.sourceUri).path.replace(
        /\.(w4gl|wml)$/i,
        ".fielddefaults.json",
      ),
    });
  const open = async (id: string, action = "default") => {
    const item = catalogue.components.find((candidate) => candidate.id === id);
    if (!item) return;
    try {
      const target =
        action === "source"
          ? { uri: item.sourceUri, designer: false }
          : action === "stylesheet" && componentTarget(item).designer
            ? { uri: stylesheet(item).toString(), designer: false }
            : componentTarget(item);
      if (action === "stylesheet")
        await vscode.workspace.fs.stat(vscode.Uri.parse(target.uri));
      await vscode.commands.executeCommand(
        target.designer ? "gorak.openFrameDesigner" : "vscode.openWith",
        vscode.Uri.parse(target.uri),
        ...(target.designer ? [] : ["default"]),
      );
    } catch {
      void vscode.window.showErrorMessage(
        "Could not open this component. Refresh the component list and try again.",
      );
    }
  };
  const provider: vscode.WebviewViewProvider = {
    resolveWebviewView(next) {
      view = next;
      ready = false;
      const media = vscode.Uri.joinPath(context.extensionUri, "dist");
      const icons = vscode.Uri.joinPath(
        context.extensionUri,
        "icons",
        "components",
      );
      next.webview.options = {
        enableScripts: true,
        localResourceRoots: [media, icons],
      };
      const nonce = randomBytes(24).toString("hex");
      const script = next.webview.asWebviewUri(
        vscode.Uri.joinPath(media, "component-webview.js"),
      );
      const iconBase = next.webview.asWebviewUri(icons);
      next.webview.html = `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'nonce-${nonce}'; style-src 'unsafe-inline'; img-src ${next.webview.cspSource};"><style>
body{margin:0;padding:8px;box-sizing:border-box;height:100vh;display:flex;flex-direction:column;color:var(--vscode-foreground);background:var(--vscode-sideBar-background);font:var(--vscode-font-size) var(--vscode-font-family)}
.controls{display:flex;flex:none;gap:5px;margin-bottom:6px;align-items:center}select,input{box-sizing:border-box;width:100%;min-width:0;color:var(--vscode-input-foreground);background:var(--vscode-input-background);border:1px solid var(--vscode-input-border,transparent);padding:5px;font:inherit}button{font:inherit;color:inherit;background:transparent;border:0;cursor:pointer}button:focus-visible,input:focus,select:focus{outline:1px solid var(--vscode-focusBorder)}#heading{flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}#gear{padding:3px 8px;font-size:19px}#types{padding:5px 0;max-height:40vh;overflow:auto;flex:none}#types label{display:flex;align-items:center;gap:5px;margin:5px 0}#types input{width:auto}#status{font-size:11px;color:var(--vscode-descriptionForeground);padding:8px 0}#listing{overflow:auto;flex:1;min-height:0}#results{padding:0;margin:0;list-style:none}#back{width:24px;height:24px;display:inline-flex;align-items:center;justify-content:center;padding:4px}#sorting,.row{display:grid;grid-template-columns:minmax(0,1fr) minmax(72px,32%);gap:6px}body[data-mode="global"] #sorting,body[data-mode="global"] .row{grid-template-columns:minmax(0,1fr) minmax(65px,27%) minmax(80px,29%)}body[data-mode="applications"] .row{grid-template-columns:minmax(0,1fr)}#sorting{position:sticky;top:0;z-index:1;background:var(--vscode-sideBar-background);margin-top:5px;padding:0 2px;border-bottom:1px solid var(--vscode-panel-border)}#sorting button{font-size:11px;overflow:hidden;white-space:nowrap;min-width:0;display:flex;align-items:center;gap:4px;text-align:left;width:100%;padding:5px 0;color:var(--vscode-descriptionForeground)}#sorting span{font-size:9px}#results li{content-visibility:auto;contain-intrinsic-size:auto 28px}.row{width:100%;align-items:center;text-align:left;min-height:28px;padding:3px 2px}.row:hover,.row:focus{background:var(--vscode-list-hoverBackground)}.row img{width:16px;height:16px;flex:none}.name{display:flex;align-items:center;gap:6px;min-width:0}.name-text{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.type,.app{color:var(--vscode-descriptionForeground);font-size:11px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;min-width:0}#global{color:var(--vscode-textLink-foreground);padding:9px 0;text-align:left;flex:none}#menu{position:fixed;z-index:5;background:var(--vscode-menu-background,var(--vscode-editor-background));border:1px solid var(--vscode-menu-border,var(--vscode-focusBorder));padding:4px;box-shadow:0 2px 8px #0005;max-width:95vw}#menu button{display:block;padding:6px 12px;width:100%;text-align:left}#menu button:hover,#menu button:focus{background:var(--vscode-list-hoverBackground)}[hidden]{display:none!important}
</style></head><body data-icons="${iconBase}"><div class="controls"><button id="back" aria-label="Back to applications" title="Back to applications" hidden><svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true" focusable="false"><path fill="currentColor" d="M7.7 2.3 2 8l5.7 5.7.7-.7L4 8.5h10v-1H4l4.4-4.4z"/></svg></button><strong id="heading">Applications</strong><button id="gear" title="Filter component types" aria-label="Filter component types" aria-expanded="false">⚙</button></div><input id="search" type="search" placeholder="Find application" aria-label="Search" autocomplete="off"><div id="types" hidden></div><div id="status" role="status" aria-live="polite"></div><div id="listing"><div id="sorting" role="row" hidden><div role="columnheader"><button data-sort="name">Name<span aria-hidden="true"></span></button></div><div role="columnheader"><button data-sort="type">Type<span aria-hidden="true"></span></button></div><div role="columnheader"><button data-sort="application">Application<span aria-hidden="true"></span></button></div></div><ul id="results" aria-label="Applications"></ul><button id="global" hidden>Find in all applications</button></div><div id="menu" role="menu" hidden></div><script nonce="${nonce}" src="${script}"></script></body></html>`;
      context.subscriptions.push(
        next.webview.onDidReceiveMessage(async (message) => {
          if (message.type === "ready") {
            ready = true;
            if (focusWhenReady) {
              focusWhenReady = false;
              await next.webview.postMessage({ type: "focus", all: true });
            }
            await refresh();
          } else if (message.type === "open" && typeof message.id === "string")
            await open(
              message.id,
              ["source", "stylesheet"].includes(message.action)
                ? message.action
                : "default",
            );
          else if (
            message.type === "context" &&
            typeof message.id === "string"
          ) {
            const item = catalogue.components.find(
              (candidate) => candidate.id === message.id,
            );
            if (!item || !componentTarget(item).designer) return;
            let hasStylesheet = false;
            try {
              await vscode.workspace.fs.stat(stylesheet(item));
              hasStylesheet = true;
            } catch {}
            await next.webview.postMessage({
              type: "context",
              id: item.id,
              request: message.request,
              stylesheet: hasStylesheet,
            });
          }
        }),
        next.onDidChangeVisibility(() => {
          if (next.visible) void refresh();
        }),
      );
      next.onDidDispose(() => {
        if (view === next) view = undefined;
      });
    },
  };
  context.subscriptions.push(
    vscode.window.registerWebviewViewProvider("gorak.components", provider),
    vscode.commands.registerCommand("gorak.refreshComponents", refresh),
    vscode.commands.registerCommand("gorak.findComponent", async () => {
      focusWhenReady = true;
      await vscode.commands.executeCommand("gorak.components.focus");
      if (ready) {
        focusWhenReady = false;
        await view?.webview.postMessage({ type: "focus", all: true });
      }
    }),
    vscode.commands.registerCommand("gorak.quickFind", async () => {
      const picker = vscode.window.createQuickPick<
        vscode.QuickPickItem & { component: Component }
      >();
      picker.title = "Find gorak component";
      picker.placeholder = "Component name or application!component";
      picker.busy = true;
      picker.matchOnDescription = true;
      picker.matchOnDetail = true;
      let closed = false;
      const update = () => {
        const labels = applicationLabels(
          catalogue.components,
          catalogue.applications,
        );
        picker.items = findComponents(catalogue.components, picker.value)
          .slice(0, 200)
          .map((component) => ({
            label: component.name,
            description:
              labels.get(component.applicationUri) ?? component.application,
            detail:
              componentTypes[component.componentType]?.label ??
              component.componentType,
            alwaysShow: true,
            component,
          }));
      };
      picker.onDidChangeValue(update);
      picker.onDidAccept(() => {
        const item = picker.selectedItems[0];
        if (item) {
          void open(item.component.id);
          picker.hide();
        }
      });
      picker.onDidHide(() => {
        closed = true;
        picker.dispose();
      });
      picker.show();
      await refresh();
      if (!closed) {
        picker.busy = false;
        update();
      }
    }),
    {
      dispose() {
        disposed = true;
      },
    },
  );
  const watcher = vscode.workspace.createFileSystemWatcher(
    "**/*.{w4gl,wml,json}",
  );
  let timer: ReturnType<typeof setTimeout> | undefined;
  const changed = () => {
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => {
      if (view?.visible) void refresh();
    }, 750);
  };
  context.subscriptions.push(
    watcher,
    watcher.onDidChange(changed),
    watcher.onDidCreate(changed),
    watcher.onDidDelete(changed),
    vscode.workspace.onDidChangeWorkspaceFolders(changed),
    {
      dispose() {
        if (timer) clearTimeout(timer);
      },
    },
  );
}
