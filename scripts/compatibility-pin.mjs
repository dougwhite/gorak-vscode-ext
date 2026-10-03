// Based on the merged gorak LSP and frame designer fetchers.
import { readFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { ecosystem, manifest, verifyDependencies } from "./ecosystem.mjs";
export const checkout = fileURLToPath(
  new URL("../.ci/gorak/", import.meta.url),
);
export const tag = `refs/tags/${ecosystem.gorak_revision}`;
export function git(...args) {
  return execFileSync("git", args, { encoding: "utf8" }).trim();
}
export function verifyCheckout() {
  verifyDependencies();
  const head = git("-C", checkout, "rev-parse", "HEAD");
  if (head !== git("-C", checkout, "rev-parse", "--verify", `${tag}^{commit}`))
    throw Error("Fixture checkout must match the pinned release tag");
  if (git("-C", checkout, "status", "--porcelain", "--untracked-files=all"))
    throw Error("Fixture checkout has local changes");
  if (
    manifest(readFileSync(`${checkout}/ecosystem.toml`, "utf8"))
      .source_version !== ecosystem.source_version
  )
    throw Error("Pinned source_version mismatch");
  return head;
}
