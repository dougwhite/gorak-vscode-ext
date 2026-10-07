// Linux editor tests run on an authenticated virtual display, never the desktop.
// Import before starting VS Code. Child test processes inherit the display.
import { spawn } from "node:child_process";
import { randomBytes } from "node:crypto";
import fs from "node:fs/promises";
import { existsSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { once } from "node:events";

if (
  process.platform === "linux" &&
  process.env.GORAK_TEST_VISIBLE !== "1" &&
  process.env.GORAK_TEST_VIRTUAL_DISPLAY !== "1"
) {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), "gorak-display-"));
  const authority = path.join(directory, "Xauthority");
  const cookie = randomBytes(16);
  // Xauthority: FamilyWild, empty address, display number, protocol, cookie.
  const field = (value) => {
    const bytes = Buffer.from(value);
    const length = Buffer.alloc(2);
    length.writeUInt16BE(bytes.length);
    return Buffer.concat([length, bytes]);
  };
  const writeAuthority = (display) =>
    fs.writeFile(
      authority,
      Buffer.concat([
        Buffer.from([255, 255]),
        field(""),
        field(display),
        field("MIT-MAGIC-COOKIE-1"),
        field(cookie),
      ]),
      { mode: 0o600 },
    );
  await writeAuthority("0");
  const executable =
    process.env.XVFB_EXECUTABLE ??
    (existsSync(".vscode-test/Xvfb")
      ? path.resolve(".vscode-test/Xvfb")
      : "Xvfb");
  const display = spawn(
    executable,
    [
      "-displayfd",
      "3",
      "-screen",
      "0",
      "1280x900x24",
      "-nolisten",
      "tcp",
      "-auth",
      authority,
    ],
    { stdio: ["ignore", "ignore", "inherit", "pipe"] },
  );
  let child;
  const stop = () => {
    child?.kill();
    display.kill();
  };
  process.on("SIGINT", stop);
  process.on("SIGTERM", stop);
  let code = 1;
  try {
    const number = await new Promise((resolve, reject) => {
      const timer = setTimeout(
        () => reject(Error("Xvfb startup timed out")),
        10000,
      );
      let result = "";
      display.once("error", reject);
      display.once("exit", () => reject(Error("Xvfb exited during startup")));
      display.stdio[3].on("data", (chunk) => {
        result += chunk;
        if (/^\d+\n$/.test(result)) {
          clearTimeout(timer);
          resolve(result.trim());
        }
      });
      display.once("error", () => clearTimeout(timer));
      display.once("exit", () => clearTimeout(timer));
    });
    await writeAuthority(number);
    const env = {
      ...process.env,
      DISPLAY: `:${number}`,
      XAUTHORITY: authority,
      GORAK_TEST_VIRTUAL_DISPLAY: "1",
      XDG_SESSION_TYPE: "x11",
    };
    delete env.WAYLAND_DISPLAY;
    delete env.WAYLAND_SOCKET;
    console.log(
      `Editor tests use virtual display :${number}; desktop focus is unaffected.`,
    );
    child = spawn(process.execPath, process.argv.slice(1), {
      stdio: "inherit",
      env,
    });
    [code] = await once(child, "exit");
  } catch (error) {
    console.error(
      `${error.message}\nLinux editor tests require Xvfb. Install it or set XVFB_EXECUTABLE. No desktop window was opened. Set GORAK_TEST_VISIBLE=1 only for intentional visible testing.`,
    );
  } finally {
    stop();
    if (display.exitCode === null && display.signalCode === null && display.pid)
      await once(display, "exit");
    await fs.rm(directory, { recursive: true, force: true });
  }
  process.exit(code ?? 1);
}
