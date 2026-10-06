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
all fixture bytes. It also edits and saves companion window width, preserving the
component header, inline image metadata, and script. Only those two requested
values may change. No source-checkout
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
skips. CI runs every editor suite and retains failure status if any suite fails.
No database connection is made.

## Source contract 3

The `v0.1.0-alpha.1.dev.46` fixture adds saved-query sidecars, external PNG
references, inline window-icon metadata, and ordered class-icon entries (including
built-in references and native image details). The designer save check compares
all companion, sidecar and binary asset bytes, as well as the exact WML edit.
Query-expression navigation and image rendering are not certified by these checks.

CI also runs `node scripts/test-installed.mjs --compatibility --frame-template`.
This changes only the disposable fixture's component header and adds a template
call. Navigation must target the W4GL `frametemplate` declaration; falling back to
the WML declaration is a failure. The same installed designer acceptance then runs
against that template. The canonical upstream checkout remains unchanged.

The required dependency versions are LSP `v0.9.0-alpha.6` and designer
`v0.1.0-alpha.2`. Earlier releases fail frame-template acceptance. Certification
uses the pinned published assets, with checksum and package-integrity validation;
source-checkout passes cannot substitute for installed-VSIX checks. CI requires
both canonical and template variants on Linux and Windows, including the minimum
supported Windows editor version.
