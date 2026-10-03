# Upstream compatibility

`ecosystem.toml` pins the source contract and published dependencies. Run:

```sh
npm ci
npm run fetch:server
npm run fetch:compatibility
npm run verify
npm run package
npm run test:compatibility
```

The fetcher resolves the explicit gorak release tag into ignored `.ci/gorak`.
Certification refuses missing, dirty, wrong-tag or wrong-contract fixtures and
copies `compatibility/project` into a disposable workspace. Never edit the checkout.
The server manifest checksum stays in `server.json`; the designer archive integrity
stays in `package-lock.json`. Fetch/build reject disagreement with the ecosystem pin.

The installed-extension harness installs the VSIX into an isolated profile and
checks bundled runtime identity before testing automatic activation, language modes,
include/embedded-script definitions, outline block locations, and designer/raw-source
commands. The rendered-webview harness then loads that installed extension, changes
`quantity.xleft`, checks dirty state and keyboard/menu undo/redo, saves, and compares
all fixture bytes. Only the requested attribute value may change. No source-checkout
server or designer implementation is imported by certification.

The outline is an executable-block outline (`INITIALIZE`, `ON click`), not a field
inventory. VS Code may expose flattened `SymbolInformation`; locations are checked
against original source. Class navigation targets the `classsource` metadata header.
Table/prototype edits, reconstruction, native Workbench behavior and full language
coverage are outside this extension certification; standalone suites own their units.

`VSCODE_EXECUTABLE` selects a local editor. Otherwise the installed harness downloads
stable VS Code. CI runs certification alongside the unchanged development, restart,
and upgrade/rollback suites on Linux/Windows and Windows VS Code 1.93.0. A graphical
display is required (CI uses Xvfb on Linux). Failures retain disposable profile logs;
the rendered test prints its screenshot directory. Missing fixtures are errors, never
skips. No database connection is made.
