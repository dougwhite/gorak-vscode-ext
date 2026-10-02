# Working on Gorak OpenROAD for VS Code

This is a thin TypeScript editor client for the standalone Gorak LSP for Actian OpenROAD source in Gorak projects. It is separate from the Gorak Python CLI.

- Run `npm ci`, then `npm run verify` and `npm run format:check` for changes. `npm run test:editor` runs an isolated installed VS Code extension host; it needs a graphical display. Use `VSCODE_EXECUTABLE` for an alternate executable.
- Keep analysis in `gorak-lsp-rs`; do not duplicate its parser or server here. Fetch the pinned server release before building the extension. Keep the VSIX runtime-only and never publish private corpora or build-machine paths. Keep client, grammar and editor tests here.
- Keep original UTF-16 document offsets through TOML and embedded XML script analysis. Add position-sensitive tests for parser changes.
- Use neutral synthetic fixtures only. Do not copy private application source or Actian extension implementation, grammar, caches, or other proprietary assets.
- Prefer missing navigation over inventing a symbol binding. Rename must refuse unsupported or ambiguous scopes; expand its scope only with safety tests.
- This extension must not push, compile, execute, or connect to an OpenROAD database automatically. It analyzes local source and returns editor edits.
- Preserve unrelated work. Package with `npm run package`; do not publish, install globally, or push a repository unless requested.
