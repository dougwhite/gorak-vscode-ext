# Local component prerelease

`gorak-frame-designer-0.1.0-alpha.3.readonly.1.tgz` is a local, unpublished runtime-only package built from component commit `1ab8703` (based on upstream `33c69bc`). The package lock records its integrity. It contains the reusable component's opt-in `readOnly` property; editing remains the default for other hosts.

Reproduce in a clean gorak-frame-designer checkout at component commit `1ab8703`: run `npm ci`, `npm run build`, then `npm run release:package`. The component change is [PR #9](https://github.com/dougwhite/gorak-frame-designer/pull/9), commit `1ab8703`. The source change is maintained in the sibling `gorak-frame-designer` checkout on `codex/read-only-mode`. No private fixtures or unrelated local changes are included.

After the component change is reviewed and published, replace the file dependency and lock entry with its GitHub release archive, update `frame_designer_revision`, remove `frame_designer_archive` from `ecosystem.toml`, and remove this directory. The local archive keeps clean extension installs working in the meantime. It is excluded from the VSIX; only the bundled runtime is shipped.
