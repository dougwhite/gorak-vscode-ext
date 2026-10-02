import fs from "node:fs/promises";
import crypto from "node:crypto";
const pin = JSON.parse(await fs.readFile("server.json", "utf8"));
const platform = `${process.platform}-${process.arch}`;
const base = `https://github.com/${pin.repository}/releases/download/${pin.tag}/`;
async function download(name, digest) {
  const response = await fetch(base + name);
  if (!response.ok)
    throw new Error(`Server download failed: ${response.status} ${name}`);
  const bytes = Buffer.from(await response.arrayBuffer());
  if (crypto.createHash("sha256").update(bytes).digest("hex") !== digest)
    throw new Error(`Server checksum mismatch: ${name}`);
  return bytes;
}
const manifest = JSON.parse(await download("release.json", pin.sha256));
if (`v${manifest.version}` !== pin.tag)
  throw new Error("Server version mismatch");
const asset = manifest.platforms[platform];
if (!asset) throw new Error(`Unsupported extension host: ${platform}`);
await fs.mkdir("server", { recursive: true });
const executable = "gorak-lsp" + (process.platform === "win32" ? ".exe" : "");
await fs.writeFile(
  `server/${executable}`,
  await download(asset.name, asset.sha256),
  { mode: 0o755 },
);
await fs.writeFile(
  "server/THIRD_PARTY_NOTICES.md",
  await download("THIRD_PARTY_NOTICES.md", manifest.noticesSha256),
);
await fs.writeFile(
  "server/version.json",
  JSON.stringify({ version: manifest.version, platform, sha256: asset.sha256 }),
);
console.log(
  `Fetched verified Gorak server ${manifest.version} for ${platform}`,
);
