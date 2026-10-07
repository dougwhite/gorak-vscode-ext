# gorak OpenROAD for VS Code

Search and explore exported [gorak](https://github.com/dougwhite/gorak)/OpenROAD source: definitions, references, outline, hover, completion and syntax highlighting. The native server is bundled; no Rust, Python, database or OpenROAD installation is needed.

1. Download the Windows x64 or Linux x64 VSIX from [Releases](https://github.com/dougwhite/gorak-vscode-ext/releases).
2. In VS Code, run **Extensions: Install from VSIX**, then reload. Disable other OpenROAD language extensions if they conflict.
3. Open and trust the folder containing `gorak.json`. Wait for the gorak index status, then use **F12**, **Shift+F12**, or **gorak: Find All References (Full Lines)**.

Install a newer VSIX the same way; incompatible caches rebuild automatically. Reinstall the previous VSIX to roll back. Use **gorak: Restart Language Server**, **gorak: Rebuild Index**, or **gorak: Copy Diagnostic Summary** when reporting issues.

Alpha: diagnostics are advisory, not compiler results; dynamic calls, image-only dependencies and some preprocessing cannot be fully resolved. Interactive requests take priority over workspace searches; individual large-file reads or parses can still delay responses. Files are never synced to OpenROAD. No telemetry or source upload; local caches may contain source. Editing and rename remain available, so review edits before applying them.

Windows x64 is the primary target. For Remote SSH/WSL, use the package matching the extension host. MIT licensed.

Development: `npm ci`, `npm run fetch:server`, `npm run verify`, `npm run test:editor`. Release instructions: [RELEASING.md](RELEASING.md).

Native stylesheet JSON has completion and structural validation. It describes creation styles only; field analysis uses explicit WML values. Older palette files and `gorak_style` require a fresh CLI export.

WML files open in the embedded [gorak frame designer](https://github.com/dougwhite/gorak-frame-designer) (pinned to `v0.1.0-alpha.1`). Use **View → Raw WML** to edit source and the editor title's **Open Frame Designer** button to return. Set `gorak.frameDesigner.enabled` to `false` to use text editors by default. Explicit VS Code **Reopen Editor With** associations take precedence.

Designer edits use VS Code's in-memory text documents: dirty tabs, undo/redo, save, revert and recovery follow normal editor behavior (including your Auto Save setting). **File → Save** or **Ctrl+S** in the designer saves WML and its companion. Window properties stored in `.w4gl` open a companion source tab and mark its own tab dirty; saving from a text editor saves only that file. Repository, application and frame native stylesheets are loaded when the designer opens. Invalid or unsupported frames show an error with **View → Raw WML** still available. The designer remains alpha; manual Workbench comparison is still needed.

Designer checks: `npm run test:designer` exercises the rendered webview in a disposable VS Code profile. On both Linux and Windows, manually check dragging/resizing, property changes, the dirty tab before save, Ctrl+S, undo/redo, source switching, closing with unsaved changes, window properties in the companion, and disabling the designer. `GORAK_VSIX_TARGET=win32-x64` can be set for `fetch:server` and `package` to prepare a Windows package from Linux; this does not run Windows tests.

The compact **Group** menu supports Flexible Form, Subform, Ungroup, and vertical/horizontal Stack Field. Shift-click to select multiple sibling fields. Tablefield, Matrixfield and Viewport grouping remain disabled, matching the desktop designer. Menus support arrow keys, Escape and dismissal by clicking outside.

File icons: W4GL uses a green code icon, WML a blue frame, and the filename
`gorak.json` a gorak ork. These are [language default icons](https://code.visualstudio.com/api/extension-guides/file-icon-theme#language-default-icons): your selected icon theme can override or suppress them. The extension does not change your icon theme, color theme or settings. Metadata and field-defaults artwork is bundled for future use; ordinary TOML/JSON associations are unchanged.

`gorak.json` uses **gorak Project (JSON)** (`gorak-project`). VS Code's built-in
JSON extension supplies completion, validation and formatting through
`jsonLanguageParticipants`; highlighting includes VS Code's JSON grammar. The
project schema describes CLI metadata, requires `name`, and permits additional
properties. Comments and trailing commas remain invalid JSON. This integration
requires the built-in **JSON Language Features** extension to be enabled.

A custom language ID does not inherit `[json]` editor overrides. Apply those
preferences to `[gorak-project]` as well (or use a combined
`[json][gorak-project]` section). Third-party snippets, commands and formatters
that select only `json` will not automatically support `gorak-project`; the
built-in formatter works. For a JSON-only tool, explicitly associate
`"gorak.json": "json"` in `files.associations`, accepting the ordinary JSON icon.
The existing workspace trust requirement still applies.

Icon/JSON acceptance: `npm run test:icons` uses a disposable graphical VS Code
profile; `VSCODE_EXECUTABLE` selects a version and `GORAK_INSTALLED_EXTENSION`
can point at an installed VSIX directory. `npm run test:editor` also exercises
language selection and built-in JSON services. No test changes global settings.
