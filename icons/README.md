# gorak icons

Light/dark SVG masters from gorak-file-icons.zip provide three 16 px language
icons: green W4GL, blue WML, and the ork for the filename `gorak.json`.
Ordinary JSON and TOML files retain their existing language and theme icons.

The project ork derives from `docs/branding/gorak-icon-small.svg` in
[dougwhite/gorak](https://github.com/dougwhite/gorak), blob
`8dfd2bcd50d86849ec795bbb6b26a6fb0efceabb`. The two document symbols were drawn
for gorak; no OpenROAD product artwork was copied. SVG assets have no fonts,
external references or raster images.

`gorak.png` is the existing 256 px `docs/branding/gorak-icon-256.png` from the
same repository. The extension manifest uses it for the extension list and
details page, including Marketplace presentation when published.

These are language fallback icons; the selected icon theme may override or
suppress them. The extension does not change the user's themes or settings.

`gorak.json` uses `gorak-project` by default, delegating strict JSON services
and highlighting to VS Code's built-in JSON support. Disable
`gorak.projectFileIcon.enabled` in Settings to restore ordinary JSON mode,
JSON-only extensions and `[json]` preferences. The resource-scoped setting
updates open and newly opened project files without changing their contents.
Explicit `files.associations` overrides take precedence in either mode.
The project schema remains available in both modes.
