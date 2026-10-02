// Exercise actual VSIX installation, upgrade and rollback in a disposable profile.
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { spawnSync, spawn } from "node:child_process";
import { build } from "esbuild";
import { downloadAndUnzipVSCode } from "@vscode/test-electron";
const executable =
  process.env.VSCODE_EXECUTABLE ?? (await downloadAndUnzipVSCode("stable"));
const output = await fs.mkdtemp(path.join(os.tmpdir(), "gorak-installed-"));
const workspace = path.join(output, "Alpha Workspace Ω");
await fs.cp("examples", workspace, { recursive: true });
const extensions = path.join(output, "extensions");
const profile = path.join(output, "profile");
const { version } = JSON.parse(await fs.readFile("package.json", "utf8"));
const current = path.resolve(
  `release/gorak-openroad-${process.platform}-${process.arch}-${version}.vsix`,
);
const previous = path.join(output, "previous.vsix");
// A synthetic prior package tests installer identity/version transitions. Native cache
// schema incompatibility is covered independently by the server's upgrade regression.
const result = spawnSync(
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
  entryPoints: ["test/installed-host.ts"],
  outfile: path.join(output, "test.cjs"),
  bundle: true,
  platform: "node",
  target: "node20",
  external: ["vscode"],
});
try {
  for (const [phase, vsix, expected] of [
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
  await fs.rm(output, { recursive: true, force: true });
} catch (error) {
  console.error(`Installed acceptance logs: ${output}`);
  throw error;
}
