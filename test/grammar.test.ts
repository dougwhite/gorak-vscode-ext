import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import { Registry, parseRawGrammar, INITIAL } from "vscode-textmate";
import { loadWASM, OnigScanner, OnigString } from "vscode-oniguruma";

test("TextMate grammars tokenize TOML, 4GL, WML and embedded scripts", async () => {
  const wasm = await fs.readFile(
    require.resolve("vscode-oniguruma/release/onig.wasm"),
  );
  await loadWASM(
    wasm.buffer.slice(wasm.byteOffset, wasm.byteOffset + wasm.byteLength),
  );
  const names: Record<string, string> = {
    "source.gorak": "gorak",
    "source.gorak.4gl": "openroad",
    "text.xml.gorak": "wml",
  };
  const registry = new Registry({
    onigLib: Promise.resolve({
      createOnigScanner: (sources) => new OnigScanner(sources),
      createOnigString: (text) => new OnigString(text),
    }),
    loadGrammar: async (scope) => {
      const filename = `syntaxes/${names[scope]}.tmLanguage.json`;
      return parseRawGrammar(await fs.readFile(filename, "utf8"), filename);
    },
  });
  const grammar = (await registry.loadGrammar("source.gorak"))!;
  let state = INITIAL;
  for (const [line, scope] of [
    ["[classsource]", "entity.name.section.toml"],
    ['name = "example"', "string.quoted.double.toml"],
    ["===", "punctuation.separator.gorak"],
    ["METHOD Save() = { RETURN 1; }", "keyword.control.openroad"],
  ]) {
    const result = grammar.tokenizeLine(line, state);
    state = result.ruleStack;
    assert.ok(
      result.tokens.some((token) => token.scopes.includes(scope)),
      `${line}: ${JSON.stringify(result.tokens)}`,
    );
  }
  for (const [line, scope] of [
    ["CurObject = CurSession;", "variable.language.openroad"],
    ["code = ER_OK;", "support.constant.openroad"],
  ]) {
    const tokens = grammar.tokenizeLine(line, state).tokens;
    assert.ok(
      tokens.some((t) => t.scopes.includes(scope)),
      line,
    );
  }
  for (const line of ["// ER_OK CurObject", "'ER_OK CurObject'"]) {
    const tokens = grammar.tokenizeLine(line, state).tokens;
    assert.ok(
      !tokens.some(
        (t) =>
          t.scopes.includes("support.constant.openroad") ||
          t.scopes.includes("variable.language.openroad"),
      ),
      line,
    );
  }
  const wml = (await registry.loadGrammar("text.xml.gorak"))!;
  const line =
    '<buttonfield name="save"><script><![CDATA[ON click = { RETURN; }]]></script></buttonfield>';
  const result = wml.tokenizeLine(line, INITIAL);
  assert.ok(
    result.tokens.some((token) =>
      token.scopes.includes("keyword.control.openroad"),
    ),
  );
  const closing = result.tokens.find(
    (token) => token.startIndex >= line.lastIndexOf("</buttonfield>") + 2,
  );
  assert.ok(closing?.scopes.includes("entity.name.tag.xml"));
  const instruction =
    "<script>INITIALIZE = { <?ingres_invalidxmlchar 7?> RETURN; }</script>";
  const instructionTokens = wml.tokenizeLine(instruction, INITIAL).tokens;
  assert.ok(
    instructionTokens.some((t) => t.scopes.includes("meta.preprocessor.xml")),
  );
  assert.ok(
    instructionTokens.some((t) =>
      t.scopes.includes("keyword.control.openroad"),
    ),
  );
  const literal =
    "<script><![CDATA[INITIALIZE = { MESSAGE '<?ingres_invalidxmlchar 7?>'; }]]></script>";
  assert.ok(
    !wml
      .tokenizeLine(literal, INITIAL)
      .tokens.some((t) => t.scopes.includes("meta.preprocessor.xml")),
  );
  registry.dispose();
});
