/** The designer's source edits use UTF-16 offsets, just like VS Code. */
export interface FrameIntent {
  uri: string;
  version: number;
  edits: { start: number; end: number; expected: string; text: string }[];
}
export function validateIntent(
  value: unknown,
  uri: string,
  version: number,
  text: string,
): FrameIntent {
  const intent = value as FrameIntent;
  if (
    !intent ||
    intent.uri !== uri ||
    intent.version !== version ||
    !Array.isArray(intent.edits) ||
    intent.edits.length > 10000
  )
    throw Error(
      "The document changed. Retry the edit against the refreshed frame.",
    );
  let boundary = text.length;
  for (const edit of [...intent.edits].sort((a, b) => b.start - a.start)) {
    if (
      !Number.isInteger(edit.start) ||
      !Number.isInteger(edit.end) ||
      edit.start < 0 ||
      edit.end < edit.start ||
      edit.end > boundary ||
      typeof edit.text !== "string" ||
      edit.text.length > 8_000_000 ||
      typeof edit.expected !== "string" ||
      text.slice(edit.start, edit.end) !== edit.expected
    )
      throw Error("Invalid or overlapping designer edit.");
    boundary = edit.start;
  }
  return intent;
}
