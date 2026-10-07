# Upstream compatibility

`ecosystem.toml` pins source contract 12, gorak `v0.1.0-alpha.1.dev.83`,
LSP `v0.9.0-alpha.7` and designer `v0.1.0-alpha.4`. Run:

```sh
npm ci
npm run fetch:server
npm run fetch:compatibility
npm run verify
npm run format:check
npm run package
node scripts/ci-editor.mjs
```

The fetcher resolves the explicit gorak release tag into ignored `.ci/gorak`.
Certification refuses missing, dirty, wrong-tag or wrong-contract fixtures and
copies `compatibility/project` into a disposable workspace. Never edit the checkout.
The server manifest checksum stays in `server.json`; the designer archive integrity
stays in `package-lock.json`. Fetch/build reject disagreement with the ecosystem pin.
Released server/designer assets supply the implementation; sibling source checkouts
are not used. The extension adds no source parser or independent source-version gate.

The installed harness installs the generated VSIX into an isolated profile and
checks the bundled binary hash, server version, designer dependency and exact
extension/webview build bytes. It tests activation, language modes, includes,
embedded-script definitions and original outline locations. A frame-template
variant verifies navigation to its W4GL header. Upstream fixtures remain pristine.

Independent `test/fixtures/contract12` source is copied only into that disposable
workspace. VS Code providers must resolve native PRIVATE/default attributes and
structured declarations, preserve original UTF-16 locations after an astral character,
return exact references, offer member completion and report a reference-type warning
at the original token. Safe local rename remains a preview; unsupported attribute
rename and implicit core rename must be refused. Implicit core navigation must open
the builtin document. Remarks, duplicate tags and empty/whitespace values remain
unchanged. These tests exercise the released server through the installed client.

The rendered designer harness loads both the upstream frame and an independent
frame through the installed VSIX. It checks read-only inspection, hidden editing
controls, blocked drag/delete/save/history shortcuts, zoom, Raw WML switching and
byte preservation across every source/sidecar/image file. The independent frame
also checks stylesheet absence, zero-size geometry, nested viewport content,
whitespace scalar/empty row/opaque XML transport and source navigation to the
nested field's exact selection length. The reusable component retains its editing
capability; the extension sets readOnly and rejects writes at the host boundary.
Development-host tests separately cover raw TextDocument editing, dirty/save state,
viewer refresh, filename associations, icons and opt-outs.

CI runs unit/build/format/package checks, development host, rendered designer,
restart, installed upgrade/rollback, and both installed compatibility variants on
Linux and Windows, including Windows VS Code 1.93.0. Linux uses Xvfb; no normal user
profile is used. Failures retain disposable logs and screenshots. Missing fixtures
are errors. No database connection is made.

This certifies editor integration. Native Workbench import/edit acceptance,
reconstruction, query authoring and full OpenROAD language coverage remain outside
this extension's scope. CI-installed host evidence is separate from a human's
interactive desktop acceptance; neither source tests nor installation alone proves
that acceptance. Merging, tagging and publishing require owner authorization.
