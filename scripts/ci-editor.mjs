import { downloadAndUnzipVSCode } from "@vscode/test-electron";
import { spawnSync } from "node:child_process";
const executable = await downloadAndUnzipVSCode(
  process.env.VSCODE_TEST_VERSION ?? "stable",
);
const failures = [];
for (const script of [
  "test-host.mjs",
  "test-designer.mjs",
  "test-restart.mjs",
  "test-installed.mjs",
  "test-installed.mjs --compatibility",
]) {
  const result = spawnSync(
    process.execPath,
    [`scripts/${script.split(" ")[0]}`, ...script.split(" ").slice(1)],
    {
      stdio: "inherit",
      env: { ...process.env, VSCODE_EXECUTABLE: executable },
    },
  );
  if (result.status !== 0) failures.push(script);
}

if (failures.length) {
  console.error(`Failed editor suites: ${failures.join(", ")}`);
  process.exit(1);
}
