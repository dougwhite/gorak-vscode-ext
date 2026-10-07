import "./test-display.mjs";
// Disposable extension host: JSON delegation plus real workbench icon CSS/highlighting.
import { build } from "esbuild";
import { spawn, spawnSync } from "node:child_process";
import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import net from "node:net";
import assert from "node:assert/strict";
import { chromium } from "playwright-core";
import { editorExecutable } from "./editor.mjs";
const output = await fs.mkdtemp(path.join(os.tmpdir(), "gorak-icons-"));
// Keep the development extension outside the VS Code executable's ancestor tree:
// VS Code otherwise treats its bundled themes as development contributions too.
const extension =
  process.env.GORAK_INSTALLED_EXTENSION ?? path.join(output, "extension");
if (!process.env.GORAK_INSTALLED_EXTENSION) {
  for (const entry of [
    "package.json",
    "dist",
    "icons",
    "schemas",
    "syntaxes",
    "language-configuration.json",
    "wml-language-configuration.json",
    "project-language-configuration.json",
  ]) {
    await fs.cp(path.join(process.cwd(), entry), path.join(extension, entry), {
      recursive: true,
    });
  }
}
const workspace = path.join(output, "icons");
await fs.mkdir(path.join(workspace, ".vscode"), { recursive: true });
await fs.mkdir(path.join(output, "profile/User"), { recursive: true });
await fs.writeFile(
  path.join(output, "profile/User/settings.json"),
  JSON.stringify({
    "workbench.iconTheme": "vs-seti",
    "workbench.colorTheme": "Default Dark Modern",
    "gorak.frameDesigner.enabled": false,
  }),
);
await build({
  entryPoints: ["test/file-icons-host.ts"],
  outfile: path.join(output, "test.cjs"),
  bundle: true,
  platform: "node",
  external: ["vscode"],
});
const listener = net.createServer();
await new Promise((resolve) => listener.listen(0, "127.0.0.1", resolve));
const port = listener.address().port;
await new Promise((resolve) => listener.close(resolve));
const host = spawnSync(
  editorExecutable(),
  [
    workspace,
    "--new-window",
    "--wait",
    "--skip-welcome",
    "--skip-release-notes",
    "--disable-workspace-trust",
    `--user-data-dir=${output}/profile`,
    `--extensions-dir=${output}/extensions`,
    `--extensionDevelopmentPath=${extension}`,
    `--extensionTestsPath=${output}/test.cjs`,
  ],
  {
    stdio: "inherit",
    timeout: 90000,
    env: { ...process.env, GORAK_TEST_OUTPUT: output },
  },
);
assert.equal(host.status, 0, `JSON acceptance: ${output}`);
for (const [phase, colorTheme, iconTheme, enabled = true] of [
  ["dark", "Default Dark Modern", "vs-seti"],
  ["light", "Default Light Modern", "vs-seti"],
  ["theme-suppression", "Default Light Modern", "vs-minimal"],
  ["json-opt-out", "Default Dark Modern", "vs-seti", false],
]) {
  const profile = path.join(output, phase);
  await fs.mkdir(path.join(profile, "User"), { recursive: true });
  await fs.writeFile(
    path.join(profile, "User/settings.json"),
    JSON.stringify({
      "workbench.colorTheme": colorTheme,
      "workbench.iconTheme": iconTheme,
      "gorak.projectFileIcon.enabled": enabled,
    }),
  );
  const child = spawn(
    editorExecutable(),
    [
      workspace,
      path.join(workspace, "gorak.json"),
      "--new-window",
      "--wait",
      "--skip-welcome",
      "--skip-release-notes",
      "--disable-workspace-trust",
      `--user-data-dir=${profile}`,
      `--extensions-dir=${output}/extensions`,
      `--extensionDevelopmentPath=${extension}`,
      `--remote-debugging-port=${port}`,
    ],
    { stdio: "inherit" },
  );
  let exitCode;
  const exited = new Promise((resolve) =>
    child.on("exit", (code) => {
      exitCode = code;
      resolve(code);
    }),
  );
  let browser;
  const deadline = Date.now() + 30000;
  async function until(action) {
    while (Date.now() < deadline) {
      if (exitCode !== undefined)
        throw Error(`Host exited ${exitCode}: ${output}`);
      try {
        const value = await action();
        if (value) return value;
      } catch {
        /* Await workbench initialization. */
      }
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
    throw Error(`Visual acceptance timed out (${phase}): ${output}`);
  }
  try {
    browser = await until(() =>
      chromium.connectOverCDP(`http://127.0.0.1:${port}`),
    );
    const page = await until(
      async () => browser.contexts().flatMap((context) => context.pages())[0],
    );
    await until(
      async () =>
        (await page
          .locator('.view-lines .view-line span[class*="mtk"]')
          .evaluateAll(
            (elements) =>
              new Set(elements.map((el) => getComputedStyle(el).color)).size,
          )) > 1,
    );
    for (const [filename, icon] of [
      ["sample.w4gl", "w4gl"],
      ["sample.wml", "wml"],
      ["gorak.json", "project"],
    ]) {
      const label = page
        .locator(".monaco-list-row .monaco-icon-label")
        .filter({ hasText: new RegExp(`^${filename.replaceAll(".", "\\.")}$`) })
        .first();
      if (phase === "json-opt-out" && icon === "project") {
        const ordinary = page
          .locator(".monaco-list-row .monaco-icon-label")
          .filter({ hasText: /^ordinary\.json$/ })
          .first();
        const style = (el) => {
          const s = getComputedStyle(el, "::before");
          return JSON.stringify([s.backgroundImage, s.content, s.fontFamily]);
        };
        await until(
          async () =>
            (await label.evaluate(style)) === (await ordinary.evaluate(style)),
        );
        continue;
      }
      const expected =
        phase === "theme-suppression"
          ? "document-light.svg"
          : `/icons/${phase === "json-opt-out" ? "dark" : phase}/${icon}.svg`;
      await until(async () =>
        (
          await label.evaluate(
            (el) => getComputedStyle(el, "::before").backgroundImage,
          )
        ).includes(expected),
      );
    }
    await page.screenshot({ path: path.join(output, `${phase}.png`) });
    if (phase === "dark") {
      // Render every supplied asset at its actual 16px size on both backgrounds.

      const rows = [];
      for (const variant of ["light", "dark"]) {
        const icons = [];
        for (const name of ["w4gl", "wml", "project"]) {
          const svg = await fs.readFile(
            path.join(extension, "icons", variant, `${name}.svg`),
          );
          icons.push({
            name,
            src: `data:image/svg+xml;base64,${svg.toString("base64")}`,
          });
        }
        rows.push({ variant, icons });
      }
      await page.evaluate((rows) => {
        const panel = document.createElement("div");
        panel.id = "icon-preview";
        panel.style.cssText =
          "position:fixed;inset:0;z-index:999999;background:white;font:14px sans-serif";
        for (const { variant, icons } of rows) {
          const row = document.createElement("div");
          row.style.cssText = `padding:20px;background:${variant === "dark" ? "#1f1f1f;color:white" : "#fff;color:#222"}`;
          for (const { name, src } of icons) {
            const span = document.createElement("span");
            span.style.cssText =
              "display:inline-flex;gap:8px;align-items:center;margin:12px";
            const img = document.createElement("img");
            img.width = img.height = 16;
            img.src = src;
            span.append(img, name);
            row.append(span);
          }
          panel.append(row);
        }
        document.body.append(panel);
      }, rows);
      await page
        .locator("#icon-preview")
        .screenshot({ path: path.join(output, "assets-16px.png") });
    }
  } finally {
    await browser?.close();
    child.kill();
    await exited;
  }
}
console.log(`Icon/JSON acceptance passed. Screenshots and logs: ${output}`);
