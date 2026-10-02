import fs from "node:fs";
import path from "node:path";
export function editorExecutable() {
  if (process.env.VSCODE_EXECUTABLE) return process.env.VSCODE_EXECUTABLE;
  if (process.platform !== "win32") return "code";
  for (const root of [
    process.env.ProgramFiles,
    process.env.LOCALAPPDATA && path.join(process.env.LOCALAPPDATA, "Programs"),
  ]) {
    if (!root) continue;
    const executable = path.join(root, "Microsoft VS Code", "Code.exe");
    if (fs.existsSync(executable)) return executable;
  }
  throw new Error("Set VSCODE_EXECUTABLE to Code.exe");
}
