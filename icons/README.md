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

`gorak.json` uses `gorak-project`, delegating completion, strict JSON validation
and formatting to VS Code's built-in JSON extension. Highlighting includes the
built-in JSON grammar. `[json]` editor settings and third-party tools selecting
only `json` do not automatically apply: use `[gorak-project]` preferences or a
combined `[json][gorak-project]` section. Explicitly associating `gorak.json`
with `json` restores JSON-only tools and the ordinary JSON icon.
