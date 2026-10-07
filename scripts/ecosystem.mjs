import { readFileSync } from "node:fs";
const read = (file) =>
  readFileSync(new URL(`../${file}`, import.meta.url), "utf8");
export function manifest(text) {
  const result = {};
  for (const line of text.split(/\r?\n/)) {
    const match = /^(\w+)\s*=\s*(?:"([^"]+)"|(\d+))\s*(?:#.*)?$/.exec(line);
    if (match) {
      if (match[1] in result)
        throw Error(`Duplicate ecosystem key: ${match[1]}`);
      result[match[1]] = match[2] ?? Number(match[3]);
    } else if (line.trim() && !line.trim().startsWith("#"))
      throw Error("Invalid ecosystem manifest");
  }
  return result;
}
export const ecosystem = manifest(read("ecosystem.toml"));
export function verifyDependencies(installed = false) {
  for (const name of [
    "gorak_revision",
    "lsp_revision",
    "frame_designer_revision",
  ])
    if (!/^v\d+\.\d+\.\d+(?:-[\w.-]+)?$/.test(ecosystem[name]))
      throw Error(`Invalid ${name}`);
  if (!Number.isInteger(ecosystem.source_version))
    throw Error("Invalid source_version");
  const server = JSON.parse(read("server.json"));
  if (server.tag !== ecosystem.lsp_revision)
    throw Error("LSP pin disagrees with ecosystem.toml");
  const pkg = JSON.parse(read("package.json"));
  const lock = JSON.parse(read("package-lock.json"));
  const version = ecosystem.frame_designer_revision.slice(1);
  const archive = `https://github.com/dougwhite/gorak-frame-designer/releases/download/v${version}/gorak-frame-designer-${version}.tgz`;
  const dependency = lock.packages["node_modules/gorak-frame-designer"];
  if (
    pkg.dependencies["gorak-frame-designer"] !== archive ||
    lock.packages[""].dependencies["gorak-frame-designer"] !== archive ||
    dependency.resolved !== archive ||
    dependency.version !== version ||
    !dependency.integrity
  )
    throw Error("Designer dependency/lock disagrees with ecosystem.toml");
  if (
    installed &&
    JSON.parse(read("node_modules/gorak-frame-designer/package.json"))
      .version !== version
  )
    throw Error("Installed designer disagrees with ecosystem.toml; run npm ci");
}
