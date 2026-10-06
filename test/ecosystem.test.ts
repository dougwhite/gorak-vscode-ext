import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

test("ecosystem guards reject dependency drift and missing, dirty or wrong fixture checkouts", async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "gorak-pins-"));
  const run = (code: string) =>
    execFileSync(process.execPath, ["--input-type=module", "-e", code], {
      cwd: root,
      stdio: "pipe",
    });
  const dependencies =
    'import {verifyDependencies} from "./scripts/ecosystem.mjs"; verifyDependencies()';
  const checkout =
    'import {verifyCheckout} from "./scripts/compatibility-pin.mjs"; verifyCheckout()';
  const git = (...args: string[]) =>
    execFileSync("git", args, { cwd: root, stdio: "pipe" });
  try {
    await fs.mkdir(path.join(root, "scripts"));
    for (const file of [
      "ecosystem.toml",
      "package.json",
      "package-lock.json",
      "server.json",
      "scripts/ecosystem.mjs",
      "scripts/compatibility-pin.mjs",
    ])
      await fs.copyFile(file, path.join(root, file));
    run(dependencies);
    const original = await fs.readFile(
      path.join(root, "ecosystem.toml"),
      "utf8",
    );
    for (const key of ["lsp_revision", "frame_designer_revision"]) {
      await fs.writeFile(
        path.join(root, "ecosystem.toml"),
        original.replace(new RegExp(`${key} = "[^"]+"`), `${key} = "v99.0.0"`),
      );
      assert.throws(() => run(dependencies), /disagrees/);
    }
    await fs.writeFile(path.join(root, "ecosystem.toml"), original);
    assert.throws(() => run(checkout), /Command failed/);
    const sourceVersion = Number(/^source_version = (\d+)/m.exec(original)![1]);
    await fs.mkdir(path.join(root, ".ci/gorak"), { recursive: true });
    git("init", ".ci/gorak");
    await fs.writeFile(
      path.join(root, ".ci/gorak/ecosystem.toml"),
      `source_version = ${sourceVersion}\n`,
    );
    git("-C", ".ci/gorak", "add", ".");
    git(
      "-C",
      ".ci/gorak",
      "-c",
      "user.name=Test",
      "-c",
      "user.email=test@example.invalid",
      "commit",
      "-m",
      "synthetic pin guard",
    );
    const tag = /gorak_revision = "([^"]+)"/.exec(original)![1];
    git("-C", ".ci/gorak", "tag", tag);
    run(checkout);
    await fs.writeFile(path.join(root, ".ci/gorak/untracked"), "dirty");
    assert.throws(() => run(checkout), /local changes/);
    await fs.rm(path.join(root, ".ci/gorak/untracked"));
    await fs.writeFile(
      path.join(root, ".ci/gorak/ecosystem.toml"),
      `source_version = ${sourceVersion + 1}\n`,
    );
    assert.throws(() => run(checkout), /local changes/);
    git("-C", ".ci/gorak", "add", ".");
    git(
      "-C",
      ".ci/gorak",
      "-c",
      "user.name=Test",
      "-c",
      "user.email=test@example.invalid",
      "commit",
      "-m",
      "wrong contract",
    );
    assert.throws(() => run(checkout), /pinned release tag/);
    git("-C", ".ci/gorak", "tag", "-f", tag);
    assert.throws(() => run(checkout), /source_version mismatch/);
  } finally {
    await fs.rm(root, { recursive: true, force: true });
  }
});
