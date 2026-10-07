import "./test-display.mjs";
// Real webview interaction in a disposable VS Code profile, on Linux and Windows.
import { chromium } from "playwright-core";
import { spawn } from "node:child_process";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import net from "node:net";
import assert from "node:assert/strict";
import { editorExecutable } from "./editor.mjs";
const output = await fs.mkdtemp(path.join(os.tmpdir(), "gorak-designer-ui-"));
const compatibility = Boolean(process.env.GORAK_COMPATIBILITY_WORKSPACE);
const workspace =
  process.env.GORAK_COMPATIBILITY_WORKSPACE ?? path.join(output, "Frames Ω");
const file = path.join(
  workspace,
  compatibility ? "example/panel.wml" : "sample.wml",
);
let original;
if (compatibility) {
  original = await fs.readFile(file, "utf8");
} else {
  await fs.mkdir(workspace);
  original =
    '<frame><!-- retained 😀 --><topform width="6500" height="4000"><entryfield name="caption" xleft="250" ytop="250" width="1200" height="350"/><entryfield name="second" xleft="2000" ytop="1000" width="800" height="350"/></topform></frame>\r\n';
  await fs.writeFile(file, original);
  await fs.writeFile(
    path.join(workspace, "sample.w4gl"),
    '[framesource]\nwindowwidth = "6500"\nwindowheight = "4000"\n\n===\n// opaque script\n',
  );
}
const before = new Map();
async function snapshot(directory) {
  for (const item of await fs.readdir(directory, { withFileTypes: true })) {
    const name = path.join(directory, item.name);
    if (item.isDirectory()) await snapshot(name);
    else before.set(name, await fs.readFile(name));
  }
}
await snapshot(workspace);
const initialX = compatibility ? "200" : "250";
const listener = net.createServer();
await new Promise((resolve) => listener.listen(0, "127.0.0.1", resolve));
const port = listener.address().port;
await new Promise((resolve) => listener.close(resolve));
const child = spawn(
  editorExecutable(),
  [
    "--new-window",
    "--wait",
    "--skip-welcome",
    "--skip-release-notes",
    "--disable-workspace-trust",
    "--disable-extensions",
    `--remote-debugging-port=${port}`,
    `--user-data-dir=${path.join(output, "profile")}`,
    `--extensions-dir=${path.join(output, "extensions")}`,
    `--extensionDevelopmentPath=${process.env.GORAK_INSTALLED_EXTENSION ?? process.cwd()}`,
    workspace,
    file,
  ],
  { stdio: "ignore" },
);
let browser;
try {
  const deadline = Date.now() + 30000;
  while (!browser) {
    try {
      browser = await chromium.connectOverCDP(`http://127.0.0.1:${port}`);
    } catch (error) {
      if (Date.now() > deadline) throw error;
      await new Promise((r) => setTimeout(r, 200));
    }
  }
  let page;
  while (!(page = browser.contexts().flatMap((c) => c.pages())[0])) {
    assert.ok(Date.now() < deadline, "VS Code window opens");
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  await page.getByText("gorak: ready", { exact: false }).waitFor();
  await page.keyboard.press("Control+w");
  if (compatibility) {
    await page.keyboard.press("Control+p");
    await page.keyboard.type("example/panel.wml");
    await page.keyboard.press("Enter");
    await page.getByRole("tab", { name: /panel.wml/ }).waitFor();
    await page.keyboard.press("Control+Shift+p");
    await page.keyboard.type("gorak: Open Frame Designer");
    await page.keyboard.press("Enter");
  } else await page.getByRole("treeitem", { name: /sample.wml/ }).dblclick();
  let frame;
  while (!frame) {
    for (const page of browser.contexts().flatMap((c) => c.pages()))
      for (const candidate of page.frames())
        if (await candidate.locator("gorak-frame-designer").count())
          frame = candidate;
    if (Date.now() > deadline) throw Error("Designer webview did not load");
    if (!frame) await new Promise((r) => setTimeout(r, 100));
  }
  const menuAction = async (menu, item) => {
    await frame.getByRole("button", { name: menu, exact: true }).click();
    await frame.getByRole("menuitem", { name: item, exact: true }).click();
  };
  await frame.getByText("Read only", { exact: false }).waitFor();
  for (const menu of ["File", "Edit", "Group"])
    assert.equal(
      await frame.getByRole("button", { name: menu, exact: true }).count(),
      0,
    );
  assert.equal(
    await frame.locator("gorak-frame-designer .palette").isVisible(),
    false,
  );
  await frame.locator("gorak-frame-designer .field").first().click();
  const x = frame.locator('input[aria-label="xleft"]');
  assert.equal(await x.isDisabled(), true);
  assert.equal(await x.inputValue(), initialX);
  assert.equal(await frame.locator("gorak-frame-designer .handle").count(), 0);
  const field = frame.locator("gorak-frame-designer .field").first();
  const bounds = await field.boundingBox();
  await page.mouse.move(bounds.x + 4, bounds.y + 4);
  await page.mouse.down();
  await page.mouse.move(bounds.x + 50, bounds.y + 50);
  await page.mouse.up();
  for (const key of ["Delete", "Control+z", "Control+y", "Control+s"])
    await page.keyboard.press(key);
  assert.equal(await x.inputValue(), initialX);
  await frame.getByRole("button", { name: "Zoom in", exact: true }).click();
  await frame.getByRole("button", { name: "Actual size", exact: true }).click();
  await frame
    .getByRole("combobox", { name: "Selected object", exact: true })
    .selectOption("");
  assert.equal(
    await frame.locator('input[aria-label="windowwidth"]').isDisabled(),
    true,
  );
  assert.equal(await frame.locator("#error").textContent(), "");
  for (const [name, bytes] of before)
    assert.deepEqual(
      await fs.readFile(name),
      bytes,
      `Viewer preserves ${name}`,
    );
  await frame.page().screenshot({ path: path.join(output, "viewer.png") });
  await menuAction("View", "Raw WML");
  await page.locator(".monaco-editor textarea").first().waitFor();
  console.log(
    `Read-only designer passed: inspection, zoom, blocked edits and shortcuts, source switching, exact file preservation. Screenshot: ${output}/viewer.png`,
  );
} catch (error) {
  for (const page of browser?.contexts().flatMap((c) => c.pages()) ?? [])
    await page
      .screenshot({ path: path.join(output, "failure.png") })
      .catch(() => {});
  console.error(`Designer UI logs: ${output}`, error);
  process.exitCode = 1;
} finally {
  if (browser) {
    await Promise.race([
      Promise.all(
        browser
          .contexts()
          .flatMap((context) => context.pages())
          .map((page) => page.close().catch(() => {})),
      ),
      new Promise((resolve) => setTimeout(resolve, 2000)),
    ]);
    await Promise.race([
      browser.close(),
      new Promise((r) => setTimeout(r, 2000)),
    ]);
  }
  child.kill();
}

// Electron can retain debugging transport handles after its window closes.
process.exit(process.exitCode ?? 0);
