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
if (compatibility) await snapshot(workspace);
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
  await frame.getByRole("button", { name: "Group", exact: true }).click();
  assert.equal(
    await frame
      .getByRole("menuitem", { name: "Tablefield", exact: true })
      .isDisabled(),
    true,
  );
  await page.keyboard.press("ArrowDown");
  await page.keyboard.press("Escape");
  await frame
    .getByRole("menu", { name: "Group", exact: true })
    .waitFor({ state: "hidden" });
  await frame.locator("gorak-frame-designer .field").first().click();
  const x = frame.locator('input[aria-label="xleft"]');
  await x.fill("500");
  await x.press("Tab");
  await frame.getByText("WML: unsaved", { exact: false }).waitFor();
  assert.equal(await fs.readFile(file, "utf8"), original);
  const tabsBeforeUndo = await page.locator(".tabs-container .tab").count();
  await frame.locator("gorak-frame-designer .field").first().click();
  await page.keyboard.press("Control+z");
  await frame.waitForFunction(
    (expected) =>
      document
        .querySelector("gorak-frame-designer")
        ?.shadowRoot?.querySelector('input[aria-label="xleft"]')?.value ===
      expected,
    initialX,
  );
  assert.equal(
    await page.locator(".tabs-container .tab").count(),
    tabsBeforeUndo,
    "Ctrl+Z must not open a source tab",
  );
  await page.keyboard.press("Control+y");
  await frame.waitForFunction(
    (expected) =>
      document
        .querySelector("gorak-frame-designer")
        ?.shadowRoot?.querySelector('input[aria-label="xleft"]')?.value ===
      expected,
    "500",
  );
  assert.equal(
    await page.locator(".tabs-container .tab").count(),
    tabsBeforeUndo,
    "Ctrl+Y must not open a source tab",
  );
  await menuAction("Edit", "Undo");
  await frame.waitForFunction(
    (expected) =>
      document
        .querySelector("gorak-frame-designer")
        ?.shadowRoot?.querySelector('input[aria-label="xleft"]')?.value ===
      expected,
    initialX,
  );
  await menuAction("Edit", "Redo");
  await frame.waitForFunction(
    (expected) =>
      document
        .querySelector("gorak-frame-designer")
        ?.shadowRoot?.querySelector('input[aria-label="xleft"]')?.value ===
      expected,
    "500",
  );
  assert.equal(
    await page.locator(".tabs-container .tab").count(),
    tabsBeforeUndo,
    "Toolbar undo/redo must not open a source tab",
  );
  await menuAction("File", "Save");
  await frame.getByText("WML: saved", { exact: false }).waitFor();
  assert.ok((await fs.readFile(file, "utf8")).includes('xleft="500"'));
  if (compatibility) {
    const marker = '<entryfield name="quantity" xleft="200"';
    assert.equal(
      original.split(marker).length,
      2,
      "Unique upstream edit target",
    );
    const expected = Buffer.from(
      original.replace(marker, '<entryfield name="quantity" xleft="500"'),
    );
    assert.deepEqual(
      await fs.readFile(file),
      expected,
      "Only the requested geometry bytes change",
    );
    const companion = path.join(workspace, "example/panel.w4gl");
    const companionBefore = before.get(companion).toString("utf8");
    const widthMarker = 'windowwidth = "6000"';
    assert.equal(companionBefore.split(widthMarker).length, 2);
    await frame
      .locator("gorak-frame-designer .surface")
      .click({ position: { x: 160, y: 150 } });
    const width = frame.locator('input[aria-label="windowwidth"]');
    await width.fill("7000");
    await width.press("Tab");
    await frame.getByText("Companion: unsaved", { exact: false }).waitFor();
    assert.deepEqual(await fs.readFile(companion), before.get(companion));
    await menuAction("File", "Save");
    await frame.getByText("Companion: saved", { exact: false }).waitFor();
    assert.equal(
      await fs.readFile(companion, "utf8"),
      companionBefore.replace(widthMarker, 'windowwidth = "7000"'),
      "Companion edit preserves image metadata, component kind and script bytes",
    );
    assert.deepEqual(await fs.readFile(file), expected);
    for (const [name, bytes] of before) {
      if (name !== file && name !== companion)
        assert.deepEqual(
          await fs.readFile(name),
          bytes,
          `Unrelated fixture bytes: ${name}`,
        );
    }
    assert.equal(await frame.locator("#error").textContent(), "");
    await frame
      .page()
      .screenshot({ path: path.join(output, "compatibility.png") });
    console.log(
      `Installed designer compatibility passed: upstream field and companion edits, dirty state, undo/redo, save, exact source preservation. Screenshot: ${output}/compatibility.png`,
    );
  } else {
    await x.fill("750");
    await x.press("Control+s");
    const savedDeadline = Date.now() + 5000;
    while (!(await fs.readFile(file, "utf8")).includes('xleft="750"')) {
      assert.ok(
        Date.now() < savedDeadline,
        "Ctrl+S commits the focused inspector input",
      );
      await new Promise((r) => setTimeout(r, 50));
    }
    await frame.locator("gorak-frame-designer .field").first().click();
    await frame
      .locator("gorak-frame-designer .field")
      .nth(1)
      .click({ modifiers: ["Shift"] });
    await menuAction("Group", "Flexible Form");
    await frame.locator(".field.flexibleform").waitFor();
    await menuAction("File", "Save");
    await frame.getByText("WML: saved", { exact: false }).waitFor();
    assert.match(await fs.readFile(file, "utf8"), /<flexibleform/);
    const groupId = await frame
      .locator("select.selection option")
      .evaluateAll(
        (options) =>
          options.find((option) => option.textContent.includes("group1"))
            ?.value,
      );
    assert.ok(groupId, "Grouped form appears in the object selector");
    await frame.locator("select.selection").selectOption(groupId);
    await menuAction("Group", "Ungroup");
    await frame.locator(".field.flexibleform").waitFor({ state: "detached" });
    await menuAction("File", "Save");
    await frame.getByText("WML: saved", { exact: false }).waitFor();
    assert.doesNotMatch(await fs.readFile(file, "utf8"), /<flexibleform/);
    await frame
      .locator("gorak-frame-designer .surface")
      .click({ position: { x: 160, y: 150 } });
    const width = frame.locator('input[aria-label="windowwidth"]');
    await width.fill("7000");
    await width.press("Tab");
    await frame.getByText("Companion: unsaved", { exact: false }).waitFor();
    await menuAction("File", "Save");
    await frame.getByText("Companion: saved", { exact: false }).waitFor();
    assert.ok(
      (await fs.readFile(path.join(workspace, "sample.w4gl"), "utf8")).includes(
        '"7000"',
      ),
    );
    assert.equal(await frame.locator("#error").textContent(), "");
    await frame.page().screenshot({ path: path.join(output, "designer.png") });
    console.log(
      `Designer webview passed: field edit, in-memory dirty state, undo/redo without source tabs, compact menus, grouping/ungrouping, Save, focused-input Ctrl+S, companion edit/save. Screenshot: ${output}/designer.png`,
    );
  }
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
