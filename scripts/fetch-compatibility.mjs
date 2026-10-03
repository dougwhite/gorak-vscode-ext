import { mkdirSync, existsSync } from "node:fs";
import { checkout, tag, git, verifyCheckout } from "./compatibility-pin.mjs";
import { verifyDependencies } from "./ecosystem.mjs";
verifyDependencies();
git("check-ref-format", tag);
mkdirSync(checkout, { recursive: true });
if (
  existsSync(`${checkout}/.git`) &&
  git("-C", checkout, "status", "--porcelain", "--untracked-files=all")
)
  throw Error("Fixture checkout has local changes; refusing to overwrite them");
git("init", checkout);
git(
  "-C",
  checkout,
  "fetch",
  "--depth=1",
  "https://github.com/dougwhite/gorak.git",
  `+${tag}:${tag}`,
);
git("-C", checkout, "checkout", "--detach", `${tag}^{commit}`);
console.log(`Verified ${tag}: ${verifyCheckout()}`);
