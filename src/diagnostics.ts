/** Keep support summaries bounded and explicitly free of source, paths and raw logs. */
export async function diagnosticSummary(
  metadata: Record<string, string>,
  query: () => Promise<Record<string, unknown>>,
  cancel: () => void,
  timeoutMs = 5000,
): Promise<Record<string, unknown>> {
  const summary: Record<string, unknown> = { ...metadata };
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    const health = await Promise.race([
      query(),
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => {
          cancel();
          reject(new Error("Server health request timed out"));
        }, timeoutMs);
      }),
    ]);
    for (const key of [
      "serverVersion",
      "indexing",
      "files",
      "applications",
      "failures",
      "parsedFiles",
      "restoredFiles",
      "detailCacheBytes",
      "rssBytes",
    ]) {
      const value = health[key];
      if (
        value === null ||
        ["string", "number", "boolean"].includes(typeof value)
      )
        summary[key] = value;
    }
  } catch {
    summary.serverStatus = "unavailable; restart the language server";
  } finally {
    clearTimeout(timer);
  }
  return summary;
}
