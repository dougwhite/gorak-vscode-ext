import "./test-display.mjs";
// Exercise actual VSIX installation, upgrade and rollback in a disposable profile.
import fs from "node:fs/promises";
import { createRequire } from "node:module";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { ecosystem } from "./ecosystem.mjs";
import os from "node:os";
import path from "node:path";
import { spawnSync, spawn } from "node:child_process";
import { build } from "esbuild";
import { downloadAndUnzipVSCode } from "@vscode/test-electron";
import { checkout, verifyCheckout } from "./compatibility-pin.mjs";
const compatibility = process.argv.includes("--compatibility");
const template = process.argv.includes("--frame-template");
if (template && !compatibility)
  throw Error("Frame template checks require --compatibility");
if (compatibility) verifyCheckout();
const executable =
  process.env.VSCODE_EXECUTABLE ?? (await downloadAndUnzipVSCode("stable"));
// Windows temp roots can use 8.3 aliases while the LSP returns canonical paths.
const output = await fs.realpath(
  await fs.mkdtemp(path.join(os.tmpdir(), "gorak-installed-")),
);
const workspace = path.join(output, "Alpha Workspace Ω");
await fs.cp(
  compatibility ? path.join(checkout, "compatibility/project") : "examples",
  workspace,
  { recursive: true },
);
if (compatibility) {
  await fs.copyFile(
    "test/fixtures/contract12/member_probe.w4gl",
    path.join(workspace, "example/member_probe.w4gl"),
  );
}
if (template) {
  const panel = path.join(workspace, "example/panel.w4gl");
  const source = await fs.readFile(panel, "utf8");
  assert.ok(source.includes("[framesource]"));
  const newline = source.includes("\r\n") ? "\r\n" : "\n";
  await fs.writeFile(
    panel,
    source
      // Nested macro tables belong to the component too; retaining their old
      // prefix creates a second framesource table instead of a template fixture.
      .replace(/^(\[\[?)framesource(?=[.\]])/gm, "$1frametemplate")
      .replace(
        "current_count.value = 0;",
        `current_count.value = 0;${newline}    CALLFRAME panel();`,
      ),
  );
}
const extensions = path.join(output, "extensions");
const profile = path.join(output, "profile");
const { version } = JSON.parse(await fs.readFile("package.json", "utf8"));
const current = path.resolve(
  `release/gorak-openroad-${process.platform}-${process.arch}-${version}.vsix`,
);
const previous = path.join(output, "previous.vsix");
// A synthetic prior package tests installer identity/version transitions. Native cache
// schema incompatibility is covered independently by the server's upgrade regression.
const result = compatibility
  ? { status: 0 }
  : spawnSync(
      "python",
      [
        "-c",
        `import json,sys,zipfile,xml.etree.ElementTree as ET
with zipfile.ZipFile(sys.argv[1]) as source, zipfile.ZipFile(sys.argv[2], 'w', zipfile.ZIP_DEFLATED) as target:
 for item in source.infolist():
  data=source.read(item.filename)
  if item.filename == 'extension/package.json':
   value=json.loads(data);value['version']='0.8.99';data=json.dumps(value).encode()
  if item.filename == 'extension.vsixmanifest':
   root=ET.fromstring(data)
   for element in root.iter():
    if element.tag.endswith('Identity'):element.set('Version','0.8.99')
   data=ET.tostring(root,encoding='utf-8',xml_declaration=True)
  target.writestr(item,data)
`,
        current,
        previous,
      ],
      { stdio: "inherit" },
    );
if (result.status !== 0)
  throw new Error("Could not create synthetic prior package");
await build({
  entryPoints: [
    compatibility ? "test/compatibility-host.ts" : "test/installed-host.ts",
  ],
  outfile: path.join(output, "test.cjs"),
  bundle: true,
  platform: "node",
  target: "node20",
  external: ["vscode"],
});
try {
  let installedPath;
  for (const [phase, vsix, expected] of compatibility
    ? [["compatibility", current, version]]
    : [
        ["install", previous, "0.8.99"],
        ["upgrade", current, version],
        ["rollback", previous, "0.8.99"],
      ]) {
    let cli = path.join(path.dirname(executable), "resources/app/out/cli.js");
    try {
      await fs.access(cli);
    } catch {
      // New Windows installers keep application resources under a version directory.
      const launcher = await fs.readFile(
        path.join(path.dirname(executable), "bin/code.cmd"),
        "utf8",
      );
      const relative =
        /%~dp0\.\.\\([^"\r\n]*resources\\app\\out\\cli\.js)/i.exec(
          launcher,
        )?.[1];
      if (!relative || relative.includes(".."))
        throw new Error("Cannot locate VS Code CLI resources");
      cli = path.join(path.dirname(executable), relative);
    }
    const install = spawnSync(
      executable,
      [
        cli,
        "--user-data-dir",
        profile,
        "--extensions-dir",
        extensions,
        "--install-extension",
        vsix,
        "--force",
      ],
      {
        env: { ...process.env, ELECTRON_RUN_AS_NODE: "1" },
        stdio: "inherit",
        timeout: 60000,
      },
    );
    if (install.status !== 0) throw new Error(`VSIX ${phase} failed`);
    let installed;
    for (const name of await fs.readdir(extensions)) {
      const dir = path.join(extensions, name);
      try {
        const pkg = JSON.parse(
          await fs.readFile(path.join(dir, "package.json"), "utf8"),
        );
        if (
          pkg.publisher === "dougwhite" &&
          pkg.name === "gorak-vscode-ext" &&
          pkg.version === expected
        )
          installed = dir;
      } catch {
        /* Other extension metadata. */
      }
    }
    if (!installed) throw new Error("Installed package missing");
    installedPath = installed;
    const { loadImages } = createRequire(import.meta.url)(
      path.join(installed, "dist/image-assets/electron/image-assets.cjs"),
    );
    const imageCatalogue = JSON.parse(
      await fs.readFile(
        path.join(installed, "dist/image-assets/src/builtin-images.json"),
        "utf8",
      ),
    );
    const bitmaps = await loadImages(
      workspace,
      Object.keys(imageCatalogue).map((name) => [
        `builtin:${name}`,
        null,
        null,
      ]),
    );
    assert.equal(
      Object.keys(bitmaps).length,
      Object.keys(imageCatalogue).length,
      "Every installed built-in image exists and passes its checksum",
    );
    if (compatibility) {
      const bundled = JSON.parse(
        await fs.readFile(
          path.join(installed, "dist/server-version.json"),
          "utf8",
        ),
      );
      assert.equal(`v${bundled.version}`, ecosystem.lsp_revision);
      assert.equal(bundled.platform, `${process.platform}-${process.arch}`);
      const binary = await fs.readFile(
        path.join(
          installed,
          "dist",
          process.platform === "win32" ? "gorak-lsp.exe" : "gorak-lsp",
        ),
      );
      assert.equal(
        createHash("sha256").update(binary).digest("hex"),
        bundled.sha256,
      );
      const metadata = JSON.parse(
        await fs.readFile(path.join(installed, "package.json"), "utf8"),
      );
      const packageMetadata = JSON.parse(
        await fs.readFile("package.json", "utf8"),
      );
      assert.equal(
        metadata.dependencies["gorak-frame-designer"],
        packageMetadata.dependencies["gorak-frame-designer"],
      );
      // Reject a stale VSIX even when its extension version was not bumped.
      for (const name of [
        "extension.js",
        "frame-webview.js",
        "component-webview.js",
        "server-version.json",
      ])
        assert.deepEqual(
          await fs.readFile(path.join(installed, "dist", name)),
          await fs.readFile(path.join("dist", name)),
          `Packaged runtime: ${name}`,
        );
    }
    await fs.rm(path.join(output, "result.json"), { force: true });
    await new Promise((resolve, reject) => {
      const child = spawn(
        executable,
        [
          workspace,
          "--new-window",
          "--wait",
          "--disable-workspace-trust",
          `--user-data-dir=${profile}`,
          `--extensions-dir=${extensions}`,
          `--extensionDevelopmentPath=${installed}`,
          `--extensionTestsPath=${path.join(output, "test.cjs")}`,
          "--skip-welcome",
          "--skip-release-notes",
        ],
        {
          stdio: "inherit",
          env: {
            ...process.env,
            GORAK_FIXTURE_ROOT: workspace,
            GORAK_TEMPLATE_CERTIFICATION: template ? "1" : "0",
            GORAK_EXPECTED_VERSION: expected,
            GORAK_INSTALLED_PHASE: phase,
            GORAK_TEST_OUTPUT: output,
          },
        },
      );
      const timer = setTimeout(() => {
        child.kill();
        reject(new Error("Installed editor test timed out"));
      }, 120000);
      child.on("error", (error) => {
        clearTimeout(timer);
        reject(error);
      });
      child.on("exit", (code) => {
        clearTimeout(timer);
        code === 0
          ? resolve()
          : reject(new Error(`Installed editor exited ${code}`));
      });
    });
    const result = JSON.parse(
      await fs.readFile(path.join(output, "result.json"), "utf8"),
    );
    if (!result.passed) throw new Error(`Installed ${phase} acceptance failed`);
    console.log(JSON.stringify(result));
  }
  if (compatibility) {
    const designer = spawnSync(
      process.execPath,
      ["scripts/test-designer.mjs"],
      {
        stdio: "inherit",
        env: {
          ...process.env,
          VSCODE_EXECUTABLE: executable,
          GORAK_COMPATIBILITY_WORKSPACE: workspace,
          GORAK_INSTALLED_EXTENSION: installedPath,
        },
        timeout: 120000,
      },
    );
    const independentDesigner = spawnSync(
      process.execPath,
      ["scripts/test-designer.mjs"],
      {
        stdio: "inherit",
        env: {
          ...process.env,
          VSCODE_EXECUTABLE: executable,
          GORAK_INSTALLED_EXTENSION: installedPath,
        },
        timeout: 120000,
      },
    );
    if (independentDesigner.status !== 0)
      throw Error("Installed contract-12 designer failed");
    verifyCheckout();
    if (designer.status !== 0)
      throw Error("Installed designer compatibility failed");
  }
  // Windows may retain the executable handle briefly after the last isolated
  // editor exits. Retry only cleanup, never an acceptance assertion or suite.
  await fs.rm(output, {
    recursive: true,
    force: true,
    maxRetries: 10,
    retryDelay: 200,
  });
} catch (error) {
  console.error(`Installed acceptance logs: ${output}`);
  throw error;
}
