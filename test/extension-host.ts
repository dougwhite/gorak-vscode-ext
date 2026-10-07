import { testFileIcons } from "./file-icons-host";
import { testFrameEditor } from "./frame-editor-host";
import * as vscode from "vscode";
import assert from "node:assert/strict";
import path from "node:path";
import fs from "node:fs/promises";

export async function run() {
  await testFileIcons();
  const extension = vscode.extensions.getExtension(
    "dougwhite.gorak-vscode-ext",
  );
  assert.ok(extension, "Development extension is available");
  const api = (await extension.activate()) as {
    indexStatus(): Promise<{
      indexing: boolean;
      files: number;
      parsedFiles: number;
      engine?: string;
    }>;
  };
  assert.equal(
    (await api.indexStatus()).engine,
    "rust",
    "Native server is active",
  );
  const root = extension.extensionPath;
  const uri = vscode.Uri.file(path.join(root, "examples/demo/customer.w4gl"));
  const document = await vscode.workspace.openTextDocument(uri);
  await vscode.window.showTextDocument(document);
  await vscode.languages.setTextDocumentLanguage(document, "gorak-openroad");
  const position = document.positionAt(
    document.getText().indexOf("updated = self"),
  );
  let definitions: vscode.Location[] = [];
  for (let i = 0; i < 50; i++) {
    definitions =
      (await vscode.commands.executeCommand<vscode.Location[]>(
        "vscode.executeDefinitionProvider",
        uri,
        position,
      )) ?? [];
    if (definitions.length) break;
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  assert.equal(definitions.length, 1, "Go to Definition");
  assert.equal(document.getText(definitions[0].range), "updated");
  const refs = await vscode.commands.executeCommand<vscode.Location[]>(
    "vscode.executeReferenceProvider",
    uri,
    position,
  );
  assert.equal(refs?.length, 4, "Find References");
  const edit = await vscode.commands.executeCommand<vscode.WorkspaceEdit>(
    "vscode.executeDocumentRenameProvider",
    uri,
    position,
    "new_balance",
  );
  assert.equal(
    edit?.get(uri).length,
    4,
    "Rename provides four edits without applying them",
  );
  const wml = await vscode.workspace.openTextDocument(
    vscode.Uri.file(path.join(root, "examples/demo/main.wml")),
  );
  await vscode.window.showTextDocument(wml);
  const field = await vscode.commands.executeCommand<vscode.Location[]>(
    "vscode.executeDefinitionProvider",
    wml.uri,
    wml.positionAt(wml.getText().indexOf("amount);")),
  );
  assert.equal(field?.length, 1, "WML field navigation");
  assert.equal(wml.getText(field![0].range), "amount");
  const chain = await vscode.workspace.openTextDocument(
    vscode.Uri.file(path.join(root, "examples/demo/chains.w4gl")),
  );
  await vscode.window.showTextDocument(chain);
  const methodPosition = chain.positionAt(chain.getText().indexOf("Add("));
  const methodDefinitions = await vscode.commands.executeCommand<
    vscode.Location[]
  >("vscode.executeDefinitionProvider", chain.uri, methodPosition);
  assert.equal(
    methodDefinitions?.[0].uri.toString(),
    uri.toString(),
    "Chained method result navigation",
  );
  const hovers = await vscode.commands.executeCommand<vscode.Hover[]>(
    "vscode.executeHoverProvider",
    chain.uri,
    methodPosition,
  );
  assert.ok(hovers?.length, "Chained method hover");
  const completions =
    await vscode.commands.executeCommand<vscode.CompletionList>(
      "vscode.executeCompletionItemProvider",
      chain.uri,
      chain.positionAt(chain.getText().indexOf("Add(") + 2),
    );
  assert.ok(
    completions?.items.some((i) => i.label === "Add"),
    "Chained member completion",
  );
  const signatures = await vscode.commands.executeCommand<vscode.SignatureHelp>(
    "vscode.executeSignatureHelpProvider",
    chain.uri,
    chain.positionAt(chain.getText().indexOf("Add(") + 4),
  );
  assert.match(
    signatures?.signatures[0].label ?? "",
    /amount/,
    "Method signature help",
  );
  const methodEdit = await vscode.commands.executeCommand<vscode.WorkspaceEdit>(
    "vscode.executeDocumentRenameProvider",
    chain.uri,
    methodPosition,
    "Credit",
  );
  assert.ok(
    methodEdit && methodEdit.entries().length >= 3,
    "Method rename preview spans declaration, implementation and callers",
  );
  assert.equal(
    methodEdit!.get(uri).length,
    2,
    "Rename updates metadata and implementation",
  );
  const included = await vscode.workspace.openTextDocument(
    vscode.Uri.file(path.join(root, "examples/demo/included.w4gl")),
  );
  await vscode.window.showTextDocument(included);
  const includedDefinitions = await vscode.commands.executeCommand<
    vscode.Location[]
  >(
    "vscode.executeDefinitionProvider",
    included.uri,
    included.positionAt(included.getText().indexOf("shared_count")),
  );
  assert.ok(
    includedDefinitions?.[0].uri.fsPath.endsWith("shared_locals.w4gl"),
    "Include definition maps to authoring file",
  );
  const outline = await vscode.commands.executeCommand<vscode.DocumentSymbol[]>(
    "vscode.executeDocumentSymbolProvider",
    uri,
  );
  assert.deepEqual(
    outline?.map((s) => s.name),
    ["METHOD Add()"],
    "Outline shows method blocks rather than declarations",
  );
  assert.ok(
    outline![0].range.contains(position),
    "Method outline range contains its body",
  );
  const events = await vscode.commands.executeCommand<vscode.DocumentSymbol[]>(
    "vscode.executeDocumentSymbolProvider",
    wml.uri,
  );
  assert.deepEqual(
    events?.map((s) => s.name),
    ["ON click"],
    "WML event outline",
  );
  assert.equal(
    events![0].detail,
    "calculate",
    "Outline identifies the event field",
  );
  assert.ok(
    wml.getText(events![0].range).endsWith("}"),
    "Event range excludes CDATA markup",
  );
  const classLenses = await vscode.commands.executeCommand<vscode.CodeLens[]>(
    "vscode.executeCodeLensProvider",
    uri,
  );
  assert.equal(classLenses?.[0].command?.command, "gorak.findClassReferences");
  const classReferences = await vscode.commands.executeCommand<
    vscode.Location[]
  >("vscode.executeReferenceProvider", uri, classLenses![0].range.start);
  assert.ok(
    classReferences?.some((r) => r.uri.toString() !== uri.toString()),
    "Class references from metadata header",
  );
  const namedItems =
    await vscode.commands.executeCommand<vscode.CompletionList>(
      "vscode.executeCompletionItemProvider",
      chain.uri,
      chain.positionAt(chain.getText().indexOf("amount =") + 2),
    );
  const amountItem = namedItems?.items.find((i) => i.label === "amount");
  assert.ok(amountItem, "Named argument completion in editor");
  const spacing = await vscode.workspace.openTextDocument(
    vscode.Uri.file(path.join(root, "examples/demo/completion_spacing.w4gl")),
  );
  const spacingAt = spacing.positionAt(
    spacing.getText().lastIndexOf("second =") + 3,
  );
  const spacingItems =
    await vscode.commands.executeCommand<vscode.CompletionList>(
      "vscode.executeCompletionItemProvider",
      spacing.uri,
      spacingAt,
    );
  const second = spacingItems?.items.find((item) => item.label === "second");
  assert.ok(second, "Partially typed parameter completion after comma");
  assert.equal(
    second.insertText,
    " second",
    "Completion inserts a leading space without duplicating equals",
  );
  const secondRange =
    second.range instanceof vscode.Range
      ? second.range
      : second.range?.replacing;
  assert.ok(secondRange);
  assert.equal(
    spacing.getText(secondRange),
    "second",
    "Completion replaces the whole existing parameter",
  );
  const memberItems =
    await vscode.commands.executeCommand<vscode.CompletionList>(
      "vscode.executeCompletionItemProvider",
      spacing.uri,
      spacing.positionAt(spacing.getText().lastIndexOf("saveRecord") + 3),
    );
  assert.ok(
    memberItems?.items.some((item) => item.label === "saveRecord"),
    "Metadata spelling is authoritative",
  );
  const constantUri = vscode.Uri.file(
    path.join(root, "examples/demo/constant_zero.w4gl"),
  );
  await vscode.workspace.openTextDocument(constantUri);
  const declaredConstantHover = await vscode.commands.executeCommand<
    vscode.Hover[]
  >(
    "vscode.executeHoverProvider",
    spacing.uri,
    spacing.positionAt(spacing.getText().indexOf("constant_zero")),
  );
  assert.ok(
    declaredConstantHover
      ?.flatMap((h) =>
        h.contents.map((c) => (typeof c === "string" ? c : c.value)),
      )
      .join(" ")
      .replace(/\\/g, "")
      .replace(/&nbsp;/g, " ")
      .includes("integer = 0"),
    "Declared constant value appears in hover",
  );
  const apiDocument = await vscode.workspace.openTextDocument(
    vscode.Uri.file(path.join(root, "examples/demo/api_usage.w4gl")),
  );
  const apiEditor = await vscode.window.showTextDocument(apiDocument);
  const apiText = apiDocument.getText();
  const parameterAt = apiDocument.positionAt(apiText.indexOf("caption ="));
  const parameterDefinitions = await vscode.commands.executeCommand<
    vscode.Location[]
  >("vscode.executeDefinitionProvider", apiDocument.uri, parameterAt);
  assert.ok(
    parameterDefinitions?.[0].uri.path.endsWith("archive.w4gl"),
    "Named argument navigates to procedure parameter",
  );
  const parameterRefs = await vscode.commands.executeCommand<vscode.Location[]>(
    "vscode.executeReferenceProvider",
    apiDocument.uri,
    parameterAt,
  );
  assert.equal(
    parameterRefs?.length,
    3,
    "Named parameter includes declaration, body and caller",
  );
  const parameterEdit =
    await vscode.commands.executeCommand<vscode.WorkspaceEdit>(
      "vscode.executeDocumentRenameProvider",
      apiDocument.uri,
      parameterAt,
      "labelText",
    );
  assert.equal(
    parameterEdit?.entries().length,
    2,
    "Global procedure parameter rename spans two files",
  );
  assert.equal(
    parameterEdit?.entries().flatMap(([, edits]) => edits).length,
    3,
  );
  const builtinDefinitions = await vscode.commands.executeCommand<
    vscode.Location[]
  >(
    "vscode.executeDefinitionProvider",
    apiDocument.uri,
    apiDocument.positionAt(apiText.indexOf("FieldByName")),
  );
  assert.equal(builtinDefinitions?.[0].uri.scheme, "gorak-builtin");
  const builtinDoc = await vscode.workspace.openTextDocument(
    builtinDefinitions![0].uri,
  );
  assert.equal(
    builtinDoc.getText(builtinDefinitions![0].range),
    "FieldByName",
    "Built-in navigation opens the matching virtual declaration",
  );
  assert.ok(builtinDoc.getText().includes("https://docs.actian.com/"));
  const apiCompletion =
    await vscode.commands.executeCommand<vscode.CompletionList>(
      "vscode.executeCompletionItemProvider",
      apiDocument.uri,
      apiDocument.positionAt(apiText.indexOf("FieldByName") + 3),
    );
  assert.ok(apiCompletion?.items.some((i) => i.label === "FieldByName"));
  const typoStart = apiDocument.positionAt(apiText.indexOf("caption ="));
  await apiEditor.edit((builder) =>
    builder.replace(
      new vscode.Range(typoStart, typoStart.translate(0, 7)),
      "typo",
    ),
  );
  const diagnosticDeadline = Date.now() + 5000;
  while (
    !vscode.languages
      .getDiagnostics(apiDocument.uri)
      .some((d) => d.code === "unknown-argument")
  ) {
    assert.ok(
      Date.now() < diagnosticDeadline,
      "Semantic diagnostic appears after unsaved edit",
    );
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
  await vscode.commands.executeCommand("undo");
  const clearDeadline = Date.now() + 5000;
  while (
    vscode.languages
      .getDiagnostics(apiDocument.uri)
      .some((d) => d.code === "unknown-argument")
  ) {
    assert.ok(
      Date.now() < clearDeadline,
      "Semantic diagnostic clears after undo",
    );
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
  assert.equal(apiDocument.getText(), apiText);
  // Unsaved changes stay in memory; no synthetic source or real source is changed on disk.
  const scratchUri = vscode.Uri.file(
    path.join(root, "examples/demo/editing.w4gl"),
  );
  const scratch = await vscode.workspace.openTextDocument(scratchUri);
  const editor = await vscode.window.showTextDocument(scratch);
  const scratchText = scratch.getText();
  const sizedHover = await vscode.commands.executeCommand<vscode.Hover[]>(
    "vscode.executeHoverProvider",
    scratchUri,
    scratch.positionAt(scratchText.indexOf("RETURN caption") + 8),
  );
  assert.match(
    sizedHover
      ?.flatMap((h) =>
        h.contents.map((c) => (typeof c === "string" ? c : c.value)),
      )
      .join(" ")
      .replace(/\\/g, "") ?? "",
    /VARCHAR\(80\)/,
  );
  const constantHover = await vscode.commands.executeCommand<vscode.Hover[]>(
    "vscode.executeHoverProvider",
    scratchUri,
    scratch.positionAt(scratchText.indexOf("ER_OK") + 2),
  );
  assert.match(
    constantHover
      ?.flatMap((h) =>
        h.contents.map((c) => (typeof c === "string" ? c : c.value)),
      )
      .join(" ") ?? "",
    /ER_OK/,
  );
  const constants = await vscode.commands.executeCommand<vscode.CompletionList>(
    "vscode.executeCompletionItemProvider",
    scratchUri,
    scratch.positionAt(scratchText.indexOf("ER_OK") + 3),
  );
  assert.ok(constants?.items.some((i) => i.label === "ER_FAIL"));
  const blockAt = scratch.positionAt(scratchText.indexOf("    WHILE") + 9);
  const blocks = await vscode.commands.executeCommand<vscode.CompletionList>(
    "vscode.executeCompletionItemProvider",
    scratchUri,
    blockAt,
  );
  const block = blocks?.items.find((i) => i.label === "WHILE block");
  assert.ok(
    block?.insertText instanceof vscode.SnippetString,
    "LSP snippet reaches VS Code",
  );
  await editor.insertSnippet(
    block!.insertText as vscode.SnippetString,
    new vscode.Range(blockAt.translate(0, -5), blockAt),
  );
  assert.ok(
    editor.document.getText().includes("ENDWHILE;"),
    "Snippet inserts closing loop",
  );
  await vscode.commands.executeCommand("undo");
  assert.equal(editor.document.getText(), scratchText, "Snippet edit undone");
  await vscode.commands.executeCommand("gorak.showDiagnostics");
  const errors = vscode.languages
    .getDiagnostics(uri)
    .filter((d) => d.severity === vscode.DiagnosticSeverity.Error);
  assert.deepEqual(errors, []);
  await vscode.commands.executeCommand("gorak.restartServer");
  let restarted;
  const restartDeadline = Date.now() + 10_000;
  do {
    restarted = await api.indexStatus();
    if (!restarted.indexing && restarted.files > 0) break;
    assert.ok(Date.now() < restartDeadline);
    await new Promise((resolve) => setTimeout(resolve, 25));
  } while (true);
  assert.equal(
    restarted.parsedFiles,
    0,
    "Restart reuses cached analysis without reparsing unchanged files",
  );
  const restoredOutline = await vscode.commands.executeCommand<
    vscode.DocumentSymbol[]
  >("vscode.executeDocumentSymbolProvider", uri);
  assert.equal(
    restoredOutline?.[0].name,
    "METHOD Add()",
    "Outline survives cached restart",
  );
  const previewDocument = await vscode.workspace.openTextDocument(
    vscode.Uri.file(path.join(root, "examples/demo/reference_preview.w4gl")),
  );
  const previewLine = previewDocument.lineAt(3).text;
  const previewAt = new vscode.Position(3, previewLine.lastIndexOf("customer"));
  await vscode.commands.executeCommand(
    "gorak.findReferences",
    previewDocument.uri,
    previewAt,
  );
  const referenceExtension = vscode.extensions.getExtension(
    "vscode.references-view",
  )!;
  const referenceApi = (await referenceExtension.activate()) as {
    getInput(): any;
  };
  const previewDeadline = Date.now() + 5000;
  while (referenceApi.getInput()?.contextValue !== "gorak-references") {
    assert.ok(
      Date.now() < previewDeadline,
      "gorak references appear in the standard panel",
    );
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
  const referenceInput = referenceApi.getInput();
  const referenceModel = await referenceInput.resolve();
  const groups = await referenceModel.provider.getChildren();
  const group = groups.find(
    (g: any) => g.uri.toString() === previewDocument.uri.toString(),
  );
  assert.ok(
    group,
    "Reference results include the synthetic aligned declaration",
  );
  const previewRows = await referenceModel.provider.getChildren(group);
  const previewItem = await referenceModel.provider.getTreeItem(previewRows[0]);
  assert.equal(
    previewItem.label.label,
    previewLine.trimStart(),
    "The full declaration prefix is retained despite a long alignment gap",
  );
  const [highlightStart, highlightEnd] = previewItem.label.highlights[0];
  assert.equal(
    previewItem.label.label.slice(highlightStart, highlightEnd),
    "customer",
  );
  const selection = previewItem.command.arguments[1].selection;
  assert.equal(
    previewDocument.getText(selection),
    "customer",
    "Navigation still selects only the exact reference",
  );
  assert.ok(
    previewItem.tooltip.value.includes(previewLine),
    "Tooltip retains the full untrimmed line",
  );
  assert.ok(
    referenceInput.with(new vscode.Location(previewDocument.uri, previewAt)),
    "Reference history can rerun the query",
  );
  const typeDocument = await vscode.workspace.openTextDocument(
    vscode.Uri.file(path.join(root, "examples/demo/type_checks.w4gl")),
  );
  const typeEditor = await vscode.window.showTextDocument(typeDocument);
  const typeSource = typeDocument.getText();
  const typeDeadline = Date.now() + 5000;
  while (
    !vscode.languages
      .getDiagnostics(typeDocument.uri)
      .some((d) => d.code === "incompatible-reference-type")
  ) {
    assert.ok(
      Date.now() < typeDeadline,
      "Reference type warning is published in Problems",
    );
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
  const warning = vscode.languages
    .getDiagnostics(typeDocument.uri)
    .find((d) => d.code === "incompatible-reference-type")!;
  assert.equal(typeDocument.getText(warning.range), "picture");
  assert.equal(warning.severity, vscode.DiagnosticSeverity.Warning);
  await typeEditor.edit((builder) =>
    builder.replace(warning.range, "text_buffer"),
  );
  const typeClearDeadline = Date.now() + 5000;
  while (
    vscode.languages
      .getDiagnostics(typeDocument.uri)
      .some((d) => d.code === "incompatible-reference-type")
  ) {
    assert.ok(
      Date.now() < typeClearDeadline,
      "Type warning clears after correction",
    );
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
  await vscode.commands.executeCommand("undo");
  assert.equal(typeDocument.getText(), typeSource);
  const semanticDocument = await vscode.workspace.openTextDocument(
    vscode.Uri.file(path.join(root, "examples/demo/semantic_checks.w4gl")),
  );
  await vscode.window.showTextDocument(semanticDocument);
  const semanticText = semanticDocument.getText();
  const semanticAt = (needle: string, delta = 0) =>
    semanticDocument.positionAt(semanticText.indexOf(needle) + delta);
  const localSignature =
    await vscode.commands.executeCommand<vscode.SignatureHelp>(
      "vscode.executeSignatureHelpProvider",
      semanticDocument.uri,
      semanticAt("value = buffer", 5),
    );
  assert.match(
    localSignature?.signatures[0].label ?? "",
    /build\(value = StringObject\) RETURNING StringObject/,
  );
  const contextualRefs = await vscode.commands.executeCommand<
    vscode.Location[]
  >(
    "vscode.executeReferenceProvider",
    semanticDocument.uri,
    semanticAt("MESSAGE method", 8),
  );
  assert.equal(
    contextualRefs?.length,
    4,
    "Contextual method parameter references",
  );
  const castDefinition = await vscode.commands.executeCommand<
    vscode.Location[]
  >(
    "vscode.executeDefinitionProvider",
    semanticDocument.uri,
    semanticAt("semantic_worker(generic).Save", 25),
  );
  assert.ok(
    castDefinition?.[0]?.uri.path.endsWith("semantic_worker.w4gl"),
    "Cast member definition",
  );
  const methodParameterEdit =
    await vscode.commands.executeCommand<vscode.WorkspaceEdit>(
      "vscode.executeDocumentRenameProvider",
      semanticDocument.uri,
      semanticAt("payload = method"),
      "caption",
    );
  assert.equal(
    methodParameterEdit?.entries().length,
    2,
    "Method parameter rename spans callee and caller",
  );
  assert.equal(
    methodParameterEdit?.entries().flatMap(([, edits]) => edits).length,
    4,
  );
  assert.equal(
    semanticDocument.getText(),
    semanticText,
    "Rename remains a preview",
  );
  const nativeFrame = await vscode.workspace.openTextDocument(
    vscode.Uri.file(path.join(root, "examples/demo/native_frame.wml")),
  );
  await vscode.languages.setTextDocumentLanguage(nativeFrame, "gorak-wml");
  await vscode.window.showTextDocument(nativeFrame);
  const nativeText = nativeFrame.getText();
  const nativeLocation = nativeFrame.positionAt(nativeText.indexOf("caption;"));
  const nativeDefinitions = await vscode.commands.executeCommand<
    vscode.Location[]
  >("vscode.executeDefinitionProvider", nativeFrame.uri, nativeLocation);
  assert.equal(nativeDefinitions?.length, 1, "Native WML PI navigation");
  assert.equal(nativeFrame.getText(nativeDefinitions![0].range), "caption");
  const columnHover = await vscode.commands.executeCommand<vscode.Hover[]>(
    "vscode.executeHoverProvider",
    nativeFrame.uri,
    nativeFrame.positionAt(nativeText.indexOf('name="title"') + 6),
  );
  assert.match(
    (columnHover ?? [])
      .flatMap((hover) =>
        hover.contents.map((content) =>
          typeof content === "string" ? content : content.value,
        ),
      )
      .join("\n")
      .replaceAll("\\", ""),
    /varchar\(42\)/i,
    `Explicit column prototype type: ${JSON.stringify(columnHover)}`,
  );
  const styleDocument = await vscode.workspace.openTextDocument(
    vscode.Uri.file(
      path.join(root, "examples/demo/native_frame.fielddefaults.json"),
    ),
  );
  await vscode.window.showTextDocument(styleDocument);
  const stylePosition = styleDocument.positionAt(
    styleDocument.getText().indexOf('"outlinecolor"'),
  );
  let styleCompletions: vscode.CompletionList | undefined;
  for (let attempt = 0; attempt < 50; attempt++) {
    styleCompletions =
      await vscode.commands.executeCommand<vscode.CompletionList>(
        "vscode.executeCompletionItemProvider",
        styleDocument.uri,
        stylePosition,
      );
    if (styleCompletions?.items.some((item) => item.label === "_type")) break;
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  assert.ok(
    styleCompletions?.items.some((item) => item.label === "_type"),
    "Native stylesheet schema completion",
  );
  await testFrameEditor(extension);
  await fs.writeFile(
    path.join(process.env.GORAK_TEST_OUTPUT!, "result.json"),
    JSON.stringify(
      {
        passed: true,
        checks: [
          "frame-viewer-default-source-disable-reject-writes-live-refresh",
          "native-stylesheet-completion",
          "native-column-prototype-hover",
          "native-wml-pi-navigation",
          "local-procedure-signature",
          "contextual-parameter-references",
          "cast-member-definition",
          "method-parameter-rename-preview",
          "activation",
          "reference-type-problems-and-correction",
          "full-line-reference-panel-highlight-navigation-tooltip",
          "named-parameter-definition-references-rename",
          "builtin-virtual-document",
          "builtin-member-completion",
          "semantic-diagnostics-edit-and-undo",
          "sized-type-hover",
          "constant-hover-completion",
          "named-parameter-completion",
          "comma-spacing-and-metadata-case",
          "declared-constant-value",
          "class-reference-codelens",
          "block-snippet-insertion",
          "health-diagnostics",
          "cached-restart",
          "code-block-outline",
          "definition",
          "references",
          "rename",
          "wml-definition",
          "diagnostics",
          "chained-definition-hover-completion",
          "signature-help",
          "method-rename-preview",
          "include-source-mapping",
        ],
      },
      null,
      2,
    ),
  );
}
