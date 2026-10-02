import { editorExecutable } from "./editor.mjs";
import { build } from "esbuild";
import { spawn } from "node:child_process";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

const root = process.cwd();
const output = await fs.mkdtemp(path.join(os.tmpdir(), "gorak-editor-test-"));
await build({
  entryPoints: ["test/extension-host.ts"],
  outfile: path.join(output, "test.cjs"),
  bundle: true,
  platform: "node",
  target: "node20",
  external: ["vscode"],
});
const child = spawn(
  editorExecutable(),
  [
    "--new-window",
    "--wait",
    "--skip-welcome",
    "--skip-release-notes",
    "--disable-extensions",
    `--user-data-dir=${path.join(output, "profile")}`,
    `--extensions-dir=${path.join(output, "extensions")}`,
    `--extensionDevelopmentPath=${root}`,
    `--extensionTestsPath=${path.join(output, "test.cjs")}`,
    path.join(root, "examples"),
  ],
  { stdio: "inherit", env: { ...process.env, GORAK_TEST_OUTPUT: output } },
);
const timeout = setTimeout(() => {
  child.kill();
  console.error(`Editor test timed out. Logs: ${output}`);
  process.exitCode = 1;
}, 120_000);
child.on("error", (error) => {
  clearTimeout(timeout);
  console.error(error);
  process.exitCode = 1;
});
child.on("exit", async (code) => {
  clearTimeout(timeout);
  try {
    const result = JSON.parse(
      await fs.readFile(path.join(output, "result.json"), "utf8"),
    );
    if (!result.passed || code !== 0) throw new Error(`Editor exited ${code}`);
    console.log(JSON.stringify(result, null, 2));
    await fs.rm(output, { recursive: true, force: true });
  } catch (error) {
    console.error(`${error}\nEditor logs: ${output}`);
    process.exitCode = 1;
  }
});
