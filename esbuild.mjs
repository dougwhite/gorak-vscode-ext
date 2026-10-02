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
  external: ["vscode"],
  sourcemap: false,
  metafile: true,
});
const packages = new Set(
  Object.keys(result.metafile.inputs).flatMap((input) => {
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
}
await fs.writeFile("THIRD_PARTY_NOTICES.md", notices);

const executable = process.platform === "win32" ? ".exe" : "";
const server = JSON.parse(await fs.readFile("server/version.json", "utf8"));
const pin = JSON.parse(await fs.readFile("server.json", "utf8"));
if (
  server.platform !== `${process.platform}-${process.arch}` ||
  `v${server.version}` !== pin.tag
)
  throw new Error(
    "Server target/version does not match: run npm run fetch:server",
  );
const { createHash } = await import("node:crypto");
const bytes = await fs.readFile("server/gorak-lsp" + executable);
if (createHash("sha256").update(bytes).digest("hex") !== server.sha256)
  throw new Error("Bundled server checksum mismatch");
await fs.writeFile("dist/gorak-lsp" + executable, bytes, { mode: 0o755 });
await fs.copyFile("server/version.json", "dist/server-version.json");
await fs.appendFile(
  "THIRD_PARTY_NOTICES.md",
  "\n" + (await fs.readFile("server/THIRD_PARTY_NOTICES.md", "utf8")),
);
