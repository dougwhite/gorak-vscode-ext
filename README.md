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

WML files open in the embedded [gorak frame designer](https://github.com/dougwhite/gorak-frame-designer), enforced as a **read-only viewer** for this release. Selection, property inspection, zoom/pan and source navigation remain available. The palette, resize handles and editing menus are hidden; properties cannot be changed. The extension also rejects edit, save, undo and redo messages from the viewer.

Use **View → Raw WML** to edit source and the editor title's **Open Frame Designer** button to return. Raw WML and companion `.w4gl` documents retain normal VS Code editing, save and history behavior; the viewer follows their changes. Set `gorak.frameDesigner.enabled` to `false` to use text editors by default. Explicit VS Code **Reopen Editor With** associations take precedence. Invalid frames retain access to **View → Raw WML**.

The base component retains editing with `readOnly = false` (its default). The extension always sets `readOnly = true`; no `.env` or user setting enables designer editing in this release. A future project policy can use the same component mode.

Viewer checks: `npm run test:designer` exercises the rendered webview in a disposable VS Code profile. `npm run test:editor` verifies rejected write messages against real documents and refresh after raw-source edits. Run both on Windows as well as Linux. `GORAK_VSIX_TARGET=win32-x64` can prepare a Windows package from Linux; this does not run Windows tests.
