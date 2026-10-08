import { verifyDependencies } from "./scripts/ecosystem.mjs";
verifyDependencies(true);
import { build } from "esbuild";
import fs from "node:fs/promises";
import path from "node:path";
const result = await build({
  entryPoints: ["src/extension.ts"],
  outdir: "dist",
  bundle: true,
  platform: "node",
  format: "cjs",
  target: "node20",
  external: ["vscode", "gorak-frame-designer/image-assets"],
  sourcemap: false,
  metafile: true,
});
const browserResult = await build({
  entryPoints: ["src/frame-webview.mts"],
  outfile: "dist/frame-webview.js",
  bundle: true,
  platform: "browser",
  format: "iife",
  target: "es2022",
  metafile: true,
});
await build({
  entryPoints: ["src/component-webview.mts"],
  outfile: "dist/component-webview.js",
  bundle: true,
  platform: "browser",
  format: "iife",
  target: "es2022",
});
const packages = new Set(
  Object.keys({
    ...result.metafile.inputs,
    ...browserResult.metafile.inputs,
  }).flatMap((input) => {
    const match = /^node_modules\/((?:@[^/]+\/)?[^/]+)/.exec(input);
    return match ? [match[1]] : [];
  }),
);
let notices =
  "# Bundled third-party notices\n\nGenerated from the packages included in the JavaScript bundles.\n";
for (const name of [...packages].sort()) {
  const directory = path.join("node_modules", name);
  const metadata = JSON.parse(
    await fs.readFile(path.join(directory, "package.json"), "utf8"),
  );
  const license = (await fs.readdir(directory)).find((file) =>
    /^licen[sc]e(?:\..+)?$/i.test(file),
  );
  if (!license) throw new Error(`Missing bundled license: ${name}`);
  const licensePath = path.join(directory, license);
  notices += `\n## ${name} ${metadata.version}\n\n${await fs.readFile(licensePath, "utf8")}\n`;
  if (name === "gorak-frame-designer")
    notices +=
      "\n" +
      (await fs.readFile(
        path.join(directory, "THIRD-PARTY-NOTICES.txt"),
        "utf8",
      ));
}
await fs.writeFile("THIRD_PARTY_NOTICES.md", notices);

const target =
  process.env.GORAK_VSIX_TARGET ?? `${process.platform}-${process.arch}`;
if (!["linux-x64", "win32-x64"].includes(target))
  throw new Error(`Unsupported target: ${target}`);
const executable = target.startsWith("win32-") ? ".exe" : "";
await fs.rm(`dist/gorak-lsp${executable ? "" : ".exe"}`, { force: true });
const server = JSON.parse(await fs.readFile("server/version.json", "utf8"));
const pin = JSON.parse(await fs.readFile("server.json", "utf8"));
if (server.platform !== target || `v${server.version}` !== pin.tag)
  throw new Error(
    "Server target/version does not match: run npm run fetch:server",
  );
const { createHash } = await import("node:crypto");
const bytes = await fs.readFile("server/gorak-lsp" + executable);
if (createHash("sha256").update(bytes).digest("hex") !== server.sha256)
  throw new Error("Bundled server checksum mismatch");
const serverStage = `dist/.gorak-lsp-${process.pid}${executable}`;
await fs.writeFile(serverStage, bytes, { mode: 0o755 });
await fs.rename(serverStage, "dist/gorak-lsp" + executable);
await fs.copyFile("server/version.json", "dist/server-version.json");
await fs.appendFile(
  "THIRD_PARTY_NOTICES.md",
  "\n" + (await fs.readFile("server/THIRD_PARTY_NOTICES.md", "utf8")),
);

await fs.mkdir("dist/image-assets/electron", { recursive: true });
await fs.mkdir("dist/image-assets/src", { recursive: true });
for (const file of ["electron/image-assets.cjs", "src/builtin-images.json"])
  await fs.copyFile(
    path.join("node_modules/gorak-frame-designer", file),
    path.join("dist/image-assets", file),
  );
await fs.cp(
  "node_modules/gorak-frame-designer/src/builtin-images",
  "dist/image-assets/src/builtin-images",
  { recursive: true },
);
