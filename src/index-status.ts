export interface IndexStatus {
  indexing: boolean;
  files: number;
  applications: number;
  phase?: string;
  parsedFiles?: number;
  restoredFiles?: number;
  checkpoints?: number;
  failed?: boolean;
  failures?: number;
}
export function indexStatusText(state: IndexStatus) {
  const name = "Gorak";
  const phase = state.indexing
    ? (state.phase ?? "checking files")
    : state.failed
      ? "incomplete index"
      : "ready";
  const counts = `${(state.restoredFiles ?? 0).toLocaleString()} cached files restored; ${(state.parsedFiles ?? 0).toLocaleString()} parse jobs this session`;
  return {
    label: `${state.failed ? "$(warning)" : state.indexing ? "$(sync~spin)" : "$(check)"} ${name}: ${phase} · ${state.files.toLocaleString()} files`,
    detail: `${state.failures ?? 0} read failures; ${state.applications} OpenROAD applications; ${counts}. Click for index status.`,
    message: `${name}: ${state.failed ? "index failed — see output" : phase} — ${state.files.toLocaleString()} source files in ${state.applications} applications; ${counts}.`,
  };
}
