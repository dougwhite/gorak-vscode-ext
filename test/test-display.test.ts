import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { pathToFileURL } from "node:url";
import { spawnSync } from "node:child_process";

test(
  "Linux test display fails closed and isolates child environment and exit status",
  { skip: process.platform !== "linux" },
  async () => {
    const root = await fs.mkdtemp(
      path.join(os.tmpdir(), "gorak-display-test-"),
    );
    const runner = pathToFileURL(path.resolve("scripts/test-display.mjs")).href;
    const probe = path.join(root, "probe.mjs");
    const report = path.join(root, "report.json");
    await fs.writeFile(
      probe,
      `import ${JSON.stringify(runner)};
import fs from 'node:fs';
fs.writeFileSync(${JSON.stringify(report)}, JSON.stringify({display:process.env.DISPLAY, authority:process.env.XAUTHORITY, wayland:process.env.WAYLAND_DISPLAY, socket:process.env.WAYLAND_SOCKET, mode:fs.statSync(process.env.XAUTHORITY).mode & 0o777}));
process.exit(7);
`,
    );
    const env = {
      ...process.env,
      DISPLAY: ":desktop",
      WAYLAND_DISPLAY: "wayland-desktop",
      WAYLAND_SOCKET: "12",
      GORAK_TEST_VISIBLE: "0",
      GORAK_TEST_VIRTUAL_DISPLAY: "0",
      XVFB_EXECUTABLE: path.join(root, "missing"),
    };
    try {
      const missing = spawnSync(process.execPath, [probe], {
        env,
        encoding: "utf8",
        timeout: 15000,
      });
      assert.equal(missing.status, 1);
      assert.match(missing.stderr, /No desktop window was opened/);
      await assert.rejects(fs.access(report));
      const fake = path.join(root, "fake-Xvfb");
      await fs.writeFile(
        fake,
        "#!/usr/bin/env node\nrequire('node:fs').writeSync(3, '417\\n');setInterval(()=>{},1000);\n",
        { mode: 0o755 },
      );
      const isolated = spawnSync(process.execPath, [probe], {
        env: { ...env, XVFB_EXECUTABLE: fake },
        encoding: "utf8",
        timeout: 15000,
      });
      assert.equal(isolated.status, 7, isolated.stderr);
      const result = JSON.parse(await fs.readFile(report, "utf8"));
      assert.equal(result.display, ":417");
      assert.equal(result.wayland, undefined);
      assert.equal(result.socket, undefined);
      assert.equal(result.mode, 0o600);
      await assert.rejects(
        fs.access(result.authority),
        "Private display credentials are cleaned up",
      );
    } finally {
      await fs.rm(root, { recursive: true, force: true });
    }
  },
);
