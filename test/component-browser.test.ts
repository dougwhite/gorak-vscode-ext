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
      joinPath: (...parts: any[]) => ({ toString: () => parts.join("/") }),
    },
    window: {
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
      executeCommand: async (id: string) => {
        if (id === "gorak.components.focus" && !receiver)
          provider.resolveWebviewView(view);
      },
    },
    workspace: {
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
