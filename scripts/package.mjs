import { spawnSync } from "node:child_process";
import fs from "node:fs/promises";
import crypto from "node:crypto";
const target = `${process.platform}-${process.arch}`;
if (!["win32-x64", "linux-x64"].includes(target))
  throw new Error(`Unsupported release target: ${target}`);
await fs.mkdir("release", { recursive: true });
const { version } = JSON.parse(await fs.readFile("package.json", "utf8"));
const name = `gorak-openroad-${target}-${version}.vsix`;
const result = spawnSync(
  process.execPath,
  [
    "node_modules/@vscode/vsce/vsce",
    "package",
    "--target",
    target,
    "--pre-release",
    "--no-dependencies",
    "--out",
    `release/${name}`,
  ],
  { stdio: "inherit" },
);
if (result.status !== 0) process.exit(result.status ?? 1);
const digest = crypto
  .createHash("sha256")
  .update(await fs.readFile(`release/${name}`))
  .digest("hex");
await fs.writeFile(`release/${name}.sha256`, `${digest}  ${name}\n`);
