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
    '<frame><!-- retained 😀 --><topform width="6500" height="4000"><entryfield name="caption" xleft="250" ytop="250" width="1200" height="350"/><entryfield name="zero" width="0" height="0"><defaultstring>  </defaultstring><opaque><row/><row> </row></opaque></entryfield><viewportfield name="viewport" xleft="3500" ytop="500" width="1500" height="1200"><viewfield type="flexibleform" name="content" width="1200" height="1000"><entryfield name="inside" width="500" height="250"/><script>INITIALIZE = { MESSAGE inside; }</script></viewfield></viewportfield><entryfield name="second" xleft="2000" ytop="1000" width="800" height="350"/><buttonfield name="picture" xleft="5000" ytop="500" width="600" height="600"><bitmaplabel src="builtin:imagtrm3"/></buttonfield></topform></frame>\r\n';
  await fs.writeFile(file, original);
  await fs.writeFile(
    path.join(workspace, "sample.w4gl"),
    '[framesource]\nwindowwidth = "6500"\nwindowheight = "4000"\n\n===\n// opaque script\n// preserve 😀 metadata\n',
  );
}
if (!compatibility) {
  await fs.writeFile(
    path.join(workspace, "gorak.json"),
    JSON.stringify({ name: "synthetic_browser" }),
  );
  for (const app of ["catalogue", "empty"]) {
    await fs.mkdir(path.join(workspace, app));
    await fs.writeFile(
      path.join(workspace, app, "app.json"),
      JSON.stringify({ included_applications: [] }),
    );
  }
  await fs.writeFile(
    path.join(workspace, "catalogue", "search_target.w4gl"),
    "[proc4glsource]\n\n===\n",
  );
  for (const name of ["search_frame", "search_plain"]) {
    await fs.writeFile(
      path.join(workspace, "catalogue", `${name}.wml`),
      original,
    );
    await fs.writeFile(
      path.join(workspace, "catalogue", `${name}.w4gl`),
      '[framesource]\nwindowwidth = "6500"\nwindowheight = "4000"\n\n===\n',
    );
  }
  await fs.writeFile(
    path.join(workspace, "catalogue", "search_frame.fielddefaults.json"),
    '{"absent":true}',
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
  const runCommand = async (title) => {
    await page.keyboard.press("Control+Shift+p");
    await page.waitForFunction(
      () =>
        document.activeElement instanceof HTMLInputElement &&
        document.activeElement.value.startsWith(">"),
    );
    const input = page
      .locator(".quick-input-widget .quick-input-box input:visible")
      .first();
    await input.fill(`>${title}`);
    const target = page
      .locator(".quick-input-list .monaco-list-row")
      .filter({ has: page.getByText(title, { exact: true }) })
      .first();
    await target.waitFor();
    const targetIndex = Number(await target.getAttribute("data-index"));
    const focused = page
      .locator(".quick-input-list .monaco-list-row.focused")
      .first();
    const currentIndex = Number(await focused.getAttribute("data-index"));
    for (let index = currentIndex; index < targetIndex; index++)
      await input.press("ArrowDown");
    for (let index = currentIndex; index > targetIndex; index--)
      await input.press("ArrowUp");
    await input.press("Enter");
  };
  await page.getByText("gorak: ready", { exact: false }).waitFor();
  await page.keyboard.press("Control+w");
  if (compatibility) {
    await page.keyboard.press("Control+p");
    await page.keyboard.type("example/panel.wml");
    await page.keyboard.press("Enter");
    await page.getByRole("tab", { name: /panel.wml/ }).waitFor();
    await runCommand("gorak: Switch to Frame Designer");
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
  // Element attachment precedes the asynchronous host state message on Windows.
  // Read-only status is published only after the document model is assigned.
  await frame.getByText("Read only", { exact: false }).waitFor();
  if (!compatibility) {
    await frame.waitForFunction(
      () =>
        document
          .querySelector("gorak-frame-designer")
          ?.document?.fields.find((field) => field.name === "picture")?.bitmap
          ?.rgba.length > 0,
    );
    const model = await frame
      .locator("gorak-frame-designer")
      .evaluate((designer) => {
        const doc = designer.document;
        return {
          readOnly: designer.readOnly,
          fields: doc.fields,
          text: doc.source.text,
          metadata: doc.metadata.text,
        };
      });
    assert.equal(model.readOnly, true);
    assert.ok(
      model.fields.find((field) => field.name === "picture").bitmap.rgba
        .length > 0,
      "Image button pixels cross the real host/webview bridge",
    );
    assert.equal(
      model.text,
      original,
      "Whitespace, empty rows and opaque XML survive host transport",
    );
    const zero = model.fields.find((f) => f.name === "zero");
    assert.ok(zero, "Zero-size field remains represented");
    assert.equal(zero.width, 0);
    assert.equal(zero.height, 0);
    assert.equal(zero.properties.defaultstring, "  ");
    assert.ok(
      model.fields.some((f) => f.name === "inside"),
      "Viewport content remains inspectable",
    );
    assert.match(model.metadata, /preserve 😀 metadata/);
    assert.equal(
      await frame.locator("#error").textContent(),
      "",
      "Stylesheet absence is accepted",
    );
  }
  const menuAction = async (menu, item) => {
    await frame.getByRole("button", { name: menu, exact: true }).click();
    await frame.getByRole("menuitem", { name: item, exact: true }).click();
  };
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
  if (!compatibility) {
    const action = await frame
      .locator("gorak-frame-designer")
      .evaluate((designer) => {
        const child = designer.document.fields.find((f) => f.name === "inside");
        let detail;
        designer.addEventListener(
          "field-action",
          (event) => {
            detail = event.detail;
          },
          { once: true },
        );
        designer.requestFieldAction("references", child.id);
        return { detail, text: designer.document.source.text };
      });
    assert.equal(
      action.text.slice(action.detail.range.start, action.detail.range.end),
      "inside",
    );
    await page.getByText("2 results in 1 file", { exact: true }).waitFor();
    await page
      .getByRole("treeitem")
      .filter({ hasText: "MESSAGE inside" })
      .first()
      .waitFor();
    await page.keyboard.press("Escape");
    await runCommand("gorak: Switch to Frame Designer");
    const deadline = Date.now() + 10000;
    let active;
    while (!active) {
      for (const candidate of [...page.frames()].reverse())
        if (
          await candidate
            .locator("gorak-frame-designer")
            .isVisible()
            .catch(() => false)
        ) {
          active = candidate;
          break;
        }
      assert.ok(Date.now() < deadline, "Designer reopens");
      if (!active) await new Promise((resolve) => setTimeout(resolve, 50));
    }
    frame = active;
    await frame.getByText("Read only", { exact: false }).waitFor();
    await frame.locator("gorak-frame-designer").evaluate((designer) => {
      const child = designer.document.fields.find((f) => f.name === "inside");
      designer.requestFieldAction("definition", child.id);
    });
    await page
      .locator('[id="status.editor.selection"]')
      .filter({ hasText: "6 selected" })
      .waitFor();
  } else await menuAction("View", "Raw WML");
  await page.locator(".monaco-editor textarea").first().waitFor();
  if (!compatibility) {
    await runCommand("gorak: Find Component");
    let componentsView;
    const viewDeadline = Date.now() + 10000;
    while (!componentsView) {
      for (const candidate of page.frames())
        if (
          await candidate
            .locator("#heading")
            .count()
            .catch(() => 0)
        )
          componentsView = candidate;
      assert.ok(Date.now() < viewDeadline, "Component sidebar loads");
      if (!componentsView)
        await new Promise((resolve) => setTimeout(resolve, 100));
    }
    const rows = componentsView.locator("#results .row");
    const row = (name) =>
      rows.filter({
        has: componentsView.locator(".name").getByText(name, { exact: true }),
      });
    const search = componentsView.locator("#search");
    const heading = componentsView.locator("#heading");
    const back = componentsView.locator("#back");
    const context = componentsView.locator("#menu");
    await componentsView.waitForFunction(
      () => document.activeElement?.id === "search",
    );
    await row("search_target").waitFor();
    assert.equal(
      await heading.textContent(),
      "All applications",
      "Find Component explicitly searches every app",
    );
    await back.click();
    assert.equal(await heading.textContent(), "Applications");
    await row("empty").click();
    assert.equal(
      await rows.count(),
      0,
      "Actual empty application remains selectable",
    );
    await back.click();
    await row("catalogue").click();
    assert.equal(
      await rows.count(),
      3,
      "Each paired frame has one component row",
    );
    assert.equal(await componentsView.locator("#results .type").count(), 3);
    assert.equal(
      await componentsView
        .locator('#sort option[value="application"]')
        .isVisible(),
      false,
      "Application sort is global only",
    );
    await row("search_plain").click({ button: "right" });
    await context
      .getByRole("menuitem", { name: "View source code", exact: true })
      .waitFor();
    await componentsView.waitForFunction(
      () =>
        document.querySelector('#menu [role="menuitem"]') ===
        document.activeElement,
    );
    await componentsView.locator("#menu").press("Escape");
    assert.equal(await context.isVisible(), false);
    assert.equal(
      await row("search_plain").evaluate(
        (element) => element === document.activeElement,
      ),
      true,
      "Escape restores originating row focus",
    );
    await row("search_plain").press("Shift+F10");
    await context
      .getByRole("menuitem", { name: "View source code", exact: true })
      .waitFor();
    assert.equal(
      await context
        .getByRole("menuitem", { name: "View stylesheet", exact: true })
        .count(),
      0,
      "Absent stylesheet has no action",
    );
    await search.click();
    assert.equal(
      await context.isVisible(),
      false,
      "Outside click dismisses context menu",
    );
    await row("search_frame").click({ button: "right" });
    await context
      .getByRole("menuitem", { name: "View stylesheet", exact: true })
      .waitFor();
    await context.press("End");
    assert.equal(
      await componentsView.evaluate(() => document.activeElement?.textContent),
      "View stylesheet",
      "Keyboard reaches lazily available stylesheet action",
    );
    await context
      .getByRole("menuitem", { name: "View stylesheet", exact: true })
      .click();
    await page
      .getByRole("tab", { name: /search_frame.fielddefaults.json/ })
      .waitFor();
    await row("search_frame").click({ button: "right" });
    await context
      .getByRole("menuitem", { name: "View source code", exact: true })
      .click();
    await page.getByRole("tab", { name: /search_frame.w4gl/ }).waitFor();
    await row("search_frame").click({ button: "right" });
    await context
      .getByRole("menuitem", { name: "View in frame designer", exact: true })
      .click();
    const frameDeadline = Date.now() + 10000;
    while (
      !(
        await Promise.all(
          page.frames().map((candidate) =>
            candidate
              .locator("gorak-frame-designer")
              .evaluateAll((elements) =>
                elements.some((element) =>
                  element.document?.uri.endsWith("/search_frame.wml"),
                ),
              )
              .catch(() => false),
          ),
        )
      ).some(Boolean)
    ) {
      assert.ok(
        Date.now() < frameDeadline,
        "Context menu opens matching frame designer",
      );
      await new Promise((resolve) => setTimeout(resolve, 50));
    }
    await page.getByRole("tab", { name: /search_frame.w4gl/ }).click();
    await page.waitForFunction(() =>
      Boolean(document.activeElement?.closest(".monaco-editor")),
    );
    await runCommand("gorak: Quick Find Component");
    const quickFind = page.getByPlaceholder(
      "Component name or application!component",
    );
    await quickFind.fill("catalogue!search_target");
    await page
      .locator(".quick-input-list")
      .getByText("search_target", { exact: true })
      .waitFor();
    await quickFind.press("Enter");
    await quickFind.waitFor({ state: "hidden" });
    await page.getByRole("tab", { name: /search_target.w4gl/ }).waitFor();
    await page.waitForFunction(() =>
      Boolean(document.activeElement?.closest(".monaco-editor")),
    );
    await runCommand("gorak: Find Component");
    await componentsView.waitForFunction(
      () => document.activeElement?.id === "search",
    );
    await componentsView.evaluate(() => {
      const components = Array.from({ length: 10000 }, (_, i) => ({
        id: `component-${i}`,
        projectUri: "file:///synthetic/",
        applicationUri: `file:///synthetic/app_${i % 30}/`,
        application: `app_${i % 30}`,
        name: `frame_${i}`,
        componentType: i % 2 ? "classsource" : "framesource",
        sourceUri: `file:///synthetic/app_${i % 30}/frame_${i}.w4gl`,
      }));
      window.dispatchEvent(
        new MessageEvent("message", {
          data: { type: "catalogue", components, failures: 0 },
        }),
      );
    });
    assert.equal(
      await rows.count(),
      10000,
      "All global components are scrollable without Show more",
    );
    assert.equal(
      await componentsView.locator("#results .app").count(),
      10000,
      "Global rows identify applications",
    );
    assert.equal(await componentsView.locator("#more").count(), 0);
    const assertSorted = async (key, descending) => {
      const values = await componentsView
        .locator(`#results .${key}`)
        .allTextContents();
      assert.ok(values.length > 1);
      assert.ok(
        values.every(
          (value, index) =>
            index === 0 ||
            (descending ? -1 : 1) * values[index - 1].localeCompare(value) <= 0,
        ),
        `${key} is ${descending ? "descending" : "ascending"}`,
      );
    };
    await assertSorted("name", false);
    await componentsView.locator("#direction").click();
    await assertSorted("name", true);
    await componentsView.locator("#sort").selectOption("type");
    await assertSorted("type", true);
    await componentsView.locator("#direction").click();
    await assertSorted("type", false);
    await componentsView.locator("#sort").selectOption("application");
    await assertSorted("app", false);
    await componentsView.locator("#direction").click();
    await assertSorted("app", true);
    await back.click();
    assert.equal(await rows.count(), 30, "Back shows application landing list");
    await row("app_4").click();
    assert.equal(
      await rows.count(),
      334,
      "All selected-app components are rendered, including rows after 300",
    );
    assert.equal(await componentsView.locator("#results .app").count(), 0);
    assert.equal(await heading.textContent(), "app_4");
    await search.fill("frame_4");
    await componentsView.locator("#global").waitFor();
    const scoped = await rows.count();
    await componentsView.locator("#global").click();
    assert.equal(await heading.textContent(), "All applications");
    assert.equal(
      await search.inputValue(),
      "frame_4",
      "Global search preserves scoped query",
    );
    assert.ok((await rows.count()) > scoped, "Global link broadens results");
    await back.click();
    assert.equal(await heading.textContent(), "app_4");
    assert.equal(
      await search.inputValue(),
      "frame_4",
      "Back restores selected app and query",
    );
    assert.equal(await rows.count(), scoped);
    await search.press("ArrowDown");
    await componentsView.waitForFunction(() =>
      document.activeElement?.classList.contains("row"),
    );
    await rows.first().press("End");
    assert.equal(
      await rows
        .last()
        .evaluate((element) => element === document.activeElement),
      true,
    );
    await rows.last().press("Escape");
    await componentsView.waitForFunction(
      () => document.activeElement?.id === "search",
    );
    await componentsView.locator("#gear").click();
    await componentsView.getByLabel("User frame", { exact: true }).uncheck();
    assert.equal(
      await rows.count(),
      0,
      "Type filter applies to the full selected-app list",
    );
    await componentsView.getByLabel("User frame", { exact: true }).check();
    await page.screenshot({ path: path.join(output, "components.png") });
    await runCommand("gorak: Find Component");
    await componentsView.waitForFunction(
      () => document.activeElement?.id === "search",
    );
    assert.equal(
      await heading.textContent(),
      "All applications",
      "Find Component enters global mode from a scoped view",
    );
  }

  console.log(
    `Read-only designer and component browser passed: image pixels, field references/definition, source switching, read-only preservation, full app/global lists, sorting, context actions, application/type filters and keyboard navigation. Screenshot: ${output}/viewer.png`,
  );
} catch (error) {
  for (const page of browser?.contexts().flatMap((c) => c.pages()) ?? []) {
    await page
      .screenshot({ path: path.join(output, "failure.png") })
      .catch(() => {});
  }
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
  if (child.exitCode === null && child.signalCode === null) {
    await new Promise((resolve, reject) => {
      const timer = setTimeout(
        () => reject(Error("Designer editor did not exit")),
        10000,
      );
      child.once("exit", () => {
        clearTimeout(timer);
        resolve();
      });
      child.kill();
    });
  }
}

// Electron can retain debugging transport handles after its window closes.
process.exit(process.exitCode ?? 0);
