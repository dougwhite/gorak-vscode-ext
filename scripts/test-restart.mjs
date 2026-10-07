import "./test-display.mjs";
import { editorExecutable } from "./editor.mjs";
import { build } from "esbuild";
import { spawn } from "node:child_process";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
const output = await fs.mkdtemp(path.join(os.tmpdir(), "gorak-full-restart-"));
await build({
  entryPoints: ["test/restart-host.ts"],
  outfile: path.join(output, "test.cjs"),
  bundle: true,
  platform: "node",
  target: "node20",
  external: ["vscode"],
});
try {
  for (const phase of ["cold", "warm"]) {
    await fs.rm(path.join(output, "result.json"), { force: true });
    const code = await new Promise((resolve, reject) => {
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
          `--extensionDevelopmentPath=${process.cwd()}`,
          `--extensionTestsPath=${path.join(output, "test.cjs")}`,
          path.join(process.cwd(), "examples"),
        ],
        {
          stdio: "inherit",
          env: {
            ...process.env,
            GORAK_TEST_OUTPUT: output,
            GORAK_RESTART_PHASE: phase,
          },
        },
      );
      const timer = setTimeout(() => {
        child.kill();
        reject(new Error("Editor restart test timed out"));
      }, 120000);
      child.on("error", (e) => {
        clearTimeout(timer);
        reject(e);
      });
      child.on("exit", (code) => {
        clearTimeout(timer);
        resolve(code);
      });
    });
    const result = JSON.parse(
      await fs.readFile(path.join(output, "result.json"), "utf8"),
    );
    if (code !== 0 || !result.passed) throw new Error(`Editor exit ${code}`);
    console.log(JSON.stringify(result));
  }
  await fs.rm(output, { recursive: true, force: true });
} catch (error) {
  console.error(error, `Logs: ${output}`);
  process.exitCode = 1;
}
