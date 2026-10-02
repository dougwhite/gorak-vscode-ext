# gorak OpenROAD for VS Code

Search and explore exported [gorak](https://github.com/dougwhite/gorak)/OpenROAD source: definitions, references, outline, hover, completion and syntax highlighting. The native server is bundled; no Rust, Python, database or OpenROAD installation is needed.

1. Download the Windows x64 or Linux x64 VSIX from [Releases](https://github.com/dougwhite/gorak-vscode-ext/releases).
2. In VS Code, run **Extensions: Install from VSIX**, then reload. Disable other OpenROAD language extensions if they conflict.
3. Open and trust the folder containing `gorak.json`. Wait for the gorak index status, then use **F12**, **Shift+F12**, or **gorak: Find All References (Full Lines)**.

Install a newer VSIX the same way; incompatible caches rebuild automatically. Reinstall the previous VSIX to roll back. Use **gorak: Restart Language Server**, **gorak: Rebuild Index**, or **gorak: Copy Diagnostic Summary** when reporting issues.

Alpha: diagnostics are advisory, not compiler results; dynamic calls, image-only dependencies and some preprocessing cannot be fully resolved. Interactive requests take priority over workspace searches; individual large-file reads or parses can still delay responses. Files are never synced to OpenROAD. No telemetry or source upload; local caches may contain source. Editing and rename remain available, so review edits before applying them.

Windows x64 is the primary target. For Remote SSH/WSL, use the package matching the extension host. MIT licensed.

Development: `npm ci`, `npm run fetch:server`, `npm run verify`, `npm run test:editor`. Release instructions: [RELEASING.md](RELEASING.md).
