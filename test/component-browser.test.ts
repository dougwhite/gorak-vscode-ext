import { test } from "node:test";
import assert from "node:assert/strict";
import { buildSync } from "esbuild";
import { createRequire } from "node:module";
import vm from "node:vm";
const bundle = buildSync({
  entryPoints: ["src/component-browser.ts"],
  bundle: true,
  write: false,
  platform: "node",
  format: "cjs",
  external: ["vscode"],
}).outputFiles[0].text;
const empty = {
  components: [],
  applications: [],
  indexing: false,
  failures: 0,
};
function harness(request: () => Promise<unknown>) {
  const commands = new Map<string, (...args: any[]) => any>();
  const messages: any[] = [];
  const opened: any[] = [],
    stats: string[] = [];
  let present = true;
  const disposable = { dispose() {} };
  let provider: any, receiver: any, rootChange: any;
  const view = {
    visible: true,
    webview: {
      options: {},
      html: "",
      cspSource: "test:",
      asWebviewUri: (uri: any) => uri.toString(),
      postMessage: async (value: any) => {
        messages.push(value);
        return true;
      },
      onDidReceiveMessage: (callback: any) => {
        receiver = callback;
        return disposable;
      },
    },
    onDidChangeVisibility: () => disposable,
    onDidDispose: () => disposable,
  };
  const vscode = {
    Uri: {
      parse: (value: string) => {
        const uri = new URL(value);
        return {
          path: uri.pathname,
          toString: () => uri.toString(),
          with: ({ path }: { path: string }) => new URL(path, uri),
        };
      },
      joinPath: (...parts: any[]) => ({ toString: () => parts.join("/") }),
    },
    window: {
      showTextDocument: async (uri: any, options: any) => {
        opened.push(["showTextDocument", uri.toString(), options]);
      },
      registerWebviewViewProvider: (_id: string, value: any) => {
        provider = value;
        return disposable;
      },
    },
    commands: {
      registerCommand: (id: string, callback: any) => {
        commands.set(id, callback);
        return disposable;
      },
      executeCommand: async (id: string, ...args: any[]) => {
        opened.push([
          id,
          ...args.map((x) => (x?.preview === true ? x : x?.toString())),
        ]);
        if (id === "gorak.components.focus" && !receiver)
          provider.resolveWebviewView(view);
      },
    },
    workspace: {
      fs: {
        stat: async (uri: any) => {
          stats.push(uri.toString());
          if (!present) throw new Error("missing");
          return {};
        },
      },
      createFileSystemWatcher: () => ({
        ...disposable,
        onDidChange: () => disposable,
        onDidCreate: () => disposable,
        onDidDelete: () => disposable,
      }),
      onDidChangeWorkspaceFolders: (callback: any) => {
        rootChange = callback;
        return disposable;
      },
    },
  };
  const mod = { exports: {} as any };
  const require = createRequire(__filename);
  vm.runInThisContext(`(function(require,module,exports){${bundle}\n})`)(
    (name: string) => (name === "vscode" ? vscode : require(name)),
    mod,
    mod.exports,
  );
  const subscriptions: any[] = [];
  mod.exports.registerComponentBrowser(
    { extensionUri: "file:///extension", subscriptions },
    request,
  );
  return {
    commands,
    messages,
    opened,
    stats,
    missing: () => {
      present = false;
    },
    receive: (value: any) => receiver(value),
    open: () => provider.resolveWebviewView(view),
    ready: () => receiver({ type: "ready" }),
    rootChange: () => rootChange(),
    dispose: () => subscriptions.forEach((x) => x.dispose()),
  };
}
test("Find Component waits for first webview readiness and resets retained view", async () => {
  const h = harness(async () => empty);
  await h.commands.get("gorak.findComponent")!();
  assert.equal(
    h.messages.some((m) => m.type === "focus"),
    false,
  );
  await h.ready();
  assert.equal(h.messages.filter((m) => m.type === "focus").length, 1);
  await h.commands.get("gorak.findComponent")!();
  assert.equal(h.messages.filter((m) => m.type === "focus").length, 2);
  h.dispose();
});
test("catalogue refresh drains changes during pending work and retries cancellation", async () => {
  let reject!: (error: unknown) => void,
    calls = 0;
  const h = harness(() =>
    ++calls === 1
      ? new Promise((_resolve, no) => {
          reject = no;
        })
      : Promise.resolve(empty),
  );
  h.open();
  const first = h.commands.get("gorak.refreshComponents")!();
  const second = h.commands.get("gorak.refreshComponents")!();
  await new Promise((resolve) => setImmediate(resolve));
  reject({ code: -32801 });
  await Promise.all([first, second]);
  assert.equal(calls, 2);
  assert.equal(h.messages.filter((m) => m.type === "catalogue").length, 1);
  h.rootChange();
  await new Promise((resolve) => setTimeout(resolve, 800));
  assert.equal(calls, 3, "Root changes refresh an already visible sidebar");
  h.dispose();
});

test("initial focus does not wait for indexing or arrive after the user moves on", async () => {
  let resolve!: (value: unknown) => void;
  const h = harness(
    () =>
      new Promise((done) => {
        resolve = done;
      }),
  );
  await h.commands.get("gorak.findComponent")!();
  const ready = h.ready();
  await new Promise((done) => setImmediate(done));
  assert.equal(
    h.messages.filter((message) => message.type === "focus").length,
    1,
    "Search focuses before indexing completes",
  );
  resolve(empty);
  await ready;
  assert.equal(
    h.messages.filter((message) => message.type === "focus").length,
    1,
    "Index completion cannot steal focus back",
  );
  h.dispose();
});

test("frame context actions lazily check only the component stylesheet and preserve source routing", async () => {
  const frame = {
    id: "frame",
    projectUri: "file:///project/",
    applicationUri: "file:///project/app/",
    application: "app",
    name: "panel",
    componentType: "framesource",
    sourceUri: "file:///project/app/panel.w4gl",
    frameUri: "file:///project/app/panel.wml",
  };
  const h = harness(async () => ({ ...empty, components: [frame] }));
  h.open();
  await h.ready();
  assert.deepEqual(h.stats, []);
  await h.receive({ type: "context", id: "frame", request: 7 });
  assert.deepEqual(h.stats, ["file:///project/app/panel.fielddefaults.json"]);
  assert.deepEqual(h.messages.at(-1), {
    type: "context",
    id: "frame",
    request: 7,
    stylesheet: true,
  });
  await h.receive({ type: "open", id: "frame", action: "source" });
  assert.deepEqual(h.opened.at(-1), [
    "showTextDocument",
    frame.sourceUri,
    { preview: true },
  ]);
  await h.receive({ type: "open", id: "frame", action: "stylesheet" });
  assert.deepEqual(h.opened.at(-1), [
    "showTextDocument",
    "file:///project/app/panel.fielddefaults.json",
    { preview: true },
  ]);
  await h.receive({ type: "open", id: "frame" });
  assert.deepEqual(h.opened.at(-1), [
    "gorak.openFrameDesigner",
    frame.frameUri,
    { preview: true },
  ]);
  h.missing();
  await h.receive({ type: "context", id: "frame", request: 8 });
  assert.equal(h.messages.at(-1).stylesheet, false);
  h.dispose();
});
